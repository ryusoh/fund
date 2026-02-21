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
import { drawSeriesGlow } from '../animation.js';

export async function drawRollingChart(ctx, chartManager, timestamp) {
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
        chartLayouts.rolling = null;
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

    // Transform cumulative TWRR into rolling 1Y returns
    const allPossibleSeries = orderedKeys.map((key) => {
        const points = Array.isArray(performanceSeries[key]) ? performanceSeries[key] : [];
        const sourceCurrency = PERFORMANCE_SERIES_CURRENCY[key] || 'USD';

        const rollingData = [];
        for (let i = 0; i < points.length; i++) {
            const currentPoint = points[i];
            const currentDate = parseLocalDate(currentPoint.date);
            const oneYearAgo = new Date(currentDate);
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            // Finding point closest to 1 year ago
            let startPoint = null;
            // Optimistic search: points are chronological.
            // We can search backwards from current index.
            for (let j = i - 1; j >= 0; j--) {
                const d = parseLocalDate(points[j].date);
                if (d <= oneYearAgo) {
                    startPoint = points[j];
                    break;
                }
            }

            if (startPoint && startPoint.value !== 0) {
                const startVal = convertBetweenCurrencies(
                    Number(startPoint.value),
                    sourceCurrency,
                    startPoint.date,
                    selectedCurrency
                );
                const endVal = convertBetweenCurrencies(
                    Number(currentPoint.value),
                    sourceCurrency,
                    currentPoint.date,
                    selectedCurrency
                );
                const rollingReturn = (endVal / startVal - 1) * 100;
                rollingData.push({
                    date: currentPoint.date,
                    value: rollingReturn,
                });
            }
        }

        return {
            key,
            name: key,
            data: rollingData,
        };
    });

    const visibility = chartVisibility || {};
    const seriesToDraw = allPossibleSeries.filter((s) => visibility[s.key] !== false);

    if (seriesToDraw.length === 0) {
        stopPerformanceAnimation();
        chartLayouts.rolling = null;
        updateCrosshairUI(null, null);
        return;
    }

    const canvas = ctx.canvas;
    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 50 }
        : { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvas.offsetWidth - padding.left - padding.right;
    const plotHeight = canvas.offsetHeight - padding.top - padding.bottom;

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;

    const filteredSeries = seriesToDraw.map((s) => ({
        ...s,
        data: s.data.filter((d) => {
            const dt = parseLocalDate(d.date);
            return (!filterFrom || dt >= filterFrom) && (!filterTo || dt <= filterTo);
        }),
    }));

    const allPoints = filteredSeries.flatMap((s) => s.data);
    if (allPoints.length === 0) {
        stopPerformanceAnimation();
        return;
    }

    const allTimes = allPoints.map((p) => parseLocalDate(p.date).getTime());
    let minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);

    const filterFromTime = filterFrom ? filterFrom.getTime() : null;
    if (Number.isFinite(filterFromTime)) {
        minTime = Math.max(minTime, filterFromTime);
    }

    const allValues = allPoints.map((p) => p.value);
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const valueRange = dataMax - dataMin;
    const yPadding = Math.max(valueRange * 0.1, 5);
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

    const lineThickness = CHART_LINE_WIDTHS.performance ?? 2;
    const renderedSeries = [];
    let glowIndex = 0;

    const chartBounds = {
        top: padding.top,
        bottom: padding.top + plotHeight,
        left: padding.left,
        right: padding.left + plotWidth,
    };

    const baselineY = yScale(0);
    const seriesForDrawing = filteredSeries.slice().sort((a, b) => {
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

    seriesForDrawing.forEach((series) => {
        if (series.data.length === 0) {
            return;
        }

        const rawPoints = series.data;
        const smoothingConfig = getSmoothingConfig('performance');
        const points = smoothingConfig
            ? smoothFinancialData(
                  rawPoints.map((p) => ({ x: parseLocalDate(p.date).getTime(), y: p.value })),
                  smoothingConfig,
                  true
              ).map((p) => ({ date: parseLocalDate(p.x), value: p.y }))
            : rawPoints.map((p) => ({ date: parseLocalDate(p.date), value: p.value }));

        const gradientStops = BENCHMARK_GRADIENTS[series.key];
        const resolvedColor = gradientStops
            ? gradientStops[1]
            : colorMap[series.key] || colors.contribution;

        const coords = points.map((p) => ({
            x: xScale(p.date.getTime()),
            y: yScale(p.value),
            time: p.date.getTime(),
            value: p.value,
        }));

        if (mountainFill.enabled) {
            drawMountainFill(ctx, coords, baselineY, {
                color: resolvedColor,
                colorStops: gradientStops || [resolvedColor, resolvedColor],
                opacityTop: 0.35,
                opacityBottom: 0,
                bounds: chartBounds,
            });
        }

        ctx.beginPath();
        coords.forEach((c, idx) => {
            if (idx === 0) {
                ctx.moveTo(c.x, c.y);
            } else {
                ctx.lineTo(c.x, c.y);
            }
        });
        ctx.strokeStyle = resolvedColor;
        if (gradientStops) {
            const grad = ctx.createLinearGradient(padding.left, 0, padding.left + plotWidth, 0);
            grad.addColorStop(0, gradientStops[0]);
            grad.addColorStop(1, gradientStops[1]);
            ctx.strokeStyle = grad;
        }
        ctx.lineWidth = lineThickness;
        ctx.stroke();

        renderedSeries.push({
            key: series.key,
            name: series.name,
            color: resolvedColor,
            x: coords[coords.length - 1].x,
            y: coords[coords.length - 1].y,
            value: points[points.length - 1].value,
            coords,
            points: coords.map((c) => ({ time: c.time, value: c.value })),
        });

        if (isAnimationEnabled('performance')) {
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

    if (isAnimationEnabled('performance') && glowIndex > 0) {
        schedulePerformanceAnimation(chartManager);
    } else {
        stopPerformanceAnimation();
    }

    const showChartLabels = getShowChartLabels();
    const labelBounds = [];
    if (showChartLabels) {
        renderedSeries.forEach((s) => {
            const bounds = drawEndValue(
                ctx,
                s.x,
                s.y,
                s.value,
                s.color,
                isMobile,
                padding,
                plotWidth,
                plotHeight,
                (v) => `${v.toFixed(1)}%`,
                true,
                labelBounds
            );
            if (bounds) {
                labelBounds.push(bounds);
            }
        });
    }

    chartLayouts.rolling = {
        key: 'rolling',
        minTime,
        maxTime,
        valueType: 'percent',
        padding,
        chartBounds,
        xScale,
        yScale,
        invertX: (pixelX) => {
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
            getValueAtTime: createTimeInterpolator(s.points),
            formatValue: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
            formatDelta: (delta, percent) => formatPercentInline(percent ?? delta),
        })),
    };

    drawCrosshairOverlay(ctx, chartLayouts.rolling);

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
