import { Component, computed, inject, signal, viewChild, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';

import { BreadcrumbComponent } from '../../shared/components/breadcrumb/breadcrumb.component';
import { ContextMenuComponent, ContextMenuItem } from '../../shared/components/context-menu/context-menu.component';
import { FolderTreeComponent } from './folder-tree/folder-tree.component';
import { FileListComponent } from './file-list/file-list.component';
import { FileService } from '../../core/services/file.service';
import { FolderService } from '../../core/services/folder.service';
import { Upload } from '../../core/services/upload';
import { ViewStateService } from '../../core/services/view-state.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { FileItem } from '../../core/models/file-item.model';
import { Folder } from '../../core/models/folder.model';
import { UploadDialog, UploadDialogData } from './upload-dialog/upload-dialog';

import { ConfirmDialog, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog';
import { InputDialog, InputDialogData } from '../../shared/components/input-dialog/input-dialog';
import { FilePreviewComponent, FilePreviewDialogData } from './file-preview/file-preview.component';
import { ShareDialog, ShareDialogData } from '../../shared/components/share-dialog/share-dialog';
import { VersionHistoryComponent, VersionHistoryData, VersionHistoryResult } from './version-history/version-history.component';
import { SelectionToolbarComponent } from './selection-toolbar/selection-toolbar.component';

/**
 * Main file browser component providing a Google Drive–like experience.
 * Split layout: sidebar folder tree + main content area (breadcrumb + file list).
 * Reads `folderId` from route params and loads corresponding files and folders.
 *
 * Integrates with:
 * - {@link Upload} for file uploads via the upload dialog
 * - {@link ConfirmDialog} for delete confirmations
 * - {@link InputDialog} for rename and new folder operations
 */
@Component({
  selector: 'app-file-browser',
  imports: [
    MatIcon,
    MatIconButton,
    MatButton,
    BreadcrumbComponent,
    ContextMenuComponent,
    FolderTreeComponent,
    FileListComponent,
    SelectionToolbarComponent,
  ],
  templateUrl: './file-browser.component.html',
  styleUrl: './file-browser.component.scss',
  host: {
    '(contextmenu)': 'onHostContextMenu($event)',
    '(keydown.escape)': 'onEscapeKey($event)'
  }
})
export class FileBrowserComponent implements OnInit, OnDestroy {

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fileService = inject(FileService);
  private readonly folderService = inject(FolderService);
  private readonly uploadService = inject(Upload);
  private readonly viewState = inject(ViewStateService);
  private readonly dialog = inject(MatDialog);
  private readonly toastService = inject(ToastService);
  private readonly destroy$ = new Subject<void>();

  /** Current folder ID from route params. Defaults to ROOT. */
  readonly currentFolderId = signal<string>('ROOT');

  /** Whether the sidebar is visible (toggled on mobile). Delegates to ViewStateService. */
  readonly sidebarOpen = this.viewState.sidebarOpen;

  /** Drag-and-drop overlay visibility. */
  readonly showDropOverlay = signal<boolean>(false);

  /** Sort field for the file list. */
  readonly sortField = signal<string>('fileName');

  /** Sort direction for the file list. */
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  /** localStorage key for persisting sidebar width. */
  private readonly SIDEBAR_WIDTH_KEY = 'drive-lite:sidebar-width';

  /** Sidebar width in pixels, restored from localStorage or defaulting to 260. */
  readonly sidebarWidth = signal<number>(
    parseInt(localStorage.getItem('drive-lite:sidebar-width') ?? '', 10) || 260
  );

  /** Minimum sidebar width in pixels. */
  private readonly SIDEBAR_MIN_WIDTH = 180;

  /** Maximum sidebar width in pixels. */
  private readonly SIDEBAR_MAX_WIDTH = 500;

  /** Tracks nested drag events to prevent premature overlay hide. */
  private dragCounter = 0;

  /** View mode signal from the shared ViewStateService. */
  readonly viewMode = this.viewState.viewMode;

  /** All folders for the tree sidebar. */
  readonly allFolders = computed(() => this.folderService.getAllFolders());

  /** Child folders of the current folder — shown at the top of the file list. */
  readonly subFolders = computed(() =>
    this.allFolders().filter(
      f => f.parentFolderId === this.currentFolderId() && f.folderId !== 'ROOT',
    )
  );

  /** Files for the current folder. */
  readonly files = this.fileService.files;

  /** Loading state. */
  readonly isLoading = computed(() => this.fileService.isLoading() || this.folderService.isLoading());

  /** Breadcrumb path segments for the current folder. */
  readonly breadcrumbPath = computed(() =>
    this.folderService.buildBreadcrumbPath(this.currentFolderId())
  );

  /** Context menu items for files. */
  readonly fileContextMenuItems: ContextMenuItem[] = [
    { label: 'Open', icon: 'visibility', action: 'preview' },
    { label: 'Share', icon: 'share', action: 'share' },
    { label: 'Version History', icon: 'history', action: 'versions' },
    { label: 'Download', icon: 'download', action: 'download' },
    { label: 'Rename', icon: 'edit', action: 'rename' },
    { label: 'Delete', icon: 'delete_outline', action: 'delete' },
  ];


  /** Context menu items for folders. */
  readonly folderContextMenuItems: ContextMenuItem[] = [
    { label: 'Open', icon: 'folder_open', action: 'open' },
    { label: 'New Folder', icon: 'create_new_folder', action: 'new-folder' },
    { label: 'Rename', icon: 'edit', action: 'rename' },
    { label: 'Delete', icon: 'delete_outline', action: 'delete' },
  ];

  /** Context menu items for right-clicking empty space in main content. */
  readonly backgroundContextMenuItems: ContextMenuItem[] = [
    { label: 'New Folder', icon: 'create_new_folder', action: 'new-folder' },
    { label: 'Upload Files', icon: 'upload_file', action: 'upload' },
  ];

  /** Tracks the file, folder, or background targeted by the context menu. */
  private contextTarget: { type: 'file'; item: FileItem } | { type: 'folder'; item: Folder } | { type: 'background' } | null = null;

  /** Reference to the shared context menu component. */
  private readonly contextMenu = viewChild.required<ContextMenuComponent>('contextMenu');

  /** Reference to the folder tree component for programmatic expansion. */
  private readonly folderTree = viewChild<FolderTreeComponent>('folderTree');

  ngOnInit(): void {
    // Subscribe to route param changes to update the current folder.
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const folderId = params.get('folderId') ?? 'ROOT';
      this.currentFolderId.set(folderId);
      this.loadFolderContents(folderId);

      // Expand the sidebar tree to reveal the navigated folder
      // Use setTimeout to let the tree re-render with updated data first
      setTimeout(() => this.folderTree()?.expandToFolder(folderId));
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Loads the contents for the given folder ID.
   * @param folderId The folder ID to load files and sub-folders for.
   */
  private loadFolderContents(folderId: string): void {
    this.fileService.listFiles(folderId);
    this.folderService.listFolders(folderId);
  }

  /**
   * Handles folder selection from the sidebar tree.
   * Navigates to the selected folder's route.
   * @param folderId The selected folder ID.
   */
  onFolderSelect(folderId: string): void {
    // Close the sidebar on mobile after selecting a folder so the user
    // sees the main content area with the newly loaded folder.
    this.closeSidebarOnMobile();

    if (folderId === 'TRASH') {
      this.router.navigate(['/drive/trash']);
      return;
    }
    if (folderId === 'ROOT') {
      this.router.navigate(['/drive']);
    } else {
      this.router.navigate(['/drive/folder', folderId]);
    }
  }

  /**
   * Handles breadcrumb navigation.
   * @param folderId The folder ID to navigate to.
   */
  onBreadcrumbNavigate(folderId: string): void {
    this.onFolderSelect(folderId);
  }

  /**
   * Handles file actions dispatched from the file list component.
   * @param event The action descriptor with target file.
   */
  onFileAction(event: { action: string; file: FileItem }): void {
    switch (event.action) {
      case 'preview':
        this.openPreviewDialog(event.file);
        break;
      case 'share':
        this.openShareDialog(event.file);
        break;
      case 'versions':
        this.openVersionHistoryDialog(event.file);
        break;
      case 'download':
        this.fileService.downloadFile(event.file.fileId);
        break;
      case 'rename':
        this.openRenameFileDialog(event.file);
        break;
      case 'delete':
        this.openDeleteFileDialog(event.file);
        break;
    }

  }

  /**
   * Handles folder actions dispatched from the file list component.
   * @param event The action descriptor with target folder.
   */
  onFolderAction(event: { action: string; folder: Folder }): void {
    switch (event.action) {
      case 'rename':
        this.openRenameFolderDialog(event.folder);
        break;
      case 'delete':
        this.openDeleteFolderDialog(event.folder);
        break;
    }
  }

  /**
   * Handles sort changes from the file list component.
   * @param event The new sort field and direction.
   */
  onSortChange(event: { field: string; direction: 'asc' | 'desc' }): void {
    this.sortField.set(event.field);
    this.sortDirection.set(event.direction);
  }

  /**
   * Opens a context menu for a file.
   * @param event The context menu event descriptor.
   */
  onFileContextMenu(event: { event: MouseEvent; file: FileItem }): void {
    event.event.stopPropagation();
    this.contextTarget = { type: 'file', item: event.file };
    this.contextMenu().open(event.event, this.fileContextMenuItems);
  }

  /**
   * Opens a context menu for a folder.
   * @param event The context menu event descriptor.
   */
  onFolderContextMenu(event: { event: MouseEvent; folder: Folder }): void {
    event.event.stopPropagation();
    this.contextTarget = { type: 'folder', item: event.folder };
    this.contextMenu().open(event.event, this.folderContextMenuItems);
  }

  /**
   * Opens a context menu for empty space in the main content area.
   * Shows "New Folder" and "Upload Files" options.
   */
  onBackgroundContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextTarget = { type: 'background' };
    this.contextMenu().open(event, this.backgroundContextMenuItems);
  }

  /**
   * Prevents the browser default context menu on the host element.
   * Custom context menus are handled by specific child handlers.
   */
  onHostContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  /**
   * Handles context menu action selection.
   * @param action The selected action string.
   */
  onContextMenuAction(action: string): void {
    if (!this.contextTarget) return;

    if (this.contextTarget.type === 'file') {
      this.onFileAction({ action, file: this.contextTarget.item as FileItem });
    } else if (this.contextTarget.type === 'folder') {
      const folder = this.contextTarget.item as Folder;
      switch (action) {
        case 'open':
          this.onFolderSelect(folder.folderId);
          break;
        case 'new-folder':
          this.openNewFolderDialog(folder.folderId);
          break;
        case 'rename':
          this.openRenameFolderDialog(folder);
          break;
        case 'delete':
          this.openDeleteFolderDialog(folder);
          break;
      }
    } else if (this.contextTarget.type === 'background') {
      switch (action) {
        case 'new-folder':
          this.openNewFolderDialog();
          break;
        case 'upload':
          this.openUploadDialog();
          break;
      }
    }
    this.contextTarget = null;
  }

  /** Toggles the sidebar visibility (mobile). Delegates to shared ViewStateService. */
  toggleSidebar(): void {
    this.viewState.toggleSidebar();
  }

  /**
   * Closes the sidebar when the viewport is at or below the mobile
   * breakpoint (768px). Delegates to shared ViewStateService.
   */
  private closeSidebarOnMobile(): void {
    this.viewState.closeSidebarOnMobile();
  }

  // --- Dialog methods ---

  /**
   * Opens the file preview dialog.
   * @param file The file to preview.
   */
  private openPreviewDialog(file: FileItem): void {
    const data: FilePreviewDialogData = {
      file,
      allFiles: this.files(),
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
   * Opens the upload dialog.
   * @param initialFiles Optional pre-selected files (e.g., from drag-and-drop).
   */
  private openUploadDialog(initialFiles?: File[]): void {
    const data: UploadDialogData = {
      folderId: this.currentFolderId(),
      initialFiles,
    };

    this.dialog.open(UploadDialog, {
      width: '600px',
      maxWidth: '90vw',
      panelClass: 'drive-dialog',
      disableClose: true,
      data,
      ariaLabel: 'Upload files dialog',
    });
  }

  /**
   * Opens the rename-file dialog and applies the rename on confirm.
   * @param file The file to rename.
   */
  private openRenameFileDialog(file: FileItem): void {
    const data: InputDialogData = {
      title: 'Rename File',
      label: 'File name',
      value: file.fileName,
      confirmText: 'Rename',
    };

    this.dialog.open(InputDialog, {
      width: '400px',
      panelClass: 'drive-dialog',
      data,
      ariaLabel: 'Rename file dialog',
    }).afterClosed().subscribe((newName: string | undefined) => {
      if (newName && newName !== file.fileName) {
        this.fileService.renameFile(file.fileId, newName);
        this.toastService.success(`Renamed to "${newName}"`);
      }
    });
  }

  /**
   * Opens the share dialog for generating and managing expiring share links.
   * @param file The file to share.
   */
  openShareDialog(file: FileItem): void {
    const data: ShareDialogData = { file };
    this.dialog.open(ShareDialog, {
      width: '540px',
      panelClass: 'drive-dialog',
      data,
      ariaLabel: `Share ${file.fileName} dialog`,
    });
  }

  /**
   * Opens the version history dialog for viewing timeline and rolling back versions.
   * @param file The file whose versions to inspect.
   */
  openVersionHistoryDialog(file: FileItem): void {
    const data: VersionHistoryData = { file };
    this.dialog.open(VersionHistoryComponent, {
      width: '560px',
      panelClass: 'drive-dialog',
      data,
      ariaLabel: `Version history for ${file.fileName}`,
    }).afterClosed().subscribe((res: VersionHistoryResult | undefined) => {
      if (res?.rolledBack) {
        // Reload files in current folder to ensure UI freshness
        this.fileService.listFiles(this.currentFolderId());
      }
    });
  }


  /**
   * Opens a confirmation dialog for file deletion.
   * @param file The file to delete.
   */
  private openDeleteFileDialog(file: FileItem): void {
    const data: ConfirmDialogData = {
      title: 'Move to Trash',
      message: `Move "${file.fileName}" to trash? You can restore it from the trash later.`,
      confirmText: 'Move to Trash',
      confirmColor: 'warn',
    };

    this.dialog.open(ConfirmDialog, {
      width: '400px',
      panelClass: 'drive-dialog',
      data,
      ariaLabel: 'Move file to trash confirmation',
    }).afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.fileService.deleteFile(file.fileId);
        this.toastService.success(`"${file.fileName}" moved to trash`);
      }
    });
  }

  /**
   * Opens the new folder dialog. Called from toolbar button or context menu.
   * @param parentFolderId The parent folder ID. Defaults to current folder.
   */
  openNewFolderDialog(parentFolderId?: string): void {
    const data: InputDialogData = {
      title: 'New Folder',
      label: 'Folder name',
      placeholder: 'Untitled Folder',
      confirmText: 'Create',
    };

    this.dialog.open(InputDialog, {
      width: '400px',
      panelClass: 'drive-dialog',
      data,
      ariaLabel: 'Create new folder dialog',
    }).afterClosed().subscribe((folderName: string | undefined) => {
      if (folderName) {
        this.folderService.createFolder(folderName, parentFolderId ?? this.currentFolderId());
        this.toastService.success(`Folder "${folderName}" created`);
      }
    });
  }

  /**
   * Alias method for the template — creates a folder in the current directory.
   */
  onNewFolder(): void {
    this.openNewFolderDialog();
  }

  /**
   * Opens the rename-folder dialog and applies the rename on confirm.
   * @param folder The folder to rename.
   */
  private openRenameFolderDialog(folder: Folder): void {
    const data: InputDialogData = {
      title: 'Rename Folder',
      label: 'Folder name',
      value: folder.folderName,
      confirmText: 'Rename',
    };

    this.dialog.open(InputDialog, {
      width: '400px',
      panelClass: 'drive-dialog',
      data,
      ariaLabel: 'Rename folder dialog',
    }).afterClosed().subscribe((newName: string | undefined) => {
      if (newName && newName !== folder.folderName) {
        this.folderService.renameFolder(folder.folderId, newName);
        this.toastService.success(`Renamed to "${newName}"`);
      }
    });
  }

  /**
   * Opens a confirmation dialog for folder deletion.
   * @param folder The folder to delete.
   */
  private openDeleteFolderDialog(folder: Folder): void {
    const data: ConfirmDialogData = {
      title: 'Delete Folder',
      message: `Are you sure you want to delete "${folder.folderName}" and all its contents? This action cannot be undone.`,
      confirmText: 'Delete',
      confirmColor: 'warn',
    };

    this.dialog.open(ConfirmDialog, {
      width: '400px',
      panelClass: 'drive-dialog',
      data,
      ariaLabel: 'Delete folder confirmation',
    }).afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.folderService.deleteFolder(folder.folderId);
        this.toastService.success(`"${folder.folderName}" deleted`);
      }
    });
  }

  // --- Drag-and-drop overlay handlers ---

  /**
   * Handles dragenter on the main content area.
   * Uses a counter to track nested enter/leave pairs.
   */
  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter++;
    if (event.dataTransfer?.types.includes('Files')) {
      this.showDropOverlay.set(true);
    }
  }

  /** Handles dragleave on the main content area. */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter--;
    if (this.dragCounter <= 0) {
      this.dragCounter = 0;
      this.showDropOverlay.set(false);
    }
  }

  /** Handles dragover — must prevent default to allow drop. */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Handles file drop on the overlay.
   * Opens the upload dialog with the dropped files pre-loaded.
   */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter = 0;
    this.showDropOverlay.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.openUploadDialog(Array.from(files));
    }
  }

  /** Handles upload request from the empty state CTA or toolbar button. */
  onUploadRequest(): void {
    this.openUploadDialog();
  }

  // --- Sidebar resize ---

  /** Bound references for add/removeEventListener identity. */
  private resizeMoveFn = (e: PointerEvent) => this.onResizeMove(e);
  private resizeEndFn = (e: PointerEvent) => this.onResizeEnd(e);

  /**
   * Starts the sidebar resize operation.
   * Captures the pointer so all move/up events are routed to us
   * even if the cursor leaves the handle element.
   */
  onResizeStart(event: PointerEvent): void {
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    document.addEventListener('pointermove', this.resizeMoveFn);
    document.addEventListener('pointerup', this.resizeEndFn);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  /** Updates sidebar width, clamped between min and max. */
  private onResizeMove(event: PointerEvent): void {
    const newWidth = Math.min(
      this.SIDEBAR_MAX_WIDTH,
      Math.max(this.SIDEBAR_MIN_WIDTH, event.clientX)
    );
    this.sidebarWidth.set(newWidth);
  }

  /** Ends the resize operation, cleans up listeners, and persists width. */
  private onResizeEnd(event: PointerEvent): void {
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    document.removeEventListener('pointermove', this.resizeMoveFn);
    document.removeEventListener('pointerup', this.resizeEndFn);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem(this.SIDEBAR_WIDTH_KEY, String(this.sidebarWidth()));
  }

  /** Clears selection when Escape key is pressed */
  onEscapeKey(event: Event): void {
    if (this.fileService.hasSelection()) {
      event.preventDefault();
      this.fileService.clearSelection();
    }
  }
}

