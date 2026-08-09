import { Component } from '@angular/core';

/**
 * Placeholder component for the Trash view.
 */
@Component({
  selector: 'app-trash',
  template: `
    <div class="trash-container">
      <div class="glass-panel trash-card">
        <span class="material-icons trash-icon gradient-text">delete</span>
        <h2>Trash</h2>
        <p>Coming in Step 8</p>
      </div>
    </div>
  `,
  styles: `
    .trash-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      padding: 2rem;
    }
    .trash-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3rem;
      text-align: center;
      color: var(--text-primary);
      max-width: 400px;
      width: 100%;
    }
    .trash-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h2 {
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
    p {
      color: var(--text-secondary, #888);
    }
  `
})
export class TrashComponent {}
