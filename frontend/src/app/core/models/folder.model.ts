/**
 * Represents a folder's metadata as stored in DynamoDB.
 */
export interface Folder {
  /** Unique identifier for the folder */
  folderId: string;
  /** Name of the folder */
  folderName: string;
  /** Parent folder ID ("ROOT" for top-level folders) */
  parentFolderId: string;
  /** Timestamp when the record was created in ISO 8601 format */
  createdAt: string;
  /** Timestamp when the record was last updated in ISO 8601 format */
  updatedAt: string;
}
