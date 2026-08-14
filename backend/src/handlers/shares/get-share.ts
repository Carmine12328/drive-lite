import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError, ShareMetaResponse, ShareLinkItem } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { sharePK, shareSK } from '../../lib/keys';
import { enforceRateLimit } from '../../lib/rate-limiter';

const TOKEN_REGEX = /^[0-9a-f]{64}$/i;
const GENERIC_NOT_FOUND = 'This share link is no longer available.';

/**
 * Public handler to retrieve metadata for a share link.
 * Secured by token entropy, rate limiting, and uniform error responses.
 *
 * @param event The API Gateway event (unauthenticated)
 * @returns Metadata for the shared file
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const sourceIp = event.requestContext?.http?.sourceIp ?? '127.0.0.1';
    await enforceRateLimit(sourceIp, 'share-meta', 30);

    const token = event.pathParameters?.['token'];
    if (!token || !TOKEN_REGEX.test(token)) {
      return error(404, GENERIC_NOT_FOUND);
    }

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

    // Uniform failure check for expiration, download limits, and brute-force lock
    const isExpired = new Date(share.expiresAt).getTime() <= Date.now();
    const isMaxReached = share.maxDownloads !== undefined && share.downloadCount >= share.maxDownloads;
    const isLocked = share.failedPasswordAttempts >= 5;

    if (isExpired || isMaxReached || isLocked) {
      return error(404, GENERIC_NOT_FOUND);
    }

    const response: ShareMetaResponse = {
      fileName: share.fileName,
      fileSize: share.fileSize,
      mimeType: share.mimeType,
      passwordProtected: !!share.passwordHash,
      expiresAt: share.expiresAt,
      ...(share.maxDownloads !== undefined ? { maxDownloads: share.maxDownloads } : {}),
      downloadCount: share.downloadCount,
    };

    return success(200, response);
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('GetShare error:', err);
    return error(500, 'Internal server error');
  }
};
