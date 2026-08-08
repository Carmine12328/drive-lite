# Architecture Decisions

This document explains the key architectural decisions made for Google Drive Lite.

## 1. Presigned URLs over Lambda Proxy Uploads

**Decision**: Use S3 presigned URLs for file uploads/downloads instead of proxying through Lambda.

**Why**:
- Lambda has a 6 MB payload limit (10 MB for API Gateway) — unsuitable for file uploads
- Presigned URLs allow direct client-to-S3 transfer, reducing latency and cost
- Lambda only generates the URL (milliseconds), while the actual transfer happens directly
- Supports files up to 5 GB with a single PUT operation
- This is the #1 AWS best practice for file uploads

## 2. Single-Table DynamoDB Design

**Decision**: Store all entities (users, folders, files) in a single DynamoDB table.

**Why**:
- Reduces the number of AWS resources to manage
- Enables efficient queries using composite keys (PK/SK pattern)
- All access patterns served by the table + one GSI
- Demonstrates advanced DynamoDB modeling skills

## 3. HTTP API over REST API (API Gateway)

**Decision**: Use API Gateway HTTP API instead of REST API.

**Why**:
- Up to 71% cheaper than REST API
- Lower latency
- Native JWT authorizer support (no custom Lambda authorizer needed)
- Sufficient for our use case (no need for request validation, WAF, or caching at the gateway level)

## 4. Dual Authentication Flow

**Decision**: Implement both custom Angular forms and Cognito Hosted UI.

**Why**:
- Demonstrates understanding of both approaches
- Custom forms: full control over UX and branding
- Hosted UI: near-zero frontend code, built-in social login support
- Both produce identical JWTs from the same Cognito User Pool
- Great interview talking point for trade-off analysis

## 5. LocalStack for Development

**Decision**: Use LocalStack for local development, deploy to AWS only at the end.

**Why**:
- No AWS costs during development
- Fast iteration cycles (no deployment wait)
- Full stack testing locally
- Easy for other developers to set up
