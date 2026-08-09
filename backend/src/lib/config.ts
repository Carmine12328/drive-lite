/**
 * Validated environment configuration.
 * Fails fast at module load time if required variables are missing.
 */
export interface AppConfig {
  TABLE_NAME: string;
  BUCKET_NAME: string;
  REGION: string;
  ALLOWED_ORIGINS: string;
  LOCALSTACK_ENDPOINT?: string;
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
  LOCALSTACK_ENDPOINT: process.env['LOCALSTACK_ENDPOINT'],
});
