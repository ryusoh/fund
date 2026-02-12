import { jest } from '@jest/globals';

describe('Volume bar width and centering', () => {
    let drawVolumeChart;
    let mockCtx;
    let fillRectCalls;

    beforeEach(() => {
        jest.resetModules();

        // Mock drawAxes and drawMarker used by contributionComponents
        jest.doMock('@js/transactions/chart/core.js', () => ({
            drawAxes: jest.fn(),
            drawMarker: jest.fn(),
        }));

        const mod = require('@js/transactions/chart/renderers/contributionComponents.js');
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

    test('single buy bar should be 4px wide', () => {
        const opts = makeOptions();
        const data = [makeEntry('2024-06-15', 'buy', 1000)];

        drawVolumeChart(mockCtx, data, opts);

        expect(fillRectCalls.length).toBe(1);
        expect(fillRectCalls[0].w).toBe(4);
    });

    test('single sell bar should be 4px wide', () => {
        const opts = makeOptions();
        const data = [makeEntry('2024-06-15', 'sell', 500)];

        drawVolumeChart(mockCtx, data, opts);

        expect(fillRectCalls.length).toBe(1);
        expect(fillRectCalls[0].w).toBe(4);
    });

    test('two bars same day: dominant bar is 8px, smaller bar is 4px', () => {
        const opts = makeOptions();
        const data = [makeEntry('2024-06-15', 'buy', 1000), makeEntry('2024-06-15', 'sell', 400)];

        drawVolumeChart(mockCtx, data, opts);

        expect(fillRectCalls.length).toBe(2);
        const widths = fillRectCalls.map((c) => c.w).sort((a, b) => b - a);
        expect(widths).toEqual([8, 4]);
    });

    test('two bars same day with equal volume: buy is 8px, sell is 4px', () => {
        const opts = makeOptions();
        const data = [makeEntry('2024-06-15', 'buy', 500), makeEntry('2024-06-15', 'sell', 500)];

        drawVolumeChart(mockCtx, data, opts);

        expect(fillRectCalls.length).toBe(2);
        const widths = fillRectCalls.map((c) => c.w).sort((a, b) => b - a);
        expect(widths).toEqual([8, 4]);
    });

    test('smaller bar is horizontally centered within the dominant bar', () => {
        const opts = makeOptions();
        const data = [makeEntry('2024-06-15', 'buy', 1000), makeEntry('2024-06-15', 'sell', 400)];

        drawVolumeChart(mockCtx, data, opts);

        expect(fillRectCalls.length).toBe(2);

        // Sort by width descending: dominant first
        const sorted = [...fillRectCalls].sort((a, b) => b.w - a.w);
        const dominant = sorted[0];
        const smaller = sorted[1];

        // Both bars should share the same center x
        const dominantCenter = dominant.x + dominant.w / 2;
        const smallerCenter = smaller.x + smaller.w / 2;

        // Allow 1px tolerance due to Math.round
        expect(Math.abs(dominantCenter - smallerCenter)).toBeLessThanOrEqual(1);
    });

    test('bar x positions are rounded to whole pixels', () => {
        const opts = makeOptions();
        const data = [makeEntry('2024-06-15', 'buy', 1000)];

        drawVolumeChart(mockCtx, data, opts);

        expect(fillRectCalls.length).toBe(1);
        expect(Number.isInteger(fillRectCalls[0].x)).toBe(true);
    });
});
