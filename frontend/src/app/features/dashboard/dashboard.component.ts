import { Component, OnInit, inject, computed } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { AuthService } from '../../core/auth/auth.service';
import { FileService } from '../../core/services/file.service';
import { FolderService } from '../../core/services/folder.service';

/**
 * Dashboard component displaying user stats, recent files, and quick actions.
 * Serves as the authenticated home page after sign-in.
 */
@Component({
  selector: 'app-dashboard',
  imports: [MatIcon, MatButton],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly fileService = inject(FileService);
  private readonly folderService = inject(FolderService);

  /** Computed signal for the current user's email address. */
  readonly userEmail = computed(() => this.authService.currentUser()?.email ?? 'User');

  /** Computed signal for the total count of files. */
  readonly totalFiles = computed(() => this.fileService.getTotalCount());

  /** Computed signal for the total count of folders. */
  readonly totalFolders = computed(() => this.folderService.getTotalCount());

  /** Computed signal for formatted storage used. */
  readonly storageUsed = computed(() => this.formatBytes(this.fileService.getTotalSize()));

  /**
   * Computed signal for the last 5 uploaded files, sorted by creation date descending.
   * Maps each file to include pre-formatted display values for the template.
   */
  readonly recentFiles = computed(() => {
    const files = this.fileService.files();
    return [...files]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((file) => ({
        ...file,
        formattedSize: this.formatBytes(file.fileSize),
        formattedDate: this.formatDate(file.createdAt),
        icon: this.getFileIcon(file.mimeType)
      }));
  });

  /** Initializes the component by fetching ROOT files and all folders. */
  ngOnInit(): void {
    this.fileService.listFiles('ROOT');
    this.folderService.listFolders();
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
