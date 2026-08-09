import { S3Client } from '@aws-sdk/client-s3';
import { config } from './config';

/**
 * S3 Client singleton.
 * Uses `forcePathStyle: true` when targeting LocalStack (required for bucket-in-path URLs).
 * Instantiated at module scope for connection reuse across warm Lambda invocations.
 */
export const s3Client = new S3Client({
  region: config.REGION,
  ...(config.LOCALSTACK_ENDPOINT && {
    endpoint: config.LOCALSTACK_ENDPOINT,
    forcePathStyle: true,
  }),
});
