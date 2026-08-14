# Backend — AWS Lambda / TypeScript

You are an expert in AWS serverless development with Lambda, API Gateway,
DynamoDB, S3, and Cognito. You write secure, performant, and cost-efficient
backend code following AWS Well-Architected Framework principles.

See §4 (Code Quality Standards) in `AGENTS.md` for general TypeScript quality
rules (no `any`, strict checking, error handling). This file covers
backend-specific conventions.

---

## General

- All backend code is **ESM** (`"type": "module"` in `package.json`). Use
  `import`/`export` exclusively — never `require()`.
- Target **ES2022** to match the `tsconfig.json` and Node.js 20 runtime.

## Lambda Handlers

- **One handler per file.** Each Lambda function lives in its own file under
  `src/handlers/<domain>/`. Do not bundle multiple handlers into a single file.
- Export the handler as a **named export** (`export const handler = ...`), not a
  default export, for clarity and tree-shaking.
- Keep handlers thin — extract business logic into `src/lib/` utilities.
  Handlers should only: parse input → call logic → return response.
- Always type handler parameters with `@types/aws-lambda` event types
  (e.g., `APIGatewayProxyEventV2`, `PostConfirmationTriggerEvent`). Never use
  `any` for events or context.
- Return responses using a shared response builder (`src/lib/response.ts`) for
  consistent status codes, headers, and CORS configuration.

## AWS SDK v3

- Use **AWS SDK v3** modular clients (`@aws-sdk/client-*`). Never import from
  the monolithic `aws-sdk` v2 package.
- **Instantiate SDK clients outside the handler** (module scope) so they are
  reused across warm invocations. Create shared client singletons in
  `src/lib/` (e.g., `dynamo-client.ts`, `s3-client.ts`).
- Use the **DynamoDB Document Client** (`@aws-sdk/lib-dynamodb`) with the
  `DynamoDBDocumentClient.from()` pattern for automatic marshalling.
- Use `@aws-sdk/s3-request-presigner` for generating presigned URLs. Never
  stream file contents through Lambda — always use presigned URLs for direct
  S3 upload/download.

## DynamoDB

- Follow the project's **single-table design**. All entities (files, folders,
  user metadata) share one table with composite keys (`PK`, `SK`).
- Use **consistent key naming**: `PK` and `SK` for the base table, `GSI1PK` and
  `GSI1SK` for global secondary indexes.
- Use `ulid` (already installed) for generating sortable unique IDs. Do not use
  `uuid` — ULIDs are lexicographically sortable, which benefits DynamoDB range
  queries.
- Always scope queries to the authenticated user's `sub` (from the JWT
  authorizer context) to enforce tenant isolation.
- Prefer `Query` over `Scan`. A `Scan` on a production table is almost always
  wrong — flag it and propose a GSI or query-based alternative.
- Use `ConditionExpression` for idempotent writes (e.g., `attribute_not_exists`
  on `PutItem` to prevent overwrites).
- Use `BatchWriteItem` for bulk operations (e.g., recursive folder deletion),
  and handle `UnprocessedItems` with exponential backoff.

## Error Handling

- Return structured error responses with appropriate HTTP status codes:
  - `400` — validation failures, malformed input
  - `403` — authorization failures (user doesn't own the resource)
  - `404` — resource not found
  - `409` — conflict (e.g., duplicate name)
  - `500` — unexpected server errors (log the full error, return a generic
    message to the client)
- Log errors with `console.error()` including the error object. CloudWatch
  captures Lambda `stdout`/`stderr` automatically — no external logger needed.
- Include request context in error logs (handler name, user sub, relevant IDs)
  to make CloudWatch debugging feasible.

## Input Validation

- Validate **all** input at the handler boundary using `src/lib/validators.ts`.
  Never trust API Gateway to validate beyond basic schema matching.
- Validate path parameters, query parameters, and request body fields. Check
  for required fields, correct types, and sane ranges (e.g., file name length,
  allowed characters).
- Sanitize file and folder names to prevent path traversal and injection
  attacks. Strip or reject names containing `..`, `/`, `\`, null bytes, or
  control characters.
- Return `400` with a descriptive error message for validation failures. Never
  let invalid data reach DynamoDB or S3.

## Environment Variables & Configuration

- All runtime configuration (table names, bucket names, region, Cognito pool
  IDs) must come from **environment variables** set by CDK. Never hardcode ARNs,
  table names, or bucket names.
- Access environment variables through a typed config object or validated
  accessor, not raw `process.env` scattered throughout handler code.
- Fail fast at module load time if a required environment variable is missing.
  A clear error at cold start is better than a cryptic runtime failure.

## Security

- **Always extract the user identity** from the API Gateway JWT authorizer
  context (`event.requestContext.authorizer.jwt.claims.sub`). Never trust a
  user ID sent in the request body or query parameters.
- Presigned URLs must be **scoped to the user's S3 prefix**
  (`users/{sub}/files/{fileId}`). Never generate a presigned URL for a path the
  user doesn't own.
- Set presigned URL expiration to the **shortest viable duration** (e.g., 5–15
  minutes for uploads, 1 hour for downloads).
- Never return raw AWS error details to the client. Map SDK exceptions to
  user-friendly messages.

## Testing (Vitest)

- Use **Vitest** for all backend tests. Test files live alongside source files
  or in a `__tests__/` directory, with the `.test.ts` extension.
- Mock AWS SDK clients using Vitest's `vi.mock()`. Do not make real AWS calls in
  unit tests.
- Test handler logic through the handler function directly — pass in typed mock
  events and assert on the response shape, status code, and body.
- Cover: happy paths, validation failures, authorization checks, not-found
  cases, and SDK error propagation.
- Run `npm run test` (which executes `vitest run`) to validate changes.

## Code Organization

```
backend/src/
├── handlers/           # One file per Lambda — thin request/response layer
│   ├── folders/        # CRUD operations for folders
│   ├── files/          # CRUD + presigned URL operations for files
│   └── auth/           # Cognito trigger handlers
├── lib/                # Shared utilities (SDK clients, response builder, validators)
└── types/              # Shared TypeScript types and interfaces
```

- Do not create deeply nested abstractions. The backend is intentionally flat:
  handlers call `lib/` utilities directly.
- Shared types go in `src/types/index.ts`. Handler-specific types can live in
  the handler file if they are not reused.

## Documentation Synchronization (Mandatory)

Whenever adding, updating, or removing Lambda handlers, DynamoDB key patterns, or S3 operations:
- Update `docs/backend-handlers-and-architecture.md` with the new/modified handler specifications, DynamoDB queries, transaction boundaries, and IAM requirements.
- Update `docs/api-routes-and-communication-matrix.md` with the updated route paths, HTTP schemas, and frontend caller mapping.

