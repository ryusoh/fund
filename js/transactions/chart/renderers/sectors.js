import { transactionState } from '../../state.js';
import { chartLayouts } from '../state.js';
import { loadSectorsSnapshotData } from '../../dataLoader.js';
import {
    stopPerformanceAnimation,
    stopContributionAnimation,
    stopFxAnimation,
} from '../animation.js';
import { updateCrosshairUI, updateLegend, drawCrosshairOverlay } from '../interaction.js';
import { drawAxes } from '../core.js';
import {
    createTimeInterpolator,
    clampTime,
    formatPercentInline,
    parseLocalDate,
} from '../helpers.js';
import {
    formatCurrencyInlineValue,
    formatCurrencyCompact,
    convertValueToCurrency,
} from '../../utils.js';
import { COLOR_PALETTES } from '../../../config.js';

let sectorsDataCache = null;
let sectorsDataLoading = false;

function renderSectorsChartWithMode(ctx, chartManager, data, options = {}) {
    const valueMode = options.valueMode === 'absolute' ? 'absolute' : 'percent';

    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray(data.dates) ||
        data.dates.length === 0
    ) {
        chartLayouts.sectors = null;
        chartLayouts.sectorsAbs = null;
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
    const rawSeries = data.series || {};
    const selectedCurrency = transactionState.selectedCurrency || 'USD';

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;

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
            chartLayouts.sectorsAbs = null;
        } else {
            chartLayouts.sectors = null;
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

    const totalValuesUsd = mappedTotalValues;
    const totalValuesConverted = totalValuesUsd.map((value, idx) => {
        const converted = convertValueToCurrency(value, dates[idx], selectedCurrency);
        return Number.isFinite(converted) ? converted : 0;
    });

    const percentSeriesMap = {};
    const chartData = {};
    Object.entries(rawSeries).forEach(([sector, values]) => {
        const arr = Array.isArray(values) ? values : [];
        const mappedPercent =
            filteredIndices.length > 0
                ? filteredIndices.map((i) => Number(arr[i] ?? 0))
                : arr.map((value) => Number(value ?? 0));

        percentSeriesMap[sector] = mappedPercent;
        if (valueMode === 'absolute') {
            chartData[sector] = mappedPercent.map(
                (pct, idx) => ((totalValuesConverted[idx] ?? 0) * pct) / 100
            );
        } else {
            chartData[sector] = mappedPercent;
        }
    });

    const baseSectorOrder = Object.keys(chartData).sort((a, b) => {
        const arrA = chartData[a] || [];
        const arrB = chartData[b] || [];
        const lastA = arrA[arrA.length - 1] ?? 0;
        const lastB = arrB[arrB.length - 1] ?? 0;
        return lastB - lastA;
    });

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
        return;
    }

    const colors = COLOR_PALETTES.COMPOSITION_CHART_COLORS;
    const resolveSectorColor = (sector) => {
        const index = baseSectorOrder.indexOf(sector);
        return colors[index % colors.length];
    };

    const dateTimes = dates.map((dateStr) => new Date(dateStr).getTime());
    let minTime = Math.min(...dateTimes);
    const maxTime = Math.max(...dateTimes);

    const filterFromTime = filterFrom ? filterFrom.getTime() : null;
    if (Number.isFinite(filterFromTime)) {
        minTime = Math.max(minTime, filterFromTime);
    }

    const xScale = (time) =>
        padding.left +
        (maxTime === minTime
            ? plotWidth / 2
            : ((time - minTime) / (maxTime - minTime)) * plotWidth);

    const yMin = 0;
    const maxTotalValue = Math.max(...totalValuesConverted, 0);
    const yMax = valueMode === 'absolute' ? Math.max(maxTotalValue, 1) : 100;
    const yScale = (value) =>
        padding.top + plotHeight - ((value - yMin) / (yMax - yMin || 1)) * plotHeight;

    const axisFormatter =
        valueMode === 'absolute'
            ? (val) => formatCurrencyCompact(val, { currency: selectedCurrency })
            : (val) => `${val}%`;

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
    baseSectorOrder.forEach((sector) => {
        const values = chartData[sector] || [];
        const color = resolveSectorColor(sector);
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
    const legendSeries = baseSectorOrder
        .map((sector) => ({
            sector,
            percent: percentSeriesMap[sector][latestIndex] ?? 0,
        }))
        .filter((s) => s.percent > 0.1)
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 4)
        .map((s) => ({
            key: s.sector,
            name: s.sector,
            color: resolveSectorColor(s.sector),
        }));

    const seriesForCrosshair = baseSectorOrder.map((sector) => {
        const values = chartData[sector];
        const points = dateTimes.map((time, idx) => ({
            time,
            value: values[idx],
        }));
        return {
            key: sector,
            label: sector,
            color: resolveSectorColor(sector),
            getValueAtTime: createTimeInterpolator(points),
            formatValue: (value) =>
                valueMode === 'absolute'
                    ? formatCurrencyInlineValue(value, selectedCurrency)
                    : `${value.toFixed(2)}%`,
            formatDelta: (delta) =>
                valueMode === 'absolute'
                    ? formatCurrencyInlineValue(delta, selectedCurrency)
                    : formatPercentInline(delta),
        };
    });

    const totalValuePoints = dateTimes.map((time, idx) => ({
        time,
        value: Number(totalValuesConverted[idx] ?? 0),
    }));

    const layoutKey = valueMode === 'absolute' ? 'sectorsAbs' : 'sectors';
    chartLayouts[layoutKey] = {
        key: layoutKey,
        minTime,
        maxTime,
        valueType: valueMode === 'absolute' ? 'currency' : 'percent',
        valueMode,
        currency: selectedCurrency,
        stackMaxValue: yMax,
        padding,
        chartBounds: {
            top: padding.top,
            bottom: padding.top + plotHeight,
            left: padding.left,
            right: padding.left + plotWidth,
        },
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
        series: seriesForCrosshair,
        percentSeriesMap,
        dates,
        getTotalValueAtTime: createTimeInterpolator(totalValuePoints),
    };

    drawCrosshairOverlay(ctx, chartLayouts[layoutKey]);
    updateLegend(legendSeries, chartManager);
}

function drawSectorsChartLoader(ctx, chartManager, valueMode) {
    stopPerformanceAnimation();
    stopContributionAnimation();
    stopFxAnimation();
    const emptyState = document.getElementById('runningAmountEmpty');

    if (!sectorsDataCache && sectorsDataLoading) {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    if (sectorsDataCache) {
        renderSectorsChartWithMode(ctx, chartManager, sectorsDataCache, { valueMode });
        return;
    }

    sectorsDataLoading = true;
    loadSectorsSnapshotData()
        .then((data) => {
            if (!data) {
                throw new Error('Failed to load sectors data');
            }
            sectorsDataCache = data;
            renderSectorsChartWithMode(ctx, chartManager, data, { valueMode });
        })
        .catch(() => {
            updateCrosshairUI(null, null);
            if (emptyState) {
                emptyState.style.display = 'block';
            }
        })
        .finally(() => {
            sectorsDataLoading = false;
        });
}

export function drawSectorsChart(ctx, chartManager) {
    drawSectorsChartLoader(ctx, chartManager, 'percent');
}

export function drawSectorsAbsoluteChart(ctx, chartManager) {
    drawSectorsChartLoader(ctx, chartManager, 'absolute');
}
