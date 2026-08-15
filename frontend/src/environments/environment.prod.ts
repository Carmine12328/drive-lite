/**
 * Production environment configuration.
 *
 * All values are empty strings — they are injected at deploy time
 * via CI/CD environment variables or read from CDK stack outputs.
 * The `fileReplacements` entry in angular.json swaps the dev
 * environment file with this one during production builds.
 */
export const environment = {
  production: true,
  apiUrl: '',
  /** Not used in production — SDK uses the default AWS Cognito endpoint. */
  cognitoEndpoint: '',
  cognitoUserPoolId: '',
  cognitoClientId: '',
  cognitoAuthDomain: '',
  s3Bucket: '',
  s3Region: 'us-east-1',
};
