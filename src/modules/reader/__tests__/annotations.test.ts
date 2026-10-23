import { describe, it, expect } from 'vitest';
import { Book } from '@/modules/library/types';
import { Annotation } from '../annotations/types';
import {
  parseLocationDisplay,
  groupAnnotationsByBook,
  filterAnnotations,
  formatAnnotationsToMarkdown,
} from '../annotations/utils';

const bookA: Book = {
  id: 'book-a',
  tenantId: 'tenant-1',
  title: 'The Hobbit',
  author: 'J.R.R. Tolkien',
  description: 'In a hole in the ground there lived a hobbit.',
  format: 'epub',
  fileSize: 1024 * 700,
  processingStatus: 'ready',
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T10:00:00Z',
};

const bookB: Book = {
  id: 'book-b',
  tenantId: 'tenant-1',
  title: 'Cosmos & Quantum Wonder',
  author: 'Carl Sagan',
  description: 'Exploration of the universe.',
  format: 'pdf',
  fileSize: 1024 * 1024 * 12,
  processingStatus: 'ready',
  createdAt: '2026-10-21T10:00:00Z',
  updatedAt: '2026-10-21T10:00:00Z',
};

const mockAnnotations: Annotation[] = [
  {
    id: 'ann-1',
    tenantId: 'tenant-1',
    bookId: 'book-a',
    userId: 'user-1',
    location: 'epubcfi(/6/4[chap01]!/4/2/10:0)',
    highlightedText: 'It does not do to leave a live dragon out of your calculations.',
    note: 'Great lesson about planning ahead.',
    color: 'yellow',
    isShared: false,
    createdAt: '2026-10-22T08:00:00Z',
    updatedAt: '2026-10-22T08:00:00Z',
    book: bookA,
  },
  {
    id: 'ann-2',
    tenantId: 'tenant-1',
    bookId: 'book-a',
    userId: 'user-2',
    location: 'epubcfi(/6/6[chap02]!/4/2/4:0)',
    highlightedText: 'Courage is found in unlikely places.',
    note: 'Reminds me of our family motto.',
    color: 'green',
    isShared: true,
    createdAt: '2026-10-22T11:30:00Z',
    updatedAt: '2026-10-22T11:30:00Z',
    book: bookA,
  },
  {
    id: 'ann-3',
    tenantId: 'tenant-1',
    bookId: 'book-b',
    userId: 'user-1',
    location: 'page:42',
    highlightedText: 'Somewhere, something incredible is waiting to be known.',
    note: null,
    color: 'pink',
    isShared: true,
    createdAt: '2026-10-23T09:00:00Z',
    updatedAt: '2026-10-23T09:00:00Z',
    book: bookB,
  },
  {
    id: 'ann-4',
    tenantId: 'tenant-1',
    bookId: 'book-b',
    userId: 'user-1',
    location: 'page:105',
    highlightedText: 'For small creatures such as we the vastness is bearable only through love.',
    note: 'Deep insight into human connection.',
    color: 'blue',
    isShared: false,
    createdAt: '2026-10-23T10:15:00Z',
    updatedAt: '2026-10-23T10:15:00Z',
    book: bookB,
  },
];

describe('Annotations & Knowledge Hub Utilities', () => {
  describe('parseLocationDisplay', () => {
    it('formats page-based locations into readable page numbers', () => {
      expect(parseLocationDisplay('page:42')).toBe('Page 42');
      expect(parseLocationDisplay('PAGE:120')).toBe('Page 120');
    });

    it('identifies EPUB CFIs', () => {
      expect(parseLocationDisplay('epubcfi(/6/4[chap01]!)')).toBe('EPUB Location');
    });

    it('handles null, undefined, or empty values', () => {
      expect(parseLocationDisplay(null)).toBe('Unknown location');
      expect(parseLocationDisplay(undefined)).toBe('Unknown location');
      expect(parseLocationDisplay('')).toBe('Unknown location');
    });
  });

  describe('groupAnnotationsByBook', () => {
    it('groups annotations under respective books and computes count', () => {
      const grouped = groupAnnotationsByBook(mockAnnotations);

      expect(grouped).toHaveLength(2);
      // bookB was annotated later (2026-10-23), so it should be first
      expect(grouped[0].book.id).toBe('book-b');
      expect(grouped[0].totalCount).toBe(2);
      expect(grouped[0].annotations).toHaveLength(2);

      expect(grouped[1].book.id).toBe('book-a');
      expect(grouped[1].totalCount).toBe(2);
      expect(grouped[1].annotations).toHaveLength(2);
    });

    it('orders annotations inside each group chronologically (newest first)', () => {
      const grouped = groupAnnotationsByBook(mockAnnotations);
      const bookBGroup = grouped.find((g) => g.book.id === 'book-b');

      expect(bookBGroup?.annotations[0].id).toBe('ann-4'); // 10:15:00Z
      expect(bookBGroup?.annotations[1].id).toBe('ann-3'); // 09:00:00Z
    });

    it('skips annotations without an attached book record', () => {
      const orphaned: Annotation = {
        id: 'ann-orphan',
        tenantId: 'tenant-1',
        bookId: 'book-deleted',
        userId: 'user-1',
        location: 'page:1',
        highlightedText: 'Ghost text',
        color: 'yellow',
        isShared: false,
        createdAt: '2026-10-23T12:00:00Z',
        updatedAt: '2026-10-23T12:00:00Z',
      };

      const result = groupAnnotationsByBook([...mockAnnotations, orphaned]);
      expect(result).toHaveLength(2);
    });
  });

  describe('filterAnnotations', () => {
    it('filters strictly by highlight color', () => {
      const yellow = filterAnnotations(mockAnnotations, { color: 'yellow' });
      expect(yellow).toHaveLength(1);
      expect(yellow[0].id).toBe('ann-1');

      const green = filterAnnotations(mockAnnotations, { color: 'green' });
      expect(green).toHaveLength(1);
      expect(green[0].id).toBe('ann-2');
    });

    it('filters strictly by visibility (shared vs private)', () => {
      const shared = filterAnnotations(mockAnnotations, { visibility: 'shared' });
      expect(shared).toHaveLength(2);
      expect(shared.every((a) => a.isShared)).toBe(true);

      const priv = filterAnnotations(mockAnnotations, { visibility: 'private' });
      expect(priv).toHaveLength(2);
      expect(priv.every((a) => !a.isShared)).toBe(true);
    });

    it('filters by search query across highlighted text and reflection note', () => {
      const textMatch = filterAnnotations(mockAnnotations, { query: 'dragon' });
      expect(textMatch).toHaveLength(1);
      expect(textMatch[0].id).toBe('ann-1');

      const noteMatch = filterAnnotations(mockAnnotations, { query: 'motto' });
      expect(noteMatch).toHaveLength(1);
      expect(noteMatch[0].id).toBe('ann-2');
    });

    it('combines query, color, and visibility filters simultaneously', () => {
      const combined = filterAnnotations(mockAnnotations, {
        query: 'incredible',
        color: 'pink',
        visibility: 'shared',
      });

      expect(combined).toHaveLength(1);
      expect(combined[0].id).toBe('ann-3');
    });

    it('returns empty array when filters do not match any annotations', () => {
      const empty = filterAnnotations(mockAnnotations, { query: 'nonexistent phrase' });
      expect(empty).toHaveLength(0);
    });
  });

  describe('formatAnnotationsToMarkdown', () => {
    it('formats a book and its annotations into structured Markdown export', () => {
      const bookBNotes = mockAnnotations.filter((a) => a.bookId === 'book-b');
      const md = formatAnnotationsToMarkdown(bookB, bookBNotes);

      expect(md).toContain('# Cosmos & Quantum Wonder');
      expect(md).toContain('**Author:** Carl Sagan');
      expect(md).toContain('**Format:** PDF');
      expect(md).toContain('**Total Highlights:** 2');

      // Highlight quotes & citations
      expect(md).toContain('> "Somewhere, something incredible is waiting to be known."');
      expect(md).toContain('### Highlight 1 (Page 42)');
      expect(md).toContain('### Highlight 2 (Page 105)');
      expect(md).toContain('**Reflection:** Deep insight into human connection.');
      expect(md).toContain('*Color:* BLUE | *Visibility:* Private');
      expect(md).toContain('*Color:* PINK | *Visibility:* Shared');
    });

    it('handles books with 0 annotations gracefully', () => {
      const md = formatAnnotationsToMarkdown(bookA, []);
      expect(md).toContain('# The Hobbit');
      expect(md).toContain('*No highlights or reflections found for this book.*');
    });
  });
});
