import { jest } from '@jest/globals';
import {
    drawContributionChart,
    __resetContributionPipelineCache,
} from '../../../../../js/transactions/chart/renderers/contribution.js';
import { transactionState } from '../../../../../js/transactions/state.js';
import { chartLayouts } from '../../../../../js/transactions/chart/state.js';

jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: {
        runningAmountSeries: [],
        portfolioSeries: [],
        portfolioSeriesByCurrency: {},
        runningAmountSeriesByCurrency: {},
        filteredTransactions: [
            {
                transactionId: 1,
                tradeDate: '2024-01-01',
                orderType: 'Buy',
                security: 'ANET',
                quantity: '10',
                price: '100',
                netAmount: '1000',
            },
        ],
        allTransactions: [
            {
                transactionId: 1,
                tradeDate: '2024-01-01',
                orderType: 'Buy',
                security: 'ANET',
                quantity: '10',
                price: '100',
                netAmount: '1000',
            },
            {
                transactionId: 2,
                tradeDate: '2024-01-02',
                orderType: 'Buy',
                security: 'PDD',
                quantity: '5',
                price: '200',
                netAmount: '1000',
            },
        ],
        selectedCurrency: 'USD',
        chartVisibility: {
            contribution: true,
            balance: true,
            appreciation: true,
            buy: true,
            sell: true,
        },
        chartDateRange: { from: null, to: null },
        historicalPrices: { cached: true },
        splitHistory: [],
        activeFilterTerm: 'anet',
    },
    getShowChartLabels: jest.fn(() => true),
    setRunningAmountSeries: jest.fn(),
    setHistoricalPrices: jest.fn(),
    hasActiveTransactionFilters: jest.fn(() => true),
}));

jest.mock('../../../../../js/transactions/chart/state.js', () => ({
    chartLayouts: {},
}));

jest.mock('../../../../../js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
    updateLegend: jest.fn(),
    legendState: { contributionDirty: false },
}));

jest.mock('../../../../../js/transactions/chart/animation.js', () => ({
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
    isAnimationEnabled: jest.fn(() => false),
    advanceContributionAnimation: jest.fn(() => 1),
    scheduleContributionAnimation: jest.fn(),
    drawSeriesGlow: jest.fn(),
}));

jest.mock('../../../../../js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
    drawMountainFill: jest.fn(),
    drawStartValue: jest.fn(() => ({ x: 0, y: 0, width: 10, height: 10 })),
    drawEndValue: jest.fn(() => ({ x: 0, y: 0, width: 10, height: 10 })),
}));

jest.mock('../../../../../js/transactions/chart/data/contribution.js', () => ({
    getContributionSeriesForTransactions: jest.fn(() => [
        {
            tradeDate: '2024-01-01',
            amount: 1000,
            value: 1000,
            orderType: 'buy',
            netAmount: 1000,
            buyVolume: 1000,
            sellVolume: 0,
        },
        {
            tradeDate: '2024-01-02',
            amount: 1000,
            value: 1000,
            orderType: 'padding',
            netAmount: 0,
            buyVolume: 0,
            sellVolume: 0,
        },
    ]),
    buildFilteredBalanceSeries: jest.fn(() => [
        { date: new Date('2024-01-01'), value: 1000 },
        { date: new Date('2024-01-02'), value: 1100 },
    ]),
    applyDrawdownToSeries: jest.fn((data) => data),
    computeAppreciationSeries: jest.fn(() => [
        { date: new Date('2024-01-01'), value: 0 },
        { date: new Date('2024-01-02'), value: 100 },
    ]),
    mergeDividendsIntoContribution: jest.fn((series) => series),
}));

jest.mock('../../../../../js/transactions/chart/renderers/contributionComponents.js', () => ({
    drawVolumeChart: jest.fn(() => ({ buyVolumeMap: new Map(), sellVolumeMap: new Map() })),
    drawContributionMarkers: jest.fn(),
    createVolumeGetter: jest.fn(() => jest.fn(() => 0)),
}));

jest.mock('../../../../../js/transactions/chart/renderers/yield.js', () => {
    const data = [];
    return {
        loadYieldData: jest.fn(() => Promise.resolve(data)),
        getCachedYieldData: jest.fn(() => data),
    };
});

jest.mock('../../../../../js/transactions/chart/helpers.js', () => {
    const actual = jest.requireActual('../../../../../js/transactions/chart/helpers.js');
    return {
        ...actual,
        getChartColors: jest.fn(() => ({
            contribution: '#00ffff',
            portfolio: '#ff00ff',
            buy: '#00ff00',
            sell: '#ff0000',
        })),
        getSmoothingConfig: jest.fn(() => null),
        parseLocalDate: jest.fn((value) => {
            if (value instanceof Date) {
                return new Date(value.getFullYear(), value.getMonth(), value.getDate());
            }
            if (typeof value === 'string') {
                const parts = value.split('-');
                if (parts.length >= 3) {
                    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                }
            }
            return new Date(value);
        }),
    };
});

jest.mock('../../../../../js/transactions/utils.js', () => ({
    formatCurrencyCompact: jest.fn((val) => `$${val}`),
    formatCurrencyInline: jest.fn((val) => `$${val}`),
    convertValueToCurrency: jest.fn((val) => val),
}));

jest.mock('../../../../../js/utils/smoothing.js', () => ({
    smoothFinancialData: jest.fn((data) => data),
}));

import {
    getContributionSeriesForTransactions,
    buildFilteredBalanceSeries,
    computeAppreciationSeries,
    mergeDividendsIntoContribution,
} from '../../../../../js/transactions/chart/data/contribution.js';

describe('Contribution Chart Renderer Cache', () => {
    let mockCtx;
    let mockChartManager;

    beforeEach(() => {
        jest.clearAllMocks();
        __resetContributionPipelineCache();
        chartLayouts.contribution = null;
        chartLayouts.drawdownAbs = null;

        mockCtx = {
            canvas: { offsetWidth: 800, offsetHeight: 600 },
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fill: jest.fn(),
            fillRect: jest.fn(),
            createLinearGradient: jest.fn(() => ({
                addColorStop: jest.fn(),
            })),
        };

        mockChartManager = {
            updateCrosshairTarget: jest.fn(),
            redraw: jest.fn(),
        };

        document.body.innerHTML = '<div id="runningAmountEmpty"></div>';
        window.getComputedStyle = jest.fn(() => ({}));
    });

    it('reuses the cached pipeline on a second frame with identical state', async () => {
        await drawContributionChart(mockCtx, mockChartManager, 0);
        await drawContributionChart(mockCtx, mockChartManager, 16);

        expect(getContributionSeriesForTransactions).toHaveBeenCalledTimes(1);
        expect(buildFilteredBalanceSeries).toHaveBeenCalledTimes(1);
        expect(mergeDividendsIntoContribution).toHaveBeenCalledTimes(1);
        expect(computeAppreciationSeries).toHaveBeenCalledTimes(1);
    });

    it('recomputes the pipeline when chartDateRange changes', async () => {
        await drawContributionChart(mockCtx, mockChartManager, 0);

        const oldRange = transactionState.chartDateRange;
        transactionState.chartDateRange = { from: '2024-01-01', to: '2024-12-31' };
        expect(transactionState.chartDateRange).not.toBe(oldRange);

        await drawContributionChart(mockCtx, mockChartManager, 16);

        expect(getContributionSeriesForTransactions).toHaveBeenCalledTimes(2);
        expect(buildFilteredBalanceSeries).toHaveBeenCalledTimes(2);
        expect(mergeDividendsIntoContribution).toHaveBeenCalledTimes(2);
        expect(computeAppreciationSeries).toHaveBeenCalledTimes(2);
    });

    it('recomputes the pipeline when visibility changes', async () => {
        await drawContributionChart(mockCtx, mockChartManager, 0);

        transactionState.chartVisibility = {
            ...transactionState.chartVisibility,
            appreciation: false,
        };

        await drawContributionChart(mockCtx, mockChartManager, 16);

        expect(getContributionSeriesForTransactions).toHaveBeenCalledTimes(2);
        expect(buildFilteredBalanceSeries).toHaveBeenCalledTimes(2);
        expect(mergeDividendsIntoContribution).toHaveBeenCalledTimes(2);
        // appreciation was toggled off, so computeAppreciationSeries is not invoked on the second frame
        expect(computeAppreciationSeries).toHaveBeenCalledTimes(1);

        transactionState.chartVisibility = {
            ...transactionState.chartVisibility,
            appreciation: true,
        };

        await drawContributionChart(mockCtx, mockChartManager, 32);
        expect(computeAppreciationSeries).toHaveBeenCalledTimes(2);
    });
});
