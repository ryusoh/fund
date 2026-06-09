import { __testables } from '@pages/calendar/index.js';
import * as colorUtils from '@pages/calendar/colorUtils.js';
import * as bevelGlassPlugin from '@pages/calendar/bevelGlassPlugin.js';

jest.mock('@pages/calendar/colorUtils.js', () => ({
    applyCurrencyColors: jest.fn(),
    getValueFieldForCurrency: jest.fn(),
}));

jest.mock('@pages/calendar/bevelGlassPlugin.js', () => ({
    applyBevelGlass: jest.fn(),
}));

const createSelection = () => ({
    attr: jest.fn(() => createSelection()),
    style: jest.fn(() => createSelection()),
    text: jest.fn(() => createSelection()),
    each: jest.fn(),
    selectAll: jest.fn(() => createSelection()),
    select: jest.fn(() => createSelection()),
});

const mockD3 = {
    select: jest.fn(() => createSelection()),
    selectAll: jest.fn(() => createSelection()),
};
global.d3 = mockD3;
global.window = Object.create(window);

describe('queuePostPaintFrame staggering', () => {
    let originalRequestAnimationFrame;
    let rAFCallbacks = [];

    beforeEach(() => {
        originalRequestAnimationFrame = window.requestAnimationFrame;
        window.requestAnimationFrame = jest.fn((cb) => {
            rAFCallbacks.push(cb);
            return 1;
        });
        rAFCallbacks = [];
        __testables.resetInitialLoadState();
        colorUtils.applyCurrencyColors.mockClear();
        bevelGlassPlugin.applyBevelGlass.mockClear();
    });

    afterEach(() => {
        window.requestAnimationFrame = originalRequestAnimationFrame;
        jest.clearAllMocks();
    });

    it('staggers updates across frames on initial load', () => {
        expect(__testables.isInitialLoad).toBe(true);

        __testables.schedulePostPaintUpdates({}, {}, {}, {});

        // queuePostPaintFrame schedules the first frame.
        expect(rAFCallbacks.length).toBe(1);

        // Execute frame 0 (the main queuePostPaintFrame body)
        rAFCallbacks[0]();
        rAFCallbacks.shift();

        // Frame 1 logic runs:
        expect(colorUtils.applyCurrencyColors).toHaveBeenCalledTimes(1);
        expect(bevelGlassPlugin.applyBevelGlass).toHaveBeenCalledTimes(0);

        // Frame 2 scheduled:
        expect(rAFCallbacks.length).toBe(1);
        rAFCallbacks[0]();
        rAFCallbacks.shift();

        // Frame 2 logic runs:
        expect(bevelGlassPlugin.applyBevelGlass).toHaveBeenCalledTimes(1);

        // Frame 3 scheduled (renderLabels):
        expect(rAFCallbacks.length).toBe(1);
    });

    it('executes synchronously in one frame on subsequent loads to prevent flicker', () => {
        __testables.isInitialLoad = false;

        __testables.schedulePostPaintUpdates({}, {}, {}, {});

        // queuePostPaintFrame schedules one frame to run the batch.
        expect(rAFCallbacks.length).toBe(1);

        // Execute the scheduled frame
        rAFCallbacks[0]();
        rAFCallbacks.shift();

        // All functions should run immediately in the same frame
        expect(colorUtils.applyCurrencyColors).toHaveBeenCalledTimes(1);
        expect(bevelGlassPlugin.applyBevelGlass).toHaveBeenCalledTimes(1);

        // No more frames should be scheduled
        expect(rAFCallbacks.length).toBe(0);
    });
});
