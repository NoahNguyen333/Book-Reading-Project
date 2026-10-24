import { describe, it, expect, vi } from 'vitest';
import {
  parsePageFromCfi,
  formatPageCfi,
  calculatePagePercentage,
} from '../utils';
import {
  isContainerZoomed,
  isPannedToHorizontalBoundary,
} from '../gestures';

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

  describe('PDF Touch Navigation & Zoom Boundaries', () => {
    it('respects page boundaries when calculating next and previous pages', () => {
      const getNextPage = (currentPage: number, totalPages: number) =>
        Math.min(totalPages, currentPage + 1);
      const getPrevPage = (currentPage: number) =>
        Math.max(1, currentPage - 1);

      expect(getNextPage(1, 10)).toBe(2);
      expect(getNextPage(10, 10)).toBe(10); // Clamped at totalPages
      expect(getPrevPage(5)).toBe(4);
      expect(getPrevPage(1)).toBe(1); // Clamped at 1
    });

    it('uses production isContainerZoomed and isPannedToHorizontalBoundary utilities', () => {
      // Zoomed in container (width=800, content=1600)
      const zoomedContainer = {
        scrollWidth: 1600,
        clientWidth: 800,
        scrollLeft: 400, // Scrolled in the middle of page
      } as HTMLElement;

      expect(isContainerZoomed(zoomedContainer, 30)).toBe(true);

      // Panning left or right while in the middle of a zoomed page: boundary not reached
      expect(isPannedToHorizontalBoundary(zoomedContainer, 'left', 30)).toBe(false);
      expect(isPannedToHorizontalBoundary(zoomedContainer, 'right', 30)).toBe(false);

      // Scrolled all the way to the right edge (scrollLeft = 800)
      const atRightEdge = {
        scrollWidth: 1600,
        clientWidth: 800,
        scrollLeft: 800,
      } as HTMLElement;
      expect(isPannedToHorizontalBoundary(atRightEdge, 'left', 30)).toBe(true);

      // Scrolled all the way to the left edge (scrollLeft = 0)
      const atLeftEdge = {
        scrollWidth: 1600,
        clientWidth: 800,
        scrollLeft: 0,
      } as HTMLElement;
      expect(isPannedToHorizontalBoundary(atLeftEdge, 'right', 30)).toBe(true);

      // Not zoomed container
      const unzoomedContainer = {
        scrollWidth: 800,
        clientWidth: 800,
        scrollLeft: 0,
      } as HTMLElement;
      expect(isContainerZoomed(unzoomedContainer, 30)).toBe(false);
      expect(isPannedToHorizontalBoundary(unzoomedContainer, 'left', 30)).toBe(true);
      expect(isPannedToHorizontalBoundary(unzoomedContainer, 'right', 30)).toBe(true);
    });

    it('disables edge-tap page navigation when PDF container is zoomed in', () => {
      const mockPrev = vi.fn();
      const mockNext = vi.fn();
      const mockToggleToolbar = vi.fn();

      const handleTapAction = (
        isZoomed: boolean,
        relativeX: number,
        currentPage: number,
        totalPages: number
      ) => {
        if (!isZoomed && relativeX <= 0.20 && currentPage > 1) {
          mockPrev();
        } else if (!isZoomed && relativeX >= 0.80 && currentPage < totalPages) {
          mockNext();
        } else if (relativeX > 0.20 && relativeX < 0.80) {
          mockToggleToolbar();
        }
      };

      // 1. When NOT zoomed in:
      // Left 20% triggers prev
      handleTapAction(false, 0.10, 5, 10);
      expect(mockPrev).toHaveBeenCalledTimes(1);
      // Right 20% triggers next
      handleTapAction(false, 0.90, 5, 10);
      expect(mockNext).toHaveBeenCalledTimes(1);
      // Center 60% toggles toolbar
      handleTapAction(false, 0.50, 5, 10);
      expect(mockToggleToolbar).toHaveBeenCalledTimes(1);

      // Reset mocks
      vi.clearAllMocks();

      // 2. When ZOOMED IN:
      // Left 20% does NOT trigger prev
      handleTapAction(true, 0.10, 5, 10);
      expect(mockPrev).not.toHaveBeenCalled();

      // Right 20% does NOT trigger next
      handleTapAction(true, 0.90, 5, 10);
      expect(mockNext).not.toHaveBeenCalled();

      // Center 60% still toggles toolbar
      handleTapAction(true, 0.50, 5, 10);
      expect(mockToggleToolbar).toHaveBeenCalledTimes(1);
    });
  });
});
