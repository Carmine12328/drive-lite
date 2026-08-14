import { Component, computed, effect, inject, input, output, viewChild } from '@angular/core';
import { MatTree, MatTreeNode, MatTreeNodePadding, MatTreeNodeDef } from '@angular/material/tree';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatBadge } from '@angular/material/badge';
import { Folder } from '../../../core/models/folder.model';
import { FileService } from '../../../core/services/file.service';

/**
 * Interface representing a node in the folder tree.
 */
export interface FolderTreeNode {
  folder: Folder;
  children: FolderTreeNode[];
}

/**
 * Component for displaying the folder tree in the sidebar.
 */
@Component({
  selector: 'app-folder-tree',
  templateUrl: './folder-tree.component.html',
  styleUrl: './folder-tree.component.scss',
  imports: [
    MatTree,
    MatTreeNode,
    MatTreeNodePadding,
    MatTreeNodeDef,
    MatIcon,
    MatIconButton,
    MatBadge,
  ]
})
export class FolderTreeComponent {
  private readonly fileService = inject(FileService);

  /** Flat array of all folders */
  folders = input<Folder[]>([]);

  /** Currently selected folder ID */
  activeFolderId = input<string>('ROOT');

  /** Emits the selected folder ID on click */
  folderSelect = output<string>();

  /** Emits context menu event and the corresponding folder */
  folderContextMenu = output<{ event: MouseEvent; folder: Folder }>();

  /** Count of soft-deleted files for the Trash badge. */
  readonly trashCount = computed(() => this.fileService.getDeletedFiles().length);

  /** Transforms flat folders into a nested tree */
  treeData = computed<FolderTreeNode[]>(() => this.buildTree(this.folders()));

  /** Reference to the MatTree for programmatic expand/collapse. */
  private readonly matTree = viewChild<MatTree<FolderTreeNode>>('tree');

  /** Flat lookup from folderId → FolderTreeNode, rebuilt each time treeData changes. */
  private nodeMap = new Map<string, FolderTreeNode>();

  /** Persistent set of expanded folder IDs across treeData signal re-evaluations. */
  private expandedFolderIds = new Set<string>();

  /** Accessor for node children */
  childrenAccessor = (node: FolderTreeNode) => node.children;

  /** Checks if a node has children */
  hasChild = (_: number, node: FolderTreeNode) => node.children.length > 0;

  constructor() {
    // Automatically preserve and re-apply expansion state whenever treeData or activeFolderId updates
    effect(() => {
      this.treeData();
      const activeId = this.activeFolderId();


      // Automatically add parent ancestors of active folder to expanded set
      if (activeId && activeId !== 'ROOT' && activeId !== 'TRASH') {
        let currentId = this.nodeMap.get(activeId)?.folder.parentFolderId;
        let iterations = 0;
        while (currentId && currentId !== 'ROOT' && iterations < 20) {
          this.expandedFolderIds.add(currentId);
          currentId = this.nodeMap.get(currentId)?.folder.parentFolderId;
          iterations++;
        }
      }

      // Defer expansion until after MatTree renders updated dataSource
      queueMicrotask(() => this.applyExpandedState());
    });
  }

  /**
   * Re-applies tree.expand() to all nodes whose folderId is present in expandedFolderIds.
   */
  private applyExpandedState(): void {
    const tree = this.matTree();
    if (!tree) return;

    const expandRecursive = (nodes: FolderTreeNode[]) => {
      for (const node of nodes) {
        if (this.expandedFolderIds.has(node.folder.folderId)) {
          tree.expand(node);
        }
        if (node.children.length > 0) {
          expandRecursive(node.children);
        }
      }
    };

    expandRecursive(this.treeData());
  }

  /**
   * Toggles expansion state when user clicks chevron button.
   */
  toggleNode(node: FolderTreeNode, event: MouseEvent): void {
    event.stopPropagation();
    const tree = this.matTree();
    if (!tree) return;

    const folderId = node.folder.folderId;
    if (this.expandedFolderIds.has(folderId)) {
      this.expandedFolderIds.delete(folderId);
      tree.collapse(node);
    } else {
      this.expandedFolderIds.add(folderId);
      tree.expand(node);
    }
  }

  /**
   * Transforms flat folder array into a nested tree structure.
   * @param folders - Array of all folders.
   * @returns Array of root-level tree nodes.
   */
  private buildTree(folders: Folder[]): FolderTreeNode[] {
    const nodeMap = new Map<string, FolderTreeNode>();
    
    // Initialize nodes
    folders.forEach(folder => {
      nodeMap.set(folder.folderId, { folder, children: [] });
    });

    const rootNodes: FolderTreeNode[] = [];

    // Build hierarchy
    folders.forEach(folder => {
      const node = nodeMap.get(folder.folderId);
      if (node) {
        if (folder.parentFolderId === 'ROOT' && folder.folderId !== 'ROOT') {
          rootNodes.push(node);
        } else {
          const parentNode = nodeMap.get(folder.parentFolderId);
          if (parentNode) {
            parentNode.children.push(node);
          }
        }
      }
    });

    // Sort children recursively
    const sortNodes = (nodes: FolderTreeNode[]) => {
      nodes.sort((a, b) => a.folder.folderName.localeCompare(b.folder.folderName));
      nodes.forEach(node => sortNodes(node.children));
    };

    sortNodes(rootNodes);

    // Store for programmatic lookup
    this.nodeMap = nodeMap;

    return rootNodes;
  }

  /**
   * Expands the tree path from root down to reveal the given folder.
   * Expands all parent ancestor folders so the target folder is visible in the sidebar.
   *
   * @param folderId The target folder ID to reveal in the tree.
   */
  expandToFolder(folderId: string): void {
    if (folderId === 'ROOT' || folderId === 'TRASH') return;

    let currentId = this.nodeMap.get(folderId)?.folder.parentFolderId;
    let iterations = 0;

    while (currentId && currentId !== 'ROOT' && iterations < 20) {
      this.expandedFolderIds.add(currentId);
      currentId = this.nodeMap.get(currentId)?.folder.parentFolderId;
      iterations++;
    }

    this.applyExpandedState();
  }

  /** Handles folder click event */
  onFolderClick(folderId: string): void {
    this.folderSelect.emit(folderId);
  }

  /** Handles right-click context menu on a folder */
  onContextMenu(event: MouseEvent, folder: Folder): void {
    event.preventDefault();
    this.folderContextMenu.emit({ event, folder });
  }

  /** Handles root folder click */
  onRootClick(): void {
    this.folderSelect.emit('ROOT');
  }

  /** Handles trash click */
  onTrashClick(): void {
    this.folderSelect.emit('TRASH');
  }
}
