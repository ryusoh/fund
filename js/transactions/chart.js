import {
    transactionState,
    setHistoricalPrices,
    setRunningAmountSeries,
    getShowChartLabels,
    getCompositionFilterTickers,
    getCompositionAssetClassFilter,
} from './state.js';
import { getSplitAdjustment } from './calculations.js';
import {
    formatCurrencyCompact,
    formatCurrencyInlineValue,
    formatCurrencyInline,
    convertValueToCurrency,
    convertBetweenCurrencies,
} from './utils.js';
import {
    parseLocalDate,
    clampTime,
    createTimeInterpolator,
    formatPercentInline,
    formatFxValue,
    lightenColor,
    darkenColor,
    getSmoothingConfig,
    getChartColors,
} from './chart/helpers.js';
import {
    stopPerformanceAnimation,
    stopContributionAnimation,
    stopFxAnimation,
    schedulePerformanceAnimation,
    scheduleContributionAnimation,
    scheduleFxAnimation,
    advancePerformanceAnimation,
    advanceContributionAnimation,
    advanceFxAnimation,
    isAnimationEnabled,
    drawSeriesGlow,
} from './chart/animation.js';
import { smoothFinancialData } from '../utils/smoothing.js';
import { loadCompositionSnapshotData } from './dataLoader.js';
import {
    CHART_MARKERS,
    CONTRIBUTION_CHART_SETTINGS,
    mountainFill,
    COLOR_PALETTES,
    CHART_LINE_WIDTHS,
    getHoldingAssetClass,
} from '../config.js';
import { drawPerformanceChart } from './chart/renderers/performance.js';
import {
    PERFORMANCE_SERIES_CURRENCY,
    FX_CURRENCY_ORDER,
    FX_LINE_COLORS,
    FX_GRADIENTS,
    BENCHMARK_GRADIENTS,
    BALANCE_GRADIENTS,
} from './chart/config.js';
import {
    drawAxes,
    generateConcreteTicks,
    generateYearBasedTicks,
    computePercentTickInfo,
    drawMountainFill,
    drawMarker,
    drawEndValue,
    drawStartValue,
} from './chart/core.js';
import {
    crosshairState,
    updateCrosshairUI,
    drawCrosshairOverlay,
    updateLegend,
    legendState,
    setCrosshairExternalUpdate,
} from './chart/interaction.js';
import { chartLayouts } from './chart/state.js';

let compositionDataCache = null;
let compositionDataLoading = false;
let pointerCanvas = null;
let pointerEventsAttached = false;
let containerPointerBound = false;
let crosshairChartManager = null;

const contributionSeriesCache = new WeakMap();

export function buildFxChartSeries(baseCurrency) {
    const fxRates = transactionState.fxRatesByCurrency || {};
    const normalizedBase = typeof baseCurrency === 'string' ? baseCurrency.toUpperCase() : 'USD';
    const baseEntry = fxRates[normalizedBase];
    const seriesList = [];

    FX_CURRENCY_ORDER.filter((currency) => currency !== normalizedBase).forEach((currency) => {
        const targetEntry = fxRates[currency];
        if (!targetEntry && currency !== 'USD') {
            return;
        }
        const dateSource =
            (currency === 'USD'
                ? baseEntry?.sorted
                : targetEntry?.sorted || baseEntry?.sorted || []) || [];
        if (dateSource.length === 0) {
            return;
        }
        const points = dateSource
            .map(({ date }) => {
                const value = convertBetweenCurrencies(1, normalizedBase, date, currency);
                if (!Number.isFinite(value)) {
                    return null;
                }
                const parsedDate = new Date(date);
                if (Number.isNaN(parsedDate.getTime())) {
                    return null;
                }
                return { date: parsedDate, value };
            })
            .filter(Boolean);
        if (!points.length) {
            return;
        }
        const key = `FX_${normalizedBase}_${currency}`;
        if (transactionState.chartVisibility[key] === undefined) {
            transactionState.chartVisibility[key] = true;
        }
        const color = FX_LINE_COLORS[currency] || '#FF8E53';
        seriesList.push({
            key,
            base: normalizedBase,
            quote: currency,
            label: `${currency}`,
            color,
            data: points,
        });
    });

    return seriesList;
}

function getActiveChartKey() {
    const active = transactionState.activeChart || 'contribution';
    if (
        active === 'performance' ||
        active === 'composition' ||
        active === 'compositionAbs' ||
        active === 'contribution' ||
        active === 'fx' ||
        active === 'drawdown' ||
        active === 'drawdownAbs'
    ) {
        return active;
    }
    return 'contribution';
}

function getActiveLayout() {
    const key = getActiveChartKey();
    return chartLayouts[key];
}

function requestChartRedraw() {
    if (crosshairChartManager && typeof crosshairChartManager.redraw === 'function') {
        crosshairChartManager.redraw();
    }
}

function handleContainerLeave() {
    if (crosshairState.dragging) {
        return;
    }
    crosshairState.active = false;
    crosshairState.hoverTime = null;
    crosshairState.hoverY = null;
    crosshairState.rangeStart = null;
    crosshairState.rangeEnd = null;
    requestChartRedraw();
}

function handlePointerMove(event) {
    if (!pointerCanvas) {
        return;
    }
    const layout = getActiveLayout();
    if (!layout) {
        updateCrosshairUI(null, null);
        return;
    }
    if (event.pointerType === 'touch') {
        event.preventDefault();
    }
    const rect = pointerCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const insideX = x >= layout.chartBounds.left && x <= layout.chartBounds.right;
    const insideY = y >= layout.chartBounds.top && y <= layout.chartBounds.bottom;

    if (!insideX || !insideY) {
        if (!crosshairState.dragging) {
            crosshairState.active = false;
            crosshairState.hoverTime = null;
        }
        requestChartRedraw();
        return;
    }

    const time = layout.invertX ? layout.invertX(x) : null;
    if (!Number.isFinite(time)) {
        return;
    }

    crosshairState.active = true;
    crosshairState.hoverTime = time;
    crosshairState.hoverY = Math.max(
        layout.chartBounds.top,
        Math.min(y, layout.chartBounds.bottom)
    );

    // Skip range functionality for composition charts
    if (layout.key === 'composition' || layout.key === 'compositionAbs') {
        crosshairState.dragging = false;
        crosshairState.rangeStart = null;
        crosshairState.rangeEnd = null;
    } else if (crosshairState.dragging) {
        crosshairState.rangeEnd = time;
    }

    requestChartRedraw();
}

function handlePointerLeave() {
    if (crosshairState.dragging) {
        return;
    }
    crosshairState.active = false;
    crosshairState.hoverTime = null;
    crosshairState.hoverY = null;
    requestChartRedraw();
}

function handlePointerDown(event) {
    const layout = getActiveLayout();
    if (!layout) {
        return;
    }
    if (event.pointerType === 'touch') {
        event.preventDefault();
    }
    if (pointerCanvas && pointerCanvas.setPointerCapture) {
        pointerCanvas.setPointerCapture(event.pointerId);
    }
    const rect = pointerCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const insideX = x >= layout.chartBounds.left && x <= layout.chartBounds.right;
    const insideY = y >= layout.chartBounds.top && y <= layout.chartBounds.bottom;
    if (!insideX || !insideY) {
        return;
    }
    const time = layout.invertX ? layout.invertX(x) : null;
    if (!Number.isFinite(time)) {
        return;
    }

    // Skip range functionality for composition charts
    if (layout.key === 'composition' || layout.key === 'compositionAbs') {
        crosshairState.pointerId = event.pointerId;
        crosshairState.active = true;
        crosshairState.hoverTime = time;
        crosshairState.hoverY = Math.max(
            layout.chartBounds.top,
            Math.min(y, layout.chartBounds.bottom)
        );
        crosshairState.rangeStart = null;
        crosshairState.rangeEnd = null;
        requestChartRedraw();
        return;
    }

    crosshairState.pointerId = event.pointerId;
    crosshairState.active = true;
    crosshairState.dragging = true;
    crosshairState.hoverTime = time;
    crosshairState.hoverY = Math.max(
        layout.chartBounds.top,
        Math.min(y, layout.chartBounds.bottom)
    );
    crosshairState.rangeStart = time;
    crosshairState.rangeEnd = time;
    requestChartRedraw();
}

function handlePointerUp(event) {
    if (pointerCanvas && pointerCanvas.releasePointerCapture) {
        try {
            pointerCanvas.releasePointerCapture(event.pointerId);
        } catch {
            // Ignore release errors
        }
    }
    const layout = getActiveLayout();
    if (layout) {
        const rect = pointerCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const time = layout.invertX ? layout.invertX(x) : null;
        if (Number.isFinite(time)) {
            crosshairState.hoverTime = time;
        }
        crosshairState.hoverY = Math.max(
            layout.chartBounds.top,
            Math.min(y, layout.chartBounds.bottom)
        );
    }

    // Skip range functionality for composition charts
    if (layout && (layout.key === 'composition' || layout.key === 'compositionAbs')) {
        crosshairState.dragging = false;
        crosshairState.rangeStart = null;
        crosshairState.rangeEnd = null;
    } else {
        crosshairState.dragging = false;
        const hasRangeSelection =
            Number.isFinite(crosshairState.rangeStart) &&
            Number.isFinite(crosshairState.rangeEnd) &&
            Math.abs(crosshairState.rangeEnd - crosshairState.rangeStart) >= 1;
        if (!hasRangeSelection) {
            crosshairState.rangeStart = null;
            crosshairState.rangeEnd = null;
        }
    }

    crosshairState.pointerId = null;
    requestChartRedraw();
}

function handleDoubleClick() {
    crosshairState.rangeStart = null;
    crosshairState.rangeEnd = null;
    crosshairState.hoverTime = null;
    crosshairState.hoverY = null;
    crosshairState.active = false;
    crosshairState.dragging = false;
    updateCrosshairUI(null, null);
    requestChartRedraw();
}

function attachCrosshairEvents(canvas, chartManager) {
    if (!canvas) {
        return;
    }
    pointerCanvas = canvas;
    crosshairChartManager = chartManager;
    if (pointerEventsAttached) {
        return;
    }
    canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('dblclick', handleDoubleClick);
    const container = canvas.closest('.chart-container');
    if (container && !containerPointerBound) {
        container.addEventListener('pointerleave', handleContainerLeave);
        containerPointerBound = true;
    }
    pointerEventsAttached = true;
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

export function getContributionSeriesForTransactions(
    transactions,
    { includeSyntheticStart = false, padToDate = null, currency = null } = {}
) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }
    const splitHistoryRef = transactionState.splitHistory;
    const cached = contributionSeriesCache.get(transactions);
    const targetCurrency = currency || transactionState.selectedCurrency || 'USD';
    if (
        cached &&
        cached.splitHistory === splitHistoryRef &&
        cached.includeSyntheticStart === includeSyntheticStart &&
        cached.padToDate === padToDate &&
        cached.currency === targetCurrency
    ) {
        return cached.series;
    }
    const series = buildContributionSeriesFromTransactions(transactions, {
        includeSyntheticStart,
        padToDate,
        currency: targetCurrency,
    });
    contributionSeriesCache.set(transactions, {
        splitHistory: splitHistoryRef,
        includeSyntheticStart,
        padToDate,
        currency: targetCurrency,
        series,
    });
    return series;
}

export function buildContributionSeriesFromTransactions(
    transactions,
    { includeSyntheticStart = false, padToDate = null, currency = null } = {}
) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }

    const sortedTransactions = [...transactions].sort(
        (a, b) =>
            new Date(a.tradeDate) - new Date(b.tradeDate) ||
            (a.transactionId ?? 0) - (b.transactionId ?? 0)
    );

    // Consolidate transactions by date
    const dailyMap = new Map();
    sortedTransactions.forEach((t) => {
        const dateStr = t.tradeDate;
        if (!dailyMap.has(dateStr)) {
            dailyMap.set(dateStr, {
                netAmount: 0,
                orderTypes: new Set(),
                buyVolume: 0,
                sellVolume: 0,
            });
        }
        const entry = dailyMap.get(dateStr);
        const amount = Number.parseFloat(t.netAmount) || 0;
        entry.netAmount += amount;
        entry.orderTypes.add(t.orderType);

        const type = String(t.orderType).toLowerCase();
        if (type === 'buy') {
            entry.buyVolume += Math.abs(amount);
        } else if (type === 'sell') {
            entry.sellVolume += Math.abs(amount);
        }
    });

    const uniqueDates = Array.from(dailyMap.keys()).sort((a, b) => new Date(a) - new Date(b));
    const series = [];
    let cumulativeAmount = 0;

    uniqueDates.forEach((dateStr, index) => {
        const entry = dailyMap.get(dateStr);
        const netDelta = entry.netAmount;

        if (index > 0) {
            const prevDateStr = uniqueDates[index - 1];
            const prevDate = new Date(prevDateStr);
            const currentDate = new Date(dateStr);

            if (prevDate.toISOString().split('T')[0] !== currentDate.toISOString().split('T')[0]) {
                const intermediateDate = new Date(currentDate);
                intermediateDate.setDate(intermediateDate.getDate() - 1);

                // Only add padding if there is actually a gap > 1 day
                const prevPlusOne = new Date(prevDate);
                prevPlusOne.setDate(prevPlusOne.getDate() + 1);

                if (intermediateDate > prevDate) {
                    series.push({
                        tradeDate: intermediateDate.toISOString().split('T')[0],
                        amount: cumulativeAmount,
                        orderType: 'padding',
                        netAmount: 0,
                    });
                }
            }
        }

        cumulativeAmount += netDelta;

        // Determine a representative order type for the consolidated point
        let orderType = 'mixed';
        if (entry.orderTypes.size === 1) {
            orderType = entry.orderTypes.values().next().value;
        } else if (entry.orderTypes.size > 0) {
            const types = Array.from(entry.orderTypes).map((t) => String(t).toLowerCase());
            if (types.every((t) => t === 'buy')) {
                orderType = 'buy';
            } else if (types.every((t) => t === 'sell')) {
                orderType = 'sell';
            }
        }

        series.push({
            tradeDate: dateStr,
            amount: cumulativeAmount,
            orderType: orderType,
            netAmount: netDelta,
            buyVolume: entry.buyVolume,
            sellVolume: entry.sellVolume,
        });
    });

    const lastPoint = series[series.length - 1];
    if (lastPoint) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDateRaw = padToDate ? new Date(padToDate) : today;
        const targetDate = Number.isNaN(targetDateRaw.getTime()) ? today : targetDateRaw;
        targetDate.setHours(0, 0, 0, 0);
        const clampedTarget = targetDate > today ? today : targetDate;
        const lastTransactionDate = new Date(lastPoint.tradeDate);

        if (clampedTarget > lastTransactionDate) {
            series.push({
                tradeDate: clampedTarget.toISOString().split('T')[0],
                amount: lastPoint.amount,
                orderType: 'padding',
                netAmount: 0,
            });
        }
    }

    if (includeSyntheticStart && series.length > 0) {
        const epsilon = 1e-6;
        const firstActual =
            series.find((point) => (point.orderType || '').toLowerCase() !== 'padding') ||
            series[0];
        const firstValue = Number(firstActual?.amount) || 0;
        const firstDate = new Date(firstActual?.tradeDate || firstActual?.date);
        if (!Number.isNaN(firstDate.getTime()) && Math.abs(firstValue) > epsilon) {
            const syntheticDate = new Date(firstDate);
            syntheticDate.setDate(syntheticDate.getDate() - 1);
            const syntheticDateStr = syntheticDate.toISOString().split('T')[0];
            const existing = series.find((point) => point.tradeDate === syntheticDateStr);
            if (!existing) {
                series.unshift({
                    tradeDate: syntheticDateStr,
                    amount: 0,
                    orderType: 'padding',
                    netAmount: 0,
                    synthetic: true,
                });
            }
        }
    }

    const selectedCurrency = currency || transactionState.selectedCurrency || 'USD';
    if (selectedCurrency === 'USD') {
        return series;
    }

    let cumulative = 0;
    return series.map((point) => {
        const dateRef = point.tradeDate || point.date;
        const convertedNet = convertValueToCurrency(point.netAmount, dateRef, selectedCurrency);
        cumulative += convertedNet;
        return {
            ...point,
            netAmount: convertedNet,
            amount: cumulative,
            buyVolume: point.buyVolume
                ? convertValueToCurrency(point.buyVolume, dateRef, selectedCurrency)
                : point.buyVolume,
            sellVolume: point.sellVolume
                ? convertValueToCurrency(point.sellVolume, dateRef, selectedCurrency)
                : point.sellVolume,
        };
    });
}

function normalizeSymbolForPricing(symbol) {
    if (typeof symbol !== 'string') {
        return symbol;
    }
    return symbol.replace(/-/g, '').toUpperCase();
}

function getPriceFromHistoricalData(historicalPrices, symbol, dateStr) {
    if (!historicalPrices || typeof historicalPrices !== 'object') {
        return null;
    }
    const normalized = normalizeSymbolForPricing(symbol);
    const priceSeries =
        historicalPrices[normalized] ||
        historicalPrices[symbol] ||
        historicalPrices[symbol?.toUpperCase?.()] ||
        null;
    if (!priceSeries) {
        return null;
    }
    if (priceSeries[dateStr] !== undefined) {
        return priceSeries[dateStr];
    }
    const fallbackDate = new Date(dateStr);
    if (Number.isNaN(fallbackDate.getTime())) {
        return null;
    }
    for (let i = 0; i < 10; i += 1) {
        fallbackDate.setDate(fallbackDate.getDate() - 1);
        const priorStr = fallbackDate.toISOString().split('T')[0];
        if (priceSeries[priorStr] !== undefined) {
            return priceSeries[priorStr];
        }
    }
    return null;
}

export function buildFilteredBalanceSeries(transactions, historicalPrices, splitHistory) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }

    const sortedTransactions = [...transactions].sort(
        (a, b) =>
            new Date(a.tradeDate) - new Date(b.tradeDate) ||
            (a.transactionId ?? 0) - (b.transactionId ?? 0)
    );

    const firstDate = new Date(sortedTransactions[0].tradeDate);
    const lastTransactionDate = new Date(
        sortedTransactions[sortedTransactions.length - 1].tradeDate
    );
    if (Number.isNaN(firstDate.getTime()) || Number.isNaN(lastTransactionDate.getTime())) {
        return [];
    }

    firstDate.setHours(0, 0, 0, 0);
    lastTransactionDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastDate = today > lastTransactionDate ? today : lastTransactionDate;

    const splitsByDate = new Map();
    (Array.isArray(splitHistory) ? splitHistory : []).forEach((split) => {
        if (!split || !split.splitDate || !split.symbol) {
            return;
        }
        const dateKey = new Date(split.splitDate).toISOString().split('T')[0];
        const multiplier = Number(split.splitMultiplier) || Number(split.split_multiplier) || 1;
        const symbolKey = normalizeSymbolForPricing(split.symbol);
        if (!splitsByDate.has(dateKey)) {
            splitsByDate.set(dateKey, []);
        }
        splitsByDate.get(dateKey).push({ symbol: symbolKey, multiplier });
    });

    const transactionsByDate = new Map();
    sortedTransactions.forEach((txn) => {
        const dateStr = new Date(txn.tradeDate).toISOString().split('T')[0];
        if (!transactionsByDate.has(dateStr)) {
            transactionsByDate.set(dateStr, []);
        }
        transactionsByDate.get(dateStr).push(txn);
    });

    const holdings = new Map();
    const lastKnownPrices = new Map(); // Track last known price from transactions
    const series = [];
    const iterationStart = new Date(firstDate);
    iterationStart.setDate(iterationStart.getDate() - 1);

    const iterDate = new Date(iterationStart);

    while (iterDate <= lastDate) {
        const dateStr = iterDate.toISOString().split('T')[0];

        const splitsToday = splitsByDate.get(dateStr);
        if (splitsToday) {
            splitsToday.forEach(({ symbol, multiplier }) => {
                if (!Number.isFinite(multiplier) || multiplier <= 0) {
                    return;
                }
                const currentQty = holdings.get(symbol);
                if (currentQty !== undefined) {
                    holdings.set(symbol, currentQty * multiplier);
                }
                // Adjust last known price for split
                const lastPrice = lastKnownPrices.get(symbol);
                if (lastPrice !== undefined && multiplier > 0) {
                    lastKnownPrices.set(symbol, lastPrice / multiplier);
                }
            });
        }

        const todaysTransactions = transactionsByDate.get(dateStr) || [];
        todaysTransactions.forEach((txn) => {
            const normalizedSymbol = normalizeSymbolForPricing(txn.security);
            const quantity = parseFloat(txn.quantity) || 0;
            const txnPrice = parseFloat(txn.price);
            if (!Number.isFinite(quantity) || quantity === 0) {
                return;
            }
            // Update last known price from this transaction
            if (Number.isFinite(txnPrice) && txnPrice > 0) {
                lastKnownPrices.set(normalizedSymbol, txnPrice);
            }
            const isBuy = String(txn.orderType).toLowerCase() === 'buy';
            const currentQty = holdings.get(normalizedSymbol) || 0;
            const updatedQty = currentQty + (isBuy ? quantity : -quantity);
            if (Math.abs(updatedQty) < 1e-8) {
                holdings.delete(normalizedSymbol);
            } else {
                holdings.set(normalizedSymbol, updatedQty);
            }
        });

        let totalValue = 0;
        holdings.forEach((qty, symbol) => {
            if (!Number.isFinite(qty) || Math.abs(qty) < 1e-8) {
                return;
            }
            let price = getPriceFromHistoricalData(historicalPrices, symbol, dateStr);
            // Fallback to last known transaction price if historical price unavailable
            if (price === null) {
                price = lastKnownPrices.get(symbol) ?? null;
            }
            if (price === null) {
                return;
            }
            const adjustment = getSplitAdjustment(splitHistory, symbol, dateStr);
            totalValue += qty * price * adjustment;
        });

        series.push({ date: dateStr, value: totalValue });
        iterDate.setDate(iterDate.getDate() + 1);
    }

    const epsilon = 1e-6;
    let keepSyntheticStart = false;
    for (let i = 0; i < series.length; i += 1) {
        const point = series[i];
        if (!point || !Number.isFinite(point.value)) {
            continue;
        }
        if (Math.abs(point.value) > epsilon) {
            if (i > 0 && Math.abs(series[i - 1]?.value || 0) <= epsilon) {
                keepSyntheticStart = true;
            }
            break;
        }
    }

    if (keepSyntheticStart && series.length > 0) {
        series[0].synthetic = true;
    } else if (series.length > 0 && Math.abs(series[0].value || 0) <= epsilon) {
        series.shift();
    }

    return series;
}

// --- Helper Functions ---

// --- Drawdown Calculation Helper ---

export function buildDrawdownSeries(series) {
    if (!Array.isArray(series) || series.length === 0) {
        return [];
    }

    // Sort by date/transactionId to ensure correct order
    const sortedSeries = [...series].sort((a, b) => {
        const timeA = new Date(a.date || a.tradeDate).getTime();
        const timeB = new Date(b.date || b.tradeDate).getTime();
        if (timeA !== timeB) {
            return timeA - timeB;
        }
        return (a.transactionId ?? 0) - (b.transactionId ?? 0);
    });

    const drawdownSeries = [];
    let highWaterMark = -Infinity;

    for (const point of sortedSeries) {
        const value = Number(point.value ?? point.amount); // Handle both value and amount keys
        if (!Number.isFinite(value)) {
            continue;
        }

        if (value > highWaterMark) {
            highWaterMark = value;
        }

        const date = point.date || point.tradeDate;
        // Avoid division by zero or negative high water marks (logic assumes value >= 0 generally)
        // If highWaterMark is <= 0 (e.g. only losses or shorts?), logic assumes long-only portfolio for standard HWM.
        // Standard drawdown formula: (Value - Peak) / Peak
        const safePeak = highWaterMark > 0 ? highWaterMark : 1;
        const drawdown = ((value - highWaterMark) / safePeak) * 100;

        drawdownSeries.push({
            date: new Date(date),
            value: drawdown,
            rawValue: value,
            peak: highWaterMark,
        });
    }

    return drawdownSeries;
}

export function injectSyntheticStartPoint(filteredData, fullSeries, filterFrom = null) {
    if (!Array.isArray(filteredData) || filteredData.length === 0) {
        return filteredData;
    }
    if (!Array.isArray(fullSeries) || fullSeries.length === 0) {
        return filteredData;
    }

    const firstFiltered = filteredData[0];
    const firstTime =
        firstFiltered && firstFiltered.date instanceof Date
            ? firstFiltered.date.getTime()
            : new Date(firstFiltered.date).getTime();
    if (!Number.isFinite(firstTime)) {
        return filteredData;
    }

    const matchingIndex = fullSeries.findIndex((item) => {
        if (!item) {
            return false;
        }
        const itemDate = new Date(item.date);
        if (Number.isNaN(itemDate.getTime())) {
            return false;
        }
        return itemDate.getTime() === firstTime;
    });

    if (matchingIndex <= 0) {
        return filteredData;
    }

    const previousPoint = fullSeries[matchingIndex - 1];
    if (!previousPoint || !previousPoint.synthetic) {
        return filteredData;
    }

    const prevDate = new Date(previousPoint.date);
    if (Number.isNaN(prevDate.getTime())) {
        return filteredData;
    }

    // If we have a filterFrom date and the synthetic point is before it, clamp it to filterFrom
    // This fixes the "left-edge overhang" where the line starts to the left of the Y-axis
    if (filterFrom && prevDate < filterFrom) {
        // Check if we already have a point at filterFrom to avoid duplicates
        const firstFiltered = filteredData[0];
        const firstTime =
            firstFiltered && firstFiltered.date instanceof Date
                ? firstFiltered.date.getTime()
                : new Date(firstFiltered.date).getTime();

        if (Math.abs(firstTime - filterFrom.getTime()) < 1000) {
            return filteredData;
        }

        return [
            {
                ...previousPoint,
                date: new Date(filterFrom),
                synthetic: true,
            },
            ...filteredData,
        ];
    }

    const prevValue = Number(previousPoint.value);
    const epsilon = 1e-6;
    if (!Number.isFinite(prevValue) || Math.abs(prevValue) > epsilon) {
        return filteredData;
    }

    // Don't add the synthetic point if it would be at the same position as the first filtered point
    if (
        filteredData[0].date instanceof Date &&
        filteredData[0].date.getTime() === prevDate.getTime()
    ) {
        return filteredData;
    }

    // Only add synthetic point if it's within the filter range
    // Note: The clamping logic above handles the case where prevDate < filterFrom
    if (filterFrom && prevDate < filterFrom) {
        // This block is now redundant due to the clamping above, but keeping for safety
        // in case the logic flow changes.
        return filteredData;
    }

    const syntheticPoint = {
        date: prevDate,
        value: Number.isFinite(prevValue) ? prevValue : 0,
        synthetic: true,
    };

    return [syntheticPoint, ...filteredData];
}

function constrainSeriesToRange(series, rangeStart, rangeEnd) {
    if (!Array.isArray(series) || (!rangeStart && !rangeEnd)) {
        return series;
    }

    const startTime =
        rangeStart instanceof Date && Number.isFinite(rangeStart.getTime())
            ? rangeStart.getTime()
            : null;
    const endTime =
        rangeEnd instanceof Date && Number.isFinite(rangeEnd.getTime()) ? rangeEnd.getTime() : null;

    if (!Number.isFinite(startTime) && !Number.isFinite(endTime)) {
        return series;
    }

    return series.filter((point) => {
        if (!point) {
            return false;
        }
        const pointDate = point.date instanceof Date ? point.date : new Date(point.date);
        const time = pointDate.getTime();
        if (Number.isNaN(time)) {
            return false;
        }
        if (Number.isFinite(startTime) && time < startTime) {
            return false;
        }
        if (Number.isFinite(endTime) && time > endTime) {
            return false;
        }
        return true;
    });
}
// Helper function to get smoothing configuration
// --- Chart Drawing Functions ---
async function drawContributionChart(ctx, chartManager, timestamp, options = {}) {
    const { drawdownMode = false } = options;
    stopPerformanceAnimation();
    stopFxAnimation();

    const runningAmountSeries = Array.isArray(transactionState.runningAmountSeries)
        ? transactionState.runningAmountSeries
        : [];
    const portfolioSeries = Array.isArray(transactionState.portfolioSeries)
        ? transactionState.portfolioSeries
        : [];
    const filteredTransactions = Array.isArray(transactionState.filteredTransactions)
        ? transactionState.filteredTransactions
        : [];
    const allTransactions = Array.isArray(transactionState.allTransactions)
        ? transactionState.allTransactions
        : [];

    const filtersActive =
        hasActiveTransactionFilters() &&
        transactionState.activeFilterTerm &&
        transactionState.activeFilterTerm.trim().length > 0;
    const selectedCurrency = transactionState.selectedCurrency || 'USD';

    const contributionTransactions = filtersActive ? filteredTransactions : allTransactions;
    let contributionSource = [];
    let contributionFromTransactions = false;

    if (contributionTransactions.length > 0) {
        const today = parseLocalDate(new Date());
        const rangeTo = transactionState.chartDateRange?.to
            ? parseLocalDate(transactionState.chartDateRange.to)
            : null;
        let padToDate;
        if (rangeTo && today) {
            padToDate = Math.min(rangeTo.getTime(), today.getTime());
        } else if (today) {
            padToDate = today.getTime();
        } else {
            padToDate = rangeTo?.getTime() ?? Date.now();
        }
        contributionSource = getContributionSeriesForTransactions(contributionTransactions, {
            includeSyntheticStart: true,
            padToDate,
            currency: null,
        });
        contributionFromTransactions =
            filtersActive && Array.isArray(contributionSource) && contributionSource.length > 0;
        if (!filtersActive && contributionSource !== runningAmountSeries) {
            setRunningAmountSeries(contributionSource);
        }
    } else {
        const mappedSeries =
            transactionState.runningAmountSeriesByCurrency?.[selectedCurrency] || null;

        if (mappedSeries && mappedSeries === runningAmountSeries) {
            contributionSource = runningAmountSeries;
        } else {
            contributionSource = runningAmountSeries.map((entry) => {
                const tradeDate = entry.tradeDate || entry.date;
                // Removed drawdownMode check to allow currency conversion

                return {
                    ...entry,
                    amount: convertValueToCurrency(entry.amount, tradeDate, selectedCurrency),
                    netAmount: convertValueToCurrency(entry.netAmount, tradeDate, selectedCurrency),
                    buyVolume: entry.buyVolume
                        ? convertValueToCurrency(entry.buyVolume, tradeDate, selectedCurrency)
                        : entry.buyVolume,
                    sellVolume: entry.sellVolume
                        ? convertValueToCurrency(entry.sellVolume, tradeDate, selectedCurrency)
                        : entry.sellVolume,
                };
            });
        }
    }

    if (
        (!Array.isArray(contributionSource) || contributionSource.length === 0) &&
        runningAmountSeries.length > 0
    ) {
        // Force dynamic conversion to ensure accuracy and avoid stale cache
        contributionSource = runningAmountSeries.map((item) => {
            // Removed drawdownMode check to allow currency conversion

            return {
                ...item,
                amount: convertValueToCurrency(
                    item.amount,
                    item.tradeDate || item.date,
                    selectedCurrency
                ),
                netAmount: convertValueToCurrency(
                    item.netAmount,
                    item.tradeDate || item.date,
                    selectedCurrency
                ),
                buyVolume: item.buyVolume
                    ? convertValueToCurrency(
                          item.buyVolume,
                          item.tradeDate || item.date,
                          selectedCurrency
                      )
                    : item.buyVolume,
                sellVolume: item.sellVolume
                    ? convertValueToCurrency(
                          item.sellVolume,
                          item.tradeDate || item.date,
                          selectedCurrency
                      )
                    : item.sellVolume,
            };
        });
    }

    let historicalPrices = transactionState.historicalPrices;
    if (filtersActive && (!historicalPrices || Object.keys(historicalPrices).length === 0)) {
        try {
            const response = await fetch('../data/historical_prices.json');
            if (response.ok) {
                historicalPrices = await response.json();
                setHistoricalPrices(historicalPrices);
            } else {
                historicalPrices = {};
            }
        } catch {
            historicalPrices = {};
        }
    } else {
        historicalPrices = historicalPrices || {};
    }

    let balanceSource = filtersActive
        ? buildFilteredBalanceSeries(
              filteredTransactions,
              historicalPrices,
              transactionState.splitHistory
          )
        : portfolioSeries;

    if (
        !drawdownMode &&
        selectedCurrency !== 'USD' &&
        Array.isArray(balanceSource) &&
        filtersActive
    ) {
        balanceSource = [...balanceSource]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map((entry) => ({
                ...entry,
                value: convertValueToCurrency(entry.value, entry.date, selectedCurrency),
            }));
    }
    const hasBalanceSeries = Array.isArray(balanceSource) && balanceSource.length > 0;

    const { chartVisibility } = transactionState;
    const visibility = chartVisibility || {};
    const showContribution = visibility.contribution !== false;
    const showBalance = visibility.balance !== false && hasBalanceSeries;
    const showBuy = visibility.buy !== false;
    const showSell = visibility.sell !== false;

    const canvas = ctx.canvas;
    const emptyState = document.getElementById('runningAmountEmpty');

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;
    const filterFromTime =
        filterFrom && Number.isFinite(filterFrom.getTime()) ? filterFrom.getTime() : null;
    const filterToTime =
        filterTo && Number.isFinite(filterTo.getTime()) ? filterTo.getTime() : null;

    const filterDataByDateRange = (data) => {
        return data.filter((item) => {
            const itemDate = parseLocalDate(item.date);
            if (!itemDate) {
                return false;
            }

            // Normalize dates to date-only strings for comparison (YYYY-MM-DD)
            const itemDateStr = itemDate.toISOString().split('T')[0];
            const filterFromStr = filterFrom ? filterFrom.toISOString().split('T')[0] : null;
            const filterToStr = filterTo ? filterTo.toISOString().split('T')[0] : null;

            // Check if item is within the filter range
            const withinStart = !filterFromStr || itemDateStr >= filterFromStr;
            const withinEnd = !filterToStr || itemDateStr <= filterToStr;

            // Preserve padding points that extend the series to the filter endpoint
            const isPadding = item.orderType && item.orderType.toLowerCase() === 'padding';
            if (isPadding && filterToStr) {
                // If it's a padding point, allow it if it matches the filter end
                // or if it's within the valid range (which is covered by withinStart && withinEnd)
                if (itemDateStr === filterToStr) {
                    return withinStart;
                }
            }

            return withinStart && withinEnd;
        });
    };

    const rawContributionData = filterDataByDateRange(
        (contributionSource || [])
            .map((item) => ({ ...item, date: parseLocalDate(item.tradeDate || item.date) }))
            .filter((item) => item.date && !Number.isNaN(item.date.getTime()))
    );
    const mappedBalanceSource = showBalance
        ? (balanceSource || [])
              .map((item) => ({ ...item, date: parseLocalDate(item.date) }))
              .filter((item) => item.date && !Number.isNaN(item.date.getTime()))
        : [];
    const rawBalanceData = showBalance
        ? injectSyntheticStartPoint(
              filterDataByDateRange(mappedBalanceSource),
              balanceSource,
              filterFrom
          )
        : [];
    const balanceDataWithinRange =
        (filterFrom || filterTo) && rawBalanceData.length > 0
            ? constrainSeriesToRange(rawBalanceData, filterFrom, filterTo)
            : rawBalanceData;

    // Apply smoothing to contribution and balance data
    const contributionSmoothingConfig = getSmoothingConfig('contribution');
    const balanceSmoothingConfig = getSmoothingConfig('balance') || contributionSmoothingConfig;
    const rangeActive = Boolean(filterFrom || filterTo);
    const shouldSmoothContribution =
        !rangeActive &&
        !contributionFromTransactions &&
        rawContributionData.length > 2 &&
        contributionSmoothingConfig;
    const contributionData = shouldSmoothContribution
        ? smoothFinancialData(
              rawContributionData.map((item) => ({ x: item.date.getTime(), y: item.amount })),
              contributionSmoothingConfig,
              true // preserveEnd - keep the last point unchanged
          ).map((p) => ({ date: new Date(p.x), amount: p.y }))
        : rawContributionData;

    const shouldSmoothBalance =
        !filtersActive && balanceDataWithinRange.length > 2 && balanceSmoothingConfig;
    const balanceData = shouldSmoothBalance
        ? smoothFinancialData(
              balanceDataWithinRange.map((item) => ({ x: item.date.getTime(), y: item.value })),
              balanceSmoothingConfig,
              true // preserveEnd - keep the last point unchanged
          ).map((p) => ({ date: new Date(p.x), value: p.y }))
        : balanceDataWithinRange;

    if (contributionData.length === 0 && balanceData.length === 0) {
        stopContributionAnimation();
        if (emptyState) {
            emptyState.style.display = '';
        }
        return;
    }

    // Apply drawdown transformation if in drawdown mode
    let finalContributionData = contributionData;
    let finalBalanceData = balanceData;

    if (drawdownMode) {
        // Helper to apply HWM drawdown to a series
        const applyDrawdown = (data, valueKey) => {
            if (data.length === 0) {
                return [];
            }
            // Sort by date first
            const sorted = [...data].sort((a, b) => a.date - b.date);
            let runningPeak = -Infinity;
            return sorted.map((p) => {
                const val = p[valueKey];
                if (val > runningPeak) {
                    runningPeak = val;
                }
                return {
                    ...p,
                    [valueKey]: val - runningPeak, // <= 0
                };
            });
        };

        finalContributionData = applyDrawdown(contributionData, 'amount');
        finalBalanceData = applyDrawdown(balanceData, 'value');
    }

    if (emptyState) {
        emptyState.style.display = 'none';
    }

    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 50 }
        : { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvas.offsetWidth - padding.left - padding.right;
    const totalPlotHeight = canvas.offsetHeight - padding.top - padding.bottom;
    const volumeGap = isMobile ? 10 : 16;
    const minMainHeight = isMobile ? 120 : 180;
    const minVolumeHeight = isMobile ? 50 : 80;
    const availableHeight = Math.max(totalPlotHeight - volumeGap, 0);

    let mainPlotHeight = 0;
    let volumeHeight = 0;

    if (availableHeight <= 0) {
        mainPlotHeight = Math.max(totalPlotHeight, 0);
    } else if (availableHeight < minMainHeight + minVolumeHeight) {
        const scale = availableHeight / (minMainHeight + minVolumeHeight);
        mainPlotHeight = minMainHeight * scale;
        volumeHeight = minVolumeHeight * scale;
    } else {
        mainPlotHeight = Math.max(minMainHeight, availableHeight * 0.7);
        volumeHeight = availableHeight - mainPlotHeight;
        if (volumeHeight < minVolumeHeight) {
            volumeHeight = minVolumeHeight;
            mainPlotHeight = availableHeight - volumeHeight;
        }
    }

    const plotHeight = mainPlotHeight;
    const volumeTop = padding.top + plotHeight + (volumeHeight > 0 ? volumeGap : 0);

    const allTimes = [
        ...contributionData.map((d) => d.date.getTime()),
        ...balanceData.map((d) => d.date.getTime()),
    ];

    // Calculate effective min times based on actual data within filter range
    const effectiveMinTimes = [];
    if (rawContributionData.length > 0) {
        const firstContributionPoint = filtersActive
            ? rawContributionData.find(
                  (item) =>
                      typeof item.orderType !== 'string' ||
                      item.orderType.toLowerCase() !== 'padding'
              )
            : rawContributionData[0];
        if (firstContributionPoint) {
            effectiveMinTimes.push(firstContributionPoint.date.getTime());
        }
    }
    if (showBalance && rawBalanceData.length > 0) {
        effectiveMinTimes.push(rawBalanceData[0].date.getTime());
    }

    const fallbackMinTime = allTimes.length > 0 ? Math.min(...allTimes) : Date.now();
    let minTime = effectiveMinTimes.length > 0 ? Math.min(...effectiveMinTimes) : fallbackMinTime;

    if (Number.isFinite(filterFromTime)) {
        // Ensure minTime is at least the filter start time
        minTime = Math.max(minTime, filterFromTime);
    }
    // Calculate maxTime - use filter end if specified (clamped to today), otherwise use data max
    let maxTime;
    if (Number.isFinite(filterToTime)) {
        // When filter is active, extend to min(filterEnd, today)
        // This handles both past periods (stops at filter end) and current periods (stops at today)
        maxTime = Math.min(filterToTime, Date.now());
    } else if (allTimes.length > 0) {
        // No filter: use the maximum time from the data (including padding points)
        maxTime = Math.max(...allTimes);
    } else {
        maxTime = Date.now();
    }

    // Force-extend series to maxTime to ensure the line reaches the right edge of the chart
    // This fixes issues where the line stops at the last transaction date instead of the filter end/today
    if (contributionData.length > 0) {
        const lastPoint = contributionData[contributionData.length - 1];
        if (lastPoint.date.getTime() < maxTime) {
            contributionData.push({
                date: new Date(maxTime),
                amount: lastPoint.amount,
            });
        }
    }

    if (balanceData.length > 0) {
        const lastPoint = balanceData[balanceData.length - 1];
        if (lastPoint.date.getTime() < maxTime) {
            balanceData.push({
                date: new Date(maxTime),
                value: lastPoint.value,
            });
        }
    }

    // Remove debug object
    if (window.DEBUG_CHART) {
        delete window.DEBUG_CHART;
    }

    const contributionValues = finalContributionData.map((item) => item.amount);
    const balanceValues = finalBalanceData.map((item) => item.value);
    const combinedValues = [...contributionValues, ...balanceValues].filter((value) =>
        Number.isFinite(value)
    );
    const hasValues = combinedValues.length > 0;
    const rawMin = hasValues ? Math.min(...combinedValues) : 0;
    const rawMax = hasValues ? Math.max(...combinedValues) : 0;

    const {
        startYAxisAtZero = true,
        paddingRatio: configuredPaddingRatio = 0.05,
        minPaddingValue: configuredMinPadding = 0,
    } = CONTRIBUTION_CHART_SETTINGS || {};

    const paddingRatio = Number.isFinite(configuredPaddingRatio)
        ? Math.max(configuredPaddingRatio, 0)
        : 0.05;
    const minPaddingValue = Number.isFinite(configuredMinPadding)
        ? Math.max(configuredMinPadding, 0)
        : 0;

    let yMin = startYAxisAtZero ? Math.min(0, rawMin) : rawMin;
    let yMax = startYAxisAtZero ? Math.max(rawMax, 0) : rawMax;

    // In drawdown mode, force yMax to 0 and yMin to include all negative values
    if (drawdownMode) {
        yMax = 0;
        yMin = Math.min(rawMin, 0);
    }

    if (!hasValues) {
        yMin = startYAxisAtZero || drawdownMode ? 0 : 0;
        yMax = drawdownMode ? 0 : 1;
        if (drawdownMode) {
            yMin = -1;
        }
    }

    const range = yMax - yMin;
    const paddingDelta =
        range > 0
            ? Math.max(range * paddingRatio, minPaddingValue)
            : Math.max(Math.abs(yMax || yMin) * paddingRatio, minPaddingValue || 1);

    if (startYAxisAtZero) {
        yMax += paddingDelta;
    } else {
        yMin -= paddingDelta;
        yMax += paddingDelta;
    }

    if (yMax <= yMin) {
        const fallbackSpan = paddingDelta || 1;
        yMax = yMin + fallbackSpan;
    }

    const xScale = (t) =>
        padding.left +
        (maxTime === minTime ? plotWidth / 2 : ((t - minTime) / (maxTime - minTime)) * plotWidth);
    const yScale = (v) => padding.top + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;

    drawAxes(
        ctx,
        padding,
        plotWidth,
        plotHeight,
        minTime,
        maxTime,
        yMin,
        yMax,
        xScale,
        yScale,
        formatCurrencyCompact,
        false, // isPerformanceChart
        volumeHeight > 0 ? { drawXAxis: false } : {},
        transactionState.selectedCurrency || 'USD'
    );

    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);
    const contributionAnimationEnabled = isAnimationEnabled('contribution');
    const animationPhase = advanceContributionAnimation(timestamp);

    const animatedSeries = [];
    const filterStartTime = Number.isFinite(filterFromTime) ? filterFromTime : null;

    const formatBalanceValue = (value) =>
        formatCurrencyCompact(value, { currency: transactionState.selectedCurrency || 'USD' });

    const formatContributionAnnotationValue = (value) => {
        const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
        if (Math.abs(amount) < 1) {
            return formatBalanceValue(amount);
        }
        const currency = transactionState.selectedCurrency || 'USD';
        return formatCurrencyCompact(amount, { currency });
    };

    const showChartLabels = getShowChartLabels();
    let firstContributionLabelY = null;
    let contributionEndLabelY = null;

    if (showContribution && finalContributionData.length > 0) {
        animatedSeries.push({
            key: 'contribution',
            color: colors.contribution,
            lineWidth: CHART_LINE_WIDTHS.contribution ?? 2,
            order: 1,
            data: finalContributionData
                .filter((item) => {
                    const t = item.date.getTime();
                    return t >= minTime && t <= maxTime;
                })
                .map((item) => ({
                    time: item.date.getTime(),
                    value: item.amount,
                })),
        });
    }

    if (showBalance && finalBalanceData.length > 0) {
        animatedSeries.push({
            key: 'balance',
            color: colors.portfolio,
            lineWidth: CHART_LINE_WIDTHS.balance ?? 2,
            order: 2,
            data: finalBalanceData
                .filter((item) => {
                    const t = item.date.getTime();
                    return t >= minTime && t <= maxTime;
                })
                .map((item) => ({
                    time: item.date.getTime(),
                    value: item.value,
                })),
        });
    }

    animatedSeries.forEach((series) => {
        const coords = [];
        if (filterStartTime !== null && series.data.length > 0) {
            const firstPoint = series.data[0];
            if (filterStartTime < firstPoint.time) {
                coords.push({
                    x: xScale(filterStartTime),
                    y: yScale(firstPoint.value),
                    time: filterStartTime,
                    value: firstPoint.value,
                });
            }
        }

        series.data.forEach((point) => {
            coords.push({
                x: xScale(point.time),
                y: yScale(point.value),
                time: point.time,
                value: point.value,
            });
        });

        series.coords = coords;
    });

    // --- Draw Markers ---
    // Use raw data for markers since smoothed data doesn't have orderType
    const showMarkersConfig = CHART_MARKERS?.showContributionMarkers !== false;
    const markerGroups = new Map();

    if (showMarkersConfig) {
        rawContributionData.forEach((item) => {
            if (typeof item.orderType !== 'string') {
                return;
            }
            const type = item.orderType.toLowerCase();
            if (!((type === 'buy' && showBuy) || (type === 'sell' && showSell))) {
                return;
            }
            const timestamp = item.date.getTime();
            if (!Number.isFinite(timestamp)) {
                return;
            }

            if (!markerGroups.has(timestamp)) {
                markerGroups.set(timestamp, { buys: [], sells: [] });
            }
            const group = markerGroups.get(timestamp);
            const netAmount = Number(item.netAmount) || 0;
            const amount = Number(item.amount) || 0;
            const radius = Math.min(8, Math.max(2, Math.abs(netAmount) / 500));
            if (type === 'buy') {
                group.buys.push({ radius, amount, netAmount });
            } else {
                group.sells.push({ radius, amount, netAmount });
            }
        });
    }

    const volumeEntries = [];
    let maxVolume = 0;
    const volumeGroups = new Map();

    rawContributionData.forEach((item) => {
        if (typeof item.orderType !== 'string') {
            return;
        }
        const type = item.orderType.toLowerCase();

        // If we have explicit volume data, we can process even if type is 'mixed'
        const hasExplicitVolume = Number(item.buyVolume) > 0 || Number(item.sellVolume) > 0;

        if (!hasExplicitVolume && !((type === 'buy' && showBuy) || (type === 'sell' && showSell))) {
            return;
        }
        const normalizedDate = new Date(item.date.getTime());
        normalizedDate.setHours(0, 0, 0, 0);
        const timestamp = normalizedDate.getTime();
        if (!Number.isFinite(timestamp)) {
            return;
        }
        // Ensure volume bars are strictly within the visible chart range
        if (timestamp < minTime || timestamp > maxTime) {
            return;
        }
        const netAmount = Math.abs(Number(item.netAmount) || 0);
        if (!hasExplicitVolume && netAmount <= 0) {
            return;
        }

        if (!volumeGroups.has(timestamp)) {
            volumeGroups.set(timestamp, { totalBuy: 0, totalSell: 0 });
        }
        const totals = volumeGroups.get(timestamp);

        // Use pre-consolidated volumes if available
        if (Number.isFinite(item.buyVolume) || Number.isFinite(item.sellVolume)) {
            if (showBuy) {
                totals.totalBuy += Number(item.buyVolume) || 0;
            }
            if (showSell) {
                totals.totalSell += Number(item.sellVolume) || 0;
            }
        } else if (type === 'buy') {
            // Fallback for non-consolidated items
            totals.totalBuy += netAmount;
        } else {
            totals.totalSell += netAmount;
        }
    });

    volumeGroups.forEach((totals, timestamp) => {
        const { totalBuy, totalSell } = totals;
        const totalBuyVolume = totalBuy;
        const totalSellVolume = totalSell;
        if (totalBuyVolume === 0 && totalSellVolume === 0) {
            return;
        }

        maxVolume = Math.max(maxVolume, totalBuyVolume, totalSellVolume);
        volumeEntries.push({
            timestamp,
            totalBuyVolume,
            totalSellVolume,
        });
    });

    const buyVolumeMap = new Map();
    const sellVolumeMap = new Map();
    volumeEntries.forEach(({ timestamp, totalBuyVolume, totalSellVolume }) => {
        if (totalBuyVolume > 0) {
            buyVolumeMap.set(timestamp, totalBuyVolume);
        }
        if (totalSellVolume > 0) {
            sellVolumeMap.set(timestamp, totalSellVolume);
        }
    });

    const volumePadding = {
        top: volumeTop,
        right: padding.right,
        bottom: padding.bottom,
        left: padding.left,
    };

    let volumeYScale;
    if (volumeHeight > 0) {
        const volumeYMin = 0;
        const volumeYMax = maxVolume > 0 ? maxVolume * 1.1 : 1;
        const volumeRange = volumeYMax - volumeYMin || 1;
        volumeYScale = (value) =>
            volumePadding.top + volumeHeight - ((value - volumeYMin) / volumeRange) * volumeHeight;

        drawAxes(
            ctx,
            volumePadding,
            plotWidth,
            volumeHeight,
            minTime,
            maxTime,
            volumeYMin,
            volumeYMax,
            xScale,
            volumeYScale,
            formatCurrencyCompact,
            false,
            { drawYAxis: maxVolume > 0 },
            transactionState.selectedCurrency || 'USD'
        );
    }

    // Clip the drawing area to prevent overhangs and spikes for ALL chart elements
    ctx.save();
    ctx.beginPath();
    // Include volume area in clipping if volume is shown
    // clipTop must start at padding.top to include the main chart!
    const clipTop = padding.top;
    const clipHeight =
        volumeHeight > 0
            ? plotHeight + (volumeGap || 0) + volumeHeight + (volumePadding?.top || 0)
            : plotHeight;

    ctx.rect(padding.left, clipTop, plotWidth, clipHeight);
    ctx.clip();

    if (volumeHeight > 0 && volumeEntries.length > 0 && typeof volumeYScale === 'function') {
        volumeEntries.sort((a, b) => a.timestamp - b.timestamp);
        const barWidth = 8;
        const baselineY = volumePadding.top + volumeHeight;

        const allVolumeRects = [];

        volumeEntries.forEach((entry) => {
            const { timestamp, totalBuyVolume, totalSellVolume } = entry;
            const x = xScale(timestamp);

            const bars = [];
            if (totalBuyVolume > 0) {
                bars.push({
                    type: 'buy',
                    volume: totalBuyVolume,
                    fill: 'rgba(76, 175, 80, 0.6)',
                    stroke: 'rgba(76, 175, 80, 0.8)',
                });
            }
            if (totalSellVolume > 0) {
                bars.push({
                    type: 'sell',
                    volume: totalSellVolume,
                    fill: 'rgba(244, 67, 54, 0.6)',
                    stroke: 'rgba(244, 67, 54, 0.8)',
                });
            }
            if (bars.length === 0) {
                return;
            }

            // Determine max volume for this day to identify which bar should be narrower
            const dayMaxVolume = Math.max(totalBuyVolume, totalSellVolume);

            bars.forEach((bar) => {
                const topY = volumeYScale(bar.volume);
                const height = baselineY - topY;

                // Nested Widths Pattern:
                // If this bar is smaller than the day's max (or equal but we want one to be inner),
                // we adjust width. If both are equal, we can arbitrarily shrink one,
                // or keep both full width (which blends colors).
                // Better UX: If volumes are distinct, shrink the smaller one.
                // If volumes are exactly equal, shrink 'sell' to make it look like a "core" inside "buy"?
                // Or just keep them same size.
                // Let's go with: strictly smaller volume gets smaller width.

                let actualWidth = barWidth;
                if (bar.volume < dayMaxVolume) {
                    actualWidth = barWidth * 0.5; // 4px if base is 8px
                } else if (
                    bars.length === 2 &&
                    totalBuyVolume === totalSellVolume &&
                    bar.type === 'sell'
                ) {
                    // Tie-breaker: if equal, make sell bar narrower so both are seen
                    actualWidth = barWidth * 0.5;
                }

                const currentX = x - actualWidth / 2;

                if (height > 0) {
                    allVolumeRects.push({
                        timestamp,
                        x: currentX,
                        width: actualWidth,
                        topY,
                        height,
                        fill: bar.fill,
                        stroke: bar.stroke,
                        order: actualWidth < barWidth ? 1 : 0, // Draw narrower bars (1) after wider bars (0)
                    });
                }
            });
        });

        allVolumeRects
            .sort((a, b) => {
                if (a.height !== b.height) {
                    return b.height - a.height; // draw taller bars first so shorter remain visible
                }
                if (a.timestamp !== b.timestamp) {
                    return a.timestamp - b.timestamp;
                }
                return a.order - b.order;
            })
            .forEach((rect) => {
                ctx.fillStyle = rect.fill;
                ctx.fillRect(rect.x, rect.topY, rect.width, rect.height);

                ctx.strokeStyle = rect.stroke;
                ctx.lineWidth = 1;
                ctx.strokeRect(rect.x, rect.topY, rect.width, rect.height);
            });
    }

    const chartBounds = {
        top: padding.top,
        bottom: volumeHeight > 0 ? volumeTop : padding.top + plotHeight,
        left: padding.left,
        right: padding.left + plotWidth,
    };

    if (showMarkersConfig && markerGroups.size > 0) {
        markerGroups.forEach((group, timestamp) => {
            const x = xScale(timestamp);

            const sortedBuys = [...group.buys].sort((a, b) => b.radius - a.radius);
            let buyOffset = 8;
            sortedBuys.forEach((marker) => {
                const y = yScale(marker.amount) - buyOffset - marker.radius;
                drawMarker(ctx, x, y, marker.radius, true, colors, chartBounds);
                buyOffset += marker.radius * 2 + 4;
            });

            const sortedSells = [...group.sells].sort((a, b) => b.radius - a.radius);
            let sellOffset = 8;
            sortedSells.forEach((marker) => {
                const y = yScale(marker.amount) + sellOffset + marker.radius;
                drawMarker(ctx, x, y, marker.radius, false, colors, chartBounds);
                sellOffset += marker.radius * 2 + 4;
            });
        });
    }

    const sortedSeries = animatedSeries
        .map((series) => ({ ...series }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    let hasAnimatedSeries = false;

    const areaBaselineY = drawdownMode ? yScale(0) : chartBounds.bottom;

    // Line chart clipping is now handled by the global clip above,
    // but we might want to restrict it further to just the plot area (excluding volume)
    // However, since volume is below, and line chart is above, they don't overlap much.
    // But to be safe and consistent with previous logic:

    sortedSeries.forEach((series, index) => {
        const coords = series.coords || [];
        if (coords.length === 0) {
            return;
        }

        // Apply gradient effect for balance chart lines
        const gradientStops = BALANCE_GRADIENTS[series.key];
        if (gradientStops) {
            const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + plotWidth, 0);
            gradient.addColorStop(0, gradientStops[0]);
            gradient.addColorStop(1, gradientStops[1]);
            ctx.strokeStyle = gradient;
        } else {
            ctx.strokeStyle = series.color;
        }

        if (mountainFill.enabled) {
            const gradientStops = BALANCE_GRADIENTS[series.key];
            const colorStops =
                gradientStops && gradientStops.length === 2
                    ? gradientStops
                    : [series.color, series.color];

            drawMountainFill(ctx, coords, areaBaselineY, {
                color: series.color,
                colorStops,
                opacityTop: drawdownMode ? 0 : 0.35,
                opacityBottom: drawdownMode ? 0.35 : 0,
                bounds: chartBounds,
            });
        }

        ctx.beginPath();
        coords.forEach((coord, coordIndex) => {
            if (coordIndex === 0) {
                ctx.moveTo(coord.x, coord.y);
            } else {
                ctx.lineTo(coord.x, coord.y);
            }
        });
        ctx.lineWidth = series.lineWidth;
        ctx.stroke();

        if (contributionAnimationEnabled) {
            // Use gradient end color for glow effect
            const glowColor = gradientStops ? gradientStops[1] : series.color;
            drawSeriesGlow(
                ctx,
                { coords, color: glowColor, lineWidth: series.lineWidth },
                {
                    basePhase: animationPhase,
                    seriesIndex: index,
                    isMobile,
                    chartKey: 'contribution',
                }
            );
            hasAnimatedSeries = true;
        }
    });

    // ctx.restore(); // Removed inner restore, will restore at the end

    if (contributionAnimationEnabled && hasAnimatedSeries) {
        scheduleContributionAnimation(chartManager);
    } else {
        stopContributionAnimation();
    }

    // Draw start and end values using raw data to ensure accuracy (or transformed data for drawdown)
    const labelContributionData = drawdownMode ? finalContributionData : rawContributionData;
    if (showChartLabels && showContribution && labelContributionData.length > 0) {
        const contributionGradient = BALANCE_GRADIENTS['contribution'];
        const contributionStartColor = contributionGradient
            ? contributionGradient[0]
            : colors.contribution;
        const contributionEndColor = contributionGradient
            ? contributionGradient[1]
            : colors.contribution;

        const firstContribution =
            labelContributionData.find((item) => item.synthetic) ||
            labelContributionData.find((item) => {
                if (typeof item.orderType !== 'string') {
                    return true;
                }
                return item.orderType.toLowerCase() !== 'padding';
            }) ||
            labelContributionData[0];
        if (firstContribution) {
            const firstContributionX = xScale(firstContribution.date.getTime());
            const firstContributionY = yScale(
                drawdownMode ? firstContribution.amount : firstContribution.amount
            );
            firstContributionLabelY = drawStartValue(
                ctx,
                firstContributionX,
                firstContributionY,
                firstContribution.amount,
                contributionStartColor,
                isMobile,
                padding,
                plotWidth,
                plotHeight,
                formatContributionAnnotationValue,
                true
            );
        }

        const lastContribution = labelContributionData[labelContributionData.length - 1];
        const lastContributionX = xScale(lastContribution.date.getTime());
        const lastContributionY = yScale(lastContribution.amount);
        contributionEndLabelY = drawEndValue(
            ctx,
            lastContributionX,
            lastContributionY,
            lastContribution.amount,
            contributionEndColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatContributionAnnotationValue,
            true
        );
    }

    const labelBalanceData = drawdownMode ? finalBalanceData : rawBalanceData;
    if (showChartLabels && showBalance && labelBalanceData.length > 0) {
        const balanceGradient = BALANCE_GRADIENTS['balance'];
        const balanceStartColor = balanceGradient ? balanceGradient[0] : colors.portfolio;
        const balanceEndColor = balanceGradient ? balanceGradient[1] : colors.portfolio;

        const firstBalance = labelBalanceData[0];
        const firstBalanceX = xScale(firstBalance.date.getTime());
        let firstBalanceY = yScale(firstBalance.value);
        if (firstContributionLabelY !== null) {
            const minGap = isMobile ? 18 : 14;
            if (Math.abs(firstBalanceY - firstContributionLabelY) < minGap) {
                if (firstBalanceY >= firstContributionLabelY) {
                    firstBalanceY = Math.min(
                        firstBalanceY + minGap,
                        padding.top + plotHeight - minGap / 2
                    );
                } else {
                    firstBalanceY = Math.max(firstBalanceY - minGap, padding.top + minGap / 2);
                }
            }
        }
        drawStartValue(
            ctx,
            firstBalanceX,
            firstBalanceY,
            firstBalance.value,
            balanceStartColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatBalanceValue,
            true
        );

        const lastBalance = labelBalanceData[labelBalanceData.length - 1];
        const lastBalanceX = xScale(lastBalance.date.getTime());
        let lastBalanceY = yScale(lastBalance.value);
        if (contributionEndLabelY !== null) {
            const minGap = isMobile ? 18 : 14;
            if (Math.abs(lastBalanceY - contributionEndLabelY) < minGap) {
                if (lastBalanceY >= contributionEndLabelY) {
                    lastBalanceY = Math.min(
                        lastBalanceY + minGap,
                        padding.top + plotHeight - minGap / 2
                    );
                } else {
                    lastBalanceY = Math.max(lastBalanceY - minGap, padding.top + minGap / 2);
                }
            }
        }
        drawEndValue(
            ctx,
            lastBalanceX,
            lastBalanceY,
            lastBalance.value,
            balanceEndColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatBalanceValue,
            true
        );
    }

    ctx.restore(); // Restore the global clip

    if (legendState.contributionDirty) {
        // Use gradient end colors for legend
        const contributionGradient = BALANCE_GRADIENTS['contribution'];
        const balanceGradient = BALANCE_GRADIENTS['balance'];
        const legendSeries = [
            {
                key: 'contribution',
                name: 'Contribution',
                color: contributionGradient ? contributionGradient[1] : colors.contribution,
            },
        ];
        if (hasBalanceSeries) {
            legendSeries.push({
                key: 'balance',
                name: 'Balance',
                color: balanceGradient ? balanceGradient[1] : colors.portfolio,
            });
        }
        legendSeries.push({ key: 'buy', name: 'Buy', color: colors.buy });
        legendSeries.push({ key: 'sell', name: 'Sell', color: colors.sell });
        updateLegend(legendSeries, chartManager);
        legendState.contributionDirty = false;
    }

    const normalizeToDay = (time) => {
        const day = new Date(time);
        day.setHours(0, 0, 0, 0);
        return day.getTime();
    };

    const baseSeries = animatedSeries.map((series) => {
        const displayLabel = series.key === 'balance' ? 'Balance' : 'Contribution';
        let displayColor = series.color;
        if (series.key === 'balance') {
            displayColor =
                (BALANCE_GRADIENTS.balance && BALANCE_GRADIENTS.balance[1]) || colors.portfolio;
        } else if (series.key === 'contribution') {
            displayColor =
                (BALANCE_GRADIENTS.contribution && BALANCE_GRADIENTS.contribution[1]) ||
                colors.contribution;
        }
        return {
            key: series.key,
            label: displayLabel,
            color: displayColor,
            getValueAtTime: createTimeInterpolator(series.data),
            formatValue: formatBalanceValue,
            formatDelta: (delta) => formatCurrencyInline(delta),
        };
    });

    const volumeSeries = [];
    const makeVolumeGetter = (map) => (time) => {
        const value = map.get(normalizeToDay(time));
        return Number.isFinite(value) ? value : 0;
    };

    volumeSeries.push({
        key: 'buyVolume',
        label: 'Buy',
        color: colors.buy,
        getValueAtTime: makeVolumeGetter(buyVolumeMap),
        formatValue: formatCurrencyInline,
        includeInRangeSummary: false,
        drawMarker: false,
    });

    volumeSeries.push({
        key: 'sellVolume',
        label: 'Sell',
        color: colors.sell,
        getValueAtTime: makeVolumeGetter(sellVolumeMap),
        formatValue: formatCurrencyInline,
        includeInRangeSummary: false,
        drawMarker: false,
    });

    const layoutKey = drawdownMode ? 'drawdownAbs' : 'contribution';
    chartLayouts[layoutKey] = {
        key: layoutKey,
        minTime,
        maxTime,
        valueType: 'currency',
        padding,
        chartBounds,
        xScale,
        yScale,
        invertX: (pixelX) => {
            if (!Number.isFinite(pixelX)) {
                return minTime;
            }
            const clampedX = Math.max(padding.left, Math.min(padding.left + plotWidth, pixelX));
            if (plotWidth <= 0 || maxTime === minTime) {
                return minTime;
            }
            const ratio = (clampedX - padding.left) / plotWidth;
            return clampTime(minTime + ratio * (maxTime - minTime), minTime, maxTime);
        },
        series: [...baseSeries, ...volumeSeries],
    };

    drawCrosshairOverlay(ctx, chartLayouts[layoutKey]);

    if (contributionAnimationEnabled && hasAnimatedSeries) {
        scheduleContributionAnimation(chartManager);
    } else {
        stopContributionAnimation();
    }
}

function drawFxChart(ctx, chartManager, timestamp) {
    stopPerformanceAnimation();
    stopContributionAnimation();
    const fxAnimationEnabled = isAnimationEnabled('fx');
    const animationPhase = fxAnimationEnabled ? advanceFxAnimation(timestamp) : 0;
    let glowIndex = 0;
    const canvas = ctx.canvas;
    const emptyState = document.getElementById('runningAmountEmpty');
    const baseCurrency = (transactionState.selectedCurrency || 'USD').toUpperCase();
    const seriesData = buildFxChartSeries(baseCurrency);

    if (!seriesData.length) {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        chartLayouts.fx = null;
        updateCrosshairUI(null, null);
        stopFxAnimation();
        return;
    }
    if (emptyState) {
        emptyState.style.display = 'none';
    }

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? new Date(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? new Date(chartDateRange.to) : null;

    const filteredSeries = seriesData
        .map((series) => {
            const filtered = series.data.filter((point) => {
                const date = point.date;
                return (!filterFrom || date >= filterFrom) && (!filterTo || date <= filterTo);
            });
            if (!filtered.length) {
                return { ...series, data: [] };
            }
            // Normalize to percent change since first point
            const baseValue = filtered[0].value;
            const safeBase = Number.isFinite(baseValue) && baseValue !== 0 ? baseValue : 1;
            const percentData = filtered.map((point) => ({
                ...point,
                percent: ((point.value - safeBase) / safeBase) * 100,
                rawValue: point.value,
            }));
            return { ...series, data: percentData };
        })
        .filter((series) => series.data.length > 0);

    if (!filteredSeries.length) {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        stopFxAnimation();
        chartLayouts.fx = null;
        updateCrosshairUI(null, null);
        return;
    }

    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 60 }
        : { top: 20, right: 30, bottom: 48, left: 80 };
    const plotWidth = canvas.offsetWidth - padding.left - padding.right;
    const plotHeight = canvas.offsetHeight - padding.top - padding.bottom;
    const chartBounds = {
        top: padding.top,
        bottom: padding.top + plotHeight,
        left: padding.left,
        right: padding.left + plotWidth,
    };

    let minTime = Infinity;
    let maxTime = -Infinity;
    let dataMin = Infinity;
    let dataMax = -Infinity;

    filteredSeries.forEach((series) => {
        series.data.forEach((point) => {
            const time = point.date.getTime();
            if (Number.isFinite(time)) {
                minTime = Math.min(minTime, time);
                maxTime = Math.max(maxTime, time);
            }
            if (Number.isFinite(point.percent)) {
                dataMin = Math.min(dataMin, point.percent);
                dataMax = Math.max(dataMax, point.percent);
            }
        });
    });

    if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || minTime === maxTime) {
        chartLayouts.fx = null;
        updateCrosshairUI(null, null);
        stopFxAnimation();
        return;
    }

    if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
        chartLayouts.fx = null;
        updateCrosshairUI(null, null);
        stopFxAnimation();
        return;
    }

    const paddingValue = Math.max((dataMax - dataMin) * 0.05, 0.05);
    let yMin = dataMin - paddingValue;
    let yMax = dataMax + paddingValue;

    const percentTickInfo = computePercentTickInfo(yMin, yMax);
    const displayRange = yMax - yMin;
    if (
        Number.isFinite(displayRange) &&
        displayRange > 0 &&
        percentTickInfo.tickSpacing > 0 &&
        displayRange >= percentTickInfo.tickSpacing * 0.4
    ) {
        yMin = percentTickInfo.startTick;
        yMax = percentTickInfo.endTick;
    }

    const xScale = (t) =>
        padding.left +
        (maxTime === minTime ? plotWidth / 2 : ((t - minTime) / (maxTime - minTime)) * plotWidth);
    const yScale = (v) =>
        padding.top +
        plotHeight -
        (yMax === yMin ? plotHeight / 2 : ((v - yMin) / (yMax - yMin)) * plotHeight);

    drawAxes(
        ctx,
        padding,
        plotWidth,
        plotHeight,
        minTime,
        maxTime,
        yMin,
        yMax,
        xScale,
        yScale,
        (v) => `${v.toFixed(0)}%`,
        false,
        { drawXAxis: true, drawYAxis: true },
        transactionState.selectedCurrency || 'USD',
        true
    );

    const showChartLabels = getShowChartLabels();
    const renderedSeries = [];
    filteredSeries.forEach((series) => {
        const visibility = transactionState.chartVisibility[series.key];
        if (visibility === false) {
            return;
        }

        const smoothingConfig = getSmoothingConfig('performance');
        const rawPoints = series.data.map((point) => ({
            x: point.date.getTime(),
            y: point.percent,
            raw: point.rawValue,
        }));
        const smoothed = smoothingConfig
            ? smoothFinancialData(rawPoints, smoothingConfig, true)
            : rawPoints;

        const coords = smoothed.map((point, index) => {
            const source = rawPoints[index] || rawPoints[rawPoints.length - 1];
            return {
                x: xScale(point.x),
                y: yScale(point.y),
                time: point.x,
                value: point.y,
                rawValue: source?.raw ?? source?.y ?? point.y,
            };
        });
        if (!coords.length) {
            return;
        }

        const baseColor = series.color;
        const gradientStops = FX_GRADIENTS[series.quote] || FX_GRADIENTS[series.label] || null;
        const darkColor = gradientStops ? gradientStops[0] : darkenColor(baseColor, 0.15);
        const lightColor = gradientStops ? gradientStops[1] : lightenColor(baseColor, 0.2);
        const resolvedColor = lightColor;
        const strokeGradient = ctx.createLinearGradient(
            padding.left,
            0,
            padding.left + plotWidth,
            0
        );
        strokeGradient.addColorStop(0, darkColor);
        strokeGradient.addColorStop(1, lightColor);

        if (mountainFill.enabled) {
            drawMountainFill(ctx, coords, yScale(0), {
                color: baseColor,
                colorStops: [darkColor, lightColor],
                opacityTop: 0.3,
                opacityBottom: 0,
                bounds: chartBounds,
            });
        }

        ctx.beginPath();
        coords.forEach((coord, index) => {
            if (index === 0) {
                ctx.moveTo(coord.x, coord.y);
            } else {
                ctx.lineTo(coord.x, coord.y);
            }
        });
        ctx.lineWidth = CHART_LINE_WIDTHS.fx ?? 2;
        ctx.strokeStyle = strokeGradient;
        ctx.stroke();

        if (showChartLabels) {
            const lastCoord = coords[coords.length - 1];
            drawEndValue(
                ctx,
                lastCoord.x,
                lastCoord.y,
                lastCoord.value,
                resolvedColor,
                isMobile,
                padding,
                plotWidth,
                plotHeight,
                formatPercentInline,
                true
            );
        }

        renderedSeries.push({
            key: series.key,
            label: series.label,
            color: resolvedColor,
            points: coords.map((coord) => ({ time: coord.time, value: coord.value })),
            rawPoints: coords.map((coord) => ({ time: coord.time, value: coord.rawValue })),
        });

        if (fxAnimationEnabled) {
            drawSeriesGlow(
                ctx,
                { coords, color: lightColor, lineWidth: 2 },
                {
                    basePhase: animationPhase,
                    seriesIndex: glowIndex,
                    isMobile,
                    chartKey: 'fx',
                }
            );
            glowIndex += 1;
        }
    });

    if (!renderedSeries.length) {
        stopFxAnimation();
        chartLayouts.fx = null;
        updateCrosshairUI(null, null);
        return;
    }

    chartLayouts.fx = {
        key: 'fx',
        minTime,
        maxTime,
        valueType: 'percent',
        padding,
        chartBounds,
        xScale,
        yScale,
        invertX: (pixelX) => {
            if (!Number.isFinite(pixelX)) {
                return minTime;
            }
            const clampedX = Math.max(padding.left, Math.min(padding.left + plotWidth, pixelX));
            if (plotWidth <= 0 || maxTime === minTime) {
                return minTime;
            }
            const ratio = (clampedX - padding.left) / plotWidth;
            return clampTime(minTime + ratio * (maxTime - minTime), minTime, maxTime);
        },
        series: renderedSeries.map((series) => {
            const rawInterpolator = createTimeInterpolator(series.rawPoints || []);
            return {
                key: series.key,
                label: series.label,
                color: series.color,
                getValueAtTime: createTimeInterpolator(series.points || []),
                getRawValueAtTime: rawInterpolator,
                formatValue: (value, time) => {
                    const raw = rawInterpolator(time);
                    const percentText = formatPercentInline(value);
                    if (!Number.isFinite(raw)) {
                        return percentText;
                    }
                    return `${formatFxValue(raw)} (${percentText})`;
                },
                formatDelta: (delta, percentChange, startTime, endTime) => {
                    const startRaw = rawInterpolator(startTime);
                    const endRaw = rawInterpolator(endTime);
                    const rawDelta =
                        Number.isFinite(startRaw) && Number.isFinite(endRaw)
                            ? endRaw - startRaw
                            : null;
                    const percentText = Number.isFinite(percentChange)
                        ? formatPercentInline(percentChange)
                        : formatPercentInline(delta);
                    if (Number.isFinite(rawDelta) && Math.abs(rawDelta) > 1e-6) {
                        const rawText = `${rawDelta >= 0 ? '+' : '−'}${formatFxValue(
                            Math.abs(rawDelta)
                        )}`;
                        return `${rawText} (${percentText})`;
                    }
                    return percentText;
                },
            };
        }),
    };

    if (fxAnimationEnabled && glowIndex > 0) {
        scheduleFxAnimation(chartManager);
    } else {
        stopFxAnimation();
    }

    drawCrosshairOverlay(ctx, chartLayouts.fx);

    const legendEntries = renderedSeries.map((series) => ({
        key: series.key,
        name: series.label,
        color: series.color,
    }));
    updateLegend(legendEntries, chartManager);
}

async function drawDrawdownChart(ctx, chartManager, timestamp) {
    const selectedCurrency = transactionState.selectedCurrency || 'USD';
    // Percentage Drawdown Chart (Benchmarks)
    // Absolute drawdown is now handled by drawContributionChart with drawdownMode=true

    stopContributionAnimation();
    stopFxAnimation();

    const canvas = ctx.canvas;
    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 50 }
        : { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvas.offsetWidth - padding.left - padding.right;
    const plotHeight = canvas.offsetHeight - padding.top - padding.bottom;

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? new Date(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? new Date(chartDateRange.to) : null;

    let seriesToDraw = [];
    let orderedKeys = [];

    // ========== PERCENTAGE MODE ==========
    // Use performanceSeries (benchmark data) and calculate percentage drawdown
    const performanceSeries =
        transactionState.performanceSeries && typeof transactionState.performanceSeries === 'object'
            ? transactionState.performanceSeries
            : {};

    if (Object.keys(performanceSeries).length === 0) {
        stopPerformanceAnimation();
        chartLayouts.drawdown = null;
        updateCrosshairUI(null, null);
        return;
    }

    const { chartVisibility } = transactionState;
    orderedKeys = Object.keys(performanceSeries).sort((a, b) => {
        if (a === '^LZ') {
            return -1;
        }
        if (b === '^LZ') {
            return 1;
        }
        return a.localeCompare(b);
    });

    orderedKeys.forEach((key) => {
        if (transactionState.chartVisibility[key] === undefined) {
            transactionState.chartVisibility[key] = key === '^LZ' || key === '^GSPC';
        }
    });

    const allExpectedSeries = orderedKeys.map((key) => {
        const points = Array.isArray(performanceSeries[key]) ? performanceSeries[key] : [];
        const sourceCurrency = PERFORMANCE_SERIES_CURRENCY[key] || 'USD';

        const convertedPoints = points.map((point) => ({
            date: point.date,
            value: convertBetweenCurrencies(
                Number(point.value),
                sourceCurrency,
                point.date,
                selectedCurrency
            ),
        }));

        const drawdownPoints = buildDrawdownSeries(convertedPoints);

        return {
            key,
            name: key,
            data: drawdownPoints,
        };
    });

    seriesToDraw = allExpectedSeries.filter((s) => chartVisibility[s.key] !== false);

    if (seriesToDraw.length === 0) {
        stopPerformanceAnimation();
        chartLayouts.drawdown = null;
        updateCrosshairUI(null, null);
        return;
    }

    // Filter by date range
    seriesToDraw = seriesToDraw
        .map((series) => {
            const filteredData = series.data.filter((d) => {
                const pointDate = d.date;
                return (
                    (!filterFrom || pointDate >= filterFrom) && (!filterTo || pointDate <= filterTo)
                );
            });
            return { ...series, data: filteredData };
        })
        .filter((s) => s.data.length > 0);

    if (seriesToDraw.length === 0) {
        stopPerformanceAnimation();
        return;
    }

    // ========== COMMON RENDERING LOGIC ==========
    const allPoints = seriesToDraw.flatMap((s) => s.data);
    const allTimes = allPoints.map((p) => new Date(p.date).getTime());
    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);
    const allValues = allPoints.map((p) => p.value);
    const dataMin = Math.min(...allValues);
    // dataMax not needed since yMax is fixed at 0

    // Y-axis: 0 at top, most negative at bottom
    const yMax = 0; // Hard ceiling at 0
    let yMin = dataMin;

    // Add padding to bottom
    const range = Math.abs(yMax - yMin);
    const paddingVal = Math.max(range * 0.05, 1);
    yMin -= paddingVal;

    const xScale = (t) =>
        padding.left +
        (maxTime === minTime ? plotWidth / 2 : ((t - minTime) / (maxTime - minTime)) * plotWidth);
    const yScale = (v) => padding.top + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;

    // Format Y-axis labels
    const yLabelFormatter = (v) => `${v.toFixed(0)}%`;

    drawAxes(
        ctx,
        padding,
        plotWidth,
        plotHeight,
        minTime,
        maxTime,
        yMin,
        yMax,
        xScale,
        yScale,
        yLabelFormatter,
        true // isPerformanceChart style for percentage mode
    );

    const performanceAnimationEnabled = isAnimationEnabled('performance');
    const animationPhase = advancePerformanceAnimation(timestamp);

    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);
    const colorMap = {
        // Benchmark colors for percentage mode
        '^LZ': BENCHMARK_GRADIENTS['^LZ']?.[1] || colors.portfolio,
        '^GSPC': BENCHMARK_GRADIENTS['^GSPC']?.[1] || '#4caf50',
        '^IXIC': BENCHMARK_GRADIENTS['^IXIC']?.[1] || '#ff9800',
        '^DJI': BENCHMARK_GRADIENTS['^DJI']?.[1] || '#2196f3',
        '^SSEC': BENCHMARK_GRADIENTS['^SSEC']?.[1] || '#e91e63',
        '^HSI': BENCHMARK_GRADIENTS['^HSI']?.[1] || '#9c27b0',
        '^N225': BENCHMARK_GRADIENTS['^N225']?.[1] || '#00bcd4',
    };

    const lineThickness = CHART_LINE_WIDTHS.performance ?? 2;
    const renderedSeries = [];
    let glowIndex = 0;

    const chartBounds = {
        top: padding.top,
        bottom: padding.top + plotHeight,
        left: padding.left,
        right: padding.left + plotWidth,
    };

    const zeroLineY = yScale(0);

    seriesToDraw.forEach((series) => {
        const resolvedColor = colorMap[series.key] || colors.contribution;
        const gradientStops = BENCHMARK_GRADIENTS[series.key];

        if (gradientStops) {
            const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + plotWidth, 0);
            gradient.addColorStop(0, gradientStops[0]);
            gradient.addColorStop(1, gradientStops[1]);
            ctx.strokeStyle = gradient;
        } else {
            ctx.strokeStyle = resolvedColor;
        }

        const coords = series.data.map((point) => {
            const time = new Date(point.date).getTime();
            return {
                x: xScale(time),
                y: yScale(point.value),
                time,
                value: point.value,
            };
        });

        // "Underwater" fill: fill area between line and 0
        if (mountainFill.enabled) {
            drawMountainFill(ctx, coords, zeroLineY, {
                color: resolvedColor,
                colorStops: gradientStops || [resolvedColor, resolvedColor],
                opacityTop: 0.05,
                opacityBottom: 0.35,
                bounds: chartBounds,
            });
        }

        ctx.beginPath();
        coords.forEach((coord, index) => {
            if (index === 0) {
                ctx.moveTo(coord.x, coord.y);
            } else {
                ctx.lineTo(coord.x, coord.y);
            }
        });
        ctx.lineWidth = lineThickness;
        ctx.stroke();

        renderedSeries.push({
            key: series.key,
            name: series.name,
            color: resolvedColor,
            points: coords.map((c) => ({ time: c.time, value: c.value })),
        });

        if (performanceAnimationEnabled) {
            drawSeriesGlow(
                ctx,
                { coords, color: resolvedColor, lineWidth: lineThickness },
                {
                    basePhase: animationPhase,
                    seriesIndex: glowIndex,
                    isMobile,
                    chartKey: 'performance',
                }
            );
            glowIndex++;
        }
    });

    if (renderedSeries.length === 0) {
        stopPerformanceAnimation();
        return;
    }

    if (performanceAnimationEnabled && glowIndex > 0) {
        schedulePerformanceAnimation(chartManager);
    } else if (!performanceAnimationEnabled) {
        stopPerformanceAnimation();
    }

    const showChartLabels = getShowChartLabels();
    if (showChartLabels) {
        seriesToDraw.forEach((series) => {
            const lastData = series.data[series.data.length - 1];
            if (!lastData) {
                return;
            }
            const x = xScale(new Date(lastData.date).getTime());
            const y = yScale(lastData.value);
            const resolvedColor = colorMap[series.key] || colors.contribution;

            const formatter = (v) => `${v.toFixed(2)}%`;

            drawEndValue(
                ctx,
                x,
                y,
                lastData.value,
                resolvedColor,
                isMobile,
                padding,
                plotWidth,
                plotHeight,
                formatter,
                true
            );
        });
    }

    // Store layout for crosshair
    const layoutKey = 'drawdown';
    const valueFormatter = (value) => `${value.toFixed(2)}%`;
    const deltaFormatter = (delta) => `${delta > 0 ? '+' : ''}${delta.toFixed(2)}%`;

    chartLayouts[layoutKey] = {
        key: layoutKey,
        minTime,
        maxTime,
        valueType: 'percent',
        padding,
        chartBounds,
        xScale,
        yScale,
        invertX: (pixelX) => {
            if (!Number.isFinite(pixelX)) {
                return minTime;
            }
            const clampedX = Math.max(padding.left, Math.min(padding.left + plotWidth, pixelX));
            if (plotWidth <= 0 || maxTime === minTime) {
                return minTime;
            }
            const ratio = (clampedX - padding.left) / plotWidth;
            return clampTime(minTime + ratio * (maxTime - minTime), minTime, maxTime);
        },
        series: renderedSeries.map((s) => ({
            key: s.key,
            label: s.name,
            color: s.color,
            getValueAtTime: createTimeInterpolator(s.points || []),
            formatValue: valueFormatter,
            formatDelta: deltaFormatter,
        })),
    };

    drawCrosshairOverlay(ctx, chartLayouts[layoutKey]);

    if (legendState.performanceDirty) {
        const legendSeries = orderedKeys.map((key) => ({
            key,
            name: key,
            color: colorMap[key] || colors.contribution,
        }));
        updateLegend(legendSeries, chartManager);
        legendState.performanceDirty = false;
    }
}

function aggregateCompositionSeries(tickers, chartData, seriesLength) {
    if (!Array.isArray(tickers) || tickers.length === 0 || !Number.isFinite(seriesLength)) {
        return null;
    }
    const aggregated = Array.from({ length: seriesLength }, () => 0);
    tickers.forEach((ticker) => {
        const values = chartData[ticker] || [];
        for (let i = 0; i < seriesLength; i += 1) {
            const value = Number(values[i] ?? 0);
            if (Number.isFinite(value)) {
                aggregated[i] += value;
            }
        }
    });
    return aggregated;
}

function buildCompositionDisplayOrder(
    baseOrder,
    chartData,
    filterTickers,
    seriesLength,
    referenceData = null
) {
    if (!Array.isArray(baseOrder) || baseOrder.length === 0) {
        return { order: [], filteredOthers: null };
    }
    const normalizedFilter = Array.isArray(filterTickers)
        ? filterTickers.map((ticker) => ticker.toUpperCase()).filter(Boolean)
        : [];
    if (normalizedFilter.length === 0) {
        return { order: [...baseOrder], filteredOthers: null };
    }

    const filterSet = new Set(normalizedFilter);
    const selectedOrder = baseOrder.filter((ticker) => filterSet.has(ticker.toUpperCase()));
    if (selectedOrder.length === 0) {
        return { order: [...baseOrder], filteredOthers: null };
    }

    const remainder = baseOrder.filter((ticker) => !filterSet.has(ticker.toUpperCase()));
    const includeFilteredOthers = remainder.length > 0 && !filterSet.has('OTHERS');
    const filteredOthers = includeFilteredOthers
        ? aggregateCompositionSeries(remainder, chartData, seriesLength)
        : null;
    const filteredReference =
        includeFilteredOthers && referenceData
            ? aggregateCompositionSeries(remainder, referenceData, seriesLength)
            : null;
    const order = filteredOthers ? [...selectedOrder, 'Others'] : selectedOrder;
    return { order, filteredOthers, filteredReference };
}

function renderCompositionChartWithMode(ctx, chartManager, data, options = {}) {
    const valueMode = options.valueMode === 'absolute' ? 'absolute' : 'percent';

    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray(data.dates) ||
        data.dates.length === 0
    ) {
        chartLayouts.composition = null;
        chartLayouts.compositionAbs = null;
        updateCrosshairUI(null, null);
        const emptyState = document.getElementById('runningAmountEmpty');
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    const emptyState = document.getElementById('runningAmountEmpty');
    if (emptyState) {
        emptyState.style.display = 'none';
    }

    const rawDates = data.dates.slice();
    const rawSeries = data.composition || data.series || {};
    const selectedCurrency = transactionState.selectedCurrency || 'USD';

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? new Date(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? new Date(chartDateRange.to) : null;

    const filteredIndices = rawDates
        .map((dateStr, index) => {
            const date = new Date(dateStr);
            return { index, date };
        })
        .filter(({ date }) => {
            if (Number.isNaN(date.getTime())) {
                return false;
            }
            if (filterFrom && date < filterFrom) {
                return false;
            }
            if (filterTo && date > filterTo) {
                return false;
            }
            return true;
        })
        .map(({ index }) => index);

    const dates =
        filteredIndices.length > 0 ? filteredIndices.map((i) => rawDates[i]) : rawDates.slice();

    if (dates.length === 0) {
        if (valueMode === 'absolute') {
            chartLayouts.compositionAbs = null;
        } else {
            chartLayouts.composition = null;
        }
        updateCrosshairUI(null, null);
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    const rawTotalValues = Array.isArray(data.total_values) ? data.total_values : [];
    const mappedTotalValues =
        filteredIndices.length > 0
            ? filteredIndices.map((index) => Number(rawTotalValues[index] ?? 0))
            : rawTotalValues.map((value) => Number(value ?? 0));
    const totalValuesUsd =
        mappedTotalValues.length === dates.length
            ? mappedTotalValues
            : dates.map((_, idx) => Number(mappedTotalValues[idx] ?? 0));
    const totalValuesConverted = totalValuesUsd.map((value, idx) => {
        const converted = convertValueToCurrency(value, dates[idx], selectedCurrency);
        return Number.isFinite(converted) ? converted : 0;
    });

    const percentSeriesMap = {};
    const chartData = {};
    Object.entries(rawSeries).forEach(([ticker, values]) => {
        const arr = Array.isArray(values) ? values : [];
        const mappedPercent =
            filteredIndices.length > 0
                ? filteredIndices.map((i) => Number(arr[i] ?? 0))
                : arr.map((value) => Number(value ?? 0));
        const percentValues =
            mappedPercent.length === dates.length
                ? mappedPercent
                : dates.map((_, idx) => Number(mappedPercent[idx] ?? 0));
        percentSeriesMap[ticker] = percentValues;
        if (valueMode === 'absolute') {
            chartData[ticker] = percentValues.map(
                (pct, idx) => ((totalValuesConverted[idx] ?? 0) * pct) / 100
            );
        } else {
            chartData[ticker] = percentValues;
        }
    });

    const baseTickerOrder = Object.keys(chartData).sort((a, b) => {
        const arrA = chartData[a] || [];
        const arrB = chartData[b] || [];
        const lastA = arrA[arrA.length - 1] ?? 0;
        const lastB = arrB[arrB.length - 1] ?? 0;
        return lastB - lastA;
    });

    const explicitTickerFilters = getCompositionFilterTickers();
    let derivedTickerFilters = explicitTickerFilters;
    if (!derivedTickerFilters.length) {
        const assetClassFilter = getCompositionAssetClassFilter();
        if (assetClassFilter === 'etf' || assetClassFilter === 'stock') {
            const shouldMatchEtf = assetClassFilter === 'etf';
            derivedTickerFilters = baseTickerOrder.filter((ticker) => {
                if (typeof ticker === 'string' && ticker.toUpperCase() === 'OTHERS') {
                    return false;
                }
                const assetClass = getHoldingAssetClass(ticker);
                return shouldMatchEtf ? assetClass === 'etf' : assetClass !== 'etf';
            });
        }
    }

    const {
        order: filteredOrder,
        filteredOthers,
        filteredReference,
    } = buildCompositionDisplayOrder(
        baseTickerOrder,
        chartData,
        derivedTickerFilters,
        dates.length,
        valueMode === 'absolute' ? percentSeriesMap : null
    );
    const percentOthersSeries = valueMode === 'absolute' ? filteredReference : filteredOthers;
    const activeTickerOrder = filteredOrder.length > 0 ? filteredOrder : baseTickerOrder;
    const usingFilteredOthers = Boolean(filteredOthers);

    const canvas = ctx.canvas;
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 18, bottom: 36, left: 48 }
        : { top: 22, right: 26, bottom: 48, left: 68 };
    const plotWidth = canvasWidth - padding.left - padding.right;
    const plotHeight = canvasHeight - padding.top - padding.bottom;
    if (plotWidth <= 0 || plotHeight <= 0) {
        if (valueMode === 'absolute') {
            chartLayouts.compositionAbs = null;
        } else {
            chartLayouts.composition = null;
        }
        updateCrosshairUI(null, null);
        return;
    }

    const colors = COLOR_PALETTES.COMPOSITION_CHART_COLORS;
    const resolveTickerColor = (ticker) => {
        let colorIndex = baseTickerOrder.indexOf(ticker);
        if (colorIndex === -1 && ticker === 'Others') {
            colorIndex = baseTickerOrder.indexOf('Others');
        }
        if (colorIndex === -1) {
            colorIndex = baseTickerOrder.length;
        }
        return colors[colorIndex % colors.length];
    };

    const dateTimes = dates.map((dateStr) => new Date(dateStr).getTime());
    const minTime = Math.min(...dateTimes);
    const maxTime = Math.max(...dateTimes);

    const xScale = (time) =>
        padding.left +
        (maxTime === minTime
            ? plotWidth / 2
            : ((time - minTime) / (maxTime - minTime)) * plotWidth);

    const yMin = 0;
    const maxTotalValue = Math.max(
        ...totalValuesConverted.filter((value) => Number.isFinite(value)),
        0
    );
    const yMax = valueMode === 'absolute' ? Math.max(maxTotalValue, 1) : 100;
    const yScale = (value) =>
        padding.top + plotHeight - ((value - yMin) / (yMax - yMin || 1)) * plotHeight;
    const axisFormatter =
        valueMode === 'absolute'
            ? (val) => formatCurrencyCompact(val, { currency: selectedCurrency })
            : (val) => `${val}%`;
    const chartBounds = {
        top: padding.top,
        bottom: padding.top + plotHeight,
        left: padding.left,
        right: padding.left + plotWidth,
    };

    drawAxes(
        ctx,
        padding,
        plotWidth,
        plotHeight,
        minTime,
        maxTime,
        yMin,
        yMax,
        xScale,
        yScale,
        axisFormatter,
        valueMode !== 'absolute'
    );

    let cumulativeValues = new Array(dates.length).fill(0);

    activeTickerOrder.forEach((ticker, tickerIndex) => {
        const values =
            ticker === 'Others' && usingFilteredOthers ? filteredOthers : chartData[ticker] || [];
        if (!Array.isArray(values) || values.length !== dates.length) {
            return;
        }
        const color = resolveTickerColor(ticker) || colors[tickerIndex % colors.length];
        ctx.beginPath();
        ctx.fillStyle = `${color}80`;
        ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
        ctx.lineWidth = 1;

        dates.forEach((dateStr, index) => {
            const x = xScale(new Date(dateStr).getTime());
            const y = yScale(cumulativeValues[index] + values[index]);
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        for (let i = dates.length - 1; i >= 0; i -= 1) {
            const x = xScale(new Date(dates[i]).getTime());
            const y = yScale(cumulativeValues[i]);
            ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        cumulativeValues = cumulativeValues.map((val, index) => val + values[index]);
    });

    const latestIndex = dates.length - 1;
    const percentSeriesForTicker = (ticker) => {
        if (ticker === 'Others' && percentOthersSeries) {
            return percentOthersSeries;
        }
        return percentSeriesMap[ticker] || [];
    };
    const othersPercentSeries = percentSeriesForTicker('Others');
    const othersPercentage =
        othersPercentSeries.length > 0 ? (othersPercentSeries[latestIndex] ?? 0) : 0;
    const shouldIncludeOthers = othersPercentage > 50 || usingFilteredOthers;

    const buildHoldingInfo = (ticker) => {
        const percentSeries = percentSeriesForTicker(ticker);
        const percent = percentSeries[latestIndex] ?? 0;
        const absoluteSeries =
            ticker === 'Others' && usingFilteredOthers ? filteredOthers : chartData[ticker] || [];
        const latestTotal = totalValuesConverted[latestIndex] ?? 0;
        const absoluteValue =
            valueMode === 'absolute'
                ? (absoluteSeries[latestIndex] ?? 0)
                : (latestTotal * percent) / 100;
        return {
            ticker,
            percent,
            absolute: absoluteValue,
        };
    };

    const latestHoldings = activeTickerOrder
        .filter((ticker) => shouldIncludeOthers || ticker !== 'Others')
        .map(buildHoldingInfo)
        .filter((holding) => holding.percent > 0.1)
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 6);

    const holdingsForLegend =
        latestHoldings.length > 0
            ? latestHoldings
            : activeTickerOrder
                  .filter((ticker) => shouldIncludeOthers || ticker !== 'Others')
                  .map(buildHoldingInfo)
                  .sort((a, b) => b.percent - a.percent)
                  .slice(0, 6);

    const legendSeries = holdingsForLegend.map((holding) => {
        const displayName = holding.ticker === 'BRKB' ? 'BRK-B' : holding.ticker;
        return {
            key: holding.ticker,
            name: displayName,
            color: resolveTickerColor(holding.ticker),
        };
    });

    const seriesForCrosshair = [];
    activeTickerOrder.forEach((ticker) => {
        const values =
            ticker === 'Others' && usingFilteredOthers ? filteredOthers : chartData[ticker];
        if (!Array.isArray(values) || values.length !== dates.length) {
            return;
        }
        const points = dateTimes.map((time, idx) => ({
            time,
            value: values[idx],
        }));
        const label = ticker === 'BRKB' ? 'BRK-B' : ticker;
        const color = resolveTickerColor(ticker);
        seriesForCrosshair.push({
            key: ticker,
            label,
            color,
            getValueAtTime: createTimeInterpolator(points),
            formatValue: (value) =>
                valueMode === 'absolute'
                    ? formatCurrencyInlineValue(value, selectedCurrency)
                    : `${value.toFixed(2)}%`,
            formatDelta: (delta) =>
                valueMode === 'absolute'
                    ? formatCurrencyInlineValue(delta, selectedCurrency)
                    : formatPercentInline(delta),
            originalIndex: activeTickerOrder.indexOf(ticker),
        });
    });

    const sortedSeriesForCrosshair = seriesForCrosshair.sort((a, b) => {
        const indexA = activeTickerOrder.indexOf(a.key);
        const indexB = activeTickerOrder.indexOf(b.key);
        return indexA - indexB;
    });

    const totalValuePoints = dateTimes.map((time, idx) => ({
        time,
        value: Number(totalValuesConverted[idx] ?? 0),
    }));

    const layoutKey = valueMode === 'absolute' ? 'compositionAbs' : 'composition';
    if (valueMode === 'absolute') {
        chartLayouts.composition = null;
    } else {
        chartLayouts.compositionAbs = null;
    }
    chartLayouts[layoutKey] = {
        key: layoutKey,
        minTime,
        maxTime,
        valueType: valueMode === 'absolute' ? 'currency' : 'percent',
        valueMode,
        currency: selectedCurrency,
        stackMaxValue: yMax,
        padding,
        chartBounds,
        xScale,
        yScale,
        invertX: (pixelX) => {
            if (!Number.isFinite(pixelX)) {
                return minTime;
            }
            const clampedX = Math.max(padding.left, Math.min(padding.left + plotWidth, pixelX));
            if (plotWidth <= 0 || maxTime === minTime) {
                return minTime;
            }
            const ratio = (clampedX - padding.left) / plotWidth;
            return clampTime(minTime + ratio * (maxTime - minTime), minTime, maxTime);
        },
        series: sortedSeriesForCrosshair,
        percentSeriesMap,
        percentOthersSeries,
        getTotalValueAtTime: createTimeInterpolator(totalValuePoints),
    };

    drawCrosshairOverlay(ctx, chartLayouts[layoutKey]);

    updateLegend(legendSeries, chartManager);
}

function drawCompositionChart(ctx, chartManager) {
    drawCompositionChartLoader(ctx, chartManager, 'percent');
}

function drawCompositionAbsoluteChart(ctx, chartManager) {
    drawCompositionChartLoader(ctx, chartManager, 'absolute');
}

function drawCompositionChartLoader(ctx, chartManager, valueMode) {
    stopPerformanceAnimation();
    stopContributionAnimation();
    stopFxAnimation();
    const emptyState = document.getElementById('runningAmountEmpty');

    if (!compositionDataCache && compositionDataLoading) {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    if (compositionDataCache) {
        renderCompositionChartWithMode(ctx, chartManager, compositionDataCache, { valueMode });
        return;
    }

    compositionDataLoading = true;
    compositionDataLoading = true;
    loadCompositionSnapshotData()
        .then((data) => {
            if (!data) {
                throw new Error('Failed to load composition data');
            }
            compositionDataCache = data;
            renderCompositionChartWithMode(ctx, chartManager, data, { valueMode });
        })
        .catch(() => {
            if (valueMode === 'absolute') {
                chartLayouts.compositionAbs = null;
            } else {
                chartLayouts.composition = null;
            }
            updateCrosshairUI(null, null);
            if (emptyState) {
                emptyState.style.display = 'block';
            }
        })
        .finally(() => {
            compositionDataLoading = false;
        });
}

// --- Main Chart Manager ---

export function createChartManager(options = {}) {
    const crosshairCallbacks = options.crosshairCallbacks || {};
    setCrosshairExternalUpdate(crosshairCallbacks.onUpdate || null);
    updateCrosshairUI(null, null);

    let pendingFrame = null;

    const renderFrame = async (timestamp) => {
        pendingFrame = null;
        const canvas = document.getElementById('runningAmountCanvas');
        if (!canvas) {
            stopPerformanceAnimation();
            stopContributionAnimation();
            stopFxAnimation();
            updateCrosshairUI(null, null);
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            stopPerformanceAnimation();
            stopContributionAnimation();
            stopFxAnimation();
            updateCrosshairUI(null, null);
            return;
        }

        attachCrosshairEvents(canvas, chartManager);

        const dpr = window.devicePixelRatio || 1;
        const displayWidth = canvas.offsetWidth;
        const displayHeight = canvas.offsetHeight;

        if (displayWidth === 0 || displayHeight === 0) {
            stopPerformanceAnimation();
            stopContributionAnimation();
            stopFxAnimation();
            updateCrosshairUI(null, null);
            return;
        }

        const targetWidth = Math.round(displayWidth * dpr);
        const targetHeight = Math.round(displayHeight * dpr);
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, displayWidth, displayHeight);

        if (transactionState.activeChart === 'performance') {
            await drawPerformanceChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'drawdown') {
            // Percentage drawdown (benchmarks)
            await drawDrawdownChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'drawdownAbs') {
            // Absolute drawdown - use contribution chart with drawdown transformation
            await drawContributionChart(ctx, chartManager, timestamp, { drawdownMode: true });
        } else if (transactionState.activeChart === 'composition') {
            drawCompositionChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'compositionAbs') {
            drawCompositionAbsoluteChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'fx') {
            drawFxChart(ctx, chartManager, timestamp);
        } else {
            await drawContributionChart(ctx, chartManager, timestamp);
        }
    };

    const chartManager = {
        update() {
            legendState.performanceDirty = true;
            legendState.contributionDirty = true;
            this.redraw();
        },

        redraw() {
            if (pendingFrame !== null) {
                return;
            }
            pendingFrame = requestAnimationFrame(renderFrame);
        },
    };

    return chartManager;
}

export const __chartTestables = {
    buildCompositionDisplayOrder,
    aggregateCompositionSeries,
    generateConcreteTicks,
    computePercentTickInfo,
    buildFilteredBalanceSeries,
    buildDrawdownSeries,
    generateYearBasedTicks,
};
