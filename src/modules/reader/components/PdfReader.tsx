'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Bookmark as BookmarkIcon,
  Plus,
  Trash2,
  X,
  Sun,
  Moon,
  Coffee,
  Loader2,
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
  loadReaderSettings,
  saveReaderSettings,
  parsePageFromCfi,
  formatPageCfi,
  calculatePagePercentage,
  createProgressSyncManager,
  ProgressSyncManager,
  findHighlightRects,
  sortPdfTextItems,
  PdfTextItem,
} from '../utils';
import {
  classifyTouchGesture,
  hasActiveSelection,
  isInteractiveElement,
  isContainerZoomed,
  isPannedToHorizontalBoundary,
  TABLET_READER_TOUCH_OPTIONS,
  resolveNavigationAction,
} from '../gestures';
import { saveReadingProgressAction, addBookmarkAction, deleteBookmarkAction } from '../actions';

interface PdfReaderProps {
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

export function PdfReader({
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
}: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLibRef = useRef<any>(null);

  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;
  const disableProgressSaveRef = useRef(disableProgressSave);
  disableProgressSaveRef.current = disableProgressSave;

  // Pagination & Zoom
  const initialPage = parsePageFromCfi(initialCfi) || 1;
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.2);
  // Reader Theme initialized with deterministic default shared by server and client
  const [theme, setTheme] = useState<ReaderTheme>('light');
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);

  // Restore persisted settings from localStorage in a mount effect
  useEffect(() => {
    const settings = loadReaderSettings();
    setTheme(settings.theme);
    setSettingsLoaded(true);
  }, []);

  // Persist theme changes to localStorage once restored
  useEffect(() => {
    if (!settingsLoaded) return;
    saveReaderSettings({ theme });
  }, [theme, settingsLoaded]);
  const [isDocumentLoading, setIsDocumentLoading] = useState<boolean>(true);
  const [isPageRendering, setIsPageRendering] = useState<boolean>(false);

  // Bookmarks & Annotations
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(initialBookmarks);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [isAnnotationsOpen, setIsAnnotationsOpen] = useState(false);
  const [isAddingBookmark, setIsAddingBookmark] = useState(false);
  const [bookmarkLabel, setBookmarkLabel] = useState('');
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);

  // Touch gesture & navigation lock refs
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isMultiTouchRef = useRef(false);
  const isTurningRef = useRef(false);

  // Live incoming annotation sync (from reading room broadcast)
  useEffect(() => {
    if (!liveAnnotation) return;
    setAnnotations((prev) => {
      if (prev.some((a) => a.id === liveAnnotation.id)) return prev;
      return [liveAnnotation, ...prev];
    });
  }, [liveAnnotation]);

  // Selection & Text Layer
  const [selectionState, setSelectionState] = useState<{
    text: string;
    location: string;
    position: { x: number; y: number };
  } | null>(null);
  const [textItems, setTextItems] = useState<PdfTextItem[]>([]);

  // Page direct input
  const [inputPage, setInputPage] = useState<string>(String(initialPage));

  // Reliable reading progress sync manager (ordered, debounced, flushed on unmount)
  const progressManagerRef = useRef<ProgressSyncManager | null>(null);
  if (!progressManagerRef.current) {
    progressManagerRef.current = createProgressSyncManager({
      debounceMs: 800,
      onSave: async ({ cfi, percentage }) => {
        try {
          await saveReadingProgressAction(bookId, tenantId, cfi, percentage);
        } catch (err) {
          console.warn('Failed to save PDF reading progress:', err);
        }
      },
    });
  }

  // Flush pending progress on visibility change, pagehide, or unmount
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

  // Load PDF Document
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      setIsDocumentLoading(true);
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjsLibRef.current = pdfjs;
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }

        const loadingTask = pdfjs.getDocument({ data: bookData });
        const doc = await loadingTask.promise;

        if (!isCancelled) {
          pdfDocRef.current = doc;
          setTotalPages(doc.numPages);
          setIsDocumentLoading(false);
        }
      } catch (err) {
        console.error('Failed to parse PDF document:', err);
        if (!isCancelled) {
          setIsDocumentLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore cancellation errors
        }
        renderTaskRef.current = null;
      }
      pdfDocRef.current?.cleanup();
    };
  }, [bookData]);

  // Render Current Page
  const renderPage = useCallback(
    async (pageNum: number, scale: number) => {
      const doc = pdfDocRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;

      // 1. Cancel any active render task before starting a new one
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore cancellation errors
        }
        renderTaskRef.current = null;
      }

      setIsPageRendering(true);
      try {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        // 2. Explicit device pixel-ratio scaling & canvas sizing guarantee
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas context prior to rendering and apply scaling
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        // 3. Render page canvas with isolated cancellation handling
        try {
          // @ts-expect-error pdfjs render parameters
          renderTaskRef.current = page.render(renderContext);
          await renderTaskRef.current.promise;
        } catch (err: unknown) {
          if (
            err &&
            typeof err === 'object' &&
            'name' in err &&
            err.name === 'RenderingCancelledException'
          ) {
            // Expected when navigating between pages quickly - do not break state
            return;
          }
          console.error('PDF page render error:', err);
        } finally {
          renderTaskRef.current = null;
        }

        // 4. Non-blocking asynchronous text layer extraction (does not block visual canvas)
        page
          .getTextContent()
          .then((textContent) => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const rawItems = textContent.items as any[];
              const items: PdfTextItem[] = [];

              for (const it of rawItems) {
                if (!it.str || !it.str.trim()) continue;
                const tx = it.transform;
                let left = tx[4] * scale;
                let top = viewport.height - tx[5] * scale;
                let fontSize = Math.max(8, Math.abs(tx[0] || 12) * scale);
                let height = (it.height || 12) * scale;
                let width = (it.width || 20) * scale;

                if (pdfjsLibRef.current?.Util?.transform) {
                  const m = pdfjsLibRef.current.Util.transform(viewport.transform, tx);
                  left = m[4];
                  top = m[5];
                  fontSize = Math.max(8, Math.hypot(m[2], m[3]) || Math.abs(m[0]) || 12);
                  height = it.height ? it.height * scale : fontSize;
                  top = Math.max(0, top - height);
                  width = Math.max(4, it.width * scale);
                } else {
                  top = Math.max(0, top - height);
                }

                items.push({
                  str: String(it.str),
                  left: Math.round(left * 10) / 10,
                  top: Math.round(top * 10) / 10,
                  width: Math.round(width * 10) / 10,
                  height: Math.round(height * 10) / 10,
                  fontSize: Math.round(fontSize * 10) / 10,
                });
              }

              // Sort into authentic visual reading order using production helper
              const sortedItems = sortPdfTextItems(items);
              setTextItems(sortedItems);
            } catch {
              // Ignore text layer mapping errors
            }
          })
          .catch((err) => {
            // Non-blocking: Scanned PDF or page without selectable text streams
            console.debug('Text extraction skipped for page:', pageNum, err);
            setTextItems([]);
          });
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          err.name === 'RenderingCancelledException'
        ) {
          return;
        }
        console.error('Failed to load PDF page:', err);
      } finally {
        setIsPageRendering(false);
        isTurningRef.current = false;
      }
    },
    []
  );

  // Sync with External Location (e.g. host page turns in reading room)
  useEffect(() => {
    if (!externalLocation) return;
    const targetPage = parsePageFromCfi(externalLocation);
    if (targetPage && targetPage !== currentPage && targetPage >= 1 && targetPage <= totalPages) {
      setCurrentPage(targetPage);
    }
  }, [externalLocation, totalPages, currentPage]);

  useEffect(() => {
    if (!isDocumentLoading && pdfDocRef.current) {
      renderPage(currentPage, zoom);
      setInputPage(String(currentPage));

      if (!disableProgressSaveRef.current && totalPages > 0) {
        const pct = calculatePagePercentage(currentPage, totalPages);
        progressManagerRef.current?.schedule(formatPageCfi(currentPage), pct);
      }

      if (onLocationChangeRef.current && totalPages > 0) {
        const pct = calculatePagePercentage(currentPage, totalPages);
        onLocationChangeRef.current(formatPageCfi(currentPage), pct);
      }
    }
  }, [currentPage, zoom, isDocumentLoading, totalPages, renderPage]);

  // Page Controls with turning lock
  const handlePrev = useCallback(() => {
    if (isTurningRef.current || isPageRendering) return;
    isTurningRef.current = true;
    setCurrentPage((p) => Math.max(1, p - 1));
    setTimeout(() => {
      isTurningRef.current = false;
    }, 350);
  }, [isPageRendering]);

  const handleNext = useCallback(() => {
    if (isTurningRef.current || isPageRendering) return;
    isTurningRef.current = true;
    setCurrentPage((p) => Math.min(totalPages, p + 1));
    setTimeout(() => {
      isTurningRef.current = false;
    }, 350);
  }, [totalPages, isPageRendering]);

  // Mobile Touch & Gesture Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      isMultiTouchRef.current = true;
      touchStartRef.current = null;
      return;
    }
    if (isDocumentLoading || isPageRendering || isInteractiveElement(e.target) || hasActiveSelection()) {
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

    if (hasActiveSelection()) {
      touchStartRef.current = null;
      checkSelection();
      return;
    }

    if (isDocumentLoading || isPageRendering || isInteractiveElement(e.target)) {
      touchStartRef.current = null;
      return;
    }

    const container = containerRef.current;
    const isZoomed = isContainerZoomed(container, 30);
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;

    // When zoomed in and scrolling horizontally, let user pan without turning pages
    if (isZoomed) {
      if (deltaX < 0 && !isPannedToHorizontalBoundary(container, 'left', 30)) {
        touchStartRef.current = null;
        return;
      }
      if (deltaX > 0 && !isPannedToHorizontalBoundary(container, 'right', 30)) {
        touchStartRef.current = null;
        return;
      }
    }

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

    const navAction = resolveNavigationAction(action, 'ltr');

    if (action.type === 'swipe') {
      if (navAction === 'next' && currentPage < totalPages) {
        handleNext();
      } else if (navAction === 'prev' && currentPage > 1) {
        handlePrev();
      }
    } else if (action.type === 'tap') {
      // Edge taps are disabled when zoomed to prevent accidental page turns while inspecting content
      if (!isZoomed && navAction === 'prev' && currentPage > 1) {
        handlePrev();
      } else if (!isZoomed && navAction === 'next' && currentPage < totalPages) {
        handleNext();
      } else if (navAction === 'toggle_toolbar') {
        setIsToolbarVisible((v) => !v);
      }
    }
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        handlePrev();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext]);

  // Direct Page Input Submission
  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(inputPage, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages) {
      setCurrentPage(parsed);
    } else {
      setInputPage(String(currentPage));
    }
  };

  // Zoom Controls
  const handleZoomIn = () => setZoom((z) => Math.min(3.0, Math.round((z + 0.2) * 10) / 10));
  const handleZoomOut = () => setZoom((z) => Math.max(0.6, Math.round((z - 0.2) * 10) / 10));

  const handleFitWidth = () => {
    if (!containerRef.current || !pdfDocRef.current) return;
    pdfDocRef.current.getPage(currentPage).then((page) => {
      const baseViewport = page.getViewport({ scale: 1.0 });
      const containerWidth = containerRef.current?.clientWidth || 800;
      const targetScale = Math.max(0.6, Math.min(2.5, (containerWidth - 64) / baseViewport.width));
      setZoom(Math.round(targetScale * 10) / 10);
    });
  };

  // Bookmark Handlers
  const handleAddBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    const cfi = formatPageCfi(currentPage);
    const label = bookmarkLabel.trim() || `Page ${currentPage}`;

    try {
      const res = await addBookmarkAction(bookId, tenantId, cfi, label);
      if (res.data) {
        setBookmarks((prev) => [...prev, res.data!]);
        setBookmarkLabel('');
        setIsAddingBookmark(false);
      }
    } catch (err) {
      console.error('Bookmark creation failed:', err);
    }
  };

  const handleDeleteBookmark = async (bookmarkId: string) => {
    try {
      await deleteBookmarkAction(bookmarkId);
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
    } catch (err) {
      console.error('Bookmark deletion failed:', err);
    }
  };

  const jumpToBookmark = (cfi: string) => {
    const page = parsePageFromCfi(cfi);
    if (page && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setIsBookmarksOpen(false);
    }
  };

  // Annotation Selection Handlers
  const checkSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0 && selection && selection.rangeCount > 0) {
      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          setSelectionState({
            text,
            location: formatPageCfi(currentPage),
            position: { x: rect.left + rect.width / 2, y: rect.top },
          });
        }
      } catch {
        // Selection coordinate fallback
      }
    }
  }, [currentPage]);

  const handleMouseUp = () => {
    checkSelection();
  };

  const handleSaveAnnotation = async (
    color: HighlightColor,
    note?: string,
    isShared?: boolean
  ) => {
    if (!selectionState) return;

    const res = await createAnnotationAction({
      tenantId,
      bookId,
      location: selectionState.location,
      highlightedText: selectionState.text,
      note,
      color,
      isShared,
    });

    if (res.error || !res.data) {
      throw new Error(res.error || 'Failed to save highlight');
    }

    setAnnotations((prev) => [res.data!, ...prev]);
    onAnnotationCreated?.(res.data);
    window.getSelection()?.removeAllRanges();
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      await deleteAnnotationAction(id, tenantId, bookId);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.warn('Failed to delete annotation:', err);
    }
  };

  const handleJumpToAnnotation = (loc: string) => {
    const targetPage = parsePageFromCfi(loc);
    if (targetPage && targetPage >= 1 && targetPage <= totalPages) {
      setCurrentPage(targetPage);
    }
    setIsAnnotationsOpen(false);
  };

  // Theme Styling
  const themeStyles = THEME_CONFIGS[theme];
  const percentage = calculatePagePercentage(currentPage, totalPages);

  // Canvas visual filter for themes
  const canvasFilter =
    theme === 'dark'
      ? 'invert(0.9) hue-rotate(180deg) brightness(0.95)'
      : theme === 'sepia'
      ? 'sepia(0.35) contrast(0.95) brightness(0.95)'
      : 'none';

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

        {/* Center: Page Jump and Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={handlePrev}
            disabled={currentPage <= 1 || isPageRendering}
            aria-label="Previous Page"
            className="p-1.5 sm:p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition disabled:opacity-30 min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px] flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5 text-xs font-semibold">
            <input
              type="text"
              value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              onBlur={() => setInputPage(String(currentPage))}
              aria-label="Page Number"
              className="w-12 text-center py-1 border border-black/20 dark:border-white/20 rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="opacity-75">/ {totalPages}</span>
          </form>

          <button
            onClick={handleNext}
            disabled={currentPage >= totalPages || isPageRendering}
            aria-label="Next Page"
            className="p-1.5 sm:p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition disabled:opacity-30 min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px] flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Right: Zoom & Theme Settings */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 border-r border-black/10 dark:border-white/10 pr-2">
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleFitWidth}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition"
              title="Fit to Width"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Theme Quick Switcher */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme('light')}
              className={`p-1.5 rounded-lg transition ${theme === 'light' ? 'bg-black/10 dark:bg-white/20' : ''}`}
              title="Light Theme"
            >
              <Sun className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTheme('sepia')}
              className={`p-1.5 rounded-lg transition ${theme === 'sepia' ? 'bg-amber-100 text-amber-900' : ''}`}
              title="Sepia Theme"
            >
              <Coffee className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`p-1.5 rounded-lg transition ${theme === 'dark' ? 'bg-gray-800 text-blue-400' : ''}`}
              title="Dark Theme"
            >
              <Moon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Viewport Wrapper */}
      <div className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center">
        {/* Previous Page Button (Left Edge Gutter on Tablet/Desktop) */}
        <button
          onClick={handlePrev}
          disabled={currentPage <= 1 || isPageRendering}
          aria-label="Previous Page"
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-all duration-200 backdrop-blur-md opacity-60 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[48px] min-h-[48px] hidden md:flex items-center justify-center cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
          title="Previous Page (Left Arrow)"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Scrollable Canvas Viewport with Touch Zones & Gestures */}
        <div
          ref={containerRef}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          className="w-full h-full overflow-auto flex items-center justify-center p-4 min-h-[80vh]"
        >
          {isDocumentLoading ? (
            <div className="flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-xs font-semibold text-gray-400">Loading PDF document...</p>
            </div>
          ) : (
            <div className="relative shadow-2xl rounded-sm transition-all duration-150 min-h-[600px] flex items-center justify-center">
              {isPageRendering && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 dark:bg-white/5 backdrop-blur-[1px]">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              )}
              <canvas
                ref={canvasRef}
                style={{ filter: canvasFilter }}
                className="block rounded-sm transition duration-150"
              />
              {/* Visual Highlights Overlay Layer */}
              <div
                className="absolute inset-0 pointer-events-none overflow-hidden"
                style={{
                  width: canvasRef.current?.style.width,
                  height: canvasRef.current?.style.height,
                }}
              >
                {annotations
                  .filter((ann) => parsePageFromCfi(ann.location) === currentPage)
                  .map((ann) => {
                    const rects = findHighlightRects(textItems, ann.highlightedText);
                    const cfg = HIGHLIGHT_COLOR_CONFIGS[ann.color] || HIGHLIGHT_COLOR_CONFIGS.yellow;
                    return (
                      <React.Fragment key={ann.id}>
                        {rects.map((rect, rIdx) => (
                          <div
                            key={`${ann.id}-${rIdx}`}
                            className="absolute pointer-events-none rounded-xs transition-opacity duration-150"
                            style={{
                              left: `${rect.left}px`,
                              top: `${rect.top}px`,
                              width: `${rect.width}px`,
                              height: `${rect.height}px`,
                              backgroundColor: cfg.hex,
                              opacity: 0.38,
                              mixBlendMode: theme === 'dark' ? 'screen' : 'multiply',
                            }}
                          />
                        ))}
                      </React.Fragment>
                    );
                  })}
              </div>

              {/* Selectable Text Layer Overlay */}
              <div
                className="absolute inset-0 overflow-hidden pointer-events-auto select-text pdf-text-layer"
                style={{
                  width: canvasRef.current?.style.width,
                  height: canvasRef.current?.style.height,
                }}
              >
                {textItems.map((item, idx) => (
                  <span
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: `${item.left}px`,
                      top: `${item.top}px`,
                      width: `${item.width}px`,
                      height: `${item.height}px`,
                      fontSize: `${item.fontSize}px`,
                      lineHeight: `${item.height}px`,
                      fontFamily: 'sans-serif',
                      whiteSpace: 'pre',
                      color: 'transparent',
                      userSelect: 'text',
                    }}
                  >
                    {item.str}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Next Page Button (Right Edge Gutter on Tablet/Desktop) */}
        <button
          onClick={handleNext}
          disabled={currentPage >= totalPages || isPageRendering}
          aria-label="Next Page"
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-all duration-200 backdrop-blur-md opacity-60 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[48px] min-h-[48px] hidden md:flex items-center justify-center cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
          title="Next Page (Right Arrow)"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom Progress Bar */}
      <div className="w-full h-1 bg-black/10 dark:bg-white/10 shrink-0">
        <div
          className="h-full bg-blue-600 dark:bg-blue-400 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

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
                  placeholder={`Bookmark Page ${currentPage}...`}
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
                <span>Bookmark Page {currentPage}</span>
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
                    onClick={() => jumpToBookmark(bm.cfi)}
                    className="text-left text-xs font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 truncate flex-1 pr-2"
                  >
                    {bm.label || `Page ${parsePageFromCfi(bm.cfi) || 'Saved'}`}
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
