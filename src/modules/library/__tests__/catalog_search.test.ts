import { describe, it, expect } from 'vitest';
import { Book } from '../types';
import { filterBooks, sortBooks, filterAndSortBooks } from '../search';

const mockBooks: Book[] = [
  {
    id: 'book-1',
    tenantId: 'tenant-1',
    title: 'Alice in Wonderland',
    author: 'Lewis Carroll',
    description: 'A classic tale of curiosity and whimsical adventures.',
    format: 'epub',
    fileSize: 1024 * 500, // 500 KB
    processingStatus: 'ready',
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
  },
  {
    id: 'book-2',
    tenantId: 'tenant-1',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    description: 'The story of the mysteriously wealthy Jay Gatsby.',
    format: 'epub',
    fileSize: 1024 * 1024 * 2, // 2 MB
    processingStatus: 'ready',
    createdAt: '2026-10-22T10:00:00Z',
    updatedAt: '2026-10-22T10:00:00Z',
  },
  {
    id: 'book-3',
    tenantId: 'tenant-1',
    title: 'Quantum Physics for Kids',
    author: 'Dr. Albert',
    description: 'An illustrated guide to quantum mechanics and subatomic particles.',
    format: 'pdf',
    fileSize: 1024 * 1024 * 15, // 15 MB
    processingStatus: 'ready',
    createdAt: '2026-10-21T10:00:00Z',
    updatedAt: '2026-10-21T10:00:00Z',
  },
  {
    id: 'book-4',
    tenantId: 'tenant-1',
    title: 'Bedtime Stories for Young Explorers',
    author: 'Lewis Carroll & Friends',
    description: 'Short bedtime stories before sleep.',
    format: 'pdf',
    fileSize: 1024 * 800, // 800 KB
    processingStatus: 'ready',
    createdAt: '2026-10-19T10:00:00Z',
    updatedAt: '2026-10-19T10:00:00Z',
  },
];

describe('Catalog Search, Format Filter & Sorting Engine', () => {
  describe('filterBooks', () => {
    it('returns all books when no query and format is all', () => {
      const result = filterBooks(mockBooks, '', 'all');
      expect(result).toHaveLength(4);
    });

    it('filters books by title (case-insensitive)', () => {
      const result = filterBooks(mockBooks, 'alice');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('book-1');
    });

    it('filters books by author', () => {
      const result = filterBooks(mockBooks, 'Fitzgerald');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('book-2');
    });

    it('filters books by description content', () => {
      const result = filterBooks(mockBooks, 'subatomic particles');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('book-3');
    });

    it('filters books strictly by EPUB format', () => {
      const result = filterBooks(mockBooks, '', 'epub');
      expect(result).toHaveLength(2);
      expect(result.every((b) => b.format === 'epub')).toBe(true);
    });

    it('filters books strictly by PDF format', () => {
      const result = filterBooks(mockBooks, '', 'pdf');
      expect(result).toHaveLength(2);
      expect(result.every((b) => b.format === 'pdf')).toBe(true);
    });

    it('combines text query and format filter correctly', () => {
      // Lewis Carroll authored both an EPUB (book-1) and a PDF (book-4)
      const epubResults = filterBooks(mockBooks, 'Lewis Carroll', 'epub');
      expect(epubResults).toHaveLength(1);
      expect(epubResults[0].id).toBe('book-1');

      const pdfResults = filterBooks(mockBooks, 'Lewis Carroll', 'pdf');
      expect(pdfResults).toHaveLength(1);
      expect(pdfResults[0].id).toBe('book-4');
    });

    it('handles search queries with surrounding whitespace', () => {
      const result = filterBooks(mockBooks, '   Gatsby   ');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('book-2');
    });

    it('returns empty array when no books match the search query', () => {
      const result = filterBooks(mockBooks, 'Nonexistent Encyclopedia');
      expect(result).toHaveLength(0);
    });
  });

  describe('sortBooks', () => {
    it('sorts books by recently added (newest createdAt first) by default', () => {
      const result = sortBooks(mockBooks, 'recent');
      expect(result[0].id).toBe('book-2'); // 2026-10-22
      expect(result[1].id).toBe('book-3'); // 2026-10-21
      expect(result[2].id).toBe('book-1'); // 2026-10-20
      expect(result[3].id).toBe('book-4'); // 2026-10-19
    });

    it('sorts books alphabetically by title A-Z', () => {
      const result = sortBooks(mockBooks, 'title-asc');
      expect(result[0].title).toBe('Alice in Wonderland');
      expect(result[1].title).toBe('Bedtime Stories for Young Explorers');
      expect(result[2].title).toBe('Quantum Physics for Kids');
      expect(result[3].title).toBe('The Great Gatsby');
    });

    it('sorts books alphabetically by title Z-A', () => {
      const result = sortBooks(mockBooks, 'title-desc');
      expect(result[0].title).toBe('The Great Gatsby');
      expect(result[3].title).toBe('Alice in Wonderland');
    });

    it('sorts books by file size descending (largest first)', () => {
      const result = sortBooks(mockBooks, 'size-desc');
      expect(result[0].id).toBe('book-3'); // 15 MB
      expect(result[1].id).toBe('book-2'); // 2 MB
      expect(result[2].id).toBe('book-4'); // 800 KB
      expect(result[3].id).toBe('book-1'); // 500 KB
    });

    it('sorts books by file size ascending (smallest first)', () => {
      const result = sortBooks(mockBooks, 'size-asc');
      expect(result[0].id).toBe('book-1'); // 500 KB
      expect(result[1].id).toBe('book-4'); // 800 KB
      expect(result[2].id).toBe('book-2'); // 2 MB
      expect(result[3].id).toBe('book-3'); // 15 MB
    });

    it('does not mutate the source array', () => {
      const copyBefore = [...mockBooks];
      sortBooks(mockBooks, 'size-desc');
      expect(mockBooks[0].id).toBe(copyBefore[0].id);
      expect(mockBooks[1].id).toBe(copyBefore[1].id);
    });
  });

  describe('filterAndSortBooks', () => {
    it('seamlessly filters and sorts in a single invocation', () => {
      const result = filterAndSortBooks(mockBooks, {
        format: 'epub',
        sortBy: 'title-asc',
      });

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Alice in Wonderland');
      expect(result[1].title).toBe('The Great Gatsby');
    });
  });
});
