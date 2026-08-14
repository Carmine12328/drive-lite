# core — Layer README

## What this module does

The `core/` layer contains singleton services, data models, auth infrastructure,
and animations that are shared across the entire application. Nothing in `core/`
is feature-specific. Do not add feature-specific logic here.

## Sub-directories

| Directory | Contents |
|:----------|:---------|
| `auth/` | `AuthService`, `authGuard`, `authInterceptor` |
| `models/` | TypeScript interfaces for `FileItem` and `Folder` |
| `services/` | `ApiService`, `FileService`, `FolderService`, `SearchService`, `Upload`, `ViewStateService` |
| `animations/` | Shared Angular animation definitions (route transitions, shimmer, etc.) |

## Key services and their responsibilities

| Service | Signal(s) exposed | Responsibility |
|:--------|:------------------|:---------------|
| `auth.service.ts` | `currentUser`, `isAuthenticated`, `isLoading` | Cognito SDK: sign-in, sign-up, confirm, token refresh, Hosted UI exchange |
| `auth.guard.ts` | — | Redirects unauthenticated users to `/auth/landing` |
| `auth.interceptor.ts` | — | Attaches `Authorization: Bearer <token>` to all API requests; skips S3 presigned URLs |
| `api.service.ts` | — | `HttpClient` wrapper with centralized error mapping for all backend API calls |
| `file.service.ts` | `files`, `trashedFiles` | File CRUD (list, rename, soft-delete, restore); currently uses mock data, wired for real API |
| `folder.service.ts` | `folders` | Folder CRUD; currently mock data, wired for real API |
| `upload.ts` | `uploadQueue`, `activeUploads` | 3-phase presigned URL upload with per-task progress signals and concurrency queue |
| `search.service.ts` | `query`, `results` | Debounced signal-based search across all files |
| `view-state.service.ts` | `viewMode` | Persists grid/list toggle preference |

## Angular patterns used throughout core

- All services use `@Service()` (Angular 22) — no `@Injectable`.
- State is `signal()` or `computed()`, never `BehaviorSubject`.
- Services are injected via `inject()` — no constructor injection.

## External dependencies

- `@aws-sdk/client-cognito-identity-provider` — Cognito SDK (used only in `auth.service.ts`)
- `@angular/common/http` — `HttpClient` (used in `api.service.ts` and `upload.ts`)
