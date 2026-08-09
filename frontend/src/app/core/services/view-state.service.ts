import { Injectable, signal, WritableSignal } from '@angular/core';

/**
 * Service to manage global view state such as view mode, search query,
 * and sidebar visibility.
 */
@Injectable({ providedIn: 'root' })
export class ViewStateService {
  /**
   * The current view mode of the file browser ('grid' or 'list').
   */
  readonly viewMode: WritableSignal<'grid' | 'list'> = signal('grid');

  /**
   * The current search query entered by the user.
   */
  readonly searchQuery: WritableSignal<string> = signal('');

  /**
   * Whether the mobile sidebar drawer is open.
   * Defaults to false because on mobile the CSS starts the sidebar off-screen.
   * On desktop the sidebar is always visible regardless of this flag.
   */
  readonly sidebarOpen: WritableSignal<boolean> = signal(false);

  /**
   * Toggles the view mode between 'grid' and 'list'.
   */
  toggleViewMode(): void {
    this.viewMode.update(current => (current === 'grid' ? 'list' : 'grid'));
  }

  /**
   * Toggles the mobile sidebar open/closed.
   */
  toggleSidebar(): void {
    this.sidebarOpen.update(open => !open);
  }

  /**
   * Closes the sidebar when the viewport is at or below the mobile
   * breakpoint (768px). No-op on wider screens where the sidebar is
   * always visible via CSS.
   */
  closeSidebarOnMobile(): void {
    if (window.innerWidth <= 768) {
      this.sidebarOpen.set(false);
    }
  }
}
