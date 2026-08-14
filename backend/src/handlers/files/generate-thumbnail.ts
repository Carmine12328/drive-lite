import type { S3Event } from 'aws-lambda';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import sharp from 'sharp';
import { config } from '../../lib/config';
import { s3Client } from '../../lib/s3-client';
import { docClient } from '../../lib/dynamo-client';
import { userPK, fileSK, thumbnailS3Key } from '../../lib/keys';

const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp']);

/**
 * S3-triggered event handler that automatically generates a 200x200 WebP thumbnail
 * for uploaded images and updates DynamoDB metadata.
 *
 * @param event - The S3 event notification
 */
export const handler = async (event: S3Event): Promise<{ processed: number; errors: number }> => {
  let processed = 0;
  let errors = 0;

  for (const record of event.Records ?? []) {
    try {
      const bucket = record.s3.bucket.name;
      const rawKey = record.s3.object.key;
      const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));

      // Guard: skip existing thumbnails to prevent infinite loops
      if (key.startsWith('thumbnails/')) {
        continue;
      }

      // Guard: check if file extension is an image
      const ext = key.split('.').pop()?.toLowerCase() || '';
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        continue;
      }

      // Extract userId and fileId from S3 key format: users/{userId}/files/{fileId}/{fileName}
      const match = key.match(/^users\/([^/]+)\/files\/([^/]+)\/(.+)$/);
      if (!match) {
        console.warn('[GenerateThumbnail] S3 key does not match expected pattern:', key);
        continue;
      }

      const [, userId, fileId] = match;

      // 1. Fetch source image from S3
      const getRes = await s3Client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key
      }));

      if (!getRes.Body) {
        console.error('[GenerateThumbnail] Empty response body for S3 key:', key);
        errors++;
        continue;
      }

      const rawBytes = await getRes.Body.transformToByteArray();

      // 2. Generate 200x200 WebP thumbnail using Sharp
      const thumbBuffer = await sharp(Buffer.from(rawBytes))
        .resize(200, 200, {
          fit: 'cover',
          withoutEnlargement: true
        })
        .webp({ quality: 80 })
        .toBuffer();

      // 3. Put thumbnail back into S3
      const thumbKey = thumbnailS3Key(userId, fileId);
      await s3Client.send(new PutObjectCommand({
        Bucket: config.BUCKET_NAME,
        Key: thumbKey,
        Body: thumbBuffer,
        ContentType: 'image/webp'
      }));

      // 4. Look up file's primary key from DynamoDB GSI1
      const queryRes = await docClient.send(new QueryCommand({
        TableName: config.TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
        ExpressionAttributeValues: {
          ':pk': userPK(userId),
          ':sk': fileSK(fileId)
        }
      }));

      const fileItem = queryRes.Items?.[0];
      if (fileItem) {
        // 5. Update DynamoDB metadata with thumbnail S3 key and size
        await docClient.send(new UpdateCommand({
          TableName: config.TABLE_NAME,
          Key: {
            PK: fileItem.PK,
            SK: fileSK(fileId)
          },
          UpdateExpression: 'SET thumbnailKey = :tk, thumbnailSize = :ts',
          ExpressionAttributeValues: {
            ':tk': thumbKey,
            ':ts': thumbBuffer.length
          }
        }));
      }

      processed++;
    } catch (err: unknown) {
      console.error('[GenerateThumbnail] Error processing record:', err);
      errors++;
    }
  }

  return { processed, errors };
};
