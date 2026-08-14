import { Component, inject } from '@angular/core';
import { RouterOutlet, ChildrenOutletContexts } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { routeAnimations } from '../../core/animations/route.animations';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { ViewStateService } from '../../core/services/view-state.service';
import { CommandPaletteComponent } from '../../shared/components/command-palette/command-palette.component';

/**
 * Authenticated layout shell wrapping the navbar and a router outlet.
 *
 * All guarded child routes (dashboard, file-browser, trash) render
 * inside this component's `<router-outlet>`. The navbar is always
 * visible when the user is authenticated.
 *
 * View mode and search state are managed by the injected
 * {@link ViewStateService} singleton — the shell no longer holds its
 * own signals for these values.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <app-navbar />
    <main class="shell-content" [@routeAnimations]="getRouteAnimationData()">
      <router-outlet />
    </main>
  `,
  animations: [routeAnimations],
  host: {
    '(document:contextmenu)': '$event.preventDefault()',
    '(document:keydown)': 'onGlobalKeydown($event)'
  },
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }

    .shell-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: var(--space-6);
      min-height: 0;
      overflow: hidden;
    }

    @media (max-width: 767px) {
      .shell-content {
        padding: var(--space-3);
      }
    }
  `],
})
export class ShellComponent {
  /**
   * Shared view state service.
   * Injected here to ensure it's instantiated at the shell level.
   * The navbar writes to it; child routes (e.g. FileBrowserComponent) read from it.
   */
  private readonly viewState = inject(ViewStateService);

  /**
   * Injected MatDialog service to open Command Palette.
   */
  private readonly dialog = inject(MatDialog);

  /**
   * Router contexts for animations.
   */
  private readonly contexts = inject(ChildrenOutletContexts);

  /**
   * Listens for Ctrl+K or Cmd+K to launch the Command Palette modal.
   */
  onGlobalKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openCommandPalette();
    }
  }

  /**
   * Opens the Command Palette dialog.
   */
  openCommandPalette(): void {
    // Avoid opening duplicate dialogs if already open
    if (this.dialog.openDialogs.some(d => d.componentInstance instanceof CommandPaletteComponent)) {
      return;
    }

    this.dialog.open(CommandPaletteComponent, {
      width: '560px',
      maxWidth: '92vw',
      panelClass: 'command-palette-dialog',
      position: { top: '15vh' },
      autoFocus: false,
    });
  }

  /**
   * Gets animation data from the active route.
   */
  getRouteAnimationData(): string {
    return this.contexts.getContext('primary')?.route?.snapshot?.data?.['animation'];
  }
}

