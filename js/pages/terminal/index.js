import { logger } from '@utils/logger.js';
import { mountPerlinPlaneBackground } from '../../vendor/perlin-plane.js';
import {
    transactionState,
    setAllTransactions,
    setSplitHistory,
    resetSortState,
    setFilteredTransactions,
    setPortfolioSeries,
    setPortfolioSeriesMap,
    setRunningAmountSeries,
    setRunningAmountSeriesMap,
    setPerformanceSeries,
    setSelectedCurrency,
    setFxRatesByCurrency,
    getActiveFilterTerm,
} from '@js/transactions/state.js';
import { convertValueToCurrency } from '@js/transactions/utils.js';
import {
    PERLIN_BACKGROUND_SETTINGS,
    TABLE_GLASS_EFFECT,
    TERMINAL_BACKGROUND_EFFECT,
} from '../../config.js';
import { TableGlassEffect } from '@ui/tableGlassEffect.js';
import { initBackgroundSweepEffect } from '@ui/backgroundSweep.js';

// Helper function to convert currency series
function convertCurrencySeries(series, targetCurrency) {
    if (!Array.isArray(series) || targetCurrency === 'USD') {
        return series;
    }

    const hasNetAmount = series.some((entry) =>
        Object.prototype.hasOwnProperty.call(entry, 'netAmount')
    );

    if (hasNetAmount) {
        let cumulative = 0;
        return series.map((item) => {
            const dateRef = item.tradeDate || item.date;
            const convertedNet = convertValueToCurrency(item.netAmount, dateRef, targetCurrency);
            cumulative += convertedNet;
            const result = { ...item, netAmount: convertedNet };
            if (Object.prototype.hasOwnProperty.call(item, 'amount')) {
                result.amount = cumulative;
            }
            if (item.synthetic && item.orderType === 'padding') {
                result.amount = cumulative;
            }
            return result;
        });
    }

    return series.map((item) => {
        const result = { ...item };
        if ('value' in item) {
            result.value = convertValueToCurrency(item.value, item.date, targetCurrency);
        }
        return result;
    });
}
import {
    loadSplitHistory,
    loadTransactionData,
    loadPortfolioSeries,
    loadContributionSeries,
    loadPerformanceSeries,
    loadFxDailyRates,
} from '@js/transactions/dataLoader.js';
import { initTable } from '@js/transactions/table.js';
import { createChartManager } from '@js/transactions/chart.js';
import { createUiController } from '@js/transactions/ui.js';
import { initTerminal, updateTerminalCrosshair } from '@js/transactions/terminal.js';
import { adjustMobilePanels } from '@js/transactions/layout.js';
import { initCurrencyToggle, cycleCurrency, getStoredCurrency } from '@ui/currencyToggleManager.js';

let chartManager;
let tableController;
let uiController;
let triggerTerminalSweep = null;

// ---------------------------------------------------------------------------
// Perlin background helpers
// ---------------------------------------------------------------------------

let perlinBackgroundHandle = null;

const ZERO_EPSILON = 1e-6;
const SUPPORTED_CURRENCIES = ['USD', 'CNY', 'JPY', 'KRW'];

function ensureSyntheticStart(series, { dateKey, valueKey, zeroProps = {} }) {
    if (series && typeof series === 'object' && !Array.isArray(series)) {
        const result = {};
        Object.entries(series).forEach(([key, entries]) => {
            result[key] = ensureSyntheticStart(entries, { dateKey, valueKey, zeroProps });
        });
        return result;
    }
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

function buildFxRateMaps(fxPayload) {
    if (!fxPayload || typeof fxPayload !== 'object' || !fxPayload.rates) {
        return {};
    }
    const fxRates = {};
    Object.entries(fxPayload.rates).forEach(([date, rateMap]) => {
        const timestamp = Date.parse(date);
        Object.entries(rateMap || {}).forEach(([currency, rateValue]) => {
            const normalizedCurrency = currency.toUpperCase();
            const rateNumber = Number(rateValue);
            if (!Number.isFinite(rateNumber)) {
                return;
            }
            const entry = fxRates[normalizedCurrency] || { map: new Map(), sorted: [] };
            if (!entry.map.has(date)) {
                entry.sorted.push({
                    date,
                    ts: Number.isFinite(timestamp) ? timestamp : Date.parse(date),
                });
            }
            entry.map.set(date, rateNumber);
            fxRates[normalizedCurrency] = entry;
        });
    });
    Object.values(fxRates).forEach((entry) => {
        entry.sorted.sort((a, b) => a.ts - b.ts);
    });
    if (!fxRates.USD) {
        fxRates.USD = { map: new Map(), sorted: [] };
    }
    if (fxRates.USD.sorted.length === 0) {
        fxRates.USD.map.set('1970-01-01', 1);
        fxRates.USD.sorted.push({ date: '1970-01-01', ts: 0 });
    }
    return fxRates;
}

async function loadTransactions() {
    try {
        const [
            transactions,
            splits,
            portfolioSeriesMap,
            runningSeriesMap,
            performanceSeries,
            fxRatesPayload,
        ] = await Promise.all([
            loadTransactionData(),
            loadSplitHistory(),
            loadPortfolioSeries(),
            loadContributionSeries(),
            loadPerformanceSeries(),
            loadFxDailyRates(),
        ]);

        setAllTransactions(transactions);
        setFilteredTransactions(transactions);
        setSplitHistory(splits);
        const normalizedPortfolioSeriesMap = ensureSyntheticStart(portfolioSeriesMap, {
            dateKey: 'date',
            valueKey: 'value',
        });
        const normalizedRunningSeriesMap = ensureSyntheticStart(runningSeriesMap, {
            dateKey: 'tradeDate',
            valueKey: 'amount',
            zeroProps: { orderType: 'padding', netAmount: 0 },
        });
        setPortfolioSeriesMap(normalizedPortfolioSeriesMap);
        setRunningAmountSeriesMap(normalizedRunningSeriesMap);

        const fxRatesByCurrency = buildFxRateMaps(fxRatesPayload);
        setFxRatesByCurrency(fxRatesByCurrency);

        const defaultCurrency = SUPPORTED_CURRENCIES.find(
            (currency) => normalizedPortfolioSeriesMap?.[currency]?.length
        );
        const storedCurrency = getStoredCurrency();
        const normalizedStoredCurrency =
            storedCurrency && SUPPORTED_CURRENCIES.includes(storedCurrency) ? storedCurrency : null;
        const initialCurrency = normalizedStoredCurrency || defaultCurrency || 'USD';
        setSelectedCurrency(initialCurrency);
        setPortfolioSeries(normalizedPortfolioSeriesMap[initialCurrency] || []);
        setRunningAmountSeries(normalizedRunningSeriesMap[initialCurrency] || []);
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
    if (PERLIN_BACKGROUND_SETTINGS?.enabled) {
        perlinBackgroundHandle = mountPerlinPlaneBackground(PERLIN_BACKGROUND_SETTINGS);
    }

    // Initialize table glass effect for terminal pane
    try {
        new TableGlassEffect('.terminal', {
            ...TABLE_GLASS_EFFECT,
            excludeHeader: false, // Terminal pane doesn't have a header to exclude
        });
    } catch (e) {
        logger.error('Failed to initialize table glass effect:', e);
    }

    chartManager = createChartManager({
        crosshairCallbacks: {
            onUpdate: updateTerminalCrosshair,
        },
    });

    const sweepController = initBackgroundSweepEffect({
        selector: '#terminalSweepOverlay',
        effectConfig: {
            ...TERMINAL_BACKGROUND_EFFECT,
            targetElement: '#terminalSweepOverlay',
        },
    });
    triggerTerminalSweep = sweepController.triggerSweep;
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

    initCurrencyToggle();
    initTerminal({
        filterAndSort: tableController.filterAndSort,
        toggleTable: uiController.toggleTable,
        closeAllFilterDropdowns: tableController.closeAllFilterDropdowns,
        resetSortState,
        chartManager,
        onCommandExecuted: () => {
            if (typeof triggerTerminalSweep === 'function') {
                triggerTerminalSweep();
            }
        },
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

document.addEventListener('currencyChangedGlobal', (event) => {
    const newCurrency = event?.detail?.currency;
    if (!newCurrency) {
        return;
    }
    const normalized = newCurrency.toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(normalized)) {
        return;
    }

    // Always switch to the requested currency, even if pre-computed series doesn't exist
    setSelectedCurrency(normalized);

    // Get the USD source data first
    const usdRunningSeries = transactionState.runningAmountSeriesByCurrency?.['USD'] || [];
    const usdBalanceSeries = transactionState.portfolioSeriesByCurrency?.['USD'] || [];

    // Use pre-computed series if available for the target currency, otherwise convert from USD
    const runningSeries =
        transactionState.runningAmountSeriesByCurrency?.[normalized] ||
        convertCurrencySeries(usdRunningSeries, normalized);
    const balanceSeries =
        transactionState.portfolioSeriesByCurrency?.[normalized] ||
        convertCurrencySeries(usdBalanceSeries, normalized);

    setRunningAmountSeries(runningSeries);
    setPortfolioSeries(balanceSeries);

    let filtersHandled = false;
    if (tableController && typeof tableController.filterAndSort === 'function') {
        const activeFilterTerm = getActiveFilterTerm();
        tableController.filterAndSort(activeFilterTerm);
        filtersHandled = true;
    }
    if (!filtersHandled && chartManager && typeof chartManager.update === 'function') {
        chartManager.update();
    }

    adjustMobilePanels();
});

window.addEventListener('beforeunload', () => {
    perlinBackgroundHandle?.dispose();
    perlinBackgroundHandle = null;
});

window.addEventListener('keydown', (event) => {
    // Handle Ctrl/Cmd + Arrow keys (should work even when terminal input has text)
    if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
        const active = document.activeElement;
        if (
            active &&
            (active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA' ||
                active.tagName === 'SELECT' ||
                active.isContentEditable)
        ) {
            // If terminal input is focused, the terminal input handler will process Cmd/Ctrl+arrows
            if (active.id === 'terminalInput') {
                // Return early to let terminal input handler handle it
                return;
            }
            // For other inputs, don't interfere with their functionality
            return;
        }

        // If not in any input field, handle the arrow key to cycle currency
        event.preventDefault();
        cycleCurrency(event.key === 'ArrowRight' ? 1 : -1);
    }

    // Handle Arrow keys alone for currency toggle when not in input fields
    if (
        !event.metaKey &&
        !event.ctrlKey &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
        const active = document.activeElement;
        if (
            active &&
            (active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA' ||
                active.tagName === 'SELECT' ||
                active.isContentEditable)
        ) {
            // If we're in the terminal input, let that handle the event in handleTerminalInput
            // The terminal input handler only cycles when empty
            if (active.id === 'terminalInput') {
                return;
            }
            // For other inputs, don't interfere with their functionality
            return;
        }

        // If not in any input field, handle the arrow key to cycle currency
        event.preventDefault();
        cycleCurrency(event.key === 'ArrowRight' ? 1 : -1);
    }
});
