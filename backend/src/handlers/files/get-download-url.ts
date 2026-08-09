import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ValidationError } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { userPK, fileSK } from '../../lib/keys';

/**
 * Gets a presigned URL for file download.
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

    if (file.uploadStatus !== 'COMPLETED') {
      return error(400, 'File upload not yet completed');
    }

    const command = new GetObjectCommand({
      Bucket: config.BUCKET_NAME,
      Key: file.s3Key,
      ResponseContentDisposition: `attachment; filename="${file.fileName}"`
    });
    
    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return success(200, { downloadUrl, fileName: file.fileName });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('GetDownloadUrl error:', err);
    return error(500, 'Internal server error');
  }
};
