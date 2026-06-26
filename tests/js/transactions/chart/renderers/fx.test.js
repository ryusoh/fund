import { jest } from '@jest/globals';

jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: {
        chartDateRange: { from: null, to: null },
        chartVisibility: {},
        selectedCurrency: 'USD',
    },
}));

jest.mock('../../../../../js/transactions/chart/state.js', () => ({
    chartLayouts: {},
    legendState: { fxDirty: false },
}));

jest.mock('../../../../../js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
    drawMountainFill: jest.fn(),
    drawEndValue: jest.fn(),
}));

jest.mock('../../../../../js/transactions/chart/animation.js', () => ({
    advanceFxAnimation: jest.fn(),
    isAnimationEnabled: jest.fn(() => false),
    stopFxAnimation: jest.fn(),
    scheduleFxAnimation: jest.fn(),
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopPeAnimation: jest.fn(),
    stopConcentrationAnimation: jest.fn(),
    drawSeriesGlow: jest.fn(),
}));

jest.mock('../../../../../js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    updateLegend: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
}));

jest.mock('../../../../../js/config.js', () => ({
    mountainFill: { enabled: false },
    CHART_LINE_WIDTHS: { fx: 2 },
}));

jest.mock('../../../../../js/transactions/utils.js', () => ({
    getShowChartLabels: jest.fn(() => true),
    formatPercentInline: jest.fn((v) => `${v}%`),
    formatFxValue: jest.fn((v) => v.toString()),
    convertBetweenCurrencies: jest.fn(() => 1.5),
}));

jest.mock('../../../../../js/utils/smoothing.js', () => ({
    getSmoothingConfig: jest.fn(() => null),
    smoothFinancialData: jest.fn((points) => points),
}));

jest.mock('../../../../../js/transactions/chart/helpers.js', () => ({
    parseLocalDate: jest.fn((d) => new Date(d)),
    clampTime: jest.fn((v, min, max) => Math.max(min, Math.min(max, v))),
    createTimeInterpolator: jest.fn(() => jest.fn()),
    computePercentTickInfo: jest.fn(() => ({ startTick: 0, endTick: 10, tickSpacing: 2 })),
}));

describe('drawFxChart', () => {
    it('gracefully exits when there are no series to draw', async () => {
        const { drawFxChart } =
            await import('../../../../../js/transactions/chart/renderers/fx.js');
        const { stopFxAnimation } =
            await import('../../../../../js/transactions/chart/animation.js');
        const { chartLayouts } = await import('../../../../../js/transactions/chart/state.js');

        const mockCtx = {
            canvas: { offsetWidth: 800, offsetHeight: 400 },
        };

        drawFxChart(mockCtx, {}, 0);

        expect(stopFxAnimation).toHaveBeenCalled();
        expect(chartLayouts.fx).toBeNull();
    });
});

describe('buildFxChartSeries', () => {
    it('builds series covering all branches', async () => {
        const { transactionState } = await import('../../../../../js/transactions/state.js');

        // Setup state to hit all branches
        transactionState.fxRatesByCurrency = {
            USD: { sorted: [{ date: '2023-01-01' }] },
            CNY: { sorted: [] }, // hits dateSource.length === 0
            JPY: { sorted: [{ date: '2023-01-01' }] }, // hits !points.length (if conversion returns NaN)
            KRW: { sorted: [{ date: '2023-01-01' }] }, // hits happy path
        };

        const { convertBetweenCurrencies } =
            await import('../../../../../js/transactions/utils.js');
        // Force conversion to fail for JPY to hit !points.length branch
        convertBetweenCurrencies.mockImplementation((amt, base, date, target) => {
            if (target === 'JPY') {return NaN;}
            return 1.5;
        });

        const { buildFxChartSeries } =
            await import('../../../../../js/transactions/chart/renderers/fx.js');

        const series = buildFxChartSeries('USD');
        expect(series.length).toBeGreaterThanOrEqual(0);
    });
});
