/**
 * Frontend representation of a share link item.
 */
export interface ShareLinkItem {
  shareToken: string;
  shareUrl: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  passwordProtected: boolean;
  expiresAt: string;
  maxDownloads?: number;
  downloadCount: number;
  failedPasswordAttempts: number;
  isExpired: boolean;
  isMaxReached: boolean;
  isLocked: boolean;
  createdAt: string;
}

/**
 * Payload for creating a new share link.
 */
export interface CreateShareRequest {
  expiresInHours: number;
  password?: string;
  maxDownloads?: number;
}

/**
 * API response when a share link is created.
 */
export interface ShareLinkResponse {
  shareToken: string;
  shareUrl: string;
  expiresAt: string;
  passwordProtected: boolean;
  maxDownloads?: number;
}

/**
 * Public metadata response for a share link.
 */
export interface ShareMetaResponse {
  fileName: string;
  fileSize: number;
  mimeType: string;
  passwordProtected: boolean;
  expiresAt: string;
  maxDownloads?: number;
  downloadCount: number;
}

/**
 * Response when downloading a share.
 */
export interface DownloadShareResponse {
  downloadUrl: string;
  fileName: string;
}
