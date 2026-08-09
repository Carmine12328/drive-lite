---
name: s3-presigned-upload
description: Implements the S3 presigned URL upload flow for Drive Lite. Covers the 3-phase pattern, progress tracking with HttpClient, queue management with Angular Signals, and client-side validation.
---

# S3 Presigned URL Upload Flow

This skill describes how to handle direct-to-S3 file uploads in Angular 22 using presigned URLs. This pattern offloads file streams from Lambda functions directly to S3.

## The 3-Phase Upload Flow

1. **Request**: POST to `/files/upload-url` with file metadata to get a presigned `uploadUrl` and a `fileId`.
2. **Upload**: PUT the file to S3 using the `uploadUrl` and track progress via `HttpClient`.
3. **Confirm**: POST to `/files/{fileId}/confirm` to finalize the upload in DynamoDB.

## 1. The UploadTask Interface

Use signals to model the state of each upload task.

```typescript
import { WritableSignal } from '@angular/core';

export interface UploadTask {
  fileId?: string; // Assigned after phase 1
  fileName: string;
  fileSize: number;
  file: File;
  progress: WritableSignal<number>;
  status: WritableSignal<'queued' | 'uploading' | 'confirming' | 'completed' | 'failed' | 'cancelled'>;
  abortController: AbortController;
  error?: string;
}
```

## 2. UploadService Design (Angular 22)

The service manages an upload queue using signals and enforces a concurrency limit.

```typescript
import { Service, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { firstValueFrom, of, interval } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UploadTask } from '../models/upload-task.model';

@Service()
export class UploadService {
  private http = inject(HttpClient);
  
  // State
  private uploadQueue = signal<UploadTask[]>([]);
  
  // Derived state
  activeUploads = computed(() => this.uploadQueue().filter(t => t.status() === 'uploading' || t.status() === 'confirming'));
  completedUploads = computed(() => this.uploadQueue().filter(t => t.status() === 'completed'));
  
  private maxConcurrent = 3;

  // Validation settings
  private MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

  addFiles(files: File[]) {
    const newTasks: UploadTask[] = files.map(file => ({
      fileName: file.name,
      fileSize: file.size,
      file,
      progress: signal(0),
      status: signal<'queued'>('queued'),
      abortController: new AbortController()
    }));

    // Client-side validation
    const validTasks = newTasks.filter(t => t.fileSize <= this.MAX_FILE_SIZE);
    
    if (validTasks.length < newTasks.length) {
      console.warn('Some files exceeded the 100MB limit.');
    }

    this.uploadQueue.update(q => [...q, ...validTasks]);
    this.processQueue();
  }

  cancelUpload(task: UploadTask) {
    if (task.status() !== 'completed' && task.status() !== 'failed') {
      task.abortController.abort();
      task.status.set('cancelled');
      this.processQueue();
    }
  }

  private processQueue() {
    const activeCount = this.activeUploads().length;
    if (activeCount >= this.maxConcurrent) return;

    const nextTask = this.uploadQueue().find(t => t.status() === 'queued');
    if (nextTask) {
      this.executeUpload(nextTask);
      this.processQueue(); // Check if we can start more
    }
  }

  private async executeUpload(task: UploadTask) {
    task.status.set('uploading');

    try {
      // Phase 1: Request URL
      const { uploadUrl, fileId } = await this.requestUploadUrl(task.fileName, task.file.type);
      task.fileId = fileId;

      // Phase 2: Upload to S3
      await this.uploadToS3(uploadUrl, task);

      if (task.abortController.signal.aborted) return;

      // Phase 3: Confirm
      task.status.set('confirming');
      await this.confirmUpload(fileId);

      task.status.set('completed');
    } catch (err: any) {
      if (task.abortController.signal.aborted) {
        task.status.set('cancelled');
      } else {
        task.status.set('failed');
        task.error = err.message || 'Upload failed';
      }
    } finally {
      this.processQueue();
    }
  }

  private requestUploadUrl(fileName: string, mimeType: string): Promise<{ uploadUrl: string, fileId: string }> {
    return firstValueFrom(this.http.post<{ uploadUrl: string, fileId: string }>('/api/files/upload-url', { fileName, mimeType }));
  }

  private uploadToS3(uploadUrl: string, task: UploadTask): Promise<void> {
    return new Promise((resolve, reject) => {
      task.abortController.signal.addEventListener('abort', () => reject(new Error('Aborted')));

      this.http.put(uploadUrl, task.file, {
        reportProgress: true,
        observe: 'events',
        headers: { 'Content-Type': task.file.type }
      }).subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const percent = Math.round((100 * event.loaded) / event.total);
            task.progress.set(percent);
          } else if (event.type === HttpEventType.Response) {
            resolve();
          }
        },
        error: (err) => reject(err)
      });
    });
  }

  private confirmUpload(fileId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`/api/files/${fileId}/confirm`, {}));
  }
}
```

## 3. Mock Implementation for Dev

To work offline or before the backend is ready, simulate the process:

```typescript
  private async executeUploadStub(task: UploadTask) {
    task.status.set('uploading');
    
    // Simulate progress
    for (let i = 0; i <= 100; i += 10) {
      if (task.abortController.signal.aborted) throw new Error('Aborted');
      task.progress.set(i);
      await new Promise(r => setTimeout(r, 200));
    }
    
    task.status.set('confirming');
    await new Promise(r => setTimeout(r, 500));
    task.status.set('completed');
  }
```
