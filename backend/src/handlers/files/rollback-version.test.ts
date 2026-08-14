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

import { handler } from './rollback-version';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';

describe('RollbackVersion Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when file ID is missing', async () => {
    const event = {
      pathParameters: {},
      body: JSON.stringify({ versionId: 'v1' }),
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

  it('returns 400 when versionId is missing in body', async () => {
    const event = {
      pathParameters: { id: 'file-123' },
      body: JSON.stringify({}),
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'versionId is required' });
  });

  it('returns 404 when file is not found', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [] });

    const event = {
      pathParameters: { id: 'file-not-found' },
      body: JSON.stringify({ versionId: 'v1' }),
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

  it('successfully copies previous version in S3 and updates DynamoDB metadata', async () => {
    const mockFile = {
      PK: 'FOLDER#user-123#ROOT',
      SK: 'FILE#file-123',
      fileId: 'file-123',
      userId: 'user-123',
      s3Key: 'user-123/file-123/document.pdf',
      fileSize: 2048,
    };
    // 1. Query file
    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [mockFile] });
    // 2. S3 CopyObject
    vi.mocked(s3Client.send).mockResolvedValueOnce({} as never);
    // 3. S3 HeadObject
    vi.mocked(s3Client.send).mockResolvedValueOnce({
      ContentLength: 1024,
      ETag: '"new-rolled-back-etag"',
    } as never);
    // 4. DynamoDB UpdateCommand
    vi.mocked(docClient.send).mockResolvedValueOnce({} as never);

    const event = {
      pathParameters: { id: 'file-123' },
      body: JSON.stringify({ versionId: 'v1-target' }),
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const parsed = JSON.parse(result.body as string);
    expect(parsed.message).toBe('Version rolled back successfully');
    expect(parsed.fileId).toBe('file-123');
    expect(parsed.versionId).toBe('v1-target');
    expect(parsed.fileSize).toBe(1024);
    expect(parsed.updatedAt).toBeDefined();
  });
});
