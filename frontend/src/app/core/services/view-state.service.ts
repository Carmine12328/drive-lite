import { Service, signal, WritableSignal } from '@angular/core';

/**
 * Service to manage global view state such as view mode and search query.
 */
@Service()
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
   * Toggles the view mode between 'grid' and 'list'.
   */
  toggleViewMode(): void {
    this.viewMode.update(current => (current === 'grid' ? 'list' : 'grid'));
  }
}
