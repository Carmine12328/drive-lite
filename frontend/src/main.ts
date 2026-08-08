/**
 * Application entry point — bootstraps the Angular standalone application.
 *
 * Uses `bootstrapApplication` (standalone API) instead of the legacy
 * `platformBrowserDynamic().bootstrapModule()` pattern. The root `App`
 * component and its global providers are defined in `appConfig`.
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
