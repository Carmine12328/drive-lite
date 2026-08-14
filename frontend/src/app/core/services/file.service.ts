import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FileItem } from '../models/file-item.model';
import { FileVersion, ListVersionsResponse, RollbackVersionResponse } from '../models/file-version.model';
import { ApiService } from './api.service';
import { ToastService } from '../../shared/components/toast/toast.service';



/**
 * Service for managing file operations and state.
 * Communicates with the backend API via ApiService.
 */
@Injectable({
  providedIn: 'root'
})
export class FileService {

  private readonly api = inject(ApiService);
  private readonly toastService = inject(ToastService);

  /**
   * Internal cache of all loaded files across folders.
   */
  private allFiles: FileItem[] = [];

  /**
   * Signal holding the currently loaded files for the active folder view.
   */
  public files: WritableSignal<FileItem[]> = signal<FileItem[]>([]);

  /**
   * Signal holding the currently active folder ID.
   */
  public currentFolderId: WritableSignal<string> = signal<string>('ROOT');

  /**
   * Signal indicating if a file operation is in progress.
   */
  public isLoading: WritableSignal<boolean> = signal<boolean>(false);

  /**
   * Signal holding the current error message, or null if no error.
   */
  public error: WritableSignal<string | null> = signal<string | null>(null);

  /**
   * Version counter that increments on every trash mutation.
   * Read by `getDeletedFiles()` to create a signal dependency so
   * consumers using `computed(() => getDeletedFiles())` re-evaluate.
   */
  private readonly trashVersion: WritableSignal<number> = signal<number>(0);

  /**
   * Signal holding the most recently modified files across all folders.
   * Populated by `loadRecentFiles()`.
   */
  public recentFiles: WritableSignal<FileItem[]> = signal<FileItem[]>([]);

  /**
   * Fetches the most recently modified files across all folders.
   * Uses GET /files/recent which queries GSI1 and sorts by updatedAt.
   *
   * @param limit Maximum number of files to return (default 10).
   */
  public async loadRecentFiles(limit = 10): Promise<void> {
    try {
      const params = new HttpParams().set('limit', limit.toString());
      const response = await firstValueFrom(
        this.api.get<{ files: FileItem[] }>('/files/recent', params)
      );
      this.recentFiles.set(response.files ?? []);
    } catch (err: unknown) {
      console.error('[FileService] loadRecentFiles error:', err);
    }
  }

  /**
   * Fetches files for the specified folder from the backend API.
   * Excludes soft-deleted files (those with a `deletedAt` timestamp).
   * @param folderId The ID of the folder to list files for.
   */
  public async listFiles(folderId: string): Promise<void> {
    this.currentFolderId.set(folderId);
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const params = new HttpParams().set('folderId', folderId);
      const response = await firstValueFrom(
        this.api.get<{ files: FileItem[] }>('/files', params)
      );

      const files = (response.files ?? []).filter(f => !f.deletedAt);
      this.files.set(files);

      // Merge into all-files cache
      for (const file of files) {
        const idx = this.allFiles.findIndex(f => f.fileId === file.fileId);
        if (idx >= 0) {
          this.allFiles[idx] = file;
        } else {
          this.allFiles.push(file);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load files';
      this.error.set(msg);
      console.error('[FileService] listFiles error:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Retrieves a single file from the internal cache by its ID.
   * @param fileId The ID of the file to retrieve.
   * @returns The file item, or undefined if not found.
   */
  public getFile(fileId: string): FileItem | undefined {
    return this.allFiles.find(f => f.fileId === fileId);
  }

  /**
   * Initiates a download for the specified file by requesting a
   * presigned download URL from the backend, then triggering a
   * browser download via a hidden anchor element.
   *
   * @param fileId The ID of the file to download
   */
  public async downloadFile(fileId: string): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.post<{ downloadUrl: string; fileName: string }>(
          `/files/${fileId}/download-url`, {}
        )
      );

      // Trigger browser download via hidden anchor
      const anchor = document.createElement('a');
      anchor.href = response.downloadUrl;
      anchor.download = response.fileName;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      this.toastService.info(`Download started: ${response.fileName}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      this.toastService.error(msg);
      console.error('[FileService] downloadFile error:', err);
    }
  }

  /**
   * Renames a file via the backend API and updates the files signal.
   * @param fileId The ID of the file to rename.
   * @param newName The new name for the file.
   */
  public async renameFile(fileId: string, newName: string): Promise<void> {
    this.error.set(null);

    try {
      await firstValueFrom(
        this.api.patch(`/files/${fileId}`, { name: newName })
      );

      // Update cache
      const idx = this.allFiles.findIndex(f => f.fileId === fileId);
      if (idx >= 0) {
        this.allFiles[idx] = { ...this.allFiles[idx], fileName: newName, updatedAt: new Date().toISOString() };
      }

      // Update signal
      this.files.update(currentFiles =>
        currentFiles.map(file =>
          file.fileId === fileId
            ? { ...file, fileName: newName, updatedAt: new Date().toISOString() }
            : file
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to rename file';
      this.error.set(msg);
      console.error('[FileService] renameFile error:', err);
    }
  }

  /**
   * Deletes a file via the backend API.
   * The backend performs a soft-delete for COMPLETED files
   * and a hard-delete for PENDING files.
   *
   * @param fileId The ID of the file to delete.
   */
  public async deleteFile(fileId: string): Promise<void> {
    this.error.set(null);

    try {
      await firstValueFrom(this.api.delete(`/files/${fileId}`));

      // Remove from cache and signal
      this.allFiles = this.allFiles.filter(f => f.fileId !== fileId);
      this.files.update(currentFiles => currentFiles.filter(file => file.fileId !== fileId));
      this.trashVersion.update(v => v + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete file';
      this.error.set(msg);
      console.error('[FileService] deleteFile error:', err);
    }
  }

  /**
   * Calculates the total size of all cached files.
   * @returns The total size in bytes.
   */
  public getTotalSize(): number {
    return this.allFiles
      .filter(file => !file.deletedAt)
      .reduce((total, file) => total + file.fileSize, 0);
  }

  /**
   * Retrieves the total count of non-deleted cached files.
   * @returns The total number of active files.
   */
  public getTotalCount(): number {
    return this.allFiles.filter(file => !file.deletedAt).length;
  }

  /**
   * Returns all non-deleted files from the cache regardless of folder.
   * Used by SearchService and Dashboard for cross-folder queries.
   *
   * @returns Array of all active (non-deleted) FileItems.
   */
  public getAllFiles(): FileItem[] {
    return this.allFiles.filter(file => !file.deletedAt);
  }

  // --- Trash operations ---

  /**
   * Signal holding the loaded trash files.
   * Populated by `loadTrash()`.
   */
  public trashFiles: WritableSignal<FileItem[]> = signal<FileItem[]>([]);

  /**
   * Returns all soft-deleted files.
   * Reads from the `trashFiles` signal, which is populated by `loadTrash()`.
   *
   * Also reads `trashVersion` so computed consumers re-evaluate on mutations
   * (restore, permanent delete, empty trash).
   *
   * @returns Array of soft-deleted FileItems.
   */
  public getDeletedFiles(): FileItem[] {
    this.trashVersion();
    return this.trashFiles();
  }

  /**
   * Loads soft-deleted files from the backend trash endpoint.
   * Queries the TRASH#{userId} partition via GET /trash/files.
   */
  public async loadTrash(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(
        this.api.get<{ files: FileItem[] }>('/trash/files'),
      );
      this.trashFiles.set(response.files);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load trash';
      this.error.set(msg);
      console.error('[FileService] loadTrash error:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Restores a soft-deleted file back to its original parent folder.
   * Calls POST /files/{id}/restore.
   *
   * @param fileId The ID of the file to restore.
   */
  public async restoreFile(fileId: string): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.post<{ message: string; file: FileItem }>(`/files/${fileId}/restore`, {}),
      );

      // Remove from trash signals
      this.trashFiles.update(list => list.filter(f => f.fileId !== fileId));

      // Add to active files list if available
      if (response.file) {
        const restored = response.file;
        const exists = this.allFiles.some(f => f.fileId === fileId);
        if (!exists) {
          this.allFiles.push(restored);
        } else {
          const idx = this.allFiles.findIndex(f => f.fileId === fileId);
          this.allFiles[idx] = restored;
        }

        if (restored.folderId === this.currentFolderId()) {
          this.files.update(current => {
            const idx = current.findIndex(f => f.fileId === fileId);
            return idx !== -1 ? current.map((f, i) => i === idx ? restored : f) : [...current, restored];
          });
        }
      }

      this.trashVersion.update(v => v + 1);
    } catch (err: unknown) {
      console.error('[FileService] restoreFile error:', err);
      throw err;
    }
  }

  /**
   * Permanently removes a soft-deleted file from trash and storage.
   * Calls DELETE /trash/files/{id}.
   *
   * @param fileId The ID of the file to permanently delete.
   */
  public async permanentlyDeleteFile(fileId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.api.delete<{ message: string }>(`/trash/files/${fileId}`),
      );

      this.trashFiles.update(list => list.filter(f => f.fileId !== fileId));
      this.allFiles = this.allFiles.filter(f => f.fileId !== fileId);
      this.files.update(list => list.filter(f => f.fileId !== fileId));
      this.trashVersion.update(v => v + 1);
    } catch (err: unknown) {
      console.error('[FileService] permanentlyDeleteFile error:', err);
      throw err;
    }
  }

  /**
   * Permanently removes all soft-deleted files from trash and storage.
   * Calls DELETE /trash/files.
   */
  public async emptyTrash(): Promise<void> {
    try {
      await firstValueFrom(
        this.api.delete<{ message: string; deletedCount: number }>('/trash/files'),
      );

      const deletedIds = new Set(this.trashFiles().map(f => f.fileId));
      this.trashFiles.set([]);
      this.allFiles = this.allFiles.filter(f => !deletedIds.has(f.fileId));
      this.files.update(list => list.filter(f => !deletedIds.has(f.fileId)));
      this.trashVersion.update(v => v + 1);
    } catch (err: unknown) {
      console.error('[FileService] emptyTrash error:', err);
      throw err;
    }
  }

  /**
   * Adds a file to local state without an API call.
   * Used by UploadService after a successful upload to immediately
   * reflect the new file in the UI.
   *
   * @param file The FileItem to add to local state
   */
  public addFileLocally(file: FileItem): void {
    this.allFiles.push(file);
    this.files.update(current => [...current, file]);
  }

  /**
   * Fetches all S3 object versions for a file.
   * Calls GET /files/{id}/versions.
   *
   * @param fileId The ID of the file to list versions for.
   * @returns Array of FileVersion objects.
   */
  public async listVersions(fileId: string): Promise<FileVersion[]> {
    try {
      const response = await firstValueFrom(
        this.api.get<ListVersionsResponse>(`/files/${fileId}/versions`)
      );
      return response.versions ?? [];
    } catch (err: unknown) {
      console.error('[FileService] listVersions error:', err);
      throw err;
    }
  }

  /**
   * Restores a file to a previous S3 version.
   * Calls POST /files/{id}/rollback.
   *
   * @param fileId The ID of the file to rollback.
   * @param versionId The target version ID to restore.
   * @returns Details of the rolled-back version.
   */
  public async rollbackVersion(fileId: string, versionId: string): Promise<RollbackVersionResponse> {
    try {
      const response = await firstValueFrom(
        this.api.post<RollbackVersionResponse>(`/files/${fileId}/rollback`, { versionId })
      );

      // Update local file record with new size and timestamp
      this.files.update(list => list.map(f => {
        if (f.fileId === fileId) {
          return {
            ...f,
            fileSize: response.fileSize,
            updatedAt: response.updatedAt
          };
        }
        return f;
      }));

      this.toastService.success('File restored to selected version');
      return response;
    } catch (err: unknown) {
      console.error('[FileService] rollbackVersion error:', err);
      this.toastService.error('Failed to rollback file version');
      throw err;
    }
  }
}


