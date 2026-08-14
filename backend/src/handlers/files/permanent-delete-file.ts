import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ValidationError } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { trashPK, fileSK } from '../../lib/keys';

/**
 * Permanently deletes a single file from the trash and S3.
 *
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

    if (fileItem['s3Key']) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: config.BUCKET_NAME,
          Key: fileItem['s3Key']
        }));
      } catch (s3Err) {
        console.error('Failed to delete object from S3 during permanent delete', s3Err);
      }
    }

    await docClient.send(new DeleteCommand({
      TableName: config.TABLE_NAME,
      Key: {
        PK: trashPK(userId),
        SK: fileSK(fileId)
      }
    }));

    return success(200, { message: 'File permanently deleted' });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('PermanentDeleteFile error:', err);
    return error(500, 'Internal server error');
  }
};
