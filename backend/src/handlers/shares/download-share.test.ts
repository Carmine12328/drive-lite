import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

vi.mock('../../lib/config', () => ({
  config: {
    TABLE_NAME: 'DriveLiteStack-MetadataTable',
    BUCKET_NAME: 'drivelitestack-filesbucket',
    ALLOWED_ORIGINS: 'http://localhost:4200',
  },
}));

vi.mock('../../lib/dynamo-client', () => ({
  docClient: {
    send: vi.fn(),
  },
}));

vi.mock('../../lib/s3-client', () => ({
  s3Client: {},
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

vi.mock('../../lib/rate-limiter', () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(undefined),
}));

import { handler } from './download-share';
import { docClient } from '../../lib/dynamo-client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { hashPassword } from '../../lib/password';

const VALID_TOKEN = 'b'.repeat(64);

describe('DownloadShare Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 for invalid token format', async () => {
    const event = {
      pathParameters: { token: 'invalid' },
      requestContext: { http: { sourceIp: '1.2.3.4' } },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 403 when password is required but not provided', async () => {
    const { hash, salt } = hashPassword('Secret123');

    vi.mocked(docClient.send).mockResolvedValueOnce({
      Item: {
        shareToken: VALID_TOKEN,
        fileName: 'report.pdf',
        s3Key: 'users/u1/files/f1/report.pdf',
        passwordHash: hash,
        salt,
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        failedPasswordAttempts: 0,
        downloadCount: 0,
      },
    });

    const event = {
      pathParameters: { token: VALID_TOKEN },
      body: JSON.stringify({}),
      requestContext: { http: { sourceIp: '1.2.3.4' } },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'Password required' });
  });

  it('returns 403 when password is incorrect and increments failed attempts', async () => {
    const { hash, salt } = hashPassword('Secret123');

    vi.mocked(docClient.send)
      .mockResolvedValueOnce({
        Item: {
          shareToken: VALID_TOKEN,
          fileName: 'report.pdf',
          s3Key: 'users/u1/files/f1/report.pdf',
          passwordHash: hash,
          salt,
          expiresAt: new Date(Date.now() + 100000).toISOString(),
          failedPasswordAttempts: 0,
          downloadCount: 0,
        },
      })
      .mockResolvedValueOnce({}); // UpdateCommand for incrementing failedPasswordAttempts

    const event = {
      pathParameters: { token: VALID_TOKEN },
      body: JSON.stringify({ password: 'WrongPassword' }),
      requestContext: { http: { sourceIp: '1.2.3.4' } },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'Invalid password' });
  });

  it('generates presigned download URL when password is correct', async () => {
    const { hash, salt } = hashPassword('Secret123');

    vi.mocked(docClient.send)
      .mockResolvedValueOnce({
        Item: {
          shareToken: VALID_TOKEN,
          fileName: 'report.pdf',
          s3Key: 'users/u1/files/f1/report.pdf',
          passwordHash: hash,
          salt,
          expiresAt: new Date(Date.now() + 100000).toISOString(),
          failedPasswordAttempts: 0,
          downloadCount: 0,
        },
      })
      .mockResolvedValueOnce({}); // UpdateCommand for downloadCount

    vi.mocked(getSignedUrl).mockResolvedValueOnce('https://s3.amazonaws.com/presigned-share-url');

    const event = {
      pathParameters: { token: VALID_TOKEN },
      body: JSON.stringify({ password: 'Secret123' }),
      requestContext: { http: { sourceIp: '1.2.3.4' } },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.downloadUrl).toBe('https://s3.amazonaws.com/presigned-share-url');
    expect(body.fileName).toBe('report.pdf');
  });
});
