import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StorageConstruct } from './storage-construct';
import { AuthConstruct } from './auth-construct';
import { ApiConstruct } from './api-construct';
import { FrontendConstruct } from './frontend-construct';

/**
 * Main Drive Lite stack.
 * Composes all infrastructure constructs and wires them together.
 */
export class DriveLiteStack extends Stack {
  /**
   * Initialize DriveLiteStack
   * @param scope - Parent construct
   * @param id - Construct ID
   * @param props - Stack properties
   */
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const isLocalStack = this.node.tryGetContext('localstack') === 'true';
    /** LocalStack is always dev. Otherwise, opt-in via --context dev=true. */
    const isDev = isLocalStack || this.node.tryGetContext('dev') === 'true';

    // 1. Storage (DynamoDB + S3)
    const storage = new StorageConstruct(this, 'Storage', {
      isDevEnvironment: isDev,
    });

    // 2. Auth (Cognito — created before API so JWT authorizer can reference User Pool)
    const auth = new AuthConstruct(this, 'Auth', {
      isDevEnvironment: isDev,
      callbackUrls: ['http://localhost:4200/auth/callback'],
      logoutUrls: ['http://localhost:4200'],
    });

    // 3. API (API Gateway + Lambda functions)
    const api = new ApiConstruct(this, 'Api', {
      table: storage.table,
      bucket: storage.bucket,
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
    });

    // 4. Wire Cognito post-confirmation trigger
    auth.addPostConfirmationTrigger(api.postConfirmationHandler);

    // 5. Frontend hosting (S3 + CloudFront)
    // Skip for LocalStack since CloudFront isn't supported
    let frontend: FrontendConstruct | undefined;
    if (!isLocalStack) {
      frontend = new FrontendConstruct(this, 'Frontend', {
        isDevEnvironment: isDev,
      });
    }

    // --- Stack Outputs ---
    new CfnOutput(this, 'ApiUrl', {
      value: api.api.url ?? 'N/A',
      description: 'API Gateway URL',
    });
    new CfnOutput(this, 'UserPoolId', {
      value: auth.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });
    new CfnOutput(this, 'UserPoolClientId', {
      value: auth.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });
    new CfnOutput(this, 'TableName', {
      value: storage.table.tableName,
      description: 'DynamoDB table name',
    });
    new CfnOutput(this, 'BucketName', {
      value: storage.bucket.bucketName,
      description: 'S3 bucket name',
    });
    if (frontend) {
      new CfnOutput(this, 'CloudFrontUrl', {
        value: `https://${frontend.distribution.distributionDomainName}`,
        description: 'CloudFront distribution URL',
      });
    }
  }
}
