# API Routes & End-to-End Communication Matrix — Drive Lite

This document provides an exhaustive, bidirectional communication specification connecting every API Gateway HTTP route, CDK integration, and Lambda handler to its corresponding Frontend caller service, IAM permissions, database command, and storage operation.

---

## 1. Master Route & Communication Matrix

| HTTP Method | Route Path | CDK Integration | Lambda Handler | IAM Permissions | DynamoDB Action(s) | S3 Action(s) | Frontend Caller |
|:---|:---|:---|:---|:---|:---|:---|:---|
| `POST` | `/folders` | `CreateFolderIntegration` | `handlers/folders/create-folder.ts` | `table.grantReadWriteData` | `GetCommand` (parent check), `PutCommand` | — | `FolderService.createFolder(name, parentId)` |
| `GET` | `/folders` | `ListFoldersIntegration` | `handlers/folders/list-folders.ts` | `table.grantReadWriteData` | `QueryCommand` (`PK = USER#...`) | — | `FolderService.listFolders(parentId)` |
| `PATCH` | `/folders/{id}` | `RenameFolderIntegration` | `handlers/folders/rename-folder.ts` | `table.grantReadWriteData` | `GetCommand`, `UpdateCommand` | — | `FolderService.renameFolder(folderId, newName)` |
| `DELETE` | `/folders/{id}` | `DeleteFolderIntegration` | `handlers/folders/delete-folder.ts` | `table.grantReadWriteData` | `QueryCommand` (files/subfolders), `TransactWriteCommand` (batch soft delete), `DeleteCommand` | — | `FolderService.deleteFolder(folderId)` |
| `POST` | `/files/upload-url` | `GetUploadUrlIntegration` | `handlers/files/get-upload-url.ts` | `table.grantReadWriteData`, `bucket.grantPut` | `GetCommand` (folder check), `PutCommand` (`PENDING`) | `PutObjectCommand` (presigned URL) | `Upload.requestPresignedUrl(task)` |
| `PUT` | *(Presigned S3 URL)* | *(Direct S3 Endpoint)* | *(Direct S3 Service)* | Presigned IAM Signature | — | `PutObject` (binary stream with progress) | `Upload.uploadToS3(task, uploadUrl)` |
| `POST` | `/files/confirm-upload` | `ConfirmUploadIntegration` | `handlers/files/confirm-upload.ts` | `table.grantReadWriteData`, `bucket.grantRead` | `QueryCommand` (GSI1), `UpdateCommand` (`COMPLETED`) | `HeadObjectCommand` (presence check) | `Upload.confirmUpload(task)` |
| `POST` | `/files/{id}/download-url`| `GetDownloadUrlIntegration`| `handlers/files/get-download-url.ts`| `table.grantReadWriteData`, `bucket.grantRead` | `QueryCommand` (GSI1) | `GetObjectCommand` (presigned URL) | `FileService.downloadFile(fileId)`<br>`FilePreviewComponent.loadPreview(file)` |
| `GET` | `/files` | `ListFilesIntegration` | `handlers/files/list-files.ts` | `table.grantReadWriteData` | `GetCommand` (folder check), `QueryCommand` | — | `FileService.listFiles(folderId)` |
| `GET` | `/files/{id}` | `GetFileIntegration` | `handlers/files/get-file.ts` | `table.grantReadWriteData` | `QueryCommand` (GSI1) | — | *(Direct file metadata query)* |
| `PATCH` | `/files/{id}` | `RenameFileIntegration` | `handlers/files/rename-file.ts` | `table.grantReadWriteData` | `QueryCommand` (GSI1), `UpdateCommand` | — | `FileService.renameFile(fileId, newName)` |
| `DELETE` | `/files/{id}` | `DeleteFileIntegration` | `handlers/files/delete-file.ts` | `table.grantReadWriteData`, `bucket.grantDelete` | `QueryCommand` (GSI1), `TransactWriteCommand` (soft delete) OR `DeleteCommand` (pending) | `DeleteObjectCommand` (if pending hard delete) | `FileService.deleteFile(fileId)` |
| `GET` | `/files/recent` | `RecentFilesIntegration` | `handlers/files/recent-files.ts` | `table.grantReadWriteData` | `QueryCommand` (GSI1) | — | `FileService.loadRecentFiles(limit)` |
| `POST` | `/files/{id}/restore` | `RestoreFileIntegration` | `handlers/files/restore-file.ts` | `table.grantReadWriteData` | `GetCommand` (`TRASH#...`), `TransactWriteCommand` | — | `FileService.restoreFile(fileId)` |
| `GET` | `/trash/files` | `ListTrashIntegration` | `handlers/files/list-trash.ts` | `table.grantReadWriteData` | `QueryCommand` (`PK = TRASH#...`) | — | `FileService.loadTrash()` |
| `DELETE` | `/trash/files/{id}` | `PermanentDeleteFileIntegration` | `handlers/files/permanent-delete-file.ts` | `table.grantReadWriteData`, `bucket.grantDelete` | `GetCommand`, `DeleteCommand` | `DeleteObjectCommand` | `FileService.permanentlyDeleteFile(fileId)` |
| `DELETE` | `/trash/files` | `EmptyTrashIntegration` | `handlers/files/empty-trash.ts` | `table.grantReadWriteData`, `bucket.grantDelete` | `QueryCommand`, `DeleteCommand` (all) | `DeleteObjectCommand` (all) | `FileService.emptyTrash()` |
| `POST` | `/auth/init-profile` | `InitProfileIntegration` | `handlers/auth/init-profile.ts` | `table.grantReadWriteData` | `TransactWriteCommand` (`PROFILE` + `FOLDER#ROOT`) | — | `AuthService.initializeProfile(userId, email)` |
| `GET` | `/auth/confirmation-code` *(proxy)*| *(Dev Express Proxy)* | *(Reads `.cognito/db/*.json`)* | — | — | — | `AuthService.fetchAndLogConfirmationCode(email)` |
| `POST` | `/files/{id}/share` | `CreateShareIntegration` | `handlers/shares/create-share.ts` | `table.grantReadWriteData` | `PutCommand` (`SHARE#{token}`) | — | `ShareService.createShare(fileId, opts)` |
| `GET` | `/files/{id}/shares` | `ListSharesIntegration` | `handlers/shares/list-shares.ts` | `table.grantReadWriteData` | `QueryCommand` (GSI1) | — | `ShareService.listShares(fileId)` |
| `GET` | `/share/{token}` | `GetShareIntegration` | `handlers/shares/get-share.ts` | `table.grantReadWriteData` | `GetCommand`, `UpdateCommand` (Rate Limit) | — | `ShareService.getShareMeta(token)` |
| `POST` | `/share/{token}/download` | `DownloadShareIntegration` | `handlers/shares/download-share.ts` | `table.grantReadWriteData`, `bucket.grantRead` | `GetCommand`, `UpdateCommand` (Rate Limit, download count, brute-force) | `GetObjectCommand` (presigned URL) | `ShareService.downloadShare(token, password)` |
| `DELETE` | `/share/{token}` | `RevokeShareIntegration` | `handlers/shares/revoke-share.ts` | `table.grantReadWriteData` | `GetCommand`, `DeleteCommand` | — | `ShareService.revokeShare(token)` |
| `GET` | `/files/{id}/versions` | `ListVersionsIntegration` | `handlers/files/list-versions.ts` | `table.grantReadWriteData`, `bucket.grantRead` | `QueryCommand` (GSI1) | `ListObjectVersionsCommand` | `FileService.listVersions(fileId)` |
| `POST` | `/files/{id}/rollback` | `RollbackVersionIntegration` | `handlers/files/rollback-version.ts` | `table.grantReadWriteData`, `bucket.grantReadWrite` | `QueryCommand` (GSI1), `UpdateCommand` | `CopyObjectCommand`, `HeadObjectCommand` | `FileService.rollbackVersion(fileId, versionId)` |
| `PATCH` | `/files/{id}/move` | `MoveFileIntegration` | `handlers/files/move-file.ts` | `table.grantReadWriteData` | `QueryCommand` (GSI1), `TransactWriteCommand` | — | `FileService.moveFile(fileId, targetFolderId)` |
| `POST` | `/files/{id}/summarize` | `SummarizeFileIntegration` | `handlers/files/summarize-file.ts` | `table.grantReadWriteData`, `bucket.grantRead` | `QueryCommand` (GSI1) | `GetObjectCommand` | `FileService.summarizeFile(fileId)` |

---

## 2. End-to-End Route Specifications

### 2.1. Folder Operations

#### `POST /folders` — Create Folder
- **Description**: Creates a new folder under a parent folder or at ROOT.
- **Frontend Caller**: `FolderService.createFolder(name: string, parentId = 'ROOT')` (`frontend/src/app/core/services/folder.service.ts`)
- **HTTP Request**:
  - Method: `POST`
  - URL: `${environment.apiUrl}/folders`
  - Headers: `Authorization: Bearer <idToken>`, `Content-Type: application/json`
  - Body:
    ```json
    {
      "folderName": "Marketing Assets",
      "parentFolderId": "ROOT"
    }
    ```
- **Backend Handler**: `backend/src/handlers/folders/create-folder.ts`
- **CDK Integration**: `CreateFolderIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**:
  - `GetCommand` checking parent folder under `PK: USER#{userId}, SK: FOLDER#{parentFolderId}` (if not ROOT).
  - `PutCommand` inserting:
    - `PK`: `USER#{userId}`
    - `SK`: `FOLDER#{folderId}`
    - `GSI1PK`: `USER#{userId}`
    - `GSI1SK`: `FOLDER#{folderId}`
    - `entityType`: `'FOLDER'`
    - `folderId`: `<ULID>`
    - `folderName`: `'Marketing Assets'`
    - `parentFolderId`: `'ROOT'`
    - `userId`: `<userId>`
    - `createdAt`, `updatedAt`: ISO timestamp
- **Response Status & Body**:
  - `201 Created`: `{ "folder": FolderItem }`
  - `400 Bad Request`: `{ "message": "Invalid folder name" }`
  - `404 Not Found`: `{ "message": "Parent folder not found" }`

---

#### `GET /folders` — List Folders
- **Description**: Returns all folders for the authenticated user (optionally filtered by parent).
- **Frontend Caller**: `FolderService.listFolders(parentId = 'ROOT')` (`frontend/src/app/core/services/folder.service.ts`)
- **HTTP Request**:
  - Method: `GET`
  - URL: `${environment.apiUrl}/folders[?parentFolderId=ROOT]`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/folders/list-folders.ts`
- **CDK Integration**: `ListFoldersIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: `QueryCommand` on `PK = USER#{userId} AND begins_with(SK, 'FOLDER#')`.
- **Response Status & Body**:
  - `200 OK`: `{ "folders": FolderItem[] }`
  - `401 Unauthorized`: Missing or invalid Bearer JWT

---

#### `PATCH /folders/{id}` — Rename Folder
- **Description**: Renames an existing folder.
- **Frontend Caller**: `FolderService.renameFolder(folderId: string, newName: string)` (`frontend/src/app/core/services/folder.service.ts`)
- **HTTP Request**:
  - Method: `PATCH`
  - URL: `${environment.apiUrl}/folders/${folderId}`
  - Headers: `Authorization: Bearer <idToken>`, `Content-Type: application/json`
  - Body: `{ "name": "New Folder Name" }`
- **Backend Handler**: `backend/src/handlers/folders/rename-folder.ts`
- **CDK Integration**: `RenameFolderIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: `UpdateCommand` on `PK: USER#{userId}, SK: FOLDER#{folderId}` updating `folderName` and `updatedAt`.
- **Response Status & Body**:
  - `200 OK`: `{ "folder": FolderItem }`
  - `404 Not Found`: `{ "message": "Folder not found" }`

---

#### `DELETE /folders/{id}` — Delete Folder Hierarchy
- **Description**: Recursively deletes a folder, moving all nested files to trash and deleting child subfolders.
- **Frontend Caller**: `FolderService.deleteFolder(folderId: string)` (`frontend/src/app/core/services/folder.service.ts`)
- **HTTP Request**:
  - Method: `DELETE`
  - URL: `${environment.apiUrl}/folders/${folderId}`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/folders/delete-folder.ts`
- **CDK Integration**: `DeleteFolderIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**:
  - `QueryCommand` for files in `folderPK(userId, folderId)`.
  - Batch `TransactWriteCommand` moving files to `TRASH#{userId}` with 30-day TTL.
  - Recursive search and deletion for all child `FOLDER#` items.
  - `DeleteCommand` on target folder.
- **Response Status & Body**:
  - `200 OK`: `{ "message": "Folder deleted" }`
  - `400 Bad Request`: Cannot delete `'ROOT'` folder
  - `404 Not Found`: `{ "message": "Folder not found" }`

---

### 2.2. File Operations & 3-Phase Upload

#### Phase 1: `POST /files/upload-url` — Request Presigned URL
- **Description**: Generates an S3 presigned PUT URL and writes a PENDING file metadata record in DynamoDB.
- **Frontend Caller**: `Upload.requestPresignedUrl(task)` (`frontend/src/app/core/services/upload.ts`)
- **HTTP Request**:
  - Method: `POST`
  - URL: `${environment.apiUrl}/files/upload-url`
  - Headers: `Authorization: Bearer <idToken>`, `Content-Type: application/json`
  - Body:
    ```json
    {
      "fileName": "presentation.pdf",
      "fileSize": 2048576,
      "mimeType": "application/pdf",
      "folderId": "ROOT"
    }
    ```
- **Backend Handler**: `backend/src/handlers/files/get-upload-url.ts`
- **CDK Integration**: `GetUploadUrlIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantPut`
- **Database Operations**: `PutCommand` creating file record with `uploadStatus: 'PENDING'`.
- **S3 Operations**: `getSignedUrl(s3Client, new PutObjectCommand(...), { expiresIn: 900 })`.
- **Response Status & Body**:
  - `201 Created`:
    ```json
    {
      "uploadUrl": "http://localhost:4566/drive-lite-files-dev/users/.../files/...?AWSAccessKeyId=...",
      "fileId": "01J...",
      "s3Key": "users/USER_ID/files/01J.../presentation.pdf"
    }
    ```
  - `400 Bad Request`: File size exceeds 100 MB or illegal characters

---

#### Phase 2: `PUT {uploadUrl}` — Direct S3 Upload
- **Description**: Streams the raw file binary directly to S3 via the presigned URL with upload progress monitoring.
- **Frontend Caller**: `Upload.uploadToS3(task, uploadUrl)` (`frontend/src/app/core/services/upload.ts`)
- **HTTP Request**:
  - Method: `PUT`
  - URL: `<Presigned S3 URL>` (rewritten to `localhost:4566` in dev)
  - Headers: `Content-Type: <mimeType>`
  - Body: Raw binary `File` payload
  - Options: `reportProgress: true`, `observe: 'events'`
- **Backend Handler**: None (Direct S3 / LocalStack endpoint).
- **Response**: `200 OK` (S3 standard response).

---

#### Phase 3: `POST /files/confirm-upload` — Confirm Upload
- **Description**: Verifies the file was uploaded to S3 via `HeadObject` and marks the DynamoDB record as `COMPLETED`.
- **Frontend Caller**: `Upload.confirmUpload(task)` (`frontend/src/app/core/services/upload.ts`)
- **HTTP Request**:
  - Method: `POST`
  - URL: `${environment.apiUrl}/files/confirm-upload`
  - Headers: `Authorization: Bearer <idToken>`, `Content-Type: application/json`
  - Body: `{ "fileId": "01J..." }`
- **Backend Handler**: `backend/src/handlers/files/confirm-upload.ts`
- **CDK Integration**: `ConfirmUploadIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantRead`
- **Database Operations**:
  - `QueryCommand` on GSI1 to locate file item.
  - `UpdateCommand` on primary PK/SK setting `uploadStatus = 'COMPLETED'` and `updatedAt = ISO timestamp`.
- **S3 Operations**: `HeadObjectCommand` checking existence of `file.s3Key`.
- **Response Status & Body**:
  - `200 OK`: `{ "message": "Upload confirmed", "fileId": "01J..." }`
  - `404 Not Found`: S3 binary object not found
  - `409 Conflict`: File already confirmed

---

#### `POST /files/{id}/download-url` — Get Download URL
- **Description**: Generates an S3 presigned GET URL with `attachment` disposition for browser downloading or content previewing.
- **Frontend Caller**: `FileService.downloadFile(fileId)` (`file.service.ts`) and `FilePreviewComponent.loadPreview(file)` (`file-preview.component.ts`)
- **HTTP Request**:
  - Method: `POST`
  - URL: `${environment.apiUrl}/files/${fileId}/download-url`
  - Headers: `Authorization: Bearer <idToken>`, `Content-Type: application/json`
  - Body: `{}`
- **Backend Handler**: `backend/src/handlers/files/get-download-url.ts`
- **CDK Integration**: `GetDownloadUrlIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantRead`
- **Database Operations**: `QueryCommand` on GSI1.
- **S3 Operations**: `getSignedUrl(s3Client, new GetObjectCommand({ ResponseContentDisposition: 'attachment; filename="..."' }), { expiresIn: 3600 })`.
- **Response Status & Body**:
  - `200 OK`: `{ "downloadUrl": "...", "fileName": "..." }`
  - `404 Not Found`: `{ "message": "File not found" }`

---

#### `GET /files` — List Files
- **Description**: Lists active (non-deleted) files in a specific folder.
- **Frontend Caller**: `FileService.listFiles(folderId: string)` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `GET`
  - URL: `${environment.apiUrl}/files?folderId=${folderId}`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/files/list-files.ts`
- **CDK Integration**: `ListFilesIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: `QueryCommand` on `PK = USER#{userId}#FOLDER#{folderId} AND begins_with(SK, 'FILE#')`.
- **Response Status & Body**:
  - `200 OK`: `{ "files": FileItem[] }`

---

#### `GET /files/recent` — List Recent Files
- **Description**: Returns top N most recently modified files across all folders.
- **Frontend Caller**: `FileService.loadRecentFiles(limit = 10)` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `GET`
  - URL: `${environment.apiUrl}/files/recent?limit=${limit}`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/files/recent-files.ts`
- **CDK Integration**: `RecentFilesIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: `QueryCommand` on GSI1 (`GSI1PK = USER#{userId} AND begins_with(GSI1SK, 'FILE#')`).
- **Response Status & Body**:
  - `200 OK`: `{ "files": FileItem[] }` sorted descending by `updatedAt`.

---

#### `PATCH /files/{id}` — Rename File
- **Description**: Renames a file record in DynamoDB.
- **Frontend Caller**: `FileService.renameFile(fileId: string, newName: string)` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `PATCH`
  - URL: `${environment.apiUrl}/files/${fileId}`
  - Headers: `Authorization: Bearer <idToken>`, `Content-Type: application/json`
  - Body: `{ "name": "updated_name.png" }`
- **Backend Handler**: `backend/src/handlers/files/rename-file.ts`
- **CDK Integration**: `RenameFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: `QueryCommand` on GSI1 to resolve `file.PK`, followed by `UpdateCommand` setting `fileName = :name`.
- **Response Status & Body**:
  - `200 OK`: `{ "message": "File renamed", "fileId": "...", "fileName": "..." }`
  - `404 Not Found`: File not found

---

#### `DELETE /files/{id}` — Delete File (Soft Delete to Trash)
- **Description**: Moves completed files to trash partition with a 30-day TTL. Hard-deletes pending files.
- **Frontend Caller**: `FileService.deleteFile(fileId: string)` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `DELETE`
  - URL: `${environment.apiUrl}/files/${fileId}`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/files/delete-file.ts`
- **CDK Integration**: `DeleteFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantDelete`
- **Database Operations**:
  - For `COMPLETED` files: `TransactWriteCommand` deleting from `PK: USER#{userId}#FOLDER#{folderId}` and putting into `PK: TRASH#{userId}` with `deletedAt`, `originalPK`, and `ttl`.
  - For `PENDING` files: `DeleteCommand` on DynamoDB and `DeleteObjectCommand` on S3.
- **Response Status & Body**:
  - `200 OK`: `{ "message": "File deleted" }`
  - `404 Not Found`: File not found

---

### 2.3. Trash Operations

#### `GET /trash/files` — List Trashed Files
- **Description**: Lists all soft-deleted files for the user.
- **Frontend Caller**: `FileService.loadTrash()` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `GET`
  - URL: `${environment.apiUrl}/trash/files`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/files/list-trash.ts`
- **CDK Integration**: `ListTrashIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: `QueryCommand` on `PK = TRASH#{userId} AND begins_with(SK, 'FILE#')`.
- **Response Status & Body**:
  - `200 OK`: `{ "files": FileItem[] }`

---

#### `POST /files/{id}/restore` — Restore File from Trash
- **Description**: Moves a soft-deleted file back from `TRASH#{userId}` into its original parent folder partition.
- **Frontend Caller**: `FileService.restoreFile(fileId: string)` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `POST`
  - URL: `${environment.apiUrl}/files/${fileId}/restore`
  - Headers: `Authorization: Bearer <idToken>`, `Content-Type: application/json`
  - Body: `{}`
- **Backend Handler**: `backend/src/handlers/files/restore-file.ts`
- **CDK Integration**: `RestoreFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: `GetCommand` from `TRASH#{userId}`, followed by atomic `TransactWriteCommand` deleting from trash and putting back to original partition.
- **Response Status & Body**:
  - `200 OK`: `{ "message": "File restored successfully", "file": FileItem }`
  - `404 Not Found`: File not found in trash

---

#### `DELETE /trash/files/{id}` — Permanently Delete File
- **Description**: Permanently purges a file from both the trash partition and S3 storage.
- **Frontend Caller**: `FileService.permanentlyDeleteFile(fileId: string)` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `DELETE`
  - URL: `${environment.apiUrl}/trash/files/${fileId}`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/files/permanent-delete-file.ts`
- **CDK Integration**: `PermanentDeleteFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantDelete`
- **Database Operations**: `GetCommand` from `TRASH#{userId}`, followed by `DeleteCommand`.
- **S3 Operations**: `DeleteObjectCommand` on `file.s3Key`.
- **Response Status & Body**:
  - `200 OK`: `{ "message": "File permanently deleted" }`
  - `404 Not Found`: File not found in trash

---

#### `DELETE /trash/files` — Empty Trash
- **Description**: Purges all soft-deleted files in the trash partition and removes all corresponding objects from S3.
- **Frontend Caller**: `FileService.emptyTrash()` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `DELETE`
  - URL: `${environment.apiUrl}/trash/files`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/files/empty-trash.ts`
- **CDK Integration**: `EmptyTrashIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantDelete`
- **Database Operations**: `QueryCommand` for all items in `TRASH#{userId}`, followed by `DeleteCommand` for each item.
- **S3 Operations**: `DeleteObjectCommand` for each file's `s3Key`.
- **Response Status & Body**:
  - `200 OK`: `{ "message": "Trash emptied successfully", "deletedCount": number }`

---

### 2.4. Authentication & Development Helper Routes

#### `POST /auth/init-profile` — Initialize Profile (Dev & Cloud Sign-In)
- **Description**: Initializes the user profile and root folder in DynamoDB. Called idempotently by `AuthService` on login in local development and cloud OAuth/Cognito sign-ins.
- **Frontend Caller**: `AuthService.initializeProfile(userId, email)` (`frontend/src/app/core/auth/auth.service.ts`)
- **HTTP Request**:
  - Method: `POST`
  - URL: `${environment.apiUrl}/auth/init-profile`
  - Headers: `Authorization: Bearer <jwt-token>`, `Content-Type: application/json`
  - Body: `{ "userId": "<sub-uuid>", "email": "user@example.com" }`
- **Backend Handler**: `backend/src/handlers/auth/init-profile.ts` (`InitProfileIntegration` in API Gateway) & local proxy in `backend/src/local-api.ts`.
- **Database Operations**: `TransactWriteCommand` inserting `USER_PROFILE` and `FOLDER#ROOT` ("My Drive") with `attribute_not_exists(PK)` condition.
- **Response**: `200 OK` with `{ "message": "Profile initialized successfully" }` (or `{ "message": "Profile already initialized" }`).

---

#### `GET /auth/confirmation-code` — Fetch Dev Confirmation Code
- **Description**: Reads the local `.cognito/db/*.json` file to retrieve the 6-digit confirmation code for automatic console logging.
- **Frontend Caller**: `AuthService.fetchAndLogConfirmationCode(email)` (`frontend/src/app/core/auth/auth.service.ts`)
- **HTTP Request**:
  - Method: `GET`
  - URL: `${environment.apiUrl}/auth/confirmation-code?email=${email}`
- **Backend Handler**: Local endpoint in `backend/src/local-api.ts`.
- **Response**: `200 OK` with `{ "code": "123456" }`.

---

### 2.5. Share Operations

#### `POST /files/{id}/share` — Create Share Link
- **Description**: Generates a secure, expiring share link for a file with optional password protection and download limits.
- **Frontend Caller**: `ShareService.createShare(fileId, opts)` (`frontend/src/app/core/services/share.service.ts`)
- **HTTP Request**:
  - Method: `POST`
  - URL: `${environment.apiUrl}/files/${fileId}/share`
  - Headers: `Authorization: Bearer <idToken>`, `Content-Type: application/json`
  - Body:
    ```json
    {
      "expiresInHours": 24,
      "password": "optionalPassword123",
      "maxDownloads": 5
    }
    ```
- **Backend Handler**: `backend/src/handlers/shares/create-share.ts`
- **CDK Integration**: `CreateShareIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: `PutCommand` to create a new `SHARE#{token}` record, including PBKDF2 hash of password (if provided) and auto-expiration TTL.
- **Response Status & Body**:
  - `201 Created`: `{ "shareToken": "...", "shareUrl": "...", "expiresAt": "...", "passwordProtected": true }`

---

#### `GET /files/{id}/shares` — List Shares for File
- **Description**: Lists all active share links generated by the owner for a specific file.
- **Frontend Caller**: `ShareService.listShares(fileId)` (`frontend/src/app/core/services/share.service.ts`)
- **HTTP Request**:
  - Method: `GET`
  - URL: `${environment.apiUrl}/files/${fileId}/shares`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/shares/list-shares.ts`
- **CDK Integration**: `ListSharesIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: `QueryCommand` on GSI1 to retrieve shares based on `USER#{userId}` and `SHARE#{fileId}`.
- **Response Status & Body**:
  - `200 OK`: `{ "shares": ShareLinkItem[] }` (Password hashes removed).

---

#### `GET /share/{token}` — Get Share Metadata (Public)
- **Description**: Public endpoint to fetch file information before downloading. Secured by rate limiting and uniform error responses. No JWT required.
- **Frontend Caller**: `ShareService.getShareMeta(token)` (`frontend/src/app/core/services/share.service.ts`)
- **HTTP Request**:
  - Method: `GET`
  - URL: `${environment.apiUrl}/share/${token}`
  - Headers: *(No Authorization)*
- **Backend Handler**: `backend/src/handlers/shares/get-share.ts`
- **CDK Integration**: `GetShareIntegration` (No Authorizer)
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: 
  - `UpdateCommand` for IP rate-limiting.
  - `GetCommand` for `SHARE#{token}`.
- **Response Status & Body**:
  - `200 OK`: `{ "fileName": "...", "fileSize": 1024, "mimeType": "...", "passwordProtected": true, "expiresAt": "..." }`
  - `404 Not Found`: `{ "message": "This share link is no longer available." }` (Generic error for all failure modes).

---

#### `POST /share/{token}/download` — Download via Share (Public)
- **Description**: Public endpoint to generate a presigned download URL after verifying password (if applicable) and limits. No JWT required.
- **Frontend Caller**: `ShareService.downloadShare(token, password?)` (`frontend/src/app/core/services/share.service.ts`)
- **HTTP Request**:
  - Method: `POST`
  - URL: `${environment.apiUrl}/share/${token}/download`
  - Headers: `Content-Type: application/json`
  - Body: `{ "password": "optionalPassword123" }`
- **Backend Handler**: `backend/src/handlers/shares/download-share.ts`
- **CDK Integration**: `DownloadShareIntegration` (No Authorizer)
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantRead`
- **Database Operations**: 
  - `UpdateCommand` for IP rate-limiting.
  - `GetCommand` for share verification.
  - `UpdateCommand` to atomically increment `downloadCount` (if limits apply) and update `failedPasswordAttempts` (brute-force lock).
- **S3 Operations**: Generates presigned GET URL for download.
- **Response Status & Body**:
  - `200 OK`: `{ "downloadUrl": "...", "fileName": "..." }`
  - `403 Forbidden`: Invalid password or password required.
  - `404 Not Found`: Link no longer available or locked.

---

#### `DELETE /share/{token}` — Revoke Share Link
- **Description**: Immediately invalidates an active share link.
- **Frontend Caller**: `ShareService.revokeShare(token)` (`frontend/src/app/core/services/share.service.ts`)
- **HTTP Request**:
  - Method: `DELETE`
  - URL: `${environment.apiUrl}/share/${token}`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/shares/revoke-share.ts`
- **CDK Integration**: `RevokeShareIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: `GetCommand` for ownership check, then `DeleteCommand`.
- **Response Status & Body**:
  - `200 OK`: `{ "message": "Share link revoked" }`

---

### 2.6. Version & Rollback Operations

#### `GET /files/{id}/versions` — List File Versions
- **Description**: Retrieves the S3 version history for a file.
- **Frontend Caller**: `FileService.listVersions(fileId)` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `GET`
  - URL: `${environment.apiUrl}/files/${fileId}/versions`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/files/list-versions.ts`
- **CDK Integration**: `ListVersionsIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantRead`
- **Database Operations**: `QueryCommand` on GSI1 to verify ownership.
- **S3 Operations**: `ListObjectVersionsCommand` on the file's `s3Key`.
- **Response Status & Body**:
  - `200 OK`: `{ "versions": [{ "versionId": "...", "lastModified": "...", "size": 1024, "isLatest": true }] }`

---

#### `POST /files/{id}/rollback` — Rollback Version
- **Description**: Restores an older S3 version to become the latest version of the file.
- **Frontend Caller**: `FileService.rollbackVersion(fileId, versionId)` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `POST`
  - URL: `${environment.apiUrl}/files/${fileId}/rollback`
  - Headers: `Authorization: Bearer <idToken>`, `Content-Type: application/json`
  - Body: `{ "versionId": "..." }`
- **Backend Handler**: `backend/src/handlers/files/rollback-version.ts`
- **CDK Integration**: `RollbackVersionIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantReadWrite`
- **Database Operations**: `UpdateCommand` to refresh file metadata (`fileSize`, `updatedAt`).
- **S3 Operations**: `CopyObjectCommand` referencing the target version, then `HeadObjectCommand` for the new size.
- **Response Status & Body**:
  - `200 OK`: `{ "message": "Rolled back", "file": FileItem }`

---

### 2.7. File Move Operation

#### `PATCH /files/{id}/move` — Move File
- **Description**: Moves a file from one folder to another using a transaction.
- **Frontend Caller**: `FileService.moveFile(fileId, targetFolderId)` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `PATCH`
  - URL: `${environment.apiUrl}/files/${fileId}/move`
  - Headers: `Authorization: Bearer <idToken>`, `Content-Type: application/json`
  - Body: `{ "targetFolderId": "..." }`
- **Backend Handler**: `backend/src/handlers/files/move-file.ts`
- **CDK Integration**: `MoveFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Database Operations**: `TransactWriteCommand` to delete the item from the old folder PK and put it into the new folder PK.
- **Response Status & Body**:
  - `200 OK`: `{ "file": FileItem }`

---

### 2.8. AI Summarization

#### `POST /files/{id}/summarize` — AI Summarization (Stub/Real)
- **Description**: Generates an AI summary of a file's content. Implemented as a stub by default for portfolio demonstration (returns first 500 characters).
- **Frontend Caller**: `FileService.summarizeFile(fileId)` (`frontend/src/app/core/services/file.service.ts`)
- **HTTP Request**:
  - Method: `POST`
  - URL: `${environment.apiUrl}/files/${fileId}/summarize`
  - Headers: `Authorization: Bearer <idToken>`
- **Backend Handler**: `backend/src/handlers/files/summarize-file.ts`
- **CDK Integration**: `SummarizeFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantRead`
- **Database Operations**: `QueryCommand` on GSI1 to verify ownership.
- **S3 Operations**: `GetObjectCommand` to fetch content for summarization.
- **Response Status & Body**:
  - `200 OK`: `{ "summary": "..." }`

---

## 3. Bidirectional Lookup Index

### 3.1. Frontend Service Method &rarr; API Route & Lambda Handler

| Frontend Service Method | HTTP Call | Lambda Handler File | CDK Integration |
|:---|:---|:---|:---|
| `AuthService.initializeProfile` | `POST /auth/init-profile` | `handlers/auth/post-confirmation.ts` | *(Dev Express Proxy)* |
| `FolderService.createFolder` | `POST /folders` | `handlers/folders/create-folder.ts` | `CreateFolderIntegration` |
| `FolderService.listFolders` | `GET /folders` | `handlers/folders/list-folders.ts` | `ListFoldersIntegration` |
| `FolderService.renameFolder` | `PATCH /folders/{id}` | `handlers/folders/rename-folder.ts` | `RenameFolderIntegration` |
| `FolderService.deleteFolder` | `DELETE /folders/{id}` | `handlers/folders/delete-folder.ts` | `DeleteFolderIntegration` |
| `FileService.listFiles` | `GET /files` | `handlers/files/list-files.ts` | `ListFilesIntegration` |
| `FileService.loadRecentFiles` | `GET /files/recent` | `handlers/files/recent-files.ts` | `RecentFilesIntegration` |
| `FileService.downloadFile` | `POST /files/{id}/download-url` | `handlers/files/get-download-url.ts` | `GetDownloadUrlIntegration` |
| `FileService.renameFile` | `PATCH /files/{id}` | `handlers/files/rename-file.ts` | `RenameFileIntegration` |
| `FileService.deleteFile` | `DELETE /files/{id}` | `handlers/files/delete-file.ts` | `DeleteFileIntegration` |
| `FileService.loadTrash` | `GET /trash/files` | `handlers/files/list-trash.ts` | `ListTrashIntegration` |
| `FileService.restoreFile` | `POST /files/{id}/restore` | `handlers/files/restore-file.ts` | `RestoreFileIntegration` |
| `FileService.permanentlyDeleteFile` | `DELETE /trash/files/{id}` | `handlers/files/permanent-delete-file.ts` | `PermanentDeleteFileIntegration` |
| `FileService.emptyTrash` | `DELETE /trash/files` | `handlers/files/empty-trash.ts` | `EmptyTrashIntegration` |
| `Upload.requestPresignedUrl` | `POST /files/upload-url` | `handlers/files/get-upload-url.ts` | `GetUploadUrlIntegration` |
| `Upload.uploadToS3` | `PUT {presignedUrl}` | *(Direct S3)* | *(Direct S3 Endpoint)* |
| `Upload.confirmUpload` | `POST /files/confirm-upload` | `handlers/files/confirm-upload.ts` | `ConfirmUploadIntegration` |
| `ShareService.createShare` | `POST /files/{id}/share` | `handlers/shares/create-share.ts` | `CreateShareIntegration` |
| `ShareService.listShares` | `GET /files/{id}/shares` | `handlers/shares/list-shares.ts` | `ListSharesIntegration` |
| `ShareService.revokeShare` | `DELETE /share/{token}` | `handlers/shares/revoke-share.ts` | `RevokeShareIntegration` |
| `ShareService.getShareMeta` | `GET /share/{token}` | `handlers/shares/get-share.ts` | `GetShareIntegration` |
| `ShareService.downloadShare` | `POST /share/{token}/download` | `handlers/shares/download-share.ts` | `DownloadShareIntegration` |
| `FileService.listVersions` | `GET /files/{id}/versions` | `handlers/files/list-versions.ts` | `ListVersionsIntegration` |
| `FileService.rollbackVersion` | `POST /files/{id}/rollback` | `handlers/files/rollback-version.ts` | `RollbackVersionIntegration` |
| `FileService.moveFile` | `PATCH /files/{id}/move` | `handlers/files/move-file.ts` | `MoveFileIntegration` |
| `FileService.summarizeFile` | `POST /files/{id}/summarize` | `handlers/files/summarize-file.ts` | `SummarizeFileIntegration` |

---

### 3.2. Lambda Handler &rarr; API Route & Frontend Service Method

| Lambda Handler File | Route Path | HTTP Method | Frontend Caller Method |
|:---|:---|:---|:---|
| `handlers/auth/post-confirmation.ts` | `POST /auth/init-profile` / Cognito Trigger | `POST` | `AuthService.initializeProfile()` / Cognito signup confirmation |
| `handlers/folders/create-folder.ts` | `/folders` | `POST` | `FolderService.createFolder()` |
| `handlers/folders/list-folders.ts` | `/folders` | `GET` | `FolderService.listFolders()` |
| `handlers/folders/rename-folder.ts` | `/folders/{id}` | `PATCH` | `FolderService.renameFolder()` |
| `handlers/folders/delete-folder.ts` | `/folders/{id}` | `DELETE` | `FolderService.deleteFolder()` |
| `handlers/files/get-upload-url.ts` | `/files/upload-url` | `POST` | `Upload.requestPresignedUrl()` |
| `handlers/files/confirm-upload.ts` | `/files/confirm-upload` | `POST` | `Upload.confirmUpload()` |
| `handlers/files/get-download-url.ts` | `/files/{id}/download-url` | `POST` | `FileService.downloadFile()` / `FilePreviewComponent.loadPreview()` |
| `handlers/files/list-files.ts` | `/files` | `GET` | `FileService.listFiles()` |
| `handlers/files/get-file.ts` | `/files/{id}` | `GET` | *(Direct file metadata query)* |
| `handlers/files/rename-file.ts` | `/files/{id}` | `PATCH` | `FileService.renameFile()` |
| `handlers/files/delete-file.ts` | `/files/{id}` | `DELETE` | `FileService.deleteFile()` |
| `handlers/files/recent-files.ts` | `/files/recent` | `GET` | `FileService.loadRecentFiles()` |
| `handlers/files/list-trash.ts` | `/trash/files` | `GET` | `FileService.loadTrash()` |
| `handlers/files/restore-file.ts` | `/files/{id}/restore` | `POST` | `FileService.restoreFile()` |
| `handlers/files/permanent-delete-file.ts` | `/trash/files/{id}` | `DELETE` | `FileService.permanentlyDeleteFile()` |
| `handlers/files/empty-trash.ts` | `/trash/files` | `DELETE` | `FileService.emptyTrash()` |
| `handlers/shares/create-share.ts` | `/files/{id}/share` | `POST` | `ShareService.createShare()` |
| `handlers/shares/list-shares.ts` | `/files/{id}/shares` | `GET` | `ShareService.listShares()` |
| `handlers/shares/revoke-share.ts` | `/share/{token}` | `DELETE` | `ShareService.revokeShare()` |
| `handlers/shares/get-share.ts` | `/share/{token}` | `GET` | `ShareService.getShareMeta()` |
| `handlers/shares/download-share.ts` | `/share/{token}/download` | `POST` | `ShareService.downloadShare()` |
| `handlers/files/list-versions.ts` | `/files/{id}/versions` | `GET` | `FileService.listVersions()` |
| `handlers/files/rollback-version.ts` | `/files/{id}/rollback` | `POST` | `FileService.rollbackVersion()` |
| `handlers/files/move-file.ts` | `/files/{id}/move` | `PATCH` | `FileService.moveFile()` |
| `handlers/files/summarize-file.ts` | `/files/{id}/summarize` | `POST` | `FileService.summarizeFile()` |
