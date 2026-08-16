import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';

/** Feature category identifiers for the interactive showcase. */
export type ShowcaseFeature = 'browser' | 'upload' | 'preview' | 'analytics' | 'sharing';

/** Preview sub-tabs for the in-app preview showcase. */
export type PreviewSubTab = 'code' | 'pdf' | 'image';

/**
 * Landing page component serving as the application entry gateway,
 * highlighting core features, direct-to-S3 capabilities, and system architecture.
 */
@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  imports: [MatIcon, MatIconButton, MatButton],
})
export class LandingComponent implements OnInit {
  private readonly router = inject(Router);

  /** Theme signal (true = dark, false = light). */
  readonly isDarkTheme = signal(true);

  /** Currently selected showcase feature. */
  readonly activeFeature = signal<ShowcaseFeature>('browser');

  /** Currently selected preview sub-tab in the code/media showcase. */
  readonly activePreviewTab = signal<PreviewSubTab>('code');

  /**
   * Initializes theme from localStorage or system preference.
   */
  ngOnInit(): void {
    const savedTheme = localStorage.getItem('drive-lite-theme');
    if (savedTheme) {
      this.isDarkTheme.set(savedTheme === 'dark');
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      const prefersDark =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : true;
      this.isDarkTheme.set(prefersDark);
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }

  /**
   * Switches the active feature tab in the showcase.
   *
   * @param feature The feature tab to display.
   */
  selectFeature(feature: ShowcaseFeature): void {
    this.activeFeature.set(feature);
  }

  /**
   * Switches the active preview sub-tab.
   *
   * @param tab The media type sub-tab.
   */
  selectPreviewTab(tab: PreviewSubTab): void {
    this.activePreviewTab.set(tab);
  }

  /**
   * Smoothly scrolls to a target section by ID.
   *
   * @param elementId The HTML element ID to scroll to.
   */
  scrollToSection(elementId: string): void {
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Toggles the application theme between dark and light modes.
   */
  toggleTheme(): void {
    const newTheme = !this.isDarkTheme();
    this.isDarkTheme.set(newTheme);
    const themeStr = newTheme ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', themeStr);
    localStorage.setItem('drive-lite-theme', themeStr);
  }

  /** Navigates to registration form. */
  navigateToRegister(): void {
    this.router.navigate(['/auth/register']);
  }

  /** Navigates to sign in form. */
  navigateToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
}
