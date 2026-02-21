import { transactionState } from '../../state.js';
import { chartLayouts } from '../state.js';
import { CHART_LINE_WIDTHS } from '../../../config.js';
import {
    stopPerformanceAnimation,
    stopContributionAnimation,
    stopFxAnimation,
    stopPeAnimation,
    stopConcentrationAnimation,
    drawSeriesGlow,
} from '../animation.js';
import { updateLegend, drawCrosshairOverlay } from '../interaction.js';
import { drawAxes, drawEndValue, generateConcreteTicks } from '../core.js';
import { getChartColors, createTimeInterpolator, parseLocalDate } from '../helpers.js';

// Data cache
let yieldDataCache = null;
let yieldDataLoading = false;

/**
 * Load yield data from the backend JSON.
 */
export async function loadYieldData() {
    try {
        const response = await fetch('../data/yield_data.json');
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Main draw function for the yield chart.
 */
export async function drawYieldChart(ctx, chartManager) {
    const { canvas } = ctx;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const { chartDateRange } = transactionState;

    // Load data if not cached
    if (!yieldDataCache && !yieldDataLoading) {
        yieldDataLoading = true;
        yieldDataCache = await loadYieldData();
        yieldDataLoading = false;
        chartManager.update();
        return;
    }

    if (!yieldDataCache) {
        return;
    }

    // Filter data by date range
    const filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;

    const filteredData = yieldDataCache.filter((d) => {
        const date = parseLocalDate(d.date);
        return (!filterFrom || date >= filterFrom) && (!filterTo || date <= filterTo);
    });

    if (filteredData.length === 0) {
        return;
    }

    const margin = { top: 40, right: 60, bottom: 40, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const times = filteredData.map((d) => parseLocalDate(d.date).getTime());
    let minTime = times[0];
    const maxTime = times[times.length - 1];

    // Ensure minTime aligns with filter start for correct x-axis labels
    const filterFromTime = filterFrom ? filterFrom.getTime() : null;
    if (Number.isFinite(filterFromTime)) {
        minTime = Math.max(minTime, filterFromTime);
    }

    // Y-Axis 1: Forward Yield (%)
    const yields = filteredData.map((d) => d.forward_yield);
    const minY = 0;
    const maxY = Math.max(...yields, 1) * 1.1;

    // Y-Axis 2: TTM Income ($)
    const incomes = filteredData.map((d) => d.ttm_income);
    const minIncome = 0;
    const maxIncome = Math.max(...incomes, 100) * 1.1;

    const xScale = (t) => margin.left + ((t - minTime) / (maxTime - minTime || 1)) * chartWidth;
    const yScale = (y) => margin.top + chartHeight - ((y - minY) / (maxY - minY)) * chartHeight;
    const y2Scale = (i) =>
        margin.top + chartHeight - ((i - minIncome) / (maxIncome - minIncome)) * chartHeight;

    // Stop other animations
    stopPerformanceAnimation();
    stopContributionAnimation();
    stopFxAnimation();
    stopPeAnimation();
    stopConcentrationAnimation();

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Explicitly set text style for axes before calling drawAxes
    ctx.fillStyle = '#8b949e';

    // Draw axes
    drawAxes(
        ctx,
        margin,
        chartWidth,
        chartHeight,
        minTime,
        maxTime,
        minY,
        maxY,
        xScale,
        yScale,
        (v) => `${v.toFixed(1)}%`,
        false, // isPerformanceChart
        {}, // axisOptions
        'USD', // currency
        false // forcePercent
    );

    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);
    const isMobile = window.innerWidth <= 768;
    const monoFont =
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

    // 1. Draw Secondary Y-Axis (Right) for TTM Income
    ctx.save();
    ctx.fillStyle = '#8b949e';
    ctx.font = isMobile ? `9px ${monoFont}` : `11px ${monoFont}`;
    ctx.textAlign = 'left';

    // Select a few ticks for the income axis using standard tick generator
    const incomeTicks = generateConcreteTicks(minIncome, maxIncome, false, 'USD');

    // We only need the ticks that fit within the axis
    const validIncomeTicks = incomeTicks.filter((t) => t >= minIncome && t <= maxIncome);

    validIncomeTicks.forEach((tickVal) => {
        const y = y2Scale(tickVal);
        ctx.fillText(`$${Math.round(tickVal).toLocaleString()}`, margin.left + chartWidth + 10, y);
    });
    ctx.restore();

    // 2. Draw TTM Income Bars (Background)
    ctx.save();
    const barWidth = Math.max(2, (chartWidth / filteredData.length) * 0.8);
    ctx.fillStyle = (colors.contribution || '#b3b3b3') + '44'; // Semi-transparent
    filteredData.forEach((d) => {
        const t = parseLocalDate(d.date).getTime();
        const x = xScale(t) - barWidth / 2;
        const y = y2Scale(d.ttm_income);
        const h = Math.max(0, margin.top + chartHeight - y);
        if (h > 0) {
            ctx.fillRect(x, y, barWidth, h);
        }
    });
    ctx.restore();

    // 3. Draw Forward Yield Line
    ctx.beginPath();
    ctx.strokeStyle = colors.portfolio || '#7a7a7a';
    ctx.lineWidth = CHART_LINE_WIDTHS.main;
    filteredData.forEach((d, i) => {
        const t = parseLocalDate(d.date).getTime();
        const x = xScale(t);
        const y = yScale(d.forward_yield);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Series for interaction and legend
    const yieldSeries = {
        key: 'Yield',
        name: 'Yield',
        label: 'Forward Yield',
        color: colors.portfolio || '#7a7a7a',
        points: filteredData.map((d) => ({
            time: parseLocalDate(d.date).getTime(),
            value: d.forward_yield,
        })),
        getValueAtTime: createTimeInterpolator(
            filteredData.map((d) => ({
                time: parseLocalDate(d.date).getTime(),
                value: d.forward_yield,
            }))
        ),
        formatValue: (v) => `${v.toFixed(2)}%`,
    };

    const incomeSeries = {
        key: 'Income',
        name: 'Income',
        label: 'TTM Income',
        color: colors.contribution || '#b3b3b3',
        points: filteredData.map((d) => ({
            time: parseLocalDate(d.date).getTime(),
            value: d.ttm_income,
        })),
        getValueAtTime: createTimeInterpolator(
            filteredData.map((d) => ({
                time: parseLocalDate(d.date).getTime(),
                value: d.ttm_income,
            }))
        ),
        formatValue: (v) =>
            `${v.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })}`,
    };

    const series = [yieldSeries, incomeSeries];

    // Initialize chart layout for interaction system
    chartLayouts.yield = {
        key: 'yield',
        margin,
        chartBounds: {
            top: margin.top,
            bottom: margin.top + chartHeight,
            left: margin.left,
            right: margin.left + chartWidth,
        },
        chartWidth,
        chartHeight,
        minTime,
        maxTime,
        minY,
        maxY,
        xScale,
        yScale, // Main y-axis is yield
        invertX: (x) => minTime + ((x - margin.left) / chartWidth) * (maxTime - minTime),
        series,
    };

    // Ensure visibility state exists
    if (transactionState.chartVisibility['Yield'] === undefined) {
        transactionState.chartVisibility['Yield'] = true;
    }
    if (transactionState.chartVisibility['Income'] === undefined) {
        transactionState.chartVisibility['Income'] = true;
    }

    // Draw current value annotation
    const lastYield = yieldSeries.points[yieldSeries.points.length - 1].value;
    drawEndValue(
        ctx,
        margin.left + chartWidth + 5,
        yScale(lastYield),
        lastYield,
        yieldSeries.color,
        isMobile,
        margin,
        chartWidth,
        chartHeight,
        yieldSeries.formatValue,
        true
    );

    // Add glowing effect to the line
    drawSeriesGlow(ctx, yieldSeries.points, yieldSeries.color, xScale, yScale);

    // Update UI components
    updateLegend(series, chartManager);
    drawCrosshairOverlay(ctx, series, chartLayouts.yield);
}
