import { describe, it, expect } from 'vitest';
import {
  parsePageFromCfi,
  formatPageCfi,
  calculatePagePercentage,
} from '../utils';

describe('PDF Reader Position & Progress Utilities', () => {
  describe('parsePageFromCfi', () => {
    it('parses standardized page pseudo-CFI strings', () => {
      expect(parsePageFromCfi('page:1')).toBe(1);
      expect(parsePageFromCfi('page:42')).toBe(42);
      expect(parsePageFromCfi('page:1280')).toBe(1280);
    });

    it('handles case-insensitive prefixes', () => {
      expect(parsePageFromCfi('PAGE:15')).toBe(15);
      expect(parsePageFromCfi('Page:99')).toBe(99);
    });

    it('returns null for standard EPUB CFIs or invalid strings', () => {
      expect(parsePageFromCfi('epubcfi(/6/4[chap01]!/4/2/10/1:0)')).toBeNull();
      expect(parsePageFromCfi('page:')).toBeNull();
      expect(parsePageFromCfi('chapter-1')).toBeNull();
      expect(parsePageFromCfi(null)).toBeNull();
      expect(parsePageFromCfi(undefined)).toBeNull();
      expect(parsePageFromCfi('')).toBeNull();
    });
  });

  describe('formatPageCfi', () => {
    it('formats a page number into standardized pseudo-CFI format', () => {
      expect(formatPageCfi(1)).toBe('page:1');
      expect(formatPageCfi(25)).toBe('page:25');
      expect(formatPageCfi(350)).toBe('page:350');
    });

    it('clamps negative or zero page numbers to page:1', () => {
      expect(formatPageCfi(0)).toBe('page:1');
      expect(formatPageCfi(-5)).toBe('page:1');
    });

    it('rounds floating point page numbers to integers', () => {
      expect(formatPageCfi(3.7)).toBe('page:4');
      expect(formatPageCfi(2.2)).toBe('page:2');
    });
  });

  describe('calculatePagePercentage', () => {
    it('calculates correct completion percentages', () => {
      expect(calculatePagePercentage(1, 10)).toBe(10);
      expect(calculatePagePercentage(5, 10)).toBe(50);
      expect(calculatePagePercentage(10, 10)).toBe(100);
      expect(calculatePagePercentage(1, 3)).toBe(33);
      expect(calculatePagePercentage(2, 3)).toBe(67);
    });

    it('clamps boundaries between 0 and 100', () => {
      expect(calculatePagePercentage(-2, 10)).toBe(0);
      expect(calculatePagePercentage(15, 10)).toBe(100);
    });

    it('returns 0 when totalPages is zero or negative', () => {
      expect(calculatePagePercentage(1, 0)).toBe(0);
      expect(calculatePagePercentage(1, -5)).toBe(0);
    });
  });
});
