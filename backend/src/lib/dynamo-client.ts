import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { config } from './config';

/**
 * Raw DynamoDB client — configured for region.
 * Endpoint routing is handled automatically by the SDK v3 via the
 * `AWS_ENDPOINT_URL` env var (auto-injected by LocalStack in local dev).
 */
const ddbClient = new DynamoDBClient({
  region: config.REGION,
});

/**
 * DynamoDB Document Client singleton.
 * Uses automatic marshalling with `removeUndefinedValues` to simplify PutItem calls.
 * Instantiated at module scope for connection reuse across warm Lambda invocations.
 */
export const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
