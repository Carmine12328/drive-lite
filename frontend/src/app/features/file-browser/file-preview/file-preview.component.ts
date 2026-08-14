import { Component, computed, effect, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';

import { FileItem } from '../../../core/models/file-item.model';
import { FileService } from '../../../core/services/file.service';
import { ApiService } from '../../../core/services/api.service';
import { FileIconPipe } from '../../../shared/pipes/file-icon.pipe';

import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { ShareDialog } from '../../../shared/components/share-dialog/share-dialog';
import { VersionHistoryComponent, VersionHistoryResult } from '../version-history/version-history.component';
import { FileEditorComponent } from '../file-editor/file-editor.component';
import { ToastService } from '../../../shared/components/toast/toast.service';

/**
 * Data passed to the file preview dialog.
 */
export interface FilePreviewDialogData {
  /** The initially selected file to preview */
  file: FileItem;
  /** All available files for navigation (prev/next) */
  allFiles: FileItem[];
}

/**
 * Dialog component for previewing files (images, PDFs, text, code, or fallback).
 * Fetches presigned download URLs from the backend to render real file content
 * and provides in-browser editing via CodeMirror 6.
 */
@Component({
  selector: 'app-file-preview',
  imports: [
    MatIcon,
    MatIconButton,
    MatButton,
    MatTooltip,
    MatDialogTitle,
    FileIconPipe,
    FileSizePipe,
    DatePipe,
    FileEditorComponent
  ],
  templateUrl: './file-preview.component.html',
  styleUrl: './file-preview.component.scss',
  host: {
    '(document:keydown)': 'onKeydown($event)'
  }
})
export class FilePreviewComponent {
  private readonly dialogRef = inject(MatDialogRef<FilePreviewComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly data = inject<FilePreviewDialogData>(MAT_DIALOG_DATA);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly fileService = inject(FileService);
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly toastService = inject(ToastService);

  /** All available files for navigation */
  readonly allFiles = this.data.allFiles;

  /** The currently previewed file */
  readonly currentFile = signal<FileItem>(this.data.file);

  /** Toggles the info sidebar visibility */
  readonly showInfo = signal<boolean>(true);

  /** Text content fetched from S3 for text/* files */
  readonly textContent = signal<string>('');

  /** Whether the file is currently being edited in CodeMirror */
  readonly isEditing = signal<boolean>(false);

  /** Whether a save operation is in progress */
  readonly isSaving = signal<boolean>(false);

  /** Local edited content buffer */
  readonly editedContent = signal<string>('');

  /** Whether the preview content is currently loading */
  readonly isLoadingPreview = signal<boolean>(false);

  /**
   * Computed property for the preview type based on the MIME type and file extension.
   */
  readonly previewType = computed<'image' | 'pdf' | 'text' | 'video' | 'audio' | 'unsupported'>(() => {
    const file = this.currentFile();
    const mimeType = file.mimeType || '';
    const name = file.fileName.toLowerCase();
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/javascript' ||
      mimeType === 'application/typescript' ||
      name.match(/\.(txt|md|markdown|json|js|ts|tsx|jsx|html|htm|css|scss|sass|py|yaml|yml|xml|sh|env|sql|csv)$/i)
    ) {
      return 'text';
    }
    return 'unsupported';
  });


  /**
   * Presigned URL for the current file, fetched from the backend.
   * Used for image, video, and audio previews.
   */
  readonly previewUrl = signal<string>('');

  /**
   * Safe resource URL for PDF preview (iframe src).
   */
  readonly safePdfUrl = signal<SafeResourceUrl | null>(null);

  /**
   * Presigned URL for video/audio media preview.
   */
  readonly mediaUrl = signal<string>('');

  /** Current index in the files list */
  readonly currentIndex = computed(() => this.allFiles.findIndex(f => f.fileId === this.currentFile().fileId));

  /** Whether there is a previous file to navigate to */
  readonly hasPrev = computed(() => this.currentIndex() > 0);

  /** Whether there is a next file to navigate to */
  readonly hasNext = computed(() => this.currentIndex() < this.allFiles.length - 1);

  constructor() {
    // Fetch a presigned URL whenever the current file changes
    effect(() => {
      const file = this.currentFile();
      this.loadPreview(file);
    });
  }

  /**
   * Fetches a presigned download URL from the backend and updates
   * the appropriate preview signal based on the file's MIME type.
   *
   * @param file The file to load a preview for.
   */
  private async loadPreview(file: FileItem): Promise<void> {
    // Reset previous preview state
    this.previewUrl.set('');
    this.safePdfUrl.set(null);
    this.mediaUrl.set('');
    this.textContent.set('');
    this.isLoadingPreview.set(true);

    try {
      const response = await firstValueFrom(
        this.api.post<{ downloadUrl: string; fileName: string }>(
          `/files/${file.fileId}/download-url`, {}
        )
      );

      const url = response.downloadUrl;
      const type = this.previewType();

      switch (type) {
        case 'image':
          this.previewUrl.set(url);
          break;
        case 'pdf':
          this.safePdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
          break;
        case 'video':
        case 'audio':
          this.mediaUrl.set(url);
          break;
        case 'text':
          // Fetch the actual text content from S3
          await this.loadTextContent(url);
          break;
      }
    } catch (err) {
      console.error('[FilePreview] Failed to load preview URL:', err);
      this.textContent.set('Preview unavailable — failed to load file.');
    } finally {
      this.isLoadingPreview.set(false);
    }
  }

  /**
   * Fetches text content from the presigned S3 URL.
   *
   * @param url The presigned download URL.
   */
  private async loadTextContent(url: string): Promise<void> {
    try {
      const content = await firstValueFrom(
        this.http.get(url, { responseType: 'text' })
      );
      this.textContent.set(content);
    } catch (err) {
      console.error('[FilePreview] Failed to load text content:', err);
      this.textContent.set('Unable to load text content.');
    }
  }

  /**
   * Closes the dialog.
   */
  close(): void {
    this.dialogRef.close();
  }

  /**
   * Navigates to the previous file if available.
   */
  navigatePrev(): void {
    if (this.hasPrev()) {
      this.currentFile.set(this.allFiles[this.currentIndex() - 1]);
    }
  }

  /**
   * Navigates to the next file if available.
   */
  navigateNext(): void {
    if (this.hasNext()) {
      this.currentFile.set(this.allFiles[this.currentIndex() + 1]);
    }
  }

  /**
   * Handles keyboard events for navigation and closing.
   * @param event The keyboard event.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      this.navigatePrev();
    } else if (event.key === 'ArrowRight') {
      this.navigateNext();
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  /**
   * Initiates download for the current file.
   */
  onDownload(): void {
    this.fileService.downloadFile(this.currentFile().fileId);
  }

  /**
   * Opens the share dialog for the currently previewed file.
   */
  onShare(): void {
    this.dialog.open(ShareDialog, {
      width: '540px',
      panelClass: 'drive-dialog',
      data: { file: this.currentFile() },
      ariaLabel: `Share ${this.currentFile().fileName} dialog`,
    });
  }

  /**
   * Opens the version history dialog for the currently previewed file.
   */
  onVersionHistory(): void {
    this.dialog.open(VersionHistoryComponent, {
      width: '560px',
      panelClass: 'drive-dialog',
      data: { file: this.currentFile() },
      ariaLabel: `Version history for ${this.currentFile().fileName}`,
    }).afterClosed().subscribe((res: VersionHistoryResult | undefined) => {
      if (res?.rolledBack) {
        // Fetch new download URL and refresh current preview content
        this.loadPreview(this.currentFile());
      }
    });
  }


  /**
   * Toggles in-browser editing mode for editable documents.
   */
  toggleEdit(): void {
    if (!this.isEditing()) {
      this.editedContent.set(this.textContent());
    }
    this.isEditing.update(v => !v);
  }

  /**
   * Updates edited content buffer as user types in CodeMirror.
   */
  onContentChange(text: string): void {
    this.editedContent.set(text);
  }

  /**
   * Saves edited text back to S3 by creating an updated upload and confirming it.
   * This creates a new version in S3 and updates the metadata record.
   */
  async onSaveContent(text?: string): Promise<void> {
    const contentToSave = text ?? this.editedContent();
    const file = this.currentFile();
    if (this.isSaving()) return;

    this.isSaving.set(true);

    try {
      const mime = file.mimeType || 'text/plain';
      const blob = new Blob([contentToSave], { type: mime });

      // 1. Obtain presigned upload URL
      const uploadRes = await firstValueFrom(
        this.api.post<{ uploadUrl: string; fileId: string; s3Key: string }>('/files/upload-url', {
          fileName: file.fileName,
          fileSize: blob.size,
          mimeType: mime,
          folderId: file.folderId || 'ROOT'
        })
      );

      // 2. PUT updated blob directly to S3
      const s3PutRes = await fetch(uploadRes.uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': mime
        }
      });

      if (!s3PutRes.ok) {
        throw new Error(`S3 PUT failed with status ${s3PutRes.status}`);
      }

      // 3. Confirm upload with backend
      const confirmRes = await firstValueFrom(
        this.api.post<{ message: string; file: FileItem }>('/files/confirm-upload', {
          fileId: uploadRes.fileId
        })
      );

      // 4. Update local state
      this.textContent.set(contentToSave);
      this.currentFile.set(confirmRes.file);
      this.isEditing.set(false);
      this.toastService.success('File saved successfully (new version created)');
    } catch (err: unknown) {
      console.error('[FilePreview] Error saving file:', err);
      this.toastService.error('Failed to save file');
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Toggles the info sidebar visibility.
   */
  toggleInfo(): void {
    this.showInfo.update(v => !v);
  }
}



