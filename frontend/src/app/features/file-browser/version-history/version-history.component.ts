import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { FileItem } from '../../../core/models/file-item.model';
import { FileVersion } from '../../../core/models/file-version.model';
import { FileService } from '../../../core/services/file.service';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { FileIconPipe } from '../../../shared/pipes/file-icon.pipe';

/**
 * Data passed into VersionHistoryComponent dialog.
 */
export interface VersionHistoryData {
  file: FileItem;
}

/**
 * Result returned when VersionHistory dialog closes.
 */
export interface VersionHistoryResult {
  rolledBack?: boolean;
  versionId?: string;
}

/**
 * VersionHistoryComponent displays a timeline of previous S3 versions of a file
 * and allows users to roll back to any historical version.
 */
@Component({
  selector: 'app-version-history',
  templateUrl: './version-history.component.html',
  styleUrl: './version-history.component.scss',
  imports: [
    CommonModule,
    DatePipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule,
    FileSizePipe,
    FileIconPipe,
  ],
})
export class VersionHistoryComponent implements OnInit {
  readonly data = inject<VersionHistoryData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<VersionHistoryComponent, VersionHistoryResult>);
  private readonly fileService = inject(FileService);

  readonly file = this.data.file;

  /** Versions list */
  readonly versions = signal<FileVersion[]>([]);
  /** Loading indicator */
  readonly isLoading = signal<boolean>(true);
  /** Version ID currently being rolled back */
  readonly rollingBackVersionId = signal<string | null>(null);
  /** Error message if fetch fails */
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadVersions();
  }

  /**
   * Fetches version history for the active file.
   */
  async loadVersions(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const list = await this.fileService.listVersions(this.file.fileId);
      // Sort with latest on top
      list.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      this.versions.set(list);
    } catch (err: unknown) {
      console.error('[VersionHistory] loadVersions error:', err);
      this.error.set('Could not load version history for this file.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Triggers a rollback to the chosen version.
   * @param version The FileVersion to restore.
   */
  async onRollback(version: FileVersion): Promise<void> {
    if (version.isLatest || this.rollingBackVersionId()) return;

    this.rollingBackVersionId.set(version.versionId);
    try {
      await this.fileService.rollbackVersion(this.file.fileId, version.versionId);
      this.dialogRef.close({ rolledBack: true, versionId: version.versionId });
    } catch (err: unknown) {
      console.error('[VersionHistory] rollback error:', err);
    } finally {
      this.rollingBackVersionId.set(null);
    }
  }

  /**
   * Truncates version ID for concise display.
   */
  shortVersionId(versionId: string): string {
    if (!versionId || versionId === 'null') return 'initial';
    return versionId.length > 12 ? `${versionId.slice(0, 10)}...` : versionId;
  }
}
