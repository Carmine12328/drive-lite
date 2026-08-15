import { Service, inject, signal, computed, WritableSignal } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { FileService } from '../services/file.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { ApiService } from '../services/api.service';
import { AuthService } from '../auth/auth.service';
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
  s3Key?: string;
}

/**
 * Generates a unique UUID v4.
 * Uses crypto.randomUUID() when in a Secure Context (HTTPS/localhost),
 * and provides a fallback when running on plain HTTP (e.g. S3 website endpoints).
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Response from POST /files/upload-url */
interface UploadUrlResponse {
  uploadUrl: string;
  fileId: string;
  s3Key: string;
}

/**
 * Service responsible for managing file uploads.
 *
 * Implements a 3-phase presigned URL upload pattern:
 * 1. Request — get a presigned URL + fileId from the API
 * 2. Upload — PUT the file directly to S3 via the presigned URL
 * 3. Confirm — notify the API that the upload completed
 */
@Service()
export class Upload {
  private readonly fileService = inject(FileService);
  private readonly toastService = inject(ToastService);
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

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
   * Initiates the file upload process.
   * @param file The file to upload.
   * @param folderId The ID of the folder to upload into.
   * @returns A promise that resolves when the upload workflow has started.
   */
  async uploadFile(file: File, folderId: string): Promise<void> {
    const errorMsg = this.validateFile(file);
    if (errorMsg) {
      throw new Error(errorMsg);
    }

    const taskId = generateUUID();
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

      // Phase 1: Request presigned URL from API
      const { uploadUrl, fileId, s3Key } = await this.requestPresignedUrl(task);
      this.updateTask(taskId, { fileId, s3Key });

      task = this.uploadQueue().find(t => t.id === taskId);
      if (!task || task.status === 'cancelled') return;

      // Phase 2: Upload to S3 via presigned URL
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
      this.toastService.info(`Upload complete: ${task.fileName}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Upload failed';
      this.updateTask(taskId, { status: 'error', errorMessage: msg });
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

  /**
   * Phase 1: Requests a presigned URL from the backend API.
   * @param task The task requesting the URL.
   * @returns A promise resolving to the URL, file ID, and S3 key.
   */
  private async requestPresignedUrl(task: UploadTask): Promise<UploadUrlResponse> {
    return firstValueFrom(
      this.api.post<UploadUrlResponse>('/files/upload-url', {
        fileName: task.fileName,
        fileSize: task.fileSize,
        mimeType: task.mimeType,
        folderId: task.folderId,
      })
    );
  }

  /**
   * Phase 2: Uploads the file directly to S3 via the presigned URL.
   * Uses HttpClient with progress reporting.
   *
   * @param task The task to upload.
   * @param uploadUrl The presigned URL.
   * @returns An observable emitting progress percentage.
   */
  private uploadToS3(task: UploadTask, uploadUrl: string): Observable<number> {
    // LocalStack presigned URLs may use Docker-internal IPs (e.g. 172.18.0.2:4566)
    // that aren't reachable from the browser. Replace with localhost.
    const fixedUrl = uploadUrl.replace(
      /^(https?:\/\/)[^/:]+(:4566)/,
      '$1localhost$2'
    );

    return new Observable<number>(observer => {
      const sub = this.http.put(fixedUrl, task.file, {
        headers: { 'Content-Type': task.mimeType },
        reportProgress: true,
        observe: 'events',
      }).subscribe({
        next: event => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const pct = Math.round((event.loaded / event.total) * 100);
            observer.next(pct);
          } else if (event.type === HttpEventType.Response) {
            observer.next(100);
            observer.complete();
          }
        },
        error: err => observer.error(err),
      });

      return () => sub.unsubscribe();
    });
  }

  /**
   * Phase 3: Confirms the upload with the backend API and adds the file to local state.
   * @param task The uploaded task.
   * @returns A promise resolving when confirmation completes.
   */
  private async confirmUpload(task: UploadTask): Promise<void> {
    await firstValueFrom(
      this.api.post('/files/confirm-upload', { fileId: task.fileId })
    );

    // Add the file to local state so it appears in the UI immediately
    const newFileItem: FileItem = {
      fileId: task.fileId || generateUUID(),
      fileName: task.fileName,
      fileSize: task.fileSize,
      mimeType: task.mimeType,
      s3Key: task.s3Key || `uploads/${task.folderId}/${task.fileName}`,
      folderId: task.folderId,
      userId: this.authService.getCurrentUser()?.userId ?? 'unknown',
      uploadStatus: 'COMPLETED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.fileService.addFileLocally(newFileItem);
  }
}
