import { Service, signal, computed, effect, inject, WritableSignal, Signal } from '@angular/core';
import { FileItem } from '../models/file-item.model';
import { Folder } from '../models/folder.model';
import { FileService } from './file.service';
import { FolderService } from './folder.service';

/**
 * Type representing a search result which can be a file or a folder.
 */
export type SearchResult = (FileItem | Folder) & { resultType: 'file' | 'folder' };

/**
 * Service responsible for managing global search state and logic.
 */
@Service()
export class SearchService {
  private readonly fileService = inject(FileService);
  private readonly folderService = inject(FolderService);

  /** Raw query input from the user */
  public readonly searchQuery: WritableSignal<string> = signal<string>('');

  /** Debounced query used for actual searching */
  public readonly debouncedQuery: WritableSignal<string> = signal<string>('');

  /** Indicates if a search debounce is currently active */
  public readonly isSearching: WritableSignal<boolean> = signal<boolean>(false);

  /**
   * Computed search results filtering files and folders based on the debounced query.
   * Returns folders first, capped at 10 total results.
   */
  public readonly searchResults: Signal<SearchResult[]> = computed(() => {
    const query = this.debouncedQuery().trim().toLowerCase();
    if (!query) {
      return [];
    }

    const folders = this.folderService.getAllFolders();
    const files = this.fileService.getAllFiles();

    const matchedFolders: SearchResult[] = folders
      .filter((f) => f.folderName.toLowerCase().includes(query))
      .map((f) => ({ ...f, resultType: 'folder' as const }));

    const matchedFiles: SearchResult[] = files
      .filter((f) => f.fileName.toLowerCase().includes(query))
      .map((f) => ({ ...f, resultType: 'file' as const }));

    return [...matchedFolders, ...matchedFiles].slice(0, 10);
  });

  private searchTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const query = this.searchQuery();
      this.isSearching.set(true);

      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
      }

      this.searchTimeout = setTimeout(() => {
        this.debouncedQuery.set(query);
        this.isSearching.set(false);
      }, 300);
    }, { allowSignalWrites: true });
  }

  /**
   * Clears the search input and results.
   */
  public clearSearch(): void {
    this.searchQuery.set('');
    this.debouncedQuery.set('');
    this.isSearching.set(false);
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }
}
