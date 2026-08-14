import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

vi.mock('../../lib/config', () => ({
  config: {
    TABLE_NAME: 'DriveLiteStack-MetadataTable',
    ALLOWED_ORIGINS: 'http://localhost:4200',
  },
}));

vi.mock('../../lib/dynamo-client', () => ({
  docClient: {
    send: vi.fn(),
  },
}));

import { handler } from './revoke-share';
import { docClient } from '../../lib/dynamo-client';

const VALID_TOKEN = 'c'.repeat(64);

describe('RevokeShare Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when authorization claims are missing', async () => {
    const event = {
      pathParameters: { token: VALID_TOKEN },
      requestContext: {},
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  it('returns 404 when share link does not exist', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({ Item: undefined });

    const event = {
      pathParameters: { token: VALID_TOKEN },
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 403 when user does not own the share link', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({
      Item: {
        shareToken: VALID_TOKEN,
        userId: 'other-user',
      },
    });

    const event = {
      pathParameters: { token: VALID_TOKEN },
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  it('successfully revokes share link when owned by user', async () => {
    vi.mocked(docClient.send)
      .mockResolvedValueOnce({
        Item: {
          shareToken: VALID_TOKEN,
          userId: 'user-123',
        },
      })
      .mockResolvedValueOnce({}); // DeleteCommand

    const event = {
      pathParameters: { token: VALID_TOKEN },
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toEqual({
      message: 'Share link revoked successfully',
      shareToken: VALID_TOKEN,
    });
  });
});
