import { logger } from '@utils/logger.js';
import {
    transactionState,
    setAllTransactions,
    setSplitHistory,
    resetSortState,
    setFilteredTransactions,
} from '@js/transactions/state.js';
import { buildRunningAmountSeries } from '@js/transactions/calculations.js';
import {
    loadSplitHistory,
    loadTransactionData,
    loadPortfolioSeries,
    loadPerformanceSeries,
} from '@js/transactions/dataLoader.js';
import { initTable } from '@js/transactions/table.js';
import { createChartManager } from '@js/transactions/chart.js';
import { createUiController } from '@js/transactions/ui.js';
import { initTerminal } from '@js/transactions/terminal.js';
import { adjustMobilePanels } from '@js/transactions/layout.js';

let chartManager;
let tableController;
let uiController;

async function loadTransactions() {
    try {
        const splits = await loadSplitHistory();
        setSplitHistory(splits);

        const transactions = await loadTransactionData();
        setAllTransactions(transactions);
        setFilteredTransactions(transactions);
        await loadPortfolioSeries();
        await loadPerformanceSeries();

        const transactionTable = document.getElementById('transactionTable');
        if (transactionTable) {
            transactionTable.style.display = 'table';
        }

        if (tableController && typeof tableController.filterAndSort === 'function') {
            tableController.filterAndSort('');
        }
        adjustMobilePanels();
    } catch (error) {
        const errorDiv = document.getElementById('error');
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = error.message;
        }
        logger.error('Error loading transactions:', error);
    }
}

function initialize() {
    chartManager = createChartManager({ buildRunningAmountSeries });
    tableController = initTable({
        onFilterChange: (filtered) => {
            if (chartManager && typeof chartManager.update === 'function') {
                chartManager.update(filtered, transactionState.splitHistory);
            }
        },
    });
    uiController = createUiController({ chartManager });

    initTerminal({
        filterAndSort: tableController.filterAndSort,
        toggleTable: uiController.toggleTable,
        togglePlot: uiController.togglePlot,
        closeAllFilterDropdowns: tableController.closeAllFilterDropdowns,
        resetSortState,
    });

    loadTransactions();
    adjustMobilePanels();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

window.addEventListener('resize', () => {
    adjustMobilePanels();
});
