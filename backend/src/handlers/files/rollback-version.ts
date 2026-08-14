import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { ValidationError } from '../../types';
import type { RollbackVersionRequest, RollbackVersionResponse } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';
import { success, error } from '../../lib/response';
import { parseBody, getUserId } from '../../lib/validators';
import { userPK, fileSK } from '../../lib/keys';

/**
 * Rolls back a file to a specific S3 version by creating a copy of that version as the latest.
 * @param event The API Gateway event
 * @returns Details of the rolled-back version
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const fileId = event.pathParameters?.id;
    if (!fileId) {
      throw new ValidationError('File ID is required', 400);
    }

    const body = parseBody<RollbackVersionRequest>(event);
    if (!body?.versionId || typeof body.versionId !== 'string') {
      throw new ValidationError('versionId is required', 400);
    }

    const versionId = body.versionId.trim();
    if (!versionId) {
      throw new ValidationError('versionId cannot be empty', 400);
    }

    // 1. Fetch file record from DynamoDB to verify ownership and obtain keys
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

    const s3Key = file['s3Key'] as string;

    // 2. Perform S3 CopyObject to duplicate the target version as the latest object
    // Format: bucket/key?versionId=XYZ
    const copySource = `${config.BUCKET_NAME}/${encodeURIComponent(s3Key)}?versionId=${encodeURIComponent(versionId)}`;

    await s3Client.send(new CopyObjectCommand({
      Bucket: config.BUCKET_NAME,
      Key: s3Key,
      CopySource: copySource
    }));

    // 3. Retrieve new object details (size and etag)
    const head = await s3Client.send(new HeadObjectCommand({
      Bucket: config.BUCKET_NAME,
      Key: s3Key
    }));

    const newSize = head.ContentLength ?? (file['fileSize'] as number);
    const newEtag = head.ETag ? head.ETag.replace(/"/g, '') : (file['etag'] as string | undefined);
    const now = new Date().toISOString();

    // 4. Update DynamoDB with updated file size and timestamp
    await docClient.send(new UpdateCommand({
      TableName: config.TABLE_NAME,
      Key: {
        PK: file.PK,
        SK: file.SK
      },
      UpdateExpression: 'SET fileSize = :size, updatedAt = :now, etag = :etag',
      ExpressionAttributeValues: {
        ':size': newSize,
        ':now': now,
        ':etag': newEtag ?? null
      }
    }));

    const responseData: RollbackVersionResponse = {
      message: 'Version rolled back successfully',
      fileId,
      versionId,
      fileSize: newSize,
      updatedAt: now
    };

    return success(200, responseData);
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('RollbackVersion error:', err);
    return error(500, 'Internal server error');
  }
};
