import { CURRENCY_SYMBOLS } from '@js/config.js';

const sortState = { column: 'tradeDate', order: 'desc' };
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_SYMBOL = CURRENCY_SYMBOLS[DEFAULT_CURRENCY] || '$';

export const transactionState = {
    allTransactions: [],
    filteredTransactions: [],
    activeFilterTerm: '',
    splitHistory: [],
    runningAmountSeries: [],
    portfolioSeries: [],
    performanceSeries: {},
    historicalPrices: {},
    activeChart: 'contribution', // 'contribution' or 'performance'
    chartDateRange: { from: null, to: null },
    chartVisibility: {
        contribution: true,
        balance: true,
        buy: true,
        sell: true,
    },
    showChartLabels: true,
    sortState,
    commandHistory: [],
    historyIndex: -1,
    selectedCurrency: DEFAULT_CURRENCY,
    currencySymbol: DEFAULT_SYMBOL,
    runningAmountSeriesByCurrency: {},
    portfolioSeriesByCurrency: {},
    fxRatesByCurrency: {},
    compositionFilterTickers: [],
    compositionAssetClassFilter: null,
    isZoomed: false,
};

export function setActiveFilterTerm(term) {
    if (typeof term === 'string') {
        transactionState.activeFilterTerm = term.trim();
    } else {
        transactionState.activeFilterTerm = '';
    }
}

export function getActiveFilterTerm() {
    return transactionState.activeFilterTerm || '';
}

export function resetSortState() {
    sortState.column = 'tradeDate';
    sortState.order = 'desc';
}

export function setAllTransactions(transactions) {
    transactionState.allTransactions = Array.isArray(transactions) ? transactions : [];
}

export function setFilteredTransactions(transactions) {
    transactionState.filteredTransactions = Array.isArray(transactions) ? transactions : [];
}

export function setSplitHistory(splits) {
    transactionState.splitHistory = Array.isArray(splits) ? splits : [];
}

export function setRunningAmountSeries(series) {
    transactionState.runningAmountSeries = Array.isArray(series) ? series : [];
}

export function setRunningAmountSeriesMap(seriesMap) {
    transactionState.runningAmountSeriesByCurrency =
        seriesMap && typeof seriesMap === 'object' ? { ...seriesMap } : {};
}

export function setPortfolioSeries(series) {
    transactionState.portfolioSeries = Array.isArray(series) ? series : [];
}

export function setPortfolioSeriesMap(seriesMap) {
    transactionState.portfolioSeriesByCurrency =
        seriesMap && typeof seriesMap === 'object' ? { ...seriesMap } : {};
}

export function setPerformanceSeries(seriesMap) {
    transactionState.performanceSeries =
        seriesMap && typeof seriesMap === 'object' ? { ...seriesMap } : {};
}

export function setChartVisibility(key, visible) {
    transactionState.chartVisibility[key] = Boolean(visible);
}

export function getChartVisibility() {
    return { ...transactionState.chartVisibility };
}

export function setShowChartLabels(enabled) {
    transactionState.showChartLabels = enabled !== false;
}

export function getShowChartLabels() {
    return transactionState.showChartLabels !== false;
}

export function pushCommandHistory(command) {
    transactionState.commandHistory.unshift(command);
}

export function resetHistoryIndex() {
    transactionState.historyIndex = -1;
}

export function setHistoryIndex(index) {
    transactionState.historyIndex = index;
}

export function setActiveChart(chartType) {
    transactionState.activeChart = chartType;
}

export function setHistoricalPrices(prices) {
    transactionState.historicalPrices = prices && typeof prices === 'object' ? prices : {};
}

export function setChartDateRange({ from, to }) {
    transactionState.chartDateRange = { from, to };
}

export function setSelectedCurrency(currency) {
    if (typeof currency !== 'string' || !currency) {
        return;
    }
    const normalized = currency.toUpperCase();
    transactionState.selectedCurrency = normalized;
    transactionState.currencySymbol = CURRENCY_SYMBOLS[normalized] || DEFAULT_SYMBOL;
}

export function getSelectedCurrency() {
    return transactionState.selectedCurrency || DEFAULT_CURRENCY;
}

export function setFxRatesByCurrency(fxMap) {
    transactionState.fxRatesByCurrency = fxMap && typeof fxMap === 'object' ? fxMap : {};
}

export function setCompositionFilterTickers(tickers) {
    if (!Array.isArray(tickers) || tickers.length === 0) {
        transactionState.compositionFilterTickers = [];
        return;
    }
    const normalized = [];
    const seen = new Set();
    tickers.forEach((ticker) => {
        if (typeof ticker !== 'string') {
            return;
        }
        const cleaned = ticker.trim().toUpperCase();
        if (!cleaned || seen.has(cleaned)) {
            return;
        }
        seen.add(cleaned);
        normalized.push(cleaned);
    });
    transactionState.compositionFilterTickers = normalized;
}

export function getCompositionFilterTickers() {
    return transactionState.compositionFilterTickers || [];
}

export function setCompositionAssetClassFilter(filter) {
    if (filter === 'etf' || filter === 'stock') {
        transactionState.compositionAssetClassFilter = filter;
    } else {
        transactionState.compositionAssetClassFilter = null;
    }
}

export function getCompositionAssetClassFilter() {
    return transactionState.compositionAssetClassFilter || null;
}

export function setZoomed(value) {
    transactionState.isZoomed = Boolean(value);
}

export function isZoomed() {
    return transactionState.isZoomed === true;
}

export function hasActiveTransactionFilters() {
    const allTransactions = transactionState.allTransactions || [];
    const filteredTransactions = transactionState.filteredTransactions || [];
    if (!allTransactions.length) {
        return false;
    }
    return (
        filteredTransactions.length > 0 && filteredTransactions.length !== allTransactions.length
    );
}
