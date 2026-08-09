import { Pipe, PipeTransform } from '@angular/core';

/**
 * Pipe to map a file's mime type to a Material Icon name.
 */
@Pipe({
  name: 'fileIcon'
})
export class FileIconPipe implements PipeTransform {
  /**
   * Transforms a mime type string into a corresponding Material Icon name.
   * @param mimeType The mime type of the file.
   * @returns The name of the Material Icon.
   */
  transform(mimeType?: string | null): string {
    if (!mimeType) {
      return 'insert_drive_file';
    }

    const type = mimeType.toLowerCase();

    if (type.startsWith('image/')) return 'image';
    if (type === 'application/pdf') return 'picture_as_pdf';
    if (type.startsWith('text/')) return 'description';
    if (type.startsWith('video/')) return 'movie';
    if (type.startsWith('audio/')) return 'audiotrack';

    if (['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'].some(t => type.includes(t))) {
      return 'folder_zip';
    }

    if (type.includes('spreadsheet') || type === 'application/vnd.ms-excel' || type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      return 'table_chart';
    }

    if (type.includes('presentation') || type === 'application/vnd.ms-powerpoint' || type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      return 'slideshow';
    }

    if (type.includes('document') || type === 'application/msword' || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return 'article';
    }

    return 'insert_drive_file';
  }
}
