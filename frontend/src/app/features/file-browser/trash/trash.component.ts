import { Component, computed, inject, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

import { FileService } from '../../../core/services/file.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { FileIconPipe } from '../../../shared/pipes/file-icon.pipe';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { FileItem } from '../../../core/models/file-item.model';

/**
 * Trash view component for managing soft-deleted files.
 * Loads trashed files from the backend on init via GET /trash/files.
 */
@Component({
  selector: 'app-trash',
  templateUrl: './trash.component.html',
  styleUrl: './trash.component.scss',
  imports: [
    DatePipe,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    MatTooltipModule,
    FileIconPipe,
    FileSizePipe,
  ]
})
export class TrashComponent implements OnInit {
  private readonly fileService = inject(FileService);
  private readonly toastService = inject(ToastService);
  private readonly dialog = inject(MatDialog);

  /** Reactive list of trashed files */
  trashedFiles = computed(() => this.fileService.getDeletedFiles());

  /** Computed flag if trash is empty */
  isEmpty = computed(() => this.trashedFiles().length === 0);

  /** Load trashed files from the backend on component init. */
  ngOnInit(): void {
    this.fileService.loadTrash();
  }

  /**
   * Restores a file to its original location
   * @param file The file item to restore
   */
  async restoreFile(file: FileItem): Promise<void> {
    try {
      await this.fileService.restoreFile(file.fileId);
      this.toastService.success(`Restored ${file.fileName}`);
    } catch {
      this.toastService.error(`Failed to restore ${file.fileName}`);
    }
  }

  /**
   * Prompts for permanent deletion of a single file
   * @param file The file item to permanently delete
   */
  confirmPermanentDelete(file: FileItem): void {
    const dialogRef = this.dialog.open<ConfirmDialog, ConfirmDialogData>(ConfirmDialog, {
      data: {
        title: 'Delete Permanently',
        message: `Are you sure you want to permanently delete "${file.fileName}"? This action cannot be undone.`,
        confirmText: 'Delete',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        try {
          await this.fileService.permanentlyDeleteFile(file.fileId);
          this.toastService.success(`Permanently deleted ${file.fileName}`);
        } catch {
          this.toastService.error(`Failed to delete ${file.fileName}`);
        }
      }
    });
  }

  /**
   * Prompts to empty the entire trash
   */
  confirmEmptyTrash(): void {
    const dialogRef = this.dialog.open<ConfirmDialog, ConfirmDialogData>(ConfirmDialog, {
      data: {
        title: 'Empty Trash',
        message: 'Empty trash? This cannot be undone.',
        confirmText: 'Empty Trash',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        try {
          await this.fileService.emptyTrash();
          this.toastService.success('Trash emptied');
        } catch {
          this.toastService.error('Failed to empty trash');
        }
      }
    });
  }
}
