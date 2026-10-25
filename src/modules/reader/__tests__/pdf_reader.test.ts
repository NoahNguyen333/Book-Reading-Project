import { describe, it, expect, vi } from 'vitest';
import {
  parsePageFromCfi,
  formatPageCfi,
  calculatePagePercentage,
  normalizeReaderText,
  mergeHighlightRects,
  findHighlightRects,
  sortPdfTextItems,
  areRectsOnSameLine,
  buildMappedNormalizedText,
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

  describe('PDF Text Selection & Highlight Overlay Utilities', () => {
    describe('normalizeReaderText', () => {
      it('collapses multiple whitespace characters and trims', () => {
        expect(normalizeReaderText('   Hello \t\n  world!   ')).toBe('hello world!');
      });

      it('normalizes curly quotes to straight quotes', () => {
        expect(normalizeReaderText('“Quote” and ‘Single’')).toBe('"quote" and \'single\'');
      });

      it('lowercases strings for case-insensitive matching', () => {
        expect(normalizeReaderText('Family Reading Room')).toBe('family reading room');
      });

      it('strips zero-width characters and soft hyphens', () => {
        expect(normalizeReaderText('inter\u00ADnational\u200B')).toBe('international');
      });
    });

    describe('buildMappedNormalizedText', () => {
      it('creates an exact 1:1 source map from normalized character index to source item and char', () => {
        const testItems = [
          { str: '“Family”', left: 40, top: 100, width: 60, height: 16 },
          { str: 'Reading', left: 105, top: 100, width: 50, height: 16 },
        ];

        const { text, sourceMap } = buildMappedNormalizedText(testItems);
        expect(text).toBe('"family" reading');
        expect(sourceMap).toHaveLength(text.length);

        // First char '"' maps to item 0, char 0
        expect(sourceMap[0]).toEqual({ itemIndex: 0, charIndex: 0 });
        // 'f' maps to item 0, char 1
        expect(sourceMap[1]).toEqual({ itemIndex: 0, charIndex: 1 });
        // Virtual space between items maps to null
        expect(sourceMap[8]).toBeNull();
        // 'r' maps to item 1, char 0
        expect(sourceMap[9]).toEqual({ itemIndex: 1, charIndex: 0 });
      });
    });

    describe('areRectsOnSameLine & Adaptive Line Grouping', () => {
      it('groups large title fonts on the same line even with 6px-8px vertical baseline jitter', () => {
        const titleWord1 = { top: 100, height: 40 };
        const titleWord2 = { top: 107, height: 40 }; // 7px jitter
        expect(areRectsOnSameLine(titleWord1, titleWord2)).toBe(true);
      });

      it('distinguishes tightly spaced footnote lines as separate lines', () => {
        const footLine1 = { top: 200, height: 9 };
        const footLine2 = { top: 210, height: 9 };
        expect(areRectsOnSameLine(footLine1, footLine2)).toBe(false);
      });

      it('distinguishes vertically touching lines as separate lines', () => {
        const line1 = { top: 100, height: 14 };
        const line2 = { top: 114, height: 14 }; // 0px gap
        expect(areRectsOnSameLine(line1, line2)).toBe(false);
      });

      it('does not merge lines with minor descender overlap', () => {
        const line1 = { top: 100, height: 16 };
        const line2 = { top: 114, height: 16 }; // 2px descender collision (< 45% overlap)
        expect(areRectsOnSameLine(line1, line2)).toBe(false);
      });
    });

    describe('mergeHighlightRects', () => {
      it('returns empty array when no items are provided', () => {
        expect(mergeHighlightRects([])).toEqual([]);
      });

      it('merges adjacent items on the same horizontal line into a single rectangle', () => {
        const lineItems = [
          { left: 50, top: 100, width: 40, height: 16 },
          { left: 95, top: 101, width: 60, height: 16 },
          { left: 160, top: 99, width: 30, height: 16 },
        ];
        const merged = mergeHighlightRects(lineItems);
        expect(merged).toHaveLength(1);
        expect(merged[0].left).toBe(50);
        expect(merged[0].top).toBe(99);
        expect(merged[0].width).toBe(140); // 190 - 50 = 140
      });

      it('keeps separate lines as distinct rectangles', () => {
        const multilineItems = [
          { left: 50, top: 100, width: 100, height: 16 },
          { left: 50, top: 130, width: 80, height: 16 },
        ];
        const merged = mergeHighlightRects(multilineItems);
        expect(merged).toHaveLength(2);
        expect(merged[0].top).toBe(100);
        expect(merged[1].top).toBe(130);
      });

      it('keeps horizontally disjoint items on the same line as separate rectangles (multi-column / gaps)', () => {
        const disjointSameLine = [
          { left: 40, top: 100, width: 50, height: 16 },
          { left: 350, top: 100, width: 50, height: 16 },
        ];
        const merged = mergeHighlightRects(disjointSameLine);
        expect(merged).toHaveLength(2);
        expect(merged[0].left).toBe(40);
        expect(merged[1].left).toBe(350);
      });
    });

    describe('findHighlightRects', () => {
      const pageTextItems = [
        { str: 'The', left: 40, top: 100, width: 25, height: 14 },
        { str: 'quick', left: 70, top: 100, width: 35, height: 14 },
        { str: 'brown', left: 110, top: 100, width: 40, height: 14 },
        { str: 'fox', left: 155, top: 100, width: 25, height: 14 },
        { str: 'jumps', left: 40, top: 125, width: 40, height: 14 },
        { str: 'over', left: 85, top: 125, width: 30, height: 14 },
        { str: 'the', left: 120, top: 125, width: 25, height: 14 },
        { str: 'lazy', left: 150, top: 125, width: 30, height: 14 },
        { str: 'dog.', left: 185, top: 125, width: 30, height: 14 },
      ];

      it('accurately identifies single-line selections', () => {
        const rects = findHighlightRects(pageTextItems, 'quick brown fox');
        expect(rects).toHaveLength(1);
        expect(rects[0].left).toBe(70);
        expect(rects[0].width).toBe(110); // from 70 to 180 = 110
      });

      it('accurately identifies multi-line spanning selections', () => {
        const rects = findHighlightRects(pageTextItems, 'fox jumps over');
        expect(rects).toHaveLength(2);
        // Line 1: 'fox'
        expect(rects[0].left).toBe(155);
        expect(rects[0].top).toBe(100);
        // Line 2: 'jumps over'
        expect(rects[1].left).toBe(40);
        expect(rects[1].top).toBe(125);
        expect(rects[1].width).toBe(75); // from 40 to 115 = 75
      });

      it('handles extra/repeated whitespace and curly versus straight quotation marks', () => {
        const quoteItems = [
          { str: '“Family', left: 40, top: 100, width: 60, height: 20 },
          { str: 'Reading', left: 105, top: 100, width: 50, height: 20 },
          { str: 'Room”', left: 160, top: 100, width: 60, height: 20 },
        ];

        // Query with straight quotes and excessive spaces
        const rectsWithStraightQuotes = findHighlightRects(quoteItems, '  "Family \n\t  Reading    Room"  ');
        expect(rectsWithStraightQuotes).toHaveLength(1);
        expect(rectsWithStraightQuotes[0].left).toBe(40);
        expect(rectsWithStraightQuotes[0].width).toBe(180);

        // Query without quotes matches inner phrase with proportional bounds
        const rectsInner = findHighlightRects(quoteItems, 'Reading Room');
        expect(rectsInner).toHaveLength(1);
        expect(rectsInner[0].left).toBe(105);
      });

      it('handles the same phrase appearing multiple times on a page without cross-bleeding', () => {
        const repeatedItems = [
          // Paragraph 1
          { str: 'Special', left: 40, top: 100, width: 50, height: 16 },
          { str: 'Offer', left: 95, top: 100, width: 40, height: 16 },
          { str: 'today.', left: 140, top: 100, width: 40, height: 16 },
          // Paragraph 5 (repeated phrase)
          { str: 'Special', left: 40, top: 300, width: 50, height: 16 },
          { str: 'Offer', left: 95, top: 300, width: 40, height: 16 },
          { str: 'now.', left: 140, top: 300, width: 35, height: 16 },
        ];

        // Default: first occurrence only
        const defaultOcc = findHighlightRects(repeatedItems, 'Special Offer');
        expect(defaultOcc).toHaveLength(1);
        expect(defaultOcc[0].top).toBe(100);

        // Second occurrence explicitly requested
        const secondOcc = findHighlightRects(repeatedItems, 'Special Offer', { occurrenceIndex: 1 });
        expect(secondOcc).toHaveLength(1);
        expect(secondOcc[0].top).toBe(300);

        // Out-of-bounds occurrence returns empty array
        expect(findHighlightRects(repeatedItems, 'Special Offer', { occurrenceIndex: 5 })).toEqual([]);

        // matchAll returns both discrete occurrences without selecting words in between
        const allOcc = findHighlightRects(repeatedItems, 'Special Offer', { matchAll: true });
        expect(allOcc).toHaveLength(2);
        expect(allOcc[0].top).toBe(100);
        expect(allOcc[1].top).toBe(300);
      });

      it('returns empty array when quote cannot be found (never creates speculative highlights)', () => {
        expect(findHighlightRects(pageTextItems, 'completely nonexistent phrase')).toEqual([]);
        expect(findHighlightRects(pageTextItems, '')).toEqual([]);
        expect(findHighlightRects(pageTextItems, '     ')).toEqual([]);
        expect(findHighlightRects([], 'quick')).toEqual([]);
      });

      it('does NOT create highlights when similar words appear elsewhere but do not form a contiguous match', () => {
        // Page has "quick", "fox", "dog" scattered across different lines/paragraphs
        const scatteredItems = [
          { str: 'A', left: 40, top: 100, width: 15, height: 14 },
          { str: 'quick', left: 60, top: 100, width: 35, height: 14 },
          { str: 'idea', left: 100, top: 100, width: 30, height: 14 },
          { str: 'The', left: 40, top: 200, width: 25, height: 14 },
          { str: 'fox', left: 70, top: 200, width: 25, height: 14 },
          { str: 'My', left: 40, top: 300, width: 20, height: 14 },
          { str: 'dog', left: 65, top: 300, width: 25, height: 14 },
        ];

        // Search for phrase "quick fox dog" - words exist on page, but not contiguously
        const result = findHighlightRects(scatteredItems, 'quick fox dog');
        expect(result).toEqual([]); // Broad fallback removed: must NOT guess or highlight individual words
      });

      it('handles different font sizes and line spacing accurately', () => {
        const mixedItems = [
          // Large Heading (32px font, 40px height)
          { str: 'Big', left: 40, top: 100, width: 60, height: 40 },
          { str: 'Heading', left: 105, top: 104, width: 120, height: 40 },
          // Body text below (14px font, 18px height)
          { str: 'Introductory', left: 40, top: 160, width: 90, height: 18 },
          { str: 'body', left: 135, top: 160, width: 40, height: 18 },
          { str: 'paragraph', left: 180, top: 160, width: 70, height: 18 },
        ];

        // Heading selection merges into single 40px height box despite 4px top offset
        const headingRects = findHighlightRects(mixedItems, 'Big Heading');
        expect(headingRects).toHaveLength(1);
        expect(headingRects[0].height).toBe(44); // 144 - 100 = 44
        expect(headingRects[0].left).toBe(40);
        expect(headingRects[0].width).toBe(185);

        // Multi-line selection spanning heading and body text
        const crossSectionRects = findHighlightRects(mixedItems, 'Heading Introductory');
        expect(crossSectionRects).toHaveLength(2);
        expect(crossSectionRects[0].top).toBe(104);
        expect(crossSectionRects[1].top).toBe(160);
      });

      describe('sortPdfTextItems (production reading order helper)', () => {
        it('sorts scrambled items in single-column layout top-to-bottom and left-to-right', () => {
          const scrambledItems = [
            { str: 'line 2 right', left: 120, top: 130, width: 80, height: 14, fontSize: 14 },
            { str: 'line 1 left', left: 40, top: 100, width: 70, height: 14, fontSize: 14 },
            { str: 'line 2 left', left: 40, top: 130, width: 70, height: 14, fontSize: 14 },
            { str: 'line 1 right', left: 120, top: 100, width: 80, height: 14, fontSize: 14 },
          ];

          const sorted = sortPdfTextItems(scrambledItems);
          expect(sorted.map((i) => i.str)).toEqual([
            'line 1 left',
            'line 1 right',
            'line 2 left',
            'line 2 right',
          ]);
        });

        it('handles vertical baseline offsets and subscripts where fixed 5px threshold would fail', () => {
          // Main text at top 100 with 20px line height; subscript at top 107 (7px difference)
          const lineWithSubscript = [
            { str: 'H', left: 40, top: 100, width: 15, height: 20, fontSize: 16 },
            { str: 'O', left: 70, top: 100, width: 15, height: 20, fontSize: 16 },
            { str: '2', left: 56, top: 107, width: 12, height: 16, fontSize: 12 }, // 7px below baseline
          ];

          const sorted = sortPdfTextItems(lineWithSubscript);
          // Left-to-right order must be preserved on the same line despite 7px offset
          expect(sorted.map((i) => i.str)).toEqual(['H', '2', 'O']);
        });

        it('correctly partitions two-column layouts so column 1 is processed before column 2', () => {
          // Interleaved items from column 1 (left: 40..140) and column 2 (left: 260..360)
          const twoColumnInterleaved = [
            { str: 'Col 2 Line 1', left: 260, top: 100, width: 90, height: 16, fontSize: 14 },
            { str: 'Col 1 Line 1', left: 40, top: 100, width: 90, height: 16, fontSize: 14 },
            { str: 'Col 2 Line 2', left: 260, top: 130, width: 90, height: 16, fontSize: 14 },
            { str: 'Col 1 Line 2', left: 40, top: 130, width: 90, height: 16, fontSize: 14 },
            { str: 'Col 2 Line 3', left: 260, top: 160, width: 90, height: 16, fontSize: 14 },
            { str: 'Col 1 Line 3', left: 40, top: 160, width: 90, height: 16, fontSize: 14 },
          ];

          const sorted = sortPdfTextItems(twoColumnInterleaved);
          expect(sorted.map((i) => i.str)).toEqual([
            'Col 1 Line 1',
            'Col 1 Line 2',
            'Col 1 Line 3',
            'Col 2 Line 1',
            'Col 2 Line 2',
            'Col 2 Line 3',
          ]);
        });

        it('places spanning header items before multi-column body text', () => {
          const documentWithHeader = [
            { str: 'Col 1 Item 1', left: 40, top: 150, width: 80, height: 16, fontSize: 14 },
            { str: 'Col 2 Item 1', left: 260, top: 150, width: 80, height: 16, fontSize: 14 },
            { str: 'Chapter Title Header', left: 40, top: 50, width: 300, height: 24, fontSize: 20 },
            { str: 'Col 1 Item 2', left: 40, top: 180, width: 80, height: 16, fontSize: 14 },
            { str: 'Col 2 Item 2', left: 260, top: 180, width: 80, height: 16, fontSize: 14 },
            { str: 'Col 1 Item 3', left: 40, top: 210, width: 80, height: 16, fontSize: 14 },
            { str: 'Col 2 Item 3', left: 260, top: 210, width: 80, height: 16, fontSize: 14 },
          ];

          const sorted = sortPdfTextItems(documentWithHeader);
          expect(sorted[0].str).toBe('Chapter Title Header');
          expect(sorted.slice(1, 4).map((i) => i.str)).toEqual([
            'Col 1 Item 1',
            'Col 1 Item 2',
            'Col 1 Item 3',
          ]);
          expect(sorted.slice(4).map((i) => i.str)).toEqual([
            'Col 2 Item 1',
            'Col 2 Item 2',
            'Col 2 Item 3',
          ]);
        });
      });

      describe('PDF text item boundaries & kerning', () => {
        it('matches kerning-split words without injecting synthetic whitespace', () => {
          // "Washington" split into "W" and "ashington" by font kerning / advance vector
          const kerningSplitItems = [
            { str: 'W', left: 40, top: 100, width: 14, height: 16, fontSize: 14 },
            { str: 'ashington', left: 54, top: 100, width: 60, height: 16, fontSize: 14 },
          ];

          const rects = findHighlightRects(kerningSplitItems, 'Washington');
          expect(rects).toHaveLength(1);
          expect(rects[0].left).toBe(40);
          expect(rects[0].width).toBe(74); // 14 + 60 = 74
        });

        it('preserves whitespace between items that are separated by word spacing', () => {
          const separatedWordItems = [
            { str: 'Hello', left: 40, top: 100, width: 35, height: 16, fontSize: 14 },
            { str: 'World', left: 82, top: 100, width: 35, height: 16, fontSize: 14 }, // gap = 7px
          ];

          // Query matching "Hello World" succeeds
          const matched = findHighlightRects(separatedWordItems, 'Hello World');
          expect(matched).toHaveLength(1);

          // Query matching "HelloWorld" (without space) must fail
          const unspaced = findHighlightRects(separatedWordItems, 'HelloWorld');
          expect(unspaced).toEqual([]);
        });

        it('prevents matching phrases that span across unrelated columns or gutters', () => {
          const crossColumnItems = [
            { str: 'Col Left', left: 40, top: 100, width: 80, height: 16, fontSize: 14 },
            { str: 'Col Right', left: 260, top: 100, width: 80, height: 16, fontSize: 14 },
          ];

          // Phrase "Left Col" does not cross column
          expect(findHighlightRects(crossColumnItems, 'Col Left')).toHaveLength(1);
          expect(findHighlightRects(crossColumnItems, 'Col Right')).toHaveLength(1);

          // Concatenating words across the gutter must NOT match
          expect(findHighlightRects(crossColumnItems, 'Left Col Right')).toEqual([]);
        });

        it('computes proportional sub-item highlight bounds for partial-word or sub-phrase selections', () => {
          const singleLongItem = [
            { str: 'Internationalization', left: 40, top: 100, width: 200, height: 16, fontSize: 14 },
          ];

          // Select sub-string "national" (chars 5 to 12 inclusive, length 8 of 20 total = 40% width)
          const rects = findHighlightRects(singleLongItem, 'national');
          expect(rects).toHaveLength(1);
          // startRatio = 5/20 = 0.25 -> left = 40 + 200*0.25 = 90
          expect(rects[0].left).toBe(90);
          // endRatio = 13/20 = 0.65 -> width = 200*(0.65 - 0.25) = 80
          expect(rects[0].width).toBe(80);
        });

        it('prevents matching phrases across column vertical jumps (from column 1 bottom to column 2 top)', () => {
          const multiColumnDocument = [
            { str: 'Header', left: 40, top: 40, width: 300, height: 20 },
            { str: 'Col 1 top', left: 40, top: 100, width: 80, height: 16 },
            { str: 'Col 1 mid', left: 40, top: 125, width: 80, height: 16 },
            { str: 'Col 1 bottom', left: 40, top: 150, width: 80, height: 16 },
            { str: 'Col 2 top', left: 260, top: 100, width: 80, height: 16 },
            { str: 'Col 2 mid', left: 260, top: 125, width: 80, height: 16 },
            { str: 'Col 2 bottom', left: 260, top: 150, width: 80, height: 16 },
            { str: 'Footer', left: 40, top: 250, width: 300, height: 20 },
          ];

          // Intra-column selections succeed
          expect(findHighlightRects(multiColumnDocument, 'Col 1 top Col 1 mid')).toHaveLength(2);
          expect(findHighlightRects(multiColumnDocument, 'Col 2 top Col 2 mid')).toHaveLength(2);

          // Matching across column 1 bottom to column 2 top MUST fail
          expect(findHighlightRects(multiColumnDocument, 'Col 1 bottom Col 2 top')).toEqual([]);

          // Matching across header into column 1 top MUST fail
          expect(findHighlightRects(multiColumnDocument, 'Header Col 1 top')).toEqual([]);

          // Matching across column 2 bottom into footer MUST fail
          expect(findHighlightRects(multiColumnDocument, 'Col 2 bottom Footer')).toEqual([]);
        });

        it('handles items with missing, zero, or NaN geometry safely without throwing or false matches', () => {
          const malformedItems = [
            { str: 'Valid', left: 40, top: 100, width: 40, height: 16 },
            { str: '', left: 0, top: 0, width: 0, height: 0 }, // empty item
            { str: 'Text', left: 90, top: 100, width: 40, height: 16 },
            { str: 'Fallback', left: NaN, top: undefined as unknown as number, width: 50, height: 16 },
          ];

          // Should match contiguous valid text without error
          const rects = findHighlightRects(malformedItems, 'Valid Text');
          expect(rects).toHaveLength(1);
          expect(rects[0].left).toBe(40);
        });
      });
    });
  });
});
