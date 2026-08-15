import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { userPK, profileSK, folderSK } from '../../lib/keys';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';

/**
 * Initializes the user's profile and ROOT folder in DynamoDB.
 * Idempotent: safe to call repeatedly upon user sign-in or OAuth callback.
 *
 * @param event - The API Gateway event (POST /auth/init-profile)
 * @returns 200 OK with success confirmation
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    let userId: string;
    try {
      userId = getUserId(event);
    } catch {
      // Allow fallback to body userId for dev/proxy compatibility
      if (event.body) {
        try {
          const body = JSON.parse(event.body);
          userId = body.userId;
        } catch {
          return error(400, 'Invalid JSON body');
        }
      } else {
        return error(401, 'Unauthorized');
      }
    }

    if (!userId) {
      return error(400, 'User ID is required');
    }

    let email = (event.requestContext?.authorizer?.jwt?.claims?.['email'] as string) ?? '';
    if (!email && event.body) {
      try {
        const parsed = JSON.parse(event.body);
        email = parsed.email || '';
      } catch {
        // Ignore parse error
      }
    }
    if (!email) {
      email = `${userId}@drive-lite.local`;
    }

    const now = new Date().toISOString();

    try {
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
                updatedAt: now,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
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
                updatedAt: now,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }));
      console.log(`[InitProfile] Initialized profile and ROOT folder for user ${userId}`);
    } catch (dbErr: unknown) {
      const errName = (dbErr as { name?: string })?.name;
      // If items already exist (ConditionalCheckFailed), this is expected and idempotent
      if (errName === 'TransactionCanceledException' || errName === 'ConditionalCheckFailedException') {
        return success(200, { message: 'Profile already initialized' });
      }
      console.error('[InitProfile] TransactWrite error:', dbErr);
      throw dbErr;
    }

    return success(200, { message: 'Profile initialized successfully' });
  } catch (err: unknown) {
    console.error('[InitProfile] Unhandled error:', err);
    return error(500, 'Failed to initialize profile');
  }
};
