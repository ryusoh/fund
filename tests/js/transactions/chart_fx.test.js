import { jest } from '@jest/globals';
import { drawFxChart, buildFxChartSeries } from '@js/transactions/chart/renderers/fx.js';
import { transactionState } from '@js/transactions/state.js';
import { chartLayouts } from '@js/transactions/chart/state.js';
import { createTimeInterpolator } from '@js/transactions/chart/helpers.js';

// Mock helpers
jest.mock('@js/transactions/chart/helpers.js', () => ({
    getChartColors: jest.fn().mockReturnValue({ fx: '#000000', grid: '#cccccc' }),
    createTimeInterpolator: jest.fn(),
    clampTime: jest.fn(),
    parseLocalDate: jest.requireActual('@js/transactions/chart/helpers.js').parseLocalDate,
    getSmoothingConfig: jest.fn().mockReturnValue({ enabled: false }),
}));

jest.mock('@js/transactions/utils.js', () => ({
    convertBetweenCurrencies: jest.fn().mockReturnValue(1.5),
}));

jest.mock('@js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
    drawEndValue: jest.fn(),
    computePercentTickInfo: jest.fn().mockReturnValue({ ticks: [0, 10, 20], range: 20 }),
    drawMountainFill: jest.fn(),
}));

jest.mock('@js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    updateLegend: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
}));

jest.mock('@js/transactions/chart/animation.js', () => ({
    stopFxAnimation: jest.fn(),
    isAnimationEnabled: jest.fn().mockReturnValue(false),
    advanceFxAnimation: jest.fn().mockReturnValue(1),
    drawSeriesGlow: jest.fn(),
    scheduleFxAnimation: jest.fn(),
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
}));

describe('fx.js renderer start time', () => {
    let mockCtx;
    let mockChartManager;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCtx = {
            canvas: {
                offsetWidth: 800,
                offsetHeight: 600,
            },
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            fillText: jest.fn(),
            measureText: jest.fn().mockReturnValue({ width: 50 }),
            createLinearGradient: jest.fn().mockReturnValue({
                addColorStop: jest.fn(),
            }),
        };

        mockChartManager = {};

        // Reset state
        transactionState.fxRatesByCurrency = {};
        transactionState.portfolioSeries = [];
        transactionState.chartDateRange = { from: null, to: null };
        transactionState.selectedCurrency = 'USD';
        transactionState.chartVisibility = {};
    });

    it('clamps filterFrom to the earliest portfolioSeries date when "all" (no filter) is applied', async () => {
        // Setup initial FX data spanning far back in time
        transactionState.fxRatesByCurrency = {
            USD: {
                sorted: [
                    { date: '2000-01-01', ts: null },
                    { date: '2010-01-01', ts: null },
                ],
            },
            CNY: {
                sorted: [
                    { date: '2000-01-01', ts: null },
                    { date: '2020-01-01', ts: null }, // Portfolio starts here
                    { date: '2020-06-01', ts: null },
                    { date: '2021-01-01', ts: null },
                ],
                map: new Map([
                    ['2000-01-01', 0.8],
                    ['2020-01-01', 0.9],
                    ['2020-06-01', 0.95],
                    ['2021-01-01', 0.85],
                ]),
            },
        };

        // Setup portfolio series starting much later
        transactionState.portfolioSeries = [
            { date: '2020-01-01', value: 1000 },
            { date: '2021-01-01', value: 1100 },
        ];

        // Ensure we check CNY
        transactionState.portfolioSeriesByCurrency = { CNY: [] };

        const seriesData = buildFxChartSeries('USD');
        console.log('seriesData', seriesData);

        await drawFxChart(mockCtx, mockChartManager, 0);

        expect(chartLayouts.fx).toBeDefined();

        const expectedMinTime = new Date('2020-01-01').getTime();

        // 1. Min time bounds should match portfolio start
        expect(chartLayouts.fx.minTime).toBe(expectedMinTime);

        // 2. The baseline for the percent change should start exactly on the portfolio start date
        // Instead of reading points from the layout series (which are swallowed by interpolator calls),
        // we check the arguments passed to createTimeInterpolator
        const calls = createTimeInterpolator.mock.calls;
        const pointsArg = calls
            .map((c) => c[0])
            .find(
                (arr) =>
                    arr && arr.length > 0 && arr[0].time === expectedMinTime && arr[0].value === 0
            );

        expect(pointsArg).toBeDefined();
        expect(pointsArg[0].time).toBe(expectedMinTime);
        expect(pointsArg[0].value).toBe(0); // 0% baseline at the portfolio start
    });
});
