import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { environment } from '../../../environments/environment';

/**
 * Unit tests for AuthService (login/logout flow, signal state, token storage & session handling).
 */
describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('should be initialized with default unauthenticated state', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(service.isLoading()).toBe(false);
    expect(service.getIdToken()).toBeNull();
  });

  describe('signUp', () => {
    it('successfully calls Cognito SignUpCommand and returns needsConfirmation', async () => {
      const sendSpy = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValueOnce({} as never);

      const promise = service.signUp('test@example.com', 'Password123!');
      expect(service.isLoading()).toBe(true);

      const result = await promise;
      expect(result).toEqual({ success: true, needsConfirmation: true });
      expect(service.isLoading()).toBe(false);
      expect(sendSpy).toHaveBeenCalled();

      // Flush dev-mode confirmation code GET request
      const req = httpMock.expectOne(
        (request) => request.url.includes('/auth/confirmation-code') && request.params.get('email') === 'test@example.com'
      );
      expect(req.request.method).toBe('GET');
      req.flush({ code: '123456' });
    });

    it('handles sign up errors and extracts user-friendly message', async () => {
      const error = new Error('User already exists');
      error.name = 'UsernameExistsException';
      vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockRejectedValueOnce(error);

      const result = await service.signUp('test@example.com', 'Password123!');
      expect(result).toEqual({
        success: false,
        message: 'An account with this email already exists.',
      });
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('confirmSignUp', () => {
    it('successfully confirms user registration with code', async () => {
      vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValueOnce({} as never);

      const result = await service.confirmSignUp('test@example.com', '123456');
      expect(result).toEqual({ success: true });
    });

    it('returns error when confirmation code is invalid', async () => {
      const error = new Error('Invalid code');
      error.name = 'CodeMismatchException';
      vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockRejectedValueOnce(error);

      const result = await service.confirmSignUp('test@example.com', '000000');
      expect(result).toEqual({
        success: false,
        message: 'Invalid verification code.',
      });
    });
  });

  describe('signIn', () => {
    it('authenticates user, stores tokens, sets signals, calls init-profile and navigates to dashboard', async () => {
      const fakeIdTokenPayload = {
        sub: 'user-sub-123',
        email: 'user@example.com',
      };
      // Base64Url encode header.payload.sig
      const base64Payload = btoa(JSON.stringify(fakeIdTokenPayload));
      const fakeIdToken = `header.${base64Payload}.signature`;

      vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValueOnce({
        AuthenticationResult: {
          IdToken: fakeIdToken,
          AccessToken: 'fake-access-token',
          RefreshToken: 'fake-refresh-token',
          ExpiresIn: 3600,
        },
      } as never);

      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const signInPromise = service.signIn('user@example.com', 'Secret123!');

      // Allow async initiateAuth promise to resolve and trigger initializeProfile HTTP request
      await Promise.resolve();
      await Promise.resolve();

      // Flush the init-profile HTTP call triggered during authenticateUser
      const req = httpMock.expectOne(`${environment.apiUrl}/auth/init-profile`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ userId: 'user-sub-123', email: 'user@example.com' });
      req.flush({ message: 'Profile initialized' });

      const result = await signInPromise;

      expect(result).toEqual({ success: true });
      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()).toEqual({ userId: 'user-sub-123', email: 'user@example.com' });
      expect(service.getIdToken()).toBe(fakeIdToken);
      expect(sessionStorage.getItem('drive-lite-tokens')).not.toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  describe('signOut', () => {
    it('revokes refresh token, clears token storage, resets auth signals and navigates to landing', async () => {
      const fakeIdTokenPayload = { sub: 'user-sub-123', email: 'user@example.com' };
      const fakeIdToken = `header.${btoa(JSON.stringify(fakeIdTokenPayload))}.signature`;

      // Set initial authenticated state via tokens in sessionStorage + initAuth
      const tokenSet = {
        idToken: fakeIdToken,
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
      };
      sessionStorage.setItem('drive-lite-tokens', JSON.stringify(tokenSet));
      service.initAuth();

      expect(service.isAuthenticated()).toBe(true);

      const sendSpy = vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockResolvedValueOnce({} as never);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await service.signOut();

      expect(sendSpy).toHaveBeenCalled();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
      expect(service.getIdToken()).toBeNull();
      expect(sessionStorage.getItem('drive-lite-tokens')).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith(['/auth/landing']);
    });
  });

  describe('initAuth', () => {
    it('restores auth state when valid non-expired tokens are present in sessionStorage', () => {
      const fakeIdTokenPayload = { sub: 'restored-user-123', email: 'restored@example.com' };
      const fakeIdToken = `header.${btoa(JSON.stringify(fakeIdTokenPayload))}.signature`;

      const tokenSet = {
        idToken: fakeIdToken,
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
      };
      sessionStorage.setItem('drive-lite-tokens', JSON.stringify(tokenSet));

      service.initAuth();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()).toEqual({ userId: 'restored-user-123', email: 'restored@example.com' });
      expect(service.getIdToken()).toBe(fakeIdToken);
    });

    it('clears session when stored tokens are expired', () => {
      const tokenSet = {
        idToken: 'expired-token',
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Date.now() - 1000, // Expired
      };
      sessionStorage.setItem('drive-lite-tokens', JSON.stringify(tokenSet));

      service.initAuth();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
      expect(service.getIdToken()).toBeNull();
      expect(sessionStorage.getItem('drive-lite-tokens')).toBeNull();
    });
  });
});
