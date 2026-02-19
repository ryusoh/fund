import { transactionState } from '../../state.js';
import { chartLayouts } from '../state.js';
import { loadCompositionSnapshotData } from '../../dataLoader.js';
import { mountainFill, CHART_LINE_WIDTHS } from '../../../config.js';
import { BENCHMARK_GRADIENTS } from '../config.js';
import {
    stopPerformanceAnimation,
    stopContributionAnimation,
    stopFxAnimation,
} from '../animation.js';
import { updateCrosshairUI, updateLegend, drawCrosshairOverlay } from '../interaction.js';
import { drawAxes, drawMountainFill, drawEndValue } from '../core.js';
import { getChartColors, createTimeInterpolator, clampTime, parseLocalDate } from '../helpers.js';

// Share a data cache with the composition renderer.
// Each renderer may be loaded independently, so we maintain our own cache reference.
let concentrationDataCache = null;
let concentrationDataLoading = false;

/**
 * Build a concentration (HHI) time-series from composition data.
 *
 * @param {string[]} dates - Array of date strings from composition data.
 * @param {Object} compositionSeries - Map of ticker → array of percentage values.
 * @param {Date|null} filterFrom - Optional start date filter.
 * @param {Date|null} filterTo - Optional end date filter.
 * @returns {{ date: Date, hhi: number, effectiveHoldings: number }[]}
 */
export function buildConcentrationSeries(dates, compositionSeries, filterFrom, filterTo) {
    if (!Array.isArray(dates) || dates.length === 0) {
        return [];
    }
    if (!compositionSeries || typeof compositionSeries !== 'object') {
        return [];
    }

    const tickers = Object.keys(compositionSeries);
    if (tickers.length === 0) {
        return [];
    }

    const result = [];

    for (let i = 0; i < dates.length; i += 1) {
        const dateStr = dates[i];
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) {
            continue;
        }
        if (filterFrom && date < filterFrom) {
            continue;
        }
        if (filterTo && date > filterTo) {
            continue;
        }

        // Gather positive weights for this day
        let totalWeight = 0;
        const weights = [];
        tickers.forEach((ticker) => {
            const values = compositionSeries[ticker];
            const pct = Number(Array.isArray(values) ? (values[i] ?? 0) : 0);
            if (Number.isFinite(pct) && pct > 0) {
                weights.push(pct);
                totalWeight += pct;
            }
        });

        if (totalWeight <= 0 || weights.length === 0) {
            continue;
        }

        // Normalize and compute HHI = Σ(wᵢ²) where wᵢ are fractions summing to 1
        let hhi = 0;
        weights.forEach((w) => {
            const normalized = w / totalWeight;
            hhi += normalized * normalized;
        });

        const effectiveHoldings = hhi > 0 ? 1 / hhi : 0;

        result.push({
            date,
            hhi,
            effectiveHoldings,
        });
    }

    return result;
}

/**
 * Draw the concentration chart – a single line showing HHI over time.
 */
export function drawConcentrationChart(ctx, chartManager) {
    stopPerformanceAnimation();
    stopContributionAnimation();
    stopFxAnimation();

    const emptyState = document.getElementById('runningAmountEmpty');

    // --- Data loading (reusing composition data) ---
    if (!concentrationDataCache && concentrationDataLoading) {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    if (!concentrationDataCache) {
        concentrationDataLoading = true;
        loadCompositionSnapshotData()
            .then((data) => {
                if (!data) {
                    throw new Error('Failed to load composition data');
                }
                concentrationDataCache = data;
                chartManager.redraw();
            })
            .catch(() => {
                chartLayouts.concentration = null;
                updateCrosshairUI(null, null);
                if (emptyState) {
                    emptyState.style.display = 'block';
                }
            })
            .finally(() => {
                concentrationDataLoading = false;
            });
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    const data = concentrationDataCache;

    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray(data.dates) ||
        data.dates.length === 0
    ) {
        chartLayouts.concentration = null;
        updateCrosshairUI(null, null);
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    if (emptyState) {
        emptyState.style.display = 'none';
    }

    // --- Build HHI series ---
    const rawDates = data.dates;
    const compositionSeries = data.composition || data.series || {};

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;

    const series = buildConcentrationSeries(rawDates, compositionSeries, filterFrom, filterTo);

    if (series.length === 0) {
        chartLayouts.concentration = null;
        updateCrosshairUI(null, null);
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    // --- Canvas setup ---
    const canvas = ctx.canvas;
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 50 }
        : { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvasWidth - padding.left - padding.right;
    const plotHeight = canvasHeight - padding.top - padding.bottom;

    if (plotWidth <= 0 || plotHeight <= 0) {
        chartLayouts.concentration = null;
        updateCrosshairUI(null, null);
        return;
    }

    // --- Scales ---
    const dateTimes = series.map((p) => p.date.getTime());
    let minTime = Math.min(...dateTimes);
    const maxTime = Math.max(...dateTimes);

    const filterFromTime = filterFrom ? filterFrom.getTime() : null;
    if (Number.isFinite(filterFromTime)) {
        minTime = Math.max(minTime, filterFromTime);
    }

    const ehValues = series.map((p) => p.effectiveHoldings);
    const dataMax = Math.max(...ehValues);

    // Y range: start from 0 (most concentrated), extend to max effective holdings
    const yMin = 0;
    const range = dataMax - yMin;
    const yMax = dataMax + Math.max(range * 0.1, 0.5);

    const xScale = (t) =>
        padding.left +
        (maxTime === minTime ? plotWidth / 2 : ((t - minTime) / (maxTime - minTime)) * plotWidth);
    const yScale = (v) => padding.top + plotHeight - ((v - yMin) / (yMax - yMin || 1)) * plotHeight;

    // --- Draw axes ---
    const yLabelFormatter = (v) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));

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
        yLabelFormatter,
        false
    );

    // --- Draw line ---
    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);
    const contributionGradientStops = BENCHMARK_GRADIENTS['^LZ'] || [
        colors.portfolio,
        colors.portfolio,
    ];
    const lineColor = contributionGradientStops[1] || colors.portfolio || '#ffef2f';
    const lineThickness = CHART_LINE_WIDTHS.contribution ?? 2;

    const coords = series.map((point) => ({
        x: xScale(point.date.getTime()),
        y: yScale(point.effectiveHoldings),
        time: point.date.getTime(),
        value: point.effectiveHoldings,
    }));

    // Mountain fill
    const baselineY = yScale(yMin);
    if (mountainFill.enabled) {
        drawMountainFill(ctx, coords, baselineY, {
            color: lineColor,
            colorStops: contributionGradientStops,
            opacityTop: 0.3,
            opacityBottom: 0.05,
            bounds: chartBounds,
        });
    }

    // Draw line path with gradient
    if (contributionGradientStops.length === 2) {
        const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + plotWidth, 0);
        gradient.addColorStop(0, contributionGradientStops[0]);
        gradient.addColorStop(1, contributionGradientStops[1]);
        ctx.strokeStyle = gradient;
    } else {
        ctx.strokeStyle = lineColor;
    }
    ctx.beginPath();
    ctx.lineWidth = lineThickness;
    coords.forEach((coord, index) => {
        if (index === 0) {
            ctx.moveTo(coord.x, coord.y);
        } else {
            ctx.lineTo(coord.x, coord.y);
        }
    });
    ctx.stroke();

    // End value label
    const lastPoint = series[series.length - 1];
    const showLabels = transactionState.showChartLabels !== false;
    if (showLabels && lastPoint) {
        const lastX = xScale(lastPoint.date.getTime());
        const lastY = yScale(lastPoint.effectiveHoldings);
        drawEndValue(
            ctx,
            lastX,
            lastY,
            lastPoint.effectiveHoldings,
            lineColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            (v) => v.toFixed(1),
            true,
            null
        );
    }

    // --- Layout for crosshair ---
    const ehPoints = series.map((p) => ({ time: p.date.getTime(), value: p.effectiveHoldings }));
    const hhiPoints = series.map((p) => ({ time: p.date.getTime(), value: p.hhi }));

    chartLayouts.concentration = {
        key: 'concentration',
        minTime,
        maxTime,
        valueType: 'number',
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
        series: [
            {
                key: 'effectiveHoldings',
                name: 'Eff. Holdings',
                label: 'Eff. Holdings',
                color: lineColor,
                getValueAtTime: createTimeInterpolator(ehPoints),
                formatValue: (v) => `${v.toFixed(1)} holdings`,
                formatDelta: (d) => `${d > 0 ? '+' : ''}${d.toFixed(1)}`,
            },
            {
                key: 'hhi',
                name: 'HHI',
                label: 'HHI',
                color: '#aaa',
                getValueAtTime: createTimeInterpolator(hhiPoints),
                formatValue: (v) => `HHI ${v.toFixed(3)}`,
                formatDelta: (d) => `${d > 0 ? '+' : ''}${d.toFixed(3)}`,
            },
        ],
    };

    drawCrosshairOverlay(ctx, chartLayouts.concentration);

    // --- Legend ---
    const latestEh = lastPoint ? lastPoint.effectiveHoldings : 0;
    const latestHhi = lastPoint ? lastPoint.hhi : 0;
    updateLegend(
        [
            {
                key: 'concentration',
                name: `Eff. Holdings: ${latestEh.toFixed(1)}  ·  HHI: ${latestHhi.toFixed(3)}`,
                color: lineColor,
            },
        ],
        chartManager
    );
}
