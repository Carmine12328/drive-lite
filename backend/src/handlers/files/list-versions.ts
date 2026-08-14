import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import { ValidationError } from '../../types';
import type { FileVersion, ListVersionsResponse } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { userPK, fileSK } from '../../lib/keys';

/**
 * Lists all S3 object versions for a given file.
 * @param event The API Gateway event
 * @returns List of file versions
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const fileId = event.pathParameters?.id;
    if (!fileId) {
      throw new ValidationError('File ID is required', 400);
    }

    // 1. Fetch file record from DynamoDB to verify ownership and obtain s3Key
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

    // 2. Query S3 for object versions matching the exact s3Key
    const s3Response = await s3Client.send(new ListObjectVersionsCommand({
      Bucket: config.BUCKET_NAME,
      Prefix: s3Key
    }));

    const rawVersions = s3Response.Versions || [];
    const versions: FileVersion[] = rawVersions
      .filter(v => v.Key === s3Key)
      .map(v => ({
        versionId: v.VersionId || 'null',
        lastModified: v.LastModified ? v.LastModified.toISOString() : new Date().toISOString(),
        size: v.Size ?? 0,
        isLatest: v.IsLatest ?? false,
        etag: v.ETag ? v.ETag.replace(/"/g, '') : undefined
      }));

    const responseData: ListVersionsResponse = {
      versions
    };

    return success(200, responseData);
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('ListVersions error:', err);
    return error(500, 'Internal server error');
  }
};
