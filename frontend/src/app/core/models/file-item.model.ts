/**
 * Represents a file's metadata as stored in DynamoDB.
 */
export interface FileItem {
  /** Unique identifier for the file */
  fileId: string;
  /** Name of the file */
  fileName: string;
  /** Size of the file in bytes */
  fileSize: number;
  /** MIME type of the file (e.g. 'application/pdf', 'image/png') */
  mimeType: string;
  /** S3 key under which the file binary is stored */
  s3Key: string;
  /** Folder ID containing this file ('ROOT' for top-level) */
  folderId: string;
  /** Owner user ID */
  userId: string;
  /** Current status of the file upload */
  uploadStatus: 'PENDING' | 'COMPLETED' | 'FAILED';
  /** Timestamp when the record was created in ISO 8601 format */
  createdAt: string;
  /** Timestamp when the record was last updated in ISO 8601 format */
  updatedAt: string;
  /** Timestamp when the record was soft-deleted (trash), if applicable */
  deletedAt?: string;
}
