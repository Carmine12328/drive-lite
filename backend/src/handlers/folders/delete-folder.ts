import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, DeleteCommand, TransactWriteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { userPK, folderSK, folderPK, trashPK } from '../../lib/keys';

/**
 * Recursively deletes a folder and its contents.
 * @param userId The ID of the user
 * @param folderId The ID of the folder to delete
 */
async function deleteRecursive(userId: string, folderId: string): Promise<void> {
  // Query all files in this folder
  const filesResult = await docClient.send(new QueryCommand({
    TableName: config.TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': folderPK(userId, folderId),
      ':skPrefix': 'FILE#'
    }
  }));

  const files = filesResult.Items || [];
  
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  
  const BATCH_SIZE = 10;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(file => {
      return docClient.send(new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: config.TABLE_NAME,
              Key: { PK: file.PK, SK: file.SK }
            }
          },
          {
            Put: {
              TableName: config.TABLE_NAME,
              Item: {
                ...file,
                PK: trashPK(userId),
                SK: file.SK,
                deletedAt: now,
                originalPK: file.PK,
                ttl
              }
            }
          }
        ]
      }));
    }));
  }

  // Query sub-folders
  const subFoldersResult = await docClient.send(new QueryCommand({
    TableName: config.TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': userPK(userId),
      ':skPrefix': 'FOLDER#'
    }
  }));

  const allFolders = subFoldersResult.Items || [];
  const subFolders = allFolders.filter(f => f.parentFolderId === folderId);

  for (const subFolder of subFolders) {
    await deleteRecursive(userId, subFolder.folderId);
  }

  // Delete the folder itself
  await docClient.send(new DeleteCommand({
    TableName: config.TABLE_NAME,
    Key: {
      PK: userPK(userId),
      SK: folderSK(folderId)
    }
  }));
}

/**
 * Deletes a folder and all its contents.
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

    if (folderId === 'ROOT') {
      return error(400, 'Cannot delete root folder');
    }

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

    await deleteRecursive(userId, folderId);

    return success(200, { message: 'Folder deleted' });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('DeleteFolder error:', err);
    return error(500, 'Internal server error');
  }
};
