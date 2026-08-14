/** Upload status for file items */
export type UploadStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

/** Entity type discriminator */
export type EntityType = 'FILE' | 'FOLDER' | 'USER_PROFILE' | 'SHARE_LINK';

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
  thumbnailKey?: string;    // S3 key for generated 200x200 webp thumbnail
  thumbnailSize?: number;   // Thumbnail size in bytes
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

/** DynamoDB share link item */
export interface ShareLinkItem {
  PK: string;                     // SHARE#{shareToken}
  SK: string;                     // LINK
  GSI1PK: string;                 // USER#{userId}
  GSI1SK: string;                 // SHARE#{fileId}#{shareToken}
  entityType: 'SHARE_LINK';
  shareToken: string;
  fileId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  passwordHash?: string;
  salt?: string;
  failedPasswordAttempts: number;
  maxDownloads?: number;
  downloadCount: number;
  expiresAt: string;              // ISO 8601
  ttl: number;                    // Unix epoch timestamp
  createdAt: string;              // ISO 8601
}

/** Request body for creating a share link */
export interface CreateShareRequest {
  expiresInHours: number;         // e.g. 1, 24, 168 (7d), 720 (30d)
  password?: string;
  maxDownloads?: number;
}

/** Response from creating a share link */
export interface ShareLinkResponse {
  shareToken: string;
  shareUrl: string;
  expiresAt: string;
  passwordProtected: boolean;
  maxDownloads?: number;
}

/** Public metadata response for a share link */
export interface ShareMetaResponse {
  fileName: string;
  fileSize: number;
  mimeType: string;
  passwordProtected: boolean;
  expiresAt: string;
  maxDownloads?: number;
  downloadCount: number;
}

/** Request body for downloading via share link */
export interface DownloadShareRequest {
  password?: string;
}

/** Response from downloading via share link */
export interface DownloadShareResponse {
  downloadUrl: string;
  fileName: string;
}

/** File version representation from S3 versioning */
export interface FileVersion {
  versionId: string;
  lastModified: string;
  size: number;
  isLatest: boolean;
  etag?: string;
}

/** Response from listing versions */
export interface ListVersionsResponse {
  versions: FileVersion[];
}

/** Request body for rolling back to a specific version */
export interface RollbackVersionRequest {
  versionId: string;
}

/** Response from rolling back to a version */
export interface RollbackVersionResponse {
  message: string;
  fileId: string;
  versionId: string;
  fileSize: number;
  updatedAt: string;
}

/** Response from AI summarization endpoint */
export interface SummarizeResponse {
  summary: string;
  modelUsed: string;
  sourceLength: number;
  wordCount: number;
  readingTimeMinutes: number;
}



