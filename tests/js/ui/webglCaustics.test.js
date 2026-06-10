import { WebGLCaustics } from '../../../js/ui/webglCaustics.js';

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
                    if (type === 'webgl' || type === 'experimental-webgl') {
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
});
