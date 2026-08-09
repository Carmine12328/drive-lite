import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';

/**
 * Authenticated layout shell wrapping the navbar and a router outlet.
 *
 * All guarded child routes (dashboard, file-browser, trash) render
 * inside this component's `<router-outlet>`. The navbar is always
 * visible when the user is authenticated.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <app-navbar
      (searchQuery)="onSearch($event)"
      (viewChange)="onViewChange($event)"
    />
    <main class="shell-content">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }

    .shell-content {
      flex: 1;
      padding: var(--space-6);
      overflow-y: auto;
    }
  `],
})
export class ShellComponent {
  /** Current search query from the navbar. */
  readonly searchQuery = signal('');

  /** Current view mode (grid or list) from the navbar. */
  readonly viewMode = signal<'grid' | 'list'>('grid');

  /**
   * Handles search query updates from the navbar.
   * @param query The search string entered by the user.
   */
  onSearch(query: string): void {
    this.searchQuery.set(query);
  }

  /**
   * Handles view mode toggle from the navbar.
   * @param mode The selected view mode.
   */
  onViewChange(mode: 'grid' | 'list'): void {
    this.viewMode.set(mode);
  }
}
