import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError } from '../../types';
import type { RenameRequest } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { parseBody, getUserId, validateName } from '../../lib/validators';
import { userPK, folderSK } from '../../lib/keys';

/**
 * Renames a folder.
 * @param event The API Gateway event
 * @returns The API Gateway response
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const folderId = event.pathParameters?.id;
    if (!folderId) {
      throw new ValidationError('Folder ID is required', 400);
    }

    const body = parseBody<RenameRequest>(event);
    const name = validateName(body.name);

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

    const now = new Date().toISOString();
    const updateResult = await docClient.send(new UpdateCommand({
      TableName: config.TABLE_NAME,
      Key: {
        PK: userPK(userId),
        SK: folderSK(folderId)
      },
      UpdateExpression: 'SET folderName = :n, updatedAt = :u',
      ExpressionAttributeValues: {
        ':n': name,
        ':u': now
      },
      ReturnValues: 'ALL_NEW'
    }));

    return success(200, updateResult.Attributes);
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('RenameFolder error:', err);
    return error(500, 'Internal server error');
  }
};
