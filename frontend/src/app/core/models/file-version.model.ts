/**
 * Represents an S3 object version for a file in Drive Lite.
 */
export interface FileVersion {
  /** S3 version identifier */
  versionId: string;
  /** Timestamp when this version was created/modified in ISO 8601 */
  lastModified: string;
  /** Size of this version in bytes */
  size: number;
  /** Whether this version is the current active version */
  isLatest: boolean;
  /** ETag of the version */
  etag?: string;
}

/**
 * Response from the GET /files/{id}/versions endpoint.
 */
export interface ListVersionsResponse {
  versions: FileVersion[];
}

/**
 * Response from the POST /files/{id}/rollback endpoint.
 */
export interface RollbackVersionResponse {
  message: string;
  fileId: string;
  versionId: string;
  fileSize: number;
  updatedAt: string;
}
