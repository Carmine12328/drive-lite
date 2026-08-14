import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { FileService } from '../../../core/services/file.service';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';

/**
 * Floating contextual toolbar for batch operations on selected files.
 * Provides client-side ZIP download, batch delete, select all, and clear actions.
 */
@Component({
  selector: 'app-selection-toolbar',
  templateUrl: './selection-toolbar.component.html',
  styleUrl: './selection-toolbar.component.scss',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
})
export class SelectionToolbarComponent {
  readonly fileService = inject(FileService);
  private readonly dialog = inject(MatDialog);

  /** Loading state for client-side ZIP generation */
  readonly isZipping = signal<boolean>(false);

  /**
   * Bundles all selected files into a ZIP and triggers browser download.
   */
  async onDownloadZip(): Promise<void> {
    const selected = this.fileService.selectedFiles();
    if (selected.length === 0 || this.isZipping()) return;

    this.isZipping.set(true);
    try {
      await this.fileService.downloadAsZip(selected);
    } catch (err: unknown) {
      console.error('[SelectionToolbar] onDownloadZip error:', err);
    } finally {
      this.isZipping.set(false);
    }
  }

  /**
   * Opens confirmation dialog and batch-deletes all selected files.
   */
  onBatchDelete(): void {
    const count = this.fileService.selectionCount();
    if (count === 0) return;

    const data: ConfirmDialogData = {
      title: 'Move Selected Files to Trash',
      message: `Are you sure you want to move ${count} selected file${count > 1 ? 's' : ''} to trash?`,
      confirmText: 'Move to Trash',
      confirmColor: 'warn',
    };

    this.dialog.open(ConfirmDialog, {
      width: '420px',
      panelClass: 'drive-dialog',
      data,
      ariaLabel: 'Batch delete confirmation dialog',
    }).afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        const fileIds = Array.from(this.fileService.selectedFileIds());
        await this.fileService.batchDelete(fileIds);
      }
    });
  }

  /**
   * Selects all files in current folder.
   */
  onSelectAll(): void {
    this.fileService.selectAll();
  }

  /**
   * Clears selection.
   */
  onClearSelection(): void {
    this.fileService.clearSelection();
  }
}
