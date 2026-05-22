import { drawRollingChart } from '@js/transactions/chart/renderers/rolling.js';
import { transactionState } from '@js/transactions/state.js';
import { chartLayouts } from '@js/transactions/chart/state.js';
import { drawAxes } from '@js/transactions/chart/core.js';
import { convertBetweenCurrencies } from '@js/transactions/utils.js';

jest.mock('@js/transactions/state.js', () => ({
    transactionState: {
        performanceSeries: {},
        selectedCurrency: 'USD',
        chartVisibility: {},
        chartDateRange: { from: null, to: null },
    },
    getShowChartLabels: jest.fn(() => true),
}));
jest.mock('@js/transactions/chart/state.js', () => ({
    chartLayouts: {},
}));
jest.mock('@js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
    updateLegend: jest.fn(),
    legendState: { performanceDirty: false }
}));
jest.mock('@js/transactions/chart/animation.js', () => ({
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
    drawSeriesGlow: jest.fn(),
    isAnimationEnabled: jest.fn(() => false),
    advancePerformanceAnimation: jest.fn(() => 1),
    schedulePerformanceAnimation: jest.fn(),
}));
jest.mock('@js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
    drawMountainFill: jest.fn(),
    drawEndValue: jest.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
}));
jest.mock('@js/transactions/utils.js', () => ({
    convertBetweenCurrencies: jest.fn((val) => val),
}));
jest.mock('@js/transactions/chart/helpers.js', () => {
    const actual = jest.requireActual('@js/transactions/chart/helpers.js');
    return {
        ...actual,
        getChartColors: jest.fn(() => ({
            '^LZ': '#ff0000',
            '^GSPC': '#00ff00'
        })),
        getSmoothingConfig: jest.fn(() => ({ smooth: true, tension: 0.4 })),
        createTimeInterpolator: jest.fn(() => jest.fn(() => 1)),
        formatPercentInline: jest.fn((val) => `${val}%`),
        clampTime: jest.fn((time) => time),
        parseLocalDate: jest.fn((str) => new Date(str)),
    };
});
jest.mock('@js/utils/smoothing.js', () => ({
    smoothFinancialData: jest.fn((data) => data)
}));

describe('Rolling Chart Renderer', () => {
    let mockCtx;
    let mockCanvas;
    let mockChartManager;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCanvas = {
            offsetWidth: 800,
            offsetHeight: 600,
            style: { display: 'block' }
        };

        mockCtx = {
            canvas: mockCanvas,
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            setLineDash: jest.fn(),
            fill: jest.fn(),
            createLinearGradient: jest.fn(() => ({
                addColorStop: jest.fn()
            }))
        };

        mockChartManager = {
            updateCrosshairTarget: jest.fn(),
            filterFrom: null,
            getFilterState: jest.fn(() => ({ from: null, to: null }))
        };

        document.body.innerHTML = '<div id="runningAmountEmpty"></div>';
        chartLayouts.rolling = null;
        transactionState.chartVisibility = {};
        transactionState.chartDateRange = { from: null, to: null };
    });

    it('handles empty performanceSeries gracefully', async () => {
        transactionState.performanceSeries = {};
        await drawRollingChart(mockCtx, mockChartManager, 0);
        expect(chartLayouts.rolling).toBeNull();
    });

    it('draws axes and legend only when all series are hidden', async () => {
        transactionState.performanceSeries = {
            '^LZ': [{ date: '2024-01-01', value: 100 }, { date: '2024-01-02', value: 105 }]
        };
        transactionState.chartVisibility = { '^LZ': false };

        await drawRollingChart(mockCtx, mockChartManager, 0);
        expect(mockCtx.beginPath).not.toHaveBeenCalled();
    });

    it('draws rolling chart with valid data', async () => {
        const dataLZ = [];
        const start = new Date('2023-01-01');
        for (let i = 0; i < 400; i++) {
            const current = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
            dataLZ.push({ date: current.toISOString().split('T')[0], value: 100 + i });
        }
        transactionState.performanceSeries = {
            '^LZ': dataLZ
        };
        transactionState.chartVisibility = { '^LZ': true };

        await drawRollingChart(mockCtx, mockChartManager, 0);

        expect(drawAxes).toHaveBeenCalled();
        expect(chartLayouts.rolling).not.toBeNull();
        expect(chartLayouts.rolling.series).toBeDefined();

        expect(convertBetweenCurrencies).toHaveBeenCalled();
    });

    it('handles interactions correctly', async () => {
        const dataLZ = [];
        const start = new Date('2023-01-01');
        for (let i = 0; i < 400; i++) {
            const current = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
            dataLZ.push({ date: current.toISOString().split('T')[0], value: 100 + i });
        }
        transactionState.performanceSeries = {
            '^LZ': dataLZ
        };
        transactionState.chartVisibility = { '^LZ': true };

        await drawRollingChart(mockCtx, mockChartManager, 0);

        // Test invertX on layout
        const inverted = chartLayouts.rolling.invertX(400); // Middle point
        expect(inverted).toBeDefined();

        // Test layout formatValue
        const seriesLayout = chartLayouts.rolling.series[0];
        expect(seriesLayout.formatValue(1.23)).toEqual('+1.23%');
        expect(seriesLayout.formatValue(-1.23)).toEqual('-1.23%');
    });
});
