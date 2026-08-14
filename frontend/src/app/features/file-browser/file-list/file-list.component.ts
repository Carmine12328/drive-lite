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
import { Folder } from '../../../core/models/folder.model';

/**
 * Interface representing a row item in the list view (file or folder).
 */
export interface FileListRow {
  id: string;
  name: string;
  type: 'folder' | 'file';
  size: number;
  updatedAt: string;
  mimeType: string;
  raw: FileItem | Folder;
}

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

  /** Array of child folders to display at the top of the list */
  folders = input<Folder[]>([]);

  /** Whether the file list is currently loading */
  isLoading = input<boolean>(false);
  
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

  /** Emits when a folder card is clicked to navigate into it */
  folderClick = output<string>();

  /** Emits when a context menu is requested on a folder */
  folderContextMenu = output<{ event: MouseEvent; folder: Folder }>();

  /** Emits when a folder action (rename, delete) is triggered */
  folderAction = output<{ action: string; folder: Folder }>();

  /** Computed signal determining if both files and folders are empty */
  isEmpty = computed(() => this.files().length === 0 && this.folders().length === 0);

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

  /** Combined and sorted folders and files for list view */
  combinedItems = computed(() => {
    const field = this.sortField();
    const dir = this.sortDirection() === 'asc' ? 1 : -1;

    // 1. Map and sort folders
    const foldersList = this.folders().map(f => ({
      id: f.folderId,
      name: f.folderName,
      type: 'folder' as const,
      updatedAt: f.updatedAt,
      raw: f
    }));

    foldersList.sort((a, b) => {
      if (field === 'updatedAt') {
        return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
      }
      // Default: alphabetical sorting for folders
      const valA = a.name.toLowerCase();
      const valB = b.name.toLowerCase();
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });

    // 2. Map files (which are already sorted in sortedFiles computed)
    const filesList = this.sortedFiles().map(f => ({
      id: f.fileId,
      name: f.fileName,
      type: 'file' as const,
      size: f.fileSize,
      updatedAt: f.updatedAt,
      mimeType: f.mimeType,
      raw: f
    }));

    return [...foldersList, ...filesList];
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

  /** Handles clicking on a folder to navigate into it */
  onFolderNavigate(folderId: string): void {
    this.folderClick.emit(folderId);
  }

  /** Handles right click on a folder */
  onFolderRightClick(event: MouseEvent, folder: Folder): void {
    event.preventDefault();
    this.folderContextMenu.emit({ event, folder });
  }


  /** Handles click on a row in list view */
  onRowClick(row: FileListRow): void {
    if (row.type === 'folder') {
      this.onFolderNavigate(row.id);
    } else {
      this.onFileClick(row.raw as FileItem);
    }
  }

  /** Handles right-click / contextmenu on a row in list view */
  onRowContextMenu(event: MouseEvent, row: FileListRow): void {
    if (row.type === 'folder') {
      this.onFolderRightClick(event, row.raw as Folder);
    } else {
      this.onContextMenu(event, row.raw as FileItem);
    }
  }

  /** Handles row-level rename action */
  onRenameRow(event: Event, row: FileListRow): void {
    event.stopPropagation();
    if (row.type === 'file') {
      this.fileAction.emit({ action: 'rename', file: row.raw as FileItem });
    } else {
      this.folderAction.emit({ action: 'rename', folder: row.raw as Folder });
    }
  }

  /** Handles row-level delete action */
  onDeleteRow(event: Event, row: FileListRow): void {
    event.stopPropagation();
    if (row.type === 'file') {
      this.fileAction.emit({ action: 'delete', file: row.raw as FileItem });
    } else {
      this.folderAction.emit({ action: 'delete', folder: row.raw as Folder });
    }
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
