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

import { handler } from './create-share';
import { docClient } from '../../lib/dynamo-client';

describe('CreateShare Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when authorization claims are missing', async () => {
    const event = {
      pathParameters: { id: 'file-123' },
      body: JSON.stringify({ expiresInHours: 24 }),
      requestContext: {},
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  it('returns 404 when file is not found', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [] });

    const event = {
      pathParameters: { id: 'missing-file' },
      body: JSON.stringify({ expiresInHours: 24 }),
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when file is still in PENDING uploadStatus', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({
      Items: [{
        fileId: 'file-123',
        uploadStatus: 'PENDING',
      }],
    });

    const event = {
      pathParameters: { id: 'file-123' },
      body: JSON.stringify({ expiresInHours: 24 }),
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('creates share link successfully with password and maxDownloads', async () => {
    vi.mocked(docClient.send)
      .mockResolvedValueOnce({
        Items: [{
          fileId: 'file-123',
          fileName: 'test.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          s3Key: 'users/user-123/files/file-123/test.pdf',
          uploadStatus: 'COMPLETED',
        }],
      })
      .mockResolvedValueOnce({}); // PutCommand

    const event = {
      pathParameters: { id: 'file-123' },
      body: JSON.stringify({
        expiresInHours: 48,
        password: 'SharePassword123',
        maxDownloads: 5,
      }),
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(201);

    const body = JSON.parse(result.body as string);
    expect(body.shareToken).toBeDefined();
    expect(body.shareToken.length).toBe(64);
    expect(body.shareUrl).toBe(`http://localhost:4200/share/${body.shareToken}`);
    expect(body.passwordProtected).toBe(true);
    expect(body.maxDownloads).toBe(5);
  });
});
