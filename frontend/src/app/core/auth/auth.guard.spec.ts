import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

/**
 * Unit tests for authGuard functional route guard.
 */
describe('authGuard', () => {
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('allows navigation when user is authenticated', () => {
    authService.isAuthenticated.set(true);

    const dummyRoute = {} as ActivatedRouteSnapshot;
    const dummyState = {} as RouterStateSnapshot;

    const canActivate = TestBed.runInInjectionContext(() => authGuard(dummyRoute, dummyState));

    expect(canActivate).toBe(true);
  });

  it('blocks navigation and redirects to /auth/login when user is unauthenticated', () => {
    authService.isAuthenticated.set(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const dummyRoute = {} as ActivatedRouteSnapshot;
    const dummyState = {} as RouterStateSnapshot;

    const canActivate = TestBed.runInInjectionContext(() => authGuard(dummyRoute, dummyState));

    expect(canActivate).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(['/auth/login']);
  });
});
