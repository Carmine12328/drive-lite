# 🗂️ Google Drive Lite — Secure Asset Manager

A production-grade cloud file manager demonstrating AWS best practices: presigned URL uploads, Cognito authentication, single-table DynamoDB design, and a polished Angular frontend.

## 🏗️ Architecture

- **Frontend**: Angular 22 SPA with Angular Material (dark/light theming)
- **Auth**: AWS Cognito with dual sign-up flows (custom forms + hosted UI)
- **API**: API Gateway (HTTP API) + Lambda (Node.js 20, TypeScript)
- **Storage**: S3 (files via presigned URLs) + DynamoDB (single-table metadata)
- **Infra**: AWS CDK (TypeScript) — deploy to us-east-1
- **Dev**: LocalStack (Docker) for local AWS emulation

## 📁 Project Structure

```
drive_lite/
├── frontend/    # Angular 22 SPA
├── backend/     # AWS Lambda functions (TypeScript)
├── infra/       # AWS CDK infrastructure
├── docs/        # Architecture documentation
└── package.json # npm workspace root
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 22.22.3 (see `.nvmrc`)
- **Docker Desktop** (for LocalStack)
- **AWS CLI** (for deployment)
- **AWS CDK CLI** (`npm install -g aws-cdk`)

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start LocalStack
docker compose up -d

# 3. Deploy CDK stack to LocalStack
cd infra && npm run deploy:local

# 4. Start Angular dev server
npm run dev:frontend
```

### AWS Deployment

```bash
# Configure AWS credentials
aws configure

# Deploy all resources
cd infra && npm run deploy
```

## ⭐ Key Patterns

- **Presigned URL Uploads** — Files uploaded directly to S3 (never through Lambda)
- **Dual Auth Flow** — Custom Angular forms + Cognito Hosted UI side by side
- **Single-Table DynamoDB** — All entities in one table with composite keys
- **Infrastructure as Code** — Full CDK stack, reproducible deployments

## 📄 License

MIT
