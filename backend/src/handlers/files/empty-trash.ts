import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ValidationError } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { trashPK } from '../../lib/keys';

/**
 * Permanently deletes all files from the trash partition for the authenticated user.
 *
 * @param event The API Gateway event
 * @returns The API Gateway response containing `{ message: string, deletedCount: number }`
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

    for (const fileItem of files) {
      if (fileItem['s3Key']) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: config.BUCKET_NAME,
            Key: fileItem['s3Key']
          }));
        } catch (s3Err) {
          console.error(`Failed to delete object ${fileItem['s3Key']} from S3 during empty trash`, s3Err);
        }
      }

      await docClient.send(new DeleteCommand({
        TableName: config.TABLE_NAME,
        Key: {
          PK: fileItem['PK'],
          SK: fileItem['SK']
        }
      }));
    }

    return success(200, { message: 'Trash emptied successfully', deletedCount: files.length });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('EmptyTrash error:', err);
    return error(500, 'Internal server error');
  }
};
