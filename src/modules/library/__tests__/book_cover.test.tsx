import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  BookCover,
  resolveCoverUrl,
  getDeterministicSeed,
} from '../components/BookCover';

describe('Book Cover Resolution & Cozy Editorial Fallbacks', () => {
  describe('resolveCoverUrl', () => {
    it('returns null for null, undefined, or empty coverUrl', () => {
      expect(resolveCoverUrl(null, 'book-1')).toBeNull();
      expect(resolveCoverUrl(undefined, 'book-1')).toBeNull();
      expect(resolveCoverUrl('', 'book-1')).toBeNull();
      expect(resolveCoverUrl('   ', 'book-1')).toBeNull();
    });

    it('returns data URLs as-is for instant client-side rendering', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
      expect(resolveCoverUrl(dataUrl, 'book-1')).toBe(dataUrl);
    });

    it('returns absolute HTTPS URLs as-is', () => {
      const httpsUrl = 'https://covers.openlibrary.org/b/isbn/9780140328721-L.jpg';
      expect(resolveCoverUrl(httpsUrl, 'book-1')).toBe(httpsUrl);
    });

    it('returns absolute HTTP URLs as-is', () => {
      const httpUrl = 'http://books.google.com/books/content?id=123';
      expect(resolveCoverUrl(httpUrl, 'book-1')).toBe(httpUrl);
    });

    it('converts private Supabase Storage paths to authorized proxy route', () => {
      const storagePath = 'tenant-uuid-123/book-uuid-456-cover.jpg';
      expect(resolveCoverUrl(storagePath, 'book-uuid-456')).toBe(
        '/api/books/book-uuid-456/cover'
      );
    });

    it('returns null for storage path if bookId is not provided', () => {
      const storagePath = 'tenant-uuid-123/book-uuid-456-cover.jpg';
      expect(resolveCoverUrl(storagePath)).toBeNull();
    });
  });

  describe('getDeterministicSeed', () => {
    it('produces stable identical seeds for identical strings', () => {
      const seed1 = getDeterministicSeed('book-uuid-123');
      const seed2 = getDeterministicSeed('book-uuid-123');
      expect(seed1).toBe(seed2);
      expect(typeof seed1).toBe('number');
      expect(seed1).toBeGreaterThanOrEqual(0);
    });

    it('produces different seeds for different book titles', () => {
      const seedA = getDeterministicSeed('The Great Gatsby');
      const seedB = getDeterministicSeed('War and Peace');
      expect(seedA).not.toBe(seedB);
    });
  });

  describe('BookCover Component Rendering', () => {
    const mockBook = {
      id: 'book-test-1',
      title: 'Dế Mèn Phiêu Lưu Ký',
      author: 'Tô Hoài',
      format: 'epub',
      coverUrl: null,
    };

    it('renders authentic image when a valid data URL is provided', () => {
      const bookWithDataUrl = {
        ...mockBook,
        coverUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
      };

      render(<BookCover book={bookWithDataUrl} size="card" />);
      const img = screen.getByRole('img');
      expect(img).toBeDefined();
      expect(img.getAttribute('src')).toBe(bookWithDataUrl.coverUrl);
      expect(img.getAttribute('alt')).toBe(mockBook.title);
      expect(img.className).toContain('object-cover');
    });

    it('renders proxy URL when a Supabase Storage path is provided', () => {
      const bookWithStoragePath = {
        ...mockBook,
        coverUrl: 'tenant-1/book-test-1-cover.jpg',
      };

      render(<BookCover book={bookWithStoragePath} size="card" />);
      const img = screen.getByRole('img');
      expect(img.getAttribute('src')).toBe('/api/books/book-test-1/cover');
    });

    it('renders designed Cozy Editorial fallback when coverUrl is null', () => {
      render(<BookCover book={mockBook} size="card" />);

      // Should not render an <img> tag
      expect(screen.queryByRole('img')).toBeNull();

      // Title should be prominent
      expect(screen.getByText('Dế Mèn Phiêu Lưu Ký')).toBeDefined();

      // Author should be displayed
      expect(screen.getByText('Tô Hoài')).toBeDefined();

      // Format stamp should be visible
      expect(screen.getByText('EPUB')).toBeDefined();
    });

    it('gracefully switches to fallback when image triggers onError', () => {
      const bookWithBrokenCover = {
        ...mockBook,
        coverUrl: 'https://broken.invalid/not-found.jpg',
      };

      render(<BookCover book={bookWithBrokenCover} size="card" />);

      const img = screen.getByRole('img');
      expect(img).toBeDefined();

      // Simulate image load error
      fireEvent.error(img);

      // Now the <img> should be replaced by the fallback
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.getByText('Dế Mèn Phiêu Lưu Ký')).toBeDefined();
      expect(screen.getByText('Tô Hoài')).toBeDefined();
    });

    it('renders compact mini fallback correctly for queue and notebook sizes', () => {
      render(<BookCover book={mockBook} size="mini" />);

      // Mini renders initial letter stamp
      expect(screen.getByText('D')).toBeDefined();
      expect(screen.getByText('EPUB')).toBeDefined();
    });

    it('handles very long book titles without crashing or throwing', () => {
      const longTitleBook = {
        id: 'book-long-1',
        title:
          'A Very Long Comprehensive Analytical Compendium of Classic World Literature Across Centuries and Continents',
        author: 'Anonymous Scholarly Author with an Extremely Long Name',
        format: 'pdf',
        coverUrl: null,
      };

      render(<BookCover book={longTitleBook} size="card" />);
      expect(
        screen.getByText(
          'A Very Long Comprehensive Analytical Compendium of Classic World Literature Across Centuries and Continents'
        )
      ).toBeDefined();
      expect(screen.getByText('PDF')).toBeDefined();
    });

    it('handles books with missing author gracefully', () => {
      const noAuthorBook = {
        id: 'book-no-author',
        title: 'Ancient Philosophy',
        author: null,
        format: 'epub',
        coverUrl: null,
      };

      render(<BookCover book={noAuthorBook} size="card" />);
      expect(screen.getByText('Ancient Philosophy')).toBeDefined();
      expect(screen.getByText('Tác giả chưa cập nhật')).toBeDefined();
    });
  });
});
