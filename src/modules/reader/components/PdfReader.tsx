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
  parsePageFromCfi,
  formatPageCfi,
  calculatePagePercentage,
} from '../utils';
import {
  classifyTouchGesture,
  hasActiveSelection,
  isInteractiveElement,
  isContainerZoomed,
  isPannedToHorizontalBoundary,
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

  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;
  const disableProgressSaveRef = useRef(disableProgressSave);
  disableProgressSaveRef.current = disableProgressSave;

  // Pagination & Zoom
  const initialPage = parsePageFromCfi(initialCfi) || 1;
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.2);
  const [theme, setTheme] = useState<ReaderTheme>('light');
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
  const [textItems, setTextItems] = useState<
    Array<{ str: string; left: number; top: number; width: number; height: number; fontSize: number }>
  >([]);

  // Page direct input
  const [inputPage, setInputPage] = useState<string>(String(initialPage));

  // Debounced progress save
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncProgressDebounced = useCallback(
    (page: number, total: number) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const pct = calculatePagePercentage(page, total);
          await saveReadingProgressAction(bookId, tenantId, formatPageCfi(page), pct);
        } catch (err) {
          console.warn('Failed to save PDF reading progress:', err);
        }
      }, 1000);
    },
    [bookId, tenantId]
  );

  // Load PDF Document
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      setIsDocumentLoading(true);
      try {
        const pdfjs = await import('pdfjs-dist');
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
              const items = (textContent.items as any[])
                .filter((it) => it.str && it.str.trim())
                .map((it) => {
                  const tx = it.transform;
                  const x = tx[4] * scale;
                  const y = viewport.height - tx[5] * scale;
                  return {
                    str: String(it.str),
                    left: x,
                    top: Math.max(0, y - (it.height || 12) * scale),
                    width: (it.width || 20) * scale,
                    height: (it.height || 12) * scale,
                    fontSize: Math.max(8, Math.abs(tx[0] || 12) * scale),
                  };
                });
              setTextItems(items);
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

      if (!disableProgressSaveRef.current) {
        syncProgressDebounced(currentPage, totalPages);
      }

      if (onLocationChangeRef.current && totalPages > 0) {
        const pct = calculatePagePercentage(currentPage, totalPages);
        onLocationChangeRef.current(formatPageCfi(currentPage), pct);
      }
    }
  }, [currentPage, zoom, isDocumentLoading, totalPages, renderPage, syncProgressDebounced]);

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

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isMultiTouchRef.current || !touchStartRef.current) {
      isMultiTouchRef.current = false;
      touchStartRef.current = null;
      return;
    }

    if (isDocumentLoading || isPageRendering || hasActiveSelection() || isInteractiveElement(e.target)) {
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
      rect.width
    );

    if (action.type === 'swipe') {
      if (action.direction === 'left' && currentPage < totalPages) {
        handleNext();
      } else if (action.direction === 'right' && currentPage > 1) {
        handlePrev();
      }
    } else if (action.type === 'tap') {
      const relativeX = (touch.clientX - rect.left) / rect.width;
      // Edge taps are disabled when zoomed to prevent accidental page turns while inspecting content
      if (!isZoomed && relativeX <= 0.20 && currentPage > 1) {
        handlePrev();
      } else if (!isZoomed && relativeX >= 0.80 && currentPage < totalPages) {
        handleNext();
      } else if (relativeX > 0.20 && relativeX < 0.80) {
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

  // Annotation Handlers
  const handleMouseUp = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0 && selection && selection.rangeCount > 0) {
      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelectionState({
          text,
          location: formatPageCfi(currentPage),
          position: { x: rect.left + rect.width / 2, y: rect.top },
        });
      } catch {
        // Selection coordinate fallback
      }
    }
  };

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
      }
    } catch (err) {
      console.warn('Failed to save highlight:', err);
    }
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
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={currentPage <= 1 || isPageRendering}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition disabled:opacity-40"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5 text-xs font-semibold">
            <input
              type="text"
              value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              onBlur={() => setInputPage(String(currentPage))}
              className="w-12 text-center py-1 border border-black/20 dark:border-white/20 rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="opacity-75">/ {totalPages}</span>
          </form>

          <button
            onClick={handleNext}
            disabled={currentPage >= totalPages || isPageRendering}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition disabled:opacity-40"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
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

      {/* Main Canvas Viewport with Touch Zones & Gestures */}
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative flex-1 w-full h-full overflow-auto flex items-center justify-center p-4 min-h-[80vh]"
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
            {/* Selectable Text Layer Overlay */}
            <div
              className="absolute inset-0 overflow-hidden pointer-events-auto select-text"
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
                    fontSize: `${item.fontSize}px`,
                    lineHeight: `${item.height}px`,
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
