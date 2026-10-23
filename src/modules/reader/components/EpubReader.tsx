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
} from '../utils';
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
  externalLocation?: string | null;
  onLocationChange?: (location: string, percentage: number) => void;
  disableProgressSave?: boolean;
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
  externalLocation,
  onLocationChange,
  disableProgressSave = false,
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

  // In-Reader Text Selection State
  const [selectionState, setSelectionState] = useState<{
    text: string;
    location: string;
    position: { x: number; y: number };
  } | null>(null);

  // Debounced progress save ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialAnnotationsRef = useRef(initialAnnotations);
  useEffect(() => {
    initialAnnotationsRef.current = initialAnnotations;
  }, [initialAnnotations]);

  const syncProgressDebounced = useCallback(
    (cfi: string, pct: number) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(async () => {
        try {
          await saveReadingProgressAction(bookId, tenantId, cfi, pct);
        } catch (err) {
          console.warn('Failed to save reading progress:', err);
        }
      }, 1000);
    },
    [bookId, tenantId]
  );

  // Initialize EPUB Book & Rendition
  useEffect(() => {
    if (!viewerRef.current || !bookData) return;

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

    // Display initial position
    rendition.display(initialCfi || undefined);

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
      if (!location || !location.start) return;
      const cfi = location.start.cfi;
      setCurrentCfi(cfi);

      let pct = 0;
      if (book.locations && typeof book.locations.percentageFromCfi === 'function') {
        pct = Math.round((book.locations.percentageFromCfi(cfi) || 0) * 100);
        setPercentage(pct);
      }

      if (onLocationChangeRef.current) {
        onLocationChangeRef.current(cfi, pct);
      }

      if (!disableProgressSaveRef.current) {
        syncProgressDebounced(cfi, pct);
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
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      try {
        rendition.destroy();
        book.destroy();
      } catch {
        // Safe destroy fallback
      }
    };
  }, [bookData, initialCfi, syncProgressDebounced]);

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

  // Handle Font Size Change
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}px`);
    }
  }, [fontSize]);

  // Page Navigation Handlers
  const handlePrev = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  const handleNext = useCallback(() => {
    renditionRef.current?.next();
  }, []);

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
      {/* Top Controls Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-black/10 dark:border-white/10 shrink-0 z-20">
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

        {/* Center: Reading Percentage */}
        <div className="text-xs font-semibold tracking-wide opacity-75">
          {percentage}% Read
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

      {/* Main Reading Canvas */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        {/* Previous Page Button (Left Edge) */}
        <button
          onClick={handlePrev}
          aria-label="Previous Page"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition backdrop-blur-sm opacity-50 hover:opacity-100"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* EPUB Mount Node */}
        <div ref={viewerRef} className="w-full h-full" />

        {/* Next Page Button (Right Edge) */}
        <button
          onClick={handleNext}
          aria-label="Next Page"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition backdrop-blur-sm opacity-50 hover:opacity-100"
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
