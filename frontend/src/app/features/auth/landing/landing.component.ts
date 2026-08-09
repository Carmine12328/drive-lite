import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Landing page component serving as the Dual Auth Gateway.
 */
@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  imports: [MatIcon, MatIconButton, RouterLink]
})
export class LandingComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  readonly isDarkTheme = signal(true);

  /**
   * Initializes theme on load.
   */
  ngOnInit(): void {
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

  /**
   * Toggles the application theme.
   */
  toggleTheme(): void {
    const newTheme = !this.isDarkTheme();
    this.isDarkTheme.set(newTheme);
    const themeStr = newTheme ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', themeStr);
    localStorage.setItem('drive-lite-theme', themeStr);
  }

  /**
   * Navigates to custom register form.
   */
  navigateToCustomRegister(): void {
    this.router.navigate(['/auth/register']);
  }

  /**
   * Triggers Cognito Hosted UI sign in.
   */
  signInWithCognito(): void {
    this.authService.signInWithCognito();
  }
}
