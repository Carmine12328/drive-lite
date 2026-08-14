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

import { handler } from './confirm-upload';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';

/**
 * Unit tests for ConfirmUpload Lambda handler.
 */
describe('ConfirmUpload Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when user authorization is missing', async () => {
    const event = {
      body: JSON.stringify({ fileId: 'file-123' }),
      requestContext: {},
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'Unauthorized: missing user identity' });
  });

  it('returns 400 when body or fileId is missing', async () => {
    const event = {
      body: JSON.stringify({}),
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

  it('returns 404 when file is not found in metadata table', async () => {
    // QueryCommand returns empty Items array
    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [] });

    const event = {
      body: JSON.stringify({ fileId: 'non-existent-file' }),
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

  it('returns 409 when file upload is already confirmed or failed', async () => {
    const mockFileItem = {
      PK: 'FOLDER#ROOT',
      SK: 'FILE#file-123',
      fileId: 'file-123',
      uploadStatus: 'COMPLETED',
      s3Key: 'users/user-123/files/file-123/doc.pdf',
    };

    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [mockFileItem] });

    const event = {
      body: JSON.stringify({ fileId: 'file-123' }),
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: 'user-123' },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body as string)).toEqual({
      message: 'File upload already confirmed or failed',
    });
  });

  it('returns 404 when file object is missing from S3 storage', async () => {
    const mockFileItem = {
      PK: 'FOLDER#ROOT',
      SK: 'FILE#file-123',
      fileId: 'file-123',
      uploadStatus: 'PENDING',
      s3Key: 'users/user-123/files/file-123/doc.pdf',
    };

    // QueryCommand returns pending file item
    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [mockFileItem] });
    // HeadObjectCommand throws NotFound error
    const notFoundErr = new Error('NotFound');
    notFoundErr.name = 'NotFound';
    vi.mocked(s3Client.send).mockRejectedValueOnce(notFoundErr);

    const event = {
      body: JSON.stringify({ fileId: 'file-123' }),
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
    expect(JSON.parse(result.body as string)).toEqual({
      message: 'File not found in storage',
    });
  });

  it('successfully confirms file upload when S3 object exists', async () => {
    const mockFileItem = {
      PK: 'FOLDER#ROOT',
      SK: 'FILE#file-123',
      fileId: 'file-123',
      uploadStatus: 'PENDING',
      s3Key: 'users/user-123/files/file-123/doc.pdf',
    };

    // 1st docClient.send: QueryCommand returns pending file
    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [mockFileItem] });
    // s3Client.send: HeadObjectCommand succeeds
    vi.mocked(s3Client.send).mockResolvedValueOnce({});
    // 2nd docClient.send: UpdateCommand succeeds
    vi.mocked(docClient.send).mockResolvedValueOnce({});

    const event = {
      body: JSON.stringify({ fileId: 'file-123' }),
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
    expect(body.message).toBe('Upload confirmed');
    expect(body.fileId).toBe('file-123');
  });
});
