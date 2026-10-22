export interface Book {
  id: string;
  tenantId: string;
  title: string;
  author?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  storagePath?: string | null;
  fileSize?: number | null;
  format: 'epub' | 'pdf' | string;
  processingStatus: 'pending' | 'processing' | 'ready' | 'error' | string;
  createdAt: string;
  updatedAt: string;
}

export interface BookUploadInput {
  title: string;
  author?: string;
  description?: string;
  file: File | Blob;
}
