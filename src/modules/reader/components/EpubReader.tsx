'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import ePub, { Book, Rendition, NavItem, Location } from 'epubjs';
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  Bookmark as BookmarkIcon,
  Plus,
  Trash2,
  X,
  ALargeSmall,
  Sun,
  Moon,
  Coffee,
  Check,
  Highlighter,
} from 'lucide-react';
import { Bookmark } from '../types';
import {
  Annotation,
  HighlightColor,
  HIGHLIGHT_COLOR_CONFIGS,
} from '../annotations/types';
import {
  createAnnotationAction,
  deleteAnnotationAction,
} from '../annotations/actions';
import { HighlightContextMenu } from './HighlightContextMenu';
import { AnnotationsSidebar } from './AnnotationsSidebar';
import {
  ReaderTheme,
  THEME_CONFIGS,
  clampFontSize,
  DEFAULT_FONT_SIZE,
  createProgressSyncManager,
  ProgressSyncManager,
} from '../utils';
import {
  classifyTouchGesture,
  injectResilientEpubStyles,
  hasActiveSelection,
  isInteractiveElement,
  attachContentsCleanup,
  TABLET_READER_TOUCH_OPTIONS,
  ReadingDirection,
  resolveNavigationAction,
} from '../gestures';
import { saveReadingProgressAction, addBookmarkAction, deleteBookmarkAction } from '../actions';

interface EpubReaderProps {
  bookData: ArrayBuffer;
  bookId: string;
  tenantId: string;
  initialCfi?: string | null;
  initialBookmarks?: Bookmark[];
  initialAnnotations?: Annotation[];
  bookTitle?: string;
  currentUserId?: string;
  isAdmin?: boolean;
  externalLocation?: string | null;
  onLocationChange?: (location: string, percentage: number) => void;
  disableProgressSave?: boolean;
  onAnnotationCreated?: (annotation: Annotation) => void;
  liveAnnotation?: Annotation | null;
}

export function EpubReader({
  bookData,
  bookId,
  tenantId,
  initialCfi,
  initialBookmarks = [],
  initialAnnotations = [],
  bookTitle,
  currentUserId,
  isAdmin = false,
  externalLocation,
  onLocationChange,
  disableProgressSave = false,
  onAnnotationCreated,
  liveAnnotation,
}: EpubReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;
  const disableProgressSaveRef = useRef(disableProgressSave);
  disableProgressSaveRef.current = disableProgressSave;

  // Reader State
  const [currentCfi, setCurrentCfi] = useState<string>(initialCfi || '');
  const [percentage, setPercentage] = useState<number>(0);
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);
  const [theme, setTheme] = useState<ReaderTheme>('light');
  const [toc, setToc] = useState<NavItem[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(initialBookmarks);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);

  // UI Panels
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [isAnnotationsOpen, setIsAnnotationsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bookmarkLabel, setBookmarkLabel] = useState('');
  const [isAddingBookmark, setIsAddingBookmark] = useState(false);
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);

  // Touch & Swipe gesture refs
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isMultiTouchRef = useRef(false);
  const isTurningRef = useRef(false);

  // Reading direction (LTR default, detects RTL metadata)
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>('ltr');
  const readingDirectionRef = useRef(readingDirection);
  readingDirectionRef.current = readingDirection;

  // Book boundaries
  const [isAtStart, setIsAtStart] = useState(false);
  const [isAtEnd, setIsAtEnd] = useState(false);
  const isAtStartRef = useRef(isAtStart);
  isAtStartRef.current = isAtStart;
  const isAtEndRef = useRef(isAtEnd);
  isAtEndRef.current = isAtEnd;

  const currentCfiRef = useRef(currentCfi);
  currentCfiRef.current = currentCfi;
  const isInitialMountRef = useRef(true);
  const fontResizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fontResizeRafRef = useRef<number | null>(null);
  const contentAbortControllersRef = useRef<Set<AbortController>>(new Set());

  // Page Navigation Handlers with boundary protection and resilient unlock
  const handlePrev = useCallback(() => {
    if (isTurningRef.current) return;
    if (isAtStartRef.current) return;
    isTurningRef.current = true;
    try {
      const res = renditionRef.current?.prev();
      if (res && typeof (res as Promise<void>).catch === 'function') {
        (res as Promise<void>).catch((err) => {
          console.debug('EPUB prev navigation caught:', err);
          isTurningRef.current = false;
        });
      }
    } catch (err) {
      console.debug('EPUB prev navigation exception:', err);
      isTurningRef.current = false;
    }
    setTimeout(() => {
      isTurningRef.current = false;
    }, 350);
  }, []);

  const handleNext = useCallback(() => {
    if (isTurningRef.current) return;
    if (isAtEndRef.current) return;
    isTurningRef.current = true;
    try {
      const res = renditionRef.current?.next();
      if (res && typeof (res as Promise<void>).catch === 'function') {
        (res as Promise<void>).catch((err) => {
          console.debug('EPUB next navigation caught:', err);
          isTurningRef.current = false;
        });
      }
    } catch (err) {
      console.debug('EPUB next navigation exception:', err);
      isTurningRef.current = false;
    }
    setTimeout(() => {
      isTurningRef.current = false;
    }, 350);
  }, []);

  const handlePrevRef = useRef(handlePrev);
  handlePrevRef.current = handlePrev;
  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;

  // In-Reader Text Selection State
  const [selectionState, setSelectionState] = useState<{
    text: string;
    location: string;
    position: { x: number; y: number };
  } | null>(null);

  // Reliable reading progress sync manager (debounced, ordered by sequence ID, flushed on unmount)
  const progressManagerRef = useRef<ProgressSyncManager | null>(null);
  if (!progressManagerRef.current) {
    progressManagerRef.current = createProgressSyncManager({
      debounceMs: 800,
      onSave: async ({ cfi, percentage }) => {
        try {
          await saveReadingProgressAction(bookId, tenantId, cfi, percentage);
        } catch (err) {
          console.warn('Failed to save reading progress:', err);
        }
      },
    });
  }

  // Flush pending progress on page visibility change or tab close
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void progressManagerRef.current?.flush();
      }
    };
    const handlePageHide = () => {
      void progressManagerRef.current?.flush();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      void progressManagerRef.current?.flush();
    };
  }, []);

  const initialAnnotationsRef = useRef(initialAnnotations);
  useEffect(() => {
    initialAnnotationsRef.current = initialAnnotations;
  }, [initialAnnotations]);

  // Live incoming annotation sync (from reading room broadcast)
  useEffect(() => {
    if (!liveAnnotation) return;
    setAnnotations((prev) => {
      if (prev.some((a) => a.id === liveAnnotation.id)) return prev;
      return [liveAnnotation, ...prev];
    });

    try {
      const cfg = HIGHLIGHT_COLOR_CONFIGS[liveAnnotation.color];
      renditionRef.current?.annotations.highlight(
        liveAnnotation.location,
        {},
        () => {},
        'hl-' + liveAnnotation.id,
        { fill: cfg.hex, 'fill-opacity': '0.35' }
      );
    } catch {
      // Safe skip if location cannot be marked
    }
  }, [liveAnnotation]);

  // Initialize EPUB Book & Rendition
  useEffect(() => {
    if (!viewerRef.current || !bookData) return;

    const activeControllers = contentAbortControllersRef.current;

    // Create Book instance from in-memory ArrayBuffer
    const book = ePub(bookData);
    bookRef.current = book;

    const rendition = book.renderTo(viewerRef.current, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'auto',
    });
    renditionRef.current = rendition;

    // Register Themes
    Object.values(THEME_CONFIGS).forEach((cfg) => {
      rendition.themes.register(cfg.name, cfg.bodyStyles);
    });
    rendition.themes.select('light');
    rendition.themes.fontSize(`${DEFAULT_FONT_SIZE}px`);

    // Register resilient styles and touch navigation listeners on iframe content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rendition as any).hooks?.content?.register?.((contents: any) => {
      // Guard against late registration after this rendition instance has been destroyed or replaced
      if (!renditionRef.current || renditionRef.current !== rendition) return;

      const doc = contents?.document;
      if (!doc) return;

      // 1. Inject resilient CSS rules (overflow, responsive media, tables, SVG)
      injectResilientEpubStyles(doc);

      // 2. Prevent duplicate event listener registration if hook re-executes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((doc as any).__frr_touch_registered) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).__frr_touch_registered = true;

      // 3. Attach lifecycle-safe cleanup on view destruction or iframe unload
      const { abortController } = attachContentsCleanup(
        contents,
        doc,
        (controller) => {
          contentAbortControllersRef.current.delete(controller);
        }
      );
      contentAbortControllersRef.current.add(abortController);

      let iframeTouchStart: { x: number; y: number; time: number } | null = null;
      let isIframeMultiTouch = false;

      doc.addEventListener(
        'touchstart',
        (e: TouchEvent) => {
          if (e.touches.length > 1) {
            isIframeMultiTouch = true;
            iframeTouchStart = null;
            return;
          }
          if (isInteractiveElement(e.target) || hasActiveSelection(doc)) {
            iframeTouchStart = null;
            return;
          }
          isIframeMultiTouch = false;
          iframeTouchStart = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            time: Date.now(),
          };
        },
        { passive: true, signal: abortController.signal }
      );

      doc.addEventListener(
        'touchmove',
        (e: TouchEvent) => {
          if (e.touches.length > 1) {
            isIframeMultiTouch = true;
            iframeTouchStart = null;
          }
        },
        { passive: true, signal: abortController.signal }
      );

      doc.addEventListener(
        'touchcancel',
        () => {
          isIframeMultiTouch = false;
          iframeTouchStart = null;
        },
        { passive: true, signal: abortController.signal }
      );

      doc.addEventListener(
        'touchend',
        (e: TouchEvent) => {
          if (isIframeMultiTouch || !iframeTouchStart) {
            isIframeMultiTouch = false;
            iframeTouchStart = null;
            return;
          }

          if (hasActiveSelection(doc) || isInteractiveElement(e.target)) {
            iframeTouchStart = null;
            return;
          }

          const touch = e.changedTouches[0];
          const elapsed = Date.now() - iframeTouchStart.time;
          const width = doc.documentElement?.clientWidth || window.innerWidth;
          const start = iframeTouchStart;
          iframeTouchStart = null;

          const action = classifyTouchGesture(
            start.x,
            start.y,
            touch.clientX,
            touch.clientY,
            elapsed,
            width,
            TABLET_READER_TOUCH_OPTIONS
          );

          const navAction = resolveNavigationAction(action, readingDirectionRef.current);
          if (navAction === 'next') {
            handleNextRef.current();
          } else if (navAction === 'prev') {
            handlePrevRef.current();
          } else if (navAction === 'toggle_toolbar') {
            setIsToolbarVisible((v) => !v);
          }
        },
        { passive: true, signal: abortController.signal }
      );
    });

    // Display initial position with resilient fallback
    rendition
      .display(initialCfi || undefined)
      .catch((err) => {
        console.warn('Initial CFI display failed, falling back to first chapter:', err);
        return rendition.display();
      })
      .catch((err) => {
        console.error('Failed to display EPUB start:', err);
      });

    // Extract metadata & reading direction
    book.loaded.metadata
      .then((meta) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dir = (meta as any)?.direction || (book as any).packaging?.metadata?.direction;
        if (dir === 'rtl') {
          setReadingDirection('rtl');
        }
      })
      .catch((err) => console.debug('Could not inspect EPUB metadata direction:', err));

    // Extract Table of Contents
    book.loaded.navigation
      .then((nav) => {
        setToc(nav.toc || []);
      })
      .catch((err) => console.warn('Could not load TOC:', err));

    // Generate location map for precise percentage tracking
    book.ready
      .then(() => {
        return book.locations.generate(1024);
      })
      .then(() => {
        if (initialCfi) {
          const initialPct = Math.round((book.locations.percentageFromCfi(initialCfi) || 0) * 100);
          setPercentage(initialPct);
        }
      })
      .catch((err) => console.warn('Could not generate locations:', err));

    // Listen to page relocation
    rendition.on('relocated', (location: Location) => {
      isTurningRef.current = false;
      if (!location || !location.start) return;
      const cfi = location.start.cfi;
      setCurrentCfi(cfi);

      setIsAtStart(Boolean(location.atStart));
      setIsAtEnd(Boolean(location.atEnd));

      let pct = 0;
      if (book.locations && typeof book.locations.percentageFromCfi === 'function') {
        pct = Math.round((book.locations.percentageFromCfi(cfi) || 0) * 100);
        setPercentage(pct);
      }

      if (onLocationChangeRef.current) {
        onLocationChangeRef.current(cfi, pct);
      }

      if (!disableProgressSaveRef.current) {
        progressManagerRef.current?.schedule(cfi, pct);
      }
    });

    // Listen to text selection in EPUB rendition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rendition.on('selected', (cfiRange: string, contents: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = (rendition as any).getRange(cfiRange)?.toString() || '';
      if (text && text.trim().length > 0) {
        let x = window.innerWidth / 2;
        let y = 160;
        try {
          const selection = contents?.window?.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const iframe = viewerRef.current?.querySelector('iframe');
            const iframeRect = iframe?.getBoundingClientRect() || viewerRef.current?.getBoundingClientRect();
            if (iframeRect) {
              x = iframeRect.left + rect.left + rect.width / 2;
              y = iframeRect.top + rect.top;
            }
          }
        } catch {
          // Fallback to center coordinates
        }

        setSelectionState({
          text: text.trim(),
          location: cfiRange,
          position: { x, y },
        });
      }
    });

    // Render initial highlight overlays
    initialAnnotationsRef.current.forEach((ann) => {
      try {
        const cfg = HIGHLIGHT_COLOR_CONFIGS[ann.color];
        rendition.annotations.highlight(
          ann.location,
          {},
          () => {},
          'hl-' + ann.id,
          { fill: cfg.hex, 'fill-opacity': '0.35' }
        );
      } catch {
        // Safe skip if location cannot be marked
      }
    });

    // Cleanup on unmount
    return () => {
      // Flush any pending debounced progress update immediately
      void progressManagerRef.current?.flush();

      // Abort all active content listeners across all views
      activeControllers.forEach((ac) => {
        try {
          ac.abort();
        } catch {
          // Safe skip
        }
      });
      activeControllers.clear();

      try {
        rendition.destroy();
        book.destroy();
      } catch {
        // Safe destroy fallback
      }

      // Avoid clearing a newer instance's refs from an older cleanup
      if (renditionRef.current === rendition) {
        renditionRef.current = null;
      }
      if (bookRef.current === book) {
        bookRef.current = null;
      }
    };
  }, [bookData, initialCfi]);

  // Sync with External Location (e.g. host page turns in reading room)
  useEffect(() => {
    if (!externalLocation || !renditionRef.current) return;
    if (externalLocation !== currentCfi) {
      renditionRef.current.display(externalLocation);
    }
  }, [externalLocation, currentCfi]);

  // Handle Theme Change
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.select(theme);
    }
  }, [theme]);

  // Handle Font Size Change with CFI position preservation and debounce
  useEffect(() => {
    if (!renditionRef.current) return;

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    if (fontResizeTimerRef.current) {
      clearTimeout(fontResizeTimerRef.current);
      fontResizeTimerRef.current = null;
    }
    if (fontResizeRafRef.current !== null) {
      cancelAnimationFrame(fontResizeRafRef.current);
      fontResizeRafRef.current = null;
    }

    const currentRendition = renditionRef.current;

    fontResizeTimerRef.current = setTimeout(() => {
      fontResizeTimerRef.current = null;
      if (!renditionRef.current || renditionRef.current !== currentRendition) return;

      // 1. Capture current CFI position before reflow
      const loc = currentRendition.currentLocation() as Location | undefined;
      const targetCfi = loc?.start?.cfi || currentCfiRef.current;

      // 2. Apply font size via supported epub.js themes API
      currentRendition.themes.fontSize(`${fontSize}px`);

      // 3. Re-anchor to the captured CFI to prevent pagination drift
      if (targetCfi) {
        fontResizeRafRef.current = requestAnimationFrame(() => {
          fontResizeRafRef.current = null;
          if (!renditionRef.current || renditionRef.current !== currentRendition) return;
          currentRendition.display(targetCfi).catch((err) => {
            console.warn('CFI re-anchor failed for target:', targetCfi, err);
            // Do NOT call display() with no arguments (prevents resetting to Chapter 1)
          });
        });
      }
    }, 100);

    return () => {
      if (fontResizeTimerRef.current) {
        clearTimeout(fontResizeTimerRef.current);
        fontResizeTimerRef.current = null;
      }
      if (fontResizeRafRef.current !== null) {
        cancelAnimationFrame(fontResizeRafRef.current);
        fontResizeRafRef.current = null;
      }
    };
  }, [fontSize]);

  // Mobile Touch & Gesture Handlers for Container
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      isMultiTouchRef.current = true;
      touchStartRef.current = null;
      return;
    }
    if (isInteractiveElement(e.target) || hasActiveSelection()) {
      touchStartRef.current = null;
      return;
    }
    isMultiTouchRef.current = false;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      isMultiTouchRef.current = true;
      touchStartRef.current = null;
    }
  };

  const handleTouchCancel = () => {
    isMultiTouchRef.current = false;
    touchStartRef.current = null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isMultiTouchRef.current || !touchStartRef.current) {
      isMultiTouchRef.current = false;
      touchStartRef.current = null;
      return;
    }

    if (hasActiveSelection() || isInteractiveElement(e.target)) {
      touchStartRef.current = null;
      return;
    }

    const touch = e.changedTouches[0];
    const elapsed = Date.now() - touchStartRef.current.time;
    const rect = e.currentTarget.getBoundingClientRect();
    const start = touchStartRef.current;
    touchStartRef.current = null;

    const action = classifyTouchGesture(
      start.x,
      start.y,
      touch.clientX,
      touch.clientY,
      elapsed,
      rect.width,
      TABLET_READER_TOUCH_OPTIONS
    );

    const navAction = resolveNavigationAction(action, readingDirectionRef.current);
    if (navAction === 'next') {
      handleNext();
    } else if (navAction === 'prev') {
      handlePrev();
    } else if (navAction === 'toggle_toolbar') {
      setIsToolbarVisible((v) => !v);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext]);

  // Jump to specific CFI (from TOC or Bookmark)
  const jumpToCfi = (cfi: string) => {
    renditionRef.current?.display(cfi);
    setIsTocOpen(false);
    setIsBookmarksOpen(false);
  };

  // Add Bookmark Handler
  const handleAddBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCfi) return;

    try {
      const res = await addBookmarkAction(bookId, tenantId, currentCfi, bookmarkLabel);
      if (res.data) {
        setBookmarks((prev) => [...prev, res.data!]);
        setBookmarkLabel('');
        setIsAddingBookmark(false);
      }
    } catch (err) {
      console.error('Bookmark addition failed:', err);
    }
  };

  // Delete Bookmark Handler
  const handleDeleteBookmark = async (bookmarkId: string) => {
    try {
      await deleteBookmarkAction(bookmarkId);
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
    } catch (err) {
      console.error('Failed to remove bookmark:', err);
    }
  };

  // Annotation Handlers
  const handleSaveAnnotation = async (
    color: HighlightColor,
    note?: string,
    isShared?: boolean
  ) => {
    if (!selectionState) return;

    try {
      const res = await createAnnotationAction({
        tenantId,
        bookId,
        location: selectionState.location,
        highlightedText: selectionState.text,
        note,
        color,
        isShared,
      });

      if (res.data) {
        setAnnotations((prev) => [res.data!, ...prev]);
        onAnnotationCreated?.(res.data);

        // Draw highlight overlay on rendition
        try {
          const cfg = HIGHLIGHT_COLOR_CONFIGS[color];
          renditionRef.current?.annotations.highlight(
            selectionState.location,
            {},
            () => {},
            'hl-' + res.data.id,
            { fill: cfg.hex, 'fill-opacity': '0.35' }
          );
        } catch {
          // Rendition highlight fallback
        }
      }
    } catch (err) {
      console.warn('Failed to save highlight:', err);
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      await deleteAnnotationAction(id, tenantId, bookId);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      try {
        renditionRef.current?.annotations.remove(id, 'highlight');
      } catch {
        // Annotation removal fallback
      }
    } catch (err) {
      console.warn('Failed to delete annotation:', err);
    }
  };

  const handleJumpToAnnotation = (loc: string) => {
    jumpToCfi(loc);
    setIsAnnotationsOpen(false);
  };

  const themeStyles = THEME_CONFIGS[theme];

  return (
    <div
      className="relative flex flex-col h-full w-full overflow-hidden select-none transition-colors duration-200"
      style={{ backgroundColor: themeStyles.background, color: themeStyles.foreground }}
    >
      {/* Top Controls Toolbar with Smooth Mobile Collapsing */}
      <div
        className={`flex items-center justify-between px-4 border-b border-black/10 dark:border-white/10 shrink-0 z-20 transition-all duration-300 ${
          isToolbarVisible
            ? 'h-14 opacity-100 py-2'
            : 'h-0 opacity-0 -translate-y-full pointer-events-none py-0 overflow-hidden'
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsTocOpen(!isTocOpen)}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
            title="Table of Contents"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsBookmarksOpen(!isBookmarksOpen)}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
            title="Bookmarks"
          >
            <BookmarkIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsAnnotationsOpen(!isAnnotationsOpen)}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition relative"
            title="Highlights & Notes"
          >
            <Highlighter className="w-5 h-5" />
            {annotations.length > 0 && (
              <span className="absolute top-1 right-1 px-1 rounded-full text-[9px] font-bold bg-amber-500 text-white leading-tight">
                {annotations.length}
              </span>
            )}
          </button>
        </div>

        {/* Center: Reading Percentage & Quick Navigation */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={handlePrev}
            disabled={isAtStart}
            aria-label="Previous Page"
            className="p-1.5 sm:p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition disabled:opacity-30 min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px] flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div className="text-xs font-semibold tracking-wide opacity-75 min-w-[65px] sm:min-w-[75px] text-center select-none">
            {percentage}% Read
          </div>
          <button
            onClick={handleNext}
            disabled={isAtEnd}
            aria-label="Next Page"
            className="p-1.5 sm:p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition disabled:opacity-30 min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px] flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Right: Appearance & Settings */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
            title="Text & Theme Settings"
          >
            <ALargeSmall className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Reading Canvas with Touch Zones & Swipe Detection */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center"
      >
        {/* Previous Page Button (Left Edge Gutter) */}
        <button
          onClick={handlePrev}
          disabled={isAtStart}
          aria-label="Previous Page"
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-all duration-200 backdrop-blur-md opacity-60 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[48px] min-h-[48px] flex items-center justify-center cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
          title="Previous Page (Left Arrow)"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* EPUB Mount Node with generous horizontal padding to prevent text overlap */}
        <div ref={viewerRef} className="w-full h-full px-12 sm:px-16 md:px-20 transition-all" />

        {/* Next Page Button (Right Edge Gutter) */}
        <button
          onClick={handleNext}
          disabled={isAtEnd}
          aria-label="Next Page"
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-all duration-200 backdrop-blur-md opacity-60 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[48px] min-h-[48px] flex items-center justify-center cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
          title="Next Page (Right Arrow)"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom Progress Bar */}
      <div className="w-full h-1 bg-black/10 dark:bg-white/10">
        <div
          className="h-full bg-blue-600 dark:bg-blue-400 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Slide-Over Drawer: Table of Contents */}
      {isTocOpen && (
        <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-white dark:bg-gray-900 shadow-2xl border-r border-gray-200 dark:border-gray-800 z-30 flex flex-col animate-in slide-in-from-left duration-200">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 dark:text-white">Table of Contents</h3>
            <button
              onClick={() => setIsTocOpen(false)}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {toc.length === 0 ? (
              <p className="text-sm text-gray-500">No chapters found.</p>
            ) : (
              toc.map((item) => (
                <button
                  key={item.id || item.href}
                  onClick={() => jumpToCfi(item.href)}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-blue-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium truncate"
                >
                  {item.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Slide-Over Drawer: Bookmarks */}
      {isBookmarksOpen && (
        <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-white dark:bg-gray-900 shadow-2xl border-r border-gray-200 dark:border-gray-800 z-30 flex flex-col animate-in slide-in-from-left duration-200">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 dark:text-white">Bookmarks</h3>
            <button
              onClick={() => setIsBookmarksOpen(false)}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            {isAddingBookmark ? (
              <form onSubmit={handleAddBookmark} className="space-y-2">
                <input
                  type="text"
                  placeholder="Bookmark Label (e.g. Chapter 3 quote)"
                  value={bookmarkLabel}
                  onChange={(e) => setBookmarkLabel(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingBookmark(false)}
                    className="px-2 py-1 text-xs text-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg"
                  >
                    Save
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsAddingBookmark(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 hover:bg-blue-100 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Bookmark Current Location</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {bookmarks.length === 0 ? (
              <p className="text-sm text-gray-500">No saved bookmarks yet.</p>
            ) : (
              bookmarks.map((bm) => (
                <div
                  key={bm.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 group"
                >
                  <button
                    onClick={() => jumpToCfi(bm.cfi)}
                    className="text-left text-xs font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 truncate flex-1 pr-2"
                  >
                    {bm.label || 'Saved Location'}
                  </button>
                  <button
                    onClick={() => handleDeleteBookmark(bm.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:text-red-700 transition"
                    title="Remove Bookmark"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Floating Settings Modal: Theme & Font */}
      {isSettingsOpen && (
        <div className="absolute top-14 right-4 w-72 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4 z-30 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Reader Settings
            </h4>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Theme Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setTheme('light')}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-medium gap-1 transition ${
                  theme === 'light'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-800'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Light</span>
              </button>

              <button
                onClick={() => setTheme('sepia')}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-medium gap-1 transition ${
                  theme === 'sepia'
                    ? 'border-amber-600 bg-amber-50 text-amber-900'
                    : 'border-gray-200 bg-[#fbf0d9] text-[#5f4b32]'
                }`}
              >
                <Coffee className="w-4 h-4" />
                <span>Sepia</span>
              </button>

              <button
                onClick={() => setTheme('dark')}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-medium gap-1 transition ${
                  theme === 'dark'
                    ? 'border-blue-500 bg-gray-800 text-blue-400'
                    : 'border-gray-700 bg-gray-950 text-gray-200'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>Dark</span>
              </button>
            </div>
          </div>

          {/* Font Size Adjuster */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300">
              <span>Font Size</span>
              <span>{fontSize}px</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setFontSize((s) => clampFontSize(s - 2))}
                className="flex-1 py-1.5 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                A-
              </button>
              <button
                onClick={() => setFontSize(DEFAULT_FONT_SIZE)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                title="Reset font size"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => setFontSize((s) => clampFontSize(s + 2))}
                className="flex-1 py-1.5 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-base font-bold hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                A+
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Drawer: Highlights & Notes */}
      <AnnotationsSidebar
        isOpen={isAnnotationsOpen}
        onClose={() => setIsAnnotationsOpen(false)}
        annotations={annotations}
        onJumpToLocation={handleJumpToAnnotation}
        onDeleteAnnotation={handleDeleteAnnotation}
        bookTitle={bookTitle}
        currentUserId={currentUserId}
        tenantId={tenantId}
        bookId={bookId}
        isAdmin={isAdmin}
      />

      {/* In-Reader Highlight Context Menu Popover */}
      <HighlightContextMenu
        position={selectionState?.position || null}
        selectedText={selectionState?.text || ''}
        onSave={handleSaveAnnotation}
        onClose={() => setSelectionState(null)}
      />
    </div>
  );
}
