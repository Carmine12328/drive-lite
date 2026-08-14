# Frontend Architecture & Component Documentation — Drive Lite

This document provides a comprehensive, verified, and in-depth technical breakdown of all Frontend components, services, state signals, models, pipes, dialogs, guards, interceptors, and styling architectures in Drive Lite. Every section reflects the exact source code in `frontend/src/app/`.

---

## 1. Architectural Overview & Configuration

### Framework & Foundations
- **Framework**: Angular 22 (Standalone Components, Signals, inject-based Dependency Injection)
- **UI Library**: Angular Material & CDK
- **Styling Architecture**: Custom CSS Custom Properties (`styles.scss`), glassmorphism utility classes, dark/light theme switching via `data-theme` attribute on `<html>`, Inter typography, fully responsive layouts.
- **HTTP Client**: `@angular/common/http` configured with functional interceptors and event-based upload progress tracking.
- **Routing**: Standalone lazy routing with `loadComponent`, component input binding (`withComponentInputBinding()`), and route animation triggers.

### Application Bootstrap: `frontend/src/app/app.config.ts`
The application root configuration registers all global providers:
- `provideBrowserGlobalErrorListeners()`: Captures unhandled browser errors and promise rejections.
- `provideAnimationsAsync()`: Asynchronously loads Angular Material animations to reduce the initial bundle size.
- `provideHttpClient(withInterceptors([authInterceptor]))`: Configures `HttpClient` and registers `authInterceptor` to attach Bearer tokens to outgoing API requests.
- `provideRouter(routes, withComponentInputBinding())`: Registers the application route tree and enables route parameter binding directly to component inputs.
- `provideAppInitializer(() => inject(AuthService).initAuth())`: Executes session restoration prior to initial component rendering by reading valid token sets from `sessionStorage`.

### Routing Architecture: `frontend/src/app/app.routes.ts`
Configures public auth routes and guarded authenticated child routes wrapped in the layout shell:

```typescript
export const routes: Routes = [
  // Public Auth Routes (No Guard)
  {
    path: 'auth',
    children: [
      { path: '', redirectTo: 'landing', pathMatch: 'full' },
      { path: 'landing', loadComponent: () => import('./features/auth/landing/landing.component').then(m => m.LandingComponent), data: { animation: 'LandingPage' } },
      { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent), data: { animation: 'LoginPage' } },
      { path: 'register', loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent), data: { animation: 'RegisterPage' } },
      { path: 'callback', loadComponent: () => import('./features/auth/cognito-callback/cognito-callback.component').then(m => m.CognitoCallbackComponent), data: { animation: 'CallbackPage' } },
    ]
  },
  // Authenticated Protected Routes (authGuard + ShellComponent)
  {
    path: '',
    loadComponent: () => import('./features/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent), data: { animation: 'DashboardPage' } },
      { path: 'drive', loadComponent: () => import('./features/file-browser/file-browser.component').then(m => m.FileBrowserComponent), data: { animation: 'DrivePage' } },
      { path: 'drive/folder/:folderId', loadComponent: () => import('./features/file-browser/file-browser.component').then(m => m.FileBrowserComponent), data: { animation: 'DriveFolderPage' } },
      { path: 'drive/trash', loadComponent: () => import('./features/file-browser/trash/trash.component').then(m => m.TrashComponent), data: { animation: 'TrashPage' } },
    ]
  },
  // Wildcard Fallback
  { path: '**', redirectTo: 'auth/landing' }
];
```

---

## 2. Core Models & Animations

### File Item Model: `frontend/src/app/core/models/file-item.model.ts`
Defines the client representation of a file stored in DynamoDB and S3:
```typescript
export interface FileItem {
  fileId: string;                     // Unique identifier (ULID)
  fileName: string;                   // Original file name (e.g. report.pdf)
  fileSize: number;                   // Size in bytes
  mimeType: string;                   // MIME type (e.g. application/pdf)
  s3Key: string;                      // Full S3 key (users/{userId}/files/{fileId}/{fileName})
  folderId: string;                   // Folder ID ('ROOT' or parent folder ULID)
  userId: string;                     // Cognito user sub claim
  uploadStatus: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: string;                  // ISO 8601 string
  updatedAt: string;                  // ISO 8601 string
  deletedAt?: string;                 // ISO 8601 string (present only when in trash)
  thumbnailKey?: string;              // Optional S3 key for generated thumbnail
  thumbnailSize?: number;             // Optional size in bytes of the thumbnail
}
```

### Folder Model: `frontend/src/app/core/models/folder.model.ts`
Defines the directory/folder item:
```typescript
export interface Folder {
  folderId: string;                   // Unique identifier ('ROOT' or ULID)
  folderName: string;                 // Folder name (e.g. 'Work Documents')
  parentFolderId: string;             // Parent folder ID ('ROOT' for top-level folders)
  userId?: string;                    // Owner Cognito sub UUID
  createdAt: string;                  // ISO 8601 timestamp
  updatedAt: string;                  // ISO 8601 timestamp
}
```

### Share Models: `frontend/src/app/core/models/share.model.ts`
```typescript
export interface ShareLinkItem {
  shareToken: string;
  fileId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  passwordProtected: boolean;
  expiresAt: string;
  maxDownloads?: number;
  downloadCount: number;
  createdAt: string;
}

export interface ShareLinkResponse {
  shareToken: string;
  shareUrl: string;
  expiresAt: string;
  passwordProtected: boolean;
}
```

### Version Model: `frontend/src/app/core/models/version.model.ts`
```typescript
export interface FileVersion {
  versionId: string;
  lastModified: string;
  size: number;
  isLatest: boolean;
}
```

### Route Animations: `frontend/src/app/core/animations/route.animations.ts`
Smooth page transition animation applied to `<main class="shell-content">`:
- **Trigger**: `routeAnimations`
- **Transition**: `* <=> *`
- **Animation behavior**: Queries `:enter` element, starts with `opacity: 0` and `translateY(8px)`, smoothly transitioning over `250ms ease-out` to `opacity: 1` and `translateY(0)`.

---

## 3. Core Services & Authentication Layer

### 3.1. `AuthService`: `frontend/src/app/core/auth/auth.service.ts`
Manages all user authentication, token storage, and session lifecycle. Uses `@aws-sdk/client-cognito-identity-provider` in both development (pointing to local cognito endpoint `http://localhost:9230`) and production (regional Cognito endpoint).

#### State Signals
- `isAuthenticated: Signal<boolean>`: Computed signal emitting `true` when `currentUser() !== null` and non-expired tokens exist.
- `currentUser: WritableSignal<User | null>`: Holds `{ email: string, userId: string }` extracted from the JWT `sub` and `email` claims.
- `isLoading: WritableSignal<boolean>`: Tracks ongoing authentication calls.
- `tokens: WritableSignal<TokenSet | null>`: In-memory signal holding `idToken`, `accessToken`, `refreshToken`, and `expiresAt` (timestamp in ms).

#### Core Methods
- `signUp(email, password)`: Sends `SignUpCommand` with `ClientId`, `Username`, `Password`, and `UserAttributes: [{ Name: 'email', Value: email }]`. In dev mode, triggers background fetch of the confirmation code from the backend proxy. Returns `{ success: true, needsConfirmation: true }`.
- `confirmSignUp(email, code)`: Sends `ConfirmSignUpCommand` with confirmation code.
- `resendSignUpCode(email)`: Sends `ResendConfirmationCodeCommand`.
- `signIn(email, password)`: Executes `InitiateAuthCommand` with `AuthFlow: 'USER_PASSWORD_AUTH'`. Stores tokens in memory and persists them to `sessionStorage` under `drive-lite-tokens`. Decodes the JWT without verification using base64url parsing to populate `currentUser` and `isAuthenticated`. Calls `initializeProfile(userId, email)` (`POST /auth/init-profile`) to ensure user record and root folder exist in DynamoDB. Automatically navigates to `/dashboard`.
- `signOut()`: Sends `RevokeTokenCommand` to invalidate the refresh token, removes tokens from `sessionStorage`, resets auth signals, and redirects to `/auth/landing`.
- `handleCognitoCallback()`: Extracts OAuth redirect tokens from URL hash or query parameters (`id_token`, `access_token`, `refresh_token`, `expires_in`), persists them to `sessionStorage`, extracts user profile info, initializes DynamoDB profile via `init-profile`, and navigates to `/dashboard`.
- `getIdToken()`: Returns the valid, non-expired JWT ID token string (or `null` if expired or unauthenticated).
- `initAuth()`: Invoked on application startup via `provideAppInitializer`. Restores tokens from `sessionStorage` if non-expired.

### 3.2. `authGuard`: `frontend/src/app/core/auth/auth.guard.ts`
Functional route guard (`CanActivateFn`):
- Injects `AuthService` and `Router`.
- Checks `authService.isAuthenticated()`.
- If unauthenticated, navigates to `/auth/login` and returns `false`.
- If authenticated, returns `true`.

### 3.3. `authInterceptor`: `frontend/src/app/core/auth/auth.interceptor.ts`
Functional HTTP interceptor (`HttpInterceptorFn`):
- Skips presigned S3 URLs (`.s3.amazonaws.com`, `.s3.us-east-1.amazonaws.com`, or S3 port endpoints) to prevent corrupting AWS HMAC signatures with authorization headers.
- Skips direct Cognito endpoint calls (`environment.cognitoEndpoint`).
- For requests matching `environment.apiUrl`, retrieves the ID token from `authService.getIdToken()` and clones the request with header: `Authorization: Bearer <idToken>`.

### 3.4. `ApiService`: `frontend/src/app/core/services/api.service.ts`
Central HTTP abstraction wrapper:
- **Methods**: `get<T>(path, params?)`, `post<T>(path, body)`, `patch<T>(path, body)`, `delete<T>(path)`.
- **Base URL**: Configured via `environment.apiUrl`.
- **Centralized Error Handling**: Maps HTTP status codes to user-friendly messages and re-throws errors as RxJS Observables:
  | Status Code | Client Error Classification |
  |:---|:---|
  | `0` | Network failure / offline / CORS preflight failure |
  | `400` | Bad Request — invalid parameters or payload schema |
  | `401` | Unauthorized — missing or invalid JWT |
  | `403` | Forbidden — access denied |
  | `404` | Not Found — resource does not exist |
  | `409` | Conflict — entity state conflict (e.g. already confirmed) |
  | `500` | Internal Server Error |

### 3.5. `FileService`: `frontend/src/app/core/services/file.service.ts`
Manages file data state, synchronization, and CRUD operations against the backend API.

#### Signals & State
- `files: WritableSignal<FileItem[]>`: Active file items in the currently loaded folder.
- `recentFiles: WritableSignal<FileItem[]>`: Recent file items across the entire drive.
- `trashFiles: WritableSignal<FileItem[]>`: Soft-deleted file items in the trash.
- `currentFolderId: WritableSignal<string>`: Active folder ID (defaults to `'ROOT'`).
- `isLoading: WritableSignal<boolean>`: Operation in-flight state.
- `error: WritableSignal<string | null>`: Error string signal.
- `trashVersion: WritableSignal<number>`: Monotonic counter incremented on trash mutations to trigger reactive re-evaluations in computed consumers.
- `allFiles: FileItem[]`: Private internal client-side cache of all active loaded files across folders.

#### Core Methods
- `listFiles(folderId: string)`: Calls `GET /files?folderId={folderId}`. Filters out soft-deleted files (`deletedAt != null`), populates `files`, and merges results into `allFiles`.
- `loadRecentFiles(limit = 10)`: Calls `GET /files/recent?limit={limit}` and populates `recentFiles`.
- `downloadFile(fileId: string)`: Calls `POST /files/{fileId}/download-url` to receive a presigned S3 download URL with `ResponseContentDisposition: attachment`. Dynamically creates an invisible anchor (`<a>`) tag, triggers a DOM download click, and removes the element.
- `renameFile(fileId: string, newName: string)`: Calls `PATCH /files/{fileId}` with payload `{ name: newName }`. Updates both internal `allFiles` cache and `files` signal immutably.
- `deleteFile(fileId: string)`: Calls `DELETE /files/{fileId}`. Removes the file from `allFiles` and `files` signals and increments `trashVersion`.
- `loadTrash()`: Calls `GET /trash/files` and populates `trashFiles`.
- `restoreFile(fileId: string)`: Calls `POST /files/{fileId}/restore`. Removes the file from `trashFiles`, updates/adds it to `allFiles`, and appends to `files` if its folder is currently active.
- `permanentlyDeleteFile(fileId: string)`: Calls `DELETE /trash/files/{fileId}`. Removes item from `trashFiles`, `allFiles`, and `files`.
- `emptyTrash()`: Calls `DELETE /trash/files`. Clears `trashFiles` and purges all deleted IDs from `allFiles`.
- `addFileLocally(file: FileItem)`: Synchronously injects a newly uploaded `FileItem` into `allFiles` and `files` signals without requiring a full network re-fetch.
- **Selection State**: `selectedFileIds`, `hasSelection`, `selectionCount`.
- **Selection Methods**: `toggleSelection(id)`, `selectRange(from, to)`, `selectAll()`, `clearSelection()`.
- **Advanced Methods**: `listVersions(fileId)`, `rollbackVersion(fileId, versionId)`, `moveFile(fileId, folderId)`, `getThumbnailUrl(fileId)`, `summarizeFile(fileId)`, `downloadAsZip(fileIds)`.
- **Cache Queries**: `getTotalSize()`, `getTotalCount()`, `getAllFiles()`, `getDeletedFiles()`.

### 3.6. `FolderService`: `frontend/src/app/core/services/folder.service.ts`
Manages folder tree hierarchy, breadcrumbs, and folder CRUD.

#### Signals & State
- `folders: WritableSignal<Folder[]>`: Subfolders belonging to the active parent folder view.
- `isLoading: WritableSignal<boolean>`: Loading state.
- `error: WritableSignal<string | null>`: Error message state.
- `folderVersion: WritableSignal<number>`: Monotonic counter incremented on mutations.
- `knownFolders: Folder[]`: Internal cache of all user folders.

#### Core Methods
- `listFolders(parentId = 'ROOT')`: Calls `GET /folders`. Caches all user folders in `knownFolders`, filters subfolders where `parentFolderId === parentId` to update `folders`, and increments `folderVersion`.
- `createFolder(name: string, parentId = 'ROOT')`: Calls `POST /folders` with `{ folderName: name, parentFolderId: parentId }`. Adds returned `Folder` to `knownFolders` and `folders`.
- `renameFolder(folderId: string, newName: string)`: Calls `PATCH /folders/{folderId}` with `{ name: newName }`. Updates cache and signal.
- `deleteFolder(folderId: string)`: Calls `DELETE /folders/{folderId}`. Removes folder from cache and signal.
- `buildBreadcrumbPath(folderId: string)`: Iteratively walks up the `knownFolders` tree from `folderId` to `ROOT` using `parentFolderId` (capped at max 20 iterations), constructing an ordered array of `{ id: string, name: string }` path segments.

### 3.7. `Upload` Service: `frontend/src/app/core/services/upload.ts`
Implements the 3-Phase Direct-to-S3 Presigned Upload Architecture.

#### Data Interfaces & Task States
```typescript
export interface UploadTask {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  mimeType: string;
  folderId: string;
  progress: number;
  status: 'pending' | 'uploading' | 'confirming' | 'completed' | 'error' | 'cancelled';
  errorMessage?: string;
  fileId?: string;
  s3Key?: string;
}
```

#### State Signals & Computeds
- `uploadQueue: WritableSignal<UploadTask[]>`: Array of all upload tasks.
- `activeUploads: Signal<UploadTask[]>`: Computed list of tasks with status `uploading` or `confirming`.
- `hasActiveUploads: Signal<boolean>`: Computed boolean indicating if uploads are running.

#### The 3-Phase Execution Flow
1. **Client-Side Validation (`validateFile`)**:
   - Rejects files larger than 100 MB (`100 * 1024 * 1024` bytes).
   - Rejects file names exceeding 255 characters.
   - Rejects path traversal and illegal control characters (`..`, `/`, `\`, `\0`).
2. **Phase 1 — Presigned URL Request (`requestPresignedUrl`)**:
   - Calls `POST /files/upload-url` with `{ fileName, fileSize, mimeType, folderId }`.
   - Backend writes `PENDING` record in DynamoDB and returns `{ uploadUrl, fileId, s3Key }`.
3. **Phase 2 — Direct S3 PUT Upload (`uploadToS3`)**:
   - Replaces any Docker-internal IP address in `uploadUrl` with `localhost:4566` for browser reachability.
   - Sends `HttpClient.put(fixedUrl, file, { headers: { 'Content-Type': mimeType }, reportProgress: true, observe: 'events' })`.
   - Listens to `HttpEventType.UploadProgress` to compute percentage (`Math.round((loaded / total) * 100)`) and update task progress signal.
4. **Phase 3 — Confirmation (`confirmUpload`)**:
   - Sets task status to `confirming`.
   - Calls `POST /files/confirm-upload` with `{ fileId }`.
   - On success, marks status as `completed`, triggers `ToastService.info`, and calls `FileService.addFileLocally(...)` to render the file immediately in the UI.

#### Queue Controls
- `cancelUpload(taskId)`: Marks task as `cancelled` and unsubscribes active HTTP streams.
- `retryUpload(taskId)`: Resets task status to `pending` and re-executes the 3-phase flow.
- `clearCompleted()`: Filters out completed and cancelled tasks from `uploadQueue`.

### 3.8. `SearchService`: `frontend/src/app/core/services/search.service.ts`
Reactive signal-based global search with automatic debouncing:
- **Signals**: `searchQuery: WritableSignal<string>`, `debouncedQuery: WritableSignal<string>`, `isSearching: WritableSignal<boolean>`.
- **Constructor Effect**: Listens to changes in `searchQuery` and debounces updates to `debouncedQuery` by `300ms` via a timer.
- **`searchResults: Signal<SearchResult[]>`**: Computed signal that filters `FolderService.getAllFolders()` and `FileService.getAllFiles()` case-insensitively against `debouncedQuery`. Returns matching folders first, followed by matching files, capped at 10 total items:
  ```typescript
  export type SearchResult = (FileItem | Folder) & { resultType: 'file' | 'folder' };
  ```
- `clearSearch()`: Resets all search signals and cancels active timers.

### 3.9. `ViewStateService`: `frontend/src/app/core/services/view-state.service.ts`
Singleton service managing UI preferences and responsive sidebar drawer state:
- `viewMode: WritableSignal<'grid' | 'list'>`: Active display mode for the file list (defaults to `'grid'`).
- `searchQuery: WritableSignal<string>`: Shared search query text.
- `sidebarOpen: WritableSignal<boolean>`: Controls mobile drawer visibility (defaults to `false`).
- `toggleViewMode()`: Toggles between `'grid'` and `'list'`.
- `toggleSidebar()`: Inverts `sidebarOpen`.
- `closeSidebarOnMobile()`: Closes sidebar if `window.innerWidth <= 768px`.

### 3.10. `ShareService`: `frontend/src/app/core/services/share.service.ts`
Manages expiring public share links.
- **Methods**: 
  - `createShare(fileId, opts)`: Authenticated. Returns `ShareLinkResponse`.
  - `listShares(fileId)`: Authenticated. Returns active shares.
  - `revokeShare(token)`: Authenticated. Deletes a share.
  - `getShareMeta(token)`: **Public**. Gets file metadata for download page.
  - `downloadShare(token, password?)`: **Public**. Resolves presigned URL for public download.

---

## 4. UI Feature Components Breakdown

### 4.1. Shell Component: `frontend/src/app/features/shell/shell.component.ts`
- **Role**: Authenticated layout container wrapping `<app-navbar />` and `<main class="shell-content"><router-outlet /></main>`.
- **Animations**: Binds `[@routeAnimations]="getRouteAnimationData()"` driven by route data animation keys (`DashboardPage`, `DrivePage`, `DriveFolderPage`, `TrashPage`).
- **Context Menu Interception**: Host binding `(document:contextmenu)='$event.preventDefault()'` suppresses the browser's default context menu across the entire authenticated app.
- **Command Palette**: Adds `@HostListener('document:keydown.control.k')` to trigger the Command Palette.

### 4.2. Dashboard Component: `frontend/src/app/features/dashboard/dashboard.component.ts`
- **Role**: Authenticated home page after login with content-first layout (Recent Files, Storage Breakdown, and Cleanup Assistant).
- **Computed Metrics & Signals**:
  - `userEmail`: Extracted from `AuthService.currentUser().email`.
  - `userName`: Formatted display name computed from the user's email prefix.
  - `recentFiles`: Computed from `FileService.recentFiles()`, formatted with human-readable sizes, dates, and icon identifiers.
- **Actions**:
  - `onUploadFile()`: Opens `UploadDialog` modal and refreshes recent files upon completion.
  - `onNewFolder()`: Opens `InputDialog` modal for creating a new folder directly in `'ROOT'`.
  - `onPreviewFile(file)`: Opens `FilePreviewComponent` dialog in near-fullscreen modal (`95vw`, `90vh`).
  - `onDownloadFile(file)`: Invokes `FileService.downloadFile()`.
  - `onDeleteFile(file)`: Opens `ConfirmDialog` modal; deletes file via `FileService.deleteFile()` on confirmation and reloads recent files.

### 4.3. File Browser Component: `frontend/src/app/features/file-browser/file-browser.component.ts`
- **Role**: Master file manager screen with split-view layout.
- **State & Signals**:
  - `currentFolderId`: Active folder ID from route parameter `folderId` (defaults to `'ROOT'`).
  - `sidebarWidth`: Width in pixels restored from `localStorage['drive-lite:sidebar-width']` (clamped between `SIDEBAR_MIN_WIDTH = 180px` and `SIDEBAR_MAX_WIDTH = 500px`, defaults to 260px).
  - `showDropOverlay`: Boolean signal for drag-and-drop backdrop.
  - `sortField` (`'fileName'`) & `sortDirection` (`'asc' | 'desc'`).
  - `subFolders`: Computed child folders of the active directory.
  - `files`: Bound to `FileService.files`.
  - `breadcrumbPath`: Computed path from `FolderService.buildBreadcrumbPath(currentFolderId)`.
- **Sidebar Resize Handling**:
  - `onResizeStart(event: PointerEvent)`: Captures pointer via `setPointerCapture`, attaches global `pointermove` and `pointerup` listeners, sets cursor to `col-resize`.
  - `onResizeMove(event)`: Clamps `event.clientX` between 180px and 500px.
  - `onResizeEnd(event)`: Releases pointer capture and persists width to `localStorage`.
- **Context Menus**:
  - Distinguishes file context menu (Open, Download, Rename, Delete), folder context menu (Open, New Folder, Rename, Delete), and empty background context menu (New Folder, Upload Files).
- **Drag-and-Drop Dropzone**:
  - Tracks `dragCounter` across nested DOM nodes. On file drop, opens `UploadDialog` preloaded with the dropped `File[]` list.

### 4.4. File List Component: `frontend/src/app/features/file-browser/file-list/file-list.component.ts`
- **Role**: Renders folders and files in Grid or List layout.
- **Inputs**: `files: input<FileItem[]>`, `folders: input<Folder[]>`, `isLoading: input<boolean>`, `viewMode: input<'grid' | 'list'>`, `sortField: input<string>`, `sortDirection: input<'asc' | 'desc'>`.
- **Outputs**: `fileAction`, `folderAction`, `fileContextMenu`, `folderContextMenu`, `folderClick`, `sortChange`, `uploadRequest`.
- **Sorting Logic**:
  - `sortedFiles`: Sorts files by `fileSize` (numeric), `updatedAt` (epoch comparison), or `fileName` (locale-aware string comparison).
  - `combinedItems`: Merges sorted folders and sorted files for table list view.

### 4.5. Folder Tree Component: `frontend/src/app/features/file-browser/folder-tree/folder-tree.component.ts`
- **Role**: Sidebar hierarchical directory tree built using `MatTree` and `FolderTreeNode`.
- **Inputs**: `folders: input<Folder[]>`, `activeFolderId: input<string>`.
- **Outputs**: `folderSelect: output<string>`, `folderContextMenu: output<{ event: MouseEvent, folder: Folder }>`.
- **Tree Construction & Auto-Expansion**:
  - `buildTree(folders)`: Recursively transforms flat folder list into nested tree nodes with alphabetical sorting.
  - `expandedFolderIds: Set<string>`: Persisted set of expanded folder IDs across tree updates.
  - Signal effect tracks `activeFolderId`: Recursively adds all parent ancestors of the active folder into `expandedFolderIds` and calls `tree.expand(node)` via `applyExpandedState()` to ensure the current directory is always visible in the sidebar.
  - **Trash Badge**: Displays real-time soft-deleted item count computed from `FileService.getDeletedFiles().length`.

### 4.6. Trash Component: `frontend/src/app/features/file-browser/trash/trash.component.ts`
- **Role**: Dedicated screen for managing soft-deleted files.
- **Lifecycle**: Invokes `FileService.loadTrash()` on `ngOnInit`.
- **Reactive State**: `trashedFiles = computed(() => this.fileService.getDeletedFiles())`.
- **Actions**:
  - `restoreFile(file)`: Calls `FileService.restoreFile(file.fileId)` with success/error toast notifications.
  - `confirmPermanentDelete(file)`: Opens `ConfirmDialog` warning that action cannot be undone; executes `FileService.permanentlyDeleteFile(file.fileId)` on confirmation.
  - `confirmEmptyTrash()`: Opens `ConfirmDialog`; executes `FileService.emptyTrash()` on confirmation.

### 4.7. Upload Dialog Component: `frontend/src/app/features/file-browser/upload-dialog/upload-dialog.ts`
- **Role**: Modal dialog for picking, dragging, and executing file uploads.
- **Data Injection Interface**:
  ```typescript
  export interface UploadDialogData {
    folderId: string;
    initialFiles?: File[];
  }
  ```
- **Features**:
  - Native file picker button and drag-and-drop zone with nested enter/leave counter.
  - Client-side pre-validation checking file size (&le; 100 MB) and illegal naming characters.
  - Per-task `ProgressBarComponent` visualizing live progress percentages.
  - Batch "Upload All", "Cancel All", individual item removal, and retry.

### 4.8. File Preview Component: `frontend/src/app/features/file-browser/file-preview/file-preview.component.ts`
- **Role**: Modal dialog for previewing file contents and metadata.
- **Data Injection Interface**:
  ```typescript
  export interface FilePreviewDialogData {
    file: FileItem;
    allFiles: FileItem[];
  }
  ```
- **MIME-Type Rendering Engine**:
  - `previewType`: Computes `'image' | 'pdf' | 'text' | 'video' | 'audio' | 'unsupported'`.
  - Images (`image/*`): Direct `<img>` rendering with presigned URL.
  - PDFs (`application/pdf`): Safe `<iframe>` rendering with `DomSanitizer.bypassSecurityTrustResourceUrl(url)`.
  - Text (`text/*`): Fetches raw text content from S3 via `HttpClient.get(url, { responseType: 'text' })` and displays inside `<pre><code>`.
  - Audio/Video: Native HTML5 `<audio controls>` and `<video controls>` players.
  - Fallback: Formatted icon, metadata, and direct download CTA.
- **Gallery Navigation & Keyboard Shortcuts**:
  - Host listener `(document:keydown)`:
    - `ArrowLeft`: `navigatePrev()` (switches to previous file in `allFiles`)
    - `ArrowRight`: `navigateNext()` (switches to next file in `allFiles`)
    - `Escape`: `close()` (closes dialog)
  - Collapsible metadata sidebar displaying file name, size, MIME type, folder ID, creation date, and last modified date.

### 4.9. Authentication Feature Components
- **`LandingComponent` (`frontend/src/app/features/auth/landing/landing.component.ts`)**: Product hero, feature showcase, theme toggle, and CTAs navigating to `/auth/login` and `/auth/register`.
- **`LoginComponent` (`frontend/src/app/features/auth/login/login.component.ts`)**: Reactive form (`email`, `password`, `rememberMe`) with validation; invokes `AuthService.signIn()`.
- **`RegisterComponent` (`frontend/src/app/features/auth/register/register.component.ts`)**:
  - **Step 1**: Email and password input with real-time password strength meter (`passwordCriteria` verifying length &ge; 8, uppercase, lowercase, numbers, special characters) and custom `passwordMatchValidator`.
  - **Step 2**: 6 individual digit input fields with automatic focus advancement, backspace retreat, clipboard paste parsing, and 60-second cooldown timer for `resendCode()`.
- **`CognitoCallbackComponent` (`frontend/src/app/features/auth/cognito-callback/cognito-callback.component.ts`)**: Spinner and callback handler for OAuth redirect flows.

### 4.10. Share Dialog Component: `frontend/src/app/shared/components/share-dialog/share-dialog.ts`
- **Role**: Modal for generating and managing share links. Provides expiration options, password toggle, max downloads, URL copy, and active shares list.

### 4.11. Share Download Component: `frontend/src/app/features/share/share-download.component.ts`
- **Role**: Public route `/share/:token`. Displays share metadata, prompts for password if protected, and triggers the file download.

### 4.12. Version History Component: `frontend/src/app/features/file-browser/version-history/version-history.component.ts`
- **Role**: Modal displaying a timeline list of S3 object versions. Includes a restore button and preview button.

### 4.13. Selection Toolbar Component: `frontend/src/app/features/file-browser/selection-toolbar/selection-toolbar.component.ts`
- **Role**: Floating action bar shown when items are selected. Provides batch actions: download as ZIP, move, and delete.

### 4.14. File Editor Component: `frontend/src/app/features/file-browser/file-editor/file-editor.component.ts`
- **Role**: In-browser code and markdown editor wrapping CodeMirror 6. Features language auto-detection, dark/light theme sync, and a split-pane markdown preview.

### 4.15. Storage Analytics Component: `frontend/src/app/features/dashboard/storage-analytics.component.ts`
- **Role**: SVG donut chart visualizing storage usage with MIME category breakdown.

### 4.16. Cleanup Assistant Component: `frontend/src/app/features/dashboard/cleanup-assistant.component.ts`
- **Role**: Identifies largest files, duplicates, and stuck uploads for storage optimization.
- **Features & Actions**:
  - **Tabs**: `Largest Files`, `Duplicates`, and `Pending/Stuck`.
  - **Duplicates Banner Toolbar**: Displays total redundant copies and potential space savings, with a master `Clean All Duplicates` button that deletes redundant copies in bulk while preserving the original/first file.
  - **Per-Group Actions**: Each duplicate group features a `Keep only 1` action button and badges differentiating the `Original` file from duplicate copies (`Copy #2`, `Copy #3`, etc.).
  - **Modal Dialog Confirmation**: All bulk and individual deletions require user confirmation via `ConfirmDialog`.

### 4.17. Command Palette Component: `frontend/src/app/shared/components/command-palette/command-palette.component.ts`
- **Role**: Global quick-action overlay triggered via `Ctrl+K`. Features a filterable command list and full keyboard navigation.

---

## 5. Shared Components, Pipes & Utilities

### 5.1. `NavbarComponent`: `frontend/src/app/shared/components/navbar/navbar.component.ts`
- Main navigation bar with logo branding, search bar with autocomplete dropdown, view toggle (`grid` vs `list`), dark/light theme switch, and user avatar dropdown menu with Sign Out. Includes a `Ctrl+K` hint badge for the command palette.
- **Search Dropdown**: Highlights query matches with `<mark>` tags via `highlightMatch()`. Clicking a folder navigates to `/drive/folder/:folderId`; clicking a file navigates to its parent folder and opens the preview dialog modal.

### 5.2. `BreadcrumbComponent`: `frontend/src/app/shared/components/breadcrumb/breadcrumb.component.ts`
- Renders hierarchical folder path: `Home > Folder A > Subfolder B`.
- Automatically renders mobile ellipsis (`...`) when path depth exceeds 2 segments on narrow viewports.

### 5.3. `ConfirmDialog` & `InputDialog`

#### `ConfirmDialog` (`frontend/src/app/shared/components/confirm-dialog/confirm-dialog.ts`)
- **Data Interface**:
  ```typescript
  export interface ConfirmDialogData {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmColor?: 'primary' | 'accent' | 'warn';
  }
  ```
- Closes with `true` (confirmed) or `false` / `undefined` (cancelled).

#### `InputDialog` (`frontend/src/app/shared/components/input-dialog/input-dialog.ts`)
- **Data Interface**:
  ```typescript
  export interface InputDialogData {
    title: string;
    label: string;
    value?: string;
    placeholder?: string;
    confirmText?: string;
    validators?: ValidatorFn[];
  }
  ```
- Closes with the validated input string or `undefined` on cancellation.

### 5.4. `ContextMenuComponent`: `frontend/src/app/shared/components/context-menu/context-menu.component.ts`
- **Data Interface**:
  ```typescript
  export interface ContextMenuItem {
    label: string;
    icon: string;
    action: string;
    disabled?: boolean;
  }
  ```
- Floating right-click context menu positioned dynamically at `(event.clientX, event.clientY)` using a hidden trigger element and `MatMenu`. Emits `menuAction = output<string>()`.

### 5.5. `ProgressBarComponent`: `frontend/src/app/shared/components/progress-bar/progress-bar.component.ts`
- Displays task name, completion percentage, and animated fill bar with status-driven color styling:
  - `fill-uploading`: Active progress bar fill
  - `fill-complete`: Success green fill
  - `fill-error`: Error red fill

### 5.6. `ToastService`: `frontend/src/app/shared/components/toast/toast.service.ts`
- Wraps Angular Material `MatSnackBar` with preconfigured durations and custom theme classes:
  | Toast Method | Duration | CSS Panel Class |
  |:---|:---|:---|
  | `success(msg)` | 4000ms | `.toast-success` |
  | `error(msg)` | 6000ms | `.toast-error` |
  | `info(msg)` | 4000ms | `.toast-info` |
  | `warning(msg)` | 4000ms | `.toast-warning` |

### 5.7. Shared Pipes

#### `FileIconPipe`: `frontend/src/app/shared/pipes/file-icon.pipe.ts` (Name: `fileIcon`)
Maps MIME types to Material Design Icon names:

| MIME Pattern | Material Icon Name | Example File Types |
|:---|:---|:---|
| `image/*` | `image` | PNG, JPEG, SVG, GIF, WebP |
| `application/pdf` | `picture_as_pdf` | PDF documents |
| `text/*` | `description` | TXT, CSV, Markdown, Code |
| `video/*` | `movie` | MP4, WebM, MKV, MOV |
| `audio/*` | `audiotrack` | MP3, WAV, FLAC, OGG |
| `application/zip`, `application/x-rar-compressed`, `application/x-7z-compressed` | `folder_zip` | ZIP, RAR, 7Z archives |
| `spreadsheet`, `application/vnd.ms-excel`, `spreadsheetml` | `table_chart` | XLS, XLSX, CSV sheets |
| `presentation`, `application/vnd.ms-powerpoint`, `presentationml` | `slideshow` | PPT, PPTX decks |
| `document`, `application/msword`, `wordprocessingml` | `article` | DOC, DOCX files |
| *(Default / Other)* | `insert_drive_file` | Generic binaries |

#### `FileSizePipe`: `frontend/src/app/shared/pipes/file-size.pipe.ts` (Name: `fileSize`)
Transforms raw byte numbers into formatted human-readable strings, stripping trailing `.0` decimals:

| Byte Range | Calculation | Formatted Output Example |
|:---|:---|:---|
| `0`, `null`, `undefined`, `NaN` | `0 B` | `'0 B'` |
| `< 1024 B` | `${bytes} B` | `'512 B'` |
| `< 1048576 B (1 MB)` | `(bytes / 1024).toFixed(1) KB` | `'12.5 KB'`, `'48 KB'` |
| `< 1073741824 B (1 GB)` | `(bytes / 1048576).toFixed(1) MB` | `'4.2 MB'`, `'15 MB'` |
| `&ge; 1073741824 B` | `(bytes / 1073741824).toFixed(1) GB` | `'1.8 GB'`, `'2 GB'` |
