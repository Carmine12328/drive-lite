import { Component, OnInit, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltip } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { FileService } from '../../core/services/file.service';
import { FolderService } from '../../core/services/folder.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { FileItem } from '../../core/models/file-item.model';
import { FilePreviewComponent, FilePreviewDialogData } from '../file-browser/file-preview/file-preview.component';
import { ConfirmDialog, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog';
import { StorageAnalyticsComponent } from './storage-analytics/storage-analytics.component';
import { CleanupAssistantComponent } from './cleanup-assistant/cleanup-assistant.component';

/**
 * Dashboard component displaying user stats, recent files, and quick actions.
 * Serves as the authenticated home page after sign-in.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    MatIcon,
    MatButton,
    MatIconButton,
    MatTooltip,
    StorageAnalyticsComponent,
    CleanupAssistantComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {

  private readonly authService = inject(AuthService);
  private readonly fileService = inject(FileService);
  private readonly folderService = inject(FolderService);
  private readonly toastService = inject(ToastService);
  private readonly dialog = inject(MatDialog);

  /** Computed signal for the current user's email address. */
  readonly userEmail = computed(() => this.authService.currentUser()?.email ?? 'User');

  /** Computed signal for the total count of files. */
  readonly totalFiles = computed(() => this.fileService.getTotalCount());

  /** Computed signal for the total count of folders. */
  readonly totalFolders = computed(() => this.folderService.getTotalCount());

  /** Computed signal for formatted storage used. */
  readonly storageUsed = computed(() => this.formatBytes(this.fileService.getTotalSize()));

  /**
   * Computed signal for the most recently modified files across all folders.
   * Data is pre-sorted by the backend (updatedAt descending).
   * Maps each file to include pre-formatted display values for the template.
   */
  readonly recentFiles = computed(() => {
    const files = this.fileService.recentFiles();
    return files.map((file) => ({
      ...file,
      formattedSize: this.formatBytes(file.fileSize),
      formattedDate: this.formatDate(file.updatedAt),
      icon: this.getFileIcon(file.mimeType)
    }));
  });

  /** Initializes the component by fetching recent files and folders. */
  ngOnInit(): void {
    this.fileService.loadRecentFiles(5);
    this.folderService.listFolders();
  }

  /**
   * Opens the file preview dialog for a recent file.
   * @param file The file to preview.
   */
  onPreviewFile(file: FileItem): void {
    const allFiles = this.fileService.recentFiles();
    const data: FilePreviewDialogData = {
      file,
      allFiles,
    };

    this.dialog.open(FilePreviewComponent, {
      width: '95vw',
      maxWidth: '95vw',
      height: '90vh',
      maxHeight: '95vh',
      panelClass: 'file-preview-dialog-panel',
      autoFocus: false,
      data,
    });
  }

  /**
   * Triggers a download for the specified file.
   * @param file The file to download.
   */
  onDownloadFile(file: FileItem): void {
    this.fileService.downloadFile(file.fileId);
  }

  /**
   * Opens a confirmation dialog and deletes the file if confirmed.
   * Refreshes the recent files list after deletion.
   * @param file The file to delete.
   */
  onDeleteFile(file: FileItem): void {
    const data: ConfirmDialogData = {
      title: 'Delete File',
      message: `Are you sure you want to delete "${file.fileName}"? This action cannot be undone.`,
      confirmText: 'Delete',
      confirmColor: 'warn',
    };

    this.dialog.open(ConfirmDialog, {
      width: '400px',
      panelClass: 'drive-dialog',
      data,
      ariaLabel: 'Delete file confirmation',
    }).afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.fileService.deleteFile(file.fileId);
        this.toastService.success(`"${file.fileName}" deleted`);
        // Refresh recent files after deletion
        this.fileService.loadRecentFiles(5);
      }
    });
  }

  /**
   * Formats a number of bytes into a human-readable string.
   * @param bytes The number of bytes.
   * @returns A formatted string (e.g., "1.5 MB").
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Formats an ISO date string into a locale-aware short date.
   * @param date The ISO date string to format.
   * @returns A formatted date string (e.g., "Aug 5, 2026").
   */
  formatDate(date: string): string {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Determines the Material icon to display based on the MIME type.
   * @param mimeType The file's MIME type.
   * @returns The name of the Material icon.
   */
  getFileIcon(mimeType: string): string {
    if (!mimeType) return 'insert_drive_file';
    const lower = mimeType.toLowerCase();

    if (lower.includes('pdf')) return 'description';
    if (lower.includes('image')) return 'image';
    if (lower.includes('text')) return 'text_snippet';
    if (lower.includes('zip') || lower.includes('compressed')) return 'folder_zip';
    if (lower.includes('video')) return 'movie';
    if (lower.includes('spreadsheet') || lower.includes('excel') || lower.includes('csv')) return 'table_chart';

    return 'insert_drive_file';
  }

  /** Stub — upload file action (wired in Step 7). */
  onUploadFile(): void {
    console.debug('[Dashboard] Upload file stub');
  }

  /** Stub — create new folder action (wired in Step 7). */
  onNewFolder(): void {
    console.debug('[Dashboard] New folder stub');
  }
}
