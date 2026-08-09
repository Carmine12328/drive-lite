import { Component, computed, inject, input, output, viewChild } from '@angular/core';
import { MatTree, MatTreeNode, MatTreeNodeToggle, MatTreeNodePadding, MatTreeNodeDef } from '@angular/material/tree';
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
    MatTreeNodeToggle,
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

  /** Accessor for node children */
  childrenAccessor = (node: FolderTreeNode) => node.children;

  /** Checks if a node has children */
  hasChild = (_: number, node: FolderTreeNode) => node.children.length > 0;

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
        if (folder.parentFolderId === 'ROOT') {
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

    // Store for programmatic expansion in expandToFolder()
    this.nodeMap = nodeMap;

    return rootNodes;
  }

  /**
   * Expands the tree path from root down to the given folder.
   * Call this when the user navigates to a folder from outside
   * the sidebar (e.g. clicking a folder card in the content area).
   *
   * @param folderId The target folder ID to reveal in the tree.
   */
  expandToFolder(folderId: string): void {
    const tree = this.matTree();
    if (!tree || folderId === 'ROOT' || folderId === 'TRASH') return;

    // Walk up the parent chain to collect ancestor folder IDs
    const ancestorIds: string[] = [];
    let currentId = folderId;
    let iterations = 0;

    while (currentId !== 'ROOT' && iterations < 20) {
      const node = this.nodeMap.get(currentId);
      if (!node) break;
      ancestorIds.unshift(currentId);
      currentId = node.folder.parentFolderId;
      iterations++;
    }

    // Expand each ancestor node (the last one is the target itself)
    for (const id of ancestorIds) {
      const node = this.nodeMap.get(id);
      if (node && node.children.length > 0) {
        tree.expand(node);
      }
    }
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
