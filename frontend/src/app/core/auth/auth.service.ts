import { inject, Service, signal, WritableSignal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { environment } from '../../../environments/environment';

/** Authenticated user profile. */
export interface User {
  email: string;
  userId: string;
}

/** Result of an authentication operation. */
export interface AuthResult {
  success: boolean;
  message?: string;
  /** When true, the user must complete email verification before signing in. */
  needsConfirmation?: boolean;
}

/**
 * Token set returned by Cognito after successful authentication.
 * Stored in memory (signals) and optionally persisted to sessionStorage.
 */
interface TokenSet {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /** Unix timestamp (ms) when the idToken expires. */
  expiresAt: number;
}

/** sessionStorage key for persisting tokens across page refreshes. */
const SESSION_STORAGE_KEY = 'drive-lite-tokens';

/**
 * Decode a JWT payload without cryptographic verification.
 *
 * This is safe for local development where we trust LocalStack-issued tokens.
 * In production, token verification is handled server-side by the API Gateway
 * JWT authorizer — the frontend never needs to verify signatures.
 *
 * @param token Raw JWT string (header.payload.signature)
 * @returns Parsed payload object
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  // Base64url → standard Base64 → decode
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(base64);
  return JSON.parse(json);
}

/**
 * Root authentication service for Drive Lite.
 *
 * Manages user sign-up, sign-in, token storage, and session lifecycle
 * using the Cognito Identity Provider SDK against LocalStack in development
 * and the real AWS Cognito service in production.
 *
 * Token storage strategy:
 * - Tokens are held in memory via signals (primary)
 * - Optionally persisted to sessionStorage for page-refresh survival
 * - NOT localStorage — tokens in localStorage are vulnerable to XSS
 */
@Service()
export class AuthService {
  /** Signal indicating whether the current user is authenticated. */
  public readonly isAuthenticated: WritableSignal<boolean> = signal<boolean>(false);

  /** Signal holding the currently authenticated user profile or null. */
  public readonly currentUser: WritableSignal<User | null> = signal<User | null>(null);

  /** Signal indicating whether an authentication operation is in progress. */
  public readonly isLoading: WritableSignal<boolean> = signal<boolean>(false);

  /** In-memory token storage. */
  private readonly tokens = signal<TokenSet | null>(null);

  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  /**
   * Cognito SDK client.
   * In development, points at LocalStack (http://localhost:4566).
   * In production, the endpoint is omitted so the SDK uses the default
   * regional Cognito endpoint.
   */
  private readonly cognito = new CognitoIdentityProviderClient({
    region: 'us-east-1',
    ...(environment.cognitoEndpoint
      ? { endpoint: environment.cognitoEndpoint }
      : {}),
  });

  // ── Sign Up ──────────────────────────────────────────────────────────

  /**
   * Registers a new user in Cognito with email and password.
   *
   * On success, the user is created but NOT confirmed — they must enter
   * a verification code via {@link confirmSignUp}.
   *
   * @param email User's email address (used as the Cognito username).
   * @param password User's chosen password.
   * @returns AuthResult indicating success or failure.
   */
  public async signUp(email: string, password: string): Promise<AuthResult> {
    this.isLoading.set(true);
    try {
      await this.cognito.send(
        new SignUpCommand({
          ClientId: environment.cognitoClientId,
          Username: email,
          Password: password,
          UserAttributes: [{ Name: 'email', Value: email }],
        }),
      );

      // In dev mode, fetch the confirmation code from cognito-local's data file
      // and log it to the console so the developer doesn't have to dig through
      // .cognito/db/*.json manually.
      if (!environment.production) {
        this.fetchAndLogConfirmationCode(email);
      }

      return { success: true, needsConfirmation: true };
    } catch (error: unknown) {
      const message = this.extractErrorMessage(error, 'Registration failed.');
      return { success: false, message };
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Confirm Sign Up ──────────────────────────────────────────────────

  /**
   * Confirms a user's registration with a 6-digit verification code.
   *
   * After successful confirmation, calls the proxy's `/auth/init-profile`
   * endpoint to create the user profile and ROOT folder in DynamoDB.
   *
   * LocalStack accepts any valid 6-digit code — no real email is sent.
   *
   * @param email The email address being confirmed.
   * @param code The 6-digit verification code.
   * @returns AuthResult indicating success or failure.
   */
  public async confirmSignUp(
    email: string,
    code: string,
  ): Promise<AuthResult> {
    this.isLoading.set(true);
    try {
      await this.cognito.send(
        new ConfirmSignUpCommand({
          ClientId: environment.cognitoClientId,
          Username: email,
          ConfirmationCode: code,
        }),
      );
      // No auto-sign-in after confirmation — we don't cache the password from
      // the registration form, so we can't call InitiateAuth here. The user
      // is redirected to the login page to sign in manually. The init-profile
      // call (DynamoDB profile + ROOT folder) happens on first sign-in.
      return { success: true };
    } catch (error: unknown) {
      const message = this.extractErrorMessage(error, 'Verification failed.');
      return { success: false, message };
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Sign In ──────────────────────────────────────────────────────────

  /**
   * Authenticates a user with email and password via Cognito.
   *
   * Uses the `USER_PASSWORD_AUTH` flow (InitiateAuth). On success:
   * 1. Stores tokens in memory + sessionStorage
   * 2. Extracts user ID (sub) and email from the ID token
   * 3. Updates isAuthenticated and currentUser signals
   * 4. Calls init-profile to ensure the user has a DynamoDB profile
   * 5. Navigates to /dashboard
   *
   * @param email User's email address.
   * @param password User's password.
   * @returns AuthResult indicating success or failure.
   */
  public async signIn(email: string, password: string): Promise<AuthResult> {
    this.isLoading.set(true);
    try {
      const result = await this.authenticateUser(email, password);
      if (!result.success) {
        return result;
      }

      // Navigate after successful sign-in
      await this.router.navigate(['/dashboard']);
      return { success: true };
    } catch (error: unknown) {
      const message = this.extractErrorMessage(error, 'Sign in failed.');
      return { success: false, message };
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Cognito Hosted UI (stub) ─────────────────────────────────────────

  /**
   * Initiates authentication via AWS Cognito Hosted UI.
   *
   * This remains a stub — the Hosted UI requires a real AWS Cognito domain
   * which isn't available in LocalStack. Will be implemented when deploying
   * to real AWS.
   */
  public signInWithCognito(): void {
    // STUB: Hosted UI requires real AWS Cognito domain — not available in LocalStack.
    // Will redirect to Cognito's hosted login page when deployed to real AWS.
    console.warn(
      '[AuthService] signInWithCognito is a stub. ' +
        'Hosted UI requires real AWS Cognito (not available in LocalStack).',
    );
  }

  /**
   * Handles the redirect callback after Cognito Hosted UI authentication.
   *
   * Stub — will be implemented when deploying to real AWS.
   */
  public handleCognitoCallback(): void {
    // STUB: Will parse OAuth callback params and exchange code for tokens
    console.warn('[AuthService] handleCognitoCallback is a stub.');
  }

  // ── Sign Out ─────────────────────────────────────────────────────────

  /**
   * Signs out the current user.
   *
   * Clears all token storage (memory + sessionStorage), resets auth signals,
   * and navigates to the auth landing page.
   */
  public signOut(): void {
    this.clearTokens();
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    this.router.navigate(['/auth/landing']);
  }

  // ── Token Access ─────────────────────────────────────────────────────

  /**
   * Returns the current ID token for API authentication.
   *
   * The auth interceptor calls this to attach the `Authorization: Bearer`
   * header to outgoing API requests.
   *
   * @returns The JWT ID token string, or null if not authenticated or expired.
   */
  public getIdToken(): string | null {
    const tokenSet = this.tokens();
    if (!tokenSet) {
      return null;
    }

    // Check expiry — return null if token is expired
    if (Date.now() >= tokenSet.expiresAt) {
      console.debug('[AuthService] ID token expired');
      return null;
    }

    return tokenSet.idToken;
  }

  /**
   * Retrieves the currently authenticated user profile.
   *
   * @returns User profile if authenticated, null otherwise.
   */
  public getCurrentUser(): User | null {
    return this.currentUser();
  }

  // ── Session Initialization ───────────────────────────────────────────

  /**
   * Initializes authentication state on app startup.
   *
   * Checks sessionStorage for saved tokens from a previous page load.
   * If valid (non-expired) tokens are found, restores the session without
   * requiring the user to sign in again.
   *
   * Called via APP_INITIALIZER in app.config.ts.
   */
  public initAuth(): void {
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) {
        this.isAuthenticated.set(false);
        this.currentUser.set(null);
        return;
      }

      const tokenSet: TokenSet = JSON.parse(stored);

      // Validate token expiry
      if (Date.now() >= tokenSet.expiresAt) {
        console.debug('[AuthService] Stored tokens expired, clearing session');
        this.clearTokens();
        this.isAuthenticated.set(false);
        this.currentUser.set(null);
        return;
      }

      // Restore session from stored tokens
      this.tokens.set(tokenSet);
      const user = this.extractUserFromToken(tokenSet.idToken);
      this.currentUser.set(user);
      this.isAuthenticated.set(true);
      console.debug('[AuthService] Session restored for:', user.email);
    } catch (error) {
      console.error('[AuthService] initAuth error:', error);
      this.clearTokens();
      this.isAuthenticated.set(false);
      this.currentUser.set(null);
    }
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  /**
   * Core authentication logic shared by signIn and auto-sign-in after confirmation.
   *
   * Calls Cognito's InitiateAuth with USER_PASSWORD_AUTH, stores tokens,
   * updates signals, and ensures the user has a DynamoDB profile.
   */
  private async authenticateUser(
    email: string,
    password: string,
  ): Promise<AuthResult> {
    const response = await this.cognito.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: environment.cognitoClientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }),
    );

    const authResult = response.AuthenticationResult;
    if (!authResult?.IdToken || !authResult.AccessToken) {
      return {
        success: false,
        message: 'Authentication succeeded but no tokens were returned.',
      };
    }

    // Store tokens
    const tokenSet: TokenSet = {
      idToken: authResult.IdToken,
      accessToken: authResult.AccessToken,
      refreshToken: authResult.RefreshToken ?? '',
      // ExpiresIn is in seconds — convert to absolute timestamp in ms
      expiresAt: Date.now() + (authResult.ExpiresIn ?? 3600) * 1000,
    };
    this.tokens.set(tokenSet);
    this.persistTokens(tokenSet);

    // Extract user info from ID token
    const user = this.extractUserFromToken(authResult.IdToken);
    this.currentUser.set(user);
    this.isAuthenticated.set(true);

    // Ensure user profile + ROOT folder exist in DynamoDB
    // This is idempotent — the handler uses ConditionExpression to skip if exists
    await this.initializeProfile(user.userId, user.email);

    return { success: true };
  }

  /**
   * Extract user information from a JWT ID token.
   *
   * @param idToken The raw JWT ID token string
   * @returns User object with email and userId (sub claim)
   */
  private extractUserFromToken(idToken: string): User {
    const payload = decodeJwtPayload(idToken);
    return {
      userId: (payload['sub'] as string) ?? 'unknown',
      email: (payload['email'] as string) ?? 'unknown@local.dev',
    };
  }

  /**
   * Call the proxy's /auth/init-profile endpoint to create the user's
   * DynamoDB profile and ROOT folder if they don't already exist.
   *
   * This replaces the Cognito post-confirmation trigger for local dev.
   * The handler is idempotent — safe to call on every sign-in.
   */
  private async initializeProfile(
    userId: string,
    email: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/auth/init-profile`, {
          userId,
          email,
        }),
      );
    } catch (error) {
      // Non-fatal — the profile may already exist (idempotent),
      // or the endpoint may not be available (e.g., running without backend).
      // Log but don't block the sign-in flow.
      console.warn('[AuthService] init-profile call failed:', error);
    }
  }

  /**
   * Persist tokens to sessionStorage for page-refresh survival.
   * Uses sessionStorage (not localStorage) to limit exposure — tokens
   * are cleared when the browser tab is closed.
   */
  private persistTokens(tokenSet: TokenSet): void {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(tokenSet));
    } catch (error) {
      console.warn('[AuthService] Failed to persist tokens:', error);
    }
  }

  /** Clear tokens from both memory and sessionStorage. */
  private clearTokens(): void {
    this.tokens.set(null);
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore — sessionStorage may not be available
    }
  }
  /**
   * Dev-only: fetch the confirmation code from the local backend and log it
   * to the browser console with a prominent style.
   *
   * This is fire-and-forget — it never blocks the signup flow and silently
   * swallows errors (the developer can always check .cognito/db/ manually).
   *
   * @param email The email address that was just registered.
   */
  private fetchAndLogConfirmationCode(email: string): void {
    firstValueFrom(
      this.http.get<{ code: string }>(
        `${environment.apiUrl}/auth/confirmation-code`,
        { params: { email } },
      ),
    )
      .then(({ code }) => {
        console.log(
          '%c[DEV] Confirmation code for %s: %c%s',
          'color: #4CAF50; font-weight: bold; font-size: 14px',
          email,
          'color: #FF9800; font-weight: bold; font-size: 18px',
          code,
        );
      })
      .catch(() => {
        // Non-fatal — the developer can check .cognito/db/*.json manually
        console.debug('[DEV] Could not fetch confirmation code — check .cognito/db/ manually');
      });
  }

  /**
   * Extract a user-friendly error message from a Cognito SDK error.
   *
   * Cognito errors have a `name` property (e.g., 'UsernameExistsException')
   * and a `message` property with a human-readable description.
   */
  private extractErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
      // Map common Cognito error names to user-friendly messages
      const name = (error as { name?: string }).name;
      switch (name) {
        case 'UsernameExistsException':
          return 'An account with this email already exists.';
        case 'NotAuthorizedException':
          return 'Incorrect email or password.';
        case 'UserNotConfirmedException':
          return 'Please verify your email first.';
        case 'UserNotFoundException':
          return 'No account found with this email.';
        case 'InvalidPasswordException':
          return error.message || 'Password does not meet requirements.';
        case 'CodeMismatchException':
          return 'Invalid verification code.';
        case 'ExpiredCodeException':
          return 'Verification code has expired. Please request a new one.';
        default:
          return error.message || fallback;
      }
    }
    return fallback;
  }
}
