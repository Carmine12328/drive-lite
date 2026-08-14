import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError, ShareLinkItem } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { sharePK, shareSK } from '../../lib/keys';

const TOKEN_REGEX = /^[0-9a-f]{64}$/i;

/**
 * Revokes an active share link created by the authenticated user.
 *
 * @param event The API Gateway event
 * @returns Success message
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const token = event.pathParameters?.['token'];
    if (!token || !TOKEN_REGEX.test(token)) {
      throw new ValidationError('Valid share token is required', 400);
    }

    const result = await docClient.send(new GetCommand({
      TableName: config.TABLE_NAME,
      Key: {
        PK: sharePK(token),
        SK: shareSK(),
      },
    }));

    const share = result.Item as ShareLinkItem | undefined;
    if (!share) {
      return error(404, 'Share link not found');
    }

    if (share.userId !== userId) {
      return error(403, 'Forbidden: you do not own this share link');
    }

    await docClient.send(new DeleteCommand({
      TableName: config.TABLE_NAME,
      Key: {
        PK: sharePK(token),
        SK: shareSK(),
      },
    }));

    return success(200, { message: 'Share link revoked successfully', shareToken: token });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('RevokeShare error:', err);
    return error(500, 'Internal server error');
  }
};
