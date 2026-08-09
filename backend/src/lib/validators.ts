import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ValidationError } from '../types/index';

/** Maximum allowed file size: 100 MB */
const MAX_FILE_SIZE = 100 * 1024 * 1024;

/** Maximum file/folder name length */
const MAX_NAME_LENGTH = 255;

/** Characters/patterns forbidden in file and folder names */
const FORBIDDEN_NAME_PATTERNS = [
  '..', '/', '\\', '\0',
];

/** Control character regex (ASCII 0-31 except tab, plus DEL 127) */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

/**
 * Validate a file or folder name.
 * Rejects empty names, names exceeding 255 chars, path traversal attempts,
 * and names containing control characters.
 * @param name - The name to validate
 * @returns The trimmed, validated name
 * @throws ValidationError if the name is invalid
 */
export function validateName(name: unknown): string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('Name is required and must be a non-empty string');
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`Name must not exceed ${MAX_NAME_LENGTH} characters`);
  }
  for (const pattern of FORBIDDEN_NAME_PATTERNS) {
    if (trimmed.includes(pattern)) {
      throw new ValidationError(`Name contains forbidden pattern: ${pattern}`);
    }
  }
  if (CONTROL_CHAR_REGEX.test(trimmed)) {
    throw new ValidationError('Name contains invalid control characters');
  }
  return trimmed;
}

/**
 * Validate file size.
 * @param size - File size in bytes
 * @returns The validated size
 * @throws ValidationError if size is invalid or exceeds 100 MB
 */
export function validateFileSize(size: unknown): number {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    throw new ValidationError('File size must be a positive number');
  }
  if (size > MAX_FILE_SIZE) {
    throw new ValidationError(`File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)} MB`);
  }
  return size;
}

/**
 * Validate a folder ID.
 * Must be a non-empty string — either 'ROOT' or a valid ULID.
 * @param id - Folder ID to validate
 * @returns The validated folder ID
 * @throws ValidationError if the ID is invalid
 */
export function validateFolderId(id: unknown): string {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new ValidationError('Folder ID is required');
  }
  return id.trim();
}

/**
 * Validate a MIME type string.
 * @param type - MIME type to validate
 * @returns The validated MIME type
 * @throws ValidationError if the MIME type is invalid
 */
export function validateMimeType(type: unknown): string {
  if (typeof type !== 'string' || type.trim().length === 0) {
    throw new ValidationError('MIME type is required');
  }
  // Basic MIME type format check: type/subtype
  const trimmed = type.trim();
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(trimmed)) {
    throw new ValidationError(`Invalid MIME type format: ${trimmed}`);
  }
  return trimmed;
}

/**
 * Safely parse the JSON request body from an API Gateway event.
 * @param event - API Gateway proxy event v2
 * @returns Parsed body as type T
 * @throws ValidationError if body is missing or not valid JSON
 */
export function parseBody<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) {
    throw new ValidationError('Request body is required');
  }
  try {
    const decoded = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    return JSON.parse(decoded) as T;
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

/**
 * JWT authorizer context shape from API Gateway HTTP API.
 * Typed separately because {@link APIGatewayProxyEventV2} doesn't include
 * the JWT-specific authorizer structure.
 */
interface JwtAuthorizerContext {
  jwt?: {
    claims?: Record<string, string>;
  };
}

/**
 * Extract the authenticated user's ID (sub) from the JWT authorizer context.
 * All Drive Lite API routes use a Cognito JWT authorizer, so the `jwt.claims`
 * path is always present for authenticated requests.
 * @param event - API Gateway proxy event v2
 * @returns The user's Cognito sub (userId)
 * @throws ValidationError with 403 status if the user ID is missing
 */
export function getUserId(event: APIGatewayProxyEventV2): string {
  // The base APIGatewayProxyEventV2 type doesn't include JWT authorizer fields.
  // All Drive Lite routes use JWT auth, so we safely extract claims here.
  const requestContext = event.requestContext as unknown as {
    authorizer?: JwtAuthorizerContext;
  };
  const sub = requestContext.authorizer?.jwt?.claims?.['sub'];
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new ValidationError('Unauthorized: missing user identity', 403);
  }
  return sub;
}
