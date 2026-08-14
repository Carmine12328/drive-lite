import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { FileService } from '../../../core/services/file.service';
import { FileItem } from '../../../core/models/file-item.model';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { FilePreviewComponent, FilePreviewDialogData } from '../../file-browser/file-preview/file-preview.component';

export type CleanupTab = 'largest' | 'duplicates' | 'stuck';

export interface DuplicateGroup {
  name: string;
  size: number;
  files: FileItem[];
}

/**
 * CleanupAssistantComponent analyzes storage usage to provide actionable recommendations
 * for freeing space: largest files, exact duplicate candidates, and stuck uploads.
 */
@Component({
  selector: 'app-cleanup-assistant',
  templateUrl: './cleanup-assistant.component.html',
  styleUrl: './cleanup-assistant.component.scss',
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
})
export class CleanupAssistantComponent {
  private readonly fileService = inject(FileService);
  private readonly toastService = inject(ToastService);
  private readonly dialog = inject(MatDialog);

  /** Active cleanup tab */
  readonly activeTab = signal<CleanupTab>('largest');

  /** All unique loaded files */
  readonly allFiles = computed<FileItem[]>(() => {
    const files = this.fileService.files().concat(this.fileService.recentFiles());
    return Array.from(new Map(files.map(f => [f.fileId, f])).values());
  });

  /** Top 5 largest files consuming space */
  readonly largestFiles = computed<FileItem[]>(() => {
    return [...this.allFiles()]
      .filter(f => !f.deletedAt)
      .sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0))
      .slice(0, 5);
  });

  /** Groups of exact duplicates (same name and size) */
  readonly duplicateGroups = computed<DuplicateGroup[]>(() => {
    const map = new Map<string, FileItem[]>();
    for (const f of this.allFiles()) {
      if (f.deletedAt) continue;
      const key = `${f.fileName}___${f.fileSize}`;
      const list = map.get(key) || [];
      list.push(f);
      map.set(key, list);
    }

    const groups: DuplicateGroup[] = [];
    for (const [, list] of map.entries()) {
      if (list.length > 1) {
        groups.push({
          name: list[0].fileName,
          size: list[0].fileSize,
          files: list,
        });
      }
    }
    return groups;
  });

  /** Total count of files that are part of duplicate groups */
  readonly totalDuplicateFilesCount = computed(() => {
    return this.duplicateGroups().reduce((acc, g) => acc + g.files.length, 0);
  });

  /** Total count of redundant duplicate copies that can be cleaned up */
  readonly totalRedundantCopiesCount = computed(() => {
    return this.duplicateGroups().reduce((acc, g) => acc + (g.files.length - 1), 0);
  });

  /** Stuck or failed pending uploads */
  readonly stuckUploads = computed<FileItem[]>(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return this.allFiles().filter(
      f => f.uploadStatus === 'PENDING' && new Date(f.createdAt).getTime() < oneHourAgo
    );
  });

  /** Total potential space to clean up */
  readonly potentialSavingsBytes = computed(() => {
    let bytes = 0;
    // Count redundant duplicate copies
    for (const group of this.duplicateGroups()) {
      bytes += (group.files.length - 1) * group.size;
    }
    return bytes;
  });

  /** Formatted potential space savings */
  readonly formattedSavings = computed(() => this.formatBytes(this.potentialSavingsBytes()));

  /** Switch active tab */
  setTab(tab: CleanupTab): void {
    this.activeTab.set(tab);
  }

  /**
   * Cleans all redundant duplicate copies across all groups in one click,
   * keeping the original/first copy of each file.
   */
  onClearAllDuplicates(): void {
    const redundantFiles = this.duplicateGroups().flatMap(g => g.files.slice(1));
    if (redundantFiles.length === 0) return;

    const count = redundantFiles.length;
    const savings = this.formattedSavings();
    const groupCount = this.duplicateGroups().length;

    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Clean All Duplicates',
        message: `Delete ${count} redundant copies across ${groupCount} file groups to free up ${savings}? The original (first) version of each file will be kept.`,
        confirmText: `Delete ${count} Duplicates`,
        cancelText: 'Cancel',
        confirmColor: 'warn',
      } satisfies ConfirmDialogData,
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        for (const file of redundantFiles) {
          this.fileService.deleteFile(file.fileId);
        }
        this.toastService.success(`Deleted ${count} duplicate copies (${savings} freed)`);
        this.fileService.loadRecentFiles(50);
        this.fileService.listFiles('ROOT');
      }
    });
  }

  /**
   * Cleans redundant copies for a single duplicate group, keeping the first copy.
   * @param group The duplicate group to clean.
   */
  onCleanGroup(group: DuplicateGroup): void {
    const redundantFiles = group.files.slice(1);
    if (redundantFiles.length === 0) return;

    const count = redundantFiles.length;
    const savings = this.formatBytes(group.size * count);

    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        title: `Clean Duplicates: ${group.name}`,
        message: `Delete ${count} duplicate copy(ies) of "${group.name}" and keep the original? (${savings} freed)`,
        confirmText: `Delete ${count} Duplicates`,
        cancelText: 'Cancel',
        confirmColor: 'warn',
      } satisfies ConfirmDialogData,
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        for (const file of redundantFiles) {
          this.fileService.deleteFile(file.fileId);
        }
        this.toastService.success(`Deleted ${count} duplicate copies of "${group.name}"`);
        this.fileService.loadRecentFiles(50);
        this.fileService.listFiles('ROOT');
      }
    });
  }

  /** Preview a file in modal */
  onPreview(file: FileItem): void {
    this.dialog.open(FilePreviewComponent, {
      data: {
        file,
        allFiles: this.allFiles(),
      } satisfies FilePreviewDialogData,
      maxWidth: '100vw',
      maxHeight: '100vh',
      panelClass: 'preview-dialog-fullscreen',
    });
  }

  /** Delete a file with confirmation */
  onDelete(file: FileItem): void {
    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        title: 'Delete File',
        message: `Are you sure you want to delete "${file.fileName}"? It will be moved to Trash.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmColor: 'warn',
      } satisfies ConfirmDialogData,
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.fileService.deleteFile(file.fileId);
        this.toastService.success(`"${file.fileName}" moved to trash`);
        this.fileService.loadRecentFiles(50);
        this.fileService.listFiles('ROOT');
      }
    });
  }

  /** Formats bytes to readable string */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}
