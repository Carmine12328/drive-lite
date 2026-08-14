# infra/lib — README

## What this module does

AWS CDK v2 (TypeScript) constructs that define the entire Drive Lite cloud
infrastructure. Each construct is a logical grouping of related AWS resources.
They are composed in `drive-lite-stack.ts` in dependency order.

## Construct Map

| File | Construct | AWS resources created |
|:-----|:----------|:----------------------|
| `drive-lite-stack.ts` | `DriveLiteStack` | **Root stack** — composes all four constructs below; exports CloudFormation outputs (API URL, User Pool ID, etc.) |
| `storage-construct.ts` | `StorageConstruct` | DynamoDB table (single-table, PAY_PER_REQUEST, PITR in prod) + S3 bucket (versioned, CORS for presigned URLs) |
| `auth-construct.ts` | `AuthConstruct` | Cognito User Pool + App Client (custom auth + Hosted UI) + `addPostConfirmationTrigger()` method |
| `api-construct.ts` | `ApiConstruct` | HTTP API Gateway (JWT authorizer) + all Lambda functions + IAM grants |
| `frontend-construct.ts` | `FrontendConstruct` | S3 bucket for SPA assets + CloudFront distribution (skipped for LocalStack) |

## Dependency order (critical — do not reorder)

```
StorageConstruct   (no deps)
AuthConstruct      (no deps)
ApiConstruct       (needs table, bucket, userPool, userPoolClient)
auth.addPostConfirmationTrigger(api.postConfirmationHandler)
FrontendConstruct  (no deps, skipped on LocalStack)
```

## Lambda configuration (all handlers)

- Runtime: `NODEJS_20_X`
- Format: ESM (with `createRequire` banner for compatibility)
- Memory: 256 MB
- Timeout: 30 s (default)
- `@aws-sdk/*` externalized (provided by Lambda runtime)
- Environment: `TABLE_NAME`, `BUCKET_NAME`, `REGION`, `ALLOWED_ORIGINS`

## LocalStack vs. AWS

The stack reads `context.localstack` to detect the LocalStack environment.
When `localstack=true`: PITR is disabled, CloudFront is skipped, removal
policies are set to `DESTROY` for easy teardown.

## CDK entry point

`infra/bin/` contains the app entry file that instantiates `DriveLiteStack`.
