/**
 * Development environment configuration.
 *
 * Points at LocalStack for local S3/API Gateway emulation.
 * Cognito IDs are placeholders — replaced with real values once the
 * infra stack is deployed locally via CDK + LocalStack.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:4566',
  cognitoUserPoolId: 'us-east-1_PLACEHOLDER',
  cognitoClientId: 'PLACEHOLDER_CLIENT_ID',
  cognitoAuthDomain: 'placeholder.auth.us-east-1.amazoncognito.com',
  s3Bucket: 'drive-lite-files-dev',
  s3Region: 'us-east-1',
};
