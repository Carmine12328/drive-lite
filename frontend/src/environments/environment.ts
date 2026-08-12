/**
 * Development environment configuration.
 *
 * Points at LocalStack for local S3/API Gateway emulation.
 * Cognito IDs are placeholders — replaced by `scripts/setup-cognito.ps1`
 * with real LocalStack-provisioned values.
 *
 * `cognitoEndpoint` is only used in development to point the Cognito SDK
 * at LocalStack. In production, the SDK uses the default AWS endpoint.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001',
  /** cognito-local emulator endpoint — only used in development. */
  cognitoEndpoint: 'http://localhost:9230',
  cognitoUserPoolId: 'local_2pCY7F9w',
  cognitoClientId: 'bice54whn8cah326zmnu9fd8z',
  cognitoAuthDomain: 'placeholder.auth.us-east-1.amazoncognito.com',
  s3Bucket: 'drive-lite-files-dev',
  s3Region: 'us-east-1',
};
