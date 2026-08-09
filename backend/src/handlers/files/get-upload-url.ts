import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ulid } from 'ulid';
import { ValidationError } from '../../types';
import type { GetUploadUrlRequest } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';
import { success, error } from '../../lib/response';
import { parseBody, getUserId, validateName, validateFileSize, validateMimeType, validateFolderId } from '../../lib/validators';
import { userPK, folderSK, folderPK, fileSK, s3Key } from '../../lib/keys';

/**
 * Gets a presigned URL for file upload.
 * @param event The API Gateway event
 * @returns The API Gateway response
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const body = parseBody<GetUploadUrlRequest>(event);
    
    const fileName = validateName(body.fileName);
    const fileSize = validateFileSize(body.fileSize);
    const mimeType = validateMimeType(body.mimeType);
    const folderId = validateFolderId(body.folderId);

    if (folderId !== 'ROOT') {
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
    }

    const fileId = ulid();
    const fileS3Key = s3Key(userId, fileId, fileName);
    const now = new Date().toISOString();

    await docClient.send(new PutCommand({
      TableName: config.TABLE_NAME,
      Item: {
        PK: folderPK(userId, folderId),
        SK: fileSK(fileId),
        GSI1PK: userPK(userId),
        GSI1SK: fileSK(fileId),
        entityType: 'FILE',
        fileId,
        fileName,
        fileSize,
        mimeType,
        s3Key: fileS3Key,
        folderId,
        userId,
        uploadStatus: 'PENDING',
        createdAt: now,
        updatedAt: now
      }
    }));

    const command = new PutObjectCommand({
      Bucket: config.BUCKET_NAME,
      Key: fileS3Key,
      ContentType: mimeType,
      ContentLength: fileSize
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    return success(201, { uploadUrl, fileId, s3Key: fileS3Key });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('GetUploadUrl error:', err);
    return error(500, 'Internal server error');
  }
};
