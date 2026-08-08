import { Component, output, signal, viewChild } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';

/**
 * Interface representing a single item in the context menu.
 */
export interface ContextMenuItem {
  label: string;
  icon: string;
  action: string;
  disabled?: boolean;
}

/**
 * A reusable context menu component powered by Angular Material.
 */
@Component({
  selector: 'app-context-menu',
  imports: [MatMenu, MatMenuItem, MatMenuTrigger, MatIcon],
  template: `
    <div
      class="trigger-element"
      [matMenuTriggerFor]="contextMenu"
      #menuTrigger="matMenuTrigger"
      [style.left.px]="menuPositionX()"
      [style.top.px]="menuPositionY()"
    ></div>

    <mat-menu #contextMenu="matMenu">
      @for (item of items(); track item.action) {
        <button mat-menu-item [disabled]="item.disabled" (click)="menuAction.emit(item.action)">
          <mat-icon>{{ item.icon }}</mat-icon>
          <span>{{ item.label }}</span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .trigger-element {
      position: fixed;
      width: 0;
      height: 0;
      visibility: hidden;
    }
  `
})
export class ContextMenuComponent {
  /** Emits the action string when a menu item is clicked. */
  menuAction = output<string>();

  /** Internal signal holding the currently displayed menu items. */
  items = signal<ContextMenuItem[]>([]);

  /** Reference to the hidden trigger element used to open the Material menu. */
  menuTrigger = viewChild.required<MatMenuTrigger>('menuTrigger');

  /** Internal signal for the X position of the menu trigger. */
  menuPositionX = signal(0);

  /** Internal signal for the Y position of the menu trigger. */
  menuPositionY = signal(0);

  /**
   * Opens the context menu at the specified mouse coordinates.
   * Called by parent components on (contextmenu) events.
   *
   * @param event The mouse event that triggered the context menu.
   * @param items The items to display in the context menu.
   */
  open(event: MouseEvent, items: ContextMenuItem[]): void {
    event.preventDefault();
    event.stopPropagation();
    this.items.set(items);
    this.menuPositionX.set(event.clientX);
    this.menuPositionY.set(event.clientY);
    this.menuTrigger().openMenu();
  }
}
