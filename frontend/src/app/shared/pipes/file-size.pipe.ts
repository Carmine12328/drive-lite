import { Pipe, PipeTransform } from '@angular/core';

/**
 * Pipe to transform a file size in bytes to a human-readable string.
 */
@Pipe({
  name: 'fileSize'
})
export class FileSizePipe implements PipeTransform {
  /**
   * Transforms a number in bytes to a formatted string (B, KB, MB, GB).
   * @param bytes The size in bytes.
   * @returns Formatted human-readable size.
   */
  transform(bytes?: number | null): string {
    if (bytes === null || bytes === undefined || isNaN(bytes) || bytes === 0) {
      return '0 B';
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1048576) {
      return this.format(bytes / 1024, 'KB');
    }

    if (bytes < 1073741824) {
      return this.format(bytes / 1048576, 'MB');
    }

    return this.format(bytes / 1073741824, 'GB');
  }

  private format(value: number, unit: string): string {
    let formatted = value.toFixed(1);
    if (formatted.endsWith('.0')) {
      formatted = formatted.substring(0, formatted.length - 2);
    }
    return `${formatted} ${unit}`;
  }
}
