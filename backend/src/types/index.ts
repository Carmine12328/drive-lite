/** Upload status for file items */
export type UploadStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

/** Entity type discriminator */
export type EntityType = 'FILE' | 'FOLDER' | 'USER_PROFILE';

/** DynamoDB folder item */
export interface FolderItem {
  PK: string;               // USER#{userId}
  SK: string;               // FOLDER#{folderId}
  GSI1PK: string;           // USER#{userId}
  GSI1SK: string;           // FOLDER#{folderId}
  entityType: 'FOLDER';
  folderId: string;
  folderName: string;
  parentFolderId: string;   // 'ROOT' for top-level
  userId: string;
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
}

/** DynamoDB file item */
export interface FileItem {
  PK: string;               // USER#{userId}#FOLDER#{folderId}
  SK: string;               // FILE#{fileId}
  GSI1PK: string;           // USER#{userId}
  GSI1SK: string;           // FILE#{fileId}
  entityType: 'FILE';
  fileId: string;
  fileName: string;
  fileSize: number;         // bytes
  mimeType: string;
  s3Key: string;
  folderId: string;
  userId: string;
  uploadStatus: UploadStatus;
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
  // Soft-delete fields (present only when trashed)
  deletedAt?: string;       // ISO 8601
  originalPK?: string;      // Original PK before trash move
  ttl?: number;             // Unix epoch for DynamoDB TTL auto-cleanup
}

/** DynamoDB user profile item */
export interface UserProfile {
  PK: string;               // USER#{userId}
  SK: string;               // PROFILE
  entityType: 'USER_PROFILE';
  userId: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

/** Request body for creating a folder */
export interface CreateFolderRequest {
  folderName: string;
  parentFolderId: string;   // 'ROOT' for top-level folders
}

/** Request body for renaming a folder/file */
export interface RenameRequest {
  name: string;
}

/** Request body for getting an upload presigned URL */
export interface GetUploadUrlRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  folderId: string;
}

/** Response from getting an upload URL */
export interface GetUploadUrlResponse {
  uploadUrl: string;
  fileId: string;
  s3Key: string;
}

/** Request body for confirming upload completion */
export interface ConfirmUploadRequest {
  fileId: string;
}

/** Standard API error response shape */
export interface ApiErrorResponse {
  message: string;
  code?: string;
}

/**
 * Custom error for input validation failures.
 * Carries an HTTP status code for the response builder.
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
