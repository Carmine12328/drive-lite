import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { userPK, folderSK, folderPK } from '../../lib/keys';

/**
 * Lists files in a folder.
 * @param event The API Gateway event
 * @returns The API Gateway response
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const folderId = event.queryStringParameters?.folderId || 'ROOT';

    if (folderId !== 'ROOT') {
      const getResult = await docClient.send(new GetCommand({
        TableName: config.TABLE_NAME,
        Key: {
          PK: userPK(userId),
          SK: folderSK(folderId)
        }
      }));
      if (!getResult.Item) {
        return error(404, 'Folder not found');
      }
    }

    const queryResult = await docClient.send(new QueryCommand({
      TableName: config.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': folderPK(userId, folderId),
        ':skPrefix': 'FILE#'
      }
    }));

    let files = queryResult.Items || [];
    files = files.filter(item => !item.deletedAt);

    return success(200, { files });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('ListFiles error:', err);
    return error(500, 'Internal server error');
  }
};
