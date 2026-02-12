
import { drawContributionChart } from '../../../js/transactions/chart/renderers/contribution.js';
import { updateLegend, legendState } from '../../../js/transactions/chart/interaction.js';
import { computeAppreciationSeries } from '../../../js/transactions/chart/data/contribution.js';
import { transactionState } from '../../../js/transactions/state.js';

// --- Mocks ---

// mock state.js
jest.mock('../../../js/transactions/state.js', () => ({
    transactionState: {
        portfolioSeries: [
            { date: '2023-01-01', value: 1000 },
            { date: '2023-01-02', value: 1100 }
        ],
        runningAmountSeries: [],
        filteredTransactions: [],
        allTransactions: [],
        activeFilterTerm: '',
        selectedCurrency: 'USD',
        historicalPrices: {},
        chartVisibility: { balance: true, appreciation: true },
        splitHistory: {},
        chartDateRange: {}
    },
    getShowChartLabels: jest.fn(() => false),
    setRunningAmountSeries: jest.fn(),
    setHistoricalPrices: jest.fn(),
    hasActiveTransactionFilters: jest.fn(() => false),
    chartLayouts: {}
}));

// mock chart/interaction.js
jest.mock('../../../js/transactions/chart/interaction.js', () => ({
    updateLegend: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
    legendState: { contributionDirty: true }
}));

// mock chart/config.js
jest.mock('../../../js/transactions/chart/config.js', () => ({
    CONTRIBUTION_CHART_SETTINGS: {},
    CHART_MARKERS: {},
    mountainFill: { enabled: false },
    CHART_LINE_WIDTHS: {}
}));

// mock config.js (root)
jest.mock('../../../js/config.js', () => ({
    CONTRIBUTION_CHART_SETTINGS: {},
    CHART_MARKERS: {},
    mountainFill: { enabled: false },
    CHART_LINE_WIDTHS: {}
}));

// mock chart/renderers/config.js (gradients)
jest.mock('../../../js/transactions/chart/config.js', () => ({
    BALANCE_GRADIENTS: {
        appreciation: ['red', 'blue'],
        balance: ['green', 'lime'],
        contribution: ['gray', 'white']
    }
}));

// mock chart/core.js
jest.mock('../../../js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
    drawStartValue: jest.fn(),
    drawEndValue: jest.fn(),
    drawMountainFill: jest.fn()
}));

// mock chart/animation.js
jest.mock('../../../js/transactions/chart/animation.js', () => ({
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
    stopPerformanceAnimation: jest.fn(),
    isAnimationEnabled: jest.fn(() => false),
    advanceContributionAnimation: jest.fn(),
    drawSeriesGlow: jest.fn(),
    scheduleContributionAnimation: jest.fn()
}));

// mock chart/helpers.js
jest.mock('../../../js/transactions/chart/helpers.js', () => ({
    parseLocalDate: (d) => new Date(d),
    clampTime: (t) => t,
    createTimeInterpolator: () => () => 0,
    getSmoothingConfig: () => null,
    getChartColors: () => ({ contribution: 'gray', portfolio: 'green', buy: 'blue', sell: 'red' }),
    injectSyntheticStartPoint: (d) => d,
    injectCarryForwardStartPoint: (d) => d,
    constrainSeriesToRange: (d) => d
}));

// mock utils/smoothing.js
jest.mock('../../../js/utils/smoothing.js', () => ({
    smoothFinancialData: (d) => d
}));

// mock utils.js
jest.mock('../../../js/transactions/utils.js', () => ({
    formatCurrencyCompact: () => '$100',
    formatCurrencyInline: () => '$100',
    convertValueToCurrency: (v) => v
}));

// mock data/contribution.js
jest.mock('../../../js/transactions/chart/data/contribution.js', () => ({
    getContributionSeriesForTransactions: jest.fn(() => []),
    buildFilteredBalanceSeries: jest.fn(() => []),
    applyDrawdownToSeries: jest.fn((data) => data),
    computeAppreciationSeries: jest.fn(() => [])
}));

// mock contributionComponents.js
jest.mock('../../../js/transactions/chart/renderers/contributionComponents.js', () => ({
    drawVolumeChart: jest.fn(() => ({ buyVolumeMap: new Map(), sellVolumeMap: new Map() })),
    drawContributionMarkers: jest.fn()
}));

describe('drawContributionChart Legend Logic', () => {
    let ctx;
    let chartManager;

    beforeEach(() => {
        ctx = {
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
            canvas: { offsetWidth: 800, offsetHeight: 400 }
        };
        chartManager = {};
        jest.clearAllMocks();

        // Reset state
        legendState.contributionDirty = true;
        transactionState.chartVisibility.balance = true;
        transactionState.chartVisibility.appreciation = true;
    });

    test('shows Appreciation in legend when NOT in Drawdown mode', async () => {
        await drawContributionChart(ctx, chartManager, 0, { drawdownMode: false });

        expect(updateLegend).toHaveBeenCalled();
        const callArgs = updateLegend.mock.calls[0][0];
        const keys = callArgs.map(i => i.key);
        expect(keys).toContain('appreciation');
    });

    test('hides Appreciation in legend when IN Drawdown mode', async () => {
        await drawContributionChart(ctx, chartManager, 0, { drawdownMode: true });

        expect(updateLegend).toHaveBeenCalled();
        const callArgs = updateLegend.mock.calls[0][0];
        const keys = callArgs.map(i => i.key);
        expect(keys).not.toContain('appreciation');
        expect(keys).toContain('contribution');
        expect(keys).toContain('balance');
    });

    test('calculates Appreciation even if Balance is hidden', async () => {
        // Bug reproduction: Hide Balance, ensure Appreciation is still calculated
        transactionState.chartVisibility.balance = false;

        await drawContributionChart(ctx, chartManager, 0, { drawdownMode: false });

        // Logic check: computeAppreciationSeries needs balance data.
        expect(computeAppreciationSeries).toHaveBeenCalled();
        const args = computeAppreciationSeries.mock.calls[0];
        // args[0] is finalBalanceData
        expect(args[0].length).toBeGreaterThan(0);
    });
});
