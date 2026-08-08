import { Component, computed, input } from '@angular/core';

/**
 * Progress Bar component for displaying file upload or task progress in Drive Lite.
 *
 * Visualizes completion percentage alongside file name and applies status-based styling.
 */
@Component({
  selector: 'app-progress-bar',
  template: `
    <div class="progress-container">
      <div class="progress-info">
        <span class="file-name">{{ fileName() }}</span>
        <span class="percentage">{{ progress() }}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" [style.width.%]="progress()" [class]="fillClass()"></div>
      </div>
    </div>
  `,
  styles: [`
    .progress-container {
      width: 100%;
      padding: 8px 0;
    }

    .progress-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .file-name {
      color: var(--text-primary);
      font-size: 0.875rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 70%;
    }

    .percentage {
      color: var(--text-secondary);
      font-size: 0.875rem;
      font-weight: 600;
    }

    .progress-track {
      width: 100%;
      height: 6px;
      background: var(--bg-secondary);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      border-radius: var(--radius-full);
      transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .fill-uploading {
      background: var(--accent-gradient);
    }

    .fill-complete {
      background: var(--color-success);
    }

    .fill-error {
      background: var(--color-error);
    }
  `]
})
export class ProgressBarComponent {
  /**
   * Progress percentage value ranging from 0 to 100.
   */
  public readonly progress = input<number>(0);

  /**
   * Name of the file being processed or uploaded.
   */
  public readonly fileName = input<string>('');

  /**
   * Status of the operation ('uploading', 'complete', or 'error').
   */
  public readonly status = input<'uploading' | 'complete' | 'error'>('uploading');

  /**
   * Derived CSS class for the progress fill bar based on the status signal.
   */
  public readonly fillClass = computed<string>(() => {
    switch (this.status()) {
      case 'complete':
        return 'fill-complete';
      case 'error':
        return 'fill-error';
      case 'uploading':
      default:
        return 'fill-uploading';
    }
  });
}
