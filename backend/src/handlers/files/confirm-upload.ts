import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { ValidationError } from '../../types';
import type { ConfirmUploadRequest } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';
import { success, error } from '../../lib/response';
import { parseBody, getUserId } from '../../lib/validators';
import { userPK, fileSK } from '../../lib/keys';

/**
 * Confirms a file upload.
 * @param event The API Gateway event
 * @returns The API Gateway response
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const body = parseBody<ConfirmUploadRequest>(event);
    const fileId = body.fileId;

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

    if (file.uploadStatus !== 'PENDING') {
      return error(409, 'File upload already confirmed or failed');
    }

    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: config.BUCKET_NAME,
        Key: file.s3Key
      }));
    } catch (s3Err: unknown) {
      const errName = s3Err instanceof Error ? s3Err.name : '';
      if (errName === 'NotFound' || errName === 'NoSuchKey') {
        return error(404, 'File not found in storage');
      }
      throw s3Err;
    }

    await docClient.send(new UpdateCommand({
      TableName: config.TABLE_NAME,
      Key: {
        PK: file.PK,
        SK: file.SK
      },
      UpdateExpression: 'SET uploadStatus = :status, updatedAt = :now',
      ExpressionAttributeValues: {
        ':status': 'COMPLETED',
        ':now': new Date().toISOString()
      }
    }));

    return success(200, { message: 'Upload confirmed', fileId });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('ConfirmUpload error:', err);
    return error(500, 'Internal server error');
  }
};
