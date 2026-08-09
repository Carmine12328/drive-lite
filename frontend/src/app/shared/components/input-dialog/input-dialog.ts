import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/**
 * Data passed to the input dialog.
 */
export interface InputDialogData {
  /** Title of the dialog */
  title: string;
  /** Label for the input field */
  label: string;
  /** Initial value for the input field */
  value?: string;
  /** Placeholder text for the input field */
  placeholder?: string;
  /** Text for the confirm button */
  confirmText?: string;
  /** Validators to apply to the input field */
  validators?: ValidatorFn[];
}

/**
 * A reusable dialog for prompting user input.
 */
@Component({
  selector: 'app-input-dialog',
  templateUrl: './input-dialog.html',
  styleUrl: './input-dialog.css',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule
  ]
})
export class InputDialog {
  /** Dialog reference for closing the dialog */
  dialogRef = inject<MatDialogRef<InputDialog>>(MatDialogRef);
  /** Data provided to the dialog */
  data = inject<InputDialogData>(MAT_DIALOG_DATA);

  /** Form control for the user input */
  inputControl = new FormControl(this.data.value || '', this.data.validators || [Validators.required]);

  /**
   * Closes the dialog with the input value if valid.
   */
  onConfirm(): void {
    if (this.inputControl.valid) {
      this.dialogRef.close(this.inputControl.value);
    }
  }
}
