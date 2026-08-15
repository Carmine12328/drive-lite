import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { PDFParse } from 'pdf-parse';
import { config } from '../../lib/config';
import { docClient } from '../../lib/dynamo-client';
import { s3Client } from '../../lib/s3-client';
import { success, error } from '../../lib/response';
import { getUserId } from '../../lib/validators';
import { userPK, fileSK } from '../../lib/keys';
import type { SummarizeResponse } from '../../types';

let bedrockClient: BedrockRuntimeClient | undefined;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({ region: config.REGION });
  }
  return bedrockClient;
}

/**
 * Generates an AI summary of a document using Amazon Bedrock (Titan Text Lite)
 * or local smart document extraction when in Stub mode.
 *
 * @param event - The API Gateway event (POST /files/{id}/summarize)
 * @returns SummarizeResponse with summary text and metadata
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = getUserId(event);
    const fileId = event.pathParameters?.['id'];

    if (!fileId) {
      return error(400, 'File ID is required');
    }

    // 1. Fetch file record from DynamoDB to verify ownership
    const queryResult = await docClient.send(new QueryCommand({
      TableName: config.TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: {
        ':pk': userPK(userId),
        ':sk': fileSK(fileId),
      },
    }));

    const file = queryResult.Items?.[0];
    if (!file || file.isDeleted) {
      return error(404, 'File not found');
    }

    if (file.uploadStatus !== 'COMPLETED') {
      return error(400, 'File upload not yet completed');
    }

    // 2. Fetch binary stream from S3
    const s3Res = await s3Client.send(new GetObjectCommand({
      Bucket: config.BUCKET_NAME,
      Key: file.s3Key,
    }));

    if (!s3Res.Body) {
      return error(404, 'File content not found in storage');
    }

    const rawBytes = await s3Res.Body.transformToByteArray();
    const buffer = Buffer.from(rawBytes);

    // 3. Extract text from PDF or Text files
    let text = '';
    const mime = (file.mimeType || '').toLowerCase();
    const isPdf = mime === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf');
    const isText = mime.startsWith('text/') ||
      mime.includes('json') ||
      mime.includes('xml') ||
      mime.includes('javascript') ||
      mime.includes('typescript') ||
      /\.(txt|md|markdown|json|ts|js|jsx|tsx|css|scss|html|htm|py|java|c|cpp|h|rb|go|rs|sh|yaml|yml|xml|csv|tsv|sql|log|env)$/i.test(file.fileName);

    if (isPdf) {
      try {
        const parser = new PDFParse({ data: buffer });
        const parsed = await parser.getText();
        text = parsed.text || '';
        await parser.destroy();
      } catch (pdfErr) {
        console.error('[SummarizeFile] Error parsing PDF text:', pdfErr);
        return error(422, 'Could not extract readable text from PDF');
      }
    } else if (isText) {
      // Treat as plain text / code
      text = buffer.toString('utf-8');
    } else {
      return error(422, 'Only text documents and PDF files can be summarized');
    }

    const cleanedText = text.replace(/\r\n/g, '\n').trim();
    if (!cleanedText) {
      return error(400, 'Document contains no extractable text');
    }

    const words = cleanedText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));

    // 4. Summarize via Bedrock (Titan Lite) or Stub
    let summary = '';
    let modelUsed = 'Drive Lite Smart Summary (Stub - Free Tier)';

    if (config.BEDROCK_ENABLED) {
      try {
        const client = getBedrockClient();
        const modelId = config.BEDROCK_MODEL_ID;
        const truncatedPromptText = cleanedText.slice(0, 10000); // stay well within token context

        const payload = {
          inputText: `Summarize the following text concisely. Provide a 2-sentence overview followed by 3-5 bullet points of key takeaways:\n\n${truncatedPromptText}`,
          textGenerationConfig: {
            maxTokenCount: 512,
            temperature: 0.3,
            topP: 0.9,
          },
        };

        const bedrockRes = await client.send(new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: Buffer.from(JSON.stringify(payload)),
        }));

        if (bedrockRes.body) {
          const bodyStr = new TextDecoder().decode(bedrockRes.body);
          const parsed = JSON.parse(bodyStr);
          summary = parsed.results?.[0]?.outputText?.trim() || '';
          modelUsed = `Amazon Titan Text Lite (${modelId})`;
        }
      } catch (bedrockErr: unknown) {
        console.warn('[SummarizeFile] Bedrock invocation failed, falling back to smart stub:', bedrockErr);
      }
    }

    // Fallback or Stub generator if Bedrock disabled / unavailable
    if (!summary) {
      const paragraphs = cleanedText.split(/\n\s*\n/).filter(p => p.trim().length > 30);
      const sampleSentences = paragraphs.slice(0, 3).map(p => p.trim().split('. ')[0] + '.');
      
      summary = `**Document Overview:**\nThis document contains ${wordCount} words (~${readingTimeMinutes} min read). Here are the primary highlights:\n\n` +
        sampleSentences.map(s => `• ${s}`).join('\n') +
        `\n\n*(Generated via Drive Lite Document Analyzer)*`;
    }

    const responseData: SummarizeResponse = {
      summary,
      modelUsed,
      sourceLength: cleanedText.length,
      wordCount,
      readingTimeMinutes,
    };

    return success<SummarizeResponse>(200, responseData);
  } catch (err: unknown) {
    console.error('[SummarizeFile] Unhandled error:', err);
    return error(500, 'Failed to summarize document');
  }
};
