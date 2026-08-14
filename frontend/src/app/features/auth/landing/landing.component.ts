import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';

/**
 * Landing page component serving as the application entry gateway.
 */
@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  imports: [MatIcon, MatIconButton]
})
export class LandingComponent implements OnInit {
  private readonly router = inject(Router);

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
   * Navigates to registration form.
   */
  navigateToRegister(): void {
    this.router.navigate(['/auth/register']);
  }

  /**
   * Navigates to sign in form.
   */
  navigateToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
}
