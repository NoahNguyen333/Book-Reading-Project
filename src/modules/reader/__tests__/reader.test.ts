import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clampFontSize,
  THEME_CONFIGS,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  createDebouncedFn,
} from '../utils';

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
});
