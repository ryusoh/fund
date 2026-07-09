import { jest } from '@jest/globals';

describe('Volume bar width and centering', () => {
    let drawVolumeChart;
    let mockCtx;
    let fillRectCalls;

    beforeEach(() => {
        jest.resetModules();

        // Mock drawAxes and drawMarker used by contributionComponents
        jest.doMock('../../../js/transactions/chart/core.js', () => ({
            drawAxes: jest.fn(),
            drawMarker: jest.fn(),
        }));

        const mod = require('../../../js/transactions/chart/renderers/contributionComponents.js');
        drawVolumeChart = mod.drawVolumeChart;

        fillRectCalls = [];
        mockCtx = {
            fillRect: jest.fn((x, y, w, h) => fillRectCalls.push({ x, y, w, h })),
            strokeRect: jest.fn(),
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
        };
    });

    function makeOptions(overrides = {}) {
        const minTime = new Date('2024-01-01').getTime();
        const maxTime = new Date('2024-12-31').getTime();
        const plotWidth = 800;
        const padding = { top: 20, right: 30, bottom: 40, left: 60 };
        return {
            showBuy: true,
            showSell: true,
            minTime,
            maxTime,
            volumeHeight: 100,
            volumeTop: 300,
            padding,
            plotWidth,
            xScale: (t) => padding.left + ((t - minTime) / (maxTime - minTime)) * plotWidth,
            formatCurrencyCompact: (v) => `$${v}`,
            selectedCurrency: 'USD',
            ...overrides,
        };
    }

    function makeEntry(date, orderType, netAmount, extras = {}) {
        return {
            date: new Date(date),
            orderType,
            netAmount,
            ...extras,
        };
    }

    test('single buy bar should be 1px wide based on 365 day density', () => {
        const opts = makeOptions();
        const data = [makeEntry('2024-06-15', 'buy', 1000)];

        drawVolumeChart(mockCtx, data, opts);

        expect(fillRectCalls.length).toBe(1);
        expect(fillRectCalls[0].w).toBe(1);
    });

    test('single sell bar should be 1px wide based on 365 day density', () => {
        const opts = makeOptions();
        const data = [makeEntry('2024-06-15', 'sell', 500)];

        drawVolumeChart(mockCtx, data, opts);

        expect(fillRectCalls.length).toBe(1);
        expect(fillRectCalls[0].w).toBe(1);
    });

    test('two bars same day: both are 1px wide because they diverge from baseline', () => {
        const opts = makeOptions();
        const data = [makeEntry('2024-06-15', 'buy', 1000), makeEntry('2024-06-15', 'sell', 400)];

        drawVolumeChart(mockCtx, data, opts);

        expect(fillRectCalls.length).toBe(2);
        const widths = fillRectCalls.map((c) => c.w);
        expect(widths).toEqual([1, 1]);
    });

    test('bar x positions are rounded to whole pixels', () => {
        const opts = makeOptions();
        const data = [makeEntry('2024-06-15', 'buy', 1000)];

        drawVolumeChart(mockCtx, data, opts);

        expect(fillRectCalls.length).toBe(1);
        expect(Number.isInteger(fillRectCalls[0].x)).toBe(true);
    });

    test('diverging geometry: buy bars extend above baseline, sell bars extend below', () => {
        // Regression guard — a previous edit silently reverted the diverging geometry
        // (zero baseline at midpoint, buys up, sells down). See docs/y-axis-tick-algorithm.md
        const opts = makeOptions();
        const data = [makeEntry('2024-03-15', 'buy', 5000), makeEntry('2024-09-15', 'sell', 3000)];

        drawVolumeChart(mockCtx, data, opts);

        expect(fillRectCalls.length).toBe(2);

        // In canvas, y increases downward. Buy bars should have y < baseline (extend upward)
        // and sell bars should have y >= baseline (extend downward).
        // The baseline is approximately at volumeTop + volumeHeight/2 for a diverging pane.
        const baseline = opts.volumeTop + opts.volumeHeight / 2;

        const buyCall = fillRectCalls[0]; // buy renders first
        const sellCall = fillRectCalls[1]; // sell renders second

        // Buy bar's top edge (y) must be above the baseline
        expect(buyCall.y).toBeLessThan(baseline);
        // Buy bar height must be positive (extends upward from near the baseline)
        expect(buyCall.h).toBeGreaterThan(0);

        // Sell bar's top edge starts at or near the baseline (within 10px tolerance for sqrt)
        expect(sellCall.y).toBeGreaterThanOrEqual(baseline - 10);
        // Sell bar extends downward
        expect(sellCall.h).toBeGreaterThan(0);
    });
});
