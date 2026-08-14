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

vi.mock('../../lib/s3-client', () => ({
  s3Client: {
    send: vi.fn(),
  },
}));

import { handler } from './list-versions';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';

describe('ListVersions Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when file ID is missing', async () => {
    const event = {
      pathParameters: {},
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'File ID is required' });
  });

  it('returns 404 when file is not found in DynamoDB', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [] });

    const event = {
      pathParameters: { id: 'file-not-found' },
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'File not found' });
  });

  it('returns versions list successfully from S3', async () => {
    const mockFile = {
      fileId: 'file-123',
      userId: 'user-123',
      s3Key: 'user-123/file-123/document.pdf',
    };
    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [mockFile] });

    const mockS3Versions = {
      Versions: [
        {
          Key: 'user-123/file-123/document.pdf',
          VersionId: 'v2-latest',
          LastModified: new Date('2026-08-14T10:00:00Z'),
          Size: 2048,
          IsLatest: true,
          ETag: '"etag-v2"',
        },
        {
          Key: 'user-123/file-123/document.pdf',
          VersionId: 'v1-old',
          LastModified: new Date('2026-08-14T09:00:00Z'),
          Size: 1024,
          IsLatest: false,
          ETag: '"etag-v1"',
        },
      ],
    };
    vi.mocked(s3Client.send).mockResolvedValueOnce(mockS3Versions);

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

    const parsed = JSON.parse(result.body as string);
    expect(parsed.versions).toHaveLength(2);
    expect(parsed.versions[0]).toEqual({
      versionId: 'v2-latest',
      lastModified: '2026-08-14T10:00:00.000Z',
      size: 2048,
      isLatest: true,
      etag: 'etag-v2',
    });
    expect(parsed.versions[1]).toEqual({
      versionId: 'v1-old',
      lastModified: '2026-08-14T09:00:00.000Z',
      size: 1024,
      isLatest: false,
      etag: 'etag-v1',
    });
  });
});
