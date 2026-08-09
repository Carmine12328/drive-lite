import { inject, Service, signal, WritableSignal } from '@angular/core';
import { FileItem } from '../models/file-item.model';
import { ToastService } from '../../shared/components/toast/toast.service';

/**
 * Service for managing file operations and state.
 */
@Service()
export class FileService {
  private readonly toastService = inject(ToastService);

  /**
   * Internal mock data array containing all simulated files.
   */
  private readonly ALL_MOCK_FILES: FileItem[] = [
    {
      fileId: 'file-1',
      fileName: 'vacation-photo.jpg',
      fileSize: 3456789,
      mimeType: 'image/jpeg',
      s3Key: 'users/mock-user-id/files/file-1/vacation-photo.jpg',
      folderId: 'ROOT',
      userId: 'mock-user-id',
      uploadStatus: 'COMPLETED',
      createdAt: '2026-07-15T10:30:00Z',
      updatedAt: '2026-07-15T10:30:00Z',
    },
    {
      fileId: 'file-2',
      fileName: 'quarterly-report.pdf',
      fileSize: 1250000,
      mimeType: 'application/pdf',
      s3Key: 'users/mock-user-id/files/file-2/quarterly-report.pdf',
      folderId: 'folder-1',
      userId: 'mock-user-id',
      uploadStatus: 'COMPLETED',
      createdAt: '2026-07-20T14:15:00Z',
      updatedAt: '2026-07-21T09:00:00Z',
    },
    {
      fileId: 'file-3',
      fileName: 'budget-2026.xlsx',
      fileSize: 512000,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      s3Key: 'users/mock-user-id/files/file-3/budget-2026.xlsx',
      folderId: 'folder-1',
      userId: 'mock-user-id',
      uploadStatus: 'COMPLETED',
      createdAt: '2026-07-22T11:00:00Z',
      updatedAt: '2026-07-22T11:45:00Z',
    },
    {
      fileId: 'file-4',
      fileName: 'notes.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
      s3Key: 'users/mock-user-id/files/file-4/notes.txt',
      folderId: 'ROOT',
      userId: 'mock-user-id',
      uploadStatus: 'COMPLETED',
      createdAt: '2026-07-25T08:20:00Z',
      updatedAt: '2026-07-25T08:20:00Z',
    },
    {
      fileId: 'file-5',
      fileName: 'project-assets.zip',
      fileSize: 45000000,
      mimeType: 'application/zip',
      s3Key: 'users/mock-user-id/files/file-5/project-assets.zip',
      folderId: 'folder-2',
      userId: 'mock-user-id',
      uploadStatus: 'COMPLETED',
      createdAt: '2026-07-28T16:30:00Z',
      updatedAt: '2026-07-28T16:40:00Z',
    },
    {
      fileId: 'file-6',
      fileName: 'demo-recording.mp4',
      fileSize: 128000000,
      mimeType: 'video/mp4',
      s3Key: 'users/mock-user-id/files/file-6/demo-recording.mp4',
      folderId: 'folder-2',
      userId: 'mock-user-id',
      uploadStatus: 'COMPLETED',
      createdAt: '2026-08-01T13:00:00Z',
      updatedAt: '2026-08-01T13:30:00Z',
    },
    {
      fileId: 'file-7',
      fileName: 'logo-transparent.png',
      fileSize: 256000,
      mimeType: 'image/png',
      s3Key: 'users/mock-user-id/files/file-7/logo-transparent.png',
      folderId: 'ROOT',
      userId: 'mock-user-id',
      uploadStatus: 'COMPLETED',
      createdAt: '2026-08-05T09:10:00Z',
      updatedAt: '2026-08-05T09:10:00Z',
    },
    {
      fileId: 'file-8',
      fileName: 'invoice-1024.pdf',
      fileSize: 150000,
      mimeType: 'application/pdf',
      s3Key: 'users/mock-user-id/files/file-8/invoice-1024.pdf',
      folderId: 'folder-1',
      userId: 'mock-user-id',
      uploadStatus: 'COMPLETED',
      createdAt: '2026-08-08T15:20:00Z',
      updatedAt: '2026-08-08T15:20:00Z',
    },
  ];

  /**
   * Signal holding the currently loaded files.
   */
  public files: WritableSignal<FileItem[]> = signal<FileItem[]>([...this.ALL_MOCK_FILES]);

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
   * Filters the files by the specified folder ID and updates the files signal.
   * Excludes soft-deleted files (those with a `deletedAt` timestamp).
   * @param folderId The ID of the folder to list files for.
   */
  public listFiles(folderId: string): void {
    this.isLoading.set(true);
    const filteredFiles = this.ALL_MOCK_FILES.filter(
      (file) => file.folderId === folderId && !file.deletedAt,
    );
    this.files.set(filteredFiles);
    this.isLoading.set(false);
  }

  /**
   * Retrieves a single file from the mock data by its ID.
   * @param fileId The ID of the file to retrieve.
   * @returns The file item, or undefined if not found.
   */
  public getFile(fileId: string): FileItem | undefined {
    return this.ALL_MOCK_FILES.find((file) => file.fileId === fileId);
  }

  /**
   * Initiates a download for the specified file.
   *
   * STUB: Generates a placeholder blob and triggers a real browser download.
   * Replace with: POST /files/{id}/download-url → presigned GET → hidden <a> → click
   *
   * @param fileId The ID of the file to download
   */
  public downloadFile(fileId: string): void {
    const file = this.ALL_MOCK_FILES.find(f => f.fileId === fileId);
    if (!file) {
      this.toastService.error('File not found.');
      return;
    }

    // Generate a stub blob with placeholder content
    const content = `[Drive Lite stub download]\n\nFile: ${file.fileName}\nSize: ${file.fileSize} bytes\nType: ${file.mimeType}\nCreated: ${file.createdAt}\n\nThis is a placeholder download. Real file content will be served via presigned S3 URLs once the backend is connected.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    // Create a hidden anchor, trigger click, then clean up
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    this.toastService.info(`Download started: ${file.fileName}`);
  }

  /**
   * Renames a file in the mock data and updates the files signal.
   * @param fileId The ID of the file to rename.
   * @param newName The new name for the file.
   */
  public renameFile(fileId: string, newName: string): void {
    const index = this.ALL_MOCK_FILES.findIndex((file) => file.fileId === fileId);
    if (index !== -1) {
      this.ALL_MOCK_FILES[index] = {
        ...this.ALL_MOCK_FILES[index],
        fileName: newName,
        updatedAt: new Date().toISOString(),
      };
      
      // Update the signal to reflect changes, if it is currently in the active list
      this.files.update((currentFiles) => {
        return currentFiles.map((file) => 
          file.fileId === fileId ? { ...file, fileName: newName, updatedAt: new Date().toISOString() } : file
        );
      });
    }
  }

  /**
   * Soft-deletes a file by setting its `deletedAt` timestamp.
   * The file is removed from the current files signal but remains
   * in the mock data array for restoration from the Trash view.
   *
   * STUB: replace with real API call (PATCH /files/{id} with deletedAt)
   *
   * @param fileId The ID of the file to soft-delete.
   */
  public deleteFile(fileId: string): void {
    const index = this.ALL_MOCK_FILES.findIndex((file) => file.fileId === fileId);
    if (index !== -1) {
      this.ALL_MOCK_FILES[index] = {
        ...this.ALL_MOCK_FILES[index],
        deletedAt: new Date().toISOString(),
      };

      // Remove from current files signal (active view excludes deleted files)
      this.files.update((currentFiles) => currentFiles.filter((file) => file.fileId !== fileId));
      this.trashVersion.update(v => v + 1);
    }
  }

  /**
   * Calculates the total size of all files in the mock data.
   * @returns The total size in bytes.
   */
  public getTotalSize(): number {
    return this.ALL_MOCK_FILES
      .filter((file) => !file.deletedAt)
      .reduce((total, file) => total + file.fileSize, 0);
  }

  /**
   * Retrieves the total count of non-deleted files.
   * @returns The total number of active files.
   */
  public getTotalCount(): number {
    return this.ALL_MOCK_FILES.filter((file) => !file.deletedAt).length;
  }

  /**
   * Returns all non-deleted files regardless of folder.
   * Used by SearchService and Dashboard for cross-folder queries.
   *
   * @returns Array of all active (non-deleted) FileItems.
   */
  public getAllFiles(): FileItem[] {
    return this.ALL_MOCK_FILES.filter((file) => !file.deletedAt);
  }

  // --- Trash operations ---

  /**
   * Returns all soft-deleted files (those with a `deletedAt` timestamp).
   * Used by the Trash view to display deleted items.
   *
   * @returns Array of soft-deleted FileItems.
   */
  public getDeletedFiles(): FileItem[] {
    // Read trashVersion to establish a signal dependency — when trash
    // mutations bump this counter, any computed() calling this method re-runs.
    this.trashVersion();
    return this.ALL_MOCK_FILES.filter((file) => !!file.deletedAt);
  }

  /**
   * Restores a soft-deleted file by clearing its `deletedAt` timestamp.
   * The file becomes visible again in its original folder.
   *
   * STUB: replace with real API call (PATCH /files/{id} remove deletedAt)
   *
   * @param fileId The ID of the file to restore.
   */
  public restoreFile(fileId: string): void {
    const index = this.ALL_MOCK_FILES.findIndex((file) => file.fileId === fileId);
    if (index !== -1) {
      const { deletedAt, ...restored } = this.ALL_MOCK_FILES[index];
      this.ALL_MOCK_FILES[index] = restored as FileItem;
      this.trashVersion.update(v => v + 1);
    }
  }

  /**
   * Permanently removes a file from the mock data array.
   * This cannot be undone — the file is fully removed.
   *
   * STUB: replace with real API call (DELETE /files/{id})
   *
   * @param fileId The ID of the file to permanently delete.
   */
  public permanentlyDeleteFile(fileId: string): void {
    const index = this.ALL_MOCK_FILES.findIndex((file) => file.fileId === fileId);
    if (index !== -1) {
      this.ALL_MOCK_FILES.splice(index, 1);
      this.trashVersion.update(v => v + 1);
    }
  }

  /**
   * Permanently removes all soft-deleted files from the mock data.
   * Called by the "Empty Trash" action.
   *
   * STUB: replace with real API call (DELETE /files/trash)
   */
  public emptyTrash(): void {
    // Remove all files with deletedAt set — iterate in reverse to avoid index shifting
    for (let i = this.ALL_MOCK_FILES.length - 1; i >= 0; i--) {
      if (this.ALL_MOCK_FILES[i].deletedAt) {
        this.ALL_MOCK_FILES.splice(i, 1);
      }
    }
    this.trashVersion.update(v => v + 1);
  }

  /**
   * Adds a file to local state without an API call.
   * Used by UploadService after a successful upload to immediately
   * reflect the new file in the UI.
   *
   * @param file The FileItem to add to local state
   */
  public addFileLocally(file: FileItem): void {
    this.ALL_MOCK_FILES.push(file);
    this.files.update(current => [...current, file]);
  }
}
