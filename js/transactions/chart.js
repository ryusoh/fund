import {
    transactionState,
    getCompositionFilterTickers,
    getCompositionAssetClassFilter,
} from './state.js';
import {
    formatCurrencyCompact,
    formatCurrencyInlineValue,
    convertValueToCurrency,
} from './utils.js';
import { createTimeInterpolator, clampTime, formatPercentInline } from './chart/helpers.js';
import {
    stopPerformanceAnimation,
    stopContributionAnimation,
    stopFxAnimation,
} from './chart/animation.js';
import { loadCompositionSnapshotData } from './dataLoader.js';

import { COLOR_PALETTES, getHoldingAssetClass } from '../config.js';

import { drawContributionChart } from './chart/renderers/contribution.js';
import {
    getContributionSeriesForTransactions,
    buildContributionSeriesFromTransactions,
    buildFilteredBalanceSeries,
} from './chart/renderers/contribution.js';

export {
    getContributionSeriesForTransactions,
    buildContributionSeriesFromTransactions,
    buildFilteredBalanceSeries,
};

export { hasActiveTransactionFilters } from './state.js';
import { drawPerformanceChart } from './chart/renderers/performance.js';
import { drawFxChart, buildFxChartSeries } from './chart/renderers/fx.js';
import { drawDrawdownChart, buildDrawdownSeries } from './chart/renderers/drawdown.js';

export { buildFxChartSeries };
export { buildDrawdownSeries };

import {
    drawAxes,
    generateConcreteTicks,
    generateYearBasedTicks,
    computePercentTickInfo,
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

// --- Helper Functions ---

// --- Drawdown Calculation Helper ---

// Helper function to get smoothing configuration
// --- Chart Drawing Functions ---

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
