/**
 * Validated environment configuration.
 * Fails fast at module load time if required variables are missing.
 */
export interface AppConfig {
  TABLE_NAME: string;
  BUCKET_NAME: string;
  REGION: string;
  ALLOWED_ORIGINS: string;
  BEDROCK_ENABLED: boolean;
  BEDROCK_MODEL_ID: string;
  /**
   * True when running inside LocalStack.
   * Detected via `AWS_ENDPOINT_URL` which LocalStack auto-injects into Lambda
   * environments. Used to enable S3 path-style access; endpoint routing is
   * handled automatically by the SDK v3 reading `AWS_ENDPOINT_URL`.
   */
  isLocalStack: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Application configuration loaded from environment variables. */
export const config: AppConfig = Object.freeze({
  TABLE_NAME: requireEnv('TABLE_NAME'),
  BUCKET_NAME: requireEnv('BUCKET_NAME'),
  REGION: process.env['AWS_REGION'] ?? process.env['REGION'] ?? 'us-east-1',
  ALLOWED_ORIGINS: process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:4200',
  BEDROCK_ENABLED: process.env['BEDROCK_ENABLED'] === 'true',
  BEDROCK_MODEL_ID: process.env['BEDROCK_MODEL_ID'] ?? 'amazon.titan-text-lite-v1',
  isLocalStack: !!process.env['AWS_ENDPOINT_URL'],
});

