import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';

/**
 * Root application configuration for the Drive Lite SPA.
 *
 * Registers global providers used across the entire application:
 * - `provideBrowserGlobalErrorListeners` — catches unhandled errors and
 *   promise rejections at the browser level.
 * - `provideAnimationsAsync` — enables Angular Material animations
 *   (loaded asynchronously to keep the initial bundle small).
 * - `provideHttpClient` — configures HttpClient with the auth interceptor
 *   that attaches Bearer tokens and skips presigned S3 URLs.
 * - `provideRouter` — enables Angular's standalone router with
 *   component input binding for route parameter injection.
 * - `provideAppInitializer` — restores authentication state from
 *   localStorage on app startup via AuthService.initAuth().
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    provideAppInitializer(() => inject(AuthService).initAuth()),
  ],
};
