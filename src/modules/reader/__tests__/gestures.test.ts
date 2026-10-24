import { describe, it, expect, beforeEach } from 'vitest';
import {
  RESILIENT_EPUB_CSS,
  RESILIENT_STYLE_ELEMENT_ID,
  injectResilientEpubStyles,
  classifyTouchGesture,
  hasActiveSelection,
  isInteractiveElement,
  isContainerZoomed,
  isPannedToHorizontalBoundary,
} from '../gestures';

describe('Reader Gestures, Touch Navigation & Resilient Layout Engine', () => {
  describe('Resilient EPUB CSS & Layout Injection', () => {
    it('contains word overflow and responsive media rules', () => {
      expect(RESILIENT_EPUB_CSS).toContain('overflow-wrap: break-word');
      expect(RESILIENT_EPUB_CSS).toContain('max-width: 100% !important');
      expect(RESILIENT_EPUB_CSS).toContain('height: auto !important');
      expect(RESILIENT_EPUB_CSS).toContain('object-fit: contain');
      expect(RESILIENT_EPUB_CSS).toContain('table');
      expect(RESILIENT_EPUB_CSS).toContain('figure');
    });

    it('scopes height: auto to HTML img only and avoids clobbering SVG image elements', () => {
      // Must target HTML img, NOT SVG <image> elements (which collapse with CSS height: auto)
      expect(RESILIENT_EPUB_CSS).toContain('img {');
      expect(RESILIENT_EPUB_CSS).not.toContain('img, image {');
      expect(RESILIENT_EPUB_CSS).not.toContain('image {');
    });

    it('avoids !important on figure margins to respect publisher float alignment', () => {
      expect(RESILIENT_EPUB_CSS).toContain('margin-left: auto;');
      expect(RESILIENT_EPUB_CSS).toContain('margin-right: auto;');
      expect(RESILIENT_EPUB_CSS).not.toContain('margin-left: auto !important');
    });

    it('injects style element into document head', () => {
      const doc = document.implementation.createHTMLDocument('EPUB Test');
      expect(doc.getElementById(RESILIENT_STYLE_ELEMENT_ID)).toBeNull();

      injectResilientEpubStyles(doc);

      const injected = doc.getElementById(RESILIENT_STYLE_ELEMENT_ID);
      expect(injected).not.toBeNull();
      expect(injected?.tagName.toLowerCase()).toBe('style');
      expect(injected?.textContent).toContain('overflow-wrap: break-word');
    });

    it('does not insert duplicate style elements when called multiple times on re-render', () => {
      const doc = document.implementation.createHTMLDocument('EPUB Test');
      injectResilientEpubStyles(doc);
      injectResilientEpubStyles(doc);
      injectResilientEpubStyles(doc);

      const styles = doc.querySelectorAll(`#${RESILIENT_STYLE_ELEMENT_ID}`);
      expect(styles.length).toBe(1);
    });
  });

  describe('classifyTouchGesture - Horizontal Swipes', () => {
    const width = 800;

    it('classifies clear leftward swipe (moving to next page)', () => {
      // Swiped 80px left, only 10px vertical drift, in 250ms
      const action = classifyTouchGesture(200, 300, 120, 310, 250, width);
      expect(action).toEqual({ type: 'swipe', direction: 'left' });
    });

    it('classifies clear rightward swipe (moving to previous page)', () => {
      // Swiped 80px right, only 15px vertical drift, in 250ms
      const action = classifyTouchGesture(120, 300, 200, 315, 250, width);
      expect(action).toEqual({ type: 'swipe', direction: 'right' });
    });

    it('rejects swipe when horizontal distance is below threshold (50px)', () => {
      const action = classifyTouchGesture(200, 300, 160, 305, 200, width); // deltaX = -40
      expect(action.type).toBe('none');
    });

    it('rejects swipe when vertical movement is prominent (not dominant horizontal)', () => {
      // deltaX = 60px, deltaY = 40px (dominant ratio requires deltaX >= 2 * deltaY = 80px)
      const action = classifyTouchGesture(100, 100, 160, 140, 250, width);
      expect(action).toEqual({ type: 'none', reason: 'vertical_movement_not_dominant' });
    });

    it('rejects swipe when gesture was predominantly vertical scroll', () => {
      // deltaX = 30px, deltaY = 120px
      const action = classifyTouchGesture(100, 100, 130, 220, 300, width);
      expect(action.type).toBe('none');
    });

    it('rejects swipe when duration is too long (slow scroll/drag > 600ms)', () => {
      const action = classifyTouchGesture(100, 100, 200, 105, 750, width);
      expect(action.type).toBe('none');
    });

    it('rejects swipe when duration is too short (accidental flick/jitter < 40ms)', () => {
      const action = classifyTouchGesture(100, 100, 200, 105, 25, width);
      expect(action.type).toBe('none');
    });
  });

  describe('classifyTouchGesture - Edge & Center Taps', () => {
    const width = 1000;

    it('classifies genuine tap in left 20% edge zone as prev', () => {
      // start at x=100 (10%), end at x=102, delta=2px, elapsed=120ms
      const action = classifyTouchGesture(100, 200, 102, 203, 120, width);
      expect(action.type).toBe('tap');
      if (action.type === 'tap') {
        expect(action.zone).toBe('left');
        expect(action.relativeX).toBeCloseTo(0.102, 2);
      }
    });

    it('classifies genuine tap in right 20% edge zone as next', () => {
      // start at x=880 (88%), end at x=884, delta=4px, elapsed=150ms
      const action = classifyTouchGesture(880, 200, 884, 198, 150, width);
      expect(action.type).toBe('tap');
      if (action.type === 'tap') {
        expect(action.zone).toBe('right');
        expect(action.relativeX).toBeCloseTo(0.884, 2);
      }
    });

    it('classifies genuine tap in center 60% zone as center toggle', () => {
      // start at x=500 (50%), end at x=502, delta=2px, elapsed=100ms
      const action = classifyTouchGesture(500, 200, 502, 201, 100, width);
      expect(action.type).toBe('tap');
      if (action.type === 'tap') {
        expect(action.zone).toBe('center');
      }
    });

    it('rejects tap if movement exceeds 12px (not a clean stationary tap)', () => {
      const action = classifyTouchGesture(100, 200, 118, 200, 120, width); // deltaX = 18px
      expect(action.type).toBe('none');
    });

    it('rejects tap if duration exceeds 350ms (hold or long press)', () => {
      const action = classifyTouchGesture(100, 200, 102, 201, 450, width);
      expect(action.type).toBe('none');
    });

    it('handles zero or negative container width gracefully', () => {
      const action = classifyTouchGesture(100, 200, 102, 201, 100, 0);
      expect(action).toEqual({ type: 'none', reason: 'invalid_container_width' });
    });
  });

  describe('isInteractiveElement Guard', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="container">
          <p id="paragraph">Simple reading text <span id="span">inside</span></p>
          <a id="link" href="#">A footnote link</a>
          <button id="button">A reader action</button>
          <input id="input" type="text" />
          <div id="interactive-role" role="button">Custom button</div>
          <canvas id="pdf-canvas"></canvas>
        </div>
      `;
    });

    it('returns true for anchor links', () => {
      const el = document.getElementById('link');
      expect(isInteractiveElement(el)).toBe(true);
    });

    it('returns true for buttons and custom role="button"', () => {
      const btn = document.getElementById('button');
      const roleBtn = document.getElementById('interactive-role');
      expect(isInteractiveElement(btn)).toBe(true);
      expect(isInteractiveElement(roleBtn)).toBe(true);
    });

    it('returns true for form inputs', () => {
      const input = document.getElementById('input');
      expect(isInteractiveElement(input)).toBe(true);
    });

    it('returns false for plain reading elements (paragraphs, spans, canvas, container)', () => {
      const p = document.getElementById('paragraph');
      const span = document.getElementById('span');
      const canvas = document.getElementById('pdf-canvas');
      const container = document.getElementById('container');

      expect(isInteractiveElement(p)).toBe(false);
      expect(isInteractiveElement(span)).toBe(false);
      expect(isInteractiveElement(canvas)).toBe(false);
      expect(isInteractiveElement(container)).toBe(false);
    });

    it('safely handles a DOM Text node target by inspecting its parent element', () => {
      const link = document.getElementById('link');
      const textNodeInLink = link?.firstChild; // Text node: "A footnote link"
      expect(textNodeInLink?.nodeType).toBe(Node.TEXT_NODE);
      expect(isInteractiveElement(textNodeInLink)).toBe(true);

      const p = document.getElementById('paragraph');
      const textNodeInP = p?.firstChild; // Text node: "Simple reading text "
      expect(textNodeInP?.nodeType).toBe(Node.TEXT_NODE);
      expect(isInteractiveElement(textNodeInP)).toBe(false);
    });

    it('returns false for null or non-Element targets', () => {
      expect(isInteractiveElement(null)).toBe(false);
      expect(isInteractiveElement(window as unknown as EventTarget)).toBe(false);
    });
  });

  describe('hasActiveSelection Guard', () => {
    it('returns false when there is no text selected', () => {
      window.getSelection()?.removeAllRanges();
      expect(hasActiveSelection()).toBe(false);
    });

    it('returns true when a non-collapsed selection is active', () => {
      const div = document.createElement('div');
      div.textContent = 'Selected text sample';
      document.body.appendChild(div);

      const range = document.createRange();
      range.selectNodeContents(div);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      expect(hasActiveSelection()).toBe(true);
      sel?.removeAllRanges();
      div.remove();
    });
  });

  describe('isContainerZoomed & isPannedToHorizontalBoundary Utilities', () => {
    it('accurately identifies when a container is horizontally zoomed past tolerance', () => {
      expect(isContainerZoomed(null)).toBe(false);

      const notZoomed = {
        scrollWidth: 800,
        clientWidth: 800,
      } as HTMLElement;
      expect(isContainerZoomed(notZoomed, 30)).toBe(false);

      const zoomed = {
        scrollWidth: 1600,
        clientWidth: 800,
      } as HTMLElement;
      expect(isContainerZoomed(zoomed, 30)).toBe(true);
    });

    it('permits horizontal swipe boundary detection on zoomed containers', () => {
      const zoomed = {
        scrollWidth: 1600,
        clientWidth: 800,
        scrollLeft: 400, // In the middle of zoomed page
      } as HTMLElement;

      // Panning left (next page): should be false when in the middle
      expect(isPannedToHorizontalBoundary(zoomed, 'left', 30)).toBe(false);
      // Panning right (prev page): should be false when in the middle
      expect(isPannedToHorizontalBoundary(zoomed, 'right', 30)).toBe(false);

      // Scrolled to right edge: scrollLeft = 800 (800 + 800 = 1600 >= 1600 - 30)
      const atRightEdge = {
        scrollWidth: 1600,
        clientWidth: 800,
        scrollLeft: 800,
      } as HTMLElement;
      expect(isPannedToHorizontalBoundary(atRightEdge, 'left', 30)).toBe(true);

      // Scrolled to left edge: scrollLeft = 0 (0 <= 30)
      const atLeftEdge = {
        scrollWidth: 1600,
        clientWidth: 800,
        scrollLeft: 0,
      } as HTMLElement;
      expect(isPannedToHorizontalBoundary(atLeftEdge, 'right', 30)).toBe(true);
    });
  });
});
