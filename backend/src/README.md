# backend/src — README

## What this module does

AWS Lambda handlers (Node.js 20, ESM, TypeScript) for the Drive Lite API.
Each handler is a single exported `handler` function mapped to one API route
by the CDK construct in `infra/lib/api-construct.ts`.

All routes require a valid Cognito JWT. The user's `sub` claim (= `userId`) is
extracted from `event.requestContext.authorizer.jwt.claims.sub`.

---

## Handler Index

### `handlers/auth/`

| File | Trigger | What it does |
|:-----|:--------|:-------------|
| `post-confirmation.ts` | Cognito Post-Confirmation trigger (not an API route) | Creates the user's `PROFILE` record and `ROOT` folder in DynamoDB after email confirmation |

### `handlers/folders/`

| File | Route | What it does |
|:-----|:------|:-------------|
| `create-folder.ts` | `POST /folders` | Creates a new folder under a parent (defaults to ROOT) |
| `list-folders.ts` | `GET /folders` | Returns all folders for the authenticated user |
| `rename-folder.ts` | `PATCH /folders/{id}` | Updates `folderName` in DynamoDB |
| `delete-folder.ts` | `DELETE /folders/{id}` | Deletes folder + all contained files (hard delete) |

### `handlers/files/`

| File | Route | What it does |
|:-----|:------|:-------------|
| `get-upload-url.ts` | `POST /files/upload-url` | Generates a presigned S3 PUT URL; creates a `PENDING` DynamoDB record |
| `confirm-upload.ts` | `POST /files/confirm-upload` | Verifies S3 object exists (HeadObject); updates DynamoDB record to `COMPLETED` |
| `get-download-url.ts` | `POST /files/{id}/download-url` | Generates a presigned S3 GET URL (15-min expiry) |
| `list-files.ts` | `GET /files` | Lists all `COMPLETED` files in a folder (`?folderId=` param) |
| `get-file.ts` | `GET /files/{id}` | Returns metadata for a single file |
| `rename-file.ts` | `PATCH /files/{id}` | Updates `fileName` in DynamoDB |
| `delete-file.ts` | `DELETE /files/{id}` | Soft-deletes: sets `deletedAt`, moves item to `TRASH#{userId}` PK |
| `restore-file.ts` | `POST /files/{id}/restore` | Moves item back from `TRASH#{userId}` to its original folder PK |
| `recent-files.ts` | `GET /files/recent` | Returns the 20 most recently updated `COMPLETED` files |
| `list-trash.ts` | `GET /trash/files` | Lists all soft-deleted files for the user |
| `permanent-delete-file.ts` | `DELETE /trash/files/{id}` | Deletes from DynamoDB + deletes the S3 object |
| `empty-trash.ts` | `DELETE /trash/files` | Bulk permanent-deletes all items in the user's trash |

---

## Shared Utilities (`lib/`)

| File | What it provides |
|:-----|:----------------|
| `keys.ts` | Pure functions that build DynamoDB PK/SK strings and S3 object keys |
| `response.ts` | `success(statusCode, body)` and `error(statusCode, message)` — always includes CORS headers |
| `dynamo-client.ts` | Singleton `DynamoDBDocumentClient` instance |
| `s3-client.ts` | Singleton `S3Client` instance |
| `validators.ts` | Input validation helpers (required fields, max lengths, allowed MIME types) |
| `config.ts` | Reads `TABLE_NAME`, `BUCKET_NAME`, `REGION`, `ALLOWED_ORIGINS` from `process.env` |

---

## DynamoDB Key Patterns

| Entity | PK | SK |
|:-------|:---|:---|
| User profile | `USER#{userId}` | `PROFILE` |
| Folder | `USER#{userId}` | `FOLDER#{folderId}` |
| File (active) | `USER#{userId}#FOLDER#{folderId}` | `FILE#{fileId}` |
| File (trashed) | `TRASH#{userId}` | `FILE#{fileId}` |

S3 object key: `users/{userId}/files/{fileId}/{fileName}`

---

## Local Development

`local-api.ts` is an Express server that mirrors all Lambda routes. Run it via
Docker Compose alongside LocalStack. It extracts `userId` from the `Authorization`
header (falls back to `local-dev-user` for unauthenticated `curl` calls).
