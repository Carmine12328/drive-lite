import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { Upload, UploadTask } from '../../../core/services/upload';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { ProgressBarComponent } from '../../../shared/components/progress-bar/progress-bar.component';
import { FileIconPipe } from '../../../shared/pipes/file-icon.pipe';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';

/**
 * Data passed to the upload dialog when opened.
 */
export interface UploadDialogData {
  /** Target folder ID for uploaded files. */
  folderId: string;
  /** Optional pre-selected files (e.g., from drag-and-drop on the browser). */
  initialFiles?: File[];
}

/**
 * Upload dialog component — provides drag-and-drop and file picker UI
 * for uploading files to the current folder.
 *
 * Features:
 * - Drag-and-drop zone with visual feedback
 * - "Browse Files" button triggering a hidden file input
 * - Per-file progress bars with cancel buttons
 * - "Upload All" / "Cancel All" / "Close" footer actions
 * - Client-side validation (100 MB limit, invalid characters)
 *
 * Opened via MatDialog from FileBrowserComponent.
 */
@Component({
  selector: 'app-upload-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    ProgressBarComponent,
    FileIconPipe,
    FileSizePipe,
  ],
  templateUrl: './upload-dialog.html',
  styleUrl: './upload-dialog.css',
})
export class UploadDialog {
  private readonly dialogRef = inject(MatDialogRef<UploadDialog>);
  private readonly data = inject<UploadDialogData>(MAT_DIALOG_DATA);
  private readonly toastService = inject(ToastService);
  readonly uploadService = inject(Upload);

  /** Signal tracking whether a drag is currently over the dropzone. */
  readonly isDragOver = signal(false);

  /** Counter to handle nested element dragenter/dragleave correctly. */
  private dragCounter = 0;

  /** Files queued locally before the user clicks "Upload All". */
  readonly pendingFiles = signal<File[]>([]);

  /** The target folder ID for uploads. */
  readonly folderId = this.data.folderId;

  constructor() {
    // If files were pre-selected (e.g., from drag-and-drop on the browser),
    // add them to the pending queue immediately.
    if (this.data.initialFiles?.length) {
      this.pendingFiles.set([...this.data.initialFiles]);
    }
  }

  // -- Drag & Drop Handlers --

  /**
   * Prevents default browser behavior on dragover to allow drop.
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  /**
   * Tracks drag enter events with a counter to handle nested elements.
   */
  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter++;
    this.isDragOver.set(true);
  }

  /**
   * Decrements drag counter; only deactivates visual feedback when truly left.
   */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter--;
    if (this.dragCounter === 0) {
      this.isDragOver.set(false);
    }
  }

  /**
   * Handles file drop — extracts files and adds to pending queue.
   */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter = 0;
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.addFiles(Array.from(files));
    }
  }

  /**
   * Handles files selected via the native file input.
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.addFiles(Array.from(input.files));
      input.value = ''; // Reset so the same file can be selected again
    }
  }

  /**
   * Validates and adds files to the pending queue.
   * Shows toast for rejected files.
   */
  private addFiles(files: File[]): void {
    const valid: File[] = [];
    for (const file of files) {
      const error = this.uploadService.validateFile(file);
      if (error) {
        this.toastService.error(error);
      } else {
        valid.push(file);
      }
    }
    if (valid.length > 0) {
      this.pendingFiles.update(current => [...current, ...valid]);
    }
  }

  /**
   * Removes a file from the pending queue by index.
   */
  removePendingFile(index: number): void {
    this.pendingFiles.update(files => files.filter((_, i) => i !== index));
  }

  /**
   * Uploads all pending files via the UploadService.
   */
  uploadAll(): void {
    const files = this.pendingFiles();
    this.pendingFiles.set([]);
    for (const file of files) {
      this.uploadService.uploadFile(file, this.folderId);
    }
  }

  /**
   * Cancels all active uploads.
   */
  cancelAll(): void {
    const active = this.uploadService.uploadQueue().filter(
      t => t.status === 'uploading' || t.status === 'pending' || t.status === 'confirming'
    );
    for (const task of active) {
      this.uploadService.cancelUpload(task.id);
    }
  }

  /**
   * Maps UploadTask status to ProgressBar status.
   */
  getProgressStatus(task: UploadTask): 'uploading' | 'complete' | 'error' {
    switch (task.status) {
      case 'completed': return 'complete';
      case 'error': return 'error';
      default: return 'uploading';
    }
  }

  /**
   * Closes the dialog, clearing completed uploads.
   */
  onClose(): void {
    this.uploadService.clearCompleted();
    this.dialogRef.close();
  }
}
