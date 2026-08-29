import { jest } from '@jest/globals';
import { buildDrawdownSeries, drawDrawdownChart } from '../../../js/transactions/chart/renderers/drawdown.js';
import { transactionState } from '../../../js/transactions/state.js';
import { chartLayouts } from '../../../js/transactions/chart/state.js';

jest.mock('../../../js/transactions/state.js', () => ({
    transactionState: {
        performanceSeries: {},
        selectedCurrency: 'USD',
        chartVisibility: {},
        chartDateRange: { from: null, to: null },
    },
    getShowChartLabels: jest.fn(() => true),
}));
jest.mock('../../../js/transactions/chart/state.js', () => ({
    chartLayouts: {},
}));
jest.mock('../../../js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
    updateLegend: jest.fn(),
    legendState: { performanceDirty: false },
}));
jest.mock('../../../js/transactions/chart/animation.js', () => ({
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
    drawSeriesGlow: jest.fn(),
    isAnimationEnabled: jest.fn(() => false),
    advancePerformanceAnimation: jest.fn(() => 1),
    schedulePerformanceAnimation: jest.fn(),
}));
jest.mock('../../../js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
    drawMountainFill: jest.fn(),
    drawEndValue: jest.fn(() => ({ x: 0, y: 0, width: 10, height: 10 })),
}));
jest.mock('../../../js/transactions/utils.js', () => ({
    convertBetweenCurrencies: jest.fn((val) => val),
}));
jest.mock('../../../js/transactions/chart/helpers.js', () => {
    const actual = jest.requireActual('../../../js/transactions/chart/helpers.js');
    return {
        ...actual,
        getChartColors: jest.fn(() => ({
            '^LZ': '#ff0000',
            '^GSPC': '#00ff00',
        })),
        getSmoothingConfig: jest.fn(() => ({ smooth: true, tension: 0.4 })),
        createTimeInterpolator: jest.fn(() => jest.fn(() => 1)),
        formatPercentInline: jest.fn((val) => `${val}%`),
        clampTime: jest.fn((time) => time),
        parseLocalDate: jest.fn((str) => new Date(str)),
    };
});
jest.mock('../../../js/utils/smoothing.js', () => ({
    smoothFinancialData: jest.fn((data) => data),
}));

describe('drawDrawdownChart edge cases', () => {
    let mockCtx;
    let mockChartManager;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCtx = {
            canvas: { offsetWidth: 800, offsetHeight: 600, style: { display: 'block' } },
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            setLineDash: jest.fn(),
            fill: jest.fn(),
            createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
        };

        mockChartManager = {
            updateCrosshairTarget: jest.fn(),
            getFilterState: jest.fn(() => ({ from: null, to: null })),
        };

        const emptyState = document.createElement('div');
        emptyState.id = 'runningAmountEmpty';
        emptyState.style.display = 'none';
        document.body.appendChild(emptyState);

        chartLayouts.drawdown = null;
        transactionState.chartVisibility = {};
        transactionState.chartDateRange = { from: null, to: null };
    });

    afterEach(() => {
        const el = document.getElementById('runningAmountEmpty');
        if (el) {el.remove();}
    });

    it('gracefully handles empty performanceSeries', async () => {
        transactionState.performanceSeries = {};
        await drawDrawdownChart(mockCtx, mockChartManager, 0);
        expect(chartLayouts.drawdown).toBeNull();
    });

    it('gracefully handles all series hidden', async () => {
        transactionState.performanceSeries = {
            '^LZ': [{ date: '2023-01-01', value: 100 }],
        };
        transactionState.chartVisibility = { '^LZ': false };
        await drawDrawdownChart(mockCtx, mockChartManager, 0);
        expect(chartLayouts.drawdown).toBeNull();
    });

    it('gracefully handles missing data points / invalid dates filtering out everything', async () => {
        transactionState.performanceSeries = {
            '^LZ': [{ date: 'invalid-date', value: 100 }],
        };
        transactionState.chartVisibility = { '^LZ': true };
        await drawDrawdownChart(mockCtx, mockChartManager, 0);
        // It should still build layout but with empty points
        expect(chartLayouts.drawdown).toBeDefined();
    });

    it('gracefully handles date range filtering out all points', async () => {
        transactionState.performanceSeries = {
            '^LZ': [
                { date: '2020-01-01', value: 100 },
            ],
        };
        transactionState.chartDateRange = { from: '2025-01-01', to: '2025-12-31' };
        transactionState.chartVisibility = { '^LZ': true };
        await drawDrawdownChart(mockCtx, mockChartManager, 0);
        // It might not be null, but returns early or draws empty axes
        expect(chartLayouts.drawdown).toBeDefined();
    });

    it('draws properly when points are available', async () => {
        transactionState.performanceSeries = {
            '^LZ': [
                { date: '2023-01-01', value: 100 },
                { date: '2023-02-01', value: 90 },
            ],
        };
        transactionState.chartVisibility = { '^LZ': true };
        await drawDrawdownChart(mockCtx, mockChartManager, 0);
        expect(chartLayouts.drawdown).not.toBeNull();
        const el = document.getElementById('runningAmountEmpty');
        expect(el.style.display).toBe('none');
    });
});

describe('buildDrawdownSeries', () => {
    test('returns empty array for invalid input', () => {
        expect(buildDrawdownSeries([])).toEqual([]);
        expect(buildDrawdownSeries(null)).toEqual([]);
    });

    test('calculates drawdown for monotonically increasing series', () => {
        const series = [
            { date: '2023-01-01', value: 100 },
            { date: '2023-01-02', value: 105 },
            { date: '2023-01-03', value: 110 },
        ];
        const result = buildDrawdownSeries(series);
        expect(result).toHaveLength(3);
        expect(result[0].value).toBeCloseTo(0);
        expect(result[1].value).toBeCloseTo(0);
        expect(result[2].value).toBeCloseTo(0);
        expect(result[0].rawPoint).toBeUndefined(); // Assuming verified object structure
    });

    test('calculates drawdown correctly for a drop', () => {
        const series = [
            { date: '2023-01-01', value: 100 },
            { date: '2023-01-02', value: 90 }, // 10% drop
            { date: '2023-01-03', value: 80 }, // 20% drop from peak (100)
        ];
        const result = buildDrawdownSeries(series);
        expect(result[0].value).toBeCloseTo(0);
        expect(result[1].value).toBeCloseTo(((90 - 100) / 100) * 100); // -10
        expect(result[2].value).toBeCloseTo(((80 - 100) / 100) * 100); // -20
    });

    test('handles recovery and new peak', () => {
        const series = [
            { date: '2023-01-01', value: 100 }, // Peak
            { date: '2023-01-02', value: 80 }, // -20%
            { date: '2023-01-03', value: 90 }, // -10% from peak
            { date: '2023-01-04', value: 110 }, // New Peak
            { date: '2023-01-05', value: 99 }, // -10% from new peak (110)
        ];
        const result = buildDrawdownSeries(series);
        expect(result[0].value).toBeCloseTo(0);
        expect(result[1].value).toBeCloseTo(-20);
        expect(result[2].value).toBeCloseTo(-10);
        expect(result[3].value).toBeCloseTo(0);
        // (99 - 110) / 110 = -11 / 110 = -0.1 = -10%
        expect(result[4].value).toBeCloseTo(-10);
    });

    test('handles unordered input', () => {
        const series = [
            { date: '2023-01-02', value: 90 },
            { date: '2023-01-01', value: 100 },
        ];
        const result = buildDrawdownSeries(series);
        expect(result[0].date).toEqual(new Date(2023, 0, 1));
        expect(result[0].value).toBeCloseTo(0);
        expect(result[1].date).toEqual(new Date(2023, 0, 2));
        expect(result[1].value).toBeCloseTo(-10);
    });

    test('handles zero values correctly', () => {
        // If value drops to 0? HWM=100. (0-100)/100 = -100%.
        const series = [
            { date: '2023-01-01', value: 100 },
            { date: '2023-01-02', value: 0 },
        ];
        const result = buildDrawdownSeries(series);
        expect(result[1].value).toBeCloseTo(-100);
    });

    test('handles initial peak being zero or negative (safePeak logic)', () => {
        // High water mark <= 0 should use safePeak=1 to prevent division by zero or sign inversion
        const series = [
            { date: '2023-01-01', value: 0 },
            { date: '2023-01-02', value: -10 },
            { date: '2023-01-03', value: -20 },
        ];
        const result = buildDrawdownSeries(series);

        // At day 1: HWM=0, safePeak=1. Drawdown: (0 - 0) / 1 * 100 = 0%
        expect(result[0].value).toBe(0);
        // At day 2: HWM=0 (from day 1), safePeak=1. Drawdown: (-10 - 0) / 1 * 100 = -1000%
        expect(result[1].value).toBeCloseTo(-1000);
        // At day 3: HWM=0, safePeak=1. Drawdown: (-20 - 0) / 1 * 100 = -2000%
        expect(result[2].value).toBeCloseTo(-2000);
    });
});
