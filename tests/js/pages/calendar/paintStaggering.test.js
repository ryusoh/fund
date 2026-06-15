import { SvgRenderer } from '@pages/calendar/renderers/SvgRenderer.js';
import * as colorUtils from '@pages/calendar/colorUtils.js';
import * as bevelGlassPlugin from '@pages/calendar/bevelGlassPlugin.js';
import * as svgLabels from '@pages/calendar/renderers/svgLabels.js';

jest.mock('@pages/calendar/colorUtils.js', () => ({
    applyCurrencyColors: jest.fn(),
    getValueFieldForCurrency: jest.fn(),
}));

jest.mock('@pages/calendar/bevelGlassPlugin.js', () => ({
    applyBevelGlass: jest.fn(),
}));

jest.mock('@pages/calendar/renderers/svgLabels.js', () => ({
    renderLabels: jest.fn(),
}));

global.CalHeatmap = jest.fn(() => ({ on: jest.fn(), paint: jest.fn() }));
global.d3 = { select: jest.fn(), selectAll: jest.fn() };

// The post-paint passes (colour → bevel → labels) now live in SvgRenderer.renderState.
// On first paint they stagger across animation frames; afterwards they run together.
describe('SvgRenderer.renderState staggering', () => {
    let originalRAF;
    let rAFCallbacks;
    const ctx = { byDate: new Map(), state: {}, currencySymbols: {} };

    beforeEach(() => {
        rAFCallbacks = [];
        originalRAF = window.requestAnimationFrame;
        window.requestAnimationFrame = jest.fn((cb) => {
            rAFCallbacks.push(cb);
            return rAFCallbacks.length;
        });
        colorUtils.applyCurrencyColors.mockClear();
        bevelGlassPlugin.applyBevelGlass.mockClear();
        svgLabels.renderLabels.mockClear();
    });

    afterEach(() => {
        window.requestAnimationFrame = originalRAF;
        jest.clearAllMocks();
    });

    it('staggers updates across frames on initial load', () => {
        const renderer = new SvgRenderer();
        renderer.renderState({ ...ctx, isInitialLoad: true });

        // Frame 1: colours run synchronously; bevel/labels deferred
        expect(colorUtils.applyCurrencyColors).toHaveBeenCalledTimes(1);
        expect(bevelGlassPlugin.applyBevelGlass).toHaveBeenCalledTimes(0);
        expect(svgLabels.renderLabels).toHaveBeenCalledTimes(0);
        expect(rAFCallbacks.length).toBe(1);

        // Frame 2: bevel
        rAFCallbacks.shift()();
        expect(bevelGlassPlugin.applyBevelGlass).toHaveBeenCalledTimes(1);
        expect(svgLabels.renderLabels).toHaveBeenCalledTimes(0);
        expect(rAFCallbacks.length).toBe(1);

        // Frame 3: labels
        rAFCallbacks.shift()();
        expect(svgLabels.renderLabels).toHaveBeenCalledTimes(1);
        expect(rAFCallbacks.length).toBe(0);
    });

    it('runs all passes in one frame on subsequent loads to prevent flicker', () => {
        const renderer = new SvgRenderer();
        renderer.renderState({ ...ctx, isInitialLoad: false });

        expect(colorUtils.applyCurrencyColors).toHaveBeenCalledTimes(1);
        expect(bevelGlassPlugin.applyBevelGlass).toHaveBeenCalledTimes(1);
        expect(svgLabels.renderLabels).toHaveBeenCalledTimes(1);
        expect(rAFCallbacks.length).toBe(0);
    });
});
