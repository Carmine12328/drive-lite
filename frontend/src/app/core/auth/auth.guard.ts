import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Functional route guard that protects routes requiring authentication.
 * Checks whether the user is currently authenticated via AuthService.
 * If authenticated, permits navigation; otherwise, redirects the user
 * to `/auth/landing` and blocks navigation.
 *
 * @param route The activated route snapshot.
 * @param state The router state snapshot.
 * @returns `true` if the user is authenticated, otherwise `false`.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/auth/landing']);
    return false;
  }

  return true;
};
