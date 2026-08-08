import { Component, computed, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

/**
 * Interface representing a single breadcrumb segment.
 */
export interface BreadcrumbSegment {
  id: string;
  name: string;
}

/**
 * Breadcrumb navigation component for Drive Lite.
 * Displays the path to the current folder and allows navigation to parent folders.
 */
@Component({
  selector: 'app-breadcrumb',
  imports: [MatIcon],
  templateUrl: './breadcrumb.component.html',
  styleUrl: './breadcrumb.component.scss',
})
export class BreadcrumbComponent {
  /**
   * The path segments to display.
   */
  path = input<BreadcrumbSegment[]>([]);

  /**
   * Emits the ID of the folder to navigate to.
   */
  navigate = output<string>();

  /**
   * Computes the full list of segments including the Home segment.
   */
  allSegments = computed(() => {
    return [{ id: 'ROOT', name: 'Home' }, ...this.path()];
  });

  /**
   * Computes whether the mobile ellipsis should be rendered in the DOM.
   * It will only be visible on mobile via CSS media queries.
   */
  showMobileEllipsis = computed(() => this.allSegments().length > 2);

  /**
   * Handles click events on a breadcrumb segment.
   * @param id The ID of the segment to navigate to.
   */
  onNavigate(id: string): void {
    this.navigate.emit(id);
  }
}
