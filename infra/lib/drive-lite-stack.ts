import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StorageConstruct } from './storage-construct';
import { AuthConstruct } from './auth-construct';
import { ApiConstruct } from './api-construct';
import { FrontendConstruct } from './frontend-construct';
import { BudgetConstruct } from './budget-construct';

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
    const skipCloudFront = isLocalStack || this.node.tryGetContext('skipCloudFront') === 'true';
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

    // 5. Frontend hosting (S3 Static Website or CloudFront)
    let frontend: FrontendConstruct | undefined;
    if (!isLocalStack) {
      frontend = new FrontendConstruct(this, 'Frontend', {
        isDevEnvironment: isDev,
        enableCloudFront: !skipCloudFront,
      });
    }

    // 6. Cost Protection: 3 Layers ($2.50 Budget + Email Alert + Kill-Switch)
    // Skipped for LocalStack since AWS Budgets is a cloud-only service
    if (!isLocalStack) {
      const alertEmail = this.node.tryGetContext('alertEmail') ?? 'carmine12328@gmail.com';
      new BudgetConstruct(this, 'Budget', {
        alertEmail,
        monthlyBudgetUsd: 2.5,
        enableKillSwitch: true,
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
      new CfnOutput(this, 'HostingBucketName', {
        value: frontend.hostingBucket.bucketName,
        description: 'Frontend S3 Hosting Bucket Name',
      });
      new CfnOutput(this, 'WebsiteUrl', {
        value: frontend.websiteUrl,
        description: 'Frontend Website URL',
      });
      if (frontend.distribution) {
        new CfnOutput(this, 'CloudFrontUrl', {
          value: `https://${frontend.distribution.distributionDomainName}`,
          description: 'CloudFront distribution URL',
        });
        new CfnOutput(this, 'CloudFrontDistributionId', {
          value: frontend.distribution.distributionId,
          description: 'CloudFront distribution ID',
        });
      }
    }
  }
}
