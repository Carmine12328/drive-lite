---
name: angular-animations
description: Angular animation patterns for Drive Lite. Covers route transitions, micro-interactions, skeleton loading, shimmer effects, and performance-safe CSS animations.
---

# Angular Animations & Micro-Interactions in Drive Lite

This skill outlines the standards and implementation patterns for adding animations, transitions, and skeleton loading states to the Drive Lite Angular 22 application.

## 1. Setup

The Angular Animations module must be provided in `app.config.ts` using `provideAnimations()`:

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations()
  ]
};
```

## 2. Route Fade-In Transitions

To create smooth page transitions, apply the `@routeAnimations` trigger to the main `<router-outlet>`.

**Animation Definition (e.g., `src/app/core/animations/route.animations.ts`):**

```typescript
import { trigger, transition, style, animate, query } from '@angular/animations';

export const routeAnimations = trigger('routeAnimations', [
  transition('* <=> *', [
    query(':enter', [
      style({ opacity: 0, transform: 'translateY(10px)' }),
      animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
    ], { optional: true })
  ])
]);
```

**Component Usage:**

```typescript
import { Component, inject } from '@angular/core';
import { RouterOutlet, ChildrenOutletContexts } from '@angular/router';
import { routeAnimations } from './core/animations/route.animations';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div [@routeAnimations]="getRouteAnimationData()">
      <router-outlet></router-outlet>
    </div>
  `,
  animations: [routeAnimations]
})
export class AppComponent {
  private contexts = inject(ChildrenOutletContexts);

  getRouteAnimationData() {
    return this.contexts.getContext('primary')?.route?.snapshot?.data?.['animation'];
  }
}
```

In your `app.routes.ts`, add the `animation` data to routes:

```typescript
export const routes: Routes = [
  { path: 'dashboard', component: DashboardComponent, data: { animation: 'DashboardPage' } },
  { path: 'files', component: FilesComponent, data: { animation: 'FilesPage' } }
];
```

## 3. CSS Animations (@keyframes patterns)

For simple effects, prefer pure CSS animations over Angular Animations for better performance.

### Shimmer (Progress Bars / Loading States)

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.shimmer-bg {
  background: linear-gradient(90deg, var(--surface-hover) 25%, var(--surface-active) 50%, var(--surface-hover) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
}
```

### Pulse (Skeleton Placeholders)

```css
@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.skeleton-pulse {
  background-color: var(--surface-hover);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  border-radius: 4px;
}
```

## 4. Hover Micro-Interactions

Keep micro-interactions subtle and performant by only animating `transform` and `opacity`.

```css
.file-card {
  transition: transform 200ms ease-out, box-shadow 200ms ease-out;
  will-change: transform;
}

.file-card:hover {
  transform: scale(1.02) translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
```

## 5. Skeleton Loading Pattern (Angular 22 Signals)

Use signal-driven control flow (`@if`) combined with CSS pulse placeholders.

```typescript
import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-file-grid',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid-container">
      @if (isLoading()) {
        <!-- Skeleton placeholders -->
        @for (i of [1, 2, 3, 4, 5, 6]; track i) {
          <div class="file-card skeleton-pulse" style="height: 120px;"></div>
        }
      } @else {
        <!-- Actual data -->
        @for (file of files(); track file.id) {
          <div class="file-card">
            <h3>{{ file.name }}</h3>
          </div>
        }
      }
    </div>
  `,
  styleUrl: './file-grid.component.scss'
})
export class FileGridComponent implements OnInit {
  isLoading = signal(true);
  files = signal<{id: string, name: string}[]>([]);

  ngOnInit() {
    // Simulate data loading
    setTimeout(() => {
      this.files.set([{ id: '1', name: 'Document.pdf' }]);
      this.isLoading.set(false);
    }, 2000);
  }
}
```

## 6. Performance & Accessibility Rules

- **CSS properties:** Only animate `transform` and `opacity`. Animating layout properties (`width`, `height`, `top`, `margin`) triggers expensive browser repaints and layout recalculations.
- **Hardware Acceleration:** Use `will-change: transform` or `will-change: opacity` on elements that animate frequently, but use it sparingly as it consumes browser memory.
- **Frame Rate:** Target 60fps (16.67ms per frame). Keep transitions under 300ms for UI snappiness.
- **CSS vs Angular:** Prefer CSS transitions for hover states and simple loops. Use Angular Animations for enter/leave DOM events (like route changes or conditional list items).
- **Accessibility:** Respect the user's OS-level motion preferences.

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
