import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

/**
 * Data passed to the confirm dialog.
 */
export interface ConfirmDialogData {
  /** Title of the dialog */
  title: string;
  /** Message body of the dialog */
  message: string;
  /** Text for the confirm button */
  confirmText?: string;
  /** Text for the cancel button */
  cancelText?: string;
  /** Color theme for the confirm button */
  confirmColor?: 'primary' | 'accent' | 'warn';
}

/**
 * A reusable dialog for confirming user actions.
 */
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
  imports: [MatDialogModule, MatButtonModule]
})
export class ConfirmDialog {
  /** Dialog reference for closing the dialog */
  dialogRef = inject<MatDialogRef<ConfirmDialog>>(MatDialogRef);
  /** Data provided to the dialog */
  data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
