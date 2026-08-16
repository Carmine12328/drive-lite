import { describe, it, expect, beforeAll } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DriveLiteStack } from '../lib/drive-lite-stack';

/**
 * Snapshot and assertion tests for DriveLiteStack infrastructure.
 */
/**
 * Normalizes template JSON by replacing dynamic Lambda asset zip hashes
 * to ensure deterministic snapshot comparison across operating systems (Linux vs Windows).
 */
function sanitizeTemplate(template: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(template);
  const sanitized = json.replace(/[a-f0-9]{64}\.zip/g, '[ASSET_HASH].zip');
  return JSON.parse(sanitized);
}

describe('DriveLiteStack CDK Infrastructure', () => {
  let defaultTemplate: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new DriveLiteStack(app, 'TestDriveLiteStack');
    defaultTemplate = Template.fromStack(stack);
  });

  it('matches full CloudFormation template snapshot (default environment)', () => {
    expect(sanitizeTemplate(defaultTemplate.toJSON())).toMatchSnapshot();
  });

  it('matches CloudFormation template snapshot for LocalStack context', () => {
    const app = new App({
      context: {
        localstack: 'true',
      },
    });
    const stack = new DriveLiteStack(app, 'TestLocalStack');
    const localTemplate = Template.fromStack(stack);

    expect(sanitizeTemplate(localTemplate.toJSON())).toMatchSnapshot();
  });

  describe('Storage & S3 Construct', () => {
    it('configures S3 bucket with private access and lifecycle rules', () => {
      defaultTemplate.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              AbortIncompleteMultipartUpload: {
                DaysAfterInitiation: 7,
              },
            }),
          ]),
        },
      });
    });

    it('creates single-table DynamoDB table with GSI1 index', () => {
      defaultTemplate.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
        ]),
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: 'GSI1',
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
          }),
        ]),
      });
    });
  });

  describe('API Gateway Construct', () => {
    it('creates HTTP API Gateway with JWT Authorizer', () => {
      defaultTemplate.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        ProtocolType: 'HTTP',
      });

      defaultTemplate.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
        AuthorizerType: 'JWT',
        Name: 'CognitoAuthorizer',
      });
    });

    it('registers presigned upload/download routes on HTTP API', () => {
      defaultTemplate.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'POST /files/upload-url',
      });

      defaultTemplate.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'POST /files/confirm-upload',
      });
    });

    it('configures default stage with rate limiting (10 req/s, 20 burst)', () => {
      defaultTemplate.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        StageName: '$default',
        DefaultRouteSettings: {
          ThrottlingBurstLimit: 20,
          ThrottlingRateLimit: 10,
        },
      });
    });
  });

  describe('Cost Protection & Budget Construct', () => {
    it('creates AWS Budget with 2.50 USD limit and 3 notification rules', () => {
      defaultTemplate.hasResourceProperties('AWS::Budgets::Budget', {
        Budget: {
          BudgetLimit: {
            Amount: 2.5,
            Unit: 'USD',
          },
          BudgetType: 'COST',
          TimeUnit: 'MONTHLY',
        },
        NotificationsWithSubscribers: Match.arrayWith([
          Match.objectLike({
            Notification: {
              ComparisonOperator: 'GREATER_THAN',
              NotificationType: 'ACTUAL',
              Threshold: 80,
              ThresholdType: 'PERCENTAGE',
            },
          }),
          Match.objectLike({
            Notification: {
              ComparisonOperator: 'GREATER_THAN',
              NotificationType: 'FORECASTED',
              Threshold: 100,
              ThresholdType: 'PERCENTAGE',
            },
          }),
          Match.objectLike({
            Notification: {
              ComparisonOperator: 'GREATER_THAN',
              NotificationType: 'ACTUAL',
              Threshold: 100,
              ThresholdType: 'PERCENTAGE',
            },
          }),
        ]),
      });
    });

    it('creates SNS CostAlertTopic and grants budgets.amazonaws.com publish permissions', () => {
      defaultTemplate.hasResourceProperties('AWS::SNS::Topic', {
        DisplayName: 'Drive Lite Cost & Budget Alerts',
      });

      defaultTemplate.hasResourceProperties('AWS::SNS::TopicPolicy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'sns:Publish',
              Principal: {
                Service: 'budgets.amazonaws.com',
              },
            }),
          ]),
        },
      });
    });
  });

  describe('Auth Construct & IAM Roles', () => {
    it('creates Cognito User Pool and Client', () => {
      defaultTemplate.hasResourceProperties('AWS::Cognito::UserPool', {
        UsernameAttributes: ['email'],
      });

      defaultTemplate.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ExplicitAuthFlows: Match.arrayWith(['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']),
      });
    });

    it('creates IAM roles for Lambda execution', () => {
      defaultTemplate.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'lambda.amazonaws.com',
              },
            }),
          ]),
        },
      });
    });
  });
});
