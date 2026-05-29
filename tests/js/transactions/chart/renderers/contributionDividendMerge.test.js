/**
 * TDD test for the yield-data race condition in drawContributionChart.
 *
 * Bug: When getCachedYieldData() returns null (yield data not yet loaded),
 * the code fires loadYieldData().then(chartManager.update) but SKIPS the
 * mergeDividendsIntoContribution call entirely.  The chart renders without
 * dividend sell bars, and may never re-merge if the subsequent update
 * doesn't re-enter the merge branch.
 *
 * Fix: await loadYieldData() inline (drawContributionChart is already async)
 * so the merge always runs when data is available.
 */

import { jest } from '@jest/globals';

// ── Mocks ───────────────────────────────────────────────────────────────

const mockMergeDividends = jest.fn((series) => series);
const mockGetContributionSeries = jest.fn(() => [
    {
        tradeDate: '2023-09-25',
        amount: 20000,
        value: 20000,
        orderType: 'buy',
        netAmount: 20000,
        buyVolume: 20000,
        sellVolume: 0,
    },
]);

jest.mock('@js/transactions/chart/data/contribution.js', () => ({
    getContributionSeriesForTransactions: mockGetContributionSeries,
    buildFilteredBalanceSeries: jest.fn(() => []),
    applyDrawdownToSeries: jest.fn((data) => data),
    computeAppreciationSeries: jest.fn(() => []),
    mergeDividendsIntoContribution: mockMergeDividends,
}));

const FAKE_YIELD_DATA = [
    {
        date: '2023-12-15',
        forward_yield: 2.07,
        ttm_income: 5447,
        daily_dividend: 798.8,
        daily_dividends_by_ticker: { FSGGX: 798.8 },
    },
];

const mockLoadYieldData = jest.fn(() => Promise.resolve(FAKE_YIELD_DATA));
const mockGetCachedYieldData = jest.fn(() => null); // <-- Not cached!

jest.mock('@js/transactions/chart/renderers/yield.js', () => ({
    loadYieldData: mockLoadYieldData,
    getCachedYieldData: mockGetCachedYieldData,
}));

jest.mock('@js/transactions/state.js', () => ({
    transactionState: {
        selectedCurrency: 'USD',
        chartVisibility: {},
        chartDateRange: { from: null, to: null },
        allTransactions: [],
        filteredTransactions: [
            {
                tradeDate: '09/25/2023',
                orderType: 'Buy',
                security: 'FSGGX',
                quantity: '1553.804',
                price: '13.31',
                netAmount: '20681.13',
                transactionId: 0,
            },
        ],
        runningAmountSeries: [],
        portfolioSeries: [],
        splitHistory: [],
        activeFilterTerm: 'fsggx',
        activeChart: 'contribution',
    },
    getShowChartLabels: jest.fn(() => false),
    setRunningAmountSeries: jest.fn(),
    setHistoricalPrices: jest.fn(),
    hasActiveTransactionFilters: jest.fn(() => true),
}));

jest.mock('@js/transactions/utils.js', () => ({
    formatCurrencyCompact: jest.fn((v) => `$${v}`),
    formatCurrencyInline: jest.fn((v) => `$${v}`),
    convertValueToCurrency: jest.fn((v) => v),
}));

jest.mock('@js/transactions/calculations.js', () => ({
    getSplitAdjustment: jest.fn(() => 1),
}));

jest.mock('@js/transactions/chart/state.js', () => ({
    chartLayouts: {},
}));

jest.mock('@js/transactions/chart/interaction.js', () => ({
    updateLegend: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
    legendState: { contributionDirty: true },
}));

jest.mock('@js/transactions/chart/animation.js', () => ({
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
    stopPeAnimation: jest.fn(),
    stopConcentrationAnimation: jest.fn(),
    isAnimationEnabled: jest.fn(() => false),
    advanceContributionAnimation: jest.fn(() => 1),
    scheduleContributionAnimation: jest.fn(),
    drawSeriesGlow: jest.fn(),
}));

jest.mock('@js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
    drawStartValue: jest.fn(),
    drawEndValue: jest.fn(),
    generateConcreteTicks: jest.fn(() => []),
    drawMountainFill: jest.fn(),
    drawMarker: jest.fn(),
}));

jest.mock('@js/transactions/chart/renderers/contributionComponents.js', () => ({
    drawVolumeChart: jest.fn(() => ({
        buyVolumeMap: new Map(),
        sellVolumeMap: new Map(),
    })),
    drawContributionMarkers: jest.fn(),
}));

jest.mock('@js/transactions/chart/helpers.js', () => {
    const actual = jest.requireActual('@js/transactions/chart/helpers.js');
    return {
        ...actual,
        getChartColors: jest.fn(() => ({
            contribution: '#aaa',
            portfolio: '#bbb',
            buy: '#0f0',
            sell: '#f00',
        })),
        getSmoothingConfig: jest.fn(() => null),
    };
});

jest.mock('@js/config.js', () => ({
    CONTRIBUTION_CHART_SETTINGS: { startYAxisAtZero: true, paddingRatio: 0.05, minPaddingValue: 0 },
    CHART_MARKERS: { showContributionMarkers: false },
    mountainFill: { enabled: false },
    CHART_LINE_WIDTHS: {},
    ANIMATED_LINE_SETTINGS: { enabled: false, charts: { contribution: { enabled: false } } },
}));

jest.mock('@js/transactions/chart/config.js', () => ({
    BALANCE_GRADIENTS: {},
    BENCHMARK_GRADIENTS: {},
}));

jest.mock('@js/utils/smoothing.js', () => ({
    smoothFinancialData: jest.fn((data) => data),
}));

jest.mock('@js/utils/logger.js', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// ── Helpers ─────────────────────────────────────────────────────────────

function makeCtxStub() {
    const gradientStub = { addColorStop: jest.fn() };
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'offsetWidth', { value: 800, configurable: true });
    Object.defineProperty(canvas, 'offsetHeight', { value: 600, configurable: true });

    const ctx = {
        canvas,
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        stroke: jest.fn(),
        fill: jest.fn(),
        arc: jest.fn(),
        clearRect: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        setLineDash: jest.fn(),
        createLinearGradient: jest.fn(() => gradientStub),
        fillText: jest.fn(),
        measureText: jest.fn(() => ({ width: 10 })),
        fillRect: jest.fn(),
        strokeRect: jest.fn(),
        rect: jest.fn(),
        clip: jest.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        textBaseline: '',
    };
    return ctx;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('drawContributionChart – dividend merge when yield data is not pre-cached', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Ensure DOM element exists
        document.body.innerHTML = '<div id="runningAmountEmpty"></div>';
        // Reset the mock to return null (not cached)
        mockGetCachedYieldData.mockReturnValue(null);
        mockLoadYieldData.mockResolvedValue(FAKE_YIELD_DATA);
        mockMergeDividends.mockImplementation((series) => series);
    });

    it('calls mergeDividendsIntoContribution even when yield data was not pre-cached', async () => {
        const { drawContributionChart } = require('@js/transactions/chart/renderers/contribution.js');

        const ctx = makeCtxStub();
        const chartManager = { update: jest.fn() };

        await drawContributionChart(ctx, chartManager, 0);

        // The critical assertion: loadYieldData must have been awaited
        expect(mockLoadYieldData).toHaveBeenCalled();

        // And mergeDividendsIntoContribution must have been called with the loaded data
        expect(mockMergeDividends).toHaveBeenCalledWith(
            expect.any(Array), // contributionSource
            FAKE_YIELD_DATA, // the yield data that was loaded
            'USD', // selectedCurrency
            ['FSGGX'], // activeTickers from filtered transactions
        );
    });

    it('still calls mergeDividendsIntoContribution when yield data IS pre-cached', async () => {
        // Now simulate pre-cached yield data
        mockGetCachedYieldData.mockReturnValue(FAKE_YIELD_DATA);

        const { drawContributionChart } = require('@js/transactions/chart/renderers/contribution.js');

        const ctx = makeCtxStub();
        const chartManager = { update: jest.fn() };

        await drawContributionChart(ctx, chartManager, 0);

        // loadYieldData should NOT have been called (already cached)
        expect(mockLoadYieldData).not.toHaveBeenCalled();

        // But merge MUST still happen
        expect(mockMergeDividends).toHaveBeenCalledWith(
            expect.any(Array),
            FAKE_YIELD_DATA,
            'USD',
            ['FSGGX'],
        );
    });
});
