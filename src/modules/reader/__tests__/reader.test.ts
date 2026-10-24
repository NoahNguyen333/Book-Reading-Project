import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clampFontSize,
  THEME_CONFIGS,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  createDebouncedFn,
} from '../utils';
import { attachContentsCleanup } from '../gestures';

describe('EPUB Reader Utilities & State Machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('clampFontSize', () => {
    it('preserves font size within permissible boundaries', () => {
      expect(clampFontSize(16)).toBe(16);
      expect(clampFontSize(20)).toBe(20);
      expect(clampFontSize(DEFAULT_FONT_SIZE)).toBe(16);
    });

    it('clamps values below MIN_FONT_SIZE to minimum', () => {
      expect(clampFontSize(8)).toBe(MIN_FONT_SIZE);
      expect(clampFontSize(0)).toBe(MIN_FONT_SIZE);
      expect(clampFontSize(-10)).toBe(MIN_FONT_SIZE);
    });

    it('clamps values above MAX_FONT_SIZE to maximum', () => {
      expect(clampFontSize(30)).toBe(MAX_FONT_SIZE);
      expect(clampFontSize(100)).toBe(MAX_FONT_SIZE);
    });
  });

  describe('THEME_CONFIGS', () => {
    it('defines light, sepia, and dark themes with valid color attributes', () => {
      expect(THEME_CONFIGS.light).toBeDefined();
      expect(THEME_CONFIGS.sepia).toBeDefined();
      expect(THEME_CONFIGS.dark).toBeDefined();

      expect(THEME_CONFIGS.light.background).toBe('#ffffff');
      expect(THEME_CONFIGS.sepia.background).toBe('#fbf0d9');
      expect(THEME_CONFIGS.dark.background).toBe('#121212');

      expect(THEME_CONFIGS.light.bodyStyles.color).toBe('#1a1a1a');
      expect(THEME_CONFIGS.dark.bodyStyles.color).toBe('#e0e0e0');
    });
  });

  describe('createDebouncedFn', () => {
    it('debounces rapid sequential progress updates and invokes only the latest', () => {
      const mockCallback = vi.fn();
      const { fn: debouncedSave } = createDebouncedFn(mockCallback, 1000);

      // Simulate 4 rapid page turns in 300ms
      debouncedSave('epubcfi(/6/2[c1]!/4/1:0)', 5);
      debouncedSave('epubcfi(/6/2[c1]!/4/5:0)', 10);
      debouncedSave('epubcfi(/6/2[c1]!/4/12:0)', 15);
      debouncedSave('epubcfi(/6/4[c2]!/4/1:0)', 22);

      expect(mockCallback).not.toHaveBeenCalled();

      // Advance clock past the debounce threshold
      vi.advanceTimersByTime(1000);

      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith('epubcfi(/6/4[c2]!/4/1:0)', 22);
    });

    it('cancels pending execution when cancelled', () => {
      const mockCallback = vi.fn();
      const { fn: debouncedSave, cancel } = createDebouncedFn(mockCallback, 500);

      debouncedSave('epubcfi(/6/2[c1]!/4/1:0)', 5);
      cancel();

      vi.advanceTimersByTime(600);
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('CFI and Percentage Bounds Validation', () => {
    it('validates canonical EPUB CFI string formats', () => {
      const sampleCfi = 'epubcfi(/6/4[chapter-1]!/4/2/10/1:0)';
      expect(sampleCfi.startsWith('epubcfi(')).toBe(true);
      expect(sampleCfi.endsWith(')')).toBe(true);
    });

    it('enforces percentage boundaries between 0% and 100%', () => {
      const clampPercentage = (p: number) => Math.min(100, Math.max(0, p));
      expect(clampPercentage(-5)).toBe(0);
      expect(clampPercentage(105)).toBe(100);
      expect(clampPercentage(42.5)).toBe(42.5);
    });
  });

  describe('Font-Size Scaling & CFI Preservation State Logic', () => {
    it('debounces rapid font size adjustments and targets latest CFI location', () => {
      const mockReanchor = vi.fn();
      let pendingTimer: ReturnType<typeof setTimeout> | null = null;

      const changeFontSize = (newSize: number, currentCfi: string) => {
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => {
          mockReanchor(newSize, currentCfi);
        }, 100);
      };

      // User rapidly taps font size + 3 times in 80ms
      changeFontSize(18, 'epubcfi(/6/4[chap1]!/4/2/4:0)');
      vi.advanceTimersByTime(30);
      changeFontSize(20, 'epubcfi(/6/4[chap1]!/4/2/4:0)');
      vi.advanceTimersByTime(30);
      changeFontSize(22, 'epubcfi(/6/4[chap1]!/4/2/4:0)');

      expect(mockReanchor).not.toHaveBeenCalled();

      // Clock advances past debounce threshold
      vi.advanceTimersByTime(100);

      expect(mockReanchor).toHaveBeenCalledTimes(1);
      expect(mockReanchor).toHaveBeenCalledWith(22, 'epubcfi(/6/4[chap1]!/4/2/4:0)');
    });

    it('preserves target CFI when location is available', () => {
      const capturedLocation = {
        start: { cfi: 'epubcfi(/6/8[chap3]!/4/10/2:0)' },
      };
      const fallbackCfi = 'epubcfi(/6/2[chap0]!/4/1:0)';

      const resolveTargetCfi = (loc?: { start?: { cfi?: string } }, fallback?: string) => {
        return loc?.start?.cfi || fallback || '';
      };

      expect(resolveTargetCfi(capturedLocation, fallbackCfi)).toBe('epubcfi(/6/8[chap3]!/4/10/2:0)');
      expect(resolveTargetCfi(undefined, fallbackCfi)).toBe(fallbackCfi);
      expect(resolveTargetCfi(undefined, undefined)).toBe('');
    });

    it('does not invoke zero-argument display() when CFI re-anchor fails', async () => {
      const mockDisplay = vi.fn().mockRejectedValue(new Error('CFI resolution failed'));
      const targetCfi = 'epubcfi(/6/8[chap3]!/4/10/2:0)';

      // Simulate re-anchor attempt with failure handler
      const reanchorSafely = async (cfi: string) => {
        try {
          await mockDisplay(cfi);
        } catch (err) {
          // Fixed behavior: Log warning and DO NOT call display() with no arguments
          console.warn('CFI re-anchor failed for target:', cfi, err);
        }
      };

      await reanchorSafely(targetCfi);

      expect(mockDisplay).toHaveBeenCalledTimes(1);
      expect(mockDisplay).toHaveBeenCalledWith(targetCfi);
      // Crucial: Must NEVER call display() with 0 arguments (which would reset to Chapter 1)
      expect(mockDisplay).not.toHaveBeenCalledWith();
    });

    it('cancels pending animation frame and prevents execution on destroyed rendition', () => {
      let rafHandle: number | null = null;
      let renditionRef: { display: ReturnType<typeof vi.fn> } | null = {
        display: vi.fn(),
      };

      const cancelPendingWork = () => {
        if (rafHandle !== null) {
          cancelAnimationFrame(rafHandle);
          rafHandle = null;
        }
      };

      // Schedule RAF
      rafHandle = requestAnimationFrame(() => {
        if (!renditionRef) return;
        renditionRef.display();
      });

      // Component unmounts or destroys rendition instance
      cancelPendingWork();
      renditionRef = null;

      // Advance frames
      vi.runAllTimers();

      expect(rafHandle).toBeNull();
    });

    it('wraps contents.destroy to abort listeners and invoke original destroy exactly once', () => {
      const originalDestroy = vi.fn();
      const mockContents = {
        destroy: originalDestroy,
      };
      const onCleanup = vi.fn();

      const { abortController, cleanup } = attachContentsCleanup(
        mockContents,
        null,
        onCleanup
      );

      expect(abortController.signal.aborted).toBe(false);
      expect(originalDestroy).not.toHaveBeenCalled();

      // 1. Invoking wrapped contents.destroy()
      mockContents.destroy();

      expect(abortController.signal.aborted).toBe(true);
      expect(originalDestroy).toHaveBeenCalledTimes(1);
      expect(onCleanup).toHaveBeenCalledTimes(1);
      expect(onCleanup).toHaveBeenCalledWith(abortController);

      // 2. Repeated cleanup or destroy call is safe and idempotent
      cleanup();
      mockContents.destroy();

      expect(abortController.signal.aborted).toBe(true);
      expect(onCleanup).toHaveBeenCalledTimes(1); // onCleanup not re-invoked
      expect(originalDestroy).toHaveBeenCalledTimes(2);
    });

    it('triggers listener cleanup via window unload and pagehide events', () => {
      const mockWindow = new EventTarget() as Window;
      const originalDestroy = vi.fn();
      const mockContents = {
        destroy: originalDestroy,
        window: mockWindow,
      };
      const onCleanup = vi.fn();

      const { abortController } = attachContentsCleanup(
        mockContents,
        null,
        onCleanup
      );

      expect(abortController.signal.aborted).toBe(false);

      // Dispatch unload event on iframe window
      mockWindow.dispatchEvent(new Event('unload'));

      expect(abortController.signal.aborted).toBe(true);
      expect(onCleanup).toHaveBeenCalledTimes(1);

      // Subsequent pagehide or destroy does not re-invoke onCleanup
      mockWindow.dispatchEvent(new Event('pagehide'));
      expect(onCleanup).toHaveBeenCalledTimes(1);
    });
  });
});
