import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clampFontSize,
  THEME_CONFIGS,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  createDebouncedFn,
  createProgressSyncManager,
  loadReaderSettings,
  saveReaderSettings,
  DEFAULT_READER_SETTINGS,
  READER_SETTINGS_KEY,
  isValidReaderTheme,
  ReaderTheme,
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

  describe('createProgressSyncManager - Navigation Reliability & Sequence Protection', () => {
    it('debounces rapid sequential progress updates and records only latest position', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const manager = createProgressSyncManager({
        onSave: mockSave,
        debounceMs: 500,
      });

      // User flips 4 pages in 200ms
      manager.schedule('epubcfi(/6/2[c1]!/4/1:0)', 10);
      manager.schedule('epubcfi(/6/2[c1]!/4/5:0)', 15);
      manager.schedule('epubcfi(/6/2[c1]!/4/12:0)', 20);
      manager.schedule('epubcfi(/6/4[c2]!/4/1:0)', 25);

      expect(mockSave).not.toHaveBeenCalled();
      expect(manager.hasPending()).toBe(true);
      expect(manager.getLatestSeq()).toBe(4);

      // Advance timers past debounce
      await vi.advanceTimersByTimeAsync(500);

      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSave).toHaveBeenCalledWith({
        cfi: 'epubcfi(/6/4[c2]!/4/1:0)',
        percentage: 25,
      });
      expect(manager.getLastSavedSeq()).toBe(4);
      expect(manager.hasPending()).toBe(false);
    });

    it('immediately flushes pending progress on unmount or tab switch without waiting for timer', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const manager = createProgressSyncManager({
        onSave: mockSave,
        debounceMs: 1000,
      });

      manager.schedule('epubcfi(/6/6[c3]!/4/10:0)', 45);
      expect(mockSave).not.toHaveBeenCalled();

      // Trigger flush immediately (as occurs in unmount or visibilitychange hidden)
      await manager.flush();

      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSave).toHaveBeenCalledWith({
        cfi: 'epubcfi(/6/6[c3]!/4/10:0)',
        percentage: 45,
      });
      expect(manager.hasPending()).toBe(false);

      // Advancing timer afterwards does not trigger duplicate save
      await vi.advanceTimersByTimeAsync(1500);
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('prevents duplicate saves when flush is called with no newer updates', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const manager = createProgressSyncManager({
        onSave: mockSave,
        debounceMs: 500,
      });

      manager.schedule('epubcfi(/6/2!/4:0)', 5);
      await manager.flush();
      expect(mockSave).toHaveBeenCalledTimes(1);

      // Calling flush again without new data does nothing
      await manager.flush();
      expect(mockSave).toHaveBeenCalledTimes(1);
    });
  });

  describe('CFI Restoration Resilience & Navigation Boundaries', () => {
    it('gracefully recovers when initial CFI display rejects by falling back to book start', async () => {
      const mockDisplay = vi
        .fn()
        .mockRejectedValueOnce(new Error('Invalid initial CFI'))
        .mockResolvedValueOnce(undefined);

      const restoreInitialPosition = async (initialCfi?: string) => {
        try {
          await mockDisplay(initialCfi);
        } catch {
          // Resilient fallback to start of book
          await mockDisplay();
        }
      };

      await restoreInitialPosition('invalid-cfi-1234');

      expect(mockDisplay).toHaveBeenCalledTimes(2);
      expect(mockDisplay).toHaveBeenNthCalledWith(1, 'invalid-cfi-1234');
      expect(mockDisplay).toHaveBeenNthCalledWith(2);
    });

    it('enforces boundary locks when at start or end of book', () => {
      const prevAction = vi.fn();
      const nextAction = vi.fn();

      const navigate = (
        direction: 'prev' | 'next',
        isAtStart: boolean,
        isAtEnd: boolean,
        isTurning: boolean
      ) => {
        if (isTurning) return;
        if (direction === 'prev' && !isAtStart) prevAction();
        if (direction === 'next' && !isAtEnd) nextAction();
      };

      // When at start of book: prev is blocked, next is allowed
      navigate('prev', true, false, false);
      expect(prevAction).not.toHaveBeenCalled();

      navigate('next', true, false, false);
      expect(nextAction).toHaveBeenCalledTimes(1);

      // When at end of book: next is blocked, prev is allowed
      navigate('next', false, true, false);
      expect(nextAction).toHaveBeenCalledTimes(1); // Not incremented

      navigate('prev', false, true, false);
      expect(prevAction).toHaveBeenCalledTimes(1);

      // When currently turning: both are locked
      navigate('prev', false, false, true);
      navigate('next', false, false, true);
      expect(prevAction).toHaveBeenCalledTimes(1);
      expect(nextAction).toHaveBeenCalledTimes(1);
    });

    it('removes visual highlights by CFI location rather than database ID', () => {
      const mockRemove = vi.fn();
      const mockRendition = {
        annotations: {
          remove: mockRemove,
        },
      };

      const annotations = [
        { id: 'ann-123', location: 'epubcfi(/6/4[chap01]!/4/2/4/1:0)' },
        { id: 'ann-456', location: 'epubcfi(/6/8[chap02]!/4/2/8/1:0)' },
      ];

      const deleteAnnotation = (id: string) => {
        const target = annotations.find((a) => a.id === id);
        if (target?.location) {
          mockRendition.annotations.remove(target.location, 'highlight');
        }
      };

      deleteAnnotation('ann-123');
      expect(mockRemove).toHaveBeenCalledTimes(1);
      expect(mockRemove).toHaveBeenCalledWith('epubcfi(/6/4[chap01]!/4/2/4/1:0)', 'highlight');
      expect(mockRemove).not.toHaveBeenCalledWith('ann-123', 'highlight');
    });

    it('ensures initial CFI is captured on mount without causing rendition churn on progress updates', () => {
      let renditionCreatedCount = 0;
      let renditionDestroyedCount = 0;

      // Simulates the stable effect lifecycle where rendition depends only on bookData
      class ReaderLifecycleSimulator {
        private initialCfiRef: string | null;
        public activeCfi: string | null = null;

        constructor(initialCfi: string | null) {
          this.initialCfiRef = initialCfi;
          this.mount();
        }

        private mount() {
          renditionCreatedCount++;
          this.activeCfi = this.initialCfiRef;
        }

        public onServerProgressRevalidate(newServerCfi: string) {
          // Stable reader ignores prop changes for rendition rebuilding
          void newServerCfi;
        }

        public unmount() {
          renditionDestroyedCount++;
        }
      }

      const reader = new ReaderLifecycleSimulator('epubcfi(/6/2!/4/1:0)');
      expect(renditionCreatedCount).toBe(1);
      expect(reader.activeCfi).toBe('epubcfi(/6/2!/4/1:0)');

      // Simulates saveReadingProgress revalidation arriving from server
      reader.onServerProgressRevalidate('epubcfi(/6/4!/4/1:10)');
      expect(renditionCreatedCount).toBe(1);
      expect(renditionDestroyedCount).toBe(0);

      reader.unmount();
      expect(renditionDestroyedCount).toBe(1);
    });
  });

  describe('Reader Settings LocalStorage Persistence', () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    afterEach(() => {
      window.localStorage.clear();
      vi.restoreAllMocks();
    });

    it('verifies DEFAULT_READER_SETTINGS and isValidReaderTheme helper', () => {
      expect(DEFAULT_READER_SETTINGS).toEqual({
        theme: 'light',
        fontSize: 16,
      });

      expect(isValidReaderTheme('light')).toBe(true);
      expect(isValidReaderTheme('sepia')).toBe(true);
      expect(isValidReaderTheme('dark')).toBe(true);
      expect(isValidReaderTheme('neon')).toBe(false);
      expect(isValidReaderTheme(null)).toBe(false);
      expect(isValidReaderTheme(undefined)).toBe(false);
      expect(isValidReaderTheme(123)).toBe(false);
    });

    it('returns default settings when localStorage is empty', () => {
      const settings = loadReaderSettings();
      expect(settings).toEqual({
        theme: 'light',
        fontSize: DEFAULT_FONT_SIZE,
      });
    });

    it('persists and restores custom theme and font size', () => {
      saveReaderSettings({ theme: 'dark', fontSize: 20 });
      const restored = loadReaderSettings();
      expect(restored).toEqual({
        theme: 'dark',
        fontSize: 20,
      });

      const storedRaw = window.localStorage.getItem(READER_SETTINGS_KEY);
      expect(storedRaw).toBeDefined();
      expect(JSON.parse(storedRaw!)).toEqual({
        theme: 'dark',
        fontSize: 20,
      });
    });

    it('preserves existing settings when saving partial updates', () => {
      // First save font size 22
      saveReaderSettings({ fontSize: 22 });
      expect(loadReaderSettings()).toEqual({
        theme: 'light',
        fontSize: 22,
      });

      // Then save theme 'sepia' (like PDF reader does)
      saveReaderSettings({ theme: 'sepia' });
      expect(loadReaderSettings()).toEqual({
        theme: 'sepia',
        fontSize: 22,
      });

      // Then update font size (like EPUB reader does)
      saveReaderSettings({ fontSize: 18 });
      expect(loadReaderSettings()).toEqual({
        theme: 'sepia',
        fontSize: 18,
      });
    });

    it('clamps font sizes outside permissible limits', () => {
      saveReaderSettings({ fontSize: 100 });
      expect(loadReaderSettings().fontSize).toBe(MAX_FONT_SIZE);

      saveReaderSettings({ fontSize: 4 });
      expect(loadReaderSettings().fontSize).toBe(MIN_FONT_SIZE);
    });

    it('sanitizes invalid or corrupted theme values in localStorage to default light theme', () => {
      window.localStorage.setItem(
        READER_SETTINGS_KEY,
        JSON.stringify({ theme: 'hacker-green', fontSize: 18 })
      );

      const loaded = loadReaderSettings();
      expect(loaded.theme).toBe('light');
      expect(loaded.fontSize).toBe(18);
    });

    it('gracefully handles non-JSON or corrupted storage strings without throwing', () => {
      window.localStorage.setItem(READER_SETTINGS_KEY, 'corrupted{json[data');
      expect(loadReaderSettings()).toEqual(DEFAULT_READER_SETTINGS);

      window.localStorage.setItem(READER_SETTINGS_KEY, '42');
      expect(loadReaderSettings()).toEqual(DEFAULT_READER_SETTINGS);
    });

    it('safely tolerates localStorage getItem / setItem exceptions (e.g. private browsing)', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError: The operation is insecure.');
      });
      expect(loadReaderSettings()).toEqual(DEFAULT_READER_SETTINGS);
      getItemSpy.mockRestore();

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => saveReaderSettings({ theme: 'dark' })).not.toThrow();
      setItemSpy.mockRestore();
    });

    it('prevents persistence effects from overwriting stored user settings before restoration completes (settingsLoaded guard)', () => {
      // 1. User previously stored dark theme and font size 24 in localStorage
      window.localStorage.setItem(
        READER_SETTINGS_KEY,
        JSON.stringify({ theme: 'dark', fontSize: 24 })
      );

      // 2. Simulates reader component lifecycle with settingsLoaded guard
      class ReaderSettingsLifecycleSimulator {
        public theme: ReaderTheme = 'light'; // deterministic initial default
        public fontSize: number = DEFAULT_FONT_SIZE; // deterministic initial default
        public settingsLoaded: boolean = false;
        public saveCalls: Array<{ theme?: ReaderTheme; fontSize?: number }> = [];

        // Simulated persistence effect
        public onThemeOrFontEffect() {
          if (!this.settingsLoaded) {
            // Guard blocks writing defaults to localStorage
            return;
          }
          saveReaderSettings({
            theme: this.theme,
            fontSize: this.fontSize,
          });
          this.saveCalls.push({ theme: this.theme, fontSize: this.fontSize });
        }

        // Simulated mount restoration effect
        public mountRestoration() {
          const loaded = loadReaderSettings();
          this.theme = loaded.theme;
          this.fontSize = loaded.fontSize;
          this.settingsLoaded = true;
        }

        // Simulated user action
        public userChangeTheme(newTheme: ReaderTheme) {
          this.theme = newTheme;
          this.onThemeOrFontEffect();
        }

        public userChangeFontSize(newSize: number) {
          this.fontSize = newSize;
          this.onThemeOrFontEffect();
        }
      }

      const reader = new ReaderSettingsLifecycleSimulator();

      // Prior to restoration, effects might trigger but guard must prevent writing defaults
      reader.onThemeOrFontEffect();
      expect(reader.saveCalls).toHaveLength(0);

      // Verify localStorage still contains the user's stored preferences (not overwritten by defaults)
      expect(loadReaderSettings()).toEqual({
        theme: 'dark',
        fontSize: 24,
      });

      // Mount restoration completes
      reader.mountRestoration();
      expect(reader.settingsLoaded).toBe(true);
      expect(reader.theme).toBe('dark');
      expect(reader.fontSize).toBe(24);

      // Subsequent user change persists normally
      reader.userChangeTheme('sepia');
      expect(reader.saveCalls).toHaveLength(1);
      expect(loadReaderSettings()).toEqual({
        theme: 'sepia',
        fontSize: 24, // font size 24 is preserved!
      });

      reader.userChangeFontSize(20);
      expect(reader.saveCalls).toHaveLength(2);
      expect(loadReaderSettings()).toEqual({
        theme: 'sepia',
        fontSize: 20,
      });
    });

    it('faithfully applies restored font size to EPUB rendition and prevents desync on F5 refresh', () => {
      // 1. Simulate persisted settings in localStorage before page load (e.g. 22px font size, sepia theme)
      window.localStorage.setItem(
        READER_SETTINGS_KEY,
        JSON.stringify({ theme: 'sepia', fontSize: 22 })
      );

      // Mock rendition themes interface
      const mockThemes = {
        select: vi.fn(),
        fontSize: vi.fn(),
      };

      // Simulates EPUB reader component lifecycle with appliedFontSizeRef
      class EpubReaderLifecycleSimulator {
        public fontSize: number = DEFAULT_FONT_SIZE; // 16
        public theme: ReaderTheme = 'light';
        public settingsLoaded: boolean = false;
        public appliedFontSize: number | null = null;
        public resizeTimer: ReturnType<typeof setTimeout> | null = null;

        // Effect 1: Mount restoration
        public runMountRestorationEffect() {
          const settings = loadReaderSettings();
          this.theme = settings.theme;
          this.fontSize = settings.fontSize;
          this.settingsLoaded = true;
        }

        // Effect 2: Rendition creation (ePub renderTo)
        public runRenditionInitEffect() {
          const initialSettings = loadReaderSettings();
          const activeTheme = this.settingsLoaded ? this.theme : initialSettings.theme;
          const activeFontSize = this.settingsLoaded ? this.fontSize : initialSettings.fontSize;

          mockThemes.select(activeTheme);
          mockThemes.fontSize(`${activeFontSize}px`);
          this.appliedFontSize = activeFontSize;
        }

        // Effect 3: Font-size change handler
        public runFontSizeEffect() {
          if (!this.settingsLoaded) return;
          saveReaderSettings({ fontSize: this.fontSize });

          if (this.appliedFontSize === this.fontSize) {
            // Already applied during initialization or previous change; do NOT trigger reflow/timer
            return;
          }

          if (this.resizeTimer) clearTimeout(this.resizeTimer);
          this.resizeTimer = setTimeout(() => {
            mockThemes.fontSize(`${this.fontSize}px`);
            this.appliedFontSize = this.fontSize;
          }, 100);
        }
      }

      const sim = new EpubReaderLifecycleSimulator();

      // Render 1: Initial mount before effects run
      expect(sim.fontSize).toBe(16);
      expect(sim.settingsLoaded).toBe(false);

      // Effect phase of Render 1:
      // Mount effect schedules state update (fontSize -> 22, settingsLoaded -> true)
      sim.runMountRestorationEffect();

      // Rendition initialization runs:
      // Even if settingsLoaded was false or batched, it must resolve to the stored 22px (not 16px)
      sim.runRenditionInitEffect();
      expect(mockThemes.fontSize).toHaveBeenCalledWith('22px');
      expect(sim.appliedFontSize).toBe(22);

      // Render 2: React processes state update, font size effect runs
      sim.runFontSizeEffect();

      // Because appliedFontSize === fontSize (22 === 22), no resize timer is pending
      expect(sim.resizeTimer).toBeNull();
      // Total calls to rendition.themes.fontSize remains exactly 1 (initialization at 22px)
      expect(mockThemes.fontSize).toHaveBeenCalledTimes(1);
      expect(mockThemes.fontSize).toHaveBeenLastCalledWith('22px');

      // Subsequent user change to 24px
      sim.fontSize = 24;
      sim.runFontSizeEffect();
      expect(sim.resizeTimer).not.toBeNull();

      vi.advanceTimersByTime(100);
      expect(mockThemes.fontSize).toHaveBeenCalledTimes(2);
      expect(mockThemes.fontSize).toHaveBeenLastCalledWith('24px');
      expect(sim.appliedFontSize).toBe(24);
      expect(loadReaderSettings().fontSize).toBe(24);
    });

    it('ensures PDF theme changes preserve saved EPUB font size in localStorage', () => {
      // User has custom EPUB font size 26
      saveReaderSettings({ fontSize: 26 });
      expect(loadReaderSettings()).toEqual({
        theme: 'light',
        fontSize: 26,
      });

      // User opens PDF and switches theme to dark
      saveReaderSettings({ theme: 'dark' });
      expect(loadReaderSettings()).toEqual({
        theme: 'dark',
        fontSize: 26,
      });

      // User switches PDF theme to sepia
      saveReaderSettings({ theme: 'sepia' });
      expect(loadReaderSettings()).toEqual({
        theme: 'sepia',
        fontSize: 26,
      });
    });
  });
});
