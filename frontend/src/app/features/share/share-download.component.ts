import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { ShareService } from '../../core/services/share.service';
import { ShareMetaResponse } from '../../core/models/share-link.model';
import { FileSizePipe } from '../../shared/pipes/file-size.pipe';
import { FileIconPipe } from '../../shared/pipes/file-icon.pipe';
import { ToastService } from '../../shared/components/toast/toast.service';

/**
 * Public landing and download page for shared files (/share/:token).
 * Allows anyone with the link (and optional password) to inspect metadata and download the file.
 */
@Component({
  selector: 'app-share-download',
  templateUrl: './share-download.component.html',
  styleUrl: './share-download.component.scss',
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatCardModule,
    FileSizePipe,
    FileIconPipe,
  ],
})
export class ShareDownloadComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly shareService = inject(ShareService);
  private readonly toast = inject(ToastService);

  readonly token = signal<string>('');
  readonly shareMeta = signal<ShareMetaResponse | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly isDownloading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly passwordError = signal<string | null>(null);

  readonly passwordCtrl = new FormControl('', [Validators.required]);

  ngOnInit(): void {
    const tokenParam = this.route.snapshot.paramMap.get('token');
    if (!tokenParam) {
      this.errorMessage.set('Invalid share link: no token provided.');
      this.isLoading.set(false);
      return;
    }

    this.token.set(tokenParam);
    this.loadShareMeta(tokenParam);
  }

  async loadShareMeta(token: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const meta = await this.shareService.getShareMeta(token);
      this.shareMeta.set(meta);
    } catch {
      this.errorMessage.set('This share link is no longer available, has expired, or has reached its download limit.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onDownload(): Promise<void> {
    const meta = this.shareMeta();
    if (!meta || this.isDownloading()) return;

    if (meta.passwordProtected && !this.passwordCtrl.value) {
      this.passwordError.set('Password is required to download this file.');
      return;
    }

    this.isDownloading.set(true);
    this.passwordError.set(null);

    try {
      const password = meta.passwordProtected ? this.passwordCtrl.value || undefined : undefined;
      const res = await this.shareService.downloadShare(this.token(), password);

      // Trigger browser download via invisible link
      const anchor = document.createElement('a');
      anchor.href = res.downloadUrl;
      anchor.download = res.fileName;
      anchor.target = '_blank';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      this.toast.success(`Download started: ${res.fileName}`);

      // Increment local count if maxDownloads is present
      if (meta.maxDownloads !== undefined) {
        this.shareMeta.update((m) => m ? { ...m, downloadCount: m.downloadCount + 1 } : null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      if (msg.toLowerCase().includes('password')) {
        this.passwordError.set(msg);
      } else {
        this.errorMessage.set(msg);
      }
    } finally {
      this.isDownloading.set(false);
    }
  }

  goToLanding(): void {
    this.router.navigate(['/auth/landing']);
  }
}
