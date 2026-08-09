import { Component, computed, effect, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton, MatButton } from '@angular/material/button';
import { DatePipe } from '@angular/common';

import { FileItem } from '../../../core/models/file-item.model';
import { FileService } from '../../../core/services/file.service';
import { FileIconPipe } from '../../../shared/pipes/file-icon.pipe';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';

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
 * Dialog component for previewing files (images, PDFs, text, or fallback).
 */
@Component({
  selector: 'app-file-preview',
  imports: [
    MatIcon,
    MatIconButton,
    MatButton,
    MatDialogTitle,
    FileIconPipe,
    FileSizePipe,
    DatePipe
  ],
  templateUrl: './file-preview.component.html',
  styleUrl: './file-preview.component.scss',
  host: {
    '(document:keydown)': 'onKeydown($event)'
  }
})
export class FilePreviewComponent {
  private readonly dialogRef = inject(MatDialogRef<FilePreviewComponent>);
  private readonly data = inject<FilePreviewDialogData>(MAT_DIALOG_DATA);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly fileService = inject(FileService);

  /** All available files for navigation */
  readonly allFiles = this.data.allFiles;

  /** The currently previewed file */
  readonly currentFile = signal<FileItem>(this.data.file);

  /** Toggles the info sidebar visibility */
  readonly showInfo = signal<boolean>(true);

  /** Mock text content for text/* files */
  readonly textContent = signal<string>('');

  /**
   * Computed property for the preview type based on the MIME type.
   */
  readonly previewType = computed<'image' | 'pdf' | 'text' | 'video' | 'audio' | 'unsupported'>(() => {
    const mimeType = this.currentFile().mimeType;
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('text/')) return 'text';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'unsupported';
  });

  /**
   * Computed property for the image preview URL.
   */
  readonly previewUrl = computed<string>(() => {
    if (this.previewType() === 'image') {
      return `https://picsum.photos/seed/${this.currentFile().fileId}/800/600`;
    }
    return '';
  });

  /**
   * Computed property for the PDF preview URL.
   */
  readonly safePdfUrl = computed<SafeResourceUrl | null>(() => {
    if (this.previewType() === 'pdf') {
      // Stub for PDF preview
      return this.sanitizer.bypassSecurityTrustResourceUrl('');
    }
    return null;
  });

  /**
   * Computed URL for video/audio preview.
   * STUB: Uses public sample media. Replace with presigned S3 URLs.
   */
  readonly mediaUrl = computed<string>(() => {
    const type = this.previewType();
    if (type === 'video') {
      // Short sample trailer with CORS headers. Replace with presigned S3 URLs.
      return 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-576p.mp4';
    }
    if (type === 'audio') {
      return 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
    }
    return '';
  });

  /** Current index in the files list */
  readonly currentIndex = computed(() => this.allFiles.findIndex(f => f.fileId === this.currentFile().fileId));

  /** Whether there is a previous file to navigate to */
  readonly hasPrev = computed(() => this.currentIndex() > 0);

  /** Whether there is a next file to navigate to */
  readonly hasNext = computed(() => this.currentIndex() < this.allFiles.length - 1);

  constructor() {
    effect(() => {
      if (this.previewType() === 'text') {
        this.textContent.set('This is mock text content for previewing text files.\n\nLine 2\nLine 3');
      } else {
        this.textContent.set('');
      }
    });
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
   * Toggles the info sidebar visibility.
   */
  toggleInfo(): void {
    this.showInfo.update(v => !v);
  }
}
