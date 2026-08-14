import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { trashPK, fileSK, folderPK } from '../../lib/keys';

/**
 * Restores a soft-deleted file from the trash back to its original parent folder.
 *
 * Fetches the file item from the TRASH#{userId} partition, removes trash metadata
 * (deletedAt, originalPK, ttl), and uses a DynamoDB transaction to move it back to
 * its original partition (USER#{userId}#FOLDER#{folderId}).
 *
 * @param event The API Gateway event
 * @returns The API Gateway response containing `{ message: string, file: FileItem }`
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const fileId = event.pathParameters?.id;
    if (!fileId) {
      throw new ValidationError('File ID is required', 400);
    }

    const getResult = await docClient.send(new GetCommand({
      TableName: config.TABLE_NAME,
      Key: {
        PK: trashPK(userId),
        SK: fileSK(fileId)
      }
    }));

    const fileItem = getResult.Item;
    if (!fileItem) {
      return error(404, 'File not found in trash');
    }

    const targetPK = fileItem['originalPK'] || folderPK(userId, fileItem['folderId'] || 'ROOT');

    // Remove trash-specific metadata properties
    const restoredItem: Record<string, unknown> = {
      ...fileItem,
      PK: targetPK,
      updatedAt: new Date().toISOString()
    };
    delete restoredItem['deletedAt'];
    delete restoredItem['originalPK'];
    delete restoredItem['ttl'];




    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: config.TABLE_NAME,
            Key: {
              PK: trashPK(userId),
              SK: fileSK(fileId)
            }
          }
        },
        {
          Put: {
            TableName: config.TABLE_NAME,
            Item: restoredItem
          }
        }
      ]
    }));

    return success(200, { message: 'File restored successfully', file: restoredItem });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('RestoreFile error:', err);
    return error(500, 'Internal server error');
  }
};
