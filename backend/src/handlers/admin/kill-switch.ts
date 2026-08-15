import { SNSEvent } from 'aws-lambda';
import { CloudFormationClient, DeleteStackCommand } from '@aws-sdk/client-cloudformation';

const cfn = new CloudFormationClient({ region: process.env['REGION'] || 'us-east-1' });

/**
 * Kill-Switch Lambda Handler.
 *
 * Triggered automatically via SNS when AWS Budgets detects that spending
 * has exceeded 100% of the monthly budget ($2.50).
 *
 * It initiates a CloudFormation DeleteStack operation to completely
 * tear down all infrastructure and prevent any further billing.
 */
export async function handler(event: SNSEvent): Promise<void> {
  console.warn('🚨 [KILL-SWITCH ACTIVATED] Monthly budget threshold exceeded ($2.50)!');

  for (const record of event.Records) {
    console.warn(`[KILL-SWITCH] SNS Subject: ${record.Sns.Subject}`);
    console.warn(`[KILL-SWITCH] SNS Message: ${record.Sns.Message}`);
  }

  const stackName = process.env['STACK_NAME'] || 'DriveLiteStack';

  try {
    console.warn(`[KILL-SWITCH] Initiating automatic stack teardown for: ${stackName}...`);
    await cfn.send(new DeleteStackCommand({ StackName: stackName }));
    console.warn(`[KILL-SWITCH] DeleteStackCommand sent successfully for: ${stackName}. All resources are being destroyed.`);
  } catch (err) {
    console.error(`[KILL-SWITCH] Failed to execute DeleteStackCommand:`, err);
    throw err;
  }
}
