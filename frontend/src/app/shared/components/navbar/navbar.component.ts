import { Component, inject, signal } from '@angular/core';
import { MatToolbar } from '@angular/material/toolbar';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatDivider } from '@angular/material/divider';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { ViewStateService } from '../../../core/services/view-state.service';

/**
 * Navbar component for the Drive Lite application.
 * Provides branding, search, view toggle, theme toggle, and user menu.
 */
@Component({
  selector: 'app-navbar',
  imports: [
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
  private readonly viewState = inject(ViewStateService);

  /** Current view mode — reads from the shared service. */
  readonly viewMode = this.viewState.viewMode;

  /** Current theme state. */
  readonly isDarkMode = signal<boolean>(true);

  /** Tracks search input for two-way binding. */
  searchText = '';

  /** Tracks whether search is expanded on mobile. */
  readonly isSearchExpanded = signal<boolean>(false);

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

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(() => {
      this.viewState.searchQuery.set(value);
    }, 300);
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
