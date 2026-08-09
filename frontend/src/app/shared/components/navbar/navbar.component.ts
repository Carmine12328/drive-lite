import { Component, inject, signal, computed } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbar } from '@angular/material/toolbar';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatDivider } from '@angular/material/divider';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { ViewStateService } from '../../../core/services/view-state.service';
import { SearchService, SearchResult } from '../../../core/services/search.service';
import { FileIconPipe } from '../../pipes/file-icon.pipe';
import { FileItem } from '../../../core/models/file-item.model';
import { Folder } from '../../../core/models/folder.model';

/**
 * Navbar component for the Drive Lite application.
 * Provides branding, search, view toggle, theme toggle, and user menu.
 */
@Component({
  selector: 'app-navbar',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatToolbar,
    MatIconButton,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatDivider,
    FormsModule
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  /** Injected authentication service. */
  readonly authService = inject(AuthService);

  /** Shared view state service for cross-component communication. */
  readonly viewState = inject(ViewStateService);

  /** Current view mode — reads from the shared service. */
  readonly viewMode = this.viewState.viewMode;

  /** Search service for global searching */
  readonly searchService = inject(SearchService);

  /** Router for navigation */
  readonly router = inject(Router);

  /** Current theme state. */
  readonly isDarkMode = signal<boolean>(true);

  /** Tracks search input for two-way binding. */
  searchText = '';

  /** Tracks whether search is expanded on mobile. */
  readonly isSearchExpanded = signal<boolean>(false);

  /** Tracks if search input is focused */
  readonly searchFocused = signal<boolean>(false);

  /** Computed state to determine if results should be shown */
  readonly showResults = computed(() => 
    this.searchFocused() && this.searchService.searchQuery().trim().length >= 2
  );

  /** Timeout reference for search debouncing. */
  private searchTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.initTheme();
  }

  /**
   * Initializes the theme from localStorage or defaults to dark.
   * Wrapped in try/catch for SSR/private-browsing safety.
   */
  private initTheme(): void {
    try {
      const savedTheme = localStorage.getItem('drive-lite-theme');
      // Default to dark if nothing saved (matches the initial data-theme="dark" in index.html)
      const isDark = savedTheme !== 'light';
      this.isDarkMode.set(isDark);
      this.applyTheme(isDark);
    } catch {
      // localStorage unavailable (SSR or private browsing) — keep dark default
      this.isDarkMode.set(true);
      this.applyTheme(true);
    }
  }

  /**
   * Toggles the view mode between grid and list via the shared service.
   */
  toggleViewMode(): void {
    this.viewState.toggleViewMode();
  }

  /**
   * Toggles the application theme between light and dark modes.
   */
  toggleTheme(): void {
    const newIsDark = !this.isDarkMode();
    this.isDarkMode.set(newIsDark);
    try {
      localStorage.setItem('drive-lite-theme', newIsDark ? 'dark' : 'light');
    } catch {
      // localStorage unavailable — theme still toggles for the current session
    }
    this.applyTheme(newIsDark);
  }

  /**
   * Applies the theme by setting a data attribute on the document element.
   * @param isDark Whether the dark theme should be applied.
   */
  private applyTheme(isDark: boolean): void {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  /**
   * Handles search input events and debounces the emission of the search query.
   * @param event The DOM event from the input element.
   */
  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchText = value;
    this.searchService.searchQuery.set(value);

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(() => {
      this.viewState.searchQuery.set(value);
    }, 300);
  }

  /**
   * Handles search input blur. Delays closing to allow clicks on results.
   */
  onSearchBlur(): void {
    setTimeout(() => {
      this.searchFocused.set(false);
    }, 200);
  }

  /**
   * Clears the current search.
   */
  clearSearch(): void {
    this.searchText = '';
    this.searchService.clearSearch();
    this.viewState.searchQuery.set('');
  }

  /**
   * Navigates to the selected search result.
   * @param result The clicked search result.
   */
  onResultClick(result: SearchResult): void {
    if (result.resultType === 'folder') {
      this.router.navigate(['/drive/folder', result.folderId]);
    } else {
      // In a real app we might preview or download the file, or go to its folder
      this.router.navigate(['/drive/folder', result.folderId]);
    }
    this.clearSearch();
  }

  /** Gets the ID for a search result */
  resultId(result: SearchResult): string {
    return result.resultType === 'folder' ? (result as Folder).folderId : (result as FileItem).fileId;
  }

  /** Gets the name for a search result */
  resultName(result: SearchResult): string {
    return result.resultType === 'folder' ? (result as Folder).folderName : (result as FileItem).fileName;
  }

  /** Gets the material icon name for a search result */
  resultIcon(result: SearchResult): string {
    if (result.resultType === 'folder') return 'folder';
    const file = result as FileItem;
    return new FileIconPipe().transform(file.mimeType);
  }

  /** 
   * Highlights the matching text in a result name based on the query.
   * @param name The original name
   * @returns HTML string with <mark> tags around the match
   */
  highlightMatch(name: string): string {
    const query = this.searchService.debouncedQuery().trim();
    if (!query) return name;
    
    // Escape regex characters
    const escapeRegExp = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    
    return name.replace(regex, '<mark>$1</mark>');
  }

  /**
   * Toggles the expansion state of the search input on mobile devices.
   */
  toggleSearch(): void {
    this.isSearchExpanded.update(expanded => !expanded);
  }

  /**
   * Signs the current user out using the authentication service.
   */
  signOut(): void {
    this.authService.signOut();
  }
}
