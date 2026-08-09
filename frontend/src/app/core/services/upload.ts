import { Service, inject, signal, computed, WritableSignal } from '@angular/core';
import { Observable } from 'rxjs';
import { FileService } from '../services/file.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { FileItem } from '../models/file-item.model';

export interface UploadTask {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  mimeType: string;
  folderId: string;
  progress: number;
  status: 'pending' | 'uploading' | 'confirming' | 'completed' | 'error' | 'cancelled';
  errorMessage?: string;
  fileId?: string;
}

/**
 * Service responsible for managing file uploads.
 *
 * Implements a 3-phase presigned URL upload pattern:
 * 1. Request — get a presigned URL + fileId from the API
 * 2. Upload — PUT the file directly to S3
 * 3. Confirm — notify the API that the upload completed
 *
 * Currently uses stubs for all three phases.
 */
@Service()
export class Upload {
  private fileService = inject(FileService);
  private toastService = inject(ToastService);

  /**
   * Queue of all upload tasks.
   */
  uploadQueue: WritableSignal<UploadTask[]> = signal([]);

  /**
   * Tasks that are actively uploading or confirming.
   */
  activeUploads = computed(() =>
    this.uploadQueue().filter(t => t.status === 'uploading' || t.status === 'confirming')
  );

  /**
   * Boolean indicating if there are active uploads.
   */
  hasActiveUploads = computed(() => this.activeUploads().length > 0);

  /**
   * Validates a file before upload.
   * @param file The file to validate.
   * @returns An error message if invalid, or null if valid.
   */
  validateFile(file: File): string | null {
    if (file.size > 100 * 1024 * 1024) {
      return `File "${file.name}" exceeds the 100 MB limit.`;
    }
    if (file.name.length > 255) {
      return `File name must be 255 characters or fewer.`;
    }
    if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\') || file.name.includes('\0')) {
      return `File name contains invalid characters.`;
    }
    return null;
  }

  /**
   * Updates a task immutably in the queue.
   * @param taskId The ID of the task to update.
   * @param updates The properties to update.
   */
  private updateTask(taskId: string, updates: Partial<UploadTask>): void {
    this.uploadQueue.update(tasks =>
      tasks.map(t => (t.id === taskId ? { ...t, ...updates } : t))
    );
  }

  /**
   * Simulates a delay for mocking async operations.
   * @param ms The duration in milliseconds.
   * @returns A promise that resolves after the specified delay.
   */
  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Initiates the file upload process.
   * @param file The file to upload.
   * @param folderId The ID of the folder to upload into.
   * @returns A promise that resolves when the upload workflow has started.
   */
  async uploadFile(file: File, folderId: string): Promise<void> {
    const errorMsg = this.validateFile(file);
    if (errorMsg) {
      // In a real app we might throw here or call toastService directly.
      // We'll throw so the caller knows it failed, though instructions didn't specify.
      throw new Error(errorMsg);
    }

    const taskId = crypto.randomUUID();
    const task: UploadTask = {
      id: taskId,
      file,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      folderId,
      progress: 0,
      status: 'pending'
    };

    this.uploadQueue.update(tasks => [...tasks, task]);

    await this.processUpload(taskId);
  }

  /**
   * Processes the upload through its three phases.
   * @param taskId The ID of the task to process.
   * @returns A promise that resolves when the processing finishes.
   */
  private async processUpload(taskId: string): Promise<void> {
    try {
      this.updateTask(taskId, { status: 'uploading', progress: 0 });
      let task = this.uploadQueue().find(t => t.id === taskId);
      if (!task) return;

      // Phase 1: Request presigned URL
      const { uploadUrl, fileId } = await this.requestPresignedUrl(task);
      this.updateTask(taskId, { fileId });
      
      task = this.uploadQueue().find(t => t.id === taskId);
      if (!task || task.status === 'cancelled') return;

      // Phase 2: Upload to S3
      await new Promise<void>((resolve, reject) => {
        const sub = this.uploadToS3(task as UploadTask, uploadUrl).subscribe({
          next: progress => {
            const currentTask = this.uploadQueue().find(t => t.id === taskId);
            if (!currentTask || currentTask.status === 'cancelled') {
              sub.unsubscribe();
              resolve();
              return;
            }
            this.updateTask(taskId, { progress });
          },
          error: err => {
            sub.unsubscribe();
            reject(err);
          },
          complete: () => {
            resolve();
          }
        });
      });
      
      task = this.uploadQueue().find(t => t.id === taskId);
      if (!task || task.status === 'cancelled') return;

      // Phase 3: Confirm Upload
      this.updateTask(taskId, { status: 'confirming' });
      await this.confirmUpload(task);

      this.updateTask(taskId, { status: 'completed', progress: 100 });
      // Assuming toastService has success method or similar. 
      // The instructions don't strictly require a toast here, but we inject it.
    } catch (error: any) {
      this.updateTask(taskId, { status: 'error', errorMessage: error.message || 'Upload failed' });
    }
  }

  /**
   * Cancels an active or pending upload task.
   * @param taskId The ID of the task to cancel.
   */
  cancelUpload(taskId: string): void {
    this.updateTask(taskId, { status: 'cancelled' });
    this.uploadQueue.update(tasks => tasks.filter(t => t.id !== taskId));
  }

  /**
   * Retries a failed or cancelled upload.
   * @param taskId The ID of the task to retry.
   * @returns A promise that resolves when the upload retry starts.
   */
  async retryUpload(taskId: string): Promise<void> {
    const task = this.uploadQueue().find(t => t.id === taskId);
    if (!task) return;
    this.updateTask(taskId, { status: 'pending', errorMessage: undefined, progress: 0 });
    await this.processUpload(taskId);
  }

  /**
   * Clears completed and cancelled tasks from the queue.
   */
  clearCompleted(): void {
    this.uploadQueue.update(tasks =>
      tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    );
  }

  // STUB: replace with actual API call to get presigned URL
  /**
   * Phase 1: Requests a presigned URL.
   * @param task The task requesting the URL.
   * @returns A promise resolving to the URL and file ID.
   */
  private async requestPresignedUrl(task: UploadTask): Promise<{ uploadUrl: string; fileId: string }> {
    await this.simulateDelay(500);
    return {
      uploadUrl: `https://fake-s3-bucket.amazonaws.com/${crypto.randomUUID()}`,
      fileId: crypto.randomUUID()
    };
  }

  // STUB: replace with actual S3 upload using HttpClient
  /**
   * Phase 2: Uploads the file to S3.
   * @param task The task to upload.
   * @param uploadUrl The presigned URL.
   * @returns An observable emitting progress percentage.
   */
  private uploadToS3(task: UploadTask, uploadUrl: string): Observable<number> {
    return new Observable<number>(observer => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
        observer.next(Math.min(progress, 100));
        if (progress >= 100) {
          clearInterval(interval);
          observer.complete();
        }
      }, 100); // 20 increments of 5% over 100ms = 2s total

      return () => clearInterval(interval);
    });
  }

  // STUB: replace with actual confirmation API call
  /**
   * Phase 3: Confirms the upload and adds the file locally.
   * @param task The uploaded task.
   * @returns A promise resolving when confirmation completes.
   */
  private async confirmUpload(task: UploadTask): Promise<void> {
    await this.simulateDelay(300);
    const newFileItem: FileItem = {
      fileId: task.fileId || crypto.randomUUID(),
      fileName: task.fileName,
      fileSize: task.fileSize,
      mimeType: task.mimeType,
      s3Key: `uploads/${task.folderId}/${task.fileName}`,
      folderId: task.folderId,
      userId: 'mock-user-id',
      uploadStatus: 'COMPLETED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.fileService.addFileLocally(newFileItem);
  }
}
