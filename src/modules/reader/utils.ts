export type ReaderTheme = 'light' | 'sepia' | 'dark';

export interface ThemeStyles {
  name: ReaderTheme;
  background: string;
  foreground: string;
  bodyStyles: Record<string, string>;
}

export const THEME_CONFIGS: Record<ReaderTheme, ThemeStyles> = {
  light: {
    name: 'light',
    background: '#ffffff',
    foreground: '#1a1a1a',
    bodyStyles: {
      background: '#ffffff',
      color: '#1a1a1a',
      'font-family': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'line-height': '1.6',
    },
  },
  sepia: {
    name: 'sepia',
    background: '#fbf0d9',
    foreground: '#5f4b32',
    bodyStyles: {
      background: '#fbf0d9',
      color: '#5f4b32',
      'font-family': 'Georgia, serif',
      'line-height': '1.6',
    },
  },
  dark: {
    name: 'dark',
    background: '#121212',
    foreground: '#e0e0e0',
    bodyStyles: {
      background: '#121212',
      color: '#e0e0e0',
      'font-family': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'line-height': '1.6',
    },
  },
};

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 28;
export const DEFAULT_FONT_SIZE = 16;

/**
 * Extracts a page number from a PDF pseudo-CFI string (e.g. "page:42" -> 42).
 */
export function parsePageFromCfi(cfi?: string | null): number | null {
  if (!cfi) return null;
  const match = cfi.match(/^page:(\d+)$/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Formats a page number into a standardized PDF pseudo-CFI string.
 */
export function formatPageCfi(page: number): string {
  return `page:${Math.max(1, Math.round(page))}`;
}

/**
 * Calculates reading completion percentage from page numbers.
 */
export function calculatePagePercentage(currentPage: number, totalPages: number): number {
  if (totalPages <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((currentPage / totalPages) * 100)));
}

/**
 * Clamps font size within allowed bounds [12px, 28px].
 */
export function clampFontSize(size: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
}

/**
 * Creates a debounced callback function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDebouncedFn<T extends (...args: any[]) => void>(
  callback: T,
  delayMs: number
): { fn: (...args: Parameters<T>) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fn = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      callback(...args);
      timer = null;
    }, delayMs);
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { fn, cancel };
}

export interface ProgressData {
  cfi: string;
  percentage: number;
}

export interface ProgressSyncManagerOptions {
  onSave: (data: ProgressData) => Promise<unknown>;
  debounceMs?: number;
}

export interface ProgressSyncManager {
  schedule: (cfi: string, percentage: number) => void;
  flush: () => Promise<void>;
  cancel: () => void;
  hasPending: () => boolean;
  getLatestSeq: () => number;
  getLastSavedSeq: () => number;
}

/**
 * Creates a robust reading progress synchronization manager that:
 * 1. Debounces rapid progress updates during active page navigation.
 * 2. Uses monotonic sequence IDs to prevent out-of-order save race conditions.
 * 3. Provides synchronous/async flush capability on component unmount and page visibility change.
 */
export function createProgressSyncManager(
  options: ProgressSyncManagerOptions
): ProgressSyncManager {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestSeq = 0;
  let lastSavedSeq = 0;
  let pendingData: (ProgressData & { seq: number }) | null = null;

  const flush = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (!pendingData || pendingData.seq <= lastSavedSeq) {
      return;
    }

    const currentToSave = pendingData;
    try {
      await options.onSave({
        cfi: currentToSave.cfi,
        percentage: currentToSave.percentage,
      });
      if (currentToSave.seq > lastSavedSeq) {
        lastSavedSeq = currentToSave.seq;
      }
    } catch (err) {
      console.warn('Failed to save reading progress:', err);
    }
  };

  const schedule = (cfi: string, percentage: number): void => {
    const seq = ++latestSeq;
    pendingData = { cfi, percentage, seq };

    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void flush();
    }, options.debounceMs ?? 800);
  };

  const cancel = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const hasPending = (): boolean =>
    Boolean(pendingData && pendingData.seq > lastSavedSeq);

  return {
    schedule,
    flush,
    cancel,
    hasPending,
    getLatestSeq: () => latestSeq,
    getLastSavedSeq: () => lastSavedSeq,
  };
}

export interface PdfTextItem {
  str: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HighlightMatchOptions {
  occurrenceIndex?: number;
  matchAll?: boolean;
}

export interface TextItemCharSource {
  itemIndex: number;
  charIndex: number;
}

export interface MappedNormalizedText {
  text: string;
  sourceMap: Array<TextItemCharSource | null>;
}

/**
 * Normalizes text for robust highlight matching across EPUB/PDF selections.
 * Normalizes curly/smart quotes, dashes, collapses whitespace, and lowercases.
 */
export function normalizeReaderText(str: string): string {
  return str
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u200B\uFEFF\u200C\u200D\u00AD]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Checks if two text items or bounding boxes belong to the same visual reading line.
 * Uses adaptive vertical overlap and midpoint alignment instead of fixed pixel thresholds.
 */
export function areRectsOnSameLine(
  a: { top: number; height: number },
  b: { top: number; height: number }
): boolean {
  const bottomA = a.top + a.height;
  const bottomB = b.top + b.height;

  const overlapTop = Math.max(a.top, b.top);
  const overlapBottom = Math.min(bottomA, bottomB);
  const verticalOverlap = overlapBottom - overlapTop;

  const minHeight = Math.min(a.height, b.height);
  if (minHeight <= 0) return Math.abs(a.top - b.top) <= 4;

  const overlapRatio = verticalOverlap / minHeight;
  if (overlapRatio >= 0.45) {
    return true;
  }

  const midA = a.top + a.height / 2;
  const midB = b.top + b.height / 2;
  const midDiff = Math.abs(midA - midB);
  const allowedMidDiff = Math.max(4, minHeight * 0.4);

  return verticalOverlap > 0 && midDiff <= allowedMidDiff;
}

/**
 * Sorts PDF text items into authentic visual reading order.
 * Handles:
 * 1. Single-column reading with adaptive line grouping (resilient to baseline jitter and subscripts)
 * 2. Multi-column layout detection (processes left column top-to-bottom before right column)
 * 3. Left-to-right ordering within visual lines
 */
export function sortPdfTextItems<
  T extends { str: string; left: number; top: number; width: number; height: number }
>(items: T[]): T[] {
  if (items.length <= 1) return [...items];

  // 1. Detect multi-column layout if present
  const columns = partitionIntoColumns(items);
  const sortedResult: T[] = [];

  for (const colItems of columns) {
    // Pre-sort by top then left to ensure deterministic top-down line bucket creation
    const sortedByTop = [...colItems].sort((a, b) => a.top - b.top || a.left - b.left);

    interface LineBucket {
      top: number;
      bottom: number;
      height: number;
      items: T[];
    }

    const lines: LineBucket[] = [];

    for (const it of sortedByTop) {
      const itBottom = it.top + it.height;
      const matchedLine = lines.find((l) =>
        areRectsOnSameLine(
          { top: l.top, height: l.height },
          { top: it.top, height: it.height }
        )
      );

      if (matchedLine) {
        matchedLine.items.push(it);
        matchedLine.top = Math.min(matchedLine.top, it.top);
        matchedLine.bottom = Math.max(matchedLine.bottom, itBottom);
        matchedLine.height = matchedLine.bottom - matchedLine.top;
      } else {
        lines.push({
          top: it.top,
          bottom: itBottom,
          height: it.height,
          items: [it],
        });
      }
    }

    // Sort lines top to bottom
    lines.sort((a, b) => a.top - b.top);

    // Within each line, sort left to right
    for (const line of lines) {
      line.items.sort((a, b) => a.left - b.left);
      sortedResult.push(...line.items);
    }
  }

  return sortedResult;
}

/**
 * Detects if a set of PDF text items is partitioned into distinct vertical columns.
 * Returns partitioned item arrays: headers (if any), column 1, column 2, footers (if any).
 * If no clear multi-column structure exists, returns single array [items].
 */
function partitionIntoColumns<
  T extends { left: number; top: number; width: number; height: number }
>(items: T[]): T[][] {
  if (items.length < 6) return [items];

  let minLeft = Infinity;
  let maxRight = -Infinity;
  for (const it of items) {
    minLeft = Math.min(minLeft, it.left);
    maxRight = Math.max(maxRight, it.left + it.width);
  }

  const pageWidth = maxRight - minLeft;
  // A true multi-column page or section requires meaningful width and substantial gutter
  if (pageWidth < 250) return [items];

  const midX = minLeft + pageWidth / 2;
  const minGutterWidth = Math.max(20, pageWidth * 0.05);
  const gutterLeft = midX - minGutterWidth / 2;
  const gutterRight = midX + minGutterWidth / 2;

  const leftCol: T[] = [];
  const rightCol: T[] = [];
  const middleItems: T[] = [];

  for (const it of items) {
    const itRight = it.left + it.width;
    if (itRight <= gutterLeft) {
      leftCol.push(it);
    } else if (it.left >= gutterRight) {
      rightCol.push(it);
    } else {
      middleItems.push(it);
    }
  }

  // Both columns must have at least 3 items
  if (leftCol.length < 3 || rightCol.length < 3) {
    return [items];
  }

  const colMinTop = Math.min(
    Math.min(...leftCol.map((i) => i.top)),
    Math.min(...rightCol.map((i) => i.top))
  );
  const colMaxBottom = Math.max(
    Math.max(...leftCol.map((i) => i.top + i.height)),
    Math.max(...rightCol.map((i) => i.top + i.height))
  );

  const headerItems: T[] = [];
  const footerItems: T[] = [];

  for (const it of middleItems) {
    if (it.top + it.height <= colMinTop + 10) {
      headerItems.push(it);
    } else if (it.top >= colMaxBottom - 10) {
      footerItems.push(it);
    } else {
      // Middle item crosses the gutter inside the body area: this is a single continuous flow
      return [items];
    }
  }

  // Verify that the actual gap between leftCol and rightCol is >= minGutterWidth
  const leftMaxRight = Math.max(...leftCol.map((i) => i.left + i.width));
  const rightMinLeft = Math.min(...rightCol.map((i) => i.left));
  if (rightMinLeft - leftMaxRight < minGutterWidth) {
    return [items];
  }

  const partitions: T[][] = [];
  if (headerItems.length > 0) partitions.push(headerItems);
  partitions.push(leftCol);
  partitions.push(rightCol);
  if (footerItems.length > 0) partitions.push(footerItems);
  return partitions;
}

/**
 * Builds a normalized, continuous text stream while maintaining a 1:1 source mapping
 * between every character index in the normalized stream and the original PDF text items.
 *
 * Prevents:
 * 1. False space insertion when PDF kerning or syllable breaks split words across items.
 * 2. Missing spaces between distinct words separated by horizontal whitespace.
 * 3. False cross-boundary matches across unrelated columns or large vertical gaps.
 */
export function buildMappedNormalizedText(
  items: Array<{ str: string; left: number; top: number; width: number; height: number; fontSize?: number }>
): MappedNormalizedText {
  let text = '';
  const sourceMap: Array<TextItemCharSource | null> = [];

  let lastItemIdx = -1;

  for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
    const rawStr = items[itemIdx]?.str;
    if (!rawStr) continue;

    // Check relationship with previous non-empty item to determine boundary
    if (lastItemIdx >= 0 && text.length > 0) {
      const prev = items[lastItemIdx];
      const curr = items[itemIdx];
      const prevEndsWithSpace = /\s$/.test(prev.str);
      const currStartsWithSpace = /^\s/.test(curr.str);

      if (!prevEndsWithSpace && !currStartsWithSpace && !text.endsWith(' ') && !text.endsWith('\u0000')) {
        const prevHasGeo =
          typeof prev.left === 'number' &&
          typeof prev.top === 'number' &&
          !isNaN(prev.left) &&
          !isNaN(prev.top);
        const currHasGeo =
          typeof curr.left === 'number' &&
          typeof curr.top === 'number' &&
          !isNaN(curr.left) &&
          !isNaN(curr.top);

        if (!prevHasGeo || !currHasGeo) {
          // Fallback when geometry is missing or unreliable
          text += ' ';
          sourceMap.push(null);
        } else {
          const fontSize = Math.min(prev.height || 14, curr.height || 14) || 14;
          const onSameLine = areRectsOnSameLine(
            { top: prev.top, height: prev.height || fontSize },
            { top: curr.top, height: curr.height || fontSize }
          );

          if (onSameLine) {
            const prevRight = prev.left + prev.width;
            const horizontalGap = curr.left - prevRight;
            const minWordGap = Math.min(3.5, Math.max(1.5, fontSize * 0.08));
            const maxColumnGutter = Math.max(35, fontSize * 2.5);

            if (horizontalGap > maxColumnGutter || horizontalGap < -fontSize * 2) {
              // Disjoint columns or reading regions on the same line: insert region boundary marker
              text += '\u0000';
              sourceMap.push(null);
            } else if (horizontalGap > minWordGap) {
              // Normal inter-word gap on the same line: insert single space
              text += ' ';
              sourceMap.push(null);
            }
            // If horizontalGap <= minWordGap: part of the same word (e.g. kerning/syllable split)!
            // Do NOT insert space so split words remain contiguous.
          } else {
            // Items on different lines
            const verticalGap = curr.top - (prev.top + (prev.height || fontSize));
            const isVerticalDiscontinuity =
              verticalGap >= fontSize * 2.2 || curr.top < prev.top - fontSize * 1.5;

            if (isVerticalDiscontinuity) {
              // Section break, column jump, or header/footer boundary
              text += '\u0000';
              sourceMap.push(null);
            } else if (!prev.str.trimEnd().endsWith('-')) {
              // Normal line wrap: insert space
              text += ' ';
              sourceMap.push(null);
            }
          }
        }
      }
    }

    for (let charIdx = 0; charIdx < rawStr.length; charIdx++) {
      const ch = rawStr[charIdx];

      // Skip zero-width control characters
      if (/[\u200B\uFEFF\u200C\u200D\u00AD]/.test(ch)) {
        continue;
      }

      let normChar = ch.toLowerCase();

      if (normChar === '\u2018' || normChar === '\u2019' || normChar === '\u201A' || normChar === '\u201B') {
        normChar = "'";
      } else if (normChar === '\u201C' || normChar === '\u201D' || normChar === '\u201E' || normChar === '\u201F') {
        normChar = '"';
      } else if (normChar === '\u2013' || normChar === '\u2014' || normChar === '\u2212') {
        normChar = '-';
      } else if (/\s/.test(normChar)) {
        normChar = ' ';
      }

      // Collapse consecutive whitespace
      if (normChar === ' ') {
        if (text.length === 0 || text.endsWith(' ') || text.endsWith('\u0000')) {
          continue;
        }
      }

      text += normChar;
      sourceMap.push({ itemIndex: itemIdx, charIndex: charIdx });
    }

    lastItemIdx = itemIdx;
  }

  return { text, sourceMap };
}

/**
 * Merges adjacent text rects on the same line into unified highlight rectangles.
 * Adapts to text geometry/font height and clusters contiguous words while preserving
 * distinct boxes for disjoint segments across columns or gaps.
 */
export function mergeHighlightRects(
  items: Array<{ left: number; top: number; width: number; height: number }>
): HighlightRect[] {
  if (items.length === 0) return [];

  interface LineGroup {
    top: number;
    bottom: number;
    height: number;
    items: Array<{ left: number; top: number; width: number; height: number }>;
  }

  const lines: LineGroup[] = [];

  for (const it of items) {
    const itBottom = it.top + it.height;
    const line = lines.find((l) =>
      areRectsOnSameLine(
        { top: l.top, height: l.height },
        { top: it.top, height: it.height }
      )
    );

    if (line) {
      line.items.push(it);
      line.top = Math.min(line.top, it.top);
      line.bottom = Math.max(line.bottom, itBottom);
      line.height = line.bottom - line.top;
    } else {
      lines.push({
        top: it.top,
        bottom: itBottom,
        height: it.height,
        items: [it],
      });
    }
  }

  // Sort lines from top to bottom
  lines.sort((a, b) => a.top - b.top);

  const result: HighlightRect[] = [];

  for (const line of lines) {
    line.items.sort((a, b) => a.left - b.left);

    let clusterStart = line.items[0].left;
    let clusterEnd = line.items[0].left + line.items[0].width;
    let clusterTop = line.items[0].top;
    let clusterBottom = line.items[0].top + line.items[0].height;

    const maxAllowedGap = Math.max(25, line.height * 1.5);

    for (let i = 1; i < line.items.length; i++) {
      const it = line.items[i];
      const itRight = it.left + it.width;

      if (it.left - clusterEnd <= maxAllowedGap) {
        // Contiguous item on the same line
        clusterEnd = Math.max(clusterEnd, itRight);
        clusterTop = Math.min(clusterTop, it.top);
        clusterBottom = Math.max(clusterBottom, it.top + it.height);
      } else {
        // Disjoint segment on the same line (e.g. multi-column or separate highlight)
        result.push({
          left: Math.round(clusterStart),
          top: Math.round(clusterTop),
          width: Math.max(8, Math.round(clusterEnd - clusterStart)),
          height: Math.max(8, Math.round(clusterBottom - clusterTop)),
        });

        clusterStart = it.left;
        clusterEnd = itRight;
        clusterTop = it.top;
        clusterBottom = it.top + it.height;
      }
    }

    result.push({
      left: Math.round(clusterStart),
      top: Math.round(clusterTop),
      width: Math.max(8, Math.round(clusterEnd - clusterStart)),
      height: Math.max(8, Math.round(clusterBottom - clusterTop)),
    });
  }

  return result;
}

/**
 * Finds highlight coordinates matching an annotation's saved quote on a PDF page.
 * Uses a character-level source map to only return highlight rectangles when a
 * contiguous, defensible text match is found. Avoids speculative fallback matching.
 */
export function findHighlightRects(
  items: Array<{ str: string; left: number; top: number; width: number; height: number; fontSize?: number }>,
  highlightedText: string,
  options?: HighlightMatchOptions
): HighlightRect[] {
  if (!items || items.length === 0 || !highlightedText) return [];

  const target = normalizeReaderText(highlightedText);
  if (!target) return [];

  // Guarantee production visual reading order before mapping text stream
  const sortedItems = sortPdfTextItems(items);

  const { text: streamText, sourceMap } = buildMappedNormalizedText(sortedItems);
  if (!streamText) return [];

  // Find all match occurrences of the target string
  const matchIndices: number[] = [];
  let pos = 0;
  while (pos < streamText.length) {
    const idx = streamText.indexOf(target, pos);
    if (idx === -1) break;
    matchIndices.push(idx);
    pos = idx + 1;
  }

  if (matchIndices.length === 0) {
    // Only return highlight rectangles when a contiguous, defensible text match is found.
    // Speculative or partial matching is strictly omitted to avoid false highlights.
    return [];
  }

  // Select target matches based on options
  let selectedStarts: number[] = [];
  if (options?.matchAll) {
    selectedStarts = matchIndices;
  } else if (options?.occurrenceIndex !== undefined) {
    if (options.occurrenceIndex >= 0 && options.occurrenceIndex < matchIndices.length) {
      selectedStarts = [matchIndices[options.occurrenceIndex]];
    } else {
      return [];
    }
  } else {
    // Default: first occurrence
    selectedStarts = [matchIndices[0]];
  }

  const rectsToMerge: Array<{ left: number; top: number; width: number; height: number }> = [];

  for (const matchStart of selectedStarts) {
    const matchEnd = matchStart + target.length; // exclusive

    // Gather items touched and their character bounds
    const touchedItems = new Map<number, { minChar: number; maxChar: number }>();

    for (let i = matchStart; i < matchEnd; i++) {
      const src = sourceMap[i];
      if (!src) continue;
      const existing = touchedItems.get(src.itemIndex);
      if (existing) {
        existing.minChar = Math.min(existing.minChar, src.charIndex);
        existing.maxChar = Math.max(existing.maxChar, src.charIndex);
      } else {
        touchedItems.set(src.itemIndex, { minChar: src.charIndex, maxChar: src.charIndex });
      }
    }

    touchedItems.forEach((bounds, itemIdx) => {
      const it = sortedItems[itemIdx];
      const strLen = it.str.length || 1;

      // If the match encompasses the whole item string (or nearly all of it)
      if (bounds.minChar <= 0 && bounds.maxChar >= strLen - 1) {
        rectsToMerge.push({
          left: it.left,
          top: it.top,
          width: it.width,
          height: it.height,
        });
      } else {
        /**
         * LIMITATION & RECTANGLE APPROXIMATION:
         * PDF.js TextItem provides the bounding box transform and total advance width
         * for the whole text item, but does not provide per-character glyph advances.
         * For partial-item matches (e.g. selecting a sub-phrase within a long text run),
         * we compute horizontal coordinates using proportional character count interpolation.
         * While highly reliable for multi-character selections, proportional slicing on
         * proportional (variable-width) fonts is an approximation rather than pixel-perfect
         * glyph tracking. We clamp to conservative boundaries.
         */
        const startRatio = Math.max(0, bounds.minChar / strLen);
        const endRatio = Math.min(1, (bounds.maxChar + 1) / strLen);
        const subLeft = it.left + it.width * startRatio;
        const subWidth = Math.max(4, it.width * (endRatio - startRatio));

        rectsToMerge.push({
          left: subLeft,
          top: it.top,
          width: subWidth,
          height: it.height,
        });
      }
    });
  }

  return mergeHighlightRects(rectsToMerge);
}
