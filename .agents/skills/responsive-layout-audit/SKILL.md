---
name: responsive-layout-audit
description: Responsive design audit checklist and patterns for Drive Lite. Covers breakpoint-based layout adaptation, touch targets, sidebar behavior, and multi-device testing.
---

# Responsive Layout & Accessibility Audit Guide for Drive Lite

This skill outlines the standards for implementing and auditing responsive layouts across mobile, tablet, and desktop viewports for the Drive Lite application.

## 1. Drive Lite Breakpoint System

We use SCSS custom properties to define a consistent breakpoint system across the application.

- `--breakpoint-sm`: < 768px (Mobile)
- `--breakpoint-md`: 768px - 1024px (Tablet)
- `--breakpoint-lg`: > 1024px (Desktop)

### CSS Media Query Patterns

```scss
// Typical usage in SCSS files
@media (max-width: 767px) {
  // Mobile specific rules
  .sidebar { display: none; }
}

@media (min-width: 768px) and (max-width: 1024px) {
  // Tablet specific rules
  .file-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (min-width: 1025px) {
  // Desktop specific rules
  .sidebar { position: fixed; width: 250px; }
}
```

## 2. Layout Behavior Per Breakpoint

- **Mobile (< 768px):** 
  - Sidebar is hidden.
  - Hamburger menu trigger in header.
  - Single-column file list/grid.
  - Context menus should use bottom sheets (Angular Material Bottom Sheet) instead of floating popovers.
- **Tablet (768px - 1024px):**
  - Collapsible drawer sidebar (Angular Material Sidenav in `over` or `push` mode).
  - 2-column file grid.
- **Desktop (> 1024px):**
  - Fixed, persistent sidebar (Angular Material Sidenav in `side` mode).
  - Multi-column file grid using responsive CSS Grid.

### Flexbox/Grid Responsive Patterns

```scss
// Responsive file grid pattern
.file-grid {
  display: grid;
  gap: 16px;
  // Auto-fit grid items with a minimum width
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

// Ensure cards don't break flex/grid containers
.file-card {
  min-width: 0; // Prevents flex children from overflowing
  word-wrap: break-word;
}
```

## 3. Touch Target Compliance (Accessibility)

All interactive elements (buttons, links, file rows) MUST meet the WCAG AA minimum size of **44x44px** for touch targets on mobile devices.

```scss
.icon-button {
  // Ensure the touch area is at least 44x44, even if the visible icon is smaller
  min-width: 44px;
  min-height: 44px;
  padding: 10px; // Increase clickable area
  display: flex;
  align-items: center;
  justify-content: center;
}
```

## 4. Angular Material Breakpoint Observer Pattern

In Angular 22, you can use the `BreakpointObserver` with signals via the `rxjs-interop` package to react to viewport changes programmatically.

```typescript
import { Component, inject, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatSidenavModule } from '@angular/material/sidenav';
import { map } from 'rxjs';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [MatSidenavModule],
  template: `
    <mat-sidenav-container class="app-container">
      <mat-sidenav
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="!isMobile()">
        <!-- Sidebar Content -->
      </mat-sidenav>
      
      <mat-sidenav-content>
        <!-- Main Content -->
      </mat-sidenav-content>
    </mat-sidenav-container>
  `
})
export class LayoutComponent {
  private breakpointObserver = inject(BreakpointObserver);
  
  // Use toSignal to convert the observable to a signal
  isMobile = toSignal(
    this.breakpointObserver.observe([Breakpoints.XSmall, Breakpoints.Small]).pipe(
      map(result => result.matches)
    ),
    { initialValue: false }
  );
}
```

## 5. Testing Methodology & Common Pitfalls

### Testing Workflow
1. Open Chrome DevTools (F12).
2. Toggle Device Toolbar (Ctrl+Shift+M).
3. Check key viewports: 375px (iPhone SE), 768px (iPad Mini), and 1440px (Desktop).
4. Verify key pages: Dashboard, File Browser, and Auth flows.

### What to Audit For:
- **No horizontal scroll:** Ensure no elements break the viewport width (`max-width: 100vw; overflow-x: hidden` on root).
- **Text truncation:** Ensure long file names truncate with ellipsis (`text-overflow: ellipsis; white-space: nowrap; overflow: hidden`) instead of breaking layouts.
- **Touch Targets:** Are buttons easily tappable on a 375px screen?
- **Fixed Widths:** Look for hardcoded pixel widths (`width: 500px`) and replace them with responsive units (`width: 100%; max-width: 500px;`).
- **Absolute Positioning:** Avoid absolute positioning that doesn't adapt to smaller screens.
