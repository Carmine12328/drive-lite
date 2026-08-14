import { Component, OnInit, inject, signal, computed, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { FileService } from '../../../core/services/file.service';
import { FolderService } from '../../../core/services/folder.service';
import { ViewStateService } from '../../../core/services/view-state.service';
import { ToastService } from '../toast/toast.service';
import { FilePreviewComponent, FilePreviewDialogData } from '../../../features/file-browser/file-preview/file-preview.component';
import { FileItem } from '../../../core/models/file-item.model';

export interface CommandItem {
  id: string;
  category: 'Navigation' | 'Actions' | 'Files';
  title: string;
  subtitle?: string;
  icon: string;
  shortcut?: string;
  action: () => void;
}

/**
 * CommandPaletteComponent provides a global command palette (Ctrl+K / Cmd+K)
 * allowing quick navigation, file search, and batch actions.
 */
@Component({
  selector: 'app-command-palette',
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
  imports: [CommonModule, FormsModule, MatIconModule],
  host: {
    '(keydown)': 'onKeydown($event)',
  },
})
export class CommandPaletteComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<CommandPaletteComponent>);
  private readonly router = inject(Router);
  private readonly fileService = inject(FileService);
  private readonly folderService = inject(FolderService);
  private readonly viewState = inject(ViewStateService);
  private readonly toastService = inject(ToastService);
  private readonly dialog = inject(MatDialog);

  /** Search input reference */
  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** Filter query */
  readonly query = signal<string>('');

  /** Selected item index in filtered list */
  readonly selectedIndex = signal<number>(0);

  /** Base command actions */
  private readonly baseCommands: CommandItem[] = [
    {
      id: 'nav-dashboard',
      category: 'Navigation',
      title: 'Go to Dashboard',
      subtitle: 'Overview & storage insights',
      icon: 'dashboard',
      shortcut: 'G D',
      action: () => this.navigate('/dashboard'),
    },
    {
      id: 'nav-drive',
      category: 'Navigation',
      title: 'Go to My Drive',
      subtitle: 'Browse all files & folders',
      icon: 'folder_open',
      shortcut: 'G M',
      action: () => this.navigate('/drive'),
    },
    {
      id: 'nav-trash',
      category: 'Navigation',
      title: 'Go to Trash',
      subtitle: 'Restore or empty deleted files',
      icon: 'delete',
      shortcut: 'G T',
      action: () => this.navigate('/trash'),
    },
    {
      id: 'act-upload',
      category: 'Actions',
      title: 'Upload File',
      subtitle: 'Select and upload a file from your computer',
      icon: 'upload_file',
      action: () => {
        this.close();
        this.navigate('/drive');
        // Let user know or trigger upload
        this.toastService.info('Click "Upload" in Drive to pick files');
      },
    },
    {
      id: 'act-select-all',
      category: 'Actions',
      title: 'Select All Files',
      subtitle: 'Select all items in current folder',
      icon: 'select_all',
      shortcut: 'Ctrl+A',
      action: () => {
        this.fileService.selectAll();
        this.close();
        this.toastService.info('All files selected');
      },
    },
    {
      id: 'act-clear-select',
      category: 'Actions',
      title: 'Clear Selection',
      subtitle: 'Deselect all selected files',
      icon: 'clear_all',
      shortcut: 'Esc',
      action: () => {
        this.fileService.clearSelection();
        this.close();
      },
    },
    {
      id: 'act-download-zip',
      category: 'Actions',
      title: 'Download Selected as ZIP',
      subtitle: 'Compress and download selected files',
      icon: 'archive',
      action: () => {
        this.close();
        const selected = this.fileService.selectedFiles();
        if (selected.length > 0) {
          this.fileService.downloadAsZip(selected);
        } else {
          this.toastService.info('No files selected to download as ZIP');
        }
      },
    },

    {
      id: 'act-toggle-theme',
      category: 'Actions',
      title: 'Toggle Theme',
      subtitle: 'Switch between light and dark mode',
      icon: 'brightness_4',
      action: () => {
        this.close();
        const isDark = document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
      },
    },
  ];

  /** Filtered list of commands and matching files */
  readonly filteredItems = computed<CommandItem[]>(() => {
    const q = this.query().trim().toLowerCase();
    const items: CommandItem[] = [];

    // Filter static commands
    for (const cmd of this.baseCommands) {
      if (!q || cmd.title.toLowerCase().includes(q) || (cmd.subtitle && cmd.subtitle.toLowerCase().includes(q))) {
        items.push(cmd);
      }
    }

    // If query exists, search files as well
    if (q.length > 0) {
      const allKnownFiles = this.fileService.files().concat(this.fileService.recentFiles());
      const uniqueFiles = Array.from(new Map(allKnownFiles.map(f => [f.fileId, f])).values());
      const matchingFiles = uniqueFiles
        .filter(f => f.fileName.toLowerCase().includes(q))
        .slice(0, 5);

      for (const file of matchingFiles) {
        items.push({
          id: `file-${file.fileId}`,
          category: 'Files',
          title: file.fileName,
          subtitle: `${this.formatBytes(file.fileSize)} · ${file.mimeType}`,
          icon: 'insert_drive_file',
          action: () => this.previewFile(file),
        });
      }
    }

    return items;
  });

  ngOnInit(): void {
    // Focus input on open
    setTimeout(() => {
      this.searchInput()?.nativeElement.focus();
    }, 50);
  }

  /** Keyboard navigation inside palette */
  onKeydown(event: KeyboardEvent): void {
    const items = this.filteredItems();
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex.update(i => (i + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex.update(i => (i - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const current = items[this.selectedIndex()];
      if (current) {
        current.action();
      }
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  /** Navigate to route and close dialog */
  private navigate(path: string): void {
    this.close();
    this.router.navigateByUrl(path);
  }

  /** Preview selected file */
  private previewFile(file: FileItem): void {
    this.close();
    this.dialog.open(FilePreviewComponent, {
      data: {
        file,
        allFiles: this.fileService.files(),
      } satisfies FilePreviewDialogData,
      maxWidth: '100vw',
      maxHeight: '100vh',
      panelClass: 'preview-dialog-fullscreen',
    });
  }

  /** Execute item on direct click */
  selectItem(item: CommandItem): void {
    item.action();
  }

  /** Close command palette */
  close(): void {
    this.dialogRef.close();
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}
