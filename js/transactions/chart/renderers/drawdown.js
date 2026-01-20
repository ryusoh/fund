import { transactionState, getShowChartLabels } from '../../state.js';
import { chartLayouts } from '../state.js';
import { mountainFill, CHART_LINE_WIDTHS } from '../../../config.js';
import { BENCHMARK_GRADIENTS, PERFORMANCE_SERIES_CURRENCY } from '../config.js';
import { convertBetweenCurrencies } from '../../utils.js';
import { drawAxes, drawMountainFill, drawEndValue } from '../core.js';
import { getChartColors, createTimeInterpolator, clampTime } from '../helpers.js';
import { updateCrosshairUI, updateLegend, drawCrosshairOverlay } from '../interaction.js';
import {
    stopContributionAnimation,
    stopFxAnimation,
    stopPerformanceAnimation,
    isAnimationEnabled,
    advancePerformanceAnimation,
    drawSeriesGlow,
    schedulePerformanceAnimation,
} from '../animation.js';

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

export async function drawDrawdownChart(ctx, chartManager, timestamp) {
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
        series: renderedSeries.map((series) => ({
            key: series.key,
            name: series.name,
            color: series.color,
            getValueAtTime: createTimeInterpolator(series.points || []),
            formatValue: valueFormatter,
            formatDelta: (delta) => deltaFormatter(delta),
        })),
    };

    drawCrosshairOverlay(ctx, chartLayouts[layoutKey]);

    const legendEntries = orderedKeys.map((key) => ({
        key,
        name: key,
        color: colorMap[key] || colors.contribution,
    }));
    updateLegend(legendEntries, chartManager);
}
