import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ValidationError } from '../../types';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { userPK } from '../../lib/keys';

/** Default number of recent files to return. */
const DEFAULT_LIMIT = 10;

/** Maximum allowed limit to prevent abuse. */
const MAX_LIMIT = 50;

/**
 * Returns the most recently modified files for the authenticated user,
 * sorted by `updatedAt` descending, across all folders.
 *
 * Uses GSI1 to query all FILE# items for the user, then sorts in-memory.
 * This is efficient for typical user file counts (< few thousand).
 *
 * Query params:
 *   - limit (optional): Number of files to return (default 10, max 50)
 *
 * @param event The API Gateway event
 * @returns The API Gateway response with { files: FileItem[] }
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);

    // Parse and clamp the limit parameter
    const rawLimit = parseInt(event.queryStringParameters?.limit ?? '', 10);
    const limit = Number.isNaN(rawLimit)
      ? DEFAULT_LIMIT
      : Math.min(Math.max(rawLimit, 1), MAX_LIMIT);

    // Query GSI1 for ALL file items belonging to this user (across all folders).
    // GSI1PK = USER#{userId}, GSI1SK begins_with FILE#
    const queryResult = await docClient.send(new QueryCommand({
      TableName: config.TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': userPK(userId),
        ':skPrefix': 'FILE#',
      },
    }));

    let files = queryResult.Items ?? [];

    // Exclude soft-deleted files
    files = files.filter(item => !item.deletedAt);

    // Sort by updatedAt descending (most recently modified first).
    // Falls back to createdAt if updatedAt is missing.
    files.sort((a, b) => {
      const dateA = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const dateB = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return dateB - dateA;
    });

    // Return only the top N
    files = files.slice(0, limit);

    return success(200, { files });
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(err.statusCode, err.message);
    }
    console.error('RecentFiles error:', err);
    return error(500, 'Internal server error');
  }
};
