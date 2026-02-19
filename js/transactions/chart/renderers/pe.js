import { transactionState } from '../../state.js';
import { chartLayouts } from '../state.js';
import { mountainFill, CHART_LINE_WIDTHS } from '../../../config.js';
import { BENCHMARK_GRADIENTS } from '../config.js';
import {
    stopPerformanceAnimation,
    stopContributionAnimation,
    stopFxAnimation,
    stopPeAnimation,
    stopConcentrationAnimation,
    isAnimationEnabled,
    advancePeAnimation,
    schedulePeAnimation,
    drawSeriesGlow,
} from '../animation.js';
import { updateCrosshairUI, updateLegend, drawCrosshairOverlay } from '../interaction.js';
import { drawAxes, drawMountainFill, drawEndValue } from '../core.js';
import { getChartColors, createTimeInterpolator, clampTime, parseLocalDate } from '../helpers.js';

// Data cache
let peDataCache = null;
let peDataLoading = false;

/**
 * Load PE ratio data from the backend JSON.
 * @returns {Promise<Object|null>}
 */
export async function loadPEData() {
    try {
        const response = await fetch('../data/output/figures/pe_ratio.json');
        if (!response.ok) {
            // eslint-disable-next-line no-console
            console.warn('pe_ratio.json not found');
            return null;
        }
        return await response.json();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load PE data:', error);
        return null;
    }
}

/**
 * Build a PE ratio time-series from pre-computed PE data.
 *
 * @param {string[]} dates - Array of date strings.
 * @param {(number|null)[]} portfolioPE - Portfolio-weighted PE values.
 * @param {Object} tickerPE - Map of ticker → array of PE values.
 * @param {Object} tickerWeights - Map of ticker → array of weights.
 * @param {Date|null} filterFrom - Optional start date filter.
 * @param {Date|null} filterTo - Optional end date filter.
 * @returns {{ date: Date, pe: number, tickerPEs: Object, tickerWeights: Object }[]}
 */
export function buildPESeries(dates, portfolioPE, tickerPE, tickerWeights, filterFrom, filterTo) {
    if (!Array.isArray(dates) || dates.length === 0) {
        return [];
    }
    if (!Array.isArray(portfolioPE) || portfolioPE.length === 0) {
        return [];
    }

    const result = [];

    for (let i = 0; i < dates.length; i += 1) {
        const dateStr = dates[i];
        const date = parseLocalDate(dateStr);
        if (!date || Number.isNaN(date.getTime())) {
            continue;
        }
        if (filterFrom && date < filterFrom) {
            continue;
        }
        if (filterTo && date > filterTo) {
            continue;
        }

        const pe = portfolioPE[i];
        if (pe === null || pe === undefined || !Number.isFinite(pe)) {
            continue;
        }

        // Gather per-ticker PE values and weights for crosshair
        const dayTickerPEs = {};
        if (tickerPE && typeof tickerPE === 'object') {
            Object.keys(tickerPE).forEach((ticker) => {
                const val = tickerPE[ticker][i];
                if (val !== null && val !== undefined && Number.isFinite(val)) {
                    dayTickerPEs[ticker] = val;
                }
            });
        }

        const dayTickerWeights = {};
        if (tickerWeights && typeof tickerWeights === 'object') {
            Object.keys(tickerWeights).forEach((ticker) => {
                const val = tickerWeights ? tickerWeights[ticker][i] : null;
                if (val !== null && val !== undefined && Number.isFinite(val)) {
                    dayTickerWeights[ticker] = val;
                }
            });
        }

        result.push({ date, pe, tickerPEs: dayTickerPEs, tickerWeights: dayTickerWeights });
    }

    return result;
}

/**
 * Draw the PE ratio chart — a single line showing weighted average P/E over time.
 */
export function drawPEChart(ctx, chartManager, timestamp) {
    stopPerformanceAnimation();
    stopContributionAnimation();
    stopFxAnimation();
    stopConcentrationAnimation();

    const emptyState = document.getElementById('runningAmountEmpty');

    // --- Data loading ---
    if (!peDataCache && peDataLoading) {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    if (!peDataCache) {
        peDataLoading = true;
        loadPEData()
            .then((data) => {
                if (!data) {
                    throw new Error('Failed to load PE data');
                }
                peDataCache = data;
                chartManager.redraw();
            })
            .catch(() => {
                chartLayouts.pe = null;
                updateCrosshairUI(null, null);
                if (emptyState) {
                    emptyState.style.display = 'block';
                }
            })
            .finally(() => {
                peDataLoading = false;
            });
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    const data = peDataCache;

    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray(data.dates) ||
        data.dates.length === 0
    ) {
        chartLayouts.pe = null;
        updateCrosshairUI(null, null);
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    if (emptyState) {
        emptyState.style.display = 'none';
    }

    // --- Build PE series ---
    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;

    const series = buildPESeries(
        data.dates,
        data.portfolio_pe,
        data.ticker_pe,
        data.ticker_weights,
        filterFrom,
        filterTo
    );

    if (series.length === 0) {
        chartLayouts.pe = null;
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
        chartLayouts.pe = null;
        updateCrosshairUI(null, null);
        return;
    }

    // --- Scales ---
    const dateTimes = series.map((p) => p.date.getTime());
    let minTime = Math.min(...dateTimes);
    let maxTime = Math.max(...dateTimes);

    const filterFromTime = filterFrom ? filterFrom.getTime() : null;
    if (Number.isFinite(filterFromTime)) {
        minTime = Math.max(minTime, filterFromTime);
    }

    // Check for forward PE data and extend maxTime if present
    const forwardPE = data.forward_pe;
    let forwardTargetTime = null;
    let forwardPEValue = null;
    if (forwardPE && forwardPE.target_date && forwardPE.portfolio_forward_pe && !filterTo) {
        const targetDate = parseLocalDate(forwardPE.target_date);
        if (targetDate && !Number.isNaN(targetDate.getTime())) {
            forwardTargetTime = targetDate.getTime();
            forwardPEValue = forwardPE.portfolio_forward_pe;
            maxTime = Math.max(maxTime, forwardTargetTime);
        }
    }

    const peValues = series.map((p) => p.pe);
    const dataMin = Math.min(...peValues);
    let dataMax = Math.max(...peValues);
    if (forwardPEValue !== null) {
        dataMax = Math.max(dataMax, forwardPEValue);
    }

    // Y range with 10% padding
    const range = dataMax - dataMin;
    const yPadding = Math.max(range * 0.1, 1);
    const yMin = 0; // Fixed base at 0 to avoid misleading scaling
    const yMax = dataMax + yPadding;

    const xScale = (t) =>
        padding.left +
        (maxTime === minTime ? plotWidth / 2 : ((t - minTime) / (maxTime - minTime)) * plotWidth);
    const yScale = (v) => padding.top + plotHeight - ((v - yMin) / (yMax - yMin || 1)) * plotHeight;

    // --- Draw axes ---
    const yLabelFormatter = (v) => (Number.isInteger(v) ? `${v}x` : `${v.toFixed(1)}x`);

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
    const gradientStops = BENCHMARK_GRADIENTS['^LZ'] || [colors.portfolio, colors.portfolio];
    const lineColor = gradientStops[1] || colors.portfolio || '#ffef2f';
    const lineThickness = CHART_LINE_WIDTHS.contribution ?? 2;

    const coords = series.map((point) => ({
        x: xScale(point.date.getTime()),
        y: yScale(point.pe),
        time: point.date.getTime(),
        value: point.pe,
    }));

    // Mountain fill
    const baselineY = yScale(yMin);
    if (mountainFill.enabled) {
        drawMountainFill(ctx, coords, baselineY, {
            color: lineColor,
            colorStops: gradientStops,
            opacityTop: 0.3,
            opacityBottom: 0.05,
            bounds: chartBounds,
        });
    }

    // Draw line path with gradient
    if (gradientStops.length === 2) {
        const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + plotWidth, 0);
        gradient.addColorStop(0, gradientStops[0]);
        gradient.addColorStop(1, gradientStops[1]);
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

    // --- Draw forward PE dashed line ---
    const lastPoint = series[series.length - 1];
    const showLabels = transactionState.showChartLabels !== false;

    if (forwardTargetTime !== null && forwardPEValue !== null && lastPoint) {
        const lastX = xScale(lastPoint.date.getTime());
        const lastY = yScale(lastPoint.pe);
        const fwdX = xScale(forwardTargetTime);
        const fwdY = yScale(forwardPEValue);

        // Mountain fill under the forward segment (reduced opacity)
        if (mountainFill.enabled) {
            const fwdCoords = [
                { x: lastX, y: lastY },
                { x: fwdX, y: fwdY },
            ];
            drawMountainFill(ctx, fwdCoords, baselineY, {
                color: lineColor,
                colorStops: gradientStops,
                opacityTop: 0.15,
                opacityBottom: 0.02,
                bounds: chartBounds,
            });
        }

        // Dashed line
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineThickness;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(fwdX, fwdY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
        ctx.restore();

        // Animated shimmer at the forward PE endpoint (uses same glow system as other charts)
        const peAnimEnabled = isAnimationEnabled('pe');
        const animPhase = advancePeAnimation(timestamp);
        if (peAnimEnabled) {
            const fwdGlowCoords = [
                { x: lastX, y: lastY },
                { x: fwdX, y: fwdY },
            ];
            drawSeriesGlow(
                ctx,
                { coords: fwdGlowCoords, color: lineColor, lineWidth: lineThickness },
                {
                    basePhase: animPhase,
                    seriesIndex: 0,
                    isMobile,
                    chartKey: 'pe',
                }
            );
            schedulePeAnimation(chartManager);
        } else {
            stopPeAnimation();
        }

        // End value label with dark box (matching trailing PE style)
        if (showLabels) {
            drawEndValue(
                ctx,
                fwdX,
                fwdY,
                forwardPEValue,
                lineColor,
                isMobile,
                padding,
                plotWidth,
                plotHeight,
                (v) => `${v.toFixed(1)}x`,
                true,
                null
            );
        }
    } else {
        stopPeAnimation();
    }

    // End value label for trailing PE
    if (showLabels && lastPoint) {
        const lastX = xScale(lastPoint.date.getTime());
        const lastY = yScale(lastPoint.pe);
        drawEndValue(
            ctx,
            lastX,
            lastY,
            lastPoint.pe,
            lineColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            (v) => `${v.toFixed(1)}x`,
            true,
            null
        );
    }

    // --- Layout for crosshair ---
    const pePoints = series.map((p) => ({ time: p.date.getTime(), value: p.pe }));

    // Build a lookup from time → tickerPEs for the hover panel
    const tickerPEsByTime = new Map();
    series.forEach((p) => {
        tickerPEsByTime.set(p.date.getTime(), p.tickerPEs);
    });

    // Find closest series point for a given time
    const findClosestPoint = (targetTime) => {
        let closest = series[0];
        let minDist = Math.abs(series[0].date.getTime() - targetTime);
        for (let i = 1; i < series.length; i += 1) {
            const dist = Math.abs(series[i].date.getTime() - targetTime);
            if (dist < minDist) {
                minDist = dist;
                closest = series[i];
            }
        }
        return closest;
    };

    chartLayouts.pe = {
        key: 'pe',
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
                key: 'portfolioPE',
                name: 'Portfolio P/E',
                label: 'P/E',
                color: lineColor,
                getValueAtTime: createTimeInterpolator(pePoints),
                formatValue: (v, time) => {
                    let text = `${v.toFixed(1)}x`;
                    // Append per-ticker breakdown for tickers held on this date
                    if (Number.isFinite(time)) {
                        const point = findClosestPoint(time);
                        if (point && point.tickerPEs) {
                            const entries = Object.entries(point.tickerPEs)
                                .filter(([, pe]) => pe !== null && Number.isFinite(pe))
                                .sort((a, b) => {
                                    // Sort by weight descending
                                    const wA = point.tickerWeights ? point.tickerWeights[a[0]] : 0;
                                    const wB = point.tickerWeights ? point.tickerWeights[b[0]] : 0;
                                    return (wB || 0) - (wA || 0);
                                })
                                .slice(0, 8);
                            if (entries.length > 0) {
                                const breakdown = entries
                                    .map(([t, pe]) => `${t}:${pe.toFixed(0)}`)
                                    .join(' ');
                                text += ` (${breakdown})`;
                            }
                        }
                    }
                    return text;
                },
                formatDelta: (d) => `${d > 0 ? '+' : ''}${d.toFixed(1)}`,
            },
        ],
        rawSeries: series,
        forwardPE: forwardPE || null,
    };

    drawCrosshairOverlay(ctx, chartLayouts.pe);

    // --- Legend ---
    const latestPE = lastPoint ? lastPoint.pe : 0;
    const legendItems = [
        {
            key: 'pe',
            name: `P/E Ratio: ${latestPE.toFixed(1)}x`,
            color: lineColor,
        },
    ];
    if (forwardPEValue !== null) {
        legendItems.push({
            key: 'fwd_pe',
            name: `Forward P/E: ${forwardPEValue.toFixed(1)}x`,
            color: lineColor,
        });
    }
    updateLegend(legendItems, chartManager);
}

/**
 * Get summary text for the PE chart (Current + Range).
 */
export function getPESnapshotText() {
    if (!chartLayouts.pe || !chartLayouts.pe.rawSeries || chartLayouts.pe.rawSeries.length === 0) {
        return 'Loading PE data...';
    }

    const series = chartLayouts.pe.rawSeries;
    const { chartDateRange } = transactionState;
    const fromTime = chartDateRange.from
        ? parseLocalDate(chartDateRange.from).getTime()
        : -Infinity;
    const toTime = chartDateRange.to ? parseLocalDate(chartDateRange.to).getTime() : Infinity;

    const visiblePoints = series.filter((p) => {
        const t = p.date.getTime();
        return t >= fromTime && t <= toTime;
    });

    if (visiblePoints.length === 0) {
        return 'No PE data in range';
    }

    const values = visiblePoints.map((p) => p.pe);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const current = values[values.length - 1];

    const fwd = chartLayouts.pe.forwardPE;
    const fwdText =
        fwd && fwd.portfolio_forward_pe
            ? ` | Forward: ${fwd.portfolio_forward_pe.toFixed(2)}x`
            : '';

    return `Current: ${current.toFixed(2)}x | Range: ${min.toFixed(2)}x - ${max.toFixed(2)}x | Harmonic Mean (1 / Σ(w/PE))${fwdText}`;
}
