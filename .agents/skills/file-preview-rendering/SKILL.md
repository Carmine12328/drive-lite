---
name: file-preview-rendering
description: File content preview patterns for Drive Lite. Covers MIME-type detection, conditional rendering (images, PDFs, text), keyboard gallery navigation, and presigned URL integration.
---

# File Preview Rendering Patterns

This skill outlines the patterns for building the file preview dialog in the Drive Lite project, leveraging Angular 22 features like Signals, `inject()`, and standalone components.

## MIME Type Detection and Categorization

When previewing a file, we must determine its type to choose the correct rendering strategy.

```typescript
export type PreviewType = 'image' | 'pdf' | 'text' | 'unsupported';

export function getPreviewType(mimeType: string): PreviewType {
  if (mimeType.startsWith('image/') || mimeType === 'image/svg+xml') {
    return 'image';
  }
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  const textTypes = ['text/plain', 'text/csv', 'text/markdown', 'application/json'];
  if (textTypes.includes(mimeType) || mimeType.startsWith('text/')) {
    return 'text';
  }
  return 'unsupported';
}
```

## Rendering Strategy

Depending on the `PreviewType`, we render different templates:

### Images
Use standard `<img>` tags pointing to the presigned URL.

```html
<!-- Angular 22 control flow -->
@if (previewType() === 'image') {
  <img [src]="presignedUrl()" [alt]="file().name" class="preview-image" (error)="onImageError()">
}
```

### PDFs
Use an `<iframe>` with a sanitized URL. You must use `DomSanitizer` to prevent security errors.

```typescript
import { inject, computed } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

const sanitizer = inject(DomSanitizer);
// In your component
const safePdfUrl = computed(() => {
  const url = this.presignedUrl();
  return url ? sanitizer.bypassSecurityTrustResourceUrl(url) : null;
});
```
```html
@if (previewType() === 'pdf' && safePdfUrl()) {
  <iframe [src]="safePdfUrl()" type="application/pdf" class="preview-pdf" (error)="onPdfError()"></iframe>
}
```

### Text
Fetch the raw content using `HttpClient` and the presigned URL, then display it.

```typescript
import { HttpClient } from '@angular/common/http';
import { inject, signal, effect, untracked } from '@angular/core';

const http = inject(HttpClient);
const textContent = signal<string | null>(null);

effect(() => {
  const url = this.presignedUrl();
  const type = this.previewType();
  if (type === 'text' && url) {
    untracked(() => {
      http.get(url, { responseType: 'text' }).subscribe({
        next: (content) => textContent.set(content),
        error: () => this.onTextError()
      });
    });
  }
});
```
```html
@if (previewType() === 'text') {
  <pre class="preview-text"><code>{{ textContent() }}</code></pre>
}
```

### Unsupported Files
Show a fallback view with an icon, metadata, and a prominent download button.

```html
@if (previewType() === 'unsupported') {
  <div class="unsupported-preview">
    <mat-icon>insert_drive_file</mat-icon>
    <h3>{{ file().name }}</h3>
    <p>Preview not available for this file type.</p>
    <a mat-flat-button [href]="presignedUrl()" [download]="file().name">Download File</a>
  </div>
}
```

## Dialog Configuration

Configure the MatDialog to be responsive.

```typescript
import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

const dialog = inject(MatDialog);

dialog.open(FilePreviewDialogComponent, {
  data: { fileId: this.file().id },
  maxWidth: '100vw',
  maxHeight: '100vh',
  height: '90vh', // Default desktop
  width: '90vw',
  panelClass: 'file-preview-dialog-panel'
});
// Use CSS media queries in global styles to force 100vw/100vh on mobile.
```

## Keyboard Gallery Navigation

Support `ArrowLeft`, `ArrowRight`, and `Escape` for navigation. Do NOT use `@HostListener`. Use the `host` property in the `@Component` decorator.

```typescript
import { Component, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-file-preview-dialog',
  templateUrl: './file-preview-dialog.component.html',
  styleUrl: './file-preview-dialog.component.scss',
  host: {
    '(document:keydown)': 'onKeydown($event)'
  }
})
export class FilePreviewDialogComponent {
  private dialogRef = inject(MatDialogRef);

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      this.navigateNext();
    } else if (event.key === 'ArrowLeft') {
      this.navigatePrev();
    } else if (event.key === 'Escape') {
      this.dialogRef.close();
    }
  }

  navigateNext() {
    // Logic to update active file index (wrap to 0 if at end)
  }

  navigatePrev() {
    // Logic to update active file index (wrap to length - 1 if at start)
  }
}
```

## Metadata Sidebar & Loading States

Provide a sidebar or overlay showing `file().name`, `file().size | fileSize`, `file().mimeType`, and timestamps.
Use a skeleton or spinner while `presignedUrl` is `null`.

```html
@if (!presignedUrl()) {
  <div class="loading-state">
    <mat-spinner diameter="48"></mat-spinner>
    <p>Loading preview...</p>
  </div>
} @else {
  <!-- Preview content -->
}
```
