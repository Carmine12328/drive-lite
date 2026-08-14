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

vi.mock('../../lib/rate-limiter', () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(undefined),
}));

import { handler } from './get-share';
import { docClient } from '../../lib/dynamo-client';

const VALID_TOKEN = 'a'.repeat(64);

describe('GetShare Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 for invalid token format', async () => {
    const event = {
      pathParameters: { token: 'invalid-short-token' },
      requestContext: { http: { sourceIp: '1.2.3.4' } },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'This share link is no longer available.' });
  });

  it('returns 404 when share is not found', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({ Item: undefined });

    const event = {
      pathParameters: { token: VALID_TOKEN },
      requestContext: { http: { sourceIp: '1.2.3.4' } },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'This share link is no longer available.' });
  });

  it('returns 404 when share has expired', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({
      Item: {
        shareToken: VALID_TOKEN,
        expiresAt: new Date(Date.now() - 10000).toISOString(),
        failedPasswordAttempts: 0,
        downloadCount: 0,
      },
    });

    const event = {
      pathParameters: { token: VALID_TOKEN },
      requestContext: { http: { sourceIp: '1.2.3.4' } },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 404 when max downloads reached', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({
      Item: {
        shareToken: VALID_TOKEN,
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        maxDownloads: 3,
        downloadCount: 3,
        failedPasswordAttempts: 0,
      },
    });

    const event = {
      pathParameters: { token: VALID_TOKEN },
      requestContext: { http: { sourceIp: '1.2.3.4' } },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 404 when link is locked from >= 5 failed password attempts', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({
      Item: {
        shareToken: VALID_TOKEN,
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        failedPasswordAttempts: 5,
        downloadCount: 0,
      },
    });

    const event = {
      pathParameters: { token: VALID_TOKEN },
      requestContext: { http: { sourceIp: '1.2.3.4' } },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns metadata for a valid share link', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({
      Item: {
        shareToken: VALID_TOKEN,
        fileName: 'document.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        passwordHash: 'hash123',
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        failedPasswordAttempts: 0,
        downloadCount: 1,
        maxDownloads: 10,
      },
    });

    const event = {
      pathParameters: { token: VALID_TOKEN },
      requestContext: { http: { sourceIp: '1.2.3.4' } },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.fileName).toBe('document.pdf');
    expect(body.fileSize).toBe(2048);
    expect(body.mimeType).toBe('application/pdf');
    expect(body.passwordProtected).toBe(true);
    expect(body.downloadCount).toBe(1);
    expect(body.maxDownloads).toBe(10);
  });
});
