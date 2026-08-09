import { App } from 'aws-cdk-lib';
import { DriveLiteStack } from '../lib/drive-lite-stack';

/** CDK app entry point. */
const app = new App();

new DriveLiteStack(app, 'DriveLiteStack', {
  env: {
    region: app.node.tryGetContext('region') ?? 'us-east-1',
    account: process.env['CDK_DEFAULT_ACCOUNT'] ?? '000000000000', // LocalStack default
  },
  description: 'Drive Lite — Secure Asset Manager (S3, DynamoDB, Cognito, Lambda)',
});
