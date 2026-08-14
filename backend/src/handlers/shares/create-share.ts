import { randomBytes } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError, CreateShareRequest, ShareLinkItem, ShareLinkResponse } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { getUserId, parseBody } from '../../lib/validators';
import { userPK, fileSK, sharePK, shareSK, shareGSI1PK, shareGSI1SK } from '../../lib/keys';
import { hashPassword } from '../../lib/password';

/**
 * Creates a secure, expiring share link for a file.
 * @param event The API Gateway event
 * @returns The API Gateway response with share link details
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const fileId = event.pathParameters?.['id'];
    if (!fileId) {
      throw new ValidationError('File ID is required', 400);
    }

    const body = parseBody<CreateShareRequest>(event);
    const expiresInHours = body.expiresInHours ?? 24;
    if (typeof expiresInHours !== 'number' || !Number.isInteger(expiresInHours) || expiresInHours <= 0 || expiresInHours > 720) {
      throw new ValidationError('expiresInHours must be an integer between 1 and 720 (30 days)', 400);
    }

    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length < 4 || body.password.length > 128) {
        throw new ValidationError('Password must be between 4 and 128 characters', 400);
      }
    }

    if (body.maxDownloads !== undefined) {
      if (typeof body.maxDownloads !== 'number' || !Number.isInteger(body.maxDownloads) || body.maxDownloads <= 0 || body.maxDownloads > 10000) {
        throw new ValidationError('maxDownloads must be a positive integer up to 10,000', 400);
      }
    }

    // 1. Verify file exists and belongs to user
    const queryResult = await docClient.send(new QueryCommand({
      TableName: config.TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: {
        ':pk': userPK(userId),
        ':sk': fileSK(fileId),
      },
    }));

    const file = queryResult.Items?.[0];
    if (!file || file['deletedAt']) {
      return error(404, 'File not found');
    }

    if (file['uploadStatus'] !== 'COMPLETED') {
      return error(400, 'File upload not yet completed');
    }

    // 2. Generate 256-bit entropy token (64 hex chars)
    const shareToken = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresDate = new Date(now.getTime() + expiresInHours * 3600 * 1000);
    const ttl = Math.floor(expiresDate.getTime() / 1000);

    let passwordHash: string | undefined;
    let salt: string | undefined;
    if (body.password) {
      const hashed = hashPassword(body.password);
      passwordHash = hashed.hash;
      salt = hashed.salt;
    }

    const shareItem: ShareLinkItem = {
      PK: sharePK(shareToken),
      SK: shareSK(),
      GSI1PK: shareGSI1PK(userId),
      GSI1SK: shareGSI1SK(fileId, shareToken),
      entityType: 'SHARE_LINK',
      shareToken,
      fileId,
      userId,
      fileName: file['fileName'],
      fileSize: file['fileSize'],
      mimeType: file['mimeType'],
      s3Key: file['s3Key'],
      ...(passwordHash ? { passwordHash, salt } : {}),
      failedPasswordAttempts: 0,
      ...(body.maxDownloads ? { maxDownloads: body.maxDownloads } : {}),
      downloadCount: 0,
      expiresAt: expiresDate.toISOString(),
      ttl,
      createdAt: now.toISOString(),
    };

    await docClient.send(new PutCommand({
      TableName: config.TABLE_NAME,
      Item: shareItem,
    }));

    const shareUrl = `${config.ALLOWED_ORIGINS}/share/${shareToken}`;
    const response: ShareLinkResponse = {
      shareToken,
      shareUrl,
      expiresAt: shareItem.expiresAt,
      passwordProtected: !!passwordHash,
      ...(body.maxDownloads ? { maxDownloads: body.maxDownloads } : {}),
    };

    return success(201, response);
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('CreateShare error:', err);
    return error(500, 'Internal server error');
  }
};
