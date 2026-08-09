import { Service, signal, WritableSignal } from '@angular/core';
import { Folder } from '../models/folder.model';

/**
 * Service responsible for managing folder data and state.
 */
@Service()
export class FolderService {
  /**
   * Internal mock data representing the database of folders.
   */
  private mockFolders: Folder[] = [
    {
      folderId: 'folder-1',
      folderName: 'Documents',
      parentFolderId: 'ROOT',
      createdAt: '2024-01-01T10:00:00.000Z',
      updatedAt: '2024-01-01T10:00:00.000Z'
    },
    {
      folderId: 'folder-2',
      folderName: 'Photos',
      parentFolderId: 'ROOT',
      createdAt: '2024-01-02T11:00:00.000Z',
      updatedAt: '2024-01-02T11:00:00.000Z'
    },
    {
      folderId: 'folder-3',
      folderName: 'Work',
      parentFolderId: 'ROOT',
      createdAt: '2024-01-03T12:00:00.000Z',
      updatedAt: '2024-01-03T12:00:00.000Z'
    },
    {
      folderId: 'folder-4',
      folderName: 'Tax Returns',
      parentFolderId: 'folder-1',
      createdAt: '2024-02-01T09:00:00.000Z',
      updatedAt: '2024-02-01T09:00:00.000Z'
    },
    {
      folderId: 'folder-5',
      folderName: 'Vacation 2024',
      parentFolderId: 'folder-2',
      createdAt: '2024-03-01T14:00:00.000Z',
      updatedAt: '2024-03-01T14:00:00.000Z'
    }
  ];

  /**
   * A WritableSignal holding the list of folders.
   * Initialized with all mock folders.
   */
  folders: WritableSignal<Folder[]> = signal<Folder[]>([...this.mockFolders]);

  /**
   * A WritableSignal indicating if a folder operation is in progress.
   */
  isLoading: WritableSignal<boolean> = signal<boolean>(false);

  /**
   * A WritableSignal holding any error message encountered during folder operations.
   */
  error: WritableSignal<string | null> = signal<string | null>(null);

  /**
   * Lists folders, optionally filtering by parent folder ID.
   * Updates the `folders` signal with the result.
   * 
   * @param parentId The ID of the parent folder to filter by. Defaults to 'ROOT'.
   */
  listFolders(parentId = 'ROOT'): void {
    this.isLoading.set(true);
    this.error.set(null);

    const filteredFolders = this.mockFolders.filter(
      (folder: Folder) => folder.parentFolderId === parentId
    );
    this.folders.set(filteredFolders);
    
    this.isLoading.set(false);
  }

  /**
   * Retrieves a specific folder by its ID from the mock data.
   * 
   * @param folderId The ID of the folder to retrieve.
   * @returns The `Folder` object if found, otherwise `undefined`.
   */
  getFolder(folderId: string): Folder | undefined {
    return this.mockFolders.find((folder: Folder) => folder.folderId === folderId);
  }

  /**
   * Creates a new folder and adds it to the mock data.
   * Directly appends to the folders signal rather than re-filtering
   * via listFolders(), because the folder tree needs all folders visible.
   *
   * @param name The name of the new folder.
   * @param parentId The ID of the parent folder. Defaults to 'ROOT'.
   */
  createFolder(name: string, parentId = 'ROOT'): void {
    const newFolder: Folder = {
      folderId: `folder-${Date.now()}`,
      folderName: name,
      parentFolderId: parentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.mockFolders.push(newFolder);
    this.folders.update(current => [...current, newFolder]);
  }

  /**
   * Renames an existing folder in the mock data.
   * 
   * @param folderId The ID of the folder to rename.
   * @param newName The new name to give to the folder.
   */
  renameFolder(folderId: string, newName: string): void {
    const folder = this.getFolder(folderId);
    if (folder) {
      folder.folderName = newName;
      folder.updatedAt = new Date().toISOString();
      this.folders.update(currentFolders => [...currentFolders]);
    } else {
      this.error.set('Folder not found during rename operation.');
    }
  }

  /**
   * Deletes a folder from the mock data and updates the signal.
   * 
   * @param folderId The ID of the folder to delete.
   */
  deleteFolder(folderId: string): void {
    const originalLength = this.mockFolders.length;
    this.mockFolders = this.mockFolders.filter((folder: Folder) => folder.folderId !== folderId);
    
    if (this.mockFolders.length < originalLength) {
      this.folders.update((currentFolders: Folder[]) => 
        currentFolders.filter((folder: Folder) => folder.folderId !== folderId)
      );
    } else {
      this.error.set('Folder not found during delete operation.');
    }
  }

  /**
   * Gets the total count of all folders currently in the mock data.
   * 
   * @returns The total number of folders as a number.
   */
  getTotalCount(): number {
    return this.mockFolders.length;
  }

  /**
   * Retrieves all folders currently in the mock data.
   * 
   * @returns An array of all Folder objects.
   */
  getAllFolders(): Folder[] {
    return [...this.mockFolders];
  }

  /**
   * Builds the breadcrumb path from a specific folder up to ROOT.
   * 
   * @param folderId The ID of the current folder.
   * @returns An array of path segments excluding ROOT.
   */
  buildBreadcrumbPath(folderId: string): { id: string; name: string }[] {
    if (folderId === 'ROOT') {
      return [];
    }

    const path: { id: string; name: string }[] = [];
    let currentId = folderId;
    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (currentId !== 'ROOT' && iterations < MAX_ITERATIONS) {
      const folder = this.getFolder(currentId);
      if (!folder) {
        break;
      }
      
      path.unshift({ id: folder.folderId, name: folder.folderName });
      currentId = folder.parentFolderId;
      iterations++;
    }

    return path;
  }
}
