# Infrastructure — AWS CDK (TypeScript)

You are an expert in AWS CDK (TypeScript) and Infrastructure as Code. You write
secure, maintainable, and least-privilege infrastructure definitions following
AWS Well-Architected Framework principles.

---

## General

- All infra code is **ESM** (`"type": "module"` in `package.json`). Use
  `import`/`export` exclusively, target **ES2022**, strict TypeScript.
- Use **CDK v2** (`aws-cdk-lib`). Never import from individual `@aws-cdk/*` v1
  packages.
- The CDK app entry point uses `npx tsx bin/app.ts` (see `cdk.json`). Do not
  change this to `ts-node` or a compiled `.js` entry point.

## Construct Design

- **One construct per file.** Each logical resource group (auth, storage, API,
  frontend hosting) lives in its own file under `infra/lib/`.
- Name constructs descriptively: `AuthConstruct`, `StorageConstruct`,
  `ApiConstruct`, `FrontendConstruct`. The main stack
  (`drive-lite-stack.ts`) composes them.
- Keep constructs focused on a **single responsibility**. Do not put Cognito,
  DynamoDB, and S3 in the same construct.
- Expose only what downstream constructs need via **public readonly
  properties** (e.g., `table`, `bucket`, `userPool`). Keep internal resources
  private.
- Accept configuration through construct **props interfaces**, not hardcoded
  values. Define a typed `*Props` interface for each construct.

## L2 Constructs & Defaults

- **Prefer L2 constructs** (`aws_s3.Bucket`, `aws_dynamodb.TableV2`) over L1
  (`CfnBucket`). Use L1 only when L2 does not expose a required property.
- Enable **encryption by default**: SSE-S3 for S3 buckets, encryption at rest
  for DynamoDB.
- Enable **`removalPolicy: RemovalPolicy.DESTROY`** for dev/LocalStack stacks
  only. Production stacks should use `RETAIN` or `SNAPSHOT`.
- Block public access on all S3 buckets. Use CloudFront OAI/OAC for frontend
  hosting, presigned URLs for file access.

## Security & IAM

- Follow **least-privilege IAM**. Use CDK's `grant*` methods
  (`bucket.grantReadWrite(lambda)`, `table.grantReadWriteData(lambda)`) instead
  of writing inline IAM policies.
- Never use `iam.PolicyStatement` with `actions: ['*']` or
  `resources: ['*']`. Scope every permission to the specific resource ARN.
- Cognito User Pool Client must **not** have a client secret (required for SPA
  auth flows). Explicitly set `generateSecret: false`.
- JWT Authorizer on API Gateway must validate the `aud` and `iss` claims.

## Lambda Integration

- Use `NodejsFunction` from `aws-cdk-lib/aws-lambda-nodejs` for automatic
  esbuild bundling, or reference pre-compiled `.js` entry points in
  `backend/dist/`.
- Set **runtime** to `Runtime.NODEJS_20_X`. Do not use deprecated runtimes.
- Set reasonable **memory** (256–512 MB) and **timeout** (10–30 seconds) values.
  Do not use defaults (128 MB / 3 seconds) — they are almost always too low for
  SDK calls.
- Pass all runtime configuration (table name, bucket name, Cognito pool ID)
  as **environment variables** on the Lambda function. This is how backend
  handlers consume configuration.

## API Gateway

- Use **HTTP API** (`HttpApi`), not REST API (`RestApi`). HTTP API is cheaper,
  faster, and supports JWT authorizers natively.
- Attach a **Cognito JWT Authorizer** to all routes except health checks.
- Configure **CORS** to allow `localhost:4200` (dev) and the CloudFront domain
  (prod). Do not use `*` for allowed origins in production.

## DynamoDB

- Use **single-table design** with `TableV2` (preferred) or `Table`.
- Define the partition key as `PK` (string) and sort key as `SK` (string).
- Define GSIs (`GSI1PK`/`GSI1SK`) as needed by access patterns. Do not create
  indexes speculatively — add them when a query pattern requires it.
- Set **billing mode** to `PAY_PER_REQUEST` for development. Switch to
  provisioned with auto-scaling for production if cost optimization is needed.

## S3

- Configure **CORS** on the bucket to allow presigned URL uploads from Angular
  origins. Include `PUT` and `GET` methods, and the required headers
  (`Content-Type`, `x-amz-meta-*`).
- Add a lifecycle rule to **abort incomplete multipart uploads** after 7 days.
- Use the object key pattern `users/{userId}/files/{fileId}/{filename}` to
  enforce per-user isolation.

## CloudFront & Frontend Hosting

- Serve the Angular SPA from an S3 bucket behind **CloudFront**.
- Use **OAI** (Origin Access Identity) or **OAC** (Origin Access Control) to
  keep the S3 bucket private.
- Configure **custom error responses** to redirect 403/404 to `/index.html`
  with a 200 status code for SPA client-side routing.

## LocalStack Compatibility

- All constructs must work with **LocalStack** for local development. Avoid CDK
  features that LocalStack does not support (check LocalStack docs when
  uncertain).
- Use `cdklocal deploy` (via `npm run deploy:local`) for LocalStack
  deployments. The standard `cdk deploy` targets real AWS.
- Do not hardcode `us-east-1` or account IDs. Use `Stack.of(this).region` and
  `Stack.of(this).account` for dynamic references.

## Testing (Vitest)

- Use **Vitest** for CDK tests. Test files use the `.test.ts` extension.
- Write **snapshot tests** for each construct: synthesize the stack and compare
  the CloudFormation template against a stored snapshot.
- Write **fine-grained assertion tests** for critical security properties (e.g.,
  "S3 bucket blocks public access", "Lambda has least-privilege IAM role",
  "API Gateway has JWT authorizer").
- Use `Template.fromStack(stack)` from `aws-cdk-lib/assertions` for template
  assertions.
- Run `npm run test` (which executes `vitest run`) to validate changes.

## Code Organization

```
infra/
├── bin/
│   └── app.ts              # CDK app entry point — instantiates the stack
├── lib/
│   ├── drive-lite-stack.ts  # Main stack — composes all constructs
│   ├── auth-construct.ts    # Cognito User Pool, User Pool Client
│   ├── api-construct.ts     # API Gateway, Lambda functions, JWT Authorizer
│   ├── storage-construct.ts # S3 bucket, DynamoDB table
│   └── frontend-construct.ts# S3 static hosting, CloudFront distribution
├── cdk.json                 # CDK app config (uses tsx, feature flags)
├── package.json
└── tsconfig.json
```

- The main stack (`drive-lite-stack.ts`) is the only file that instantiates
  constructs. Constructs do not instantiate other constructs — they receive
  dependencies via props.
- Cross-construct references (e.g., API construct needs the DynamoDB table)
  flow through the main stack: `storageConstruct.table` → passed as a prop to
  `ApiConstruct`.

## Documentation Synchronization (Mandatory)

Whenever adding, updating, or removing CDK constructs, IAM policies, stack outputs, or API routes:
- Update `docs/architecture.md` with construct architecture changes, stack outputs, and Mermaid flow diagrams.
- Update `docs/api-routes-and-communication-matrix.md` with new CDK integration names and IAM permissions.

