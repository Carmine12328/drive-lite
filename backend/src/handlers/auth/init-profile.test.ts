import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

vi.mock('../../lib/config', () => ({
  config: {
    TABLE_NAME: 'DriveLiteStack-MetadataTable',
    BUCKET_NAME: 'drivelitestack-filesbucket',
    REGION: 'us-east-1',
    ALLOWED_ORIGINS: 'http://localhost:4200',
    isLocalStack: true,
  },
}));

vi.mock('../../lib/dynamo-client', () => ({
  docClient: {
    send: vi.fn(),
  },
}));

import { handler } from './init-profile';
import { docClient } from '../../lib/dynamo-client';

describe('InitProfile Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes profile and root folder successfully via JWT claims', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({} as never);

    const event = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: 'user-abc-123',
              email: 'user@example.com',
            },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toEqual({
      message: 'Profile initialized successfully',
    });
    expect(docClient.send).toHaveBeenCalledTimes(1);
  });

  it('initializes profile from request body when JWT claims are missing (dev mode)', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({} as never);

    const event = {
      body: JSON.stringify({
        userId: 'dev-user-456',
        email: 'dev@example.com',
      }),
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toEqual({
      message: 'Profile initialized successfully',
    });
    expect(docClient.send).toHaveBeenCalledTimes(1);
  });

  it('handles already-initialized profile gracefully (idempotency)', async () => {
    const error = new Error('ConditionalCheckFailed');
    error.name = 'TransactionCanceledException';
    vi.mocked(docClient.send).mockRejectedValueOnce(error);

    const event = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: 'user-abc-123',
              email: 'user@example.com',
            },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toEqual({
      message: 'Profile already initialized',
    });
  });

  it('returns 401 when no credentials or body are provided', async () => {
    const event = {} as APIGatewayProxyEventV2;
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });
});
