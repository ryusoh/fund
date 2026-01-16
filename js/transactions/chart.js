import {
    transactionState,
    getShowChartLabels,
    getCompositionFilterTickers,
    getCompositionAssetClassFilter,
} from './state.js';
import {
    formatCurrencyCompact,
    formatCurrencyInlineValue,
    convertValueToCurrency,
    convertBetweenCurrencies,
} from './utils.js';
import {
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
    scheduleFxAnimation,
    advancePerformanceAnimation,
    advanceFxAnimation,
    isAnimationEnabled,
    drawSeriesGlow,
} from './chart/animation.js';
import { smoothFinancialData } from '../utils/smoothing.js';
import { loadCompositionSnapshotData } from './dataLoader.js';

import {
    mountainFill,
    COLOR_PALETTES,
    CHART_LINE_WIDTHS,
    getHoldingAssetClass,
} from '../config.js';

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

export { injectSyntheticStartPoint } from './chart/helpers.js';
export { hasActiveTransactionFilters } from './state.js';
import { drawPerformanceChart } from './chart/renderers/performance.js';
import {
    PERFORMANCE_SERIES_CURRENCY,
    FX_CURRENCY_ORDER,
    FX_LINE_COLORS,
    FX_GRADIENTS,
    BENCHMARK_GRADIENTS,
} from './chart/config.js';
import {
    drawAxes,
    generateConcreteTicks,
    generateYearBasedTicks,
    computePercentTickInfo,
    drawMountainFill,
    drawEndValue,
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

// Helper function to get smoothing configuration
// --- Chart Drawing Functions ---

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
