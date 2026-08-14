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

import { handler } from './list-shares';
import { docClient } from '../../lib/dynamo-client';

describe('ListShares Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when authorization claims are missing', async () => {
    const event = {
      pathParameters: { id: 'file-123' },
      requestContext: {},
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  it('lists shares for a file and strips sensitive fields', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({
      Items: [
        {
          shareToken: 'token123',
          fileId: 'file-123',
          fileName: 'test.pdf',
          fileSize: 100,
          passwordHash: 'secret-hash',
          salt: 'secret-salt',
          expiresAt: new Date(Date.now() + 100000).toISOString(),
          failedPasswordAttempts: 0,
          downloadCount: 2,
          maxDownloads: 5,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const event = {
      pathParameters: { id: 'file-123' },
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.shares.length).toBe(1);
    expect(body.shares[0].shareToken).toBe('token123');
    expect(body.shares[0].passwordProtected).toBe(true);
    expect(body.shares[0].passwordHash).toBeUndefined();
    expect(body.shares[0].salt).toBeUndefined();
  });
});
