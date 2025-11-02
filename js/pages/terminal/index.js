import { logger } from '@utils/logger.js';
import {
    transactionState,
    setAllTransactions,
    setSplitHistory,
    resetSortState,
    setFilteredTransactions,
    setPortfolioSeries,
    setRunningAmountSeries,
    setPerformanceSeries,
} from '@js/transactions/state.js';
import {
    loadSplitHistory,
    loadTransactionData,
    loadPortfolioSeries,
    loadContributionSeries,
    loadPerformanceSeries,
} from '@js/transactions/dataLoader.js';
import { initTable } from '@js/transactions/table.js';
import { createChartManager } from '@js/transactions/chart.js';
import { createUiController } from '@js/transactions/ui.js';
import { initTerminal, updateTerminalCrosshair } from '@js/transactions/terminal.js';
import { adjustMobilePanels } from '@js/transactions/layout.js';

let chartManager;
let tableController;
let uiController;

async function loadTransactions() {
    try {
        const [transactions, splits, portfolioSeries, runningSeries, performanceSeries] =
            await Promise.all([
                loadTransactionData(),
                loadSplitHistory(),
                loadPortfolioSeries(),
                loadContributionSeries(),
                loadPerformanceSeries(),
            ]);

        setAllTransactions(transactions);
        setFilteredTransactions(transactions);
        setSplitHistory(splits);
        setPortfolioSeries(portfolioSeries);
        setRunningAmountSeries(runningSeries);
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
    chartManager = createChartManager({
        crosshairCallbacks: {
            onUpdate: updateTerminalCrosshair,
        },
    });
    tableController = initTable({
        onFilterChange: () => {
            if (chartManager && typeof chartManager.update === 'function') {
                if (transactionState.activeChart) {
                    chartManager.update();
                }
            }
        },
    });
    uiController = createUiController({ chartManager });

    initTerminal({
        filterAndSort: tableController.filterAndSort,
        toggleTable: uiController.toggleTable,
        closeAllFilterDropdowns: tableController.closeAllFilterDropdowns,
        resetSortState,
        chartManager,
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
