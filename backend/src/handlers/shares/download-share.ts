import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ValidationError, ShareLinkItem, DownloadShareRequest, DownloadShareResponse } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';
import { success, error } from '../../lib/response';
import { sharePK, shareSK } from '../../lib/keys';
import { enforceRateLimit } from '../../lib/rate-limiter';
import { verifyPassword } from '../../lib/password';

const TOKEN_REGEX = /^[0-9a-f]{64}$/i;
const GENERIC_NOT_FOUND = 'This share link is no longer available.';

/**
 * Public handler to request a download URL for a shared file.
 * Handles password verification, download limit enforcement, and brute-force lockout.
 *
 * @param event The API Gateway event (unauthenticated)
 * @returns Presigned S3 download URL and file name
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const sourceIp = event.requestContext?.http?.sourceIp ?? '127.0.0.1';
    await enforceRateLimit(sourceIp, 'share-download', 10);

    const token = event.pathParameters?.['token'];
    if (!token || !TOKEN_REGEX.test(token)) {
      return error(404, GENERIC_NOT_FOUND);
    }

    // 1. Fetch share record
    const result = await docClient.send(new GetCommand({
      TableName: config.TABLE_NAME,
      Key: {
        PK: sharePK(token),
        SK: shareSK(),
      },
    }));

    const share = result.Item as ShareLinkItem | undefined;
    if (!share) {
      return error(404, GENERIC_NOT_FOUND);
    }

    // 2. Uniform failure check
    const isExpired = new Date(share.expiresAt).getTime() <= Date.now();
    const isMaxReached = share.maxDownloads !== undefined && share.downloadCount >= share.maxDownloads;
    const isLocked = share.failedPasswordAttempts >= 5;

    if (isExpired || isMaxReached || isLocked) {
      return error(404, GENERIC_NOT_FOUND);
    }

    // 3. Password verification
    if (share.passwordHash && share.salt) {
      let body: DownloadShareRequest = {};
      if (event.body) {
        try {
          const decoded = event.isBase64Encoded
            ? Buffer.from(event.body, 'base64').toString('utf-8')
            : event.body;
          body = JSON.parse(decoded) as DownloadShareRequest;
        } catch {
          throw new ValidationError('Request body must be valid JSON', 400);
        }
      }

      if (!body.password) {
        return error(403, 'Password required');
      }

      const isValid = verifyPassword(body.password, share.passwordHash, share.salt);
      if (!isValid) {
        // Atomic increment failed password counter
        await docClient.send(new UpdateCommand({
          TableName: config.TABLE_NAME,
          Key: {
            PK: sharePK(token),
            SK: shareSK(),
          },
          UpdateExpression: 'SET failedPasswordAttempts = if_not_exists(failedPasswordAttempts, :zero) + :one',
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
          },
        }));
        return error(403, 'Invalid password');
      }

      // Reset failed attempts on successful password verification if previously > 0
      if (share.failedPasswordAttempts > 0) {
        await docClient.send(new UpdateCommand({
          TableName: config.TABLE_NAME,
          Key: {
            PK: sharePK(token),
            SK: shareSK(),
          },
          UpdateExpression: 'SET failedPasswordAttempts = :zero',
          ExpressionAttributeValues: {
            ':zero': 0,
          },
        }));
      }
    }

    // 4. Atomic increment downloadCount
    try {
      const updateParams: {
        TableName: string;
        Key: Record<string, unknown>;
        UpdateExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
        ConditionExpression?: string;
      } = {
        TableName: config.TABLE_NAME,
        Key: {
          PK: sharePK(token),
          SK: shareSK(),
        },
        UpdateExpression: 'SET downloadCount = if_not_exists(downloadCount, :zero) + :one',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':one': 1,
        },
      };

      if (share.maxDownloads !== undefined) {
        updateParams.ConditionExpression = 'attribute_not_exists(maxDownloads) OR downloadCount < :max';
        updateParams.ExpressionAttributeValues[':max'] = share.maxDownloads;
      }

      await docClient.send(new UpdateCommand(updateParams));
    } catch (updateErr: unknown) {
      if ((updateErr as { name?: string }).name === 'ConditionalCheckFailedException') {
        return error(404, GENERIC_NOT_FOUND);
      }
      throw updateErr;
    }

    // 5. Generate presigned S3 download URL
    const command = new GetObjectCommand({
      Bucket: config.BUCKET_NAME,
      Key: share.s3Key,
      ResponseContentDisposition: `attachment; filename="${share.fileName}"`,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const response: DownloadShareResponse = {
      downloadUrl,
      fileName: share.fileName,
    };

    return success(200, response);
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('DownloadShare error:', err);
    return error(500, 'Internal server error');
  }
};
