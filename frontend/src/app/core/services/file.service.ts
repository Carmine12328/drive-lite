import { Service, signal, WritableSignal } from '@angular/core';
import { FileItem } from '../models/file-item.model';

/**
 * Service for managing file operations and state.
 */
@Service()
export class FileService {
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
   * Filters the files by the specified folder ID and updates the files signal.
   * @param folderId The ID of the folder to list files for.
   */
  public listFiles(folderId: string): void {
    this.isLoading.set(true);
    const filteredFiles = this.ALL_MOCK_FILES.filter((file) => file.folderId === folderId);
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
   * Currently a stub that logs to the console.
   * @param fileId The ID of the file to download.
   */
  public downloadFile(fileId: string): void {
    console.log(`Downloading file with ID: ${fileId}`);
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
   * Deletes a file from the mock data and updates the files signal.
   * @param fileId The ID of the file to delete.
   */
  public deleteFile(fileId: string): void {
    const index = this.ALL_MOCK_FILES.findIndex((file) => file.fileId === fileId);
    if (index !== -1) {
      this.ALL_MOCK_FILES.splice(index, 1);
      
      // Update the signal to reflect changes
      this.files.update((currentFiles) => currentFiles.filter((file) => file.fileId !== fileId));
    }
  }

  /**
   * Calculates the total size of all files in the mock data.
   * @returns The total size in bytes.
   */
  public getTotalSize(): number {
    return this.ALL_MOCK_FILES.reduce((total, file) => total + file.fileSize, 0);
  }

  /**
   * Retrieves the total count of files in the mock data.
   * @returns The total number of files.
   */
  public getTotalCount(): number {
    return this.ALL_MOCK_FILES.length;
  }
}
