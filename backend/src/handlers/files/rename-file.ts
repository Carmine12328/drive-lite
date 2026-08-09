import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError } from '../../types';
import type { RenameRequest } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { parseBody, getUserId, validateName } from '../../lib/validators';
import { userPK, fileSK } from '../../lib/keys';

/**
 * Renames a file.
 * @param event The API Gateway event
 * @returns The API Gateway response
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const fileId = event.pathParameters?.id;
    if (!fileId) {
      throw new ValidationError('File ID is required', 400);
    }

    const body = parseBody<RenameRequest>(event);
    const name = validateName(body.name);

    const queryResult = await docClient.send(new QueryCommand({
      TableName: config.TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: {
        ':pk': userPK(userId),
        ':sk': fileSK(fileId)
      }
    }));

    const file = queryResult.Items?.[0];
    if (!file) {
      return error(404, 'File not found');
    }

    await docClient.send(new UpdateCommand({
      TableName: config.TABLE_NAME,
      Key: {
        PK: file.PK,
        SK: file.SK
      },
      UpdateExpression: 'SET fileName = :name, updatedAt = :now',
      ExpressionAttributeValues: {
        ':name': name,
        ':now': new Date().toISOString()
      }
    }));

    return success(200, { message: 'File renamed', fileId, fileName: name });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('RenameFile error:', err);
    return error(500, 'Internal server error');
  }
};
