import { Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton, MatFabButton } from '@angular/material/button';
import {
  MatTable,
  MatHeaderCell,
  MatCell,
  MatHeaderRow,
  MatRow,
  MatColumnDef,
  MatHeaderCellDef,
  MatCellDef,
  MatHeaderRowDef,
  MatRowDef
} from '@angular/material/table';
import { MatTooltip } from '@angular/material/tooltip';

import { FileIconPipe } from '../../../shared/pipes/file-icon.pipe';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { FileItem } from '../../../core/models/file-item.model';

/**
 * FileListComponent displays a list of files in either grid or list view.
 */
@Component({
  selector: 'app-file-list',
  templateUrl: './file-list.component.html',
  styleUrl: './file-list.component.scss',
  imports: [
    MatIcon,
    MatIconButton,
    MatFabButton,
    MatTable,
    MatHeaderCell,
    MatCell,
    MatHeaderRow,
    MatRow,
    MatColumnDef,
    MatHeaderCellDef,
    MatCellDef,
    MatHeaderRowDef,
    MatRowDef,
    MatTooltip,
    DatePipe,
    FileIconPipe,
    FileSizePipe
  ]
})
export class FileListComponent {
  /** Array of files to display */
  files = input<FileItem[]>([]);
  
  /** Current view mode: 'grid' or 'list' */
  viewMode = input<'grid' | 'list'>('grid');
  
  /** Current field used for sorting */
  sortField = input<string>('fileName');
  
  /** Current sort direction: 'asc' or 'desc' */
  sortDirection = input<'asc' | 'desc'>('asc');
  
  /** Emits when a file action (preview, download, rename, delete) is triggered */
  fileAction = output<{ action: string; file: FileItem }>();
  
  /** Emits when the sort order changes */
  sortChange = output<{ field: string; direction: 'asc' | 'desc' }>();
  
  /** Emits when a context menu is requested on a file */
  fileContextMenu = output<{ event: MouseEvent; file: FileItem }>();
  
  /** Emits when the upload action is clicked from empty state */
  uploadRequest = output<void>();

  /** Computed signal determining if the file list is empty */
  isEmpty = computed(() => this.files().length === 0);

  /** Computed signal containing sorted files based on sortField and sortDirection */
  sortedFiles = computed(() => {
    const files = [...this.files()];
    const field = this.sortField();
    const dir = this.sortDirection() === 'asc' ? 1 : -1;

    return files.sort((a, b) => {
      if (field === 'fileSize') {
        return (a.fileSize - b.fileSize) * dir;
      }

      if (field === 'updatedAt') {
        return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
      }

      // Default: string comparison on fileName or any other string field
      const valA = String(a[field as keyof FileItem] ?? '').toLowerCase();
      const valB = String(b[field as keyof FileItem] ?? '').toLowerCase();

      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  });

  /** Columns to display in the list view */
  displayedColumns = ['icon', 'fileName', 'fileSize', 'updatedAt', 'actions'];

  /** Handles clicking on a file to preview */
  onFileClick(file: FileItem): void {
    this.fileAction.emit({ action: 'preview', file });
  }

  /** Handles the download action */
  onDownload(event: Event, file: FileItem): void {
    event.stopPropagation();
    this.fileAction.emit({ action: 'download', file });
  }

  /** Handles the rename action */
  onRename(event: Event, file: FileItem): void {
    event.stopPropagation();
    this.fileAction.emit({ action: 'rename', file });
  }

  /** Handles the delete action */
  onDelete(event: Event, file: FileItem): void {
    event.stopPropagation();
    this.fileAction.emit({ action: 'delete', file });
  }

  /** Handles right click on a file */
  onContextMenu(event: MouseEvent, file: FileItem): void {
    event.preventDefault();
    this.fileContextMenu.emit({ event, file });
  }

  /** Handles column sort toggling */
  onSort(field: string): void {
    if (this.sortField() === field) {
      this.sortChange.emit({
        field,
        direction: this.sortDirection() === 'asc' ? 'desc' : 'asc'
      });
    } else {
      this.sortChange.emit({ field, direction: 'asc' });
    }
  }

  /** Handles empty state upload button click */
  onUploadClick(): void {
    this.uploadRequest.emit();
  }
}
