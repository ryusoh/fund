const sortState = { column: 'tradeDate', order: 'desc' };

export const transactionState = {
    allTransactions: [],
    filteredTransactions: [],
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
    sortState,
    commandHistory: [],
    historyIndex: -1,
};

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

export function setPortfolioSeries(series) {
    transactionState.portfolioSeries = Array.isArray(series) ? series : [];
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
