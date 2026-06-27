import { WebGLCaustics } from '../../../js/ui/webglCaustics.js';

jest.mock('../../../js/vendor/three.module.js', () => {
    return {
        OrthographicCamera: class {},
        PlaneGeometry: class {
            dispose() {}
        },
        Scene: class {
            add() {}
        },
        ShaderMaterial: class {
            constructor(params) {
                this.uniforms = params.uniforms || {};
            }
        },
        WebGLRenderer: class {
            constructor() {
                this.capabilities = {
                    isWebGL2: true,
                };
                this.extensions = {
                    get: jest.fn(() => ({})),
                };
                this.domElement = global.document.createElement('canvas');
            }
            setPixelRatio() {}
            setSize() {}
            setRenderTarget() {}
            render() {}
            clear() {}
            dispose() {}
        },
        Mesh: class {},
        Clock: class {
            start() {}
            getDelta() {
                return 0.016;
            }
            get elapsedTime() {
                return 1.0;
            }
        },
        WebGLRenderTarget: class {},
        HalfFloatType: 1,
        NearestFilter: 2,
        LinearFilter: 3,
        RGBAFormat: 4,
        Vector2: class {},
        CanvasTexture: class {},
    };
});

describe('WebGLCaustics', () => {
    let element;
    let originalMatchMedia;

    beforeEach(() => {
        element = document.createElement('div');
        document.body.appendChild(element);

        // Mock matchMedia for testing the reduced motion exit
        originalMatchMedia = window.matchMedia;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        window.matchMedia = originalMatchMedia;
        jest.restoreAllMocks();
    });

    test('exits early when WebGL is unavailable', () => {
        // By default JSDOM doesn't support WebGL context unless we explicitly install gl
        const caustics = new WebGLCaustics(element);
        expect(caustics.enabled).toBe(false);
    });

    test('exits early when reduced motion is preferred', () => {
        // Mock that webgl is available for this test specifically
        const originalCreateElement = document.createElement;
        jest.spyOn(document, 'createElement').mockImplementation((tag) => {
            if (tag === 'canvas') {
                const canvas = originalCreateElement.call(document, 'canvas');
                canvas.getContext = jest.fn((type) => {
                    if (type === 'webgl' || type === 'experimental-webgl' || type === '2d') {
                        return {}; // dummy context
                    }
                    return null;
                });
                return canvas;
            }
            return originalCreateElement.call(document, tag);
        });

        // Mock prefers-reduced-motion
        window.matchMedia = jest.fn((query) => {
            if (query === '(prefers-reduced-motion: reduce)') {
                return { matches: true };
            }
            return { matches: false };
        });

        const caustics = new WebGLCaustics(element);
        expect(caustics.enabled).toBe(false);
    });

    test('initializes, starts, stops, and disposes correctly when WebGL is available and reduced motion is false', () => {
        // Force WebGLRenderingContext globally so canUseWebGL succeeds
        const origWebGL = window.WebGLRenderingContext;
        window.WebGLRenderingContext = function () {};
        window.WebGL2RenderingContext = function () {};

        const originalCreateElement = document.createElement;
        jest.spyOn(document, 'createElement').mockImplementation((tag) => {
            if (tag === 'canvas') {
                const canvas = originalCreateElement.call(document, 'canvas');
                canvas.getContext = jest.fn((type) => {
                    if (type === 'webgl' || type === 'experimental-webgl' || type === '2d') {
                        return { fillRect: jest.fn() };
                    }
                    return null;
                });
                return canvas;
            }
            return originalCreateElement.call(document, tag);
        });

        window.matchMedia = jest.fn(() => ({ matches: false }));

        // Mock requestAnimationFrame and cancelAnimationFrame
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            return setTimeout(cb, 0);
        });
        jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
            clearTimeout(id);
        });

        // Mock ResizeObserver
        class MockResizeObserver {
            observe() {}
            disconnect() {}
        }
        window.ResizeObserver = MockResizeObserver;

        // Provide a clientWidth/clientHeight for the container
        Object.defineProperty(element, 'clientWidth', { value: 500, configurable: true });
        Object.defineProperty(element, 'clientHeight', { value: 500, configurable: true });

        // Add children to simulate querySelectorAll finding elements
        const cell = document.createElement('div');
        cell.className = 'ch-day';
        element.appendChild(cell);

        const caustics = new WebGLCaustics(element);
        expect(caustics.enabled).toBe(true);

        caustics.start();
        expect(caustics.isRunning).toBe(true);

        caustics.stop();
        expect(caustics.isRunning).toBe(false);

        caustics.resize(); // trigger resize block manually

        // Step with no pointer
        caustics.step();

        // Dispatch pointermove
        const pointerEvent = document.createEvent('Event');
        pointerEvent.initEvent('pointermove', true, true);
        pointerEvent.clientX = 100;
        pointerEvent.clientY = 100;
        element.dispatchEvent(pointerEvent);

        // Step to trigger pointer branch
        caustics.step();

        caustics.dispose();
        expect(caustics.enabled).toBe(false);

        window.WebGLRenderingContext = origWebGL;
        delete window.WebGL2RenderingContext;
    });
});
