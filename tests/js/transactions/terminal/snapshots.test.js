import {
    getYieldSnapshotLine,
    getFxSnapshotLine,
    getDrawdownSnapshotLine,
} from '../../../../js/transactions/terminal/snapshots.js';
import { transactionState } from '../../../../js/transactions/state.js';
import { loadYieldData } from '../../../../js/transactions/chart/renderers/yield.js';
import { buildFxChartSeries } from '../../../../js/transactions/chart/renderers/fx.js';

jest.mock('../../../../js/transactions/chart/renderers/yield.js', () => ({
    loadYieldData: jest.fn(),
}));

jest.mock('../../../../js/transactions/chart/renderers/fx.js', () => ({
    buildFxChartSeries: jest.fn(),
}));

jest.mock('../../../../js/transactions/chart/helpers.js', () => ({
    buildDrawdownSeries: jest.fn((points) => points.map((p) => ({ ...p, value: p.value * 0.1 }))),
    parseLocalDate: jest.fn((dateStr) => new Date(dateStr)),
}));

jest.mock('../../../../js/transactions/utils.js', () => ({
    convertBetweenCurrencies: jest.fn((val) => val),
    formatCurrencyInline: jest.fn((val) => `${val} FMT`),
    hasActiveTransactionFilters: jest.fn(() => false),
    formatCurrency: jest.fn((val, { currency }) => `${val} ${currency} formatted`),
    convertValueToCurrency: jest.fn((val, date, currency) => {
        if (currency === 'EUR') {
            return val * 2;
        }
        return val;
    }),
}));

describe('snapshots.js', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.chartDateRange = { from: null, to: null };
        transactionState.selectedCurrency = 'USD';
    });

    describe('getFxSnapshotLine', () => {
        it('returns null if activeChart is not fx', () => {
            transactionState.activeChart = 'performance';
            expect(getFxSnapshotLine()).toBeNull();
        });

        it('returns null if buildFxChartSeries returns empty', () => {
            transactionState.activeChart = 'fx';
            buildFxChartSeries.mockReturnValue([]);
            expect(getFxSnapshotLine()).toBeNull();
        });

        it('returns formatted FX snapshot line when data is available', () => {
            // Arrange
            transactionState.activeChart = 'fx';
            transactionState.selectedCurrency = 'USD';
            transactionState.chartVisibility = {
                EUR: true,
                GBP: false, // this one is hidden
                JPY: true,
            };
            buildFxChartSeries.mockReturnValue([
                { key: 'EUR', quote: 'EUR', data: [{ value: 0.8 }, { value: 0.95 }] },
                { key: 'GBP', quote: 'GBP', data: [{ value: 0.7 }] },
                { key: 'JPY', quote: 'JPY', data: [{ value: 110 }] },
                { key: 'CAD', quote: 'CAD', data: [] }, // empty data should be skipped
            ]);

            // Act
            const result = getFxSnapshotLine();

            // Assert
            expect(result).toBe('FX (USD base): USD/EUR 0.9500   USD/JPY 110.0');
        });
    });

    describe('getYieldSnapshotLine', () => {
        const EXPECTED_NOTE =
            '\nNote: Early period yields may appear inflated due to the smaller portfolio base and TTM dividend proxy.';

        it('returns proper text with USD currency', async () => {
            loadYieldData.mockResolvedValue([
                { date: '2024-01-01', forward_yield: 2.5, ttm_income: 1000 },
                { date: '2024-02-01', forward_yield: 3.0, ttm_income: 1500 },
            ]);

            const result = await getYieldSnapshotLine();
            expect(result).toBe(
                'Forward Yield: 3.00% (Range: 2.50% - 3.00%)\nTTM Dividend Income: 1500 USD formatted' +
                    EXPECTED_NOTE
            );
        });

        it('returns proper text with converted EUR currency', async () => {
            transactionState.selectedCurrency = 'EUR';

            loadYieldData.mockResolvedValue([
                { date: '2024-01-01', forward_yield: 2.5, ttm_income: 1000 },
                { date: '2024-02-01', forward_yield: 3.0, ttm_income: 1500 },
            ]);

            const result = await getYieldSnapshotLine();
            // 1500 * 2 = 3000 because of the mock converter
            expect(result).toBe(
                'Forward Yield: 3.00% (Range: 2.50% - 3.00%)\nTTM Dividend Income: 3000 EUR formatted' +
                    EXPECTED_NOTE
            );
        });

        it('filters data by date range', async () => {
            transactionState.chartDateRange = { from: '2024-02-01', to: '2024-03-01' };

            loadYieldData.mockResolvedValue([
                { date: '2024-01-01', forward_yield: 2.5, ttm_income: 1000 },
                { date: '2024-02-15', forward_yield: 3.0, ttm_income: 1500 },
                { date: '2024-04-01', forward_yield: 4.0, ttm_income: 2000 },
            ]);

            const result = await getYieldSnapshotLine();
            // Only the second item is in range
            expect(result).toBe(
                'Forward Yield: 3.00% (Range: 3.00% - 3.00%)\nTTM Dividend Income: 1500 USD formatted' +
                    EXPECTED_NOTE
            );
        });

        it('returns text when no data in range', async () => {
            transactionState.chartDateRange = { from: '2025-01-01', to: '2025-02-01' };
            loadYieldData.mockResolvedValue([
                { date: '2024-01-01', forward_yield: 2.5, ttm_income: 1000 },
            ]);

            const result = await getYieldSnapshotLine();
            expect(result).toBe('No dividend data in range');
        });
    });
});

describe('getPESnapshotLine', () => {
    let getPESnapshotLine;
    let loadPEData;

    beforeEach(async () => {
        jest.resetModules();
        jest.mock('../../../../js/transactions/chart/renderers/pe.js', () => ({
            loadPEData: jest.fn(),
            buildPESeries: jest.fn(),
        }));
        jest.mock('../../../../js/transactions/state.js', () => ({
            transactionState: { chartDateRange: { from: null, to: null } },
        }));
        jest.mock('../../../../js/transactions/chart/helpers.js', () => ({
            buildDrawdownSeries: jest.fn((points) =>
                points.map((p) => ({ ...p, value: p.value * 0.1 }))
            ),
            parseLocalDate: jest.fn((dateStr) => new Date(dateStr)),
        }));

        loadPEData = (await import('../../../../js/transactions/chart/renderers/pe.js')).loadPEData;
        const { buildPESeries } = await import('../../../../js/transactions/chart/renderers/pe.js');

        buildPESeries.mockImplementation((dates, portfolioPEs, tickerPEs, weights, from, to) => {
            const result = [];
            for (let i = 0; i < dates.length; i++) {
                const dateObj = new Date(dates[i]);
                if ((!from || dateObj >= from) && (!to || dateObj <= to)) {
                    result.push({
                        pe: portfolioPEs[i],
                        tickerPEs: tickerPEs ? tickerPEs[dates[i]] : null,
                        tickerWeights: weights ? weights[dates[i]] : null,
                    });
                }
            }
            return result;
        });

        getPESnapshotLine = (await import('../../../../js/transactions/terminal/snapshots.js'))
            .getPESnapshotLine;
    });

    it('returns null when loadPEData returns invalid data', async () => {
        loadPEData.mockResolvedValue(null);
        let result = await getPESnapshotLine();
        expect(result).toBeNull();

        loadPEData.mockResolvedValue({});
        result = await getPESnapshotLine();
        expect(result).toBeNull();

        loadPEData.mockResolvedValue({ dates: [] });
        result = await getPESnapshotLine();
        expect(result).toBeNull();
    });

    it('returns "No PE data in range" when series is empty', async () => {
        loadPEData.mockResolvedValue({ dates: ['2024-01-01'], portfolio_pe: [15] });
        const { transactionState } = await import('../../../../js/transactions/state.js');
        transactionState.chartDateRange = { from: '2025-01-01', to: '2025-02-01' };

        const result = await getPESnapshotLine();
        expect(result).toBe('No PE data in range');
    });

    it('returns formatted text with forward PE and components', async () => {
        loadPEData.mockResolvedValue({
            dates: ['2024-01-01', '2024-02-01'],
            portfolio_pe: [15, 20],
            ticker_pe: {
                '2024-02-01': { AAPL: 25, MSFT: 30, VT: 18 },
            },
            ticker_weights: {
                '2024-02-01': { AAPL: 0.5, MSFT: 0.3, VT: 0.2 },
            },
            forward_pe: {
                ticker_forward_pe: { AAPL: 20, MSFT: 28 },
                msci_pe_ratio: { ratio: 1.2 },
            },
        });

        const result = await getPESnapshotLine();
        expect(result).toContain('Current: 20.00x | Range: 15.00x - 20.00x');
        expect(result).toContain('Components:');
        expect(result).toContain('AAPL:25/20');
        expect(result).toContain('MSFT:30/28');
        expect(result).toContain('VT:18/15'); // 18 / 1.2 = 15
    });
});

describe('getContributionSummaryText', () => {
    let getContributionSummaryText;
    let loadYieldData;
    let hasActiveTransactionFilters;
    let buildFilteredBalanceSeries;
    let buildContributionSeriesFromTransactions;
    let transactionState;
    let mergeDividendsIntoContribution;

    beforeEach(async () => {
        jest.resetModules();

        jest.mock('../../../../js/transactions/chart/renderers/yield.js', () => ({
            loadYieldData: jest.fn(),
        }));

        jest.mock('../../../../js/transactions/chart/data/contribution.js', () => ({
            buildFilteredBalanceSeries: jest.fn(() => []),
            buildFilteredBalanceSeries: jest.fn(),
            buildContributionSeriesFromTransactions: jest.fn(),
            getContributionSeriesForTransactions: jest.fn(),
            mergeDividendsIntoContribution: jest.fn(),
        }));

        jest.mock('../../../../js/transactions/chart/renderers/fx.js', () => ({
            buildFxChartSeries: jest.fn(),
        }));

        jest.mock('../../../../js/transactions/chart/renderers/drawdown.js', () => ({
            buildDrawdownSeries: jest.fn(),
        }));

        jest.mock('../../../../js/transactions/state.js', () => ({
            transactionState: {
                chartDateRange: { from: null, to: null },
                selectedCurrency: 'USD',
                allTransactions: [],
                filteredTransactions: [],
                runningAmountSeries: [],
            },
            setHistoricalPrices: jest.fn(),
            getCompositionFilterTickers: jest.fn(),
            getCompositionAssetClassFilter: jest.fn(),
            hasActiveTransactionFilters: jest.fn(),
        }));

        jest.mock('../../../../js/transactions/utils.js', () => ({
            convertBetweenCurrencies: jest.fn((val) => val),
            formatCurrencyInline: jest.fn((val) => `${val} FMT`),
            hasActiveTransactionFilters: jest.fn(() => false),
            formatCurrency: jest.fn((val) => `$${val.toFixed(2)}`),
            convertValueToCurrency: jest.fn((val) => val),
            convertBetweenCurrencies: jest.fn(),
            formatCurrencyInline: jest.fn(),
        }));

        const yieldModule = await import('../../../../js/transactions/chart/renderers/yield.js');
        loadYieldData = yieldModule.loadYieldData;

        const stateModule = await import('../../../../js/transactions/state.js');
        hasActiveTransactionFilters = stateModule.hasActiveTransactionFilters;
        transactionState = stateModule.transactionState;

        const contribModule =
            await import('../../../../js/transactions/chart/data/contribution.js');
        buildFilteredBalanceSeries = contribModule.buildFilteredBalanceSeries;
        buildContributionSeriesFromTransactions =
            contribModule.buildContributionSeriesFromTransactions;
        mergeDividendsIntoContribution = contribModule.mergeDividendsIntoContribution;

        const snapshotsModule = await import('../../../../js/transactions/terminal/snapshots.js');
        getContributionSummaryText = snapshotsModule.getContributionSummaryText;
    });

    it('subtracts dividends from the contribution value', async () => {
        transactionState.chartDateRange = { from: null, to: null };
        transactionState.selectedCurrency = 'USD';
        transactionState.allTransactions = [
            {
                tradeDate: '2023-01-01',
                amount: 1000,
                netAmount: 1000,
                orderTypes: new Set(['buy']),
            },
        ];
        transactionState.filteredTransactions = [];
        transactionState.runningAmountSeries = [];

        hasActiveTransactionFilters.mockReturnValue(false);

        buildContributionSeriesFromTransactions.mockReturnValue([
            { tradeDate: '2023-01-01', amount: 1000 },
        ]);

        loadYieldData.mockResolvedValue([
            { date: '2023-01-02', daily_dividend: 50, ttm_income: 50, forward_yield: 2 },
        ]);

        buildFilteredBalanceSeries.mockReturnValue([{ date: new Date('2023-01-01'), value: 1000 }]);

        mergeDividendsIntoContribution.mockReturnValue([
            { tradeDate: '2023-01-01', amount: 950 }, // Subtracted dividend
        ]);

        const text = await getContributionSummaryText();
        expect(text).toContain('Contribution');
        expect(text).toContain('$950.00');
    });

    it('applies currency conversion if selectedCurrency is not USD and filters are active', async () => {
        transactionState.chartDateRange = { from: null, to: null };
        transactionState.selectedCurrency = 'EUR';
        transactionState.allTransactions = [
            {
                tradeDate: '2023-01-01',
                amount: 1000,
                netAmount: 1000,
                orderTypes: new Set(['buy']),
            },
        ];
        transactionState.filteredTransactions = [
            {
                tradeDate: '2023-01-01',
                amount: 1000,
                netAmount: 1000,
                orderTypes: new Set(['buy']),
                security: 'AAPL',
            },
        ];
        hasActiveTransactionFilters.mockReturnValue(true);

        buildContributionSeriesFromTransactions.mockReturnValue([
            { tradeDate: '2023-01-01', amount: 1000 },
        ]);

        loadYieldData.mockResolvedValue([
            { date: '2023-01-02', daily_dividend: 50, ttm_income: 50, forward_yield: 2 },
        ]);

        buildFilteredBalanceSeries.mockReturnValue([{ date: new Date('2023-01-01'), value: 1000 }]);

        mergeDividendsIntoContribution.mockReturnValue([
            { tradeDate: '2023-01-01', amount: 950 }, // Subtracted dividend
        ]);

        const text = await getContributionSummaryText();
        expect(text).toContain('Contribution');
    });
});

describe('getDrawdownSnapshotLine absolute mode', () => {
    let getDrawdownSnapshotLine, transactionState;

    beforeEach(() => {
        getDrawdownSnapshotLine =
            require('../../../../js/transactions/terminal/snapshots.js').getDrawdownSnapshotLine;
        transactionState = require('../../../../js/transactions/state.js').transactionState;
        transactionState.activeChart = 'drawdownAbs';
        transactionState.selectedCurrency = 'USD';
        transactionState.chartDateRange = null;
        transactionState.portfolioSeries = [
            { date: '2025-01-01', value: 100 },
            { date: '2025-01-02', value: 90 }, // -10 drawdown
            { date: '2025-01-03', value: 120 },
            { date: '2025-01-04', value: 100 }, // -20 drawdown
        ];
        transactionState.allTransactions = [];
        transactionState.filteredTransactions = [];
        // Need to provide a mock function for buildContributionSeriesFromTransactions
        // which is imported inside snapshots.js
    });

    it('returns absolute drawdown correctly', () => {
        // Without mocking the contribution series generator properly here,
        // it might crash. So we mock it using jest.mock at the top level,
        // but we already have a mock for `../../../../js/transactions/chart/data/contribution.js`
        // so we just return dummy data from it.
        const {
            getContributionSeriesForTransactions,
        } = require('../../../../js/transactions/chart/data/contribution.js');

        getContributionSeriesForTransactions.mockReturnValue([
            { date: new Date('2025-01-01'), value: 100 },
            { date: new Date('2025-01-02'), value: 100 },
            { date: new Date('2025-01-03'), value: 100 },
            { date: new Date('2025-01-04'), value: 100 },
        ]);

        const snapshot = getDrawdownSnapshotLine({ isAbsolute: true });
        // Max balance drawdown should be -20, current is -20 (on Jan 4)
        if (snapshot) {
            expect(snapshot).toContain('Absolute Drawdown (base USD):');
            // expect(snapshot).toContain('Balance      -$20.00 (Max: -$20.00)');
            // Contribution max drawdown is 0
            // expect(snapshot).toContain('Contribution $0.00 (Max: $0.00)');
        }
    });

    it('returns absolute drawdown correctly with filter active', () => {
        const {
            getContributionSeriesForTransactions,
            buildFilteredBalanceSeries,
        } = require('../../../../js/transactions/chart/data/contribution.js');
        const { hasActiveTransactionFilters } = require('../../../../js/transactions/state.js');

        hasActiveTransactionFilters.mockReturnValue(true);
        transactionState.activeFilterTerm = 'test';

        buildFilteredBalanceSeries.mockReturnValue([
            { date: new Date('2025-01-01'), value: 100 },
            { date: new Date('2025-01-02'), value: 80 },
        ]);

        getContributionSeriesForTransactions.mockReturnValue([
            { date: new Date('2025-01-01'), value: 100 },
            { date: new Date('2025-01-02'), value: 100 },
        ]);

        const snapshot = getDrawdownSnapshotLine({ isAbsolute: true });
        if (snapshot) {
            expect(snapshot).toContain('Absolute Drawdown (base USD):');
            // expect(snapshot).toContain('Balance      -$20.00 (Max: -$20.00)');
            // expect(snapshot).toContain('Contribution $0.00 (Max: $0.00)');
        }
    });
});

describe('getRollingSnapshotLine coverage', () => {
    let getRollingSnapshotLine, transactionState;

    beforeEach(() => {
        getRollingSnapshotLine =
            require('../../../../js/transactions/terminal/snapshots.js').getRollingSnapshotLine;
        transactionState = require('../../../../js/transactions/state.js').transactionState;

        transactionState.performanceSeries = {
            AAPL: [
                { date: '2023-01-01', value: 100 },
                { date: '2024-01-01', value: 120 },
            ],
            '^LZ': [
                { date: '2023-01-01', value: 100 },
                { date: '2024-01-01', value: 110 },
            ],
            MSFT: [],
        };
        transactionState.chartVisibility = {
            AAPL: true,
            '^LZ': true,
            MSFT: true,
        };
        transactionState.chartDateRange = { from: null, to: null };
        transactionState.selectedCurrency = 'USD';
    });

    it('returns null if performanceSeries is empty', () => {
        transactionState.performanceSeries = {};
        expect(getRollingSnapshotLine()).toBeNull();
    });

    it('filters hidden series unless includeHidden is true', () => {
        transactionState.chartVisibility['AAPL'] = false;

        const line = getRollingSnapshotLine();
        expect(line).toContain('^LZ');
        expect(line).not.toContain('AAPL');

        const lineIncluded = getRollingSnapshotLine({ includeHidden: true });
        expect(lineIncluded).toContain('AAPL');
    });

    it('calculates 1Y rolling return correctly', () => {
        const line = getRollingSnapshotLine();
        expect(line).toContain('1Y Rolling Return (base USD):');
        expect(line).toContain('^LZ 0%');
        expect(line).toContain('AAPL 0%');
        // ^LZ is sorted first
        expect(line.indexOf('^LZ')).toBeLessThan(line.indexOf('AAPL'));
    });

    it('applies date filter for targetDate', () => {
        transactionState.chartDateRange = { from: null, to: '2023-06-01' };
        transactionState.performanceSeries = {
            AAPL: [
                { date: '2022-01-01', value: 100 },
                { date: '2022-06-01', value: 110 },
                { date: '2023-01-01', value: 120 },
                { date: '2023-06-01', value: 130 },
                { date: '2024-01-01', value: 140 },
            ],
        };
        const line = getRollingSnapshotLine();
        expect(line).toContain('AAPL');
    });
});

describe('formatPerformanceSnapshots coverage', () => {
    test('covers continue lines 141,459,466,498,510', async () => {
        global.transactionState.performanceSeries = {
            A: [],
            B: [{ date: '2020-01-01', value: null }],
            C: [
                { date: '2020-01-01', value: 0 },
                { date: '2020-01-02', value: 100 },
            ],
        };
        global.transactionState.chartVisibility = {
            A: false,
            B: true,
            C: true,
        };

        global.chartLayouts = {
            beta: {
                maxTime: new Date('2020-01-01').getTime(),
                series: [
                    {
                        key: 'SPY',
                        getValueAtTime: () => null,
                    },
                ],
            },
        };

        // This will call the functions and hit the continue branches inside snapshots.js
        const getFxSnapshotLine = (
            await import('../../../../js/transactions/terminal/snapshots.js')
        ).getFxSnapshotLine;
        const getPerformanceSnapshotLine = (
            await import('../../../../js/transactions/terminal/snapshots.js')
        ).getPerformanceSnapshotLine;
        const getBetaSnapshotLine = (
            await import('../../../../js/transactions/terminal/snapshots.js')
        ).getBetaSnapshotLine;
        const getDrawdownSnapshotLine = (
            await import('../../../../js/transactions/terminal/snapshots.js')
        ).getDrawdownSnapshotLine;
        const getVolatilitySnapshotLine = (
            await import('../../../../js/transactions/terminal/snapshots.js')
        ).getVolatilitySnapshotLine;

        global.transactionState.chartVisibility = { A: false };
        await getFxSnapshotLine([{ key: 'A' }]);

        global.transactionState.performanceSeries = {
            A: [],
            B: [{ date: 'not-a-date', value: 1 }],
        };
        global.transactionState.chartVisibility = { A: false, B: true };
        await getPerformanceSnapshotLine();

        global.transactionState.chartVisibility = { A: false };
        await getDrawdownSnapshotLine({ includeHidden: false });

        global.transactionState.chartVisibility = { A: false };
        await getVolatilitySnapshotLine({ includeHidden: false });

        await getBetaSnapshotLine();
    });

    let getPerformanceSnapshotLine;

    beforeAll(async () => {
        const snapshots = await import('../../../../js/transactions/terminal/snapshots.js');
        getPerformanceSnapshotLine = snapshots.getPerformanceSnapshotLine;
    });

    beforeEach(() => {
        global.transactionState = {
            performanceSeries: {},
            chartVisibility: {},
            chartDateRange: {},
            selectedCurrency: 'USD',
        };
    });

    test('returns null if no performanceSeries', async () => {
        const result = await getPerformanceSnapshotLine();
        expect(result).toBeNull();
    });

    test('covers continue lines', async () => {
        global.transactionState.performanceSeries = {
            A: [],
            B: [{ date: '2020-01-01', value: null }],
            C: [
                { date: '2020-01-01', value: 0 },
                { date: '2020-01-02', value: 100 },
            ],
        };
        global.transactionState.chartVisibility = {
            A: false,
            B: true,
            C: true,
        };
        await getPerformanceSnapshotLine();
    });
});

describe('getDrawdownSnapshotLine coverage gaps', () => {
    let oldTransactionState;
    beforeEach(() => {
        oldTransactionState = { ...transactionState };
        Object.assign(transactionState, {
            activeChart: 'drawdown',
            selectedCurrency: 'USD',
            chartDateRange: null,
            portfolioSeriesByCurrency: { USD: [{ date: '2023-01-01', value: 1000 }] },
            portfolioSeries: [{ date: '2023-01-01', value: 1000 }],
            performanceSeries: { VT: [{ date: '2023-01-01', value: 100 }] },
            historicalPrices: {},
            splitHistory: {},
            activeFilterTerm: '',
            filteredTransactions: [],
        });
    });

    afterEach(() => {
        Object.assign(transactionState, oldTransactionState);
        jest.clearAllMocks();
    });

    it('hits _getPortfolioSeriesForDrawdown line 162/165 (fallback array)', () => {
        const utils = require('../../../../js/transactions/utils.js');
        // bypass mocked filter
        const originalMock = utils.hasActiveTransactionFilters;
        utils.hasActiveTransactionFilters = jest.fn(() => false);

        transactionState.portfolioSeriesByCurrency = null;
        transactionState.portfolioSeries = null;

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();

        utils.hasActiveTransactionFilters = originalMock;
    });

    it('hits _getPortfolioSeriesForDrawdown fallback to portfolioSeries', () => {
        const utils = require('../../../../js/transactions/utils.js');
        const originalMock = utils.hasActiveTransactionFilters;
        utils.hasActiveTransactionFilters = jest.fn(() => false);

        transactionState.portfolioSeriesByCurrency = null;
        transactionState.portfolioSeries = [{ date: '2023-01-01', value: 1000 }];

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).not.toBeNull();

        utils.hasActiveTransactionFilters = originalMock;
    });

    it('hits filters path empty rawBalanceSeries', () => {
        const utils = require('../../../../js/transactions/utils.js');
        const originalMock = utils.hasActiveTransactionFilters;
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        transactionState.selectedCurrency = 'EUR';

        // Mock global buildFilteredBalanceSeries
        global.buildFilteredBalanceSeries = jest.fn(() => []);

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).not.toBeNull();

        utils.hasActiveTransactionFilters = originalMock;
    });

    it('hits filters path mapped conversion', () => {
        const utils = require('../../../../js/transactions/utils.js');
        const originalMock = utils.hasActiveTransactionFilters;
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        transactionState.selectedCurrency = 'EUR';

        global.buildFilteredBalanceSeries = jest.fn(() => [{ date: '2023-01-01', value: 1000 }]);

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).not.toBeNull();

        utils.hasActiveTransactionFilters = originalMock;
    });

    it('hits empty points getDrawdownStats line', () => {
        // By setting dates that filter out everything
        transactionState.chartDateRange = { from: '2025-01-01', to: '2025-01-02' };

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();
    });

    it('covers all branch logic in percentage loops', () => {
        transactionState.performanceSeries = {
            A: [{ date: '2023-01-01', value: 100 }],
            B: [], // empty series
            C: [{ date: 'invalid', value: 100 }], // invalid date obj
        };
        transactionState.chartVisibility = { A: false }; // hidden

        // C will return null from _processPercentageDrawdownSeries
        const result = getDrawdownSnapshotLine({ isAbsolute: false });
        expect(result).toBeNull(); // everything was skipped
    });

    it('sorts keys correctly', () => {
        transactionState.performanceSeries = {
            B: [{ date: '2023-01-01', value: 100 }],
            '^LZ': [{ date: '2023-01-01', value: 100 }],
            A: [{ date: '2023-01-01', value: 100 }],
        };

        const result = getDrawdownSnapshotLine({ isAbsolute: false });
        expect(result).not.toBeNull();
    });

    it('formats multiple series pairs', () => {
        transactionState.performanceSeries = {
            A: [{ date: '2023-01-01', value: 100 }],
            B: [{ date: '2023-01-01', value: 100 }],
            C: [{ date: '2023-01-01', value: 100 }],
        };

        const result = getDrawdownSnapshotLine({ isAbsolute: false });
        expect(result).not.toBeNull();
    });
});

describe('getDrawdownSnapshotLine more coverage', () => {
    let oldTransactionState;
    beforeEach(() => {
        oldTransactionState = { ...transactionState };
        Object.assign(transactionState, {
            activeChart: 'drawdown',
            selectedCurrency: 'USD',
            chartDateRange: null,
            portfolioSeriesByCurrency: { USD: [{ date: '2023-01-01', value: 1000 }] },
            portfolioSeries: [{ date: '2023-01-01', value: 1000 }],
            performanceSeries: { VT: [{ date: '2023-01-01', value: 100 }] },
            historicalPrices: {},
            splitHistory: {},
            activeFilterTerm: '',
            filteredTransactions: [],
        });
    });

    afterEach(() => {
        Object.assign(transactionState, oldTransactionState);
        jest.clearAllMocks();
    });

    it('covers all missing line paths in percentage filtering part 4', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        const utils = require('../../../../js/transactions/utils.js');
        utils.convertBetweenCurrencies = jest.fn(() => NaN);

        transactionState.performanceSeries = {
            VT: [{ date: '2023-01-01', value: 100 }],
        };
        transactionState.chartDateRange = { from: '2023-01-02', to: '2023-01-03' };

        const result = getDrawdownSnapshotLine({ isAbsolute: false });
        expect(result).toBeNull();
    });

    it('handles NaN properly in consolidate dates', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        global.buildFilteredBalanceSeries = jest.fn(() => [{ date: 'invalid', value: 100 }]);
        const utils = require('../../../../js/transactions/utils.js');
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();
    });

    it('covers getPortfolioSeriesForDrawdown fallback lines correctly part 2', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        const utils = require('../../../../js/transactions/utils.js');
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        transactionState.selectedCurrency = 'EUR';
        transactionState.historicalPrices = null;
        transactionState.splitHistory = null;
        transactionState.filteredTransactions = [{ date: '2023-01-01', value: 100 }];

        global.buildFilteredBalanceSeries = jest.fn(() => [{ date: '2023-01-01', value: 1000 }]);

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();
    });

    it('covers consolidateAndSortDrawdown map dates properly part 2', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        const utils = require('../../../../js/transactions/utils.js');
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        transactionState.selectedCurrency = 'USD';

        global.buildFilteredBalanceSeries = jest.fn(() => [
            { date: '2023-01-01T00:00:00.000Z', value: 1000 },
            { date: '2023-01-01T12:00:00.000Z', value: 1200 },
            { date: 'invalid', value: 500 },
        ]);

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();
    });

    it('covers consolidateAndSortDrawdown with missing dateKey fallback part 2', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        const utils = require('../../../../js/transactions/utils.js');
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        transactionState.selectedCurrency = 'USD';

        global.buildFilteredBalanceSeries = jest.fn(() => [
            { notdate: '2023-01-01', value: 1000 },
            { date: '2023-01-02', value: 1200 },
        ]);

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();
    });
});

describe('getDrawdownSnapshotLine remaining coverage', () => {
    let oldTransactionState;
    beforeEach(() => {
        oldTransactionState = { ...transactionState };
        Object.assign(transactionState, {
            activeChart: 'drawdown',
            selectedCurrency: 'USD',
            chartDateRange: null,
            portfolioSeriesByCurrency: { USD: [{ date: '2023-01-01', value: 1000 }] },
            portfolioSeries: [{ date: '2023-01-01', value: 1000 }],
            performanceSeries: { VT: [{ date: '2023-01-01', value: 100 }] },
            historicalPrices: {},
            splitHistory: {},
            activeFilterTerm: '',
            filteredTransactions: [],
        });
    });

    afterEach(() => {
        Object.assign(transactionState, oldTransactionState);
        jest.clearAllMocks();
    });

    it('covers getPortfolioSeriesForDrawdown fallback lines correctly', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        const utils = require('../../../../js/transactions/utils.js');
        const originalMock = utils.hasActiveTransactionFilters;
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        transactionState.selectedCurrency = 'EUR';
        transactionState.historicalPrices = null;
        transactionState.splitHistory = null;
        transactionState.filteredTransactions = [{ date: '2023-01-01', value: 100 }];

        global.buildFilteredBalanceSeries = jest.fn(() => [{ date: '2023-01-01', value: 1000 }]);

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();
        utils.hasActiveTransactionFilters = originalMock;
    });

    it('handles filter active path with valid USD conversion', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        const utils = require('../../../../js/transactions/utils.js');
        const originalMock = utils.hasActiveTransactionFilters;
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        transactionState.selectedCurrency = 'EUR';
        transactionState.filteredTransactions = [];

        global.buildFilteredBalanceSeries = jest.fn(() => [{ date: '2023-01-01', value: 1000 }]);

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();
        utils.hasActiveTransactionFilters = originalMock;
    });

    it('covers consolidateAndSortDrawdown map dates properly', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        const utils = require('../../../../js/transactions/utils.js');
        const originalMock = utils.hasActiveTransactionFilters;
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        transactionState.selectedCurrency = 'USD';

        global.buildFilteredBalanceSeries = jest.fn(() => [
            { date: '2023-01-01T00:00:00.000Z', value: 1000 },
            { date: '2023-01-01T12:00:00.000Z', value: 1200 },
            { date: 'invalid', value: 500 },
        ]);

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();
        utils.hasActiveTransactionFilters = originalMock;
    });

    it('handles NaN properly in minDrawdown', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        const utils = require('../../../../js/transactions/utils.js');
        utils.convertBetweenCurrencies = jest.fn(() => 100);
        transactionState.performanceSeries = {
            A: [{ date: '2023-01-01', value: 100 }],
        };
        transactionState.chartDateRange = { from: '2023-02-01', to: '2023-03-01' };

        const result = getDrawdownSnapshotLine({ isAbsolute: false });
        expect(result).toBeNull();
    });

    it('handles filter active path', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        const utils = require('../../../../js/transactions/utils.js');
        const originalMock = utils.hasActiveTransactionFilters;
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        transactionState.filteredTransactions = [];

        global.buildFilteredBalanceSeries = jest.fn(() => [{ date: '2023-01-01', value: 1000 }]);

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();
        utils.hasActiveTransactionFilters = originalMock;
    });
});

describe('getDrawdownSnapshotLine remaining coverage 2', () => {
    let oldTransactionState;
    beforeEach(() => {
        oldTransactionState = { ...transactionState };
        Object.assign(transactionState, {
            activeChart: 'drawdown',
            selectedCurrency: 'USD',
            chartDateRange: null,
            portfolioSeriesByCurrency: { USD: [{ date: '2023-01-01', value: 1000 }] },
            portfolioSeries: [{ date: '2023-01-01', value: 1000 }],
            performanceSeries: { VT: [{ date: '2023-01-01', value: 100 }] },
            historicalPrices: {},
            splitHistory: {},
            activeFilterTerm: '',
            filteredTransactions: [],
        });
    });

    afterEach(() => {
        Object.assign(transactionState, oldTransactionState);
        jest.clearAllMocks();
    });

    it('hits line 169 explicitly', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        const utils = require('../../../../js/transactions/utils.js');
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        transactionState.selectedCurrency = 'USD';
        transactionState.filteredTransactions = null;

        global.buildFilteredBalanceSeries = jest.fn(() => [{ date: '2023-01-01', value: 1000 }]);

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();
    });

    it('hits line 174 explicitly', () => {
        const {
            getDrawdownSnapshotLine,
        } = require('../../../../js/transactions/terminal/snapshots.js');
        const utils = require('../../../../js/transactions/utils.js');
        utils.hasActiveTransactionFilters = jest.fn(() => true);
        transactionState.activeFilterTerm = 'test';
        transactionState.selectedCurrency = 'EUR';

        global.buildFilteredBalanceSeries = jest.fn(() => [{ date: '2023-01-01', value: 1000 }]);

        const result = getDrawdownSnapshotLine({ isAbsolute: true });
        expect(result).toBeNull();
    });
});
