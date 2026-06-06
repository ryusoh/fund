import { getYieldSnapshotLine, getFxSnapshotLine } from '@js/transactions/terminal/snapshots.js';
import { transactionState } from '@js/transactions/state.js';
import { loadYieldData } from '@js/transactions/chart/renderers/yield.js';
import { buildFxChartSeries } from '@js/transactions/chart/renderers/fx.js';

jest.mock('@js/transactions/chart/renderers/yield.js', () => ({
    loadYieldData: jest.fn(),
}));

jest.mock('@js/transactions/chart/renderers/fx.js', () => ({
    buildFxChartSeries: jest.fn(),
}));

jest.mock('@js/transactions/chart/helpers.js', () => ({
    parseLocalDate: jest.fn((dateStr) => new Date(dateStr)),
}));

jest.mock('@js/transactions/utils.js', () => ({
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
        jest.mock('@js/transactions/chart/renderers/pe.js', () => ({
            loadPEData: jest.fn(),
            buildPESeries: jest.fn(),
        }));
        jest.mock('@js/transactions/state.js', () => ({
            transactionState: { chartDateRange: { from: null, to: null } },
        }));
        jest.mock('@js/transactions/chart/helpers.js', () => ({
            parseLocalDate: jest.fn((dateStr) => new Date(dateStr)),
        }));

        loadPEData = (await import('@js/transactions/chart/renderers/pe.js')).loadPEData;
        const { buildPESeries } = await import('@js/transactions/chart/renderers/pe.js');

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

        getPESnapshotLine = (await import('@js/transactions/terminal/snapshots.js'))
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
        const { transactionState } = await import('@js/transactions/state.js');
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

        jest.mock('@js/transactions/chart/renderers/yield.js', () => ({
            loadYieldData: jest.fn(),
        }));

        jest.mock('@js/transactions/chart/data/contribution.js', () => ({
            buildFilteredBalanceSeries: jest.fn(),
            buildContributionSeriesFromTransactions: jest.fn(),
            getContributionSeriesForTransactions: jest.fn(),
            mergeDividendsIntoContribution: jest.fn(),
        }));

        jest.mock('@js/transactions/chart/renderers/fx.js', () => ({
            buildFxChartSeries: jest.fn(),
        }));

        jest.mock('@js/transactions/chart/renderers/drawdown.js', () => ({
            buildDrawdownSeries: jest.fn(),
        }));

        jest.mock('@js/transactions/state.js', () => ({
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

        jest.mock('@js/transactions/utils.js', () => ({
            formatCurrency: jest.fn((val) => `$${val.toFixed(2)}`),
            convertValueToCurrency: jest.fn((val) => val),
            convertBetweenCurrencies: jest.fn(),
            formatCurrencyInline: jest.fn(),
        }));

        const yieldModule = await import('@js/transactions/chart/renderers/yield.js');
        loadYieldData = yieldModule.loadYieldData;

        const stateModule = await import('@js/transactions/state.js');
        hasActiveTransactionFilters = stateModule.hasActiveTransactionFilters;
        transactionState = stateModule.transactionState;

        const contribModule = await import('@js/transactions/chart/data/contribution.js');
        buildFilteredBalanceSeries = contribModule.buildFilteredBalanceSeries;
        buildContributionSeriesFromTransactions =
            contribModule.buildContributionSeriesFromTransactions;
        mergeDividendsIntoContribution = contribModule.mergeDividendsIntoContribution;

        const snapshotsModule = await import('@js/transactions/terminal/snapshots.js');
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
});
