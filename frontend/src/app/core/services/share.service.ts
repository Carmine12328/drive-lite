import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import {
  ShareLinkItem,
  CreateShareRequest,
  ShareLinkResponse,
  ShareMetaResponse,
  DownloadShareResponse,
} from '../models/share-link.model';

/**
 * Service for managing file sharing links and public downloads.
 */
@Injectable({
  providedIn: 'root',
})
export class ShareService {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  /**
   * Creates a secure, expiring share link for a file.
   * @param fileId ID of the file to share
   * @param req Configuration options (expiration, password, download limit)
   */
  async createShare(fileId: string, req: CreateShareRequest): Promise<ShareLinkResponse> {
    try {
      const response = await firstValueFrom(
        this.api.post<ShareLinkResponse>(`/files/${fileId}/share`, req)
      );
      this.toast.success('Share link created successfully');
      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create share link';
      this.toast.error(msg);
      throw err;
    }
  }

  /**
   * Lists all active share links for a file.
   * @param fileId ID of the file
   */
  async listShares(fileId: string): Promise<ShareLinkItem[]> {
    try {
      const response = await firstValueFrom(
        this.api.get<{ shares: ShareLinkItem[] }>(`/files/${fileId}/shares`)
      );
      return response.shares;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load share links';
      this.toast.error(msg);
      throw err;
    }
  }

  /**
   * Revokes an existing share link.
   * @param token Share link token
   */
  async revokeShare(token: string): Promise<void> {
    try {
      await firstValueFrom(
        this.api.delete<{ message: string }>(`/share/${token}`)
      );
      this.toast.success('Share link revoked');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke share link';
      this.toast.error(msg);
      throw err;
    }
  }

  /**
   * Public: retrieves metadata for a shared file (unauthenticated).
   * @param token Share link token
   */
  async getShareMeta(token: string): Promise<ShareMetaResponse> {
    return firstValueFrom(
      this.api.get<ShareMetaResponse>(`/share/${token}`)
    );
  }

  /**
   * Public: requests a presigned download URL for a shared file.
   * @param token Share link token
   * @param password Optional password if link is protected
   */
  async downloadShare(token: string, password?: string): Promise<DownloadShareResponse> {
    return firstValueFrom(
      this.api.post<DownloadShareResponse>(`/share/${token}/download`, { password })
    );
  }
}
