import { transactionState, getShowChartLabels } from '../../state.js';
import {
    stopPerformanceAnimation,
    stopContributionAnimation,
    stopFxAnimation,
    scheduleFxAnimation,
    advanceFxAnimation,
    isAnimationEnabled,
    drawSeriesGlow,
} from '../animation.js';
import { updateCrosshairUI, drawCrosshairOverlay, updateLegend } from '../interaction.js';
import { FX_CURRENCY_ORDER, FX_LINE_COLORS, FX_GRADIENTS } from '../config.js';
import { CHART_LINE_WIDTHS, mountainFill } from '../../../config.js';
import { convertBetweenCurrencies } from '../../utils.js';
import { drawAxes, drawMountainFill, drawEndValue, computePercentTickInfo } from '../core.js';
import {
    getSmoothingConfig,
    createTimeInterpolator,
    formatPercentInline,
    formatFxValue,
    clampTime,
    lightenColor,
    darkenColor,
    parseLocalDate,
} from '../helpers.js';
import { smoothFinancialData } from '../../../utils/smoothing.js';
import { chartLayouts } from '../state.js';

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

export function drawFxChart(ctx, chartManager, timestamp) {
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
    let filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;

    if (!filterFrom) {
        // If no explicit filter (like 'all'), clamp to the exact first date of the portfolio.
        // This ensures the 0% baseline and the x-axis start match the other portfolio charts.
        let earliestTime = null;
        if (transactionState.portfolioSeries && transactionState.portfolioSeries.length > 0) {
            const firstDate =
                transactionState.portfolioSeries[0].date ||
                transactionState.portfolioSeries[0].tradeDate;
            const parsed = new Date(firstDate);
            if (!Number.isNaN(parsed.getTime())) {
                earliestTime = parsed.getTime();
            }
        }
        if (earliestTime !== null) {
            filterFrom = new Date(earliestTime);
        } else {
            // Safe fallback if portfolio data is inexplicably absent
            filterFrom = new Date(Date.UTC(new Date().getFullYear(), 0, 1));
        }
    }

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

    // Ensure minTime aligns with filter start for correct x-axis labels
    const filterFromTime = filterFrom ? filterFrom.getTime() : null;
    if (Number.isFinite(filterFromTime)) {
        minTime = Math.max(minTime, filterFromTime);
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
    const labelBounds = [];
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
            const bounds = drawEndValue(
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
                true,
                labelBounds
            );
            if (bounds) {
                labelBounds.push(bounds);
            }
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
