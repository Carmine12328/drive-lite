import { describe, it, expect, beforeAll } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DriveLiteStack } from '../lib/drive-lite-stack';

/**
 * Snapshot and assertion tests for DriveLiteStack infrastructure.
 */
describe('DriveLiteStack CDK Infrastructure', () => {
  let defaultTemplate: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new DriveLiteStack(app, 'TestDriveLiteStack');
    defaultTemplate = Template.fromStack(stack);
  });

  it('matches full CloudFormation template snapshot (default environment)', () => {
    expect(defaultTemplate.toJSON()).toMatchSnapshot();
  });

  it('matches CloudFormation template snapshot for LocalStack context', () => {
    const app = new App({
      context: {
        localstack: 'true',
      },
    });
    const stack = new DriveLiteStack(app, 'TestLocalStack');
    const localTemplate = Template.fromStack(stack);

    expect(localTemplate.toJSON()).toMatchSnapshot();
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

      defaultTemplate.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'POST /files/{id}/download-url',
      });
    });
  });

  describe('Auth Construct & IAM Roles', () => {
    it('creates Cognito User Pool and Client', () => {
      defaultTemplate.hasResourceProperties('AWS::Cognito::UserPool', {
        UsernameAttributes: ['email'],
      });

      defaultTemplate.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ExplicitAuthFlows: Match.arrayWith(['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']),
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
