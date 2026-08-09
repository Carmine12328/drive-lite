import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { userPK } from '../../lib/keys';

/**
 * Lists user's folders.
 * @param event The API Gateway event
 * @returns The API Gateway response
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const parentFolderId = event.queryStringParameters?.parentFolderId;

    const queryResult = await docClient.send(new QueryCommand({
      TableName: config.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': userPK(userId),
        ':skPrefix': 'FOLDER#'
      }
    }));

    let folders = queryResult.Items || [];

    if (parentFolderId) {
      folders = folders.filter(item => item.parentFolderId === parentFolderId);
    }

    return success(200, { folders });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('ListFolders error:', err);
    return error(500, 'Internal server error');
  }
};
