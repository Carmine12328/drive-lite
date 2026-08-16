# CODEBASE.md — Agent Navigation Index

> **Read this file first.** It is the canonical structural index for the Drive
> Lite monorepo. It maps concepts → files, not implementation details. After
> reading this, go directly to the file you need without exploratory crawls.

---

## Monorepo Layout

| Package | Path | npm workspace name | Purpose |
|:--------|:-----|:-------------------|:--------|
| Frontend | `frontend/` | `@drive-lite/frontend` | Angular 22 SPA |
| Backend | `backend/` | `@drive-lite/backend` | AWS Lambda handlers (Node.js 20, ESM) |
| Infrastructure | `infra/` | `@drive-lite/infra` | AWS CDK v2 stack |
| Root | `/` | `drive-lite` | npm workspace root, scripts, Docker |

---

## Concept → File Map

### Authentication

| Concept | File |
|:--------|:-----|
| Auth state (signals, JWT, session) | `frontend/src/app/core/auth/auth.service.ts` |
| Route guard (blocks unauthenticated access) | `frontend/src/app/core/auth/auth.guard.ts` |
| HTTP interceptor (attaches Bearer token) | `frontend/src/app/core/auth/auth.interceptor.ts` |
| Login UI (email/password form) | `frontend/src/app/features/auth/login/login.component.ts` |
| Register UI (2-step + confirmation code) | `frontend/src/app/features/auth/register/register.component.ts` |
| Cognito Hosted UI callback handler | `frontend/src/app/features/auth/cognito-callback/cognito-callback.component.ts` |
| Post-registration Lambda (Cognito trigger) | `backend/src/handlers/auth/post-confirmation.ts` |
| Idempotent Profile Init Lambda (API route) | `backend/src/handlers/auth/init-profile.ts` |
| Cognito User Pool CDK construct | `infra/lib/auth-construct.ts` |

### File Operations

| Concept | File |
|:--------|:-----|
| File metadata model (`FileItem` interface) | `frontend/src/app/core/models/file-item.model.ts` |
| File CRUD service (signals, mock + real) | `frontend/src/app/core/services/file.service.ts` |
| 3-phase presigned upload service | `frontend/src/app/core/services/upload.ts` |
| Get presigned upload URL (Lambda) | `backend/src/handlers/files/get-upload-url.ts` |
| Confirm upload in DynamoDB (Lambda) | `backend/src/handlers/files/confirm-upload.ts` |
| Get presigned download URL (Lambda) | `backend/src/handlers/files/get-download-url.ts` |
| List files in a folder (Lambda) | `backend/src/handlers/files/list-files.ts` |
| Get single file metadata (Lambda) | `backend/src/handlers/files/get-file.ts` |
| Rename file (Lambda) | `backend/src/handlers/files/rename-file.ts` |
| Soft-delete file to trash (Lambda) | `backend/src/handlers/files/delete-file.ts` |
| Recent files (Lambda) | `backend/src/handlers/files/recent-files.ts` |

### Trash

| Concept | File |
|:--------|:-----|
| Trash UI component | `frontend/src/app/features/file-browser/trash/trash.component.ts` |
| List trashed files (Lambda) | `backend/src/handlers/files/list-trash.ts` |
| Restore file from trash (Lambda) | `backend/src/handlers/files/restore-file.ts` |
| Permanent delete (Lambda) | `backend/src/handlers/files/permanent-delete-file.ts` |
| Empty trash (Lambda) | `backend/src/handlers/files/empty-trash.ts` |

### Folders

| Concept | File |
|:--------|:-----|
| Folder model (`Folder` interface) | `frontend/src/app/core/models/folder.model.ts` |
| Folder service (signals) | `frontend/src/app/core/services/folder.service.ts` |
| Folder tree sidebar component | `frontend/src/app/features/file-browser/folder-tree/folder-tree.component.ts` |
| Create folder (Lambda) | `backend/src/handlers/folders/create-folder.ts` |
| List folders (Lambda) | `backend/src/handlers/folders/list-folders.ts` |
| Rename folder (Lambda) | `backend/src/handlers/folders/rename-folder.ts` |
| Delete folder (Lambda) | `backend/src/handlers/folders/delete-folder.ts` |

### UI — File Browser

| Concept | File |
|:--------|:-----|
| Main file browser shell | `frontend/src/app/features/file-browser/file-browser.component.ts` |
| File list (grid/list, sort, skeleton) | `frontend/src/app/features/file-browser/file-list/file-list.component.ts` |
| File preview (MIME rendering, gallery) | `frontend/src/app/features/file-browser/file-preview/file-preview.component.ts` |
| Upload dialog | `frontend/src/app/features/file-browser/upload-dialog/upload-dialog.component.ts` |
| Search (debounced signal-based) | `frontend/src/app/core/services/search.service.ts` |
| View state (grid/list mode) | `frontend/src/app/core/services/view-state.service.ts` |

### UI — Shared Components

| Concept | File |
|:--------|:-----|
| Navbar (search dropdown, theme, user menu) | `frontend/src/app/shared/components/navbar/` |
| Breadcrumb | `frontend/src/app/shared/components/breadcrumb/` |
| Toast notifications | `frontend/src/app/shared/components/toast/` |
| Progress bar | `frontend/src/app/shared/components/progress-bar/` |
| Context menu (right-click) | `frontend/src/app/shared/components/context-menu/` |
| Confirm dialog | `frontend/src/app/shared/components/confirm-dialog/` |
| Input dialog | `frontend/src/app/shared/components/input-dialog/` |
| File icon pipe | `frontend/src/app/shared/pipes/` |
| File size pipe | `frontend/src/app/shared/pipes/` |

### Routing & App Bootstrap

| Concept | File |
|:--------|:-----|
| All route definitions | `frontend/src/app/app.routes.ts` |
| Global providers (HTTP, router, auth init) | `frontend/src/app/app.config.ts` |
| App shell (navbar + route outlet) | `frontend/src/app/features/shell/shell.component.ts` |
| Dashboard (stats, recent files) | `frontend/src/app/features/dashboard/dashboard.component.ts` |
| Design system (CSS custom properties, themes) | `frontend/src/styles.scss` |

### Infrastructure & CI/CD
| Concept | File |
|:--------|:-----|
| CDK stack entry point | `infra/bin/` |
| Main CDK stack (composes all constructs) | `infra/lib/drive-lite-stack.ts` |
| API Gateway + all Lambda functions | `infra/lib/api-construct.ts` |
| DynamoDB table + S3 bucket | `infra/lib/storage-construct.ts` |
| Cognito User Pool + Hosted UI | `infra/lib/auth-construct.ts` |
| CloudFront + S3 frontend hosting | `infra/lib/frontend-construct.ts` |
| GitHub Actions PR CI workflow | `.github/workflows/ci.yml` |
| GitHub Actions AWS CD workflow | `.github/workflows/deploy.yml` |
| CDK output & environment configurator | `scripts/configure-environment.mjs` |
| Frontend manual deploy script | `scripts/deploy-frontend.mjs` |

### Backend Utilities

| Concept | File |
|:--------|:-----|
| DynamoDB PK/SK key builders | `backend/src/lib/keys.ts` |
| Lambda HTTP response helpers (`success`, `error`) | `backend/src/lib/response.ts` |
| DynamoDB DocumentClient singleton | `backend/src/lib/dynamo-client.ts` |
| S3 client singleton | `backend/src/lib/s3-client.ts` |
| Input validators | `backend/src/lib/validators.ts` |
| Lambda environment config | `backend/src/lib/config.ts` |
| Local dev server (replaces Lambda for Docker) | `backend/src/local-api.ts` |

---

## API Route → Handler Map

All routes require a `Authorization: Bearer <jwt>` header (HTTP JWT authorizer
backed by Cognito).

| Method | Path | Lambda handler |
|:-------|:-----|:---------------|
| `POST` | `/folders` | `handlers/folders/create-folder.ts` |
| `GET` | `/folders` | `handlers/folders/list-folders.ts` |
| `PATCH` | `/folders/{id}` | `handlers/folders/rename-folder.ts` |
| `DELETE` | `/folders/{id}` | `handlers/folders/delete-folder.ts` |
| `GET` | `/files/recent` | `handlers/files/recent-files.ts` |
| `POST` | `/files/upload-url` | `handlers/files/get-upload-url.ts` |
| `POST` | `/files/confirm-upload` | `handlers/files/confirm-upload.ts` |
| `POST` | `/files/{id}/download-url` | `handlers/files/get-download-url.ts` |
| `GET` | `/files` | `handlers/files/list-files.ts` |
| `GET` | `/files/{id}` | `handlers/files/get-file.ts` |
| `PATCH` | `/files/{id}` | `handlers/files/rename-file.ts` |
| `DELETE` | `/files/{id}` | `handlers/files/delete-file.ts` (soft-delete → trash) |
| `POST` | `/files/{id}/restore` | `handlers/files/restore-file.ts` |
| `GET` | `/trash/files` | `handlers/files/list-trash.ts` |
| `DELETE` | `/trash/files/{id}` | `handlers/files/permanent-delete-file.ts` |
| `DELETE` | `/trash/files` | `handlers/files/empty-trash.ts` |

---

## DynamoDB Key Patterns

Single-table design. All key builders live in `backend/src/lib/keys.ts`.

| Entity | PK | SK |
|:-------|:---|:---|
| User profile | `USER#{userId}` | `PROFILE` |
| Folder | `USER#{userId}` | `FOLDER#{folderId}` |
| File | `USER#{userId}#FOLDER#{folderId}` | `FILE#{fileId}` |
| Trash item | `TRASH#{userId}` | `FILE#{fileId}` |

S3 object key: `users/{userId}/files/{fileId}/{fileName}`

---

## Application State (Frontend Signals)

| State | Owner signal/service |
|:------|:--------------------|
| Current user + JWT tokens | `AuthService` — `currentUser`, `isAuthenticated` signals |
| File list for current folder | `FileService` — `files` signal |
| Folder tree | `FolderService` — `folders` signal |
| Upload queue + progress | `Upload` service — `uploadQueue` signal |
| Search query | `SearchService` — `query` signal |
| View mode (grid/list) | `ViewStateService` — `viewMode` signal |
| Active folder ID | `FileBrowserComponent` — local signal |

---

## Quick-Answer Lookup

> When answering a question about the codebase, read **only** the files listed
> here. Do not explore blindly.

| Question | Minimum files to read |
|:---------|:----------------------|
| Where is auth state stored? | `core/auth/auth.service.ts` |
| How does the upload flow work? | `.agents/skills/s3-presigned-upload/SKILL.md` → `core/services/upload.ts` |
| What DynamoDB table schema is used? | `infra/lib/storage-construct.ts`, `backend/src/lib/keys.ts` |
| How do Lambda handlers return errors? | `backend/src/lib/response.ts` |
| How is routing wired? | `app.routes.ts` |
| How does the HTTP interceptor work? | `core/auth/auth.interceptor.ts` |
| What CSS variables / design tokens exist? | `frontend/src/styles.scss` |
| How is the CDK stack composed? | `infra/lib/drive-lite-stack.ts` |
| What API routes exist? | `infra/lib/api-construct.ts` (lines 150–254) |
| What is the file/folder data shape? | `core/models/file-item.model.ts`, `core/models/folder.model.ts` |
| Where is file search implemented? | `core/services/search.service.ts` |
| How is the Angular app bootstrapped? | `app.config.ts`, `main.ts` |

---

## What Is NOT in This Codebase

- No NgRx or third-party state manager — state lives in service-level signals
- No real AWS deployment yet — all local via LocalStack + Docker
- No unit tests for frontend components (only service-level specs exist)
- No SSR — this is a pure client-side SPA
- No CDN custom domain yet — CloudFront URL only at deploy time

---

## Related Documents

| Document | Purpose |
|:---------|:--------|
| `docs/architecture.md` | ADRs, CDK infrastructure constructs, stack outputs, runtime Mermaid flow diagrams |
| `docs/backend-handlers-and-architecture.md` | DynamoDB single-table schema, S3 keys, Lambda handlers, IAM grants |
| `docs/frontend-components-and-architecture.md` | Angular 22 components, Signals, dialogs, pipes, routing, responsive design |
| `docs/api-routes-and-communication-matrix.md` | Master route matrix, HTTP request/response schemas, CDK integrations, bidirectional lookups |
| `FE_IMPLEMENTATION_PLAN.md` | Frontend step-by-step plan + current completion state |
| `IMPLEMENTATION_PLAN.md` | Backend/infra step-by-step plan |
| `CHANGELOG.md` | History of what was built per commit |
| `.agents/AGENTS.md` | Agent coding rules, workflow, and skill index |
| `.agents/rules/` | Technology-specific coding standards |
| `.agents/skills/` | Pattern libraries (upload, dialogs, drag-drop, etc.) |
