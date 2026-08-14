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

import { handler } from './get-download-url';
import { docClient } from '../../lib/dynamo-client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Unit tests for GetDownloadUrl Lambda handler.
 */
describe('GetDownloadUrl Handler', () => {
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
    expect(JSON.parse(result.body as string)).toEqual({ message: 'Unauthorized: missing user identity' });
  });

  it('returns 400 when file ID is missing from path parameters', async () => {
    const event = {
      pathParameters: {},
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
    expect(JSON.parse(result.body as string)).toEqual({ message: 'File ID is required' });
  });

  it('returns 404 when file is not found for the user', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [] });

    const event = {
      pathParameters: { id: 'missing-file-123' },
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
    expect(JSON.parse(result.body as string)).toEqual({ message: 'File not found' });
  });

  it('returns 400 when file upload is not yet completed', async () => {
    const mockFileItem = {
      PK: 'FOLDER#ROOT',
      SK: 'FILE#file-123',
      fileId: 'file-123',
      fileName: 'pending-doc.pdf',
      uploadStatus: 'PENDING',
      s3Key: 'users/user-123/files/file-123/pending-doc.pdf',
    };

    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [mockFileItem] });

    const event = {
      pathParameters: { id: 'file-123' },
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
    expect(JSON.parse(result.body as string)).toEqual({
      message: 'File upload not yet completed',
    });
  });

  it('successfully generates presigned download URL for completed file', async () => {
    const mockFileItem = {
      PK: 'FOLDER#ROOT',
      SK: 'FILE#file-123',
      fileId: 'file-123',
      fileName: 'report.pdf',
      uploadStatus: 'COMPLETED',
      s3Key: 'users/user-123/files/file-123/report.pdf',
    };

    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [mockFileItem] });
    vi.mocked(getSignedUrl).mockResolvedValueOnce('https://s3.amazonaws.com/presigned-download-url');

    const event = {
      pathParameters: { id: 'file-123' },
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: 'user-123' },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body as string);
    expect(body.downloadUrl).toBe('https://s3.amazonaws.com/presigned-download-url');
    expect(body.fileName).toBe('report.pdf');
  });
});
