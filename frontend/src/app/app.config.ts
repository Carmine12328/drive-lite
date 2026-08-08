import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

/**
 * Root application configuration for the Drive Lite SPA.
 *
 * Registers global providers used across the entire application:
 * - `provideBrowserGlobalErrorListeners` — catches unhandled errors and
 *   promise rejections at the browser level.
 * - `provideRouter` — enables Angular's standalone router with the
 *   application route definitions.
 *
 * @remarks
 * Additional providers (HttpClient, Angular Material, Amplify Auth) will
 * be registered here as the application grows beyond Phase 0 scaffolding.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes)],
};
