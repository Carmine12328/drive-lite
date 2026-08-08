/**
 * Root component for the Drive Lite application.
 *
 * Acts as the shell that hosts the Angular router outlet. All feature
 * modules are rendered as children of this component via lazy-loaded routes.
 *
 * @remarks
 * Uses Angular 22 standalone component API — no NgModule required.
 * The `title` signal is available for binding in the template.
 */
import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  /** Application title displayed in the shell template. */
  protected readonly title = signal('drive-lite');
}
