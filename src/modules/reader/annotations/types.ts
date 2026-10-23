import { Book } from '@/modules/library/types';

export type HighlightColor = 'yellow' | 'green' | 'pink' | 'blue';

export interface Annotation {
  id: string;
  tenantId: string;
  bookId: string;
  userId: string;
  userName?: string;
  location: string; // 'page:<num>' or EPUB CFI
  highlightedText: string;
  note?: string | null;
  color: HighlightColor;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
  book?: Book;
}

export interface CreateAnnotationInput {
  tenantId: string;
  bookId: string;
  location: string;
  highlightedText: string;
  note?: string | null;
  color?: HighlightColor;
  isShared?: boolean;
}

export interface GroupedBookAnnotations {
  book: Book;
  annotations: Annotation[];
  totalCount: number;
  lastAnnotatedAt: string;
}

export const HIGHLIGHT_COLOR_CONFIGS: Record<
  HighlightColor,
  {
    name: string;
    bgStyle: string;
    badgeClass: string;
    borderClass: string;
    activeRingClass: string;
    hex: string;
  }
> = {
  yellow: {
    name: 'Yellow',
    bgStyle: 'rgba(253, 224, 71, 0.35)',
    badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300',
    borderClass: 'border-yellow-400 dark:border-yellow-500',
    activeRingClass: 'ring-yellow-400',
    hex: '#fde047',
  },
  green: {
    name: 'Green',
    bgStyle: 'rgba(134, 239, 172, 0.35)',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    borderClass: 'border-emerald-400 dark:border-emerald-500',
    activeRingClass: 'ring-emerald-400',
    hex: '#86efac',
  },
  pink: {
    name: 'Pink',
    bgStyle: 'rgba(244, 114, 182, 0.35)',
    badgeClass: 'bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300',
    borderClass: 'border-pink-400 dark:border-pink-500',
    activeRingClass: 'ring-pink-400',
    hex: '#f472b6',
  },
  blue: {
    name: 'Blue',
    bgStyle: 'rgba(125, 211, 252, 0.35)',
    badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
    borderClass: 'border-sky-400 dark:border-sky-500',
    activeRingClass: 'ring-sky-400',
    hex: '#7dd3fc',
  },
};
