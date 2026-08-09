/**
 * Root component for the Drive Lite application.
 *
 * Acts as the minimal shell that hosts the Angular router outlet.
 * All feature modules are rendered as children of this component
 * via lazy-loaded routes defined in `app.routes.ts`.
 */
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
