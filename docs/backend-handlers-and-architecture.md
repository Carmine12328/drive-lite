# Backend Architecture & Lambda Handlers — Drive Lite

This document provides a comprehensive, verified, and in-depth technical specification of the Drive Lite backend architecture, including the DynamoDB single-table design, AWS SDK v3 configurations, shared libraries, validation systems, IAM security policies, and all 17 Lambda handlers and local proxies.

---

## 1. Single-Table Database Schema & Key Architecture

Drive Lite utilizes a DynamoDB Single-Table Design implemented in `MetadataTable` (`infra/lib/storage-construct.ts` and `backend/src/lib/keys.ts`).

### Table Specification
- **Table Name**: `MetadataTable` (CDK-generated or configured via `TABLE_NAME`)
- **Primary Partition Key (PK)**: `String`
- **Primary Sort Key (SK)**: `String`
- **Billing Mode**: On-Demand (`PAY_PER_REQUEST`)
- **Time To Live (TTL)**: Enabled on attribute `ttl` (Unix epoch timestamp in seconds)
- **Global Secondary Index (GSI1)**:
  - **Index Partition Key (GSI1PK)**: `String`
  - **Index Sort Key (GSI1SK)**: `String`
  - **Projection**: `ALL`

### Entity Partition & Sort Key Patterns (`backend/src/lib/keys.ts`)

| Entity | Primary PK | Primary SK | GSI1PK | GSI1SK | Description |
|:---|:---|:---|:---|:---|:---|
| **User Profile** | `USER#{userId}` | `PROFILE` | — | — | Created upon signup confirmation via Cognito Post-Confirmation trigger or `/auth/init-profile`. |
| **Folder** | `USER#{userId}` | `FOLDER#{folderId}` | `USER#{userId}` | `FOLDER#{folderId}` | Folders owned by user. Top-level root directory has `folderId = 'ROOT'`. |
| **File (Active)** | `USER#{userId}#FOLDER#{folderId}` | `FILE#{fileId}` | `USER#{userId}` | `FILE#{fileId}` | Scoped by user and parent folder. GSI1 enables cross-folder queries (global search, recent files, direct ID lookup). |
| **File (Trash)** | `TRASH#{userId}` | `FILE#{fileId}` | `USER#{userId}` | `FILE#{fileId}` | Soft-deleted files moved to the trash partition with `deletedAt`, `originalPK`, and 30-day `ttl`. |
| **Share Link** | `SHARE#{shareToken}` | `LINK` | `USER#{userId}` | `SHARE#{fileId}#{shareToken}` | Time-limited share tokens for public access. |
| **Rate Limit** | `RATELIMIT#{sourceIp}` | `{action}#{windowId}` | — | — | Rate limiting records (auto-cleaned via TTL). |

### S3 Storage Key Convention
All file binaries are stored in the S3 bucket using a secure, tenant-isolated path format:
```
users/{userId}/files/{fileId}/{fileName}
```
- `userId`: Cognito `sub` UUID providing strict tenant isolation.
- `fileId`: Monotonically sortable ULID ensuring collision-free object keys.
- `fileName`: Original client file name preserved for human-readable console inspection.

---

## 2. Shared Backend Libraries & Utilities

### 2.1. Configuration: `backend/src/lib/config.ts`
Loads and validates environment variables at module initialization time:
- `TABLE_NAME`: Target DynamoDB table (throws if missing).
- `BUCKET_NAME`: Target S3 bucket for files (throws if missing).
- `REGION`: AWS Region (defaults to `us-east-1`).
- `ALLOWED_ORIGINS`: Allowed CORS origins (defaults to `http://localhost:4200`).
- `isLocalStack`: Boolean flag (`!!process.env['AWS_ENDPOINT_URL']`) used to toggle `forcePathStyle` on S3 clients.

### 2.2. DynamoDB Client: `backend/src/lib/dynamo-client.ts`
Instantiates a singleton `DynamoDBDocumentClient` at module scope for connection reuse across warm Lambda containers:
```typescript
const ddbClient = new DynamoDBClient({ region: config.REGION });
export const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});
```

### 2.3. S3 Client: `backend/src/lib/s3-client.ts`
Instantiates a singleton `S3Client` configured with region and path-style addressing:
```typescript
export const s3Client = new S3Client({
  region: config.REGION,
  forcePathStyle: config.isLocalStack,
});
```

### 2.4. HTTP Responses: `backend/src/lib/response.ts`
Standardized API Gateway proxy response builders with CORS headers:
- `success<T>(statusCode: number, body: T): APIGatewayProxyResultV2`: Returns JSON payload with headers:
  - `Content-Type: application/json`
  - `Access-Control-Allow-Origin: config.ALLOWED_ORIGINS`
  - `Access-Control-Allow-Headers: Content-Type,Authorization`
  - `Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS`
- `error(statusCode: number, message: string): APIGatewayProxyResultV2`: Returns `{ message }` JSON with error HTTP status code.

### 2.5. Request Validators & Auth Extraction: `backend/src/lib/validators.ts`
- `validateName(name: unknown): string`: Trims name, rejects empty strings, limits length to 255 chars, blocks path traversal (`..`, `/`, `\`, `\0`), and blocks ASCII control characters.
- `validateFileSize(size: unknown): number`: Asserts positive finite number and enforces a maximum file size of 100 MB (`100 * 1024 * 1024` bytes).
- `validateFolderId(id: unknown): string`: Asserts non-empty string.
- `validateMimeType(type: unknown): string`: Asserts regex format `type/subtype` (`^[\w.+-]+\/[\w.+-]+$`).
- `parseBody<T>(event: APIGatewayProxyEventV2): T`: Decodes base64 body if applicable and parses JSON. Throws `ValidationError(400)` on failure.
- `getUserId(event: APIGatewayProxyEventV2): string`: Safely reads `event.requestContext.authorizer.jwt.claims.sub`. Throws `ValidationError('Unauthorized: missing user identity', 403)` if missing.

### 2.6. Rate Limiter: `backend/src/lib/rate-limiter.ts`
DynamoDB-based rate limiting per IP with 15-minute sliding window and TTL auto-cleanup.

### 2.7. Password Utilities: `backend/src/lib/password.ts`
PBKDF2 hashing (100K iterations, SHA-256) and constant-time verification via timingSafeEqual.

---

## 3. Lambda Handlers Detailed Analysis

### 3.1. Authentication Handlers

#### `PostConfirmationHandler`: `backend/src/handlers/auth/post-confirmation.ts`
- **CDK Integration**: `PostConfirmationFn` attached to `CognitoUserPool.addTrigger(POST_CONFIRMATION)`
- **IAM Grants**: `table.grantReadWriteData`
- **Trigger**: AWS Cognito `PostConfirmation_ConfirmSignUp` trigger.
- **Functionality**: Atomically provisions the user profile and initial `'ROOT'` folder ("My Drive") in DynamoDB upon user registration confirmation.
- **DynamoDB Operation**: `TransactWriteCommand` containing:
  1. `Put` item for `PK: USER#{userId}`, `SK: PROFILE`, `entityType: 'USER_PROFILE'`, `email`, `createdAt`, `updatedAt` with `ConditionExpression: 'attribute_not_exists(PK)'`.
  2. `Put` item for `PK: USER#{userId}`, `SK: FOLDER#ROOT`, `GSI1PK: USER#{userId}`, `GSI1SK: FOLDER#ROOT`, `entityType: 'FOLDER'`, `folderId: 'ROOT'`, `folderName: 'My Drive'`, `parentFolderId: 'ROOT'`, `createdAt`, `updatedAt` with `ConditionExpression: 'attribute_not_exists(PK)'`.
- **Error Handling**: Non-fatal catch to ensure Cognito user confirmation is not aborted if records already exist.
- **Returns**: Unmodified Cognito event (required by AWS Cognito trigger contract).

#### `InitProfileHandler`: `backend/src/handlers/auth/init-profile.ts`
- **CDK Integration**: `InitProfileFn` &rarr; `InitProfileIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `POST /auth/init-profile`
- **Auth**: JWT claims `sub` &rarr; `userId` (or request body fallback in dev)
- **Workflow**:
  1. Extracts `userId` and `email` from JWT claims (or body).
  2. Idempotently executes `TransactWriteCommand` to insert `USER_PROFILE` and `FOLDER#ROOT` ("My Drive").
  3. Catches `TransactionCanceledException` / `ConditionalCheckFailedException` cleanly to return 200 OK.
- **Response**: `200 OK` with `{ message: "Profile initialized successfully" }`.

---

### 3.2. Folder Handlers

#### `CreateFolderHandler`: `backend/src/handlers/folders/create-folder.ts`
- **CDK Integration**: `CreateFolderFn` &rarr; `CreateFolderIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `POST /folders`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Request Body**: `CreateFolderRequest` (`{ folderName: string, parentFolderId: string }`)
- **Workflow**:
  1. Extracts `userId` from JWT claims.
  2. Validates `folderName` (&le; 255 chars, no path traversal) and `parentFolderId`.
  3. If `parentFolderId !== 'ROOT'`, executes `GetCommand` to verify the parent folder exists under `PK: USER#{userId}, SK: FOLDER#{parentFolderId}`. Returns 404 if missing.
  4. Generates a new `folderId` via `ulid()`.
  5. Executes `PutCommand` to store the new `FolderItem` with `ConditionExpression: 'attribute_not_exists(PK)'`.
- **Response**: `201 Created` with the created `FolderItem`.

#### `ListFoldersHandler`: `backend/src/handlers/folders/list-folders.ts`
- **CDK Integration**: `ListFoldersFn` &rarr; `ListFoldersIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `GET /folders[?parentFolderId=...]`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**:
  1. Extracts `userId`.
  2. Executes `QueryCommand` on `TableName: config.TABLE_NAME`, `KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)'` with `:pk = USER#{userId}` and `:skPrefix = 'FOLDER#'`.
  3. If `parentFolderId` query parameter is provided, filters results in memory.
- **Response**: `200 OK` with `{ folders: FolderItem[] }`.

#### `RenameFolderHandler`: `backend/src/handlers/folders/rename-folder.ts`
- **CDK Integration**: `RenameFolderFn` &rarr; `RenameFolderIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `PATCH /folders/{id}`
- **Auth**: JWT claims `sub` &rarr; `userId`; Path param `id` &rarr; `folderId`
- **Request Body**: `RenameRequest` (`{ name: string }`)
- **Workflow**:
  1. Validates `folderId` from path parameters and `name` from body.
  2. Executes `GetCommand` to verify folder existence. Returns 404 if not found.
  3. Executes `UpdateCommand` with `UpdateExpression: 'SET folderName = :n, updatedAt = :u'`, returning `ALL_NEW` attributes.
- **Response**: `200 OK` with updated attributes.

#### `DeleteFolderHandler`: `backend/src/handlers/folders/delete-folder.ts`
- **CDK Integration**: `DeleteFolderFn` &rarr; `DeleteFolderIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `DELETE /folders/{id}`
- **Auth**: JWT claims `sub` &rarr; `userId`; Path param `id` &rarr; `folderId`
- **Workflow**:
  1. Blocks deletion of root directory (`folderId === 'ROOT'` &rarr; 400 Bad Request).
  2. Verifies folder exists via `GetCommand`.
  3. Executes recursive deletion (`deleteRecursive`):
     - Queries all files in this folder (`PK: USER#{userId}#FOLDER#{folderId}, SK begins_with FILE#`).
     - Moves files in batches of 10 to trash via `TransactWriteCommand` (deleting from active partition, writing to `TRASH#{userId}` with 30-day TTL).
     - Queries all subfolders (`PK: USER#{userId}, SK begins_with FOLDER#`) where `parentFolderId === folderId`, and recursively calls `deleteRecursive`.
     - Executes `DeleteCommand` on the folder item itself (`PK: USER#{userId}, SK: FOLDER#{folderId}`).
- **Response**: `200 OK` with `{ message: 'Folder deleted' }`.

---

### 3.3. File Operations Handlers

#### `GetUploadUrlHandler`: `backend/src/handlers/files/get-upload-url.ts`
- **CDK Integration**: `GetUploadUrlFn` &rarr; `GetUploadUrlIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantPut`
- **Route**: `POST /files/upload-url`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Request Body**: `GetUploadUrlRequest` (`{ fileName, fileSize, mimeType, folderId }`)
- **Workflow**:
  1. Validates file metadata and asserts `fileSize <= 100 MB`.
  2. If `folderId !== 'ROOT'`, verifies folder existence via `GetCommand`.
  3. Generates new `fileId` via `ulid()` and computes `s3Key = users/${userId}/files/${fileId}/${fileName}`.
  4. Stores a `PENDING` file metadata record in DynamoDB:
     - `PK`: `USER#{userId}#FOLDER#{folderId}`
     - `SK`: `FILE#{fileId}`
     - `GSI1PK`: `USER#{userId}`
     - `GSI1SK`: `FILE#{fileId}`
     - `uploadStatus`: `'PENDING'`
     - `createdAt`, `updatedAt`: ISO 8601 timestamps
  5. Creates presigned S3 PUT URL using `@aws-sdk/s3-request-presigner` for `PutObjectCommand` with `expiresIn: 900` (15 minutes).
- **Response**: `201 Created` with `{ uploadUrl, fileId, s3Key }`.

#### `ConfirmUploadHandler`: `backend/src/handlers/files/confirm-upload.ts`
- **CDK Integration**: `ConfirmUploadFn` &rarr; `ConfirmUploadIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantRead`
- **Route**: `POST /files/confirm-upload`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Request Body**: `ConfirmUploadRequest` (`{ fileId }`)
- **Workflow**:
  1. Queries GSI1 (`GSI1PK = USER#{userId}, GSI1SK = FILE#{fileId}`) to locate the file record across partitions.
  2. Asserts `uploadStatus === 'PENDING'` (returns 409 Conflict if already confirmed).
  3. Issues S3 `HeadObjectCommand` on `file.s3Key` to guarantee the binary was successfully uploaded to S3. Returns 404 if S3 key is missing.
  4. Executes `UpdateCommand` on the primary PK/SK setting `uploadStatus = 'COMPLETED'` and `updatedAt = ISO timestamp`.
- **Response**: `200 OK` with `{ message: 'Upload confirmed', fileId }`.

#### `GetDownloadUrlHandler`: `backend/src/handlers/files/get-download-url.ts`
- **CDK Integration**: `GetDownloadUrlFn` &rarr; `GetDownloadUrlIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantRead`
- **Route**: `POST /files/{id}/download-url`
- **Auth**: JWT claims `sub` &rarr; `userId`; Path param `id` &rarr; `fileId`
- **Workflow**:
  1. Queries GSI1 for `fileId`. Returns 404 if not found.
  2. Asserts `uploadStatus === 'COMPLETED'`.
  3. Creates presigned S3 GET URL via `getSignedUrl` on `GetObjectCommand` with `ResponseContentDisposition: attachment; filename="${file.fileName}"` and `expiresIn: 3600` (1 hour).
- **Response**: `200 OK` with `{ downloadUrl, fileName }`.

#### `ListFilesHandler`: `backend/src/handlers/files/list-files.ts`
- **CDK Integration**: `ListFilesFn` &rarr; `ListFilesIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `GET /files[?folderId=...]`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**:
  1. Defaults `folderId` to `'ROOT'`.
  2. Verifies folder existence if not ROOT.
  3. Executes `QueryCommand` on `PK = USER#{userId}#FOLDER#{folderId}` and `begins_with(SK, 'FILE#')`.
  4. Filters out soft-deleted items (`!item.deletedAt`).
- **Response**: `200 OK` with `{ files: FileItem[] }`.

#### `GetFileHandler`: `backend/src/handlers/files/get-file.ts`
- **CDK Integration**: `GetFileFn` &rarr; `GetFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `GET /files/{id}`
- **Auth**: JWT claims `sub` &rarr; `userId`; Path param `id` &rarr; `fileId`
- **Workflow**:
  1. Queries GSI1 (`GSI1PK = USER#{userId}, GSI1SK = FILE#{fileId}`).
  2. Returns 404 if item does not exist.
- **Response**: `200 OK` with `FileItem`.

#### `RenameFileHandler`: `backend/src/handlers/files/rename-file.ts`
- **CDK Integration**: `RenameFileFn` &rarr; `RenameFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `PATCH /files/{id}`
- **Auth**: JWT claims `sub` &rarr; `userId`; Path param `id` &rarr; `fileId`
- **Request Body**: `RenameRequest` (`{ name: string }`)
- **Workflow**:
  1. Validates `name` and queries GSI1 to locate file item and its partition key `file.PK`.
  2. Executes `UpdateCommand` on `(file.PK, file.SK)` setting `fileName = :name, updatedAt = :now`.
- **Response**: `200 OK` with `{ message: 'File renamed', fileId, fileName }`.

#### `DeleteFileHandler`: `backend/src/handlers/files/delete-file.ts`
- **CDK Integration**: `DeleteFileFn` &rarr; `DeleteFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantDelete`
- **Route**: `DELETE /files/{id}`
- **Auth**: JWT claims `sub` &rarr; `userId`; Path param `id` &rarr; `fileId`
- **Workflow**:
  1. Queries GSI1 to locate file item. Returns 404 if missing.
  2. **Pending Uploads (Hard Delete)**: If `uploadStatus === 'PENDING'`, issues S3 `DeleteObjectCommand` on `s3Key` and DynamoDB `DeleteCommand` on `(file.PK, file.SK)`.
  3. **Completed Uploads (Soft Delete)**: If `uploadStatus === 'COMPLETED'`, issues atomic `TransactWriteCommand`:
     - `Delete` from active folder partition `Key: { PK: file.PK, SK: file.SK }`.
     - `Put` into trash partition `Key: { PK: TRASH#{userId}, SK: file.SK }` with `deletedAt: now`, `originalPK: file.PK`, and `ttl: now + 30 days`.
- **Response**: `200 OK` with `{ message: 'File deleted' }`.

#### `RecentFilesHandler`: `backend/src/handlers/files/recent-files.ts`
- **CDK Integration**: `RecentFilesFn` &rarr; `RecentFilesIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `GET /files/recent[?limit=10]`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**:
  1. Parses and clamps `limit` (default 10, min 1, max 50).
  2. Queries GSI1 (`GSI1PK = USER#{userId}` and `begins_with(GSI1SK, 'FILE#')`) across all user folders.
  3. Filters out soft-deleted items (`!item.deletedAt`).
  4. Sorts descending by `updatedAt` (or `createdAt`), and returns the top N items.
- **Response**: `200 OK` with `{ files: FileItem[] }`.

---

### 3.4. Trash Operations Handlers

#### `ListTrashHandler`: `backend/src/handlers/files/list-trash.ts`
- **CDK Integration**: `ListTrashFn` &rarr; `ListTrashIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `GET /trash/files`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**:
  1. Queries DynamoDB with `PK = TRASH#{userId}` and `begins_with(SK, 'FILE#')`.
- **Response**: `200 OK` with `{ files: FileItem[] }` including `deletedAt` and `originalPK`.

#### `RestoreFileHandler`: `backend/src/handlers/files/restore-file.ts`
- **CDK Integration**: `RestoreFileFn` &rarr; `RestoreFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `POST /files/{id}/restore`
- **Auth**: JWT claims `sub` &rarr; `userId`; Path param `id` &rarr; `fileId`
- **Workflow**:
  1. Fetches item from `PK: TRASH#{userId}, SK: FILE#{fileId}` via `GetCommand`. Returns 404 if not found in trash.
  2. Resolves target partition key from `originalPK` (or falls back to `folderPK(userId, folderId)`).
  3. Removes trash attributes (`deletedAt`, `originalPK`, `ttl`).
  4. Restores GSI1 keys (`GSI1PK = USER#{userId}, GSI1SK = FILE#{fileId}`).
  5. Executes atomic `TransactWriteCommand`:
     - `Delete` from `TRASH#{userId}`.
     - `Put` restored item into original folder partition with updated `updatedAt`.
- **Response**: `200 OK` with `{ message: 'File restored successfully', file: FileItem }`.

#### `PermanentDeleteFileHandler`: `backend/src/handlers/files/permanent-delete-file.ts`
- **CDK Integration**: `PermanentDeleteFileFn` &rarr; `PermanentDeleteFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantDelete`
- **Route**: `DELETE /trash/files/{id}`
- **Auth**: JWT claims `sub` &rarr; `userId`; Path param `id` &rarr; `fileId`
- **Workflow**:
  1. Fetches item from `TRASH#{userId}` via `GetCommand`. Returns 404 if not in trash.
  2. Issues S3 `DeleteObjectCommand` on `s3Key` to purge binary.
  3. Executes `DeleteCommand` on DynamoDB trash item.
- **Response**: `200 OK` with `{ message: 'File permanently deleted' }`.

#### `EmptyTrashHandler`: `backend/src/handlers/files/empty-trash.ts`
- **CDK Integration**: `EmptyTrashFn` &rarr; `EmptyTrashIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantDelete`
- **Route**: `DELETE /trash/files`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**:
  1. Queries all items in `PK = TRASH#{userId}`.
  2. Iterates over all trash items:
     - Issues S3 `DeleteObjectCommand` for each file's `s3Key`.
     - Executes DynamoDB `DeleteCommand` for each item.
- **Response**: `200 OK` with `{ message: 'Trash emptied successfully', deletedCount: number }`.

---

### 3.5. Share Handlers

#### `CreateShareHandler`: `backend/src/handlers/shares/create-share.ts`
- **CDK Integration**: `CreateShareFn` &rarr; `CreateShareIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `POST /files/{id}/share`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**: Verifies file belongs to user. Generates cryptographic `shareToken` and sets `ttl`. Hashes password if provided. Saves to DynamoDB.
- **Response**: `201 Created` with `{ shareToken, shareUrl, expiresAt, passwordProtected }`.

#### `GetShareHandler`: `backend/src/handlers/shares/get-share.ts`
- **CDK Integration**: `GetShareFn` &rarr; `GetShareIntegration`
- **IAM Grants**: `table.grantReadData`
- **Route**: `GET /share/{token}`
- **Auth**: **PUBLIC** (No JWT authorizer)
- **Workflow**: Enforces IP rate limiting. Retrieves share. Verifies not expired, max downloads not reached, not locked.
- **Response**: `200 OK` with `{ fileName, fileSize, mimeType, passwordProtected, expiresAt }`.

#### `DownloadShareHandler`: `backend/src/handlers/shares/download-share.ts`
- **CDK Integration**: `DownloadShareFn` &rarr; `DownloadShareIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantRead`
- **Route**: `POST /share/{token}/download`
- **Auth**: **PUBLIC** (No JWT authorizer)
- **Workflow**: Enforces IP rate limiting. Retrieves share. Checks password via constant-time comparison (increments lockout counter on fail). Atomically increments download count. Generates presigned S3 GET URL.
- **Response**: `200 OK` with `{ downloadUrl, fileName }`.

#### `ListSharesHandler`: `backend/src/handlers/shares/list-shares.ts`
- **CDK Integration**: `ListSharesFn` &rarr; `ListSharesIntegration`
- **IAM Grants**: `table.grantReadData`
- **Route**: `GET /files/{id}/shares`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**: Queries GSI1 to retrieve all active shares for the specified file owned by the user.
- **Response**: `200 OK` with `{ shares: ShareLinkItem[] }`.

#### `RevokeShareHandler`: `backend/src/handlers/shares/revoke-share.ts`
- **CDK Integration**: `RevokeShareFn` &rarr; `RevokeShareIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `DELETE /share/{token}`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**: Validates share ownership and deletes the share record from DynamoDB.
- **Response**: `200 OK` with `{ message: 'Share link revoked' }`.

### 3.6. Version & Rollback Handlers

#### `ListVersionsHandler`: `backend/src/handlers/files/list-versions.ts`
- **CDK Integration**: `ListVersionsFn` &rarr; `ListVersionsIntegration`
- **IAM Grants**: `bucket.grantRead`
- **Route**: `GET /files/{id}/versions`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**: Validates file ownership. Lists all S3 object versions for the file's `s3Key`.
- **Response**: `200 OK` with `{ versions: FileVersion[] }`.

#### `RollbackVersionHandler`: `backend/src/handlers/files/rollback-version.ts`
- **CDK Integration**: `RollbackVersionFn` &rarr; `RollbackVersionIntegration`
- **IAM Grants**: `table.grantReadWriteData`, `bucket.grantReadWrite`
- **Route**: `POST /files/{id}/rollback`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**: Validates file ownership. Copies the specified old S3 version to become the new latest version. Updates `fileSize` and `updatedAt` in DynamoDB.
- **Response**: `200 OK` with `{ message: 'Rolled back', file: FileItem }`.

### 3.7. File Move Handler

#### `MoveFileHandler`: `backend/src/handlers/files/move-file.ts`
- **CDK Integration**: `MoveFileFn` &rarr; `MoveFileIntegration`
- **IAM Grants**: `table.grantReadWriteData`
- **Route**: `PATCH /files/{id}/move`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**: Validates target folder existence. Executes a `TransactWriteCommand` to delete the file from the old folder partition and put it in the new folder partition.
- **Response**: `200 OK` with updated `FileItem`.

### 3.8. Thumbnail Generation Handler

#### `GenerateThumbnailHandler`: `backend/src/handlers/files/generate-thumbnail.ts`
- **CDK Integration**: `GenerateThumbnailFn` (S3 Event Notification)
- **IAM Grants**: `bucket.grantReadWrite`
- **Route**: N/A (S3 Event Triggered)
- **Auth**: N/A
- **Workflow**: Triggered asynchronously by `s3:ObjectCreated:*`. Uses Sharp to generate `.webp` thumbnails.
- **Response**: N/A

### 3.9. AI Summarization Handler

#### `SummarizeFileHandler`: `backend/src/handlers/files/summarize-file.ts`
- **CDK Integration**: `SummarizeFileFn` &rarr; `SummarizeFileIntegration`
- **IAM Grants**: `table.grantReadData`, `bucket.grantRead`
- **Route**: `POST /files/{id}/summarize`
- **Auth**: JWT claims `sub` &rarr; `userId`
- **Workflow**: Validates file ownership. Returns a mock summary in stub mode (for portfolio), or real Bedrock response in AWS.
- **Response**: `200 OK` with `{ summary: string }`.

---

## 4. Local Development API Proxy (`backend/src/local-api.ts`)

To allow full frontend and backend development against LocalStack without requiring LocalStack Pro (which is needed for full HTTP API Gateway v2 routing), `local-api.ts` provides an Express-based server.

### Key Capabilities
1. **Dynamic Resource Resolution (`resolveStackOutputs`)**: Automatically queries LocalStack DynamoDB (`ListTablesCommand`) and S3 (`ListBucketsCommand`) on startup to discover deployed CDK resource names and sets `process.env.TABLE_NAME` and `process.env.BUCKET_NAME`.
2. **Express &harr; Lambda Adapter (`lambdaRoute`, `toApiGatewayEvent`)**: Transforms Express `req` into a full `APIGatewayProxyEventV2` object, dynamically imports the TypeScript handler, invokes it, and converts the `APIGatewayProxyResultV2` back into an Express response.
3. **JWT Identity Extraction (`extractUserIdFromJwt`)**: Parses the Bearer JWT in the `Authorization` header without verification to extract `sub` and `email` for the mock authorizer context. Falls back to `local-dev-user` for curl testing.
4. **Presigned URL S3 Rewriting**: Replaces Docker container IPs (e.g. `http://172.18.0.2:4566`) with `http://localhost:4566` in response bodies so the host browser can access LocalStack S3.
5. **Dev Helper Endpoints**:
   - `POST /auth/init-profile`: Invokes `postConfirmation` handler directly to initialize user profile and ROOT folder in DynamoDB.
   - `GET /auth/confirmation-code?email=...`: Reads cognito-local JSON files in `.cognito/db/` to provide the 6-digit confirmation code directly to the developer console.
   - `GET /health`: Healthcheck verifying table and bucket bindings.
