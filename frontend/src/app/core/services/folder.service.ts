import { inject, Service, signal, WritableSignal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Folder } from '../models/folder.model';
import { ApiService } from './api.service';

/**
 * Service responsible for managing folder data and state.
 * Communicates with the backend API via ApiService.
 */
@Service()
export class FolderService {
  private readonly api = inject(ApiService);

  /**
   * Internal cache of all known folders, populated incrementally
   * as the user navigates the folder tree.
   */
  private knownFolders: Folder[] = [];

  /**
   * A WritableSignal holding the list of folders for the current view.
   */
  folders: WritableSignal<Folder[]> = signal<Folder[]>([]);

  /**
   * A WritableSignal indicating if a folder operation is in progress.
   */
  isLoading: WritableSignal<boolean> = signal<boolean>(false);

  /**
   * A WritableSignal holding any error message encountered during folder operations.
   */
  error: WritableSignal<string | null> = signal<string | null>(null);

  /**
   * Version counter bumped on every folder mutation.
   * Read by `getAllFolders()` to create a signal dependency so
   * consumers using `computed(() => getAllFolders())` re-evaluate.
   */
  private readonly folderVersion: WritableSignal<number> = signal<number>(0);

  /**
   * Lists folders by parent ID from the backend API.
   * Updates the `folders` signal and merges results into the internal cache.
   *
   * @param parentId The ID of the parent folder to filter by. Defaults to 'ROOT'.
   */
  async listFolders(parentId = 'ROOT'): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const params = new HttpParams().set('parentFolderId', parentId);
      const response = await firstValueFrom(
        this.api.get<{ folders: Folder[] }>('/folders', params)
      );

      const folders = response.folders ?? [];
      this.folders.set(folders);

      // Merge into the known folders cache (upsert by folderId)
      for (const folder of folders) {
        const idx = this.knownFolders.findIndex(f => f.folderId === folder.folderId);
        if (idx >= 0) {
          this.knownFolders[idx] = folder;
        } else {
          this.knownFolders.push(folder);
        }
      }
      this.folderVersion.update(v => v + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load folders';
      this.error.set(msg);
      console.error('[FolderService] listFolders error:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Retrieves a specific folder by its ID from the internal cache.
   *
   * @param folderId The ID of the folder to retrieve.
   * @returns The `Folder` object if found, otherwise `undefined`.
   */
  getFolder(folderId: string): Folder | undefined {
    return this.knownFolders.find((folder: Folder) => folder.folderId === folderId);
  }

  /**
   * Creates a new folder via the backend API.
   * On success, adds the returned folder to both the signal and cache.
   *
   * @param name The name of the new folder.
   * @param parentId The ID of the parent folder. Defaults to 'ROOT'.
   */
  async createFolder(name: string, parentId = 'ROOT'): Promise<void> {
    this.error.set(null);

    try {
      const newFolder = await firstValueFrom(
        this.api.post<Folder>('/folders', { folderName: name, parentFolderId: parentId })
      );

      this.knownFolders.push(newFolder);
      this.folders.update(current => [...current, newFolder]);
      this.folderVersion.update(v => v + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create folder';
      this.error.set(msg);
      console.error('[FolderService] createFolder error:', err);
    }
  }

  /**
   * Renames an existing folder via the backend API.
   *
   * @param folderId The ID of the folder to rename.
   * @param newName The new name to give to the folder.
   */
  async renameFolder(folderId: string, newName: string): Promise<void> {
    this.error.set(null);

    try {
      const updated = await firstValueFrom(
        this.api.patch<Folder>('/folders/' + folderId, { name: newName })
      );

      // Update cache
      const idx = this.knownFolders.findIndex(f => f.folderId === folderId);
      if (idx >= 0) {
        this.knownFolders[idx] = { ...this.knownFolders[idx], folderName: updated.folderName ?? newName, updatedAt: updated.updatedAt };
      }

      // Update signal
      this.folders.update(currentFolders =>
        currentFolders.map(f => f.folderId === folderId ? { ...f, folderName: newName, updatedAt: new Date().toISOString() } : f)
      );
      this.folderVersion.update(v => v + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to rename folder';
      this.error.set(msg);
      console.error('[FolderService] renameFolder error:', err);
    }
  }

  /**
   * Deletes a folder via the backend API and updates the signal.
   *
   * @param folderId The ID of the folder to delete.
   */
  async deleteFolder(folderId: string): Promise<void> {
    this.error.set(null);

    try {
      await firstValueFrom(
        this.api.delete('/folders/' + folderId)
      );

      this.knownFolders = this.knownFolders.filter(f => f.folderId !== folderId);
      this.folders.update(currentFolders =>
        currentFolders.filter((folder: Folder) => folder.folderId !== folderId)
      );
      this.folderVersion.update(v => v + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete folder';
      this.error.set(msg);
      console.error('[FolderService] deleteFolder error:', err);
    }
  }

  /**
   * Gets the total count of all known folders.
   *
   * @returns The total number of folders as a number.
   */
  getTotalCount(): number {
    return this.knownFolders.length;
  }

  /**
   * Retrieves all known folders from the internal cache.
   *
   * @returns An array of all Folder objects.
   */
  getAllFolders(): Folder[] {
    this.folderVersion();
    return [...this.knownFolders];
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
