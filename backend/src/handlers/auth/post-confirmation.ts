import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { userPK, profileSK, folderSK } from '../../lib/keys';

/**
 * Cognito Post-Confirmation trigger handler.
 * Creates user profile and ROOT folder.
 * @param event The Cognito trigger event
 * @returns The trigger event
 */
export const handler = async (event: PostConfirmationTriggerEvent): Promise<PostConfirmationTriggerEvent> => {
  try {
    const userId = event.request.userAttributes.sub;
    const email = event.request.userAttributes.email;
    const now = new Date().toISOString();

    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: config.TABLE_NAME,
            Item: {
              PK: userPK(userId),
              SK: profileSK(),
              entityType: 'USER_PROFILE',
              userId,
              email,
              createdAt: now,
              updatedAt: now
            },
            ConditionExpression: 'attribute_not_exists(PK)'
          }
        },
        {
          Put: {
            TableName: config.TABLE_NAME,
            Item: {
              PK: userPK(userId),
              SK: folderSK('ROOT'),
              GSI1PK: userPK(userId),
              GSI1SK: folderSK('ROOT'),
              entityType: 'FOLDER',
              folderId: 'ROOT',
              folderName: 'My Drive',
              parentFolderId: 'ROOT',
              userId,
              createdAt: now,
              updatedAt: now
            },
            ConditionExpression: 'attribute_not_exists(PK)'
          }
        }
      ]
    }));
    
    console.log(`Successfully initialized profile and ROOT folder for user ${userId}`);
  } catch (err) {
    console.error('PostConfirmation error:', err);
  }
  
  return event;
};
