import { Component, computed, inject, signal, viewChild, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { Subject, takeUntil } from 'rxjs';

import { BreadcrumbComponent } from '../../shared/components/breadcrumb/breadcrumb.component';
import { ContextMenuComponent, ContextMenuItem } from '../../shared/components/context-menu/context-menu.component';
import { FolderTreeComponent } from './folder-tree/folder-tree.component';
import { FileListComponent } from './file-list/file-list.component';
import { FileService } from '../../core/services/file.service';
import { FolderService } from '../../core/services/folder.service';
import { ViewStateService } from '../../core/services/view-state.service';
import { FileItem } from '../../core/models/file-item.model';
import { Folder } from '../../core/models/folder.model';

/**
 * Main file browser component providing a Google Drive–like experience.
 * Split layout: sidebar folder tree + main content area (breadcrumb + file list).
 * Reads `folderId` from route params and loads corresponding files and folders.
 */
@Component({
  selector: 'app-file-browser',
  imports: [
    MatIcon,
    MatIconButton,
    BreadcrumbComponent,
    ContextMenuComponent,
    FolderTreeComponent,
    FileListComponent,
  ],
  templateUrl: './file-browser.component.html',
  styleUrl: './file-browser.component.scss',
})
export class FileBrowserComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fileService = inject(FileService);
  private readonly folderService = inject(FolderService);
  private readonly viewState = inject(ViewStateService);
  private readonly destroy$ = new Subject<void>();

  /** Current folder ID from route params. Defaults to ROOT. */
  readonly currentFolderId = signal<string>('ROOT');

  /** Whether the sidebar is visible (toggled on mobile). */
  readonly sidebarOpen = signal<boolean>(true);

  /** Drag-and-drop overlay visibility. */
  readonly showDropOverlay = signal<boolean>(false);

  /** Sort field for the file list. */
  readonly sortField = signal<string>('fileName');

  /** Sort direction for the file list. */
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  /** Tracks nested drag events to prevent premature overlay hide. */
  private dragCounter = 0;

  /** View mode signal from the shared ViewStateService. */
  readonly viewMode = this.viewState.viewMode;

  /** All folders for the tree sidebar. */
  readonly allFolders = computed(() => this.folderService.getAllFolders());

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
    { label: 'Preview', icon: 'visibility', action: 'preview' },
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

  /** Tracks the file or folder targeted by the context menu. */
  private contextTarget: { type: 'file'; item: FileItem } | { type: 'folder'; item: Folder } | null = null;

  /** Reference to the shared context menu component. */
  private readonly contextMenu = viewChild.required<ContextMenuComponent>('contextMenu');

  ngOnInit(): void {
    // Subscribe to route param changes to update the current folder.
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const folderId = params.get('folderId') ?? 'ROOT';
      this.currentFolderId.set(folderId);
      this.loadFolderContents(folderId);
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
        // Step 8: open preview dialog
        console.debug('[FileBrowser] Preview stub:', event.file.fileName);
        break;
      case 'download':
        this.fileService.downloadFile(event.file.fileId);
        break;
      case 'rename':
        // Step 7: open rename dialog
        console.debug('[FileBrowser] Rename stub:', event.file.fileName);
        break;
      case 'delete':
        // Step 7: open confirmation dialog
        console.debug('[FileBrowser] Delete stub:', event.file.fileName);
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
    this.contextTarget = { type: 'file', item: event.file };
    this.contextMenu().open(event.event, this.fileContextMenuItems);
  }

  /**
   * Opens a context menu for a folder.
   * @param event The context menu event descriptor.
   */
  onFolderContextMenu(event: { event: MouseEvent; folder: Folder }): void {
    this.contextTarget = { type: 'folder', item: event.folder };
    this.contextMenu().open(event.event, this.folderContextMenuItems);
  }

  /**
   * Handles context menu action selection.
   * @param action The selected action string.
   */
  onContextMenuAction(action: string): void {
    if (!this.contextTarget) return;

    if (this.contextTarget.type === 'file') {
      this.onFileAction({ action, file: this.contextTarget.item as FileItem });
    } else {
      const folder = this.contextTarget.item as Folder;
      switch (action) {
        case 'open':
          this.onFolderSelect(folder.folderId);
          break;
        case 'new-folder':
          // Step 7: open new folder dialog
          console.debug('[FileBrowser] New folder stub in:', folder.folderName);
          break;
        case 'rename':
          // Step 7: open rename dialog
          console.debug('[FileBrowser] Rename folder stub:', folder.folderName);
          break;
        case 'delete':
          // Step 7: open delete confirmation dialog
          console.debug('[FileBrowser] Delete folder stub:', folder.folderName);
          break;
      }
    }
    this.contextTarget = null;
  }

  /** Toggles the sidebar visibility (mobile). */
  toggleSidebar(): void {
    this.sidebarOpen.update(open => !open);
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
   * Currently a stub — will trigger upload dialog in Step 7.
   */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter = 0;
    this.showDropOverlay.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      // Step 7: trigger upload with dropped files
      console.debug('[FileBrowser] Dropped files stub:', files.length, 'file(s)');
    }
  }

  /** Handles upload request from the empty state CTA. */
  onUploadRequest(): void {
    // Step 7: open upload dialog
    console.debug('[FileBrowser] Upload request stub');
  }
}
