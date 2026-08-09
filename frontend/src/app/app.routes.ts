import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

/**
 * Top-level route definitions for the Drive Lite application.
 *
 * Auth routes are defined first (no guard) so unauthenticated users can
 * access landing, login, register, and callback pages. The shell route
 * wraps all authenticated child routes behind `authGuard`.
 *
 * All feature routes use lazy loading via `loadComponent` to keep
 * the initial bundle small.
 */
export const routes: Routes = [
  // --- Public auth routes (no guard) ---
  {
    path: 'auth',
    children: [
      { path: '', redirectTo: 'landing', pathMatch: 'full' },
      {
        path: 'landing',
        loadComponent: () =>
          import('./features/auth/landing/landing.component').then(
            (m) => m.LandingComponent,
          ),
        data: { animation: 'LandingPage' }
      },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then(
            (m) => m.LoginComponent,
          ),
        data: { animation: 'LoginPage' }
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register/register.component').then(
            (m) => m.RegisterComponent,
          ),
        data: { animation: 'RegisterPage' }
      },
      {
        path: 'callback',
        loadComponent: () =>
          import(
            './features/auth/cognito-callback/cognito-callback.component'
          ).then((m) => m.CognitoCallbackComponent),
        data: { animation: 'CallbackPage' }
      },
    ],
  },

  // --- Authenticated routes (guarded, wrapped in ShellComponent) ---
  {
    path: '',
    loadComponent: () =>
      import('./features/shell/shell.component').then(
        (m) => m.ShellComponent,
      ),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
        data: { animation: 'DashboardPage' }
      },
      {
        path: 'drive',
        loadComponent: () =>
          import('./features/file-browser/file-browser.component').then(
            (m) => m.FileBrowserComponent,
          ),
        data: { animation: 'DrivePage' }
      },
      {
        path: 'drive/folder/:folderId',
        loadComponent: () =>
          import('./features/file-browser/file-browser.component').then(
            (m) => m.FileBrowserComponent,
          ),
        data: { animation: 'DriveFolderPage' }
      },
      {
        path: 'drive/trash',
        loadComponent: () =>
          import('./features/file-browser/trash/trash.component').then(
            (m) => m.TrashComponent,
          ),
        data: { animation: 'TrashPage' }
      },
    ],
  },

  // --- Fallback ---
  { path: '**', redirectTo: 'auth/landing' },
];
