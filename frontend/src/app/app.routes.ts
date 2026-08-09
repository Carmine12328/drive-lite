import { Routes } from '@angular/router';

/**
 * Top-level route definitions for the Drive Lite application.
 *
 * Auth routes are defined first (no guard) so unauthenticated users can
 * access landing, login, register, and callback pages. Authenticated
 * routes (dashboard, file-browser) will be added in Step 5 behind
 * the authGuard.
 *
 * All feature routes use lazy loading via `loadComponent` to keep
 * the initial bundle small.
 */
export const routes: Routes = [
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
      },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then(
            (m) => m.LoginComponent,
          ),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register/register.component').then(
            (m) => m.RegisterComponent,
          ),
      },
      {
        path: 'callback',
        loadComponent: () =>
          import(
            './features/auth/cognito-callback/cognito-callback.component'
          ).then((m) => m.CognitoCallbackComponent),
      },
    ],
  },
  { path: '', redirectTo: 'auth/landing', pathMatch: 'full' },
];
