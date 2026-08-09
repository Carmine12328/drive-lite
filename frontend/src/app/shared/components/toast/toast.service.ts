/**
 * Toast panel classes (add to global styles.scss or import _toast-global-styles.scss):
 *
 * .toast-success .mat-mdc-snack-bar-container .mdc-snackbar__surface {
 *   background-color: var(--color-success) !important;
 * }
 * .toast-error .mat-mdc-snack-bar-container .mdc-snackbar__surface {
 *   background-color: var(--color-error) !important;
 * }
 * .toast-info .mat-mdc-snack-bar-container .mdc-snackbar__surface {
 *   background-color: var(--color-info) !important;
 * }
 * .toast-warning .mat-mdc-snack-bar-container .mdc-snackbar__surface {
 *   background-color: var(--color-warning) !important;
 * }
 */

import { inject, Service } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Service for displaying toast notification messages using Angular Material MatSnackBar.
 * Provides preset configurations for success, error, info, and warning notifications.
 */
@Service()
export class ToastService {
  private readonly snackBar = inject(MatSnackBar);

  /**
   * Displays a success notification toast.
   *
   * @param message - The text message to display in the notification.
   */
  public success(message: string): void {
    this.show(message, 'toast-success', 4000);
  }

  /**
   * Displays an error notification toast.
   *
   * @param message - The text message to display in the notification.
   */
  public error(message: string): void {
    this.show(message, 'toast-error', 6000);
  }

  /**
   * Displays an informational notification toast.
   *
   * @param message - The text message to display in the notification.
   */
  public info(message: string): void {
    this.show(message, 'toast-info', 4000);
  }

  /**
   * Displays a warning notification toast.
   *
   * @param message - The text message to display in the notification.
   */
  public warning(message: string): void {
    this.show(message, 'toast-warning', 4000);
  }

  /**
   * Helper method to open a snackbar notification with custom panel class and duration.
   *
   * @param message - The text message to display in the notification.
   * @param panelClass - The CSS panel class applied to style the toast notification.
   * @param duration - Display duration in milliseconds.
   */
  private show(message: string, panelClass: string, duration: number): void {
    this.snackBar.open(message, 'OK', {
      duration,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: [panelClass],
    });
  }
}
