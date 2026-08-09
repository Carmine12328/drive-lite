import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, DeleteCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ValidationError } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { userPK, fileSK, trashPK } from '../../lib/keys';

/**
 * Deletes a file.
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

    if (file.uploadStatus === 'PENDING') {
      // Hard delete and S3 cleanup
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: config.BUCKET_NAME,
          Key: file.s3Key
        }));
      } catch (s3Err) {
        console.error('Failed to delete pending object from S3', s3Err);
      }
      
      await docClient.send(new DeleteCommand({
        TableName: config.TABLE_NAME,
        Key: {
          PK: file.PK,
          SK: file.SK
        }
      }));
    } else {
      // Soft delete
      const now = new Date().toISOString();
      const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      
      await docClient.send(new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: config.TABLE_NAME,
              Key: {
                PK: file.PK,
                SK: file.SK
              }
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
    }

    return success(200, { message: 'File deleted' });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('DeleteFile error:', err);
    return error(500, 'Internal server error');
  }
};
