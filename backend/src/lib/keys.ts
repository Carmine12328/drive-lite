/**
 * Build the partition key for a user's items.
 * @param userId - Cognito user sub
 * @returns `USER#{userId}`
 */
export function userPK(userId: string): string {
  return `USER#${userId}`;
}

/**
 * Build the sort key for a folder.
 * @param folderId - Folder ID (ULID or 'ROOT')
 * @returns `FOLDER#{folderId}`
 */
export function folderSK(folderId: string): string {
  return `FOLDER#${folderId}`;
}

/**
 * Build the partition key for a folder's items (files stored under this PK).
 * Includes the userId to enforce tenant isolation — files are scoped to the
 * owning user so cross-user folder ID guessing cannot leak data.
 * @param userId - Cognito user sub
 * @param folderId - Folder ID
 * @returns `USER#{userId}#FOLDER#{folderId}`
 */
export function folderPK(userId: string, folderId: string): string {
  return `USER#${userId}#FOLDER#${folderId}`;
}

/**
 * Build the sort key for a file.
 * @param fileId - File ID (ULID)
 * @returns `FILE#{fileId}`
 */
export function fileSK(fileId: string): string {
  return `FILE#${fileId}`;
}

/**
 * Build the sort key for a user profile.
 * @returns `PROFILE`
 */
export function profileSK(): string {
  return 'PROFILE';
}

/**
 * Build the partition key for trash items.
 * @param userId - Cognito user sub
 * @returns `TRASH#{userId}`
 */
export function trashPK(userId: string): string {
  return `TRASH#${userId}`;
}

/**
 * Build the S3 object key for a file.
 * Uses userId and fileId in the path for security and uniqueness.
 * The fileName is appended for human-readable S3 console browsing.
 * @param userId - Cognito user sub
 * @param fileId - File ID (ULID)
 * @param fileName - Original file name
 * @returns `users/{userId}/files/{fileId}/{fileName}`
 */
export function s3Key(userId: string, fileId: string, fileName: string): string {
  return `users/${userId}/files/${fileId}/${fileName}`;
}

/**
 * Build the partition key for a share link.
 * @param shareToken - Unique share token
 * @returns `SHARE#${shareToken}`
 */
export function sharePK(shareToken: string): string {
  return `SHARE#${shareToken}`;
}

/**
 * Build the sort key for a share link.
 * @returns `LINK`
 */
export function shareSK(): string {
  return 'LINK';
}

/**
 * Build the GSI1 partition key for listing shares owned by a user.
 * @param userId - Cognito user sub
 * @returns `USER#${userId}`
 */
export function shareGSI1PK(userId: string): string {
  return `USER#${userId}`;
}

/**
 * Build the GSI1 sort key for listing shares for a specific file.
 * @param fileId - File ID (ULID)
 * @param shareToken - Unique share token
 * @returns `SHARE#${fileId}#${shareToken}`
 */
export function shareGSI1SK(fileId: string, shareToken: string): string {
  return `SHARE#${fileId}#${shareToken}`;
}
