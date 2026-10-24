/**
 * Resilient CSS rules injected into EPUB iframes:
 * - Prevents text and long words from overflowing the reading column
 * - Keeps images within page boundaries while preserving intrinsic aspect ratio
 * - Constrains SVG graphics without breaking inline icons or drop caps
 * - Preserves publisher layouts, tables, and figure captions without blunt global overrides
 */
export const RESILIENT_EPUB_CSS = `
/* Prevent text and long unbroken words/URLs from overflowing column */
body {
  overflow-wrap: break-word !important;
  word-wrap: break-word !important;
}
p, div, span, li, blockquote {
  overflow-wrap: break-word;
}
pre, code {
  white-space: pre-wrap !important;
  overflow-wrap: break-word !important;
}

/* Responsive image & media constraints (scoped to HTML img only) */
img {
  max-width: 100% !important;
  height: auto !important;
  object-fit: contain;
}

/* Constrain embedded SVG graphics while preserving small vector icons */
svg:not([width="1em"]):not([height="1em"]) {
  max-width: 100% !important;
  height: auto;
}

/* Prevent tables and wide elements from spilling past page margins */
table {
  max-width: 100% !important;
}

/* Respect publisher captions and figures without overriding float margins */
figure {
  max-width: 100% !important;
  margin-left: auto;
  margin-right: auto;
}
figcaption {
  overflow-wrap: break-word;
}
`;

export const RESILIENT_STYLE_ELEMENT_ID = 'frr-resilient-layout-styles';

/**
 * Injects resilient layout styles into an EPUB iframe document if not already present.
 */
export function injectResilientEpubStyles(doc: Document): void {
  if (!doc || doc.getElementById(RESILIENT_STYLE_ELEMENT_ID)) return;
  const styleEl = doc.createElement('style');
  styleEl.id = RESILIENT_STYLE_ELEMENT_ID;
  styleEl.textContent = RESILIENT_EPUB_CSS;
  if (doc.head) {
    doc.head.appendChild(styleEl);
  } else if (doc.documentElement) {
    doc.documentElement.appendChild(styleEl);
  }
}

export interface TouchGestureOptions {
  minSwipeDistance?: number;
  maxSwipeDuration?: number;
  minSwipeDuration?: number;
  dominantRatio?: number;
  maxTapDistance?: number;
  maxTapDuration?: number;
  leftEdgeThreshold?: number;
  rightEdgeThreshold?: number;
}

export type GestureAction =
  | { type: 'swipe'; direction: 'left' | 'right' }
  | { type: 'tap'; zone: 'left' | 'right' | 'center'; relativeX: number }
  | { type: 'none'; reason: string };

/**
 * Classifies a touch gesture based on distance, elapsed time, and dominant direction.
 */
export function classifyTouchGesture(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  elapsedMs: number,
  containerWidth: number,
  options?: TouchGestureOptions
): GestureAction {
  const minSwipeDist = options?.minSwipeDistance ?? 50;
  const maxSwipeDuration = options?.maxSwipeDuration ?? 600;
  const minSwipeDuration = options?.minSwipeDuration ?? 40;
  const dominantRatio = options?.dominantRatio ?? 2;
  const maxTapDist = options?.maxTapDistance ?? 12;
  const maxTapDuration = options?.maxTapDuration ?? 350;
  const leftEdge = options?.leftEdgeThreshold ?? 0.20;
  const rightEdge = options?.rightEdgeThreshold ?? 0.80;

  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  // 1. Genuine Tap Detection (small movement and short duration)
  if (absX <= maxTapDist && absY <= maxTapDist && elapsedMs <= maxTapDuration) {
    if (containerWidth <= 0) return { type: 'none', reason: 'invalid_container_width' };
    const relativeX = endX / containerWidth;
    if (relativeX <= leftEdge) {
      return { type: 'tap', zone: 'left', relativeX };
    }
    if (relativeX >= rightEdge) {
      return { type: 'tap', zone: 'right', relativeX };
    }
    return { type: 'tap', zone: 'center', relativeX };
  }

  // 2. Horizontal Swipe Detection
  if (elapsedMs >= minSwipeDuration && elapsedMs <= maxSwipeDuration) {
    if (absX >= minSwipeDist) {
      // Horizontal movement must be dominant over vertical movement
      if (absX >= absY * dominantRatio) {
        return {
          type: 'swipe',
          direction: deltaX < 0 ? 'left' : 'right',
        };
      }
      return { type: 'none', reason: 'vertical_movement_not_dominant' };
    }
  }

  return { type: 'none', reason: 'thresholds_not_met' };
}

/**
 * Returns true if an active non-collapsed text selection exists in the document.
 */
export function hasActiveSelection(targetDoc?: Document | null): boolean {
  try {
    const doc = targetDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return false;
    const sel = doc.getSelection();
    if (!sel) return false;
    return !sel.isCollapsed && sel.toString().trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Returns true if the target element (or its parent element if target is a text node)
 * is an interactive control (link, button, form control).
 */
export function isInteractiveElement(target: EventTarget | null | undefined): boolean {
  if (!target) return false;
  const element =
    target instanceof Element
      ? target
      : (target as Node).parentElement instanceof Element
      ? (target as Node).parentElement
      : null;
  if (!element) return false;
  return Boolean(
    element.closest(
      'a, button, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"]'
    )
  );
}

/**
 * Returns true if a scroll container is horizontally zoomed/overflowing past a tolerance threshold.
 */
export function isContainerZoomed(container: HTMLElement | null, tolerance = 30): boolean {
  if (!container) return false;
  return container.scrollWidth > container.clientWidth + tolerance;
}

/**
 * Checks whether horizontal panning in a zoomed container has reached the scroll boundaries.
 */
export function isPannedToHorizontalBoundary(
  container: HTMLElement | null,
  direction: 'left' | 'right',
  tolerance = 30
): boolean {
  if (!container || !isContainerZoomed(container, tolerance)) return true;
  if (direction === 'left') {
    // Swiping left (advancing to next page): allowed only if already scrolled to right edge
    return container.scrollLeft + container.clientWidth >= container.scrollWidth - tolerance;
  }
  // Swiping right (returning to previous page): allowed only if already scrolled to left edge
  return container.scrollLeft <= tolerance;
}

export interface ContentsLike {
  destroy?: () => void;
  window?: Window | null;
}

/**
 * Wraps an EPUB Contents instance's destroy method and binds an AbortController
 * so that gesture listeners are reliably aborted when the view is torn down or unloaded.
 */
export function attachContentsCleanup(
  contents: ContentsLike | null | undefined,
  doc?: Document | null,
  onCleanup?: (controller: AbortController) => void
): { abortController: AbortController; cleanup: () => void } {
  const abortController = new AbortController();
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      abortController.abort();
    } catch {
      // Safe skip
    }
    onCleanup?.(abortController);
  };

  if (contents && typeof contents.destroy === 'function') {
    const originalDestroy = contents.destroy.bind(contents);
    contents.destroy = () => {
      cleanup();
      originalDestroy();
    };
  }

  const iframeWin = contents?.window || doc?.defaultView;
  iframeWin?.addEventListener?.('unload', cleanup, { once: true });
  iframeWin?.addEventListener?.('pagehide', cleanup, { once: true });

  return { abortController, cleanup };
}
