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
import { getChartColors, createTimeInterpolator, clampTime, parseLocalDate } from '../helpers.js';
import { chartLayouts } from '../state.js';
import { drawSeriesGlow } from '../animation.js';

export async function drawBetaChart(ctx, chartManager, timestamp) {
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
        chartLayouts.beta = null;
        updateCrosshairUI(null, null);
        return;
    }

    const MARKET_REF = '^GSPC';
    if (!performanceSeries[MARKET_REF]) {
        stopPerformanceAnimation();
        chartLayouts.beta = null;
        return;
    }

    // Limit to DJI, GSPC, IXIC + Portfolio
    const allowedBenchmarks = ['^GSPC', '^IXIC', '^DJI'];
    const orderedKeys = Object.keys(performanceSeries)
        .filter((k) => k === '^LZ' || allowedBenchmarks.includes(k))
        .sort((a, b) => {
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

    // Enforce "one benchmark" rule
    const visibleBenchmarks = allowedBenchmarks.filter(
        (b) => transactionState.chartVisibility[b] === true
    );
    if (visibleBenchmarks.length > 1) {
        visibleBenchmarks.slice(1).forEach((b) => {
            transactionState.chartVisibility[b] = false;
        });
    }

    // 1. Calculate daily returns
    const returnsMap = {};
    orderedKeys.forEach((key) => {
        const points = performanceSeries[key] || [];
        const sourceCurrency = PERFORMANCE_SERIES_CURRENCY[key] || 'USD';
        const returns = [];
        for (let i = 1; i < points.length; i++) {
            const startVal = convertBetweenCurrencies(
                Number(points[i - 1].value),
                sourceCurrency,
                points[i - 1].date,
                selectedCurrency
            );
            const endVal = convertBetweenCurrencies(
                Number(points[i].value),
                sourceCurrency,
                points[i].date,
                selectedCurrency
            );
            if (startVal !== 0) {
                returns.push({
                    date: points[i].date,
                    time: parseLocalDate(points[i].date).getTime(),
                    val: endVal / startVal - 1,
                });
            }
        }
        returnsMap[key] = returns;
    });

    const marketReturns = returnsMap[MARKET_REF];
    if (!marketReturns || marketReturns.length < 20) {
        chartLayouts.beta = null;
        return;
    }

    // 2. Calculate rolling 6-month Beta (126 trading days)
    const windowSize = 126;
    const allPossibleSeries = orderedKeys
        .map((key) => {
            const assetReturns = returnsMap[key];
            if (!assetReturns) {
                return null;
            }

            const assetReturnMap = new Map(assetReturns.map((r) => [r.date, r.val]));
            const betaData = [];

            // Master timeline from market returns
            for (let i = windowSize - 1; i < marketReturns.length; i++) {
                const mWindow = marketReturns.slice(i - windowSize + 1, i + 1);

                if (key === MARKET_REF) {
                    betaData.push({ date: marketReturns[i].date, value: 1.0 });
                    continue;
                }

                const aValues = [];
                const mValues = [];

                mWindow.forEach((mR) => {
                    const aVal = assetReturnMap.get(mR.date);
                    if (aVal !== undefined) {
                        mValues.push(mR.val);
                        aValues.push(aVal);
                    }
                });

                if (aValues.length < windowSize * 0.8) {
                    continue;
                }

                const n = aValues.length;
                const mMean = mValues.reduce((a, b) => a + b, 0) / n;
                const aMean = aValues.reduce((a, b) => a + b, 0) / n;

                let cov = 0;
                let mVar = 0;
                for (let j = 0; j < n; j++) {
                    const mDiff = mValues[j] - mMean;
                    cov += (aValues[j] - aMean) * mDiff;
                    mVar += mDiff * mDiff;
                }

                const beta = mVar < 1e-12 ? 0 : cov / mVar;
                betaData.push({
                    date: marketReturns[i].date,
                    value: beta,
                });
            }

            return {
                key,
                name: key,
                data: betaData,
            };
        })
        .filter((s) => s && s.data.length > 0);

    const visibility = chartVisibility || {};
    const seriesToDraw = allPossibleSeries.filter((s) => visibility[s.key] !== false);

    if (seriesToDraw.length === 0) {
        stopPerformanceAnimation();
        chartLayouts.beta = null;
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
    const yPadding = Math.max(valueRange * 0.1, 0.2);
    const yMin = Math.max(0, dataMin - yPadding);
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
        (v) => v.toFixed(1),
        true
    );

    // Draw reference line at Beta = 1.0
    const y1 = yScale(1.0);
    if (y1 >= padding.top && y1 <= padding.top + plotHeight) {
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, y1);
        ctx.lineTo(padding.left + plotWidth, y1);
        ctx.stroke();
        ctx.restore();
    }

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

    const seriesForDrawing = filteredSeries.slice().sort((a, b) => {
        if (a.key === '^LZ') {
            return 1;
        }
        if (b.key === '^LZ') {
            return -1;
        }
        return 0;
    });

    seriesForDrawing.forEach((series) => {
        if (series.data.length === 0) {
            return;
        }

        // Use raw points for Beta to ensure statistical accuracy (no smoothing)
        const points = series.data.map((p) => ({ date: parseLocalDate(p.date), value: p.value }));

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
            drawMountainFill(ctx, coords, yScale(yMin), {
                color: resolvedColor,
                colorStops: gradientStops || [resolvedColor, resolvedColor],
                opacityTop: 0.2,
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

    if (getShowChartLabels()) {
        renderedSeries.forEach((s) => {
            drawEndValue(
                ctx,
                s.x,
                s.y,
                s.value,
                s.color,
                isMobile,
                padding,
                plotWidth,
                plotHeight,
                (v) => v.toFixed(2),
                true,
                []
            );
        });
    }

    chartLayouts.beta = {
        key: 'beta',
        minTime,
        maxTime,
        valueType: 'number',
        padding,
        chartBounds,
        xScale,
        yScale,
        invertX: (pixelX) => {
            const clampedX = Math.max(padding.left, Math.min(padding.left + plotWidth, pixelX));
            const ratio = (clampedX - padding.left) / plotWidth;
            return clampTime(minTime + ratio * (maxTime - minTime), minTime, maxTime);
        },
        series: renderedSeries.map((s) => ({
            key: s.key,
            label: `${s.name}`,
            color: s.color,
            getValueAtTime: createTimeInterpolator(s.points),
            formatValue: (v) => v.toFixed(3),
        })),
    };

    drawCrosshairOverlay(ctx, chartLayouts.beta);

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
