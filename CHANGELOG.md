# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Phase 0 — Environment Setup ✅

**Commit**: `3c4a3ec` — `chore: Phase 0 — initialize monorepo, Angular 22
frontend, CDK infra, LocalStack config`

#### Added

- **Monorepo structure** — npm workspaces with three packages:
  - `frontend/` — Angular 22 SPA (`@drive-lite/frontend`)
  - `backend/` — AWS Lambda handlers (`@drive-lite/backend`)
  - `infra/` — AWS CDK infrastructure (`@drive-lite/infra`)
- **Frontend scaffolding** — Angular 22.1.0 project initialized with:
  - Standalone component architecture (no NgModules)
  - Vitest configured as the test runner (replacing Karma/Jasmine)
  - Prettier for code formatting
  - Default `App` component with `RouterOutlet`
  - One smoke test (`app.spec.ts`)
- **Backend scaffolding** — `package.json` with ESM (`"type": "module"`) and
  core AWS SDK v3 dependencies pre-installed:
  - `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`
  - `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`
  - `ulid` for sortable unique IDs
  - No handler source files yet (`.gitkeep` placeholder)
- **Infrastructure scaffolding** — CDK project initialized with:
  - `aws-cdk-lib` ^2.150.0 and `constructs` ^10.3.0
  - No stack or construct source files yet (`.gitkeep` placeholders)
- **LocalStack** — `docker-compose.yml` configuring `localstack/localstack`
  with S3, DynamoDB, Lambda, API Gateway, Cognito, IAM, CloudFormation, STS
- **Root configuration**:
  - `.nvmrc` pinning Node.js to `22.22.3`
  - `.editorconfig` (2-space indent, UTF-8, LF)
  - `.gitignore` covering all workspace artifacts
  - `README.md` with architecture overview and setup instructions
- **Documentation**:
  - `docs/architecture.md` — five key architectural decisions documented
  - `IMPLEMENTATION_PLAN.md` — full 5-phase roadmap with API routes, DynamoDB
    schema, component specs, and verification plan
- **Agent rules** — `.agents/AGENTS.md` establishing:
  - Senior full-stack developer persona with project-specific stack
  - Anti-yes-man behavior enforcement
  - Code verification mandate (read before write)
  - Documentation and JSDoc requirements

#### Not Yet Started

- No Lambda handler source code (Phase 1)
- No CDK stack or construct definitions (Phase 1)
- No Angular feature components, services, or routing (Phase 2)
- No Angular Material or design system (Phase 2)
- No authentication integration (Phase 2)
- No file upload/download flows (Phase 3)
- No CI/CD pipeline (Phase 5)
