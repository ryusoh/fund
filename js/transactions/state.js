const sortState = { column: 'tradeDate', order: 'asc' };

export const transactionState = {
    allTransactions: [],
    filteredTransactions: [],
    splitHistory: [],
    runningAmountSeries: [],
    portfolioSeries: [],
    performanceSeries: {},
    historicalPrices: {},
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
    sortState.order = 'asc';
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
    if (key in transactionState.chartVisibility) {
        transactionState.chartVisibility[key] = Boolean(visible);
    }
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

export function setHistoricalPrices(prices) {
    transactionState.historicalPrices = prices && typeof prices === 'object' ? prices : {};
}
