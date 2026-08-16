# Architecture Decisions & Infrastructure Specification — Drive Lite

This document details the core architectural decisions, complete AWS CDK infrastructure constructs, and end-to-end runtime data-flow diagrams for Drive Lite.

---

## 1. Architectural Decision Records (ADRs)

### 1.1. Presigned URLs over Lambda Proxy Uploads
- **Decision**: Use S3 presigned URLs for file uploads and downloads rather than streaming file binaries through API Gateway and Lambda.
- **Rationale**:
  - AWS Lambda has a strict 6 MB synchronous payload limit (and API Gateway enforces a 10 MB payload limit), making direct proxying infeasible for media and large documents.
  - Presigned URLs offload heavy I/O directly to Amazon S3, eliminating compute bottlenecks and reducing Lambda concurrency and execution duration to milliseconds.
  - Supports direct browser-to-S3 uploads up to 5 GB with a single HTTP `PUT`.
  - Enforces least-privilege security: upload URLs expire after 15 minutes (900s) and download URLs expire after 1 hour (3600s).

### 1.2. Single-Table DynamoDB Design
- **Decision**: Persist all metadata entities (user profiles, folders, active files, and soft-deleted trash items) within a single DynamoDB table (`MetadataTable`).
- **Rationale**:
  - Minimizes provisioned infrastructure and billing boundaries.
  - Enables atomic multi-item operations (e.g. `TransactWriteCommand` for soft-deleting files and batch cascading folder deletions).
  - All application access patterns (folder listing, file lookup, cross-folder search, recent files, trash management) are satisfied with a single table and one Global Secondary Index (`GSI1`).

### 1.3. HTTP API over REST API (API Gateway v2)
- **Decision**: Provision Amazon API Gateway HTTP API (`HttpApi`) rather than a REST API.
- **Rationale**:
  - Up to 71% cost reduction and significantly lower latency compared to REST APIs.
  - Native, first-class OpenID Connect / OAuth2 JWT Authorizer support with automatic Cognito User Pool JWKS verification, removing the need for custom Lambda authorizers.
  - Clean CORS configuration and lightweight proxy routing.

### 1.4. Dual Authentication Flow
- **Decision**: Implement both Custom Angular Reactive Forms (SRP authentication via AWS Amplify / AWS SDK) and Cognito Hosted UI (OAuth2 Authorization Code Grant).
- **Rationale**:
  - **Custom Forms**: Offers pixel-perfect branding, custom 2-step registration with real-time password strength metering, and inline verification code advancement.
  - **Hosted UI**: Enables zero-code managed authentication and seamless social identity federation.
  - Both flows yield identical Cognito JWT ID tokens and Access tokens validated seamlessly by the same API Gateway JWT Authorizer.

### 1.5. LocalStack for Local Development
- **Decision**: Emulate AWS services (DynamoDB, S3, Cognito via `cognito-local`) locally using Docker and LocalStack.
- **Rationale**:
  - Enables full-fidelity offline development and testing with zero cloud costs.
  - High-speed dev iteration without CloudFormation deploy latency.
  - Paired with `backend/src/local-api.ts` to bridge Express with Lambda handlers and automatically rewrite Docker-internal S3 URLs for host browser access.

### 1.6. Public Share Endpoint Security
- **Decision**: Expose 2 unauthenticated routes (`GET /share/{token}`, `POST /share/{token}/download`) secured by 256-bit cryptographic tokens, DynamoDB rate limiting, PBKDF2 password hashing, and brute-force lockout instead of WAF.
- **Rationale**:
  - A WAF would incur baseline costs that exceed the $0/month budget.
  - Defense-in-depth via application-level rate limiting (DynamoDB atomic counters + TTL), PBKDF2 (zero dependency), and anti-enumeration generic errors safely protects the endpoints at zero added cost.

### 1.7. Stub AI Summarization
- **Decision**: Ship Feature 8 as a stub returning document preview (first 500 chars) for portfolio demonstration.
- **Rationale**:
  - Real Bedrock calls cost money.
  - The architecture includes an opt-in `BEDROCK_ENABLED` environment variable for real AWS deployments.

### 1.8. Client-Side ZIP Generation
- **Decision**: Use browser-side `jszip` for batch downloads instead of a server-side ZIP Lambda.
- **Rationale**:
  - Saves Lambda execution time and memory limits.
  - Eliminates server-side S3 egress costs to build the ZIP, leveraging the client's connection instead.

### 1.9. CodeMirror 6 over Monaco Editor
- **Decision**: Use CodeMirror 6 for the in-browser text and markdown editor.
- **Rationale**:
  - CodeMirror is lightweight (~100KB gzipped) and tree-shakeable.
  - Matches the 'lite' philosophy much better than Monaco Editor (~4MB).

---

## 2. Infrastructure & CDK Constructs Specification

The cloud infrastructure is provisioned with AWS CDK v2 (`infra/lib/`) organized into modular constructs composed in `DriveLiteStack`.

```
infra/lib/
├── drive-lite-stack.ts       # Root Stack composing all constructs & stack outputs
├── storage-construct.ts      # S3 FilesBucket + DynamoDB single-table
├── auth-construct.ts         # Cognito User Pool + Web Client (SPA)
├── api-construct.ts          # HTTP API Gateway + 17 Lambda functions + IAM grants + Rate Limiting
├── frontend-construct.ts     # S3 HostingBucket + CloudFront Distribution (OAC)
└── budget-construct.ts       # AWS Monthly Budget ($2.50) + SNS Topic + Kill-Switch Lambda
```

### 2.1. Root Stack: `DriveLiteStack` (`infra/lib/drive-lite-stack.ts`)
Composes all constructs in strict dependency order:
1. **`StorageConstruct`**: Creates DynamoDB table and S3 files bucket.
2. **`AuthConstruct`**: Creates Cognito User Pool (instantiated prior to API so JWT Authorizer can reference the User Pool ID).
3. **`ApiConstruct`**: Creates HTTP API Gateway (with 10 req/s rate limiting), Lambda functions, IAM role bindings, and routes.
4. **Cognito Trigger Binding**: Invokes `auth.addPostConfirmationTrigger(api.postConfirmationHandler)` to wire the post-confirmation Lambda.
5. **`FrontendConstruct`**: Creates S3 static website hosting bucket and CloudFront distribution (conditionally skipped when `localstack=true`).
6. **`BudgetConstruct`**: Creates AWS Monthly Budget ($2.50 limit), SNS cost alerts to `carmine12328@gmail.com`, and automated Kill-Switch Lambda.

#### Cost Protection: 3-Layer Architecture
1. **Layer 1: Edge Rate Limiting**: `ApiConstruct` configures `defaultRouteSettings` on API Gateway with `throttlingRateLimit: 10` req/s and `throttlingBurstLimit: 20` req/s. Excessive bot traffic is rejected with HTTP 429 for $0.
2. **Layer 2: AWS Monthly Budget**: `BudgetConstruct` provisions an `AWS::Budgets::Budget` capped at $2.50 USD/month. Sends email alerts at 80% ($2.00) actual spend and 100% ($2.50) forecasted spend.
3. **Layer 3: Automated Kill-Switch**: Upon reaching 100% actual budget breach ($2.50), AWS Budgets publishes to an SNS topic that invokes `kill-switch.ts`, issuing an automated `cloudformation:DeleteStack` to tear down all resources and guarantee zero ongoing charges.

#### Context Flags & Environment Modes
- `localstack=true`: Forces dev mode and skips CloudFront provisioning.
- `skipCloudFront=true`: Skips CloudFront/Frontend bucket provisioning (useful for accounts awaiting CloudFront verification or local-frontend + live-backend setups).
- `dev=true`: Applies `RemovalPolicy.DESTROY` and `autoDeleteObjects: true` on S3 buckets and DynamoDB tables.
- **Production (default)**: Applies `RemovalPolicy.RETAIN` on storage resources.

#### CloudFormation Stack Outputs
| Output Name | Source Attribute | Description |
|:---|:---|:---|
| `ApiUrl` | `api.api.url` | HTTP API Gateway base endpoint |
| `UserPoolId` | `auth.userPool.userPoolId` | Cognito User Pool ID |
| `UserPoolClientId` | `auth.userPoolClient.userPoolClientId` | Cognito App Client ID |
| `TableName` | `storage.table.tableName` | Metadata DynamoDB table name |
| `BucketName` | `storage.bucket.bucketName` | Binary storage S3 bucket name |
| `HostingBucketName` | `frontend.hostingBucket.bucketName` | Frontend S3 hosting bucket name |
| `WebsiteUrl` | `frontend.websiteUrl` | Public website URL (S3 website endpoint or CloudFront) |
| `CloudFrontUrl` | `https://${frontend.distribution.distributionDomainName}` | Public CloudFront CDN domain URL |
| `CloudFrontDistributionId` | `frontend.distribution.distributionId` | CloudFront distribution ID for cache invalidation |

---

### 2.2. CI/CD Pipeline Automation (GitHub Actions)

Drive Lite uses a dual GitHub Actions workflow architecture in `.github/workflows/`:

1. **Pull Request & Branch Validation (`ci.yml`)**:
   - Triggers on pull requests targeting `main` and pushes to feature branches.
   - Executes `npm ci` with npm cache, `.angular/cache` zstd build cache, workspace linting, Vitest backend unit tests, CDK infrastructure snapshot tests, and full Angular production build verification.
2. **Continuous Deployment (`deploy.yml`)**:
   - Triggers on direct push to `main` and manual `workflow_dispatch`.
   - Authenticates to AWS via **AWS OIDC Role assumption** (`role-to-assume: ${{ secrets.AWS_ROLE_ARN }}`) or standard IAM Access Keys.
   - Provisions CDK infrastructure via `cdk deploy DriveLiteStack --outputs-file cdk-outputs.json`.
   - Runs `scripts/configure-environment.mjs` to dynamically inject stack outputs into `frontend/src/environments/environment.prod.ts`.
   - Compiles Angular SPA and syncs static assets to S3 hosting bucket with differential caching (`max-age=31536000, immutable` on hashed chunks, `no-cache` on `index.html`).
   - Automatically invalidates CloudFront CDN cache upon completion.
   - Publishes a deployment summary to GitHub Actions `$GITHUB_STEP_SUMMARY`.

### 2.3. Storage Construct: `StorageConstruct` (`infra/lib/storage-construct.ts`)

#### S3 Files Bucket (`FilesBucket`)
- **Access**: `BlockPublicAccess.BLOCK_ALL` (all public read/write blocked).
- **Encryption**: `BucketEncryption.S3_MANAGED` (SSE-S3 AES-256).
- **Security**: `enforceSSL: true` (rejects non-HTTPS requests).
- **Versioning**: `versioned: true`.
- **CORS Configuration**:
  - Allowed Origins: `http://localhost:4200`
  - Allowed Methods: `PUT`, `GET`, `HEAD`
  - Allowed Headers: `*`
  - Max Age: 3600 seconds (1 hour)
- **Lifecycle Rules**:
  - `abortIncompleteMultipartUploadAfter: Duration.days(7)`
  - `noncurrentVersionExpiration: Duration.days(30)`
- **Removal Policy**: `DESTROY` with `autoDeleteObjects: true` (dev) / `RETAIN` (prod).

#### DynamoDB Single-Table (`MetadataTable`)
- **Table Structure**:
  - Partition Key (`PK`): `String`
  - Sort Key (`SK`): `String`
- **Billing Mode**: `Billing.onDemand()` (`PAY_PER_REQUEST`).
- **Time To Live (TTL)**: Enabled on attribute `ttl` (Unix timestamp in seconds for automatic 30-day trash purging).
- **Global Secondary Index (`GSI1`)**:
  - Partition Key (`GSI1PK`): `String`
  - Sort Key (`GSI1SK`): `String`
  - Projection: `ALL` (allows cross-partition lookups without table re-queries).

---

### 2.4. Authentication Construct: `AuthConstruct` (`infra/lib/auth-construct.ts`)

#### Cognito User Pool (`drive-lite-user-pool`)
- **Sign-In / Sign-Up**: `selfSignUpEnabled: true`, `signInAliases: { email: true }`, `autoVerify: { email: true }`.
- **Required Standard Attributes**: `email` (required, mutable).
- **Password Policy**:
  - Minimum length: 8 characters
  - Requires uppercase, lowercase, numbers, and special symbols
- **Account Recovery**: `AccountRecovery.EMAIL_ONLY`.

#### Cognito Web Client (`drive-lite-web-client`)
- **Client Security**: `generateSecret: false` (public SPA client).
- **Auth Flows**: `userSrp: true` (Secure Remote Password protocol).
- **OAuth 2.0 Configuration**:
  - Allowed Flows: `authorizationCodeGrant: true`
  - Scopes: `OPENID`, `EMAIL`, `PROFILE`
  - Callback URLs: `http://localhost:4200/auth/callback`
  - Logout URLs: `http://localhost:4200`

---

### 2.5. API Gateway Construct: `ApiConstruct` (`infra/lib/api-construct.ts`)

#### HTTP API Gateway (`drive-lite-api`)
- **CORS Preflight**:
  - Allowed Origins: `http://localhost:4200`
  - Allowed Methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`
  - Allowed Headers: `Content-Type`, `Authorization`
  - Max Age: 1 hour
- **JWT Authorizer (`CognitoAuthorizer`)**:
  - Issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
  - Audience: `[userPoolClientId]`
  - Applied across all API routes.

#### Lambda Function Defaults (`createHandler`)
- **Runtime**: `NODEJS_20_X`
- **Memory Size**: 256 MB
- **Timeout**: 30 seconds (configurable)
- **Bundling**: ESM output format (`OutputFormat.ESM`), banner injection for `createRequire`, externalized `@aws-sdk/*` modules.
- **Environment Variables**:
  - `TABLE_NAME`: Target DynamoDB table name
  - `BUCKET_NAME`: Target S3 bucket name
  - `REGION`: AWS Region
  - `ALLOWED_ORIGINS`: CORS origin (`http://localhost:4200`)

#### IAM Least-Privilege Permissions Matrix
| Handler Function | Table Permissions | S3 Permissions | Purpose |
|:---|:---|:---|:---|
| `CreateFolderFn`, `ListFoldersFn`, `RenameFolderFn`, `DeleteFolderFn` | `grantReadWriteData` | — | Folder metadata operations & cascading deletes |
| `GetUploadUrlFn` | `grantReadWriteData` | `bucket.grantPut` | Presigned PUT generation & PENDING item creation |
| `ConfirmUploadFn` | `grantReadWriteData` | `bucket.grantRead` | `HeadObject` validation & COMPLETED item update |
| `GetDownloadUrlFn` | `grantReadWriteData` | `bucket.grantRead` | Presigned GET generation |
| `ListFilesFn`, `GetFileFn`, `RenameFileFn`, `RecentFilesFn` | `grantReadWriteData` | — | File metadata queries and updates |
| `DeleteFileFn` | `grantReadWriteData` | `bucket.grantDelete` | Soft-delete to trash & pending object purge |
| `ListTrashFn`, `RestoreFileFn` | `grantReadWriteData` | — | Query trash & restore items across partitions |
| `PermanentDeleteFileFn` | `grantReadWriteData` | `bucket.grantDelete` | Purge DynamoDB trash record and S3 binary |
| `EmptyTrashFn` | `grantReadWriteData` | `bucket.grantDelete` | Purge all user trash records and S3 binaries |
| `PostConfirmationFn` | `grantReadWriteData` | — | Seed user profile and initial ROOT folder |
| `CreateShareFn`, `ListSharesFn`, `RevokeShareFn` | `grantReadWriteData` | — | Share link metadata operations (authenticated) |
| `GetShareFn` | `grantReadWriteData` | — | Public share metadata query (NO JWT authorizer) |
| `DownloadShareFn` | `grantReadWriteData` | `bucket.grantRead` | Public share download via presigned URL (NO JWT authorizer) |
| `ListVersionsFn` | `grantReadWriteData` | `bucket.grantRead` | S3 version history listing |
| `RollbackVersionFn` | `grantReadWriteData` | `bucket.grantReadWrite` | S3 object copy and metadata update |
| `MoveFileFn` | `grantReadWriteData` | — | Transact move file between folders |
| `GenerateThumbnailFn` | `grantReadWriteData` | `bucket.grantReadWrite` | S3-triggered image resize (Not an API route) |
| `SummarizeFileFn` | `grantReadWriteData` | `bucket.grantRead` | AI file summarization |
| `InitProfileFn` | `grantReadWriteData` | — | Idempotent user profile and ROOT folder initialization API route |

---

### 2.6. Frontend Construct: `FrontendConstruct` (`infra/lib/frontend-construct.ts`)

- **Hosting Bucket (`FrontendBucket`)**: Private S3 bucket with `BlockPublicAccess.BLOCK_ALL` and `S3_MANAGED` encryption.
- **CloudFront Distribution**:
  - Origin: `origins.S3BucketOrigin.withOriginAccessControl(hostingBucket)` (Origin Access Control secures bucket).
  - Viewer Protocol Policy: `REDIRECT_TO_HTTPS`.
  - Default Root Object: `index.html`.
  - **SPA Error Routing**:
    - HTTP 403 &rarr; HTTP 200 `/index.html`
    - HTTP 404 &rarr; HTTP 200 `/index.html` (allows Angular router to handle deep linking).

---

## 3. Runtime Data-Flow Diagrams

### Flow 1 — File Upload (3-Phase Presigned S3 PUT Flow)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser as FileBrowser / UploadDialog
    participant UploadSvc as Upload Service
    participant APIGW as HTTP API Gateway
    participant Lambda1 as get-upload-url.ts
    participant S3 as Amazon S3 Bucket
    participant Lambda2 as confirm-upload.ts
    participant DDB as DynamoDB (MetadataTable)

    User->>Browser: Selects file or drops into dropzone
    Browser->>UploadSvc: validateFile(file) & uploadFile(file, folderId)
    UploadSvc->>APIGW: POST /files/upload-url {fileName, fileSize, mimeType, folderId}
    Note over APIGW: Validates JWT sub claim
    APIGW->>Lambda1: Invokes GetUploadUrlFn
    Lambda1->>DDB: PutItem { PK: USER#uid#FOLDER#fid, SK: FILE#fid, uploadStatus: 'PENDING' }
    Lambda1->>S3: Generate presigned PUT URL (15 min expiry)
    Lambda1-->>UploadSvc: Returns { uploadUrl, fileId, s3Key }

    UploadSvc->>S3: PUT binary stream to uploadUrl (Content-Type: mimeType)
    Note over UploadSvc,S3: Emits HttpEventType.UploadProgress (0% -> 100%)
    S3-->>UploadSvc: 200 OK (S3 upload confirmed)

    UploadSvc->>APIGW: POST /files/confirm-upload { fileId }
    APIGW->>Lambda2: Invokes ConfirmUploadFn
    Lambda2->>DDB: Query GSI1 (GSI1PK = USER#uid, GSI1SK = FILE#fileId)
    Lambda2->>S3: HeadObject(s3Key) — verifies physical presence
    Lambda2->>DDB: UpdateItem (SET uploadStatus = 'COMPLETED', updatedAt = now)
    Lambda2-->>UploadSvc: 200 OK { message: 'Upload confirmed', fileId }
    UploadSvc->>Browser: FileService.addFileLocally(newFile) -> Instant UI render
```

---

### Flow 2 — File Download & Preview (Presigned S3 GET Flow)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as FileListComponent / FilePreviewComponent
    participant FileSvc as FileService / ApiService
    participant APIGW as HTTP API Gateway
    participant Lambda as get-download-url.ts
    participant DDB as DynamoDB (MetadataTable)
    participant S3 as Amazon S3 Bucket

    User->>UI: Clicks "Download" or opens "File Preview"
    UI->>FileSvc: downloadFile(fileId) or loadPreview(file)
    FileSvc->>APIGW: POST /files/{id}/download-url {}
    APIGW->>Lambda: Invokes GetDownloadUrlFn
    Lambda->>DDB: Query GSI1 to locate file record and s3Key
    Lambda->>S3: Generate presigned GET URL (expires in 3600s, ResponseContentDisposition: attachment)
    Lambda-->>FileSvc: Returns { downloadUrl, fileName }

    alt Direct Download
        FileSvc->>User: Creates invisible <a href="downloadUrl" download> & triggers click
        User->>S3: Browser streams download directly from S3
    else File Preview Dialog
        alt Image / Audio / Video
            FileSvc->>UI: Binds downloadUrl directly to <img>, <video>, or <audio>
        else PDF Preview
            FileSvc->>UI: Sanitizes URL with DomSanitizer -> renders in <iframe>
        else Text Preview
            FileSvc->>S3: HttpClient.get(downloadUrl, { responseType: 'text' })
            S3-->>UI: Displays raw text content inside <pre><code>
        end
    end
```

---

### Flow 3 — Authentication (Custom Angular Forms Path)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant LoginUI as LoginComponent / RegisterComponent
    participant AuthSvc as AuthService
    participant Cognito as AWS Cognito / cognito-local
    participant APIGW as HTTP API Gateway / Proxy
    participant Lambda as post-confirmation.ts / init-profile
    participant DDB as DynamoDB (MetadataTable)

    User->>LoginUI: Enters email and password -> Submit
    LoginUI->>AuthSvc: signIn(email, password)
    AuthSvc->>Cognito: InitiateAuth (USER_PASSWORD_AUTH)
    Cognito-->>AuthSvc: Returns { IdToken, AccessToken, RefreshToken }
    AuthSvc->>AuthSvc: Decodes JWT sub & email -> sets currentUser() signal
    AuthSvc->>AuthSvc: Stores tokens in sessionStorage ('drive-lite-tokens')

    AuthSvc->>APIGW: POST /auth/init-profile { userId, email }
    APIGW->>Lambda: Invokes PostConfirmationHandler (Idempotent seed)
    Lambda->>DDB: TransactWriteCommand: Put USER_PROFILE + Put FOLDER#ROOT ("My Drive")
    DDB-->>AuthSvc: 200 OK (Profile & Root folder ready)
    AuthSvc->>LoginUI: Navigates router to /dashboard
```

---

### Flow 4 — Authentication (Cognito Hosted UI OAuth Redirect)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser as Web Browser
    participant Cognito as Cognito Hosted UI
    participant Callback as CognitoCallbackComponent
    participant AuthSvc as AuthService
    participant Router as Angular Router

    User->>Browser: Clicks "Sign in with Cognito Hosted UI"
    Browser->>Cognito: Redirects to /oauth2/authorize?client_id=...&response_type=code
    User->>Cognito: Authenticates on hosted login screen
    Cognito->>Browser: Redirects to /auth/callback?code=AUTH_CODE
    Browser->>Callback: CallbackComponent initializes on route /auth/callback
    Callback->>AuthSvc: handleCognitoCallback()
    AuthSvc->>Cognito: Exchanges authorization code for tokens (/oauth2/token)
    Cognito-->>AuthSvc: Returns TokenSet { idToken, accessToken, refreshToken }
    AuthSvc->>AuthSvc: Sets currentUser() & isAuthenticated() signals
    AuthSvc->>Router: Navigates to /dashboard
```

---

### Flow 5 — File List & Folder Navigation

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant View as FileBrowserComponent / FileListComponent
    participant FS as FileService
    participant FldSvc as FolderService
    participant APIGW as HTTP API Gateway
    participant ListLambda as list-files.ts
    participant DDB as DynamoDB (MetadataTable)

    User->>View: Clicks folder node in tree or breadcrumb
    View->>FS: listFiles(folderId)
    View->>FldSvc: listFolders(folderId)
    FS->>APIGW: GET /files?folderId=FOLDER_ID (Bearer <token>)
    APIGW->>ListLambda: Invokes ListFilesFn
    ListLambda->>DDB: Query PK = USER#uid#FOLDER#fid AND begins_with(SK, 'FILE#')
    DDB-->>ListLambda: Returns active FileItem[]
    ListLambda-->>FS: 200 OK { files: FileItem[] }
    FS->>FS: files.set(items) & merges to internal cache
    FS-->>View: files() signal re-evaluates -> template renders items
```

---

### Flow 6 — Reactive Debounced Search & Autocomplete

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Navbar as NavbarComponent
    participant SearchSvc as SearchService
    participant FS as FileService
    participant FldSvc as FolderService
    participant Router as Angular Router

    User->>Navbar: Types search keyword in search bar
    Navbar->>SearchSvc: searchQuery.set(term)
    Note over SearchSvc: Effect waits 300ms debounce timer
    SearchSvc->>SearchSvc: debouncedQuery.set(term)
    Note over SearchSvc: searchResults() computed signal evaluates:
    SearchSvc->>FldSvc: getAllFolders() (case-insensitive name match)
    SearchSvc->>FS: getAllFiles() (case-insensitive name match)
    SearchSvc-->>Navbar: Emits combined results (capped at 10 items)
    Navbar->>Navbar: Highlights match substrings via <mark> tags in dropdown
    User->>Navbar: Clicks search result item
    alt Folder Result
        Navbar->>Router: Navigates to /drive/folder/:folderId
    else File Result
        Navbar->>Router: Navigates to parent folder + opens FilePreviewDialog
    end
```

---

### Flow 7 — Soft-Delete, Trash Partition, and Restore Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as FileListComponent / TrashComponent
    participant FS as FileService
    participant APIGW as HTTP API Gateway
    participant DelLambda as delete-file.ts
    participant RestoreLambda as restore-file.ts
    participant DDB as DynamoDB (MetadataTable)

    rect rgb(240, 248, 255)
    note right of UI: Phase 1: Soft-Delete to Trash
    User->>UI: Clicks "Delete File" -> ConfirmDialog
    UI->>FS: deleteFile(fileId)
    FS->>APIGW: DELETE /files/{fileId}
    APIGW->>DelLambda: Invokes DeleteFileFn
    DelLambda->>DDB: TransactWriteCommand:
    Note over DelLambda,DDB: 1. Delete from PK: USER#uid#FOLDER#fid, SK: FILE#fid<br/>2. Put into PK: TRASH#uid, SK: FILE#fid (sets deletedAt, originalPK, ttl)
    DelLambda-->>FS: 200 OK { message: 'File deleted' }
    FS->>FS: Removes from files() & bumps trashVersion() signal
    end

    rect rgb(255, 250, 240)
    note right of UI: Phase 2: Restoring from Trash
    User->>UI: Navigates to /drive/trash & clicks "Restore"
    UI->>FS: restoreFile(fileId)
    FS->>APIGW: POST /files/{fileId}/restore {}
    APIGW->>RestoreLambda: Invokes RestoreFileFn
    RestoreLambda->>DDB: GetItem from TRASH#uid (retrieves originalPK)
    RestoreLambda->>DDB: TransactWriteCommand:
    Note over RestoreLambda,DDB: 1. Delete from TRASH#uid<br/>2. Put back to originalPK (clears deletedAt & ttl, restores GSI1)
    RestoreLambda-->>FS: 200 OK { message: 'File restored', file: FileItem }
    FS->>FS: Removes from trashFiles() & updates files() if active folder matches
    end
```

---

### Flow 8 — Share Link Creation & Public Download

```mermaid
sequenceDiagram
    autonumber
    actor Owner
    actor PublicUser
    participant UI as ShareDialog / ShareDownloadComponent
    participant ShareSvc as ShareService
    participant APIGW as HTTP API Gateway
    participant CreateLambda as create-share.ts
    participant GetLambda as get-share.ts
    participant DownloadLambda as download-share.ts
    participant DDB as DynamoDB (MetadataTable)
    participant S3 as Amazon S3 Bucket

    Owner->>UI: Creates share (opts: expiry, password, max downloads)
    UI->>ShareSvc: createShare(fileId, opts)
    ShareSvc->>APIGW: POST /files/{id}/share (Auth: Bearer)
    APIGW->>CreateLambda: Invokes CreateShareFn
    CreateLambda->>DDB: PutItem SHARE#{token} (hashed password, ttl)
    CreateLambda-->>ShareSvc: 201 Created { shareToken, shareUrl }

    PublicUser->>UI: Visits shareUrl (/share/:token)
    UI->>ShareSvc: getShareMeta(token)
    ShareSvc->>APIGW: GET /share/{token} (NO Auth)
    APIGW->>GetLambda: Invokes GetShareFn
    GetLambda->>DDB: Rate limit check -> GetItem SHARE#{token}
    GetLambda-->>ShareSvc: 200 OK { fileName, fileSize, passwordProtected }

    PublicUser->>UI: Enters password & clicks "Download"
    UI->>ShareSvc: downloadShare(token, password)
    ShareSvc->>APIGW: POST /share/{token}/download (NO Auth)
    APIGW->>DownloadLambda: Invokes DownloadShareFn
    DownloadLambda->>DDB: Rate limit check -> verify PBKDF2 hash -> Atomic increment downloadCount
    DownloadLambda->>S3: Generate presigned GET URL
    DownloadLambda-->>ShareSvc: 200 OK { downloadUrl, fileName }
    ShareSvc->>PublicUser: Triggers browser download
```

---

### Flow 9 — File Version History & Rollback

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as VersionHistoryDialog
    participant FileSvc as FileService
    participant APIGW as HTTP API Gateway
    participant ListLambda as list-versions.ts
    participant RollbackLambda as rollback-version.ts
    participant DDB as DynamoDB (MetadataTable)
    participant S3 as Amazon S3 Bucket

    User->>UI: Opens "Version History" for a file
    UI->>FileSvc: listVersions(fileId)
    FileSvc->>APIGW: GET /files/{id}/versions
    APIGW->>ListLambda: Invokes ListVersionsFn
    ListLambda->>DDB: Query GSI1 for s3Key
    ListLambda->>S3: ListObjectVersionsCommand(s3Key)
    S3-->>ListLambda: Returns all versions
    ListLambda-->>FileSvc: 200 OK { versions }

    User->>UI: Clicks "Restore" on an older version
    UI->>FileSvc: rollbackVersion(fileId, versionId)
    FileSvc->>APIGW: POST /files/{id}/rollback { versionId }
    APIGW->>RollbackLambda: Invokes RollbackVersionFn
    RollbackLambda->>S3: CopyObjectCommand (copy old version to latest)
    RollbackLambda->>DDB: UpdateItem (fileSize, updatedAt)
    RollbackLambda-->>FileSvc: 200 OK { message: 'Rolled back', file }
    FileSvc->>UI: Refreshes file list and closes dialog
```

---

### Flow 10 — Thumbnail Generation Pipeline

```mermaid
sequenceDiagram
    autonumber
    participant S3 as Amazon S3 Bucket
    participant Lambda as generate-thumbnail.ts
    participant DDB as DynamoDB (MetadataTable)

    note over S3, Lambda: Asynchronous Pipeline (Not an API Route)
    S3->>Lambda: S3 Event Notification (s3:ObjectCreated:Put)
    Lambda->>S3: GetObjectCommand (fetch original image)
    Lambda->>Lambda: Sharp resize to .webp thumbnail
    Lambda->>S3: PutObjectCommand (upload thumbnail to /thumbnails prefix)
    Lambda->>DDB: UpdateItem (SET thumbnailKey = ...)
```
