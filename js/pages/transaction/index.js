import { logger } from '@utils/logger.js';
import {
    transactionState,
    setAllTransactions,
    setSplitHistory,
    resetSortState,
    setFilteredTransactions,
    setHistoricalPrices,
    setPortfolioSeries,
    setPerformanceSeries,
} from '@js/transactions/state.js';
import { buildRunningAmountSeries, buildPortfolioSeries } from '@js/transactions/calculations.js';
import {
    loadSplitHistory,
    loadTransactionData,
    loadHistoricalPrices,
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
        // Use Promise.all to wait for all data to be loaded in parallel
        const [transactions, splits, historicalPrices, portfolioSeries, performanceSeries] =
            await Promise.all([
                loadTransactionData(),
                loadSplitHistory(),
                loadHistoricalPrices(),
                loadPortfolioSeries(),
                loadPerformanceSeries(),
            ]);

        setAllTransactions(transactions);
        setFilteredTransactions(transactions);
        setSplitHistory(splits);
        setHistoricalPrices(historicalPrices);
        setPortfolioSeries(portfolioSeries);
        setPerformanceSeries(performanceSeries);

        const transactionTable = document.getElementById('transactionTable');
        if (transactionTable) {
            transactionTable.style.display = 'table';
        }

        // Now that all data is loaded, perform the initial render
        if (tableController && typeof tableController.filterAndSort === 'function') {
            tableController.filterAndSort('');
        }
        adjustMobilePanels();
    } catch (error) {
        const errorDiv = document.getElementById('error');
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = `Failed to load critical data: ${error.message}`;
        }
        logger.error('Error during initial data load:', error);
    }
}

function initialize() {
    chartManager = createChartManager({ buildRunningAmountSeries, buildPortfolioSeries });
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
        togglePerformanceChart: uiController.togglePerformanceChart,
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
