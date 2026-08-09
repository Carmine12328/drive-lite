import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatLabel, MatError } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatIcon } from '@angular/material/icon';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Login component for Drive Lite.
 */
@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButton,
    MatIconButton,
    MatCheckbox,
    MatFormField,
    MatLabel,
    MatError,
    MatInput,
    MatProgressSpinner,
    MatIcon
  ]
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  /** Form group for login */
  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    rememberMe: [false]
  });

  /** Error message signal */
  errorMessage = signal<string>('');
  
  /** Current theme state */
  isDarkTheme = signal<boolean>(true);

  /** Loading state from auth service */
  isLoading = this.authService.isLoading;

  /** Initializes the component and sets up the theme based on local storage or system preference. */
  ngOnInit() {
    const savedTheme = localStorage.getItem('drive-lite-theme');
    if (savedTheme) {
      this.isDarkTheme.set(savedTheme === 'dark');
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.isDarkTheme.set(prefersDark);
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }

  /** Toggles the application theme */
  toggleTheme() {
    const newTheme = this.isDarkTheme() ? 'light' : 'dark';
    this.isDarkTheme.set(!this.isDarkTheme());
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('drive-lite-theme', newTheme);
  }

  /** Handles form submission */
  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    const { email, password } = this.loginForm.value;

    try {
      this.authService.signIn(email, password);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to sign in. Please check your credentials and try again.';
      this.errorMessage.set(message);
    }
  }

  /** Initiates Cognito Hosted UI sign in */
  signInWithCognito() {
    this.authService.signInWithCognito();
  }
}
