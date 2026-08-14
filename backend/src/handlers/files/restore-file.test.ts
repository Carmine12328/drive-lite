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

import { handler } from './restore-file';
import { docClient } from '../../lib/dynamo-client';

describe('RestoreFile Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when file ID is missing', async () => {
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

  it('returns 404 when file is not in trash', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({ Item: undefined });

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
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body as string)).toEqual({ message: 'File not found in trash' });
  });

  it('successfully restores a file from trash', async () => {
    const mockTrashItem = {
      PK: 'TRASH#user-123',
      SK: 'FILE#file-123',
      GSI1PK: 'USER#user-123',
      GSI1SK: 'FILE#file-123',
      fileId: 'file-123',
      fileName: 'document.pdf',
      deletedAt: '2026-08-12T10:00:00.000Z',
      originalPK: 'USER#user-123#FOLDER#folder-456',
      ttl: 1789000000,
    };

    // 1st call: GetCommand returns trash item
    vi.mocked(docClient.send).mockResolvedValueOnce({ Item: mockTrashItem });
    // 2nd call: TransactWriteCommand succeeds
    vi.mocked(docClient.send).mockResolvedValueOnce({});

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
    expect(body.message).toBe('File restored successfully');
    expect(body.file.PK).toBe('USER#user-123#FOLDER#folder-456');
    expect(body.file.deletedAt).toBeUndefined();
    expect(body.file.originalPK).toBeUndefined();
    expect(body.file.ttl).toBeUndefined();
  });
});
