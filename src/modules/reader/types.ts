export interface ReadingProgress {
  id: string;
  tenantId: string;
  bookId: string;
  userId: string;
  cfi?: string | null;
  percentage: number;
  updatedAt: string;
}

export interface Bookmark {
  id: string;
  tenantId: string;
  bookId: string;
  userId: string;
  cfi: string;
  label?: string | null;
  createdAt: string;
}

export interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: 'light' | 'dark' | 'sepia';
}
