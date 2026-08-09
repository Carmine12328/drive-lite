import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { config } from './config';

/** CORS headers applied to every response. */
function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': config.ALLOWED_ORIGINS,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
}

/**
 * Build a successful JSON response.
 * @param statusCode - HTTP status code (e.g., 200, 201)
 * @param body - Response payload (will be JSON-serialized)
 */
export function success<T>(statusCode: number, body: T): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(),
    },
    body: JSON.stringify(body),
  };
}

/**
 * Build an error JSON response.
 * @param statusCode - HTTP status code (e.g., 400, 403, 404, 500)
 * @param message - Human-readable error message
 */
export function error(statusCode: number, message: string): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(),
    },
    body: JSON.stringify({ message }),
  };
}
