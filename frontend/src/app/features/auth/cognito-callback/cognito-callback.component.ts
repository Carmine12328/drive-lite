import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Component handling the OAuth redirect callback from Cognito Hosted UI.
 */
@Component({
  selector: 'app-cognito-callback',
  imports: [MatProgressSpinner, MatButton, MatIconButton, MatIcon],
  host: { class: 'callback-container' },
  template: `
    <button mat-icon-button class="theme-toggle" (click)="toggleTheme()" [attr.aria-label]="isDarkMode() ? 'Switch to light theme' : 'Switch to dark theme'">
      <mat-icon>{{ isDarkMode() ? 'light_mode' : 'dark_mode' }}</mat-icon>
    </button>
    @if (isLoading()) {
      <div class="status-container fade-in">
        <mat-progress-spinner mode="indeterminate" [diameter]="48" class="accent-spinner" />
        <p class="status-text">Completing sign-in...</p>
      </div>
    } @else if (errorMessage()) {
      <div class="glass-panel error-card slide-up">
        <mat-icon class="error-icon">error_outline</mat-icon>
        <h2>Authentication Failed</h2>
        <p>{{ errorMessage() }}</p>
        <button mat-flat-button class="btn-accent" (click)="retry()">Try Again</button>
      </div>
    }
  `,
  styles: [`
    :host {
      display: flex; align-items: center; justify-content: center; min-height: 100dvh;
      background: radial-gradient(circle at top right, var(--bg-surface), var(--bg-primary));
      position: relative; padding: var(--space-4);
    }
    .theme-toggle { position: absolute; top: var(--space-4); right: var(--space-4); color: var(--text-secondary); }
    .status-container { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
    .status-text { color: var(--text-secondary); font-size: 1.1rem; margin: 0; }
    .accent-spinner ::ng-deep circle { stroke: var(--accent-primary) !important; }
    .error-card {
      display: flex; flex-direction: column; align-items: center; gap: var(--space-3);
      padding: var(--space-8); max-width: 400px; text-align: center; color: var(--text-primary);
      h2 { margin: 0; font-size: 1.25rem; } p { margin: 0 0 var(--space-2) 0; color: var(--text-secondary); font-size: 0.9rem; }
    }
    .error-icon { font-size: 48px; width: 48px; height: 48px; color: var(--color-error); }
  `],
})
export class CognitoCallbackComponent implements OnInit {
  /** Indicates whether authentication processing is in progress. */
  public readonly isLoading = signal<boolean>(true);

  /** Holds error message if authentication callback fails. */
  public readonly errorMessage = signal<string | null>(null);

  /** Tracks whether dark mode is currently active. */
  public readonly isDarkMode = signal<boolean>(true);

  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  public ngOnInit(): void {
    this.initTheme();
    this.processCallback();
  }

  /** Processes the OAuth redirect callback from Cognito. */
  private processCallback(): void {
    this.isLoading.set(true);
    try {
      this.authService.handleCognitoCallback();
      // AuthService.handleCognitoCallback() navigates to /dashboard on success
    } catch (error: unknown) {
      this.isLoading.set(false);
      this.errorMessage.set(
        error instanceof Error ? error.message : 'An error occurred during authentication.'
      );
    }
  }

  /** Toggles between dark and light themes and persists the setting. */
  public toggleTheme(): void {
    const isDark = !this.isDarkMode();
    this.isDarkMode.set(isDark);
    try { localStorage.setItem('drive-lite-theme', isDark ? 'dark' : 'light'); } catch {}
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  /** Initializes theme state from localStorage. */
  private initTheme(): void {
    try {
      const isDark = localStorage.getItem('drive-lite-theme') !== 'light';
      this.isDarkMode.set(isDark);
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } catch {
      this.isDarkMode.set(true);
    }
  }

  /** Navigates back to auth landing on retry. */
  public retry(): void {
    this.router.navigate(['/auth/landing']);
  }
}
