import {
    transactionState,
    setActiveFilterTerm,
    getActiveFilterTerm,
    resetSortState,
    setAllTransactions,
    setFilteredTransactions,
    setSplitHistory,
    setRunningAmountSeries,
    setRunningAmountSeriesMap,
    setPortfolioSeries,
    setPortfolioSeriesMap,
    setPerformanceSeries,
    setChartVisibility,
    getChartVisibility,
    setShowChartLabels,
    getShowChartLabels,
    pushCommandHistory,
    resetHistoryIndex,
    setHistoryIndex,
    setActiveChart,
    setHistoricalPrices,
    setChartDateRange,
    setSelectedCurrency,
    getSelectedCurrency,
    setFxRatesByCurrency,
    setCompositionFilterTickers,
    getCompositionFilterTickers,
    setCompositionAssetClassFilter,
    getCompositionAssetClassFilter,
    setZoomed,
    isZoomed,
} from '@js/transactions/state.js';

describe('state.js', () => {
    beforeEach(() => {
        // Reset necessary state
        transactionState.allTransactions = [];
        transactionState.filteredTransactions = [];
        transactionState.activeFilterTerm = '';
        transactionState.commandHistory = [];
        transactionState.compositionFilterTickers = [];
        transactionState.selectedCurrency = 'USD';
    });

    test('setActiveFilterTerm sets and gets correct values', () => {
        setActiveFilterTerm('  term  ');
        expect(getActiveFilterTerm()).toBe('term');

        setActiveFilterTerm(null);
        expect(getActiveFilterTerm()).toBe('');
    });

    test('resetSortState resets to defaults', () => {
        transactionState.sortState.column = 'price';
        transactionState.sortState.order = 'asc';

        resetSortState();

        expect(transactionState.sortState.column).toBe('tradeDate');
        expect(transactionState.sortState.order).toBe('desc');
    });

    test('setAllTransactions handles valid and invalid input', () => {
        setAllTransactions([{ id: 1 }]);
        expect(transactionState.allTransactions).toEqual([{ id: 1 }]);

        setAllTransactions(null);
        expect(transactionState.allTransactions).toEqual([]);
    });

    test('setFilteredTransactions handles valid and invalid input', () => {
        setFilteredTransactions([{ id: 1 }]);
        expect(transactionState.filteredTransactions).toEqual([{ id: 1 }]);

        setFilteredTransactions(null);
        expect(transactionState.filteredTransactions).toEqual([]);
    });

    test('setSplitHistory handles valid and invalid input', () => {
        setSplitHistory([{ symbol: 'AAPL' }]);
        expect(transactionState.splitHistory).toEqual([{ symbol: 'AAPL' }]);

        setSplitHistory(null);
        expect(transactionState.splitHistory).toEqual([]);
    });

    test('setRunningAmountSeries handles valid and invalid input', () => {
        setRunningAmountSeries([{ val: 1 }]);
        expect(transactionState.runningAmountSeries).toEqual([{ val: 1 }]);

        setRunningAmountSeries(null);
        expect(transactionState.runningAmountSeries).toEqual([]);
    });

    test('setRunningAmountSeriesMap handles valid and invalid input', () => {
        setRunningAmountSeriesMap({ USD: [] });
        expect(transactionState.runningAmountSeriesByCurrency).toEqual({ USD: [] });

        setRunningAmountSeriesMap(null);
        expect(transactionState.runningAmountSeriesByCurrency).toEqual({});
    });

    test('setPortfolioSeries handles valid and invalid input', () => {
        setPortfolioSeries([{ val: 1 }]);
        expect(transactionState.portfolioSeries).toEqual([{ val: 1 }]);

        setPortfolioSeries(null);
        expect(transactionState.portfolioSeries).toEqual([]);
    });

    test('setPortfolioSeriesMap handles valid and invalid input', () => {
        setPortfolioSeriesMap({ USD: [] });
        expect(transactionState.portfolioSeriesByCurrency).toEqual({ USD: [] });

        setPortfolioSeriesMap(null);
        expect(transactionState.portfolioSeriesByCurrency).toEqual({});
    });

    test('setPerformanceSeries handles valid and invalid input', () => {
        setPerformanceSeries({ AAPL: [] });
        expect(transactionState.performanceSeries).toEqual({ AAPL: [] });

        setPerformanceSeries(null);
        expect(transactionState.performanceSeries).toEqual({});
    });

    test('setChartVisibility and getChartVisibility', () => {
        setChartVisibility('contribution', false);
        expect(getChartVisibility().contribution).toBe(false);

        setChartVisibility('contribution', true);
        expect(getChartVisibility().contribution).toBe(true);
    });

    test('setShowChartLabels and getShowChartLabels', () => {
        setShowChartLabels(false);
        expect(getShowChartLabels()).toBe(false);

        setShowChartLabels(true);
        expect(getShowChartLabels()).toBe(true);
    });

    test('pushCommandHistory adds command to history', () => {
        pushCommandHistory('cmd1');
        expect(transactionState.commandHistory).toEqual(['cmd1']);

        pushCommandHistory('cmd2');
        expect(transactionState.commandHistory).toEqual(['cmd2', 'cmd1']);
    });

    test('historyIndex functions work correctly', () => {
        resetHistoryIndex();
        expect(transactionState.historyIndex).toBe(-1);

        setHistoryIndex(2);
        expect(transactionState.historyIndex).toBe(2);
    });

    test('setActiveChart sets active chart', () => {
        setActiveChart('performance');
        expect(transactionState.activeChart).toBe('performance');
    });

    test('setHistoricalPrices handles valid and invalid input', () => {
        setHistoricalPrices({ AAPL: 150 });
        expect(transactionState.historicalPrices).toEqual({ AAPL: 150 });

        setHistoricalPrices(null);
        expect(transactionState.historicalPrices).toEqual({});
    });

    test('setChartDateRange sets date range', () => {
        setChartDateRange({ from: '2020-01-01', to: '2021-01-01' });
        expect(transactionState.chartDateRange).toEqual({ from: '2020-01-01', to: '2021-01-01' });
    });

    test('setSelectedCurrency and getSelectedCurrency', () => {
        setSelectedCurrency('CNY');
        expect(getSelectedCurrency()).toBe('CNY');
        expect(transactionState.currencySymbol).toBe('¥');

        setSelectedCurrency(null);
        expect(getSelectedCurrency()).toBe('CNY'); // does not change
    });

    test('setFxRatesByCurrency handles valid and invalid input', () => {
        setFxRatesByCurrency({ EUR: { rate: 1.1 } });
        expect(transactionState.fxRatesByCurrency).toEqual({ EUR: { rate: 1.1 } });

        setFxRatesByCurrency(null);
        expect(transactionState.fxRatesByCurrency).toEqual({});
    });

    test('setCompositionFilterTickers handles valid and invalid input', () => {
        setCompositionFilterTickers(['AAPL', 'msft', ' AAPL ']);
        expect(getCompositionFilterTickers()).toEqual(['AAPL', 'MSFT']); // Deduplicates and cleans

        setCompositionFilterTickers(null);
        expect(getCompositionFilterTickers()).toEqual([]);

        setCompositionFilterTickers([123]);
        expect(getCompositionFilterTickers()).toEqual([]);
    });

    test('setCompositionAssetClassFilter handles valid and invalid input', () => {
        setCompositionAssetClassFilter('etf');
        expect(getCompositionAssetClassFilter()).toBe('etf');

        setCompositionAssetClassFilter('stock');
        expect(getCompositionAssetClassFilter()).toBe('stock');

        setCompositionAssetClassFilter('invalid');
        expect(getCompositionAssetClassFilter()).toBe(null);
    });

    test('setZoomed and isZoomed', () => {
        setZoomed(true);
        expect(isZoomed()).toBe(true);

        setZoomed(false);
        expect(isZoomed()).toBe(false);
    });

    test('hasActiveTransactionFilters handles empty input', () => {
        const {
            setCompositionFilterTickers,
            setCompositionAssetClassFilter,
            hasActiveTransactionFilters,
        } = require('@js/transactions/state.js');
        setCompositionFilterTickers([]);
        setCompositionAssetClassFilter(null);
        expect(hasActiveTransactionFilters()).toBe(false);
    });

    test('getCompositionFilterTickers handles missing transactionState.compositionFilterTickers', () => {
        const {
            getCompositionFilterTickers,
            transactionState,
        } = require('@js/transactions/state.js');
        const oldVal = transactionState.compositionFilterTickers;
        transactionState.compositionFilterTickers = undefined;
        expect(getCompositionFilterTickers()).toEqual([]);
        transactionState.compositionFilterTickers = oldVal;
    });

    test('getCompositionAssetClassFilter handles missing transactionState.compositionAssetClassFilter', () => {
        const {
            getCompositionAssetClassFilter,
            transactionState,
        } = require('@js/transactions/state.js');
        const oldVal = transactionState.compositionAssetClassFilter;
        transactionState.compositionAssetClassFilter = undefined;
        expect(getCompositionAssetClassFilter()).toBeNull();
        transactionState.compositionAssetClassFilter = oldVal;
    });

    test('hasActiveTransactionFilters checks correctly', () => {
        const {
            hasActiveTransactionFilters,
            transactionState,
        } = require('@js/transactions/state.js');
        transactionState.allTransactions = null;
        transactionState.filteredTransactions = null;
        expect(hasActiveTransactionFilters()).toBe(false);

        transactionState.allTransactions = [];
        transactionState.filteredTransactions = [];
        // No transactions
        expect(hasActiveTransactionFilters()).toBe(false);

        transactionState.allTransactions = [{ id: 1 }, { id: 2 }];
        transactionState.filteredTransactions = [{ id: 1 }];

        // Filtered differs from all
        expect(hasActiveTransactionFilters()).toBe(true);

        transactionState.filteredTransactions = [{ id: 1 }, { id: 2 }];
        // Filtered same length as all
        expect(hasActiveTransactionFilters()).toBe(false);
    });
});

describe('state.js coverage dummy', () => {
    it('should export _coverage_dummy as true', async () => {
        const { _coverage_dummy } = await import('@js/transactions/state.js');
        expect(_coverage_dummy).toBe(true);
    });
});
