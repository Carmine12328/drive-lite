import { TestBed } from '@angular/core/testing';
import { SearchService } from './search.service';
import { FileService } from './file.service';
import { FolderService } from './folder.service';
import { FileItem } from '../models/file-item.model';
import { Folder } from '../models/folder.model';

/**
 * Unit tests for SearchService (debouncing logic, filtering files/folders, clearance).
 */
describe('SearchService', () => {
  let service: SearchService;
  let mockFileService: Partial<FileService>;
  let mockFolderService: Partial<FolderService>;

  const dummyFolders: Folder[] = [
    {
      folderId: 'folder-1',
      folderName: 'Projects',
      parentFolderId: 'ROOT',
      createdAt: '2026-08-12T10:00:00.000Z',
      updatedAt: '2026-08-12T10:00:00.000Z',
    },
    {
      folderId: 'folder-2',
      folderName: 'Documents',
      parentFolderId: 'ROOT',
      createdAt: '2026-08-12T10:00:00.000Z',
      updatedAt: '2026-08-12T10:00:00.000Z',
    },
  ];

  const dummyFiles: FileItem[] = [
    {
      fileId: 'file-1',
      fileName: 'Project Plan.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      s3Key: 'key1',
      folderId: 'folder-1',
      userId: 'user-1',
      uploadStatus: 'COMPLETED',
      createdAt: '2026-08-12T10:00:00.000Z',
      updatedAt: '2026-08-12T10:00:00.000Z',
    },
    {
      fileId: 'file-2',
      fileName: 'Resume.docx',
      fileSize: 2048,
      mimeType: 'application/msword',
      s3Key: 'key2',
      folderId: 'ROOT',
      userId: 'user-1',
      uploadStatus: 'COMPLETED',
      createdAt: '2026-08-12T10:00:00.000Z',
      updatedAt: '2026-08-12T10:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();

    mockFileService = {
      getAllFiles: vi.fn().mockReturnValue(dummyFiles),
    };

    mockFolderService = {
      getAllFolders: vi.fn().mockReturnValue(dummyFolders),
    };

    TestBed.configureTestingModule({
      providers: [
        SearchService,
        { provide: FileService, useValue: mockFileService },
        { provide: FolderService, useValue: mockFolderService },
      ],
    });

    service = TestBed.inject(SearchService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be created with initial empty search state', () => {
    expect(service.searchQuery()).toBe('');
    expect(service.debouncedQuery()).toBe('');
    expect(service.searchResults()).toEqual([]);
  });

  it('debounces query input updates by 300ms', () => {
    service.searchQuery.set('project');
    TestBed.flushEffects();

    expect(service.isSearching()).toBe(true);
    expect(service.debouncedQuery()).toBe('');

    // Advance timers past 300ms debounce window
    vi.advanceTimersByTime(300);

    expect(service.isSearching()).toBe(false);
    expect(service.debouncedQuery()).toBe('project');
  });

  it('returns matching folders first, followed by matching files', () => {
    service.searchQuery.set('project');
    TestBed.flushEffects();
    vi.advanceTimersByTime(300);

    const results = service.searchResults();
    expect(results.length).toBe(2);

    // Folder "Projects" matches first
    expect(results[0]).toEqual({
      ...dummyFolders[0],
      resultType: 'folder',
    });

    // File "Project Plan.pdf" matches second
    expect(results[1]).toEqual({
      ...dummyFiles[0],
      resultType: 'file',
    });
  });

  it('limits results to a maximum of 10 items', () => {
    // Return 8 matching folders and 8 matching files
    const manyFolders = Array.from({ length: 8 }, (_, i) => ({
      folderId: `f-${i}`,
      folderName: `Test Folder ${i}`,
      parentFolderId: 'ROOT',
      createdAt: '2026-08-12T10:00:00.000Z',
      updatedAt: '2026-08-12T10:00:00.000Z',
    }));
    const manyFiles = Array.from({ length: 8 }, (_, i) => ({
      fileId: `file-${i}`,
      fileName: `Test File ${i}.txt`,
      fileSize: 500,
      mimeType: 'text/plain',
      s3Key: `k-${i}`,
      folderId: 'ROOT',
      userId: 'user-1',
      uploadStatus: 'COMPLETED' as const,
      createdAt: '2026-08-12T10:00:00.000Z',
      updatedAt: '2026-08-12T10:00:00.000Z',
    }));

    vi.mocked(mockFolderService.getAllFolders!).mockReturnValue(manyFolders);
    vi.mocked(mockFileService.getAllFiles!).mockReturnValue(manyFiles);

    service.searchQuery.set('test');
    TestBed.flushEffects();
    vi.advanceTimersByTime(300);

    expect(service.searchResults().length).toBe(10);
  });

  it('clears search input, debounced query, and searching state', () => {
    service.searchQuery.set('resume');
    TestBed.flushEffects();
    vi.advanceTimersByTime(300);

    expect(service.debouncedQuery()).toBe('resume');

    service.clearSearch();

    expect(service.searchQuery()).toBe('');
    expect(service.debouncedQuery()).toBe('');
    expect(service.isSearching()).toBe(false);
    expect(service.searchResults()).toEqual([]);
  });
});
