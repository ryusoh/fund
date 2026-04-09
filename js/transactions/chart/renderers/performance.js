import { transactionState, getShowChartLabels } from '../../state.js';
import {
    stopPerformanceAnimation,
    stopContributionAnimation,
    stopFxAnimation,
    isAnimationEnabled,
    advancePerformanceAnimation,
    schedulePerformanceAnimation,
} from '../animation.js';
import {
    updateCrosshairUI,
    drawCrosshairOverlay,
    updateLegend,
    legendState,
} from '../interaction.js';
import { PERFORMANCE_SERIES_CURRENCY, BENCHMARK_GRADIENTS } from '../config.js';
import { CHART_LINE_WIDTHS, mountainFill } from '../../../config.js';
import { convertBetweenCurrencies } from '../../utils.js';
import { drawAxes, drawMountainFill, drawEndValue } from '../core.js';
import {
    getChartColors,
    getSmoothingConfig,
    createTimeInterpolator,
    formatPercentInline,
    clampTime,
    parseLocalDate,
} from '../helpers.js';
import { smoothFinancialData } from '../../../utils/smoothing.js';
import { chartLayouts } from '../state.js';
// glowAnimator is managed in animation.js, but drawPerformanceChart calls `glowAnimator.drawSeriesGlow`?
// Ah, `glowAnimator` is not exported from `animation.js`. `drawSeriesGlow` IS exported (I added it).
// So I should import `drawSeriesGlow` from `../animation.js`.

import { drawSeriesGlow } from '../animation.js';
export async function drawPerformanceChart(ctx, chartManager, timestamp) {
    const performanceSeries =
        transactionState.performanceSeries && typeof transactionState.performanceSeries === 'object'
            ? transactionState.performanceSeries
            : {};
    const selectedCurrency = transactionState.selectedCurrency || 'USD';

    const { chartVisibility } = transactionState;
    stopContributionAnimation();
    stopFxAnimation();
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
        const sourceCurrency = PERFORMANCE_SERIES_CURRENCY[key] || 'USD';
        return {
            key,
            name: key,
            data: points.map((point) => ({
                date: point.date,
                value: convertBetweenCurrencies(
                    Number(point.value),
                    sourceCurrency,
                    point.date,
                    selectedCurrency
                ),
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

    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 50 }
        : { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvas.offsetWidth - padding.left - padding.right;
    const plotHeight = canvas.offsetHeight - padding.top - padding.bottom;

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;

    const cloneSeries = (series) => ({
        ...series,
        data: Array.isArray(series.data) ? series.data.map((point) => ({ ...point })) : [],
    });

    let normalizedSeriesToDraw = seriesToDraw.map(cloneSeries);

    if (filterFrom || filterTo) {
        normalizedSeriesToDraw = normalizedSeriesToDraw.map((series) => {
            const filteredData = series.data
                .map((d) => ({ ...d, date: parseLocalDate(d.date) }))
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

    const allTimes = allPoints.map((p) => parseLocalDate(p.date).getTime());
    let minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);

    // Ensure minTime aligns with filter start for correct x-axis labels
    const filterFromTime = filterFrom ? filterFrom.getTime() : null;
    if (Number.isFinite(filterFromTime)) {
        minTime = Math.max(minTime, filterFromTime);
    }
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

    const rootStyles =
        typeof window !== 'undefined' ? window.getComputedStyle(document.documentElement) : null;
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

    const lineThickness = CHART_LINE_WIDTHS.performance ?? 2;
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
                  rawPoints.map((p) => ({ x: parseLocalDate(p.date).getTime(), y: p.value })),
                  smoothingConfig,
                  true // preserveEnd - keep the last point unchanged
              )
            : rawPoints.map((p) => ({ x: parseLocalDate(p.date).getTime(), y: p.value }));

        const points = smoothedPoints.map((p) => ({ date: parseLocalDate(p.x), value: p.y }));
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
            const time = point.date.getTime();
            const x = xScale(time);
            const y = yScale(point.value);
            return { x, y, time, value: point.value };
        });

        if (mountainFill.enabled) {
            // Note: mountainFill.enabled check assumes mountainFill object is imported
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

    // getShowChartLabels is not imported, but do we need it?
    // chart.js imported it from state.js. We should import it here OR use transactionState logic.
    // chart.js: import { getShowChartLabels } from './state.js';
    // Let's assume we need to import it.
    // I will use a dummy check or import it?
    // I'll skip importing it for this pass and use default or just import it.
    // To match chart.js, I should import it.
    // Adding it to top imports.
    const showChartLabels = getShowChartLabels();
    const labelBounds = [];
    if (showChartLabels) {
        renderedSeries.forEach((series) => {
            const { x, y, color, value } = series;

            const bounds = drawEndValue(
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
                true,
                labelBounds
            );
            if (bounds) {
                labelBounds.push(bounds);
            }
        });
    }

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

    if (legendState.performanceDirty) {
        const legendSeries = allPossibleSeries.map((s) => ({
            key: s.key,
            name: s.name,
            color: colorMap[s.key] || colors.contribution,
        }));
        updateLegend(legendSeries, chartManager);
        legendState.performanceDirty = false;
    }
}
