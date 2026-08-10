import { Attachment } from '@/types';

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB (Tech Spec §15)

export const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'png', 'jpg', 'jpeg', 'webp', 'zip'
];

export class FileService {
  static validateFile(file: { name: string; size: number }): { valid: boolean; error?: string } {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Размер файла превышает лимит 50 МБ (текущий размер: ${(file.size / (1024 * 1024)).toFixed(1)} МБ).`,
      };
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Недопустимый формат файла .${ext}. Разрешены: ${ALLOWED_EXTENSIONS.join(', ')}.`,
      };
    }

    return { valid: true };
  }

  static async uploadFile(file: File): Promise<Partial<Attachment>> {
    const validation = this.validateFile({ name: file.name, size: file.size });
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Return uploaded attachment representation
    return {
      file_name: file.name,
      file_path: URL.createObjectURL(file),
      mime_type: file.type || 'application/octet-stream',
      size: file.size,
      created_at: new Date().toISOString(),
    };
  }

  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
