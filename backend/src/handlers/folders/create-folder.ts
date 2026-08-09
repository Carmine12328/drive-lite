import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { ValidationError } from '../../types';
import type { CreateFolderRequest, FolderItem } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { parseBody, getUserId, validateName, validateFolderId } from '../../lib/validators';
import { userPK, folderSK } from '../../lib/keys';

/**
 * Creates a new folder.
 * @param event The API Gateway event
 * @returns The API Gateway response
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const body = parseBody<CreateFolderRequest>(event);
    const folderName = validateName(body.folderName);
    const parentFolderId = validateFolderId(body.parentFolderId);

    if (parentFolderId !== 'ROOT') {
      const getResult = await docClient.send(new GetCommand({
        TableName: config.TABLE_NAME,
        Key: {
          PK: userPK(userId),
          SK: folderSK(parentFolderId)
        }
      }));
      if (!getResult.Item) {
        return error(404, 'Parent folder not found');
      }
    }

    const folderId = ulid();
    const now = new Date().toISOString();
    
    const folderItem: FolderItem = {
      PK: userPK(userId),
      SK: folderSK(folderId),
      GSI1PK: userPK(userId),
      GSI1SK: folderSK(folderId),
      entityType: 'FOLDER',
      folderId,
      folderName,
      parentFolderId,
      userId,
      createdAt: now,
      updatedAt: now
    };

    await docClient.send(new PutCommand({
      TableName: config.TABLE_NAME,
      Item: folderItem,
      ConditionExpression: 'attribute_not_exists(PK)'
    }));

    return success(201, folderItem);
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('CreateFolder error:', err);
    return error(500, 'Internal server error');
  }
};
