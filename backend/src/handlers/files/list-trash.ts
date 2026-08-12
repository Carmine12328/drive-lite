import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { trashPK } from '../../lib/keys';

/**
 * Lists all soft-deleted files for the authenticated user.
 *
 * Queries the TRASH#{userId} partition for all FILE# sort keys.
 * Returns items with `deletedAt` and `originalPK` so the frontend
 * can display deletion timestamps and support restore operations.
 *
 * @param event The API Gateway event
 * @returns The API Gateway response containing `{ files: FileItem[] }`
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);

    const queryResult = await docClient.send(new QueryCommand({
      TableName: config.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': trashPK(userId),
        ':skPrefix': 'FILE#'
      }
    }));

    const files = queryResult.Items || [];

    return success(200, { files });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('ListTrash error:', err);
    return error(500, 'Internal server error');
  }
};
