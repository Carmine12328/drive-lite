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
  s3Client: {},
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

import { handler } from './get-upload-url';
import { docClient } from '../../lib/dynamo-client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Unit tests for GetUploadUrl Lambda handler.
 */
describe('GetUploadUrl Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when user identity is missing', async () => {
    const event = {
      body: JSON.stringify({
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        folderId: 'ROOT',
      }),
      requestContext: {},
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'Unauthorized: missing user identity' });
  });

  it('returns 400 when file name is missing or invalid', async () => {
    const event = {
      body: JSON.stringify({
        fileName: '',
        fileSize: 1024,
        mimeType: 'application/pdf',
        folderId: 'ROOT',
      }),
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: 'user-123' },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).message).toContain('Name is required');
  });

  it('returns 400 when file size exceeds max allowed size', async () => {
    const event = {
      body: JSON.stringify({
        fileName: 'huge-file.zip',
        fileSize: 200 * 1024 * 1024, // 200MB > 100MB limit
        mimeType: 'application/zip',
        folderId: 'ROOT',
      }),
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: 'user-123' },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).message).toContain('File size exceeds');
  });

  it('returns 404 when target folder is not found', async () => {
    // Mock GetCommand returning no folder item
    vi.mocked(docClient.send).mockResolvedValueOnce({ Item: undefined });

    const event = {
      body: JSON.stringify({
        fileName: 'doc.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        folderId: 'non-existent-folder',
      }),
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: 'user-123' },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'Folder not found' });
  });

  it('successfully generates upload presigned URL for ROOT folder', async () => {
    // Mock PutCommand execution
    vi.mocked(docClient.send).mockResolvedValueOnce({});
    // Mock getSignedUrl returning presigned URL
    vi.mocked(getSignedUrl).mockResolvedValueOnce('https://s3.amazonaws.com/presigned-upload-url');

    const event = {
      body: JSON.stringify({
        fileName: 'document.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        folderId: 'ROOT',
      }),
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: 'user-123' },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(201);

    const body = JSON.parse(result.body as string);
    expect(body.uploadUrl).toBe('https://s3.amazonaws.com/presigned-upload-url');
    expect(body.fileId).toBeDefined();
    expect(body.s3Key).toContain('users/user-123/files/');
  });

  it('returns 500 when an unhandled error occurs', async () => {
    vi.mocked(docClient.send).mockRejectedValueOnce(new Error('DynamoDB Error'));

    const event = {
      body: JSON.stringify({
        fileName: 'test.txt',
        fileSize: 500,
        mimeType: 'text/plain',
        folderId: 'folder-123',
      }),
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: 'user-123' },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    // First call to docClient.send (folder check) fails
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'Internal server error' });
  });
});
