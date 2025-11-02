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

const ZERO_EPSILON = 1e-6;

function ensureSyntheticStart(series, { dateKey, valueKey, zeroProps = {} }) {
    if (!Array.isArray(series) || series.length === 0) {
        return Array.isArray(series) ? series : [];
    }

    const first = series[0];
    const firstValue = Number(first?.[valueKey]);
    if (!Number.isFinite(firstValue)) {
        return series;
    }

    const clonePoint = (point, dateValue) => {
        const base = { ...point, ...zeroProps };
        base[valueKey] = 0;
        if (valueKey !== 'amount' && 'amount' in base) {
            base.amount = 0;
        } else if (valueKey === 'amount') {
            base.amount = 0;
        }
        if (valueKey !== 'value' && 'value' in base) {
            base.value = 0;
        } else if (valueKey === 'value') {
            base.value = 0;
        }
        base.synthetic = true;
        if (point?.transactionId !== undefined) {
            delete base.transactionId;
        }
        if (dateValue instanceof Date) {
            base[dateKey] = new Date(dateValue);
        } else {
            base[dateKey] = dateValue;
        }
        return base;
    };

    if (Math.abs(firstValue) <= ZERO_EPSILON) {
        if (first.synthetic) {
            return series;
        }
        const rawDate = first?.[dateKey];
        const preservedDate = rawDate instanceof Date ? new Date(rawDate) : rawDate;
        const updatedFirst = clonePoint(first, preservedDate);
        return [updatedFirst, ...series.slice(1)];
    }

    const rawDate = first?.[dateKey];
    const firstDate = rawDate instanceof Date ? new Date(rawDate) : new Date(rawDate);
    if (Number.isNaN(firstDate.getTime())) {
        return series;
    }
    firstDate.setHours(0, 0, 0, 0);
    const syntheticDate = new Date(firstDate);
    syntheticDate.setDate(syntheticDate.getDate() - 1);
    const formattedDate =
        rawDate instanceof Date ? syntheticDate : syntheticDate.toISOString().split('T')[0];

    const syntheticPoint = clonePoint(first, formattedDate);
    return [syntheticPoint, ...series];
}

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
        const normalizedPortfolioSeries = ensureSyntheticStart(portfolioSeries, {
            dateKey: 'date',
            valueKey: 'value',
        });
        const normalizedRunningSeries = ensureSyntheticStart(runningSeries, {
            dateKey: 'tradeDate',
            valueKey: 'amount',
            zeroProps: { orderType: 'padding', netAmount: 0 },
        });
        setPortfolioSeries(normalizedPortfolioSeries);
        setRunningAmountSeries(normalizedRunningSeries);
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
