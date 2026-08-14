import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { S3Event } from 'aws-lambda';

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

// Mock sharp
vi.mock('sharp', () => {
  const resizeMock = vi.fn().mockReturnThis();
  const webpMock = vi.fn().mockReturnThis();
  const toBufferMock = vi.fn().mockResolvedValue(Buffer.from('fake-webp-thumbnail'));

  const sharpMock = vi.fn(() => ({
    resize: resizeMock,
    webp: webpMock,
    toBuffer: toBufferMock,
  }));

  return {
    default: sharpMock
  };
});

import { handler } from './generate-thumbnail';
import { s3Client } from '../../lib/s3-client';
import { docClient } from '../../lib/dynamo-client';


describe('GenerateThumbnail Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips processing if the S3 key is already a thumbnail', async () => {
    const event: S3Event = {
      Records: [
        {
          s3: {
            bucket: { name: 'test-bucket', arn: '', ownerIdentity: { principalId: '' } },
            object: { key: 'thumbnails/users/user123/files/file123/thumb.webp', size: 100, eTag: '', sequencer: '' },
            s3SchemaVersion: '1.0',
            configurationId: ''
          },
          eventVersion: '2.1',
          eventSource: 'aws:s3',
          awsRegion: 'us-east-1',
          eventTime: '2026-08-14T00:00:00.000Z',
          eventName: 'ObjectCreated:Put',
          userIdentity: { principalId: '' },
          requestParameters: { sourceIPAddress: '' },
          responseElements: { 'x-amz-request-id': '', 'x-amz-id-2': '' }
        }
      ]
    };

    const result = await handler(event);
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('skips non-image files like PDFs or TXT', async () => {
    const event: S3Event = {
      Records: [
        {
          s3: {
            bucket: { name: 'test-bucket', arn: '', ownerIdentity: { principalId: '' } },
            object: { key: 'users/user123/files/file123/document.pdf', size: 100, eTag: '', sequencer: '' },
            s3SchemaVersion: '1.0',
            configurationId: ''
          },
          eventVersion: '2.1',
          eventSource: 'aws:s3',
          awsRegion: 'us-east-1',
          eventTime: '2026-08-14T00:00:00.000Z',
          eventName: 'ObjectCreated:Put',
          userIdentity: { principalId: '' },
          requestParameters: { sourceIPAddress: '' },
          responseElements: { 'x-amz-request-id': '', 'x-amz-id-2': '' }
        }
      ]
    };

    const result = await handler(event);
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('generates a thumbnail and updates DynamoDB for a valid image', async () => {
    const mockTransformToByteArray = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]));

    vi.mocked(s3Client.send)
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: mockTransformToByteArray,
        },
      } as never)
      .mockResolvedValueOnce({} as never);

    vi.mocked(docClient.send)
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user123#FOLDER#ROOT',
            SK: 'FILE#file123',
            fileId: 'file123',
            fileName: 'photo.jpg',
          },
        ],
      } as never)
      .mockResolvedValueOnce({} as never);

    const event: S3Event = {
      Records: [
        {
          s3: {
            bucket: { name: 'test-bucket', arn: '', ownerIdentity: { principalId: '' } },
            object: { key: 'users/user123/files/file123/photo.jpg', size: 1024, eTag: '', sequencer: '' },
            s3SchemaVersion: '1.0',
            configurationId: ''
          },
          eventVersion: '2.1',
          eventSource: 'aws:s3',
          awsRegion: 'us-east-1',
          eventTime: '2026-08-14T00:00:00.000Z',
          eventName: 'ObjectCreated:Put',
          userIdentity: { principalId: '' },
          requestParameters: { sourceIPAddress: '' },
          responseElements: { 'x-amz-request-id': '', 'x-amz-id-2': '' }
        }
      ]
    };

    const result = await handler(event);
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);
  });
});

