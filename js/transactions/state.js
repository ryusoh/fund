const sortState = { column: 'tradeDate', order: 'asc' };

export const transactionState = {
    allTransactions: [],
    splitHistory: [],
    runningAmountSeries: [],
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

export function setSplitHistory(splits) {
    transactionState.splitHistory = Array.isArray(splits) ? splits : [];
}

export function setRunningAmountSeries(series) {
    transactionState.runningAmountSeries = Array.isArray(series) ? series : [];
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
