import { jest } from '@jest/globals';

jest.setTimeout(15000);

// Mock dependent modules
jest.mock('@js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
    drawEndValue: jest.fn(),
    generateConcreteTicks: jest.fn().mockReturnValue([0, 250, 500, 750, 1000]),
}));

jest.mock('@js/transactions/chart/interaction.js', () => ({
    updateLegend: jest.fn(),
    updateCrosshairUI: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
}));

jest.mock('@js/transactions/chart/animation.js', () => ({
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
    stopPeAnimation: jest.fn(),
    stopConcentrationAnimation: jest.fn(),
    drawSeriesGlow: jest.fn(),
}));

jest.mock('@js/transactions/chart/helpers.js', () => ({
    getChartColors: jest.fn().mockReturnValue({
        primary: '#ff0000',
        secondary: '#00ff00',
        portfolio: '#7a7a7a',
        contribution: '#b3b3b3',
    }),
    createTimeInterpolator: jest.fn().mockReturnValue(() => 10),
    parseLocalDate: jest.fn((dateStr) => new Date(dateStr)),
}));

import { drawAxes, drawEndValue } from '@js/transactions/chart/core.js';
import { updateLegend } from '@js/transactions/chart/interaction.js';
import { drawYieldChart } from '@js/transactions/chart/renderers/yield.js';

describe('Yield Chart Rendering & Interaction', () => {
    let ctx;
    let canvas;
    let chartManager;

    const mockData = [
        { date: '2023-01-01', forward_yield: 1.5, ttm_income: 1000.0 },
        { date: '2023-06-01', forward_yield: 1.6, ttm_income: 1100.0 },
        { date: '2024-01-01', forward_yield: 1.8, ttm_income: 1200.0 },
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock global fetch
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockData),
            })
        );

        // Mock window and computed style
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1024,
        });
        window.getComputedStyle = jest.fn().mockReturnValue({
            getPropertyValue: jest.fn().mockReturnValue('#7a7a7a'),
        });

        canvas = {
            width: 2000, // Physical width (High DPI)
            height: 1000, // Physical height
            offsetWidth: 1000, // Logical CSS width
            offsetHeight: 500, // Logical CSS height
        };

        ctx = {
            canvas,
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fillRect: jest.fn(),
            fillText: jest.fn(),
            measureText: jest.fn().mockReturnValue({ width: 50 }),
        };

        chartManager = {
            update: jest.fn(),
        };
    });

    test('uses offsetWidth/offsetHeight for logical scaling on High-DPI screens', async () => {
        // First call triggers load
        await drawYieldChart(ctx, chartManager);
        // Wait for data load + second call
        await drawYieldChart(ctx, chartManager);

        expect(drawAxes).toHaveBeenCalled();
        const callArgs = drawAxes.mock.calls[0];

        // drawAxes(ctx, margin, chartWidth, chartHeight, ...)
        // chartWidth should be derived from offsetWidth (1000) not width (2000)
        // Margin left=60, right=60 -> 1000 - 120 = 880
        expect(callArgs[2]).toBe(880);

        // chartHeight from offsetHeight (500)
        // Margin top=40, bottom=40 -> 500 - 80 = 420
        expect(callArgs[3]).toBe(420);
    });

    test('calls drawAxes with correct function arguments for X and Y scales', async () => {
        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        const callArgs = drawAxes.mock.calls[0];
        const xScale = callArgs[8];
        const yScale = callArgs[9];

        // Ensure they are functions
        expect(typeof xScale).toBe('function');
        expect(typeof yScale).toBe('function');

        // Test scale mapping (simple check)
        // minTime (index 4) should map to margin.left (60)
        expect(xScale(callArgs[4])).toBeCloseTo(60);
    });

    test('passes series with "name" property to updateLegend', async () => {
        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        expect(updateLegend).toHaveBeenCalled();
        const series = updateLegend.mock.calls[0][0];

        expect(series).toHaveLength(2);
        expect(series[0]).toHaveProperty('name', 'Yield');
        expect(series[0]).toHaveProperty('key', 'Yield');
        expect(series[1]).toHaveProperty('name', 'Income');
        expect(series[1]).toHaveProperty('key', 'Income');
    });

    test('calls drawEndValue with correct positional arguments', async () => {
        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        expect(drawEndValue).toHaveBeenCalled();
        const args = drawEndValue.mock.calls[0];

        // drawEndValue(ctx, x, y, value, color, isMobile, padding, plotWidth, plotHeight, formatValue, showBackground)
        expect(args[0]).toBe(ctx); // ctx
        expect(typeof args[1]).toBe('number'); // x
        expect(typeof args[2]).toBe('number'); // y
        expect(typeof args[3]).toBe('number'); // value
        expect(typeof args[4]).toBe('string'); // color
        expect(typeof args[5]).toBe('boolean'); // isMobile
        expect(typeof args[6]).toBe('object'); // padding
        expect(typeof args[7]).toBe('number'); // plotWidth
        expect(typeof args[8]).toBe('number'); // plotHeight
        expect(typeof args[9]).toBe('function'); // formatValue
        expect(args[10]).toBe(true); // showBackground
    });
});
