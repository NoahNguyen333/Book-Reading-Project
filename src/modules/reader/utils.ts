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