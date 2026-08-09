import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { config } from './config';

/** Raw DynamoDB client — configured for region and optional LocalStack endpoint. */
const ddbClient = new DynamoDBClient({
  region: config.REGION,
  ...(config.LOCALSTACK_ENDPOINT && {
    endpoint: config.LOCALSTACK_ENDPOINT,
  }),
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
