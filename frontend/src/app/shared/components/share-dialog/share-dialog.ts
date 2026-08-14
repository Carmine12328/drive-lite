import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FileItem } from '../../../core/models/file-item.model';
import { ShareService } from '../../../core/services/share.service';
import { ShareLinkItem, ShareLinkResponse } from '../../../core/models/share-link.model';
import { ToastService } from '../toast/toast.service';

/**
 * Data passed into the share dialog.
 */
export interface ShareDialogData {
  file: FileItem;
}

/**
 * Dialog for generating, managing, and revoking secure expiring share links.
 */
@Component({
  selector: 'app-share-dialog',
  templateUrl: './share-dialog.html',
  styleUrl: './share-dialog.scss',
  imports: [
    CommonModule,
    DatePipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
})
export class ShareDialog implements OnInit {
  readonly data = inject<ShareDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<ShareDialog>);
  private readonly fb = inject(FormBuilder);
  private readonly shareService = inject(ShareService);
  private readonly toast = inject(ToastService);

  readonly file = this.data.file;

  /** Existing active share links */
  readonly activeShares = signal<ShareLinkItem[]>([]);
  readonly isLoadingShares = signal<boolean>(false);
  readonly isCreating = signal<boolean>(false);
  readonly generatedShare = signal<ShareLinkResponse | null>(null);
  readonly copied = signal<boolean>(false);

  /** Expiration options in hours */
  readonly expirationOptions = [
    { label: '1 Hour', hours: 1 },
    { label: '24 Hours (1 Day)', hours: 24 },
    { label: '7 Days', hours: 168 },
    { label: '30 Days', hours: 720 },
  ];

  readonly form = this.fb.group({
    expiresInHours: [24, [Validators.required]],
    enablePassword: [false],
    password: [''],
    enableMaxDownloads: [false],
    maxDownloads: [5, [Validators.min(1), Validators.max(1000)]],
  });

  ngOnInit(): void {
    this.loadExistingShares();

    // Form value changes to conditionally update validators
    this.form.get('enablePassword')?.valueChanges.subscribe((enabled) => {
      const passwordCtrl = this.form.get('password');
      if (enabled) {
        passwordCtrl?.setValidators([Validators.required, Validators.minLength(4), Validators.maxLength(128)]);
      } else {
        passwordCtrl?.clearValidators();
        passwordCtrl?.setValue('');
      }
      passwordCtrl?.updateValueAndValidity();
    });

    this.form.get('enableMaxDownloads')?.valueChanges.subscribe((enabled) => {
      const maxCtrl = this.form.get('maxDownloads');
      if (enabled) {
        maxCtrl?.setValidators([Validators.required, Validators.min(1), Validators.max(1000)]);
      } else {
        maxCtrl?.clearValidators();
      }
      maxCtrl?.updateValueAndValidity();
    });
  }

  async loadExistingShares(): Promise<void> {
    this.isLoadingShares.set(true);
    try {
      const shares = await this.shareService.listShares(this.file.fileId);
      this.activeShares.set(shares);
    } catch {
      // toast already shown in service
    } finally {
      this.isLoadingShares.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.isCreating()) return;

    this.isCreating.set(true);
    try {
      const raw = this.form.getRawValue();
      const res = await this.shareService.createShare(this.file.fileId, {
        expiresInHours: raw.expiresInHours ?? 24,
        ...(raw.enablePassword && raw.password ? { password: raw.password } : {}),
        ...(raw.enableMaxDownloads && raw.maxDownloads ? { maxDownloads: raw.maxDownloads } : {}),
      });

      this.generatedShare.set(res);
      await this.loadExistingShares();
    } finally {
      this.isCreating.set(false);
    }
  }

  async copyToClipboard(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      this.toast.info('Share URL copied to clipboard');
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      this.toast.error('Failed to copy to clipboard');
    }
  }

  async revokeShare(token: string): Promise<void> {
    try {
      await this.shareService.revokeShare(token);
      this.activeShares.update((list) => list.filter((s) => s.shareToken !== token));
      if (this.generatedShare()?.shareToken === token) {
        this.generatedShare.set(null);
      }
    } catch {
      // toast shown in service
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
