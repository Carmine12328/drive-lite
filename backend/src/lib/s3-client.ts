import { S3Client } from '@aws-sdk/client-s3';
import { config } from './config';

/**
 * S3 Client singleton.
 * Endpoint routing is handled automatically by the SDK v3 via the
 * `AWS_ENDPOINT_URL` env var (auto-injected by LocalStack in local dev).
 * `forcePathStyle` is required when targeting LocalStack — it uses
 * bucket-in-path URLs (`http://host:4566/bucket/key`) rather than
 * virtual-hosted style (`http://bucket.s3.host:4566/key`).
 * Instantiated at module scope for connection reuse across warm Lambda invocations.
 */
export const s3Client = new S3Client({
  region: config.REGION,
  forcePathStyle: config.isLocalStack,
});
