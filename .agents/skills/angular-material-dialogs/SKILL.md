---
name: angular-material-dialogs
description: Patterns for creating, configuring, and managing Angular Material dialogs in Angular 22. Covers form dialogs, confirmation dialogs, near-fullscreen preview dialogs, data injection, and result handling.
---

# Angular Material Dialogs (Angular 22)

This skill covers best practices for implementing and managing Angular Material dialogs using Angular 22 paradigms: standalone components (default), the `inject()` function, and signals.

## Core Concepts

- **Injecting `MatDialog`**: Use `inject(MatDialog)` instead of constructor injection.
- **Injecting Data**: Use `inject(MAT_DIALOG_DATA)` inside the dialog component to access passed data.
- **Handling Results**: Dialogs return results via `MatDialogRef.close(data)`. The caller listens via `.afterClosed()`.
- **Keyboard & Accessibility**: Ensure `aria-label` is set, and support Escape (close) and Enter (submit).

## 1. Opening a Dialog and Handling Results

To open a dialog, inject `MatDialog` and call `open()`.

```typescript
import { Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { EditFileDialogComponent } from './edit-file-dialog.component';

@Component({
  selector: 'app-file-actions',
  imports: [MatButtonModule],
  template: `
    <button mat-button (click)="openEditDialog()">Edit File</button>
  `
})
export class FileActionsComponent {
  private dialog = inject(MatDialog);

  openEditDialog() {
    const dialogRef = this.dialog.open(EditFileDialogComponent, {
      width: '400px',
      data: { fileId: '123', fileName: 'document.pdf' },
      ariaLabel: 'Edit file details dialog'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log('Dialog closed with result:', result);
      }
    });
  }
}
```

## 2. Form-Inside-Dialog Pattern

When placing a reactive form inside a dialog, disable the submit button until the form is valid.

```typescript
import { Component, inject } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  selector: 'app-edit-file-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule
  ],
  template: `
    <h2 mat-dialog-title>Edit File</h2>
    <mat-dialog-content>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <mat-form-field appearance="fill" class="w-full mt-2">
          <mat-label>File Name</mat-label>
          <input matInput formControlName="fileName" cdkFocusInitial />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid" (click)="submit()">Save</button>
    </mat-dialog-actions>
  `
})
export class EditFileDialogComponent {
  private data = inject<{ fileId: string; fileName: string }>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<EditFileDialogComponent>);
  private fb = inject(FormBuilder);

  form = this.fb.group({
    fileName: [this.data.fileName, [Validators.required, Validators.maxLength(100)]]
  });

  submit() {
    if (this.form.valid) {
      // Pass the updated data back to the caller
      this.dialogRef.close(this.form.value);
    }
  }

  cancel() {
    this.dialogRef.close();
  }
}
```

## 3. Reusable Confirmation Dialog

A generic confirmation dialog should accept a title, message, and action text.

```typescript
// confirm-dialog.component.ts
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  color?: 'primary' | 'accent' | 'warn';
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">{{ data.cancelText || 'Cancel' }}</button>
      <button mat-flat-button [color]="data.color || 'primary'" (click)="confirm()">
        {{ data.confirmText || 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `
})
export class ConfirmDialogComponent {
  data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);

  confirm() {
    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close(false);
  }
}
```

## 4. Near-Fullscreen Preview Dialog

For viewing files (e.g., images or PDFs), use a near-fullscreen dialog. It should adapt to fullscreen on mobile devices.

```typescript
// In the caller component:
openPreviewDialog() {
  this.dialog.open(FilePreviewDialogComponent, {
    width: '90vw',
    maxWidth: '90vw',
    height: '90vh',
    panelClass: 'preview-dialog-panel', // Add responsive overrides in global styles
    data: { url: 'https://example.com/preview.png' },
    ariaLabel: 'File preview'
  });
}
```

Global styles (`styles.scss`):
```scss
// Make fullscreen on mobile
@media (max-width: 599px) {
  .preview-dialog-panel .mat-mdc-dialog-container {
    width: 100vw !important;
    max-width: 100vw !important;
    height: 100vh !important;
    max-height: 100vh !important;
    border-radius: 0;
  }
}
```
