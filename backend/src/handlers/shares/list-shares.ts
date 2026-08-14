import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError, ShareLinkItem } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { shareGSI1PK } from '../../lib/keys';

/**
 * Lists all active share links created for a specific file by the authenticated user.
 *
 * @param event The API Gateway event
 * @returns Array of share links for the file
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const fileId = event.pathParameters?.['id'];
    if (!fileId) {
      throw new ValidationError('File ID is required', 400);
    }

    const result = await docClient.send(new QueryCommand({
      TableName: config.TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': shareGSI1PK(userId),
        ':skPrefix': `SHARE#${fileId}#`,
      },
    }));

    const items = (result.Items ?? []) as ShareLinkItem[];
    const now = Date.now();

    // Sanitize: strip passwordHash and salt, compute isExpired
    const shares = items.map((item) => {
      const isExpired = new Date(item.expiresAt).getTime() <= now;
      const isMaxReached = item.maxDownloads !== undefined && item.downloadCount >= item.maxDownloads;
      const isLocked = item.failedPasswordAttempts >= 5;

      return {
        shareToken: item.shareToken,
        shareUrl: `${config.ALLOWED_ORIGINS}/share/${item.shareToken}`,
        fileId: item.fileId,
        fileName: item.fileName,
        fileSize: item.fileSize,
        passwordProtected: !!item.passwordHash,
        expiresAt: item.expiresAt,
        maxDownloads: item.maxDownloads,
        downloadCount: item.downloadCount,
        failedPasswordAttempts: item.failedPasswordAttempts,
        isExpired,
        isMaxReached,
        isLocked,
        createdAt: item.createdAt,
      };
    });

    return success(200, { shares });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('ListShares error:', err);
    return error(500, 'Internal server error');
  }
};
