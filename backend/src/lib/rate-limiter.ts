import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './dynamo-client';
import { config } from './config';
import { ValidationError } from '../types';

/**
 * Rate-limit a public endpoint by source IP.
 * Uses a 15-minute sliding window with max `limit` attempts.
 * DynamoDB TTL auto-deletes expired rate-limit records (zero cleanup cost).
 *
 * @param sourceIp - The client IP from API Gateway requestContext
 * @param action - A namespace string (e.g. 'share-download', 'share-meta')
 * @param limit - Maximum attempts per window (default 10)
 * @throws ValidationError with status 429 if limit exceeded
 */
export async function enforceRateLimit(
  sourceIp: string,
  action: string,
  limit = 10,
): Promise<void> {
  const windowId = Math.floor(Date.now() / (15 * 60 * 1000));
  const result = await docClient.send(new UpdateCommand({
    TableName: config.TABLE_NAME,
    Key: {
      PK: `RATELIMIT#${sourceIp}`,
      SK: `${action}#${windowId}`,
    },
    UpdateExpression:
      'SET attempts = if_not_exists(attempts, :zero) + :one, #ttl = :ttl',
    ExpressionAttributeNames: { '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':zero': 0,
      ':one': 1,
      ':ttl': Math.floor(Date.now() / 1000) + 900,
    },
    ReturnValues: 'ALL_NEW',
  }));

  if ((result.Attributes?.['attempts'] ?? 0) > limit) {
    throw new ValidationError('Too many requests. Try again later.', 429);
  }
}
