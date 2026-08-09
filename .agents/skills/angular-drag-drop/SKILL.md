---
name: angular-drag-drop
description: HTML5 Drag and Drop API patterns for Angular 22 components. Covers file dropzones, visual feedback, multi-file handling, and integration with the upload service.
---

# Angular HTML5 Drag and Drop (Angular 22)

This skill describes how to build a file dropzone using the native HTML5 Drag and Drop API in Angular 22. It uses signals for state management and integrates seamlessly with a backend upload service.

## Core Concepts

- **Events**: Intercept `dragover`, `dragleave`, `dragenter`, and `drop`.
- **Default Behavior**: Always call `preventDefault()` and `stopPropagation()` on these events to prevent the browser from opening the file directly.
- **Drag Counter**: Nested elements fire `dragenter` and `dragleave` repeatedly. Use a counter to know when the user has actually left the primary dropzone container.
- **Signals**: Use a signal to toggle the CSS class for visual feedback (e.g., active highlight).
- **Accessibility**: Always provide a hidden `<input type="file">` triggered by a button for keyboard users.

## Dropzone Implementation

```typescript
import { Component, inject, signal } from '@angular/core';
import { UploadService } from '../../core/services/upload.service';

@Component({
  selector: 'app-file-dropzone',
  template: `
    <div
      class="dropzone-container"
      [class.drag-active]="isDragActive()"
      (dragenter)="onDragEnter($event)"
      (dragleave)="onDragLeave($event)"
      (dragover)="onDragOver($event)"
      (drop)="onDrop($event)"
    >
      <div class="dropzone-content">
        <p>Drag and drop files here</p>
        <p>or</p>
        
        <!-- Accessible alternative -->
        <button type="button" (click)="fileInput.click()">Select Files</button>
        <input 
          type="file" 
          #fileInput 
          hidden 
          multiple 
          (change)="onFileSelect($event)" 
        />
      </div>
    </div>
  `,
  styles: [`
    .dropzone-container {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 40px;
      text-align: center;
      transition: all 0.2s ease;
      background: var(--surface-color, #fff);
    }
    
    .dropzone-container.drag-active {
      border-color: var(--primary-color, #005cbb);
      background: var(--primary-color-alpha, rgba(0, 92, 187, 0.05));
    }
  `]
})
export class FileDropzoneComponent {
  private uploadService = inject(UploadService);
  
  // State
  isDragActive = signal(false);
  private dragCounter = 0;

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDragEnter(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    this.dragCounter++;
    if (this.dragCounter === 1) {
      this.isDragActive.set(true);
    }
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    this.dragCounter--;
    if (this.dragCounter === 0) {
      this.isDragActive.set(false);
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    this.dragCounter = 0;
    this.isDragActive.set(false);

    if (event.dataTransfer?.files) {
      this.handleFiles(event.dataTransfer.files);
    }
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.handleFiles(input.files);
      // Reset input so same files can be selected again if needed
      input.value = '';
    }
  }

  private handleFiles(fileList: FileList) {
    const files: File[] = Array.from(fileList);
    
    // Optional: Filter by specific MIME types here if needed
    // const validFiles = files.filter(f => f.type.startsWith('image/'));
    
    if (files.length > 0) {
      this.uploadService.addFiles(files);
    }
  }
}
```

## Key Considerations

1. **Multi-file Handling**: `FileList` is an array-like object. Convert it to a real array using `Array.from()` before passing it around or filtering.
2. **File Filtering**: You can check the `type` property of a `File` (e.g., `file.type === 'application/pdf'`) to enforce restrictions client-side.
3. **Integration**: Pass the extracted `File[]` to your centralized `UploadService` which handles the actual networking, progress tracking, and queue management.
