import { Component, input, output, computed } from '@angular/core';
import { MatTree, MatTreeNode, MatTreeNodeToggle, MatTreeNodePadding, MatTreeNodeDef } from '@angular/material/tree';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { Folder } from '../../../core/models/folder.model';

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
  ]
})
export class FolderTreeComponent {
  /** Flat array of all folders */
  folders = input<Folder[]>([]);

  /** Currently selected folder ID */
  activeFolderId = input<string>('ROOT');

  /** Emits the selected folder ID on click */
  folderSelect = output<string>();

  /** Emits context menu event and the corresponding folder */
  folderContextMenu = output<{ event: MouseEvent; folder: Folder }>();

  /** Transforms flat folders into a nested tree */
  treeData = computed<FolderTreeNode[]>(() => this.buildTree(this.folders()));

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
    return rootNodes;
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
