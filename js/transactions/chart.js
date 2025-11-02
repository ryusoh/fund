import {
    transactionState,
    setChartVisibility,
    setHistoricalPrices,
    setRunningAmountSeries,
} from './state.js';
import { getSplitAdjustment } from './calculations.js';
import { formatCurrencyCompact } from './utils.js';
import { smoothFinancialData } from '../utils/smoothing.js';
import { createGlowTrailAnimator } from '../plugins/glowTrailAnimator.js';
import {
    ANIMATED_LINE_SETTINGS,
    CHART_SMOOTHING,
    CHART_MARKERS,
    CONTRIBUTION_CHART_SETTINGS,
    mountainFill,
    COLOR_PALETTES,
} from '../config.js';

const chartLayouts = {
    contribution: null,
    performance: null,
    composition: null,
};

let compositionDataCache = null;
let compositionDataLoading = false;

const crosshairState = {
    active: false,
    hoverTime: null,
    dragging: false,
    rangeStart: null,
    rangeEnd: null,
    pointerId: null,
};

let crosshairElementsCache = null;
let pointerCanvas = null;
let pointerEventsAttached = false;
let crosshairExternalUpdate = null;
let containerPointerBound = false;
let crosshairChartManager = null;

const contributionSeriesCache = new WeakMap();

const crosshairDateFormatter =
    typeof Intl !== 'undefined'
        ? new Intl.DateTimeFormat('en-US', {
              year: 'numeric',
              month: 'short',
              day: '2-digit',
          })
        : null;

function getCrosshairElements() {
    if (crosshairElementsCache) {
        return crosshairElementsCache;
    }
    if (typeof document === 'undefined') {
        crosshairElementsCache = {
            info: null,
            date: null,
            values: null,
            range: null,
        };
        return crosshairElementsCache;
    }
    crosshairElementsCache = {
        info: document.getElementById('chartCrosshairInfo'),
        date: document.getElementById('chartCrosshairDate'),
        values: document.getElementById('chartCrosshairValues'),
        range: document.getElementById('chartRangeSummary'),
    };
    return crosshairElementsCache;
}

function clampTime(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return value;
    }
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
}

function createTimeInterpolator(points) {
    if (!Array.isArray(points) || points.length === 0) {
        return () => null;
    }
    const sorted = points.slice().sort((a, b) => a.time - b.time);
    return (time) => {
        if (!Number.isFinite(time)) {
            return null;
        }
        const clampedTime = clampTime(time, sorted[0].time, sorted[sorted.length - 1].time);
        let low = 0;
        let high = sorted.length - 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const midTime = sorted[mid].time;
            if (midTime === clampedTime) {
                return sorted[mid].value;
            }
            if (midTime < clampedTime) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        const leftIndex = Math.max(0, Math.min(sorted.length - 1, high));
        const rightIndex = Math.max(0, Math.min(sorted.length - 1, low));
        const leftPoint = sorted[leftIndex];
        const rightPoint = sorted[rightIndex] || leftPoint;
        if (!leftPoint || !rightPoint) {
            return null;
        }
        if (leftPoint.time === rightPoint.time) {
            return leftPoint.value;
        }
        const ratio = (clampedTime - leftPoint.time) / (rightPoint.time - leftPoint.time || 1e-12);
        return leftPoint.value + (rightPoint.value - leftPoint.value) * ratio;
    };
}

const formatCurrencyInline = (value) => {
    if (!Number.isFinite(value)) {
        return '$0';
    }
    const absolute = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (absolute >= 1_000_000) {
        return `${sign}$${(absolute / 1_000_000).toFixed(2)}M`;
    }
    if (absolute >= 1_000) {
        return `${sign}$${(absolute / 1_000).toFixed(1)}k`;
    }
    if (absolute >= 1) {
        return `${sign}$${absolute.toFixed(0)}`;
    }
    return `${sign}$${absolute.toFixed(2)}`;
};

const formatPercentInline = (value) => {
    if (!Number.isFinite(value)) {
        return '0%';
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
};

function formatCrosshairDateLabel(time) {
    if (!Number.isFinite(time)) {
        return '';
    }
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    if (crosshairDateFormatter) {
        return crosshairDateFormatter.format(date);
    }
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function getActiveChartKey() {
    const active = transactionState.activeChart || 'contribution';
    if (active === 'performance' || active === 'composition' || active === 'contribution') {
        return active;
    }
    return 'contribution';
}

function getActiveLayout() {
    const key = getActiveChartKey();
    return chartLayouts[key];
}

function buildRangeSummary(layout, rawStart, rawEnd) {
    if (!layout || !Array.isArray(layout.series) || layout.series.length === 0) {
        return null;
    }
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawStart === rawEnd) {
        return null;
    }

    const start = clampTime(Math.min(rawStart, rawEnd), layout.minTime, layout.maxTime);
    const end = clampTime(Math.max(rawStart, rawEnd), layout.minTime, layout.maxTime);
    if (start === end) {
        return null;
    }

    const entries = [];

    layout.series.forEach((series) => {
        if (series && series.includeInRangeSummary === false) {
            return;
        }
        if (typeof series.getValueAtTime !== 'function') {
            return;
        }
        const startValue = series.getValueAtTime(start);
        const endValue = series.getValueAtTime(end);
        if (
            startValue === null ||
            startValue === undefined ||
            endValue === null ||
            endValue === undefined
        ) {
            return;
        }
        const delta = endValue - startValue;
        let percent = null;
        if (layout.valueType === 'percent') {
            const startFactor = 1 + startValue / 100;
            const endFactor = 1 + endValue / 100;
            if (
                Number.isFinite(startFactor) &&
                Number.isFinite(endFactor) &&
                Math.abs(startFactor) > 1e-9
            ) {
                percent = (endFactor / startFactor - 1) * 100;
            }
        } else if (Number.isFinite(startValue) && Math.abs(startValue) > 1e-9) {
            percent = (delta / Math.abs(startValue)) * 100;
        }
        const formattedDelta = series.formatDelta
            ? series.formatDelta(delta, percent)
            : layout.valueType === 'percent'
              ? formatPercentInline(delta)
              : formatCurrencyInline(delta);
        if (formattedDelta === null || formattedDelta === undefined) {
            return;
        }
        let formattedPercent =
            percent !== null && Number.isFinite(percent) ? formatPercentInline(percent) : null;
        if (layout.valueType === 'percent') {
            formattedPercent = null;
        }

        entries.push({
            key: series.key,
            label: series.label || series.key,
            color: series.color || '#ffffff',
            delta,
            percent,
            deltaFormatted: formattedDelta,
            percentFormatted: formattedPercent,
        });
    });

    if (entries.length === 0) {
        return null;
    }

    const durationMs = end - start;
    const durationDays = durationMs / (1000 * 60 * 60 * 24);

    return {
        start,
        end,
        durationMs,
        durationDays,
        entries,
    };
}

function updateCrosshairUI(snapshot, rangeSummary) {
    const elements = getCrosshairElements();
    const { info, range } = elements;

    if (info) {
        info.hidden = true;
    }
    if (range) {
        range.hidden = true;
    }

    if (typeof crosshairExternalUpdate === 'function') {
        crosshairExternalUpdate(snapshot, rangeSummary);
    }
}

function drawCrosshairOverlay(ctx, layout) {
    if (!layout) {
        updateCrosshairUI(null, null);
        return;
    }

    const hasHover = crosshairState.active && Number.isFinite(crosshairState.hoverTime);
    const hasRange =
        Number.isFinite(crosshairState.rangeStart) && Number.isFinite(crosshairState.rangeEnd);

    if (!hasHover && !hasRange) {
        updateCrosshairUI(null, null);
        return;
    }

    const referenceTime = hasHover
        ? crosshairState.hoverTime
        : hasRange
          ? (crosshairState.rangeEnd ?? crosshairState.rangeStart)
          : null;

    if (!Number.isFinite(referenceTime)) {
        updateCrosshairUI(null, null);
        return;
    }

    const time = clampTime(referenceTime, layout.minTime, layout.maxTime);
    const x = layout.xScale(time);
    if (!Number.isFinite(x) || x < layout.chartBounds.left || x > layout.chartBounds.right) {
        updateCrosshairUI(null, null);
        return;
    }

    if (hasRange) {
        const startTime = clampTime(
            Math.min(crosshairState.rangeStart, crosshairState.rangeEnd),
            layout.minTime,
            layout.maxTime
        );
        const endTime = clampTime(
            Math.max(crosshairState.rangeStart, crosshairState.rangeEnd),
            layout.minTime,
            layout.maxTime
        );
        const startX = layout.xScale(startTime);
        const endX = layout.xScale(endTime);
        ctx.save();
        ctx.fillStyle = 'rgba(120, 145, 255, 0.12)';
        ctx.fillRect(
            Math.min(startX, endX),
            layout.chartBounds.top,
            Math.abs(endX - startX),
            layout.chartBounds.bottom - layout.chartBounds.top
        );
        ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, layout.chartBounds.top);
    ctx.lineTo(x, layout.chartBounds.bottom);
    ctx.stroke();
    ctx.restore();

    const seriesSnapshot = [];

    // Special handling for composition chart to show top 7 holdings at the crosshair time
    if (layout.key === 'composition') {
        // Get values at the current time for all series
        const valuesAtTime = [];
        layout.series.forEach((series) => {
            if (typeof series.getValueAtTime !== 'function') {
                return;
            }
            const value = series.getValueAtTime(time);
            // For composition chart, include all non-null values, even if very small
            // This ensures holdings like FNSFX at 100% on Jan 01, 2021 are shown
            if (value === null || value === undefined) {
                return;
            }

            valuesAtTime.push({
                key: series.key,
                label: series.label || series.key,
                color: series.color || '#ffffff',
                value,
                formatted: series.formatValue
                    ? series.formatValue(value)
                    : layout.valueType === 'percent'
                      ? formatPercentInline(value)
                      : formatCurrencyInline(value),
            });
        });

        // Filter out holdings that had 0% allocation at this time (were not held)
        // Only keep holdings that had actual positive allocation
        const nonZeroHoldings = valuesAtTime.filter((item) => item.value > 0.01); // Using small threshold to account for floating point precision

        // Sort by value (percentage) in descending order and take up to 7 (or fewer if less available)
        const topHoldings = nonZeroHoldings.sort((a, b) => b.value - a.value).slice(0, 7);

        // Add to seriesSnapshot - show only available holdings (may be fewer than 7)
        // For composition chart, we need to calculate the correct Y position based on the original rendering order.
        // Get all values at the crosshair time to calculate cumulative positions.
        const valuesAtTimeMap = new Map();
        for (const series of layout.series) {
            const value = series.getValueAtTime(time);
            if (value !== null && value !== undefined) {
                valuesAtTimeMap.set(series.key, { value, series });
            }
        }

        // In a stacked area chart:
        // 1. Components are rendered in a specific order (bottom to top).
        // 2. Each component's visual position depends on the cumulative sum of all components BELOW it.
        // 3. The crosshair dot for a component should appear at the TOP of that component's area.
        // 4. The dot color should match the component's color in the chart.
        const topHoldingsKeys = new Set(topHoldings.map((h) => h.key));
        let cumulativeValue = 0;

        for (const series of layout.series) {
            const seriesData = valuesAtTimeMap.get(series.key);
            if (!seriesData) {
                continue;
            }

            const { value: componentValue } = seriesData;

            if (topHoldingsKeys.has(series.key)) {
                const dotPositionValue = cumulativeValue + componentValue;
                const y = layout.yScale(dotPositionValue);

                if (Number.isFinite(y) && series.drawMarker !== false) {
                    ctx.save();
                    ctx.fillStyle = series.color || '#ffffff';
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
            }

            cumulativeValue += componentValue;
        }

        // Add this item to the crosshair display (sorted by value at crosshair time)
        seriesSnapshot.push(...topHoldings);
    } else {
        // Original behavior for other charts
        layout.series.forEach((series) => {
            if (typeof series.getValueAtTime !== 'function') {
                return;
            }
            const value = series.getValueAtTime(time);
            if (value === null || value === undefined) {
                return;
            }
            const y = layout.yScale(value);
            if (Number.isFinite(y) && series.drawMarker !== false) {
                ctx.save();
                ctx.fillStyle = series.color || '#ffffff';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
            const formatted = series.formatValue
                ? series.formatValue(value)
                : layout.valueType === 'percent'
                  ? formatPercentInline(value)
                  : formatCurrencyInline(value);
            seriesSnapshot.push({
                key: series.key,
                label: series.label || series.key,
                color: series.color || '#ffffff',
                value,
                formatted,
            });
        });

        if (layout.key === 'contribution' && seriesSnapshot.length > 1) {
            const priorityMap = new Map([
                ['buyVolume', 0],
                ['sellVolume', 1],
                ['contribution', 2],
                ['balance', 3],
            ]);
            seriesSnapshot.sort((a, b) => {
                const priorityA = priorityMap.has(a.key) ? priorityMap.get(a.key) : 99;
                const priorityB = priorityMap.has(b.key) ? priorityMap.get(b.key) : 99;
                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }
                return (a.label || '').localeCompare(b.label || '');
            });
        }
    }

    const snapshot =
        seriesSnapshot.length > 0
            ? {
                  time,
                  label: formatCrosshairDateLabel(time),
                  series: seriesSnapshot,
              }
            : null;

    let rangeSummary = null;
    // Skip range summary for composition chart
    if (
        hasRange &&
        crosshairState.rangeStart !== crosshairState.rangeEnd &&
        layout.key !== 'composition'
    ) {
        rangeSummary = buildRangeSummary(
            layout,
            crosshairState.rangeStart,
            crosshairState.rangeEnd
        );
    }

    updateCrosshairUI(snapshot, rangeSummary);
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

    // Skip range functionality for composition chart
    if (layout.key === 'composition') {
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

    // Skip range functionality for composition chart
    if (layout.key === 'composition') {
        crosshairState.pointerId = event.pointerId;
        crosshairState.active = true;
        crosshairState.hoverTime = time;
        crosshairState.rangeStart = null;
        crosshairState.rangeEnd = null;
        requestChartRedraw();
        return;
    }

    crosshairState.pointerId = event.pointerId;
    crosshairState.active = true;
    crosshairState.dragging = true;
    crosshairState.hoverTime = time;
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
        const time = layout.invertX ? layout.invertX(x) : null;
        if (Number.isFinite(time)) {
            crosshairState.hoverTime = time;
        }
    }

    // Skip range functionality for composition chart
    if (layout && layout.key === 'composition') {
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

function getContributionSeriesForTransactions(transactions, includeSyntheticStart = false) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }
    const splitHistoryRef = transactionState.splitHistory;
    const cached = contributionSeriesCache.get(transactions);
    if (
        cached &&
        cached.splitHistory === splitHistoryRef &&
        cached.includeSyntheticStart === includeSyntheticStart
    ) {
        return cached.series;
    }
    const series = buildContributionSeriesFromTransactions(transactions, {
        includeSyntheticStart,
    });
    contributionSeriesCache.set(transactions, {
        splitHistory: splitHistoryRef,
        includeSyntheticStart,
        series,
    });
    return series;
}

export function buildContributionSeriesFromTransactions(
    transactions,
    { includeSyntheticStart = false } = {}
) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }

    const sortedTransactions = [...transactions].sort(
        (a, b) =>
            new Date(a.tradeDate) - new Date(b.tradeDate) ||
            (a.transactionId ?? 0) - (b.transactionId ?? 0)
    );

    const series = [];
    let cumulativeAmount = 0;

    sortedTransactions.forEach((t, index) => {
        const netDelta = Number.parseFloat(t.netAmount) || 0;

        if (index > 0) {
            const prevTransaction = sortedTransactions[index - 1];
            const prevDate = new Date(prevTransaction.tradeDate);
            const currentDate = new Date(t.tradeDate);

            if (prevDate.toISOString().split('T')[0] !== currentDate.toISOString().split('T')[0]) {
                const intermediateDate = new Date(currentDate);
                intermediateDate.setDate(intermediateDate.getDate() - 1);

                series.push({
                    tradeDate: intermediateDate.toISOString().split('T')[0],
                    amount: cumulativeAmount,
                    orderType: 'padding',
                    netAmount: 0,
                });
            }
        }

        cumulativeAmount += netDelta;

        series.push({
            tradeDate: t.tradeDate,
            amount: cumulativeAmount,
            orderType: t.orderType,
            netAmount: netDelta,
        });
    });

    const lastPoint = series[series.length - 1];
    if (lastPoint) {
        const today = new Date();
        const lastTransactionDate = new Date(lastPoint.tradeDate);

        if (today > lastTransactionDate) {
            series.push({
                tradeDate: today.toISOString().split('T')[0],
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

    return series;
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
            });
        }

        const todaysTransactions = transactionsByDate.get(dateStr) || [];
        todaysTransactions.forEach((txn) => {
            const normalizedSymbol = normalizeSymbolForPricing(txn.security);
            const quantity = parseFloat(txn.quantity) || 0;
            if (!Number.isFinite(quantity) || quantity === 0) {
                return;
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
            const price = getPriceFromHistoricalData(historicalPrices, symbol, dateStr);
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

function injectSyntheticStartPoint(filteredData, fullSeries) {
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

    const prevValue = Number(previousPoint.value);
    const epsilon = 1e-6;
    if (!Number.isFinite(prevValue) || Math.abs(prevValue) > epsilon) {
        return filteredData;
    }

    if (
        filteredData[0].date instanceof Date &&
        filteredData[0].date.getTime() === prevDate.getTime()
    ) {
        return filteredData;
    }

    const syntheticPoint = {
        date: prevDate,
        value: Number.isFinite(prevValue) ? prevValue : 0,
        synthetic: true,
    };

    return [syntheticPoint, ...filteredData];
}

const COLOR_PARSER_CONTEXT = (() => {
    if (typeof document === 'undefined') {
        return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.getContext('2d');
})();

function clamp01(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

function componentFromChannel(channel) {
    const trimmed = channel.trim();
    if (trimmed.endsWith('%')) {
        const percentage = parseFloat(trimmed.slice(0, -1));
        if (!Number.isFinite(percentage)) {
            return 0;
        }
        return Math.round((percentage / 100) * 255);
    }
    const numeric = parseFloat(trimmed);
    return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function colorWithAlpha(baseColor, alpha) {
    const normalizedAlpha = clamp01(alpha);
    if (normalizedAlpha <= 0) {
        return 'rgba(0, 0, 0, 0)';
    }

    if (typeof baseColor !== 'string' || baseColor.length === 0) {
        return baseColor;
    }

    const hexMatch = baseColor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((char) => char + char)
                .join('');
        }
        const intVal = parseInt(hex, 16);
        const r = (intVal >> 16) & 255;
        const g = (intVal >> 8) & 255;
        const b = intVal & 255;
        return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
    }

    const rgbMatch = baseColor.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(',');
        if (parts.length >= 3) {
            const r = componentFromChannel(parts[0]);
            const g = componentFromChannel(parts[1]);
            const b = componentFromChannel(parts[2]);
            return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
        }
    }

    if (COLOR_PARSER_CONTEXT) {
        const ctx = COLOR_PARSER_CONTEXT;
        ctx.save();
        ctx.fillStyle = baseColor;
        const computed = ctx.fillStyle;
        ctx.restore();
        if (computed && computed !== baseColor) {
            return colorWithAlpha(computed, normalizedAlpha);
        }
    }

    return baseColor;
}

function drawMountainFill(ctx, coords, baselineY, options) {
    if (!Array.isArray(coords) || coords.length === 0) {
        return;
    }

    const { color, colorStops, opacityTop = 0.35, opacityBottom = 0, bounds } = options || {};

    if (!bounds) {
        return;
    }

    if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
        return;
    }

    if (typeof document === 'undefined') {
        return;
    }

    let clampedBaselineY = baselineY;
    if (!Number.isFinite(clampedBaselineY)) {
        return;
    }
    clampedBaselineY = Math.min(Math.max(clampedBaselineY, bounds.top), bounds.bottom);

    const areaCoords = (coords.length === 1 ? [coords[0], coords[0]] : coords).map((coord) => ({
        x: coord.x,
        y: coord.y,
    }));

    const width = Math.max(1, Math.ceil(bounds.right - bounds.left));
    const height = Math.max(1, Math.ceil(bounds.bottom - bounds.top));

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) {
        return;
    }

    offCtx.beginPath();
    offCtx.moveTo(areaCoords[0].x - bounds.left, areaCoords[0].y - bounds.top);
    for (let i = 1; i < areaCoords.length; i += 1) {
        offCtx.lineTo(areaCoords[i].x - bounds.left, areaCoords[i].y - bounds.top);
    }
    offCtx.lineTo(areaCoords[areaCoords.length - 1].x - bounds.left, clampedBaselineY - bounds.top);
    offCtx.lineTo(areaCoords[0].x - bounds.left, clampedBaselineY - bounds.top);
    offCtx.closePath();

    let horizontalGradient = null;
    if (Array.isArray(colorStops) && colorStops.length > 0) {
        horizontalGradient = offCtx.createLinearGradient(0, 0, width, 0);
        const stopCount = colorStops.length;
        colorStops.forEach((stopColor, index) => {
            const offset = stopCount === 1 ? 0 : index / (stopCount - 1);
            horizontalGradient.addColorStop(offset, colorWithAlpha(stopColor, 1));
        });
    }

    if (horizontalGradient) {
        offCtx.fillStyle = horizontalGradient;
    } else {
        offCtx.fillStyle = colorWithAlpha(color, 1);
    }
    offCtx.fill();

    const relativeYs = areaCoords.map((c) => c.y - bounds.top);
    relativeYs.push(clampedBaselineY - bounds.top);
    const minYRel = Math.min(...relativeYs);
    const maxYRel = Math.max(...relativeYs);
    const gradientTop = Math.min(minYRel, maxYRel - 0.0001);
    const gradientBottom = Math.max(maxYRel, gradientTop + 0.0001);

    offCtx.globalCompositeOperation = 'destination-in';
    const alphaGradient = offCtx.createLinearGradient(0, gradientTop, 0, gradientBottom);
    alphaGradient.addColorStop(0, `rgba(0, 0, 0, ${clamp01(opacityTop)})`);
    alphaGradient.addColorStop(1, `rgba(0, 0, 0, ${clamp01(opacityBottom)})`);
    offCtx.fillStyle = alphaGradient;
    offCtx.fillRect(0, 0, width, height);
    offCtx.globalCompositeOperation = 'source-over';

    ctx.drawImage(offscreen, bounds.left, bounds.top);
}

const BENCHMARK_GRADIENTS = {
    '^LZ': ['#fb8500', '#ffef2f'],
    '^GSPC': ['#0d3b66', '#64b5f6'],
    '^IXIC': ['#0f4c81', '#74c0fc'],
    '^DJI': ['#123c69', '#6aaefc'],
    '^SSEC': ['#0e487a', '#5da9f6'],
    '^HSI': ['#0d4977', '#7ab8ff'],
    '^N225': ['#0b3d63', '#89c2ff'],
};

// Gradient definitions for balance chart lines
const BALANCE_GRADIENTS = {
    balance: ['#fb8500', '#ffef2f'], // Yellow gradient for balance line (same as portfolio)
    contribution: ['#0d3b66', '#64b5f6'], // Blue gradient for contribution line (same as S&P 500)
};

// Helper function to get smoothing configuration
function getSmoothingConfig(chartType) {
    if (!CHART_SMOOTHING.enabled) {
        return null; // Smoothing disabled
    }

    const methodName = CHART_SMOOTHING.charts[chartType] || 'balanced';
    return CHART_SMOOTHING.methods[methodName] || CHART_SMOOTHING.methods.balanced;
}

const glowAnimator = createGlowTrailAnimator(ANIMATED_LINE_SETTINGS);

const isAnimationEnabled = (chartKey) => glowAnimator.isEnabledFor(chartKey);

let performanceLegendDirty = true;
let contributionLegendDirty = true;

function stopPerformanceAnimation() {
    glowAnimator.stop('performance');
}

function stopContributionAnimation() {
    glowAnimator.stop('contribution');
}

function schedulePerformanceAnimation(chartManager) {
    if (!isAnimationEnabled('performance')) {
        glowAnimator.stop('performance');
        return;
    }
    glowAnimator.schedule('performance', chartManager, {
        isActive: () => transactionState.activeChart === 'performance',
    });
}

function scheduleContributionAnimation(chartManager) {
    if (!isAnimationEnabled('contribution')) {
        glowAnimator.stop('contribution');
        return;
    }
    glowAnimator.schedule('contribution', chartManager, {
        isActive: () => transactionState.activeChart === 'contribution',
    });
}

function advancePerformanceAnimation(timestamp) {
    if (!isAnimationEnabled('performance')) {
        return 0;
    }
    return glowAnimator.advance('performance', timestamp);
}

function advanceContributionAnimation(timestamp) {
    if (!isAnimationEnabled('contribution')) {
        return 0;
    }
    return glowAnimator.advance('contribution', timestamp);
}

function getChartColors(rootStyles) {
    return {
        portfolio: rootStyles.getPropertyValue('--portfolio-line').trim() || '#7a7a7a',
        contribution: rootStyles.getPropertyValue('--contribution-line').trim() || '#b3b3b3',
        sp500: rootStyles.getPropertyValue('--sp500-line').trim() || '#ef553b',
        nasdaq: rootStyles.getPropertyValue('--nasdaq-line').trim() || '#00d5ff',
        dji: rootStyles.getPropertyValue('--dji-line').trim() || '#ab63fa',
        ssec: rootStyles.getPropertyValue('--sse-line').trim() || '#ffa15a',
        hsi: rootStyles.getPropertyValue('--hsi-line').trim() || '#19d3f3',
        nikkei: rootStyles.getPropertyValue('--n225-line').trim() || '#ff6692',
        buy: 'rgba(48, 209, 88, 0.8)',
        sell: 'rgba(255, 69, 58, 0.8)',
        buyFill: 'rgba(48, 209, 88, 0.45)',
        sellFill: 'rgba(255, 69, 58, 0.45)',
    };
}

function updateLegend(series, chartManager) {
    const legendContainer = document.querySelector('.chart-legend');
    if (!legendContainer) {
        return;
    }

    legendContainer.innerHTML = ''; // Clear existing legend

    series.forEach((s) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.dataset.series = s.key;

        const swatch = document.createElement('span');
        swatch.className = 'legend-swatch';
        swatch.style.background = 'none';
        swatch.style.backgroundColor = s.color;
        swatch.style.border = '';

        const label = document.createElement('span');
        label.textContent = s.name;

        item.appendChild(swatch);
        item.appendChild(label);

        // Skip click events for composition chart (non-interactive legend)
        if (transactionState.activeChart !== 'composition') {
            item.addEventListener('click', () => {
                if (transactionState.activeChart === 'performance') {
                    // Special handling for performance chart
                    if (s.key === '^LZ') {
                        return; // Portfolio line ('^LZ') is not toggleable
                    }

                    const benchmarks = ['^GSPC', '^IXIC', '^DJI', '^SSEC', '^HSI', '^N225'];
                    if (benchmarks.includes(s.key)) {
                        const isDisabled = item.classList.toggle('legend-disabled');
                        const isVisible = !isDisabled;

                        // Hide other benchmarks for a "radio button" style interaction
                        benchmarks.forEach((benchmark) => {
                            if (benchmark !== s.key) {
                                transactionState.chartVisibility[benchmark] = false;
                                const otherItem = legendContainer.querySelector(
                                    `[data-series="${benchmark}"]`
                                );
                                if (otherItem) {
                                    otherItem.classList.add('legend-disabled');
                                }
                            }
                        });

                        transactionState.chartVisibility[s.key] = isVisible;
                        performanceLegendDirty = true; // Mark legend as needing update
                    }
                } else {
                    // Normal behavior for other charts (like Contribution)
                    const isDisabled = item.classList.toggle('legend-disabled');
                    setChartVisibility(s.key, !isDisabled);
                    contributionLegendDirty = true; // Set flag to redraw legend
                }

                // Redraw the chart to apply visibility changes
                if (typeof chartManager.redraw === 'function') {
                    chartManager.redraw();
                }
            });
        } // End of conditional for non-composition charts

        if (transactionState.chartVisibility[s.key] === false) {
            item.classList.add('legend-disabled');
        }

        legendContainer.appendChild(item);
    });
}

function drawMarker(context, x, y, radius, isBuy, colors, chartBounds) {
    // Clamp Y position to stay within chart bounds
    const clampedY = Math.max(chartBounds.top + radius, Math.min(y, chartBounds.bottom - radius));

    context.beginPath();
    context.arc(x, clampedY, radius, 0, Math.PI * 2);
    context.fillStyle = isBuy ? colors.buyFill : colors.sellFill;
    context.strokeStyle = isBuy ? colors.buy : colors.sell;
    context.lineWidth = 1;
    context.fill();
    context.stroke();
}

function drawEndValue(
    context,
    x,
    y,
    value,
    color,
    isMobile,
    padding,
    plotWidth,
    plotHeight,
    formatValue,
    showBackground = false
) {
    const text = formatValue(value);
    const fontSize = isMobile ? 9 : 11;
    const fontFamily = 'var(--font-family-mono)';

    context.font = `${fontSize}px ${fontFamily}`;
    context.textAlign = 'left';
    context.textBaseline = 'middle';

    // Measure text width
    const textMetrics = context.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize;
    const bgPadding = 4;

    // Calculate position with boundary checks
    let textX, textY;

    if (isMobile) {
        // Mobile: always use right-side positioning with boundary check
        textX = padding.left + plotWidth - textWidth - 5;
        textY = Math.max(
            padding.top + textHeight / 2,
            Math.min(y, padding.top + plotHeight - textHeight / 2)
        );
    } else {
        // Desktop: try above/below endpoint first
        const spaceAbove = y - padding.top;
        const spaceBelow = padding.top + plotHeight - y;

        if (spaceAbove > textHeight + 8) {
            // Position above
            textX = x + 3;
            textY = y - 3;

            // Check if text would overflow right edge
            if (textX + textWidth > padding.left + plotWidth - 5) {
                textX = padding.left + plotWidth - textWidth - 5;
            }
        } else if (spaceBelow > textHeight + 8) {
            // Position below
            textX = x + 3;
            textY = y + textHeight + 3;

            // Check if text would overflow right edge
            if (textX + textWidth > padding.left + plotWidth - 5) {
                textX = padding.left + plotWidth - textWidth - 5;
            }
        } else {
            // Fall back to right-side positioning
            textX = padding.left + plotWidth - textWidth - 5;
            textY = Math.max(
                padding.top + textHeight / 2,
                Math.min(y, padding.top + plotHeight - textHeight / 2)
            );
        }
    }

    // Ensure text stays within chart boundaries
    textX = Math.max(padding.left + 2, Math.min(textX, padding.left + plotWidth - textWidth - 2));
    textY = Math.max(
        padding.top + textHeight / 2,
        Math.min(textY, padding.top + plotHeight - textHeight / 2)
    );

    // Draw background for contribution chart only
    if (showBackground) {
        // Create subtle dark background with rounded corners effect
        context.fillStyle = 'rgba(0, 0, 0, 0.4)';
        context.beginPath();
        context.roundRect(
            textX - bgPadding,
            textY - textHeight / 2 - bgPadding,
            textWidth + bgPadding * 2,
            textHeight + bgPadding * 2,
            3
        );
        context.fill();
    }

    // Draw text with series color
    context.fillStyle = color;
    context.fillText(text, textX, textY);

    return textY;
}

function drawStartValue(
    context,
    x,
    y,
    value,
    color,
    isMobile,
    padding,
    plotWidth,
    plotHeight,
    formatValue,
    showBackground = false
) {
    const text = formatValue(value);
    const fontSize = isMobile ? 9 : 11;
    const fontFamily = 'var(--font-family-mono)';

    context.font = `${fontSize}px ${fontFamily}`;
    context.textAlign = 'left';
    context.textBaseline = 'middle';

    const textMetrics = context.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize;
    const bgPadding = 4;

    // Anchor near the left plot boundary while respecting vertical limits
    const baseX = padding.left + (isMobile ? 4 : 6);
    const textX = Math.min(baseX, padding.left + plotWidth - textWidth - 2);
    const textY = Math.max(
        padding.top + textHeight / 2,
        Math.min(y, padding.top + plotHeight - textHeight / 2)
    );

    if (showBackground) {
        context.fillStyle = 'rgba(0, 0, 0, 0.4)';
        context.beginPath();
        context.roundRect(
            textX - bgPadding,
            textY - textHeight / 2 - bgPadding,
            textWidth + bgPadding * 2,
            textHeight + bgPadding * 2,
            3
        );
        context.fill();
    }

    context.fillStyle = color;
    context.fillText(text, textX, textY);

    return textY;
}

function generateConcreteTicks(yMin, yMax, isPerformanceChart) {
    if (isPerformanceChart) {
        // Performance chart: use percentage ticks with adaptive spacing
        const ticks = [];
        const range = yMax - yMin;

        // Determine appropriate tick spacing based on data range
        let tickSpacing, startTick, endTick;

        if (range <= 20) {
            // Very small range: 5% increments
            tickSpacing = 5;
            startTick = Math.floor(yMin / 5) * 5;
            endTick = Math.ceil(yMax / 5) * 5;
        } else if (range <= 50) {
            // Small range: 10% increments
            tickSpacing = 10;
            startTick = Math.floor(yMin / 10) * 10;
            endTick = Math.ceil(yMax / 10) * 10;
        } else if (range <= 100) {
            // Medium range: 20% increments
            tickSpacing = 20;
            startTick = Math.floor(yMin / 20) * 20;
            endTick = Math.ceil(yMax / 20) * 20;
        } else {
            // Large range: 50% increments
            tickSpacing = 50;
            startTick = Math.floor(yMin / 50) * 50;
            endTick = Math.ceil(yMax / 50) * 50;
        }

        // Generate ticks
        for (let i = startTick; i <= endTick; i += tickSpacing) {
            ticks.push(i);
        }

        return ticks.filter((tick) => tick >= yMin && tick <= yMax);
    }
    // Contribution chart: use currency ticks with adaptive spacing
    const ticks = [];

    // Determine appropriate tick spacing based on data range
    const range = yMax - yMin;
    let tickSpacing, startTick, endTick;

    if (range <= 50000) {
        // Very small range: 10k increments
        tickSpacing = 10000;
        startTick = Math.max(0, Math.floor(yMin / 10000) * 10000);
        endTick = Math.ceil(yMax / 10000) * 10000;
    } else if (range <= 200000) {
        // Small range: 25k increments
        tickSpacing = 25000;
        startTick = Math.max(0, Math.floor(yMin / 25000) * 25000);
        endTick = Math.ceil(yMax / 25000) * 25000;
    } else if (range <= 500000) {
        // Medium-small range: 50k increments
        tickSpacing = 50000;
        startTick = Math.max(0, Math.floor(yMin / 50000) * 50000);
        endTick = Math.ceil(yMax / 50000) * 50000;
    } else if (range <= 2000000) {
        // Medium range: 250k increments
        tickSpacing = 250000;
        startTick = Math.max(0, Math.floor(yMin / 250000) * 250000);
        endTick = Math.ceil(yMax / 250000) * 250000;
    } else {
        // Large range: 500k increments
        tickSpacing = 500000;
        startTick = Math.max(0, Math.floor(yMin / 500000) * 500000);
        endTick = Math.ceil(yMax / 500000) * 500000;
    }

    // Generate ticks
    for (let i = startTick; i <= endTick; i += tickSpacing) {
        ticks.push(i);
    }

    return ticks.filter((tick) => tick >= yMin && tick <= yMax);
}

function generateYearBasedTicks(minTime, maxTime) {
    const ticks = [];
    const startDate = new Date(minTime);
    const endDate = new Date(maxTime);
    const isMobile = window.innerWidth <= 768;

    const formatYear = (year) => {
        return isMobile ? `'${String(year).slice(2)}` : year;
    };

    // Calculate data span in months
    const dataSpanMonths =
        (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1;

    // Check if data is within a single year (same year OR spans ≤15 months)
    const isSingleYear = startDate.getFullYear() === endDate.getFullYear() || dataSpanMonths <= 15;

    if (isSingleYear) {
        // Single year: show quarterly ticks for the year
        let year;
        if (startDate.getFullYear() !== endDate.getFullYear()) {
            const endOfStartYear = new Date(startDate.getFullYear(), 11, 31);
            const startOfEndYear = new Date(endDate.getFullYear(), 0, 1);
            const timeInStartYear = endOfStartYear.getTime() - startDate.getTime();
            const timeInEndYear = endDate.getTime() - startOfEndYear.getTime();
            if (timeInEndYear > timeInStartYear) {
                year = endDate.getFullYear();
            } else {
                year = startDate.getFullYear();
            }
        } else {
            year = startDate.getFullYear();
        }
        const formattedYear = formatYear(year);
        const quarters = [
            { month: 0, label: `Jan ${formattedYear}`, isYearStart: true },
            { month: 3, label: `Apr ${formattedYear}`, isYearStart: false },
            { month: 6, label: `Jul ${formattedYear}`, isYearStart: false },
            { month: 9, label: `Oct ${formattedYear}`, isYearStart: false },
        ];

        quarters.forEach((q) => {
            const quarterDate = new Date(year, q.month, 1).getTime();
            // Always include quarterly ticks for the year, even if slightly outside the range
            if (
                quarterDate >= minTime - 30 * 24 * 60 * 60 * 1000 &&
                quarterDate <= maxTime + 30 * 24 * 60 * 60 * 1000
            ) {
                ticks.push({
                    time: quarterDate,
                    label: q.label,
                    isYearStart: q.isYearStart,
                });
            }
        });
    } else {
        // Multi-year: show Jan for each year
        for (let year = startDate.getFullYear(); year <= endDate.getFullYear(); year++) {
            const jan1 = new Date(year, 0, 1).getTime();
            if (jan1 >= minTime && jan1 <= maxTime) {
                ticks.push({
                    time: jan1,
                    label: `Jan ${formatYear(year)}`,
                    isYearStart: true,
                });
            }
        }
    }

    // Add end date
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
    const endYear = endDate.getFullYear();
    ticks.push({
        time: maxTime,
        label: `${endMonth} ${formatYear(endYear)}`,
        isYearStart: false,
    });

    // Add beginning month tick for desktop only
    if (!isMobile) {
        const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
        const startYear = startDate.getFullYear();
        const startLabel = `${startMonth} ${formatYear(startYear)}`;

        // Check if we already have a tick for the start date
        const hasStartTick = ticks.some((tick) => tick.time === minTime);
        if (!hasStartTick) {
            ticks.push({
                time: minTime,
                label: startLabel,
                isYearStart: false,
            });
        }
    }

    // Sort ticks by time
    ticks.sort((a, b) => a.time - b.time);

    // Remove duplicate ticks that are too close together (within 10 days)
    const filteredTicks = [];
    for (let i = 0; i < ticks.length; i++) {
        const currentTick = ticks[i];
        const isTooClose = filteredTicks.some(
            (existingTick) =>
                Math.abs(currentTick.time - existingTick.time) < 10 * 24 * 60 * 60 * 1000 // 10 days in milliseconds
        );

        if (!isTooClose) {
            filteredTicks.push(currentTick);
        } else {
            // If too close, prefer year boundaries (isYearStart: true) over start/end dates
            const isYearBoundary = currentTick.isYearStart;
            const existingIsYearBoundary = filteredTicks.some(
                (existingTick) =>
                    Math.abs(currentTick.time - existingTick.time) < 10 * 24 * 60 * 60 * 1000 &&
                    existingTick.isYearStart
            );

            if (isYearBoundary && !existingIsYearBoundary) {
                // Replace the existing tick with the year boundary
                const index = filteredTicks.findIndex(
                    (existingTick) =>
                        Math.abs(currentTick.time - existingTick.time) < 10 * 24 * 60 * 60 * 1000
                );
                if (index !== -1) {
                    filteredTicks[index] = currentTick;
                }
            }
        }
    }

    return filteredTicks;
}

function drawAxes(
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
    isPerformanceChart = false,
    axisOptions = {}
) {
    const isMobile = window.innerWidth <= 768;
    const { drawXAxis = true, drawYAxis = true } = axisOptions;

    // Generate concrete tick values
    const ticks = generateConcreteTicks(yMin, yMax, isPerformanceChart);

    // Y-axis grid lines and labels
    if (drawYAxis) {
        ticks.forEach((value) => {
            const y = yScale(value);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + plotWidth, y);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.stroke();
            ctx.fillStyle = '#8b949e';
            ctx.font = isMobile ? '10px var(--font-family-mono)' : '12px var(--font-family-mono)';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(yLabelFormatter(value), padding.left - (isMobile ? 8 : 10), y);
        });
    }

    // X-axis line
    if (drawXAxis) {
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + plotHeight);
        ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // Generate year-based x-axis ticks
    const yearTicks = generateYearBasedTicks(minTime, maxTime);

    if (drawXAxis) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = isMobile ? '10px var(--font-family-mono)' : '12px var(--font-family-mono)';
    }

    yearTicks.forEach((tick, index) => {
        const x = xScale(tick.time);

        if (drawXAxis) {
            // Prevent label collision on mobile by hiding the last tick if it's too close to the previous one
            if (isMobile && index === yearTicks.length - 1 && index > 0) {
                const prevTickX = xScale(yearTicks[index - 1].time);
                if (x - prevTickX < 40) {
                    return; // Skip the last tick
                }
            }

            // Set text alignment based on tick position and layout
            if (isMobile) {
                // Mobile: center-align first tick, right-align last tick, center-align others
                if (index === 0) {
                    ctx.textAlign = 'center';
                } else if (index === yearTicks.length - 1) {
                    ctx.textAlign = 'right';
                } else {
                    ctx.textAlign = 'center';
                }
            } else {
                // Desktop: center-align all ticks
                ctx.textAlign = 'center';
            }

            // Draw tick mark
            ctx.beginPath();
            ctx.moveTo(x, padding.top + plotHeight);
            ctx.lineTo(x, padding.top + plotHeight + (isMobile ? 4 : 6));
            ctx.stroke();

            // Draw label
            ctx.fillText(tick.label, x, padding.top + plotHeight + (isMobile ? 8 : 10));
        }

        // Draw vertical dashed line for year/quarter boundaries (but not at chart boundaries)
        if (tick.isYearStart && x > padding.left + 5 && x < padding.left + plotWidth - 5) {
            ctx.beginPath();
            ctx.setLineDash([3, 3]); // Dashed line
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + plotHeight);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.stroke();
            ctx.setLineDash([]); // Reset to solid line
        }

        // Draw dashed lines for quarterly boundaries (Apr, Jul, Oct)
        if (x > padding.left + 5 && x < padding.left + plotWidth - 5) {
            if (
                tick.label.includes('Apr') ||
                tick.label.includes('Jul') ||
                tick.label.includes('Oct')
            ) {
                ctx.beginPath();
                ctx.setLineDash([2, 2]); // Shorter dashes for quarters
                ctx.moveTo(x, padding.top);
                ctx.lineTo(x, padding.top + plotHeight);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; // Lighter for quarters
                ctx.stroke();
                ctx.setLineDash([]); // Reset to solid line
            }
        }
    });
}

// --- Chart Drawing Functions ---

async function drawContributionChart(ctx, chartManager, timestamp) {
    stopPerformanceAnimation();

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

    const filtersActive = hasActiveTransactionFilters();
    const contributionTransactions = filtersActive ? filteredTransactions : allTransactions;
    let contributionSource = [];
    let contributionFromTransactions = false;

    if (contributionTransactions.length > 0) {
        contributionSource = getContributionSeriesForTransactions(contributionTransactions, true);
        contributionFromTransactions =
            filtersActive && Array.isArray(contributionSource) && contributionSource.length > 0;
        if (!filtersActive && contributionSource !== runningAmountSeries) {
            setRunningAmountSeries(contributionSource);
        }
    } else {
        contributionSource = runningAmountSeries;
    }

    if (
        (!Array.isArray(contributionSource) || contributionSource.length === 0) &&
        runningAmountSeries.length > 0
    ) {
        contributionSource = runningAmountSeries;
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

    const balanceSource = filtersActive
        ? buildFilteredBalanceSeries(
              filteredTransactions,
              historicalPrices,
              transactionState.splitHistory
          )
        : portfolioSeries;
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
    const filterFrom = chartDateRange.from ? new Date(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? new Date(chartDateRange.to) : null;

    const filterDataByDateRange = (data) => {
        return data.filter((item) => {
            const itemDate = new Date(item.date);
            return (!filterFrom || itemDate >= filterFrom) && (!filterTo || itemDate <= filterTo);
        });
    };

    const rawContributionData = filterDataByDateRange(
        (contributionSource || [])
            .map((item) => ({ ...item, date: new Date(item.tradeDate || item.date) }))
            .filter((item) => !Number.isNaN(item.date.getTime()))
    );
    const mappedBalanceSource = showBalance
        ? (balanceSource || [])
              .map((item) => ({ ...item, date: new Date(item.date) }))
              .filter((item) => !Number.isNaN(item.date.getTime()))
        : [];
    const rawBalanceData = showBalance
        ? injectSyntheticStartPoint(filterDataByDateRange(mappedBalanceSource), balanceSource)
        : [];

    // Apply smoothing to contribution and balance data
    const contributionSmoothingConfig = getSmoothingConfig('contribution');
    const balanceSmoothingConfig = getSmoothingConfig('balance') || contributionSmoothingConfig;
    const shouldSmoothContribution =
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
        !filtersActive && rawBalanceData.length > 2 && balanceSmoothingConfig;
    const balanceData = shouldSmoothBalance
        ? smoothFinancialData(
              rawBalanceData.map((item) => ({ x: item.date.getTime(), y: item.value })),
              balanceSmoothingConfig,
              true // preserveEnd - keep the last point unchanged
          ).map((p) => ({ date: new Date(p.x), value: p.y }))
        : rawBalanceData;

    if (contributionData.length === 0 && balanceData.length === 0) {
        stopContributionAnimation();
        if (emptyState) {
            emptyState.style.display = '';
        }
        return;
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

    if (filterFrom && Number.isFinite(filterFrom.getTime())) {
        minTime = Math.max(minTime, filterFrom.getTime());
    }
    // If we have a date range filter, use only the filtered data range
    // Otherwise, extend to today for real-time data
    const maxTime =
        filterFrom || filterTo
            ? Math.max(...allTimes)
            : Math.max(new Date().setHours(0, 0, 0, 0), ...allTimes);

    if (showContribution && contributionData.length > 0) {
        const lastDataPoint = contributionData[contributionData.length - 1];
        if (lastDataPoint.date.getTime() < maxTime) {
            contributionData.push({
                ...lastDataPoint,
                date: new Date(maxTime),
            });
        }
    }

    const contributionValues = contributionData.map((item) => item.amount);
    const balanceValues = balanceData.map((item) => item.value);
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

    if (!hasValues) {
        yMin = startYAxisAtZero ? 0 : 0;
        yMax = 1;
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
        volumeHeight > 0 ? { drawXAxis: false } : {}
    );

    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);
    const contributionAnimationEnabled = isAnimationEnabled('contribution');
    const animationPhase = advanceContributionAnimation(timestamp);

    const animatedSeries = [];
    const filterStartTime = filterFrom ? filterFrom.getTime() : null;

    const formatBalanceValue = (value) => {
        const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
        const absolute = Math.abs(amount);
        const sign = amount < 0 ? '-' : '';

        if (absolute >= 1_000_000) {
            const millions = absolute / 1_000_000;
            return `${sign}$${millions.toFixed(2)}M`;
        }
        if (absolute >= 1_000) {
            const thousands = absolute / 1_000;
            return `${sign}$${thousands.toFixed(1)}k`;
        }
        return `${sign}$${amount.toFixed(0)}`;
    };

    let firstContributionLabelY = null;
    let contributionEndLabelY = null;

    if (showContribution && contributionData.length > 0) {
        animatedSeries.push({
            key: 'contribution',
            color: colors.contribution,
            lineWidth: 2,
            order: 1,
            data: contributionData.map((item) => ({
                time: item.date.getTime(),
                value: item.amount,
            })),
        });
    }

    if (showBalance && balanceData.length > 0) {
        animatedSeries.push({
            key: 'balance',
            color: colors.portfolio,
            lineWidth: 2,
            order: 2,
            data: balanceData.map((item) => ({
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
        if (!((type === 'buy' && showBuy) || (type === 'sell' && showSell))) {
            return;
        }
        const normalizedDate = new Date(item.date.getTime());
        normalizedDate.setHours(0, 0, 0, 0);
        const timestamp = normalizedDate.getTime();
        if (!Number.isFinite(timestamp)) {
            return;
        }
        const netAmount = Math.abs(Number(item.netAmount) || 0);
        if (netAmount <= 0) {
            return;
        }

        if (!volumeGroups.has(timestamp)) {
            volumeGroups.set(timestamp, { totalBuy: 0, totalSell: 0 });
        }
        const totals = volumeGroups.get(timestamp);
        if (type === 'buy') {
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
            { drawYAxis: maxVolume > 0 }
        );
    }

    if (volumeHeight > 0 && volumeEntries.length > 0 && typeof volumeYScale === 'function') {
        volumeEntries.sort((a, b) => a.timestamp - b.timestamp);
        const barWidth = 8;
        const barGap = 3;
        const baselineY = volumePadding.top + volumeHeight;

        const allVolumeRects = [];

        volumeEntries.forEach((entry) => {
            const { timestamp, totalBuyVolume, totalSellVolume } = entry;
            const x = xScale(timestamp);

            const bars = [];
            if (totalBuyVolume > 0) {
                bars.push({
                    volume: totalBuyVolume,
                    fill: 'rgba(76, 175, 80, 0.6)',
                    stroke: 'rgba(76, 175, 80, 0.8)',
                });
            }
            if (totalSellVolume > 0) {
                bars.push({
                    volume: totalSellVolume,
                    fill: 'rgba(244, 67, 54, 0.6)',
                    stroke: 'rgba(244, 67, 54, 0.8)',
                });
            }
            if (bars.length === 0) {
                return;
            }

            const totalBarWidth = bars.length * barWidth + (bars.length - 1) * barGap;
            let currentX = x - totalBarWidth / 2;

            bars.forEach((bar, index) => {
                const topY = volumeYScale(bar.volume);
                const height = baselineY - topY;
                if (height > 0) {
                    allVolumeRects.push({
                        timestamp,
                        x: currentX,
                        width: barWidth,
                        topY,
                        height,
                        fill: bar.fill,
                        stroke: bar.stroke,
                        order: index,
                    });
                }
                currentX += barWidth + barGap;
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

    const areaBaselineY = chartBounds.bottom;

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
                opacityTop: 0.35,
                opacityBottom: 0,
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
            glowAnimator.drawSeriesGlow(
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

    if (contributionAnimationEnabled && hasAnimatedSeries) {
        scheduleContributionAnimation(chartManager);
    } else {
        stopContributionAnimation();
    }

    // Draw start and end values using raw data to ensure accuracy
    if (showContribution && rawContributionData.length > 0) {
        const contributionGradient = BALANCE_GRADIENTS['contribution'];
        const contributionStartColor = contributionGradient
            ? contributionGradient[0]
            : colors.contribution;
        const contributionEndColor = contributionGradient
            ? contributionGradient[1]
            : colors.contribution;

        const firstContribution =
            rawContributionData.find((item) => item.synthetic) ||
            rawContributionData.find((item) => {
                if (typeof item.orderType !== 'string') {
                    return true;
                }
                return item.orderType.toLowerCase() !== 'padding';
            }) ||
            rawContributionData[0];
        if (firstContribution) {
            const firstContributionX = xScale(firstContribution.date.getTime());
            const firstContributionY = yScale(firstContribution.amount);
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
                formatCurrencyCompact,
                true
            );
        }

        const lastContribution = rawContributionData[rawContributionData.length - 1];
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
            formatCurrencyCompact,
            true
        );
    }

    if (showBalance && rawBalanceData.length > 0) {
        const balanceGradient = BALANCE_GRADIENTS['balance'];
        const balanceStartColor = balanceGradient ? balanceGradient[0] : colors.portfolio;
        const balanceEndColor = balanceGradient ? balanceGradient[1] : colors.portfolio;

        const firstBalance = rawBalanceData[0];
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

        const lastBalance = rawBalanceData[rawBalanceData.length - 1];
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

    if (contributionLegendDirty) {
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
        contributionLegendDirty = false;
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
        const value = map.get(normalizeToDay(time)) || 0;
        return value > 0 ? value : null;
    };

    if (buyVolumeMap.size > 0) {
        volumeSeries.push({
            key: 'buyVolume',
            label: 'Buy',
            color: colors.buy,
            getValueAtTime: makeVolumeGetter(buyVolumeMap),
            formatValue: formatCurrencyInline,
            includeInRangeSummary: false,
            drawMarker: false,
        });
    }

    if (sellVolumeMap.size > 0) {
        volumeSeries.push({
            key: 'sellVolume',
            label: 'Sell',
            color: colors.sell,
            getValueAtTime: makeVolumeGetter(sellVolumeMap),
            formatValue: formatCurrencyInline,
            includeInRangeSummary: false,
            drawMarker: false,
        });
    }

    chartLayouts.contribution = {
        key: 'contribution',
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

    drawCrosshairOverlay(ctx, chartLayouts.contribution);

    if (contributionAnimationEnabled && hasAnimatedSeries) {
        scheduleContributionAnimation(chartManager);
    } else {
        stopContributionAnimation();
    }
}

async function drawPerformanceChart(ctx, chartManager, timestamp) {
    const performanceSeries =
        transactionState.performanceSeries && typeof transactionState.performanceSeries === 'object'
            ? transactionState.performanceSeries
            : {};

    const { chartVisibility } = transactionState;
    stopContributionAnimation();
    if (Object.keys(performanceSeries).length === 0) {
        stopPerformanceAnimation();
        chartLayouts.performance = null;
        updateCrosshairUI(null, null);
        return;
    }

    const orderedKeys = Object.keys(performanceSeries).sort((a, b) => {
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

    const allPossibleSeries = orderedKeys.map((key) => {
        const points = Array.isArray(performanceSeries[key]) ? performanceSeries[key] : [];
        return {
            key,
            name: key,
            data: points.map((point) => ({
                date: point.date,
                value: Number(point.value),
            })),
        };
    });

    const visibility = chartVisibility || {};
    const seriesToDraw = allPossibleSeries.filter((s) => visibility[s.key] !== false);

    if (seriesToDraw.length === 0 && allPossibleSeries.length > 0) {
        // Draw axes and legend only
    } else if (seriesToDraw.length === 0) {
        stopPerformanceAnimation();
        chartLayouts.performance = null;
        updateCrosshairUI(null, null);
        return;
    }

    const canvas = ctx.canvas;
    const emptyState = document.getElementById('runningAmountEmpty');
    if (emptyState) {
        emptyState.style.display = 'none';
    }

    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 50 }
        : { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvas.offsetWidth - padding.left - padding.right;
    const plotHeight = canvas.offsetHeight - padding.top - padding.bottom;

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? new Date(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? new Date(chartDateRange.to) : null;

    const cloneSeries = (series) => ({
        ...series,
        data: Array.isArray(series.data) ? series.data.map((point) => ({ ...point })) : [],
    });

    let normalizedSeriesToDraw = seriesToDraw.map(cloneSeries);

    if (filterFrom || filterTo) {
        normalizedSeriesToDraw = normalizedSeriesToDraw.map((series) => {
            const filteredData = series.data
                .map((d) => ({ ...d, date: new Date(d.date) }))
                .filter((d) => {
                    const pointDate = d.date;
                    return (
                        (!filterFrom || pointDate >= filterFrom) &&
                        (!filterTo || pointDate <= filterTo)
                    );
                });

            if (filteredData.length === 0) {
                return { ...series, data: [] };
            }

            const startValue = filteredData[0].value;
            const normalizedData = filteredData.map((d) => ({
                ...d,
                value: Number.isFinite(startValue) && startValue !== 0 ? d.value / startValue : 1,
            }));

            return {
                ...series,
                data: normalizedData,
            };
        });
    }

    const percentSeriesToDraw = normalizedSeriesToDraw.map((series) => {
        if (!Array.isArray(series.data) || series.data.length === 0) {
            return { ...series, data: [] };
        }
        const baseValue = series.data[0].value;
        const safeBase = Number.isFinite(baseValue) && baseValue !== 0 ? baseValue : 1;
        return {
            ...series,
            data: series.data.map((point) => ({
                ...point,
                value: (point.value / safeBase - 1) * 100,
            })),
        };
    });

    const allPoints = percentSeriesToDraw.flatMap((s) => s.data);
    if (allPoints.length === 0) {
        stopPerformanceAnimation();
        return;
    }

    const allTimes = allPoints.map((p) => new Date(p.date).getTime());
    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);
    const allValues = allPoints.map((p) => p.value);
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const valueRange = dataMax - dataMin;
    const yPadding = Math.max(valueRange * 0.05, 5);
    const yMin = dataMin - yPadding;
    const yMax = dataMax + yPadding;

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
        true
    );

    const performanceAnimationEnabled = isAnimationEnabled('performance');
    const animationPhase = advancePerformanceAnimation(timestamp);

    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);
    const colorMap = {
        '^LZ': BENCHMARK_GRADIENTS['^LZ'][1],
        '^GSPC': BENCHMARK_GRADIENTS['^GSPC'][1],
        '^IXIC': BENCHMARK_GRADIENTS['^IXIC'][1],
        '^DJI': BENCHMARK_GRADIENTS['^DJI'][1],
        '^SSEC': BENCHMARK_GRADIENTS['^SSEC'][1],
        '^HSI': BENCHMARK_GRADIENTS['^HSI'][1],
        '^N225': BENCHMARK_GRADIENTS['^N225'][1],
    };

    const seriesForDrawing = percentSeriesToDraw.slice().sort((a, b) => {
        const aIsPortfolio = a.key === '^LZ';
        const bIsPortfolio = b.key === '^LZ';
        if (aIsPortfolio && !bIsPortfolio) {
            return 1;
        }
        if (!aIsPortfolio && bIsPortfolio) {
            return -1;
        }
        return 0;
    });

    const lineThickness = 2;
    const renderedSeries = [];
    let glowIndex = 0;

    const chartBounds = {
        top: padding.top,
        bottom: padding.top + plotHeight,
        left: padding.left,
        right: padding.left + plotWidth,
    };

    const performanceBaselineY = yScale(0);

    seriesForDrawing.forEach((series) => {
        const isVisible = transactionState.chartVisibility[series.key] !== false;
        if (!isVisible || !Array.isArray(series.data) || series.data.length === 0) {
            return;
        }

        // Apply smoothing to the series data
        const rawPoints = series.data;
        const smoothingConfig = getSmoothingConfig('performance');
        const smoothedPoints = smoothingConfig
            ? smoothFinancialData(
                  rawPoints.map((p) => ({ x: new Date(p.date).getTime(), y: p.value })),
                  smoothingConfig,
                  true // preserveEnd - keep the last point unchanged
              )
            : rawPoints.map((p) => ({ x: new Date(p.date).getTime(), y: p.value }));

        const points = smoothedPoints.map((p) => ({ date: new Date(p.x), value: p.y }));
        const gradientStops = BENCHMARK_GRADIENTS[series.key];
        const resolvedColor = gradientStops
            ? gradientStops[1]
            : colorMap[series.key] || colors.contribution;

        if (gradientStops) {
            const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + plotWidth, 0);
            gradient.addColorStop(0, gradientStops[0]);
            gradient.addColorStop(1, gradientStops[1]);
            ctx.strokeStyle = gradient;
        } else {
            ctx.strokeStyle = resolvedColor;
        }

        const coords = points.map((point) => {
            const time = new Date(point.date).getTime();
            const x = xScale(time);
            const y = yScale(point.value);
            return { x, y, time, value: point.value };
        });

        if (mountainFill.enabled) {
            const gradientStops = BENCHMARK_GRADIENTS[series.key];
            drawMountainFill(ctx, coords, performanceBaselineY, {
                color: resolvedColor,
                colorStops: gradientStops || [resolvedColor, resolvedColor],
                opacityTop: 0.35,
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
        ctx.lineWidth = lineThickness;
        ctx.stroke();

        const lastPoint = points[points.length - 1];
        const lastCoord = coords[coords.length - 1] || { x: 0, y: 0 };

        renderedSeries.push({
            key: series.key,
            name: series.name,
            color: resolvedColor,
            x: lastCoord.x,
            y: lastCoord.y,
            value: lastPoint.value,
            coords,
            points: coords.map((coord) => ({ time: coord.time, value: coord.value })),
        });

        if (performanceAnimationEnabled) {
            glowAnimator.drawSeriesGlow(
                ctx,
                { coords, color: resolvedColor, lineWidth: lineThickness },
                {
                    basePhase: animationPhase,
                    seriesIndex: glowIndex,
                    isMobile,
                    chartKey: 'performance',
                }
            );
            glowIndex += 1;
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

    const formatValue = (value) => `${value.toFixed(1)}%`;

    renderedSeries.forEach((series) => {
        const { x, y, color, value } = series;

        drawEndValue(
            ctx,
            x,
            y,
            value,
            color,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatValue,
            false
        );
    });

    chartLayouts.performance = {
        key: 'performance',
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
        series: renderedSeries.map((series) => ({
            key: series.key,
            label: series.name,
            color: series.color,
            getValueAtTime: createTimeInterpolator(series.points || []),
            formatValue: (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
            formatDelta: (delta, percent) =>
                formatPercentInline(percent !== null && percent !== undefined ? percent : delta),
        })),
    };

    drawCrosshairOverlay(ctx, chartLayouts.performance);

    if (performanceLegendDirty) {
        const legendSeries = allPossibleSeries.map((s) => ({
            key: s.key,
            name: s.name,
            color: colorMap[s.key] || colors.contribution,
        }));
        updateLegend(legendSeries, chartManager);
        performanceLegendDirty = false;
    }
}

function renderCompositionChart(ctx, chartManager, data) {
    const canvas = ctx.canvas;
    const emptyState = document.getElementById('runningAmountEmpty');

    if (!data || !Array.isArray(data.dates) || data.dates.length === 0) {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        chartLayouts.composition = null;
        updateCrosshairUI(null, null);
        return;
    }

    if (emptyState) {
        emptyState.style.display = 'none';
    }

    const rawDates = data.dates.slice();
    const rawSeries = data.composition || data.series || {};

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
        chartLayouts.composition = null;
        updateCrosshairUI(null, null);
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    const chartData = {};
    Object.entries(rawSeries).forEach(([ticker, values]) => {
        const arr = Array.isArray(values) ? values : [];
        const mappedValues =
            filteredIndices.length > 0
                ? filteredIndices.map((i) => Number(arr[i] ?? 0))
                : arr.map((value) => Number(value ?? 0));
        chartData[ticker] = mappedValues;
    });

    const topTickers = Object.keys(chartData).sort((a, b) => {
        const arrA = chartData[a] || [];
        const arrB = chartData[b] || [];
        const lastA = arrA[arrA.length - 1] ?? 0;
        const lastB = arrB[arrB.length - 1] ?? 0;
        return lastB - lastA;
    });

    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 18, bottom: 36, left: 48 }
        : { top: 22, right: 26, bottom: 48, left: 68 };
    const plotWidth = canvasWidth - padding.left - padding.right;
    const plotHeight = canvasHeight - padding.top - padding.bottom;
    if (plotWidth <= 0 || plotHeight <= 0) {
        chartLayouts.composition = null;
        updateCrosshairUI(null, null);
        return;
    }

    const colors = COLOR_PALETTES.COMPOSITION_CHART_COLORS;

    const dateTimes = dates.map((dateStr) => new Date(dateStr).getTime());
    const minTime = Math.min(...dateTimes);
    const maxTime = Math.max(...dateTimes);

    const xScale = (time) =>
        padding.left +
        (maxTime === minTime
            ? plotWidth / 2
            : ((time - minTime) / (maxTime - minTime)) * plotWidth);
    const yScale = (value) => padding.top + plotHeight - (value / 100) * plotHeight;
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
        0,
        100,
        xScale,
        yScale,
        (val) => `${val}%`,
        true
    );

    let cumulativeValues = new Array(dates.length).fill(0);

    topTickers.forEach((ticker, tickerIndex) => {
        const values = chartData[ticker] || [];
        if (!Array.isArray(values) || values.length !== dates.length) {
            return;
        }
        const color = colors[tickerIndex % colors.length];
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
    const othersPercentage = chartData.Others ? (chartData.Others[latestIndex] ?? 0) : 0;
    const shouldIncludeOthers = othersPercentage > 50;

    const latestHoldings = topTickers
        .filter((ticker) => shouldIncludeOthers || ticker !== 'Others')
        .map((ticker) => ({
            ticker,
            percentage: (chartData[ticker] || [])[latestIndex] ?? 0,
        }))
        .filter((holding) => holding.percentage > 0.1)
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 6);

    const holdingsForLegend =
        latestHoldings.length > 0
            ? latestHoldings
            : topTickers
                  .filter((ticker) => shouldIncludeOthers || ticker !== 'Others')
                  .map((ticker) => ({
                      ticker,
                      percentage: (chartData[ticker] || [])[latestIndex] ?? 0,
                  }))
                  .sort((a, b) => b.percentage - a.percentage)
                  .slice(0, 6);

    const legendSeries = holdingsForLegend.map((holding) => {
        const tickerIndex = topTickers.indexOf(holding.ticker);
        const displayName = holding.ticker === 'BRKB' ? 'BRK-B' : holding.ticker;
        return {
            key: holding.ticker,
            name: displayName,
            color: colors[tickerIndex % colors.length],
        };
    });

    // Create series for crosshair that will show top 7 holdings at crosshair position
    const seriesForCrosshair = [];

    // Include ALL tickers to ensure historical holdings are available for crosshair
    // For each crosshair position, we'll dynamically determine the top holdings
    Object.keys(chartData).forEach((ticker) => {
        const values = chartData[ticker];
        if (!Array.isArray(values) || values.length !== dates.length) {
            return;
        }
        const points = dateTimes.map((time, idx) => ({
            time,
            value: values[idx],
        }));
        const label = ticker === 'BRKB' ? 'BRK-B' : ticker;
        const tickerIndex = topTickers.indexOf(ticker);
        const color = colors[tickerIndex % colors.length];
        seriesForCrosshair.push({
            key: ticker,
            label,
            color,
            getValueAtTime: createTimeInterpolator(points),
            formatValue: (value) => `${value.toFixed(2)}%`,
            formatDelta: (delta) => formatPercentInline(delta),
            originalIndex: tickerIndex,
        });
    });

    const sortedSeriesForCrosshair = seriesForCrosshair.sort((a, b) => {
        const indexA = topTickers.indexOf(a.key);
        const indexB = topTickers.indexOf(b.key);
        return indexA - indexB;
    });

    chartLayouts.composition = {
        key: 'composition',
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
        series: sortedSeriesForCrosshair,
    };

    // For composition chart, only draw crosshair without range functionality
    drawCrosshairOverlay(ctx, chartLayouts.composition);

    if (!isMobile) {
        updateLegend(legendSeries, chartManager);
    }
}

function drawCompositionChart(ctx, chartManager) {
    stopPerformanceAnimation();
    stopContributionAnimation();
    const emptyState = document.getElementById('runningAmountEmpty');

    if (!compositionDataCache && compositionDataLoading) {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    if (compositionDataCache) {
        renderCompositionChart(ctx, chartManager, compositionDataCache);
        return;
    }

    compositionDataLoading = true;
    fetch('../data/output/figures/composition.json')
        .then((response) => response.json())
        .then((data) => {
            compositionDataCache = data;
            renderCompositionChart(ctx, chartManager, data);
        })
        .catch(() => {
            chartLayouts.composition = null;
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
    crosshairExternalUpdate = crosshairCallbacks.onUpdate || null;
    if (typeof crosshairExternalUpdate === 'function') {
        crosshairExternalUpdate(null, null);
    }

    let pendingFrame = null;

    const renderFrame = async (timestamp) => {
        pendingFrame = null;
        const canvas = document.getElementById('runningAmountCanvas');
        if (!canvas) {
            stopPerformanceAnimation();
            stopContributionAnimation();
            updateCrosshairUI(null, null);
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            stopPerformanceAnimation();
            stopContributionAnimation();
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
        } else if (transactionState.activeChart === 'composition') {
            drawCompositionChart(ctx, chartManager);
        } else {
            await drawContributionChart(ctx, chartManager, timestamp);
        }
    };

    const chartManager = {
        update() {
            performanceLegendDirty = true;
            contributionLegendDirty = true;
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
