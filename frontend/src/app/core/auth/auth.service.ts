import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import { Router } from '@angular/router';

/** Authenticated user profile. */
export interface User {
  email: string;
  userId: string;
}

/**
 * Root authentication service for managing user sessions, login state, and authentication flows.
 * Uses localStorage stubs for development prior to AWS Amplify integration.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  /** Signal indicating whether the current user is authenticated. */
  public readonly isAuthenticated: WritableSignal<boolean> = signal<boolean>(false);

  /** Signal holding the currently authenticated user profile or null. */
  public readonly currentUser: WritableSignal<User | null> = signal<User | null>(null);

  /** Signal indicating whether an authentication operation is in progress. */
  public readonly isLoading: WritableSignal<boolean> = signal<boolean>(false);

  private readonly STORAGE_KEY = 'drive-lite-auth';
  private readonly MOCK_TOKEN = 'MOCK_JWT_TOKEN';

  private readonly router = inject(Router);

  /**
   * Registers a new user with email and password (Stub implementation).
   * Stores the unverified user profile in localStorage.
   *
   * @param email User's email address.
   * @param password User's password.
   */
  public signUp(email: string, password: string): void {
    // STUB: replace with Amplify call
    try {
      const userRecord = {
        email,
        userId: crypto.randomUUID(),
        verified: false,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(userRecord));
    } catch (error) {
      console.error('[AuthService] signUp localStorage error:', error);
    }
    this.isAuthenticated.set(false);
    console.debug('[AuthService] signUp stub:', email);
  }

  /**
   * Confirms a user's sign-up with a verification code (Stub implementation).
   * Marks the user as verified in localStorage, updates auth signals, and navigates to dashboard.
   *
   * @param email User's email address.
   * @param code Verification code sent to user's email.
   */
  public confirmSignUp(email: string, code: string): void {
    // STUB: replace with Amplify call
    try {
      const rawData = localStorage.getItem(this.STORAGE_KEY);
      if (rawData) {
        const data = JSON.parse(rawData);
        data.verified = true;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        const user: User = { email: data.email, userId: data.userId };
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      } else {
        const user: User = { email, userId: crypto.randomUUID() };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ ...user, verified: true }));
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      }
    } catch (error) {
      console.error('[AuthService] confirmSignUp localStorage error:', error);
    }
    this.router.navigate(['/dashboard']);
    console.debug('[AuthService] confirmSignUp stub:', email);
  }

  /**
   * Authenticates a user with email and password (Stub implementation).
   * Sets verified session data in localStorage, updates signals, and navigates to dashboard.
   *
   * @param email User's email address.
   * @param password User's password.
   */
  public signIn(email: string, password: string): void {
    // STUB: replace with Amplify call
    let user: User = { email, userId: crypto.randomUUID() };
    try {
      const rawData = localStorage.getItem(this.STORAGE_KEY);
      if (rawData) {
        const data = JSON.parse(rawData);
        if (data.email === email && data.userId) {
          user = { email: data.email, userId: data.userId };
        }
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ ...user, verified: true }));
    } catch (error) {
      console.error('[AuthService] signIn localStorage error:', error);
    }
    this.isAuthenticated.set(true);
    this.currentUser.set(user);
    this.router.navigate(['/dashboard']);
    console.debug('[AuthService] signIn stub:', email);
  }

  /**
   * Initiates authentication using AWS Cognito Hosted UI / OAuth (Stub implementation).
   * Authenticates with hardcoded Cognito email and navigates to dashboard.
   */
  public signInWithCognito(): void {
    // STUB: replace with Amplify call
    this.signIn('cognito-user@example.com', 'mock-password');
    console.debug('[AuthService] signInWithCognito stub');
  }

  /**
   * Handles the redirect callback after Cognito authentication (Stub implementation).
   * Re-uses signInWithCognito stub logic and logs the action.
   */
  public handleCognitoCallback(): void {
    // STUB: replace with Amplify call
    this.signInWithCognito();
    console.debug('[AuthService] handleCognitoCallback stub');
  }

  /**
   * Signs out the current user, clears local session state from localStorage,
   * resets signals, and navigates to the auth landing page.
   */
  public signOut(): void {
    // STUB: replace with Amplify call
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('[AuthService] signOut localStorage error:', error);
    }
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    this.router.navigate(['/auth/landing']);
    console.debug('[AuthService] signOut stub');
  }

  /**
   * Retrieves the currently logged-in user profile from localStorage or signal state.
   *
   * @returns User profile object if authenticated, otherwise null.
   */
  public getCurrentUser(): User | null {
    // STUB: replace with Amplify call
    console.debug('[AuthService] getCurrentUser stub');
    try {
      const rawData = localStorage.getItem(this.STORAGE_KEY);
      if (rawData) {
        const data = JSON.parse(rawData);
        if (data.email && data.userId) {
          return { email: data.email, userId: data.userId };
        }
      }
    } catch (error) {
      console.error('[AuthService] getCurrentUser localStorage error:', error);
    }
    return this.currentUser();
  }

  /**
   * Retrieves the current user's JWT ID token (Stub implementation).
   *
   * @returns Mock JWT token string.
   */
  public getIdToken(): string {
    // STUB: replace with Amplify call
    console.debug('[AuthService] getIdToken stub');
    return this.MOCK_TOKEN;
  }

  /**
   * Initializes authentication state on app startup.
   * Checks localStorage for an active, verified user session and updates signals accordingly.
   */
  public initAuth(): void {
    // STUB: replace with Amplify call
    try {
      const rawData = localStorage.getItem(this.STORAGE_KEY);
      if (rawData) {
        const data = JSON.parse(rawData);
        if (data.verified && data.email && data.userId) {
          const user: User = { email: data.email, userId: data.userId };
          this.isAuthenticated.set(true);
          this.currentUser.set(user);
          console.debug('[AuthService] initAuth stub - authenticated:', user.email);
          return;
        }
      }
    } catch (error) {
      console.error('[AuthService] initAuth localStorage error:', error);
    }
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    console.debug('[AuthService] initAuth stub - not authenticated');
  }
}
