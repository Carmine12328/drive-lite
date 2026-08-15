import * as path from 'path';
import { fileURLToPath } from 'url';
import { Construct } from 'constructs';
import { Duration, Stack } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Properties for BudgetConstruct
 */
export interface BudgetConstructProps {
  /** Target email address for budget alerts */
  alertEmail: string;
  /** Monthly budget limit in USD (default: 2.50) */
  monthlyBudgetUsd?: number;
  /** Whether to enable the automated stack kill-switch on 100% breach (default: true) */
  enableKillSwitch?: boolean;
}

/**
 * Budget & Cost Control Construct.
 *
 * Implements Layer 2 (AWS Monthly Budget + Email Alerts) and Layer 3 (Automated
 * Kill-Switch Lambda that initiates CloudFormation stack teardown upon 100% budget breach).
 */
export class BudgetConstruct extends Construct {
  /** The SNS topic receiving budget threshold alerts */
  public readonly topic: sns.Topic;
  /** The CloudFormation budget resource */
  public readonly budget: budgets.CfnBudget;
  /** The kill-switch Lambda (if enabled) */
  public readonly killSwitchHandler?: NodejsFunction;

  /**
   * Initialize BudgetConstruct
   * @param scope - Parent construct
   * @param id - Construct ID
   * @param props - Construct properties
   */
  constructor(scope: Construct, id: string, props: BudgetConstructProps) {
    super(scope, id);

    const budgetLimit = props.monthlyBudgetUsd ?? 2.5;
    const enableKillSwitch = props.enableKillSwitch ?? true;

    // 1. SNS Topic for Budget Alerts
    this.topic = new sns.Topic(this, 'CostAlertTopic', {
      displayName: 'Drive Lite Cost & Budget Alerts',
    });

    // Grant AWS Budgets permission to publish to the SNS Topic
    this.topic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowBudgetsServiceToPublish',
        principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [this.topic.topicArn],
      })
    );

    // 2. Email Subscription to SNS Topic
    this.topic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));

    // 3. Automated Kill-Switch Lambda (Circuit Breaker)
    if (enableKillSwitch) {
      this.killSwitchHandler = new NodejsFunction(this, 'KillSwitchFn', {
        entry: path.join(__dirname, '../../backend/src/handlers/admin/kill-switch.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 256,
        timeout: Duration.seconds(60),
        environment: {
          STACK_NAME: Stack.of(this).stackName,
          REGION: Stack.of(this).region,
        },
        bundling: {
          format: OutputFormat.ESM,
          mainFields: ['module', 'main'],
          banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
        },
      });

      // Grant permissions to delete this stack upon budget breach
      this.killSwitchHandler.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'cloudformation:DeleteStack',
            'cloudformation:DescribeStacks',
          ],
          resources: [
            Stack.of(this).formatArn({
              service: 'cloudformation',
              resource: 'stack',
              resourceName: `${Stack.of(this).stackName}/*`,
            }),
          ],
        })
      );

      // Subscribe KillSwitch Lambda to the SNS topic
      this.topic.addSubscription(new subscriptions.LambdaSubscription(this.killSwitchHandler));
    }

    // 4. AWS Monthly Budget ($2.50 Limit)
    this.budget = new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `${Stack.of(this).stackName}-MonthlyBudget`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: budgetLimit,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        // Alert 1: 80% of budget reached (Actual spend > $2.00) -> Email alert
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: props.alertEmail,
            },
            {
              subscriptionType: 'SNS',
              address: this.topic.topicArn,
            },
          ],
        },
        // Alert 2: Forecasted spend exceeds 100% ($2.50) -> Email alert
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: props.alertEmail,
            },
            {
              subscriptionType: 'SNS',
              address: this.topic.topicArn,
            },
          ],
        },
        // Alert 3: 100% of budget breached (Actual spend > $2.50) -> Triggers KillSwitch + Email
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: props.alertEmail,
            },
            {
              subscriptionType: 'SNS',
              address: this.topic.topicArn,
            },
          ],
        },
      ],
    });
  }
}
