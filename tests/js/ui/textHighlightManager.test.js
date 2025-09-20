import {
    setHighlightState,
    setCompositeHighlight,
    HIGHLIGHT_CLASSES,
    setThinkingHighlight,
} from '@ui/textHighlightManager.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('textHighlightManager', () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;

    beforeEach(() => {
        jest.useFakeTimers();
        window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 16);
        window.cancelAnimationFrame = (handle) => clearTimeout(handle);
    });

    afterEach(() => {
        document
            .querySelectorAll('[data-thinking-active="true"]')
            .forEach((node) => setThinkingHighlight(node, false));
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        if (originalRequestAnimationFrame) {
            window.requestAnimationFrame = originalRequestAnimationFrame;
        } else {
            delete window.requestAnimationFrame;
        }
        if (originalCancelAnimationFrame) {
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        } else {
            delete window.cancelAnimationFrame;
        }
    });

    it('adds and removes highlight for direct element targets', () => {
        const el = document.createElement('span');
        setHighlightState(el, true);
        expect(el.classList.contains(HIGHLIGHT_CLASSES.text)).toBe(true);
        setHighlightState(el, false);
        expect(el.classList.contains(HIGHLIGHT_CLASSES.text)).toBe(false);
    });

    it('handles arrays of elements with custom class names', () => {
        const first = document.createElement('div');
        const second = document.createElement('div');
        setHighlightState([first, second], true, { className: 'custom-shimmer' });
        expect(first.classList.contains('custom-shimmer')).toBe(true);
        expect(second.classList.contains('custom-shimmer')).toBe(true);
        setHighlightState([first, second], false, { className: 'custom-shimmer' });
        expect(first.classList.contains('custom-shimmer')).toBe(false);
        expect(second.classList.contains('custom-shimmer')).toBe(false);
    });

    it('supports node() based selection-like targets', () => {
        const element = document.createElement('p');
        const selectionLike = {
            node() {
                return element;
            },
        };
        setHighlightState(selectionLike, true);
        expect(element.classList.contains(HIGHLIGHT_CLASSES.text)).toBe(true);
    });

    it('setCompositeHighlight toggles both text and background classes', () => {
        const textEl = document.createElement('span');
        const backgroundEl = document.createElement('div');
        setCompositeHighlight(textEl, backgroundEl, true);
        expect(textEl.classList.contains(HIGHLIGHT_CLASSES.text)).toBe(true);
        expect(backgroundEl.classList.contains(HIGHLIGHT_CLASSES.background)).toBe(true);
        setCompositeHighlight(textEl, backgroundEl, false);
        expect(textEl.classList.contains(HIGHLIGHT_CLASSES.text)).toBe(false);
        expect(backgroundEl.classList.contains(HIGHLIGHT_CLASSES.background)).toBe(false);
    });

    it('setThinkingHighlight splits text into animated character spans', () => {
        const tspan = document.createElementNS(SVG_NS, 'tspan');
        const label = 'Sep 2025';
        tspan.textContent = label;

        const customBase = 'rgba(255, 255, 255, 0.92)';
        const customDim = 'rgba(52, 168, 83, 0.85)';
        setThinkingHighlight(tspan, true, {
            disableAnimation: true,
            baseColor: customBase,
            dimColor: customDim,
            waveSize: 3,
        });

        const charSpans = tspan.querySelectorAll('.text-thinking-char');
        expect(charSpans.length).toBe(label.length);
        const fills = Array.from(charSpans).map((span) => span.getAttribute('fill'));
        expect(fills).toContain(customDim);
        expect(fills).toContain(customBase);
        expect(fills.every((fill) => Boolean(fill))).toBe(true);

        setThinkingHighlight(tspan, false);
        expect(tspan.textContent).toBe(label);
        expect(tspan.querySelectorAll('.text-thinking-char').length).toBe(0);
    });

    it('normalizes nested inputs and runs a single wave across grouped nodes', () => {
        const span1 = document.createElementNS(SVG_NS, 'tspan');
        span1.textContent = 'AB';
        span1.setAttribute('fill', '#34A853');
        const span2 = document.createElementNS(SVG_NS, 'tspan');
        span2.textContent = 'CD';
        span2.setAttribute('fill', '#EA4335');
        const groupWrapper = document.createElement('div');
        groupWrapper.appendChild(span1);
        groupWrapper.appendChild(span2);
        document.body.appendChild(groupWrapper);

        setThinkingHighlight([[span1], [span2]], true, {
            intervalMs: 8,
            waveSize: 1,
            baseColor: 'rgba(255, 255, 255, 0.9)',
            dimColor: 'rgba(120, 180, 255, 0.7)',
        });

        jest.advanceTimersByTime(16);

        const charOne = span1.querySelector('.text-thinking-char');
        const charTwo = span2.querySelector('.text-thinking-char');
        expect(charOne).not.toBeNull();
        expect(charTwo).not.toBeNull();
        const baseFillPreserved = charTwo.getAttribute('data-thinking-base-fill');
        expect(baseFillPreserved).toBe('#EA4335');

        span1.remove();
        jest.advanceTimersByTime(16);

        setThinkingHighlight([span1, span2], false);
        expect(span1.textContent).toBe('AB');
        expect(span2.textContent).toBe('CD');
    });

    it('handles selection-like each targets and node-based lookups', () => {
        const el = document.createElement('span');
        const selection = {
            each(callback) {
                callback.call(el);
            },
        };
        setHighlightState(selection, true);
        expect(el.classList.contains(HIGHLIGHT_CLASSES.text)).toBe(true);

        const nodeTarget = {
            node() {
                return el;
            },
        };
        setHighlightState(nodeTarget, false);
        expect(el.classList.contains(HIGHLIGHT_CLASSES.text)).toBe(false);
    });

    it('respects reduced motion preference when scheduling animations', () => {
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = jest.fn(() => ({ matches: true }));
        const tspan = document.createElementNS(SVG_NS, 'tspan');
        tspan.textContent = 'Calm';

        setThinkingHighlight(tspan, true);
        expect(tspan.querySelectorAll('.text-thinking-char').length).toBe('Calm'.length);
        setThinkingHighlight(tspan, false);

        window.matchMedia = originalMatchMedia;
    });

    it('falls back to setTimeout when requestAnimationFrame is unavailable', () => {
        const previousRaf = window.requestAnimationFrame;
        const previousCancel = window.cancelAnimationFrame;
        delete window.requestAnimationFrame;
        delete window.cancelAnimationFrame;

        const tspan = document.createElementNS(SVG_NS, 'tspan');
        tspan.textContent = 'Timer';
        document.body.appendChild(tspan);
        setThinkingHighlight(tspan, true, { intervalMs: 5 });
        jest.advanceTimersByTime(20);
        const chars = tspan.querySelectorAll('.text-thinking-char');
        expect(chars.length).toBe('Timer'.length);
        setThinkingHighlight(tspan, false);
        tspan.remove();

        window.requestAnimationFrame = previousRaf;
        window.cancelAnimationFrame = previousCancel;
    });

    it('gracefully handles null, empty, and invalid targets', () => {
        expect(() => setHighlightState(null, true)).not.toThrow();
        expect(() => setThinkingHighlight(null, true)).not.toThrow();
        expect(() => setThinkingHighlight([], true)).not.toThrow();

        const bareNode = document.createTextNode('no-class');
        const pseudoElement = { nodeType: 1 };
        setHighlightState([bareNode, pseudoElement], true);

        const tspan = document.createElementNS(SVG_NS, 'tspan');
        tspan.textContent = '';
        setThinkingHighlight(tspan, true);
        setThinkingHighlight([{ foo: 'bar' }], false);
    });

    it('prevents duplicate initialization for active nodes', () => {
        const wrapper = document.createElement('div');
        const tspan = document.createElementNS(SVG_NS, 'tspan');
        tspan.textContent = 'Loop';
        wrapper.appendChild(tspan);
        document.body.appendChild(wrapper);
        setThinkingHighlight(tspan, true, { intervalMs: 5 });
        const initialCount = tspan.querySelectorAll('.text-thinking-char').length;
        setThinkingHighlight(tspan, true, { intervalMs: 5 });
        expect(tspan.querySelectorAll('.text-thinking-char').length).toBe(initialCount);
        setThinkingHighlight(tspan, false);
        wrapper.remove();
    });

    it('restores inline styles after stopping group highlights', () => {
        const span1 = document.createElementNS(SVG_NS, 'tspan');
        span1.textContent = 'Styled';
        span1.style.fill = 'rgb(10, 20, 30)';
        const span2 = document.createElementNS(SVG_NS, 'tspan');
        span2.textContent = 'Group';
        const wrapper = document.createElement('div');
        wrapper.appendChild(span1);
        wrapper.appendChild(span2);
        document.body.appendChild(wrapper);

        setThinkingHighlight([span1, span2], true, { intervalMs: 6, waveSize: 2 });
        jest.advanceTimersByTime(12);
        setThinkingHighlight([span1, span2], false);
        expect(span1.style.fill).toBe('rgb(10, 20, 30)');
        wrapper.remove();
    });

    it('allows groups to honor disableAnimation and reduced motion preferences', () => {
        const span1 = document.createElementNS(SVG_NS, 'tspan');
        span1.textContent = 'RM';
        const span2 = document.createElementNS(SVG_NS, 'tspan');
        span2.textContent = 'Safe';
        document.body.append(span1, span2);

        setThinkingHighlight([span1, span2], true, { disableAnimation: true });
        expect(span1.querySelectorAll('.text-thinking-char').length).toBe(2);
        setThinkingHighlight([span1, span2], false);

        const originalMatchMedia = window.matchMedia;
        window.matchMedia = jest.fn(() => {
            throw new Error('unsupported');
        });
        setThinkingHighlight([span1, span2], true, { intervalMs: 5 });
        jest.advanceTimersByTime(10);
        setThinkingHighlight([span1, span2], false);
        span1.remove();
        span2.remove();
        window.matchMedia = originalMatchMedia;
    });

    it('advances wave over time for single nodes', () => {
        const wrapper = document.createElement('div');
        const tspan = document.createElementNS(SVG_NS, 'tspan');
        tspan.textContent = 'Wave';
        wrapper.appendChild(tspan);
        document.body.appendChild(wrapper);

        setThinkingHighlight(tspan, true, { intervalMs: 5, waveSize: 1 });
        const firstFrame = Array.from(tspan.querySelectorAll('.text-thinking-char')).map((span) =>
            span.getAttribute('fill')
        );
        jest.advanceTimersByTime(16);
        const afterFirst = Array.from(tspan.querySelectorAll('.text-thinking-char')).map((span) =>
            span.getAttribute('fill')
        );
        jest.advanceTimersByTime(16);
        const afterSecond = Array.from(tspan.querySelectorAll('.text-thinking-char')).map((span) =>
            span.getAttribute('fill')
        );
        expect(afterFirst).toEqual(firstFrame);
        expect(afterSecond).not.toEqual(firstFrame);
        setThinkingHighlight(tspan, false);
        wrapper.remove();
    });
});
