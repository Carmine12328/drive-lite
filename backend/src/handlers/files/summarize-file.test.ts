import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

vi.mock('../../lib/config', () => ({
  config: {
    TABLE_NAME: 'DriveLiteStack-MetadataTable',
    BUCKET_NAME: 'drivelitestack-filesbucket',
    REGION: 'us-east-1',
    ALLOWED_ORIGINS: 'http://localhost:4200',
    BEDROCK_ENABLED: false,
    BEDROCK_MODEL_ID: 'amazon.titan-text-lite-v1',
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

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation(() => ({
    getText: vi.fn().mockResolvedValue({
      text: 'This is a sample extracted PDF text for testing summarization.',
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  })),
}));


import { handler } from './summarize-file';
import { s3Client } from '../../lib/s3-client';
import { docClient } from '../../lib/dynamo-client';

describe('SummarizeFile Handler', () => {
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
    vi.mocked(docClient.send).mockResolvedValueOnce({ Items: [] } as never);

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

  it('generates summary for a text file', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({
      Items: [
        {
          PK: 'USER#user-123#FOLDER#ROOT',
          SK: 'FILE#file-123',
          fileId: 'file-123',
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          s3Key: 'users/user-123/files/file-123/notes.txt',
        },
      ],
    } as never);

    const textContent = 'First paragraph about cloud computing architecture. Second sentence with details.\n\nSecond paragraph explaining serverless benefits.';
    const mockTransformToByteArray = vi.fn().mockResolvedValue(new TextEncoder().encode(textContent));

    vi.mocked(s3Client.send).mockResolvedValueOnce({
      Body: {
        transformToByteArray: mockTransformToByteArray,
      },
    } as never);

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
    const body = JSON.parse(result.body as string);
    expect(body.summary).toContain('Document Overview');
    expect(body.wordCount).toBeGreaterThan(5);
    expect(body.modelUsed).toContain('Stub');
  });

  it('extracts and summarizes text from a PDF file', async () => {
    vi.mocked(docClient.send).mockResolvedValueOnce({
      Items: [
        {
          PK: 'USER#user-123#FOLDER#ROOT',
          SK: 'FILE#file-456',
          fileId: 'file-456',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          s3Key: 'users/user-123/files/file-456/report.pdf',
        },
      ],
    } as never);

    const mockTransformToByteArray = vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])); // %PDF

    vi.mocked(s3Client.send).mockResolvedValueOnce({
      Body: {
        transformToByteArray: mockTransformToByteArray,
      },
    } as never);

    const event = {
      pathParameters: { id: 'file-456' },
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: 'user-123' } },
        },
      },
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.summary).toBeDefined();
    expect(body.wordCount).toBeGreaterThan(0);
  });
});
