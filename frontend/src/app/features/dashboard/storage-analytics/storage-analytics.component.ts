import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FileService } from '../../../core/services/file.service';
import { FileItem } from '../../../core/models/file-item.model';

export interface StorageCategory {
  key: string;
  label: string;
  icon: string;
  color: string;
  size: number;
  count: number;
  percent: number;
  dashArray: string;
  dashOffset: number;
}

/**
 * StorageAnalyticsComponent displays a visual breakdown of storage usage
 * by MIME categories with an SVG donut chart and quota indicator.
 */
@Component({
  selector: 'app-storage-analytics',
  templateUrl: './storage-analytics.component.html',
  styleUrl: './storage-analytics.component.scss',
  imports: [CommonModule, MatIconModule, MatTooltipModule],
})
export class StorageAnalyticsComponent {
  private readonly fileService = inject(FileService);

  /** Free Tier storage quota (5 GB) */
  readonly QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

  /** Total size in bytes of all known files */
  readonly totalBytes = computed(() => this.fileService.getTotalSize());

  /** Formatted total size */
  readonly formattedTotalSize = computed(() => this.formatBytes(this.totalBytes()));

  /** Percentage of 5 GB free tier quota used */
  readonly quotaPercent = computed(() => {
    const used = this.totalBytes();
    return Math.min(100, (used / this.QUOTA_BYTES) * 100);
  });

  /**
   * Computed breakdown of storage across 6 MIME categories.
   */
  readonly categories = computed<StorageCategory[]>(() => {
    const files = this.fileService.files().concat(this.fileService.recentFiles());
    // Deduplicate by fileId
    const uniqueFiles = Array.from(new Map(files.map(f => [f.fileId, f])).values());

    const buckets: Record<string, { label: string; icon: string; color: string; size: number; count: number }> = {
      images: { label: 'Images', icon: 'image', color: '#3b82f6', size: 0, count: 0 },
      documents: { label: 'Documents', icon: 'description', color: '#10b981', size: 0, count: 0 },
      media: { label: 'Video & Audio', icon: 'movie', color: '#8b5cf6', size: 0, count: 0 },
      code: { label: 'Code & Text', icon: 'code', color: '#f59e0b', size: 0, count: 0 },
      archives: { label: 'Archives', icon: 'archive', color: '#ec4899', size: 0, count: 0 },
      other: { label: 'Other', icon: 'insert_drive_file', color: '#64748b', size: 0, count: 0 },
    };

    for (const f of uniqueFiles) {
      const cat = this.classifyMime(f);
      buckets[cat].size += f.fileSize || 0;
      buckets[cat].count += 1;
    }

    const total = Object.values(buckets).reduce((sum, b) => sum + b.size, 0);
    const radius = 40;
    const circumference = 2 * Math.PI * radius; // ~251.327

    let accumulatedPercent = 0;
    const result: StorageCategory[] = [];

    for (const [key, b] of Object.entries(buckets)) {
      const pct = total > 0 ? (b.size / total) * 100 : 0;
      const strokeLength = (pct / 100) * circumference;
      const dashArray = `${strokeLength.toFixed(2)} ${(circumference - strokeLength).toFixed(2)}`;
      const dashOffset = -((accumulatedPercent / 100) * circumference);

      accumulatedPercent += pct;

      result.push({
        key,
        label: b.label,
        icon: b.icon,
        color: b.color,
        size: b.size,
        count: b.count,
        percent: Math.round(pct),
        dashArray,
        dashOffset,
      });
    }

    return result;
  });

  /**
   * Classifies a file into a category.
   */
  private classifyMime(file: FileItem): string {
    const mime = (file.mimeType || '').toLowerCase();
    const name = file.fileName.toLowerCase();

    if (mime.startsWith('image/')) return 'images';
    if (mime === 'application/pdf' || name.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i)) return 'documents';
    if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'media';
    if (
      mime.startsWith('text/') ||
      mime === 'application/json' ||
      name.match(/\.(txt|md|json|js|ts|tsx|jsx|html|css|scss|py|yaml|xml|sh|env)$/i)
    ) {
      return 'code';
    }
    if (name.match(/\.(zip|tar|gz|rar|7z|bz2)$/i)) return 'archives';
    return 'other';
  }

  /**
   * Formats raw bytes to human-readable size.
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}
