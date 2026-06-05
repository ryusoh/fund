/* global performance, KeyboardEvent */
/**
 * @jest-environment jsdom
 */

describe('Sketch coverage', () => {
    let Sketch;
    let originalRequestAnimationFrame;
    let originalCancelAnimationFrame;
    let mockContext;

    beforeEach(() => {
        document.body.innerHTML = '';

        // Setup Sketch requirements
        originalRequestAnimationFrame = window.requestAnimationFrame;
        originalCancelAnimationFrame = window.cancelAnimationFrame;

        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) =>
            setTimeout(() => cb(performance.now()), 0)
        );
        jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => clearTimeout(id));

        const originalCreateElement = document.createElement.bind(document);
        jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
            const el = originalCreateElement(tagName);
            if (tagName === 'canvas') {
                mockContext = {
                    canvas: el,
                    clearRect: jest.fn(),
                    fillRect: jest.fn(),
                    save: jest.fn(),
                    restore: jest.fn(),
                    scale: jest.fn(),
                    beginPath: jest.fn(),
                };
                el.getContext = jest.fn((type) => {
                    if (type === '2d') {
                        return mockContext;
                    }
                    if (type === 'webgl') {
                        return mockContext;
                    } // Mock webgl too
                    return null;
                });
            }
            return el;
        });

        // Ensure fresh Sketch module evaluation
        jest.resetModules();
        require('@js/ambient/sketch.js');
        Sketch = window.Sketch;
    });

    afterEach(() => {
        window.requestAnimationFrame = originalRequestAnimationFrame;
        window.cancelAnimationFrame = originalCancelAnimationFrame;
        jest.restoreAllMocks();
    });

    it('creates a 2d sketch context and exercises lifecycle events', async () => {
        const setupFn = jest.fn();
        const updateFn = jest.fn();
        const drawFn = jest.fn();
        const resizeFn = jest.fn();
        const mousemoveFn = jest.fn();
        const keyupFn = jest.fn();
        const keydownFn = jest.fn();
        const clickFn = jest.fn();

        const ctx = Sketch.create({
            type: Sketch.CANVAS,
            autostart: true,
            globals: true,
            setup: setupFn,
            update: updateFn,
            draw: drawFn,
            resize: resizeFn,
            mousemove: mousemoveFn,
            keyup: keyupFn,
            keydown: keydownFn,
            click: clickFn,
            retina: true,
            autoclear: true,
        });

        expect(ctx).toBeDefined();

        // Manually invoke the update loop a couple times
        await new Promise((r) => setTimeout(r, 10));

        expect(setupFn).toHaveBeenCalled();
        expect(resizeFn).toHaveBeenCalled();
        expect(updateFn).toHaveBeenCalled();
        expect(drawFn).toHaveBeenCalled();

        // Check clear
        ctx.clear();
        expect(mockContext.clearRect).toHaveBeenCalled();

        // Stop the sketch
        ctx.stop();
        ctx.toggle();
        expect(ctx.running).toBe(true);

        // trigger resize event on window
        window.dispatchEvent(new Event('resize'));

        // Trigger pointer events
        const canvas = ctx.canvas;

        // Touch events
        canvas.dispatchEvent(
            new TouchEvent('touchstart', {
                touches: [{ pageX: 50, pageY: 50, clientX: 50, clientY: 50 }],
            })
        );

        canvas.dispatchEvent(
            new TouchEvent('touchmove', {
                touches: [{ pageX: 60, pageY: 60, clientX: 60, clientY: 60 }],
            })
        );

        canvas.dispatchEvent(
            new TouchEvent('touchend', {
                touches: [],
            })
        );

        // trigger touch event where event.touches is undefined but event has a function
        const fakeTouch = new Event('touchstart');
        fakeTouch.touches = undefined;
        fakeTouch.fakeFunc = function () {};
        canvas.dispatchEvent(fakeTouch);

        // Try applying the proxy to cover line 61
        const mousemove = new MouseEvent('mousemove', { clientX: 10, clientY: 10 });
        mousemove.preventDefault = jest.fn(); // Mock this to ensure it's cloned/proxied
        canvas.dispatchEvent(mousemove);
        expect(mousemoveFn).toHaveBeenCalled();

        // Check if the proxy works
        const preventDefaultProxy = mousemoveFn.mock.calls[0][0].preventDefault;
        if (typeof preventDefaultProxy === 'function') {
            preventDefaultProxy();
        }

        const mousedown = new MouseEvent('mousedown', { clientX: 10, clientY: 10 });
        canvas.dispatchEvent(mousedown);

        const mouseup = new MouseEvent('mouseup', { clientX: 10, clientY: 10 });
        canvas.dispatchEvent(mouseup);

        canvas.dispatchEvent(new MouseEvent('click', { clientX: 10, clientY: 10 }));
        expect(clickFn).toHaveBeenCalled();

        canvas.dispatchEvent(new MouseEvent('mouseout', { clientX: 10, clientY: 10 }));
        canvas.dispatchEvent(new MouseEvent('mouseover', { clientX: 10, clientY: 10 }));

        // Keyboard events - Sketch adds listeners to document, so dispatch there
        const keydown = new KeyboardEvent('keydown', { keyCode: 32 });
        document.dispatchEvent(keydown);
        expect(keydownFn).toHaveBeenCalled();

        const keyup = new KeyboardEvent('keyup', { keyCode: 32 });
        document.dispatchEvent(keyup);
        expect(keyupFn).toHaveBeenCalled();

        // Blur event
        window.dispatchEvent(new Event('blur'));

        // Focus event
        window.dispatchEvent(new Event('focus'));

        ctx.destroy();
    });

    it('creates a webgl sketch context', () => {
        const ctx = Sketch.create({
            type: Sketch.WEBGL,
            autostart: false,
            globals: false,
        });
        expect(ctx).toBeDefined();
        expect(ctx.running).toBe(false);
    });

    it('creates a dom sketch context', () => {
        const ctx = Sketch.create({
            type: Sketch.DOM,
            autostart: false,
            globals: false,
            fullscreen: false,
            autoresize: true,
        });
        expect(ctx).toBeDefined();

        window.dispatchEvent(new Event('resize'));

        // create a parent so destroy can be fully covered
        const parent = document.createElement('div');
        parent.appendChild(ctx.element);
        ctx.destroy();
    });

    it('provides globals when requested', () => {
        Sketch.create({ type: Sketch.DOM, globals: true });
        expect(window.random).toBeDefined();
        expect(window.lerp).toBeDefined();
        expect(window.map).toBeDefined();

        // Test global helpers
        expect(window.random(1, 10)).toBeGreaterThanOrEqual(1);
        expect(window.random([1, 2, 3])).toBeDefined();
        expect(window.random(5)).toBeLessThanOrEqual(5);
        expect(window.lerp(0, 10, 0.5)).toBe(5);
        expect(window.map(5, 0, 10, 0, 100)).toBe(50);
    });
});
