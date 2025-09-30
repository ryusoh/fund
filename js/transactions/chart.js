import {
    transactionState,
    setRunningAmountSeries,
    setPortfolioSeries,
    setChartVisibility,
} from './state.js';
import { formatCurrencyCompact } from './utils.js';

// --- Helper Functions ---

function getChartColors(rootStyles) {
    return {
        portfolio: rootStyles.getPropertyValue('--portfolio-line').trim() || '#666666',
        contribution: rootStyles.getPropertyValue('--contribution-line').trim() || '#b3b3b3',
        sp500: rootStyles.getPropertyValue('--sp500-line').trim() || '#ef553b',
        nasdaq: rootStyles.getPropertyValue('--nasdaq-line').trim() || '#00d5ff',
        world: rootStyles.getPropertyValue('--world-line').trim() || '#e8a824',
        buy: 'rgba(48, 209, 88, 0.8)',
        sell: 'rgba(255, 69, 58, 0.8)',
        buyFill: 'rgba(48, 209, 88, 0.45)',
        sellFill: 'rgba(255, 69, 58, 0.45)',
    };
}

function updateLegend(series, chartManager) {
    const legendContainer = document.querySelector('.chart-legend');
    if (!legendContainer) {
        return;
    }

    legendContainer.innerHTML = ''; // Clear existing legend

    series.forEach((s) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.dataset.series = s.key;

        const swatch = document.createElement('span');
        swatch.className = 'legend-swatch';
        swatch.style.backgroundColor = s.color;

        const label = document.createElement('span');
        label.textContent = s.name;

        item.appendChild(swatch);
        item.appendChild(label);

        item.addEventListener('click', () => {
            const disabled = item.classList.toggle('legend-disabled');
            setChartVisibility(s.key, !disabled);
            if (typeof chartManager.redraw === 'function') {
                chartManager.redraw();
            }
        });

        if (transactionState.chartVisibility[s.key] === false) {
            item.classList.add('legend-disabled');
        }

        legendContainer.appendChild(item);
    });
}

function drawMarker(context, x, y, radius, isBuy, colors, chartBounds) {
    // Clamp Y position to stay within chart bounds
    const clampedY = Math.max(chartBounds.top + radius, Math.min(y, chartBounds.bottom - radius));

    context.beginPath();
    context.arc(x, clampedY, radius, 0, Math.PI * 2);
    context.fillStyle = isBuy ? colors.buyFill : colors.sellFill;
    context.strokeStyle = isBuy ? colors.buy : colors.sell;
    context.lineWidth = 1;
    context.fill();
    context.stroke();
}

function generateConcreteTicks(yMin, yMax, isPerformanceChart) {
    if (isPerformanceChart) {
        // Performance chart: use percentage ticks with adaptive spacing
        const ticks = [];
        const range = yMax - yMin;

        // Determine appropriate tick spacing based on data range
        let tickSpacing, startTick, endTick;

        if (range <= 20) {
            // Very small range: 5% increments
            tickSpacing = 5;
            startTick = Math.floor(yMin / 5) * 5;
            endTick = Math.ceil(yMax / 5) * 5;
        } else if (range <= 50) {
            // Small range: 10% increments
            tickSpacing = 10;
            startTick = Math.floor(yMin / 10) * 10;
            endTick = Math.ceil(yMax / 10) * 10;
        } else if (range <= 100) {
            // Medium range: 20% increments
            tickSpacing = 20;
            startTick = Math.floor(yMin / 20) * 20;
            endTick = Math.ceil(yMax / 20) * 20;
        } else {
            // Large range: 50% increments
            tickSpacing = 50;
            startTick = Math.floor(yMin / 50) * 50;
            endTick = Math.ceil(yMax / 50) * 50;
        }

        // Generate ticks
        for (let i = startTick; i <= endTick; i += tickSpacing) {
            ticks.push(i);
        }

        return ticks.filter((tick) => tick >= yMin && tick <= yMax);
    }
    // Contribution chart: use currency ticks with adaptive spacing
    const ticks = [];

    // Determine appropriate tick spacing based on data range
    const range = yMax - yMin;
    let tickSpacing, startTick, endTick;

    if (range <= 50000) {
        // Very small range: 10k increments
        tickSpacing = 10000;
        startTick = Math.max(0, Math.floor(yMin / 10000) * 10000);
        endTick = Math.ceil(yMax / 10000) * 10000;
    } else if (range <= 200000) {
        // Small range: 25k increments
        tickSpacing = 25000;
        startTick = Math.max(0, Math.floor(yMin / 25000) * 25000);
        endTick = Math.ceil(yMax / 25000) * 25000;
    } else if (range <= 500000) {
        // Medium-small range: 50k increments
        tickSpacing = 50000;
        startTick = Math.max(0, Math.floor(yMin / 50000) * 50000);
        endTick = Math.ceil(yMax / 50000) * 50000;
    } else if (range <= 2000000) {
        // Medium range: 250k increments
        tickSpacing = 250000;
        startTick = Math.max(0, Math.floor(yMin / 250000) * 250000);
        endTick = Math.ceil(yMax / 250000) * 250000;
    } else {
        // Large range: 500k increments
        tickSpacing = 500000;
        startTick = Math.max(0, Math.floor(yMin / 500000) * 500000);
        endTick = Math.ceil(yMax / 500000) * 500000;
    }

    // Generate ticks
    for (let i = startTick; i <= endTick; i += tickSpacing) {
        ticks.push(i);
    }

    return ticks.filter((tick) => tick >= yMin && tick <= yMax);
}

function generateYearBasedTicks(minTime, maxTime) {
    const ticks = [];
    const startDate = new Date(minTime);
    const endDate = new Date(maxTime);
    const isMobile = window.innerWidth <= 768;

    const formatYear = (year) => {
        return isMobile ? `'${String(year).slice(2)}` : year;
    };

    // Calculate data span in months
    const dataSpanMonths =
        (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1;

    // Check if data is within a single year (same year OR spans ≤15 months)
    const isSingleYear = startDate.getFullYear() === endDate.getFullYear() || dataSpanMonths <= 15;

    if (isSingleYear) {
        // Single year: show quarterly ticks for the year
        let year;
        if (startDate.getFullYear() !== endDate.getFullYear()) {
            const endOfStartYear = new Date(startDate.getFullYear(), 11, 31);
            const startOfEndYear = new Date(endDate.getFullYear(), 0, 1);
            const timeInStartYear = endOfStartYear.getTime() - startDate.getTime();
            const timeInEndYear = endDate.getTime() - startOfEndYear.getTime();
            if (timeInEndYear > timeInStartYear) {
                year = endDate.getFullYear();
            } else {
                year = startDate.getFullYear();
            }
        } else {
            year = startDate.getFullYear();
        }
        const formattedYear = formatYear(year);
        const quarters = [
            { month: 0, label: `Jan ${formattedYear}`, isYearStart: true },
            { month: 3, label: `Apr ${formattedYear}`, isYearStart: false },
            { month: 6, label: `Jul ${formattedYear}`, isYearStart: false },
            { month: 9, label: `Oct ${formattedYear}`, isYearStart: false },
        ];

        quarters.forEach((q) => {
            const quarterDate = new Date(year, q.month, 1).getTime();
            // Always include quarterly ticks for the year, even if slightly outside the range
            if (
                quarterDate >= minTime - 30 * 24 * 60 * 60 * 1000 &&
                quarterDate <= maxTime + 30 * 24 * 60 * 60 * 1000
            ) {
                ticks.push({
                    time: quarterDate,
                    label: q.label,
                    isYearStart: q.isYearStart,
                });
            }
        });
    } else {
        // Multi-year: show Jan for each year
        for (let year = startDate.getFullYear(); year <= endDate.getFullYear(); year++) {
            const jan1 = new Date(year, 0, 1).getTime();
            if (jan1 >= minTime && jan1 <= maxTime) {
                ticks.push({
                    time: jan1,
                    label: `Jan ${formatYear(year)}`,
                    isYearStart: true,
                });
            }
        }
    }

    // Add end date
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
    const endYear = endDate.getFullYear();
    ticks.push({
        time: maxTime,
        label: `${endMonth} ${formatYear(endYear)}`,
        isYearStart: false,
    });

    // Sort ticks by time
    ticks.sort((a, b) => a.time - b.time);

    return ticks;
}

function drawAxes(
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
    isPerformanceChart = false
) {
    const isMobile = window.innerWidth <= 768;

    // Generate concrete tick values
    const ticks = generateConcreteTicks(yMin, yMax, isPerformanceChart);

    // Y-axis grid lines and labels
    ticks.forEach((value) => {
        const y = yScale(value);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + plotWidth, y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.stroke();
        ctx.fillStyle = '#8b949e';
        ctx.font = isMobile ? '10px var(--font-family-mono)' : '12px var(--font-family-mono)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(yLabelFormatter(value), padding.left - (isMobile ? 8 : 10), y);
    });

    // X-axis line
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + plotHeight);
    ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Generate year-based x-axis ticks
    const yearTicks = generateYearBasedTicks(minTime, maxTime);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = isMobile ? '10px var(--font-family-mono)' : '12px var(--font-family-mono)';

    yearTicks.forEach((tick, index) => {
        const x = xScale(tick.time);

        // Prevent label collision on mobile by hiding the last tick if it's too close to the previous one
        if (isMobile && index === yearTicks.length - 1) {
            const prevTickX = xScale(yearTicks[index - 1].time);
            if (x - prevTickX < 40) {
                return; // Skip the last tick
            }
        }

        // Set text alignment based on tick position
        if (index === 0) {
            ctx.textAlign = 'left';
        } else if (index === yearTicks.length - 1) {
            ctx.textAlign = 'right';
        } else {
            ctx.textAlign = 'center';
        }

        // Draw tick mark
        ctx.beginPath();
        ctx.moveTo(x, padding.top + plotHeight);
        ctx.lineTo(x, padding.top + plotHeight + (isMobile ? 4 : 6));
        ctx.stroke();

        // Draw label
        ctx.fillText(tick.label, x, padding.top + plotHeight + (isMobile ? 8 : 10));

        // Draw vertical dashed line for year/quarter boundaries (but not at chart boundaries)
        if (tick.isYearStart && x > padding.left + 5 && x < padding.left + plotWidth - 5) {
            ctx.beginPath();
            ctx.setLineDash([3, 3]); // Dashed line
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + plotHeight);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.stroke();
            ctx.setLineDash([]); // Reset to solid line
        }

        // Draw dashed lines for quarterly boundaries (Apr, Jul, Oct)
        if (x > padding.left + 5 && x < padding.left + plotWidth - 5) {
            if (
                tick.label.includes('Apr') ||
                tick.label.includes('Jul') ||
                tick.label.includes('Oct')
            ) {
                ctx.beginPath();
                ctx.setLineDash([2, 2]); // Shorter dashes for quarters
                ctx.moveTo(x, padding.top);
                ctx.lineTo(x, padding.top + plotHeight);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; // Lighter for quarters
                ctx.stroke();
                ctx.setLineDash([]); // Reset to solid line
            }
        }
    });
}

// --- Chart Drawing Functions ---

function drawContributionChart(ctx, chartManager) {
    const { runningAmountSeries, portfolioSeries, chartVisibility } = transactionState;
    const visibility = chartVisibility || {};
    const showContribution = visibility.contribution !== false;
    const showBalance = visibility.balance !== false;
    const showBuy = visibility.buy !== false;
    const showSell = visibility.sell !== false;

    const canvas = ctx.canvas;
    const emptyState = document.getElementById('runningAmountEmpty');

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? new Date(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? new Date(chartDateRange.to) : null;

    const filterDataByDateRange = (data) => {
        return data.filter((item) => {
            const itemDate = new Date(item.date);
            return (!filterFrom || itemDate >= filterFrom) && (!filterTo || itemDate <= filterTo);
        });
    };

    const contributionData = filterDataByDateRange(
        (runningAmountSeries || [])
            .map((item) => ({ ...item, date: new Date(item.tradeDate) }))
            .filter((item) => !isNaN(item.date.getTime()))
    );
    const balanceData = filterDataByDateRange(
        (portfolioSeries || [])
            .map((item) => ({ ...item, date: new Date(item.date) }))
            .filter((item) => !isNaN(item.date.getTime()))
    );

    if (contributionData.length === 0 && balanceData.length === 0) {
        return;
    }
    emptyState.style.display = 'none';

    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 50 }
        : { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvas.offsetWidth - padding.left - padding.right;
    const plotHeight = canvas.offsetHeight - padding.top - padding.bottom;

    const allTimes = [
        ...contributionData.map((d) => d.date.getTime()),
        ...balanceData.map((d) => d.date.getTime()),
    ];
    const minTime = Math.min(...allTimes);
    // If we have a date range filter, use only the filtered data range
    // Otherwise, extend to today for real-time data
    const maxTime =
        filterFrom || filterTo
            ? Math.max(...allTimes)
            : Math.max(new Date().setHours(0, 0, 0, 0), ...allTimes);

    const contributionMax =
        contributionData.length > 0 ? Math.max(...contributionData.map((item) => item.amount)) : 0;
    const balanceMax =
        balanceData.length > 0 ? Math.max(...balanceData.map((item) => item.value)) : 0;
    const yMax = Math.max(contributionMax, balanceMax, 0) * 1.15 || 1;
    const yMin = 0;

    const xScale = (t) =>
        padding.left +
        (maxTime === minTime ? plotWidth / 2 : ((t - minTime) / (maxTime - minTime)) * plotWidth);
    const yScale = (v) => padding.top + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;

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
        formatCurrencyCompact,
        false // isPerformanceChart
    );

    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);

    // Draw Lines
    if (showContribution && contributionData.length > 0) {
        ctx.beginPath();
        contributionData.forEach((item, index) => {
            const x = xScale(item.date.getTime());
            const y = yScale(item.amount);
            index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = colors.contribution;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // --- Draw Markers ---
    const pointSeries = contributionData.filter((item) => {
        const type = item.orderType.toLowerCase();
        return (type === 'buy' && showBuy) || (type === 'sell' && showSell);
    });

    const grouped = new Map();
    pointSeries.forEach((item) => {
        const timestamp = item.date.getTime();
        if (!grouped.has(timestamp)) {
            grouped.set(timestamp, { buys: [], sells: [] });
        }
        const group = grouped.get(timestamp);
        const radius = Math.min(8, Math.max(2, Math.abs(item.netAmount) / 500));
        if (item.orderType.toLowerCase() === 'buy') {
            group.buys.push({ radius, amount: item.amount });
        } else {
            group.sells.push({ radius, amount: item.amount });
        }
    });

    // Define chart bounds for marker clamping
    const chartBounds = {
        top: padding.top,
        bottom: padding.top + plotHeight,
    };

    grouped.forEach((group, timestamp) => {
        const x = xScale(timestamp);
        let buyOffset = 8;
        group.buys.forEach((marker) => {
            const y = yScale(marker.amount) - buyOffset - marker.radius;
            drawMarker(ctx, x, y, marker.radius, true, colors, chartBounds);
            buyOffset += marker.radius * 2 + 8;
        });
        let sellOffset = 8;
        group.sells.forEach((marker) => {
            const y = yScale(marker.amount) + sellOffset + marker.radius;
            drawMarker(ctx, x, y, marker.radius, false, colors, chartBounds);
            sellOffset += marker.radius * 2 + 8;
        });
    });

    if (showBalance && balanceData.length > 0) {
        ctx.beginPath();
        balanceData.forEach((item, index) => {
            const x = xScale(item.date.getTime());
            const y = yScale(item.value);
            index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = colors.portfolio;
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }

    // Update Legend
    const legendSeries = [
        { key: 'contribution', name: 'Contribution', color: colors.contribution },
        { key: 'balance', name: 'Balance', color: colors.portfolio },
        { key: 'buy', name: 'Buy', color: colors.buy },
        { key: 'sell', name: 'Sell', color: colors.sell },
    ];
    updateLegend(legendSeries, chartManager);
}

function drawPerformanceChart(ctx, chartManager) {
    const { performanceSeries, chartVisibility } = transactionState;
    if (!performanceSeries || Object.keys(performanceSeries).length === 0) {
        return;
    }

    const canvas = ctx.canvas;
    const emptyState = document.getElementById('runningAmountEmpty');
    emptyState.style.display = 'none';
    const visibility = chartVisibility || {};
    const allPossibleSeries = Object.entries(performanceSeries).map(([key, data]) => ({
        key,
        name: key,
        data,
    }));
    const seriesToDraw = allPossibleSeries.filter((s) => visibility[s.key] !== false);

    if (seriesToDraw.length === 0 && allPossibleSeries.length > 0) {
        // If all are hidden, we still need to draw axes and legend
    } else if (seriesToDraw.length === 0) {
        return;
    }

    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 50 }
        : { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvas.offsetWidth - padding.left - padding.right;
    const plotHeight = canvas.offsetHeight - padding.top - padding.bottom;

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? new Date(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? new Date(chartDateRange.to) : null;

    // When filtering, normalize each series to start from 100% at the beginning of the period
    let normalizedSeriesToDraw = seriesToDraw;
    if (filterFrom || filterTo) {
        normalizedSeriesToDraw = seriesToDraw.map((series) => {
            const filteredData = series.data
                .map((d) => ({ ...d, date: new Date(d.date) }))
                .filter((d) => {
                    const pointDate = new Date(d.date);
                    return (
                        (!filterFrom || pointDate >= filterFrom) &&
                        (!filterTo || pointDate <= filterTo)
                    );
                });

            if (filteredData.length === 0) {
                return series;
            }

            // Find the starting value (first data point in the filtered range)
            const startValue = filteredData[0].value;

            // Normalize all values relative to the starting value
            const normalizedData = filteredData.map((d) => ({
                ...d,
                value: (d.value / startValue) * 100, // Convert to percentage
            }));

            return {
                ...series,
                data: normalizedData,
            };
        });
    }

    const allPoints = normalizedSeriesToDraw.flatMap((s) => s.data);
    const allTimes = allPoints.map((p) => new Date(p.date).getTime());
    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);

    const allValues = allPoints.map((p) => p.value);
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);

    // When filtering (normalized data), use flexible y-axis range
    // When not filtering, use fixed range starting from 100
    const yMin =
        filterFrom || filterTo
            ? Math.min(dataMin * 0.95, 100) // Allow some margin below 100% if needed
            : 100;
    const yMax =
        filterFrom || filterTo
            ? Math.max(dataMax * 1.05, 100) // Allow margin above 100% if needed
            : Math.max(dataMax, 100) * 1.05;

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
        true // isPerformanceChart
    );

    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);
    const colorMap = {
        '^LZ': colors.portfolio,
        '^GSPC': colors.sp500,
        '^IXIC': colors.nasdaq,
        '^WORLD': colors.world,
    };

    // Draw Lines
    normalizedSeriesToDraw.forEach((series) => {
        ctx.beginPath();
        series.data.forEach((point, index) => {
            const x = xScale(new Date(point.date).getTime());
            const y = yScale(point.value);
            index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = colorMap[series.key] || colors.contribution; // Fallback color
        ctx.lineWidth = series.key === '^LZ' ? 2.5 : 2;
        ctx.stroke();
    });

    // Update Legend
    const legendSeries = allPossibleSeries.map((s) => ({
        key: s.key,
        name: s.name,
        color: colorMap[s.key] || colors.contribution,
    }));
    updateLegend(legendSeries, chartManager);
}

// --- Main Chart Manager ---

export function createChartManager({ buildRunningAmountSeries, buildPortfolioSeries }) {
    const chartManager = {
        update(transactions, splitHistory) {
            // Always update contribution data when update is called
            const contributionSeries = buildRunningAmountSeries(transactions, splitHistory);
            setRunningAmountSeries(contributionSeries);

            if (buildPortfolioSeries) {
                const portfolioSeries = buildPortfolioSeries(
                    transactions,
                    transactionState.historicalPrices,
                    transactionState.splitHistory
                );
                setPortfolioSeries(portfolioSeries);
            }
            this.redraw();
        },

        redraw() {
            requestAnimationFrame(() => {
                const canvas = document.getElementById('runningAmountCanvas');
                if (!canvas) {
                    return;
                }
                const ctx = canvas.getContext('2d');
                const dpr = window.devicePixelRatio || 1;
                canvas.width = canvas.offsetWidth * dpr;
                canvas.height = canvas.offsetHeight * dpr;
                ctx.scale(dpr, dpr);
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (transactionState.activeChart === 'performance') {
                    drawPerformanceChart(ctx, this);
                } else {
                    drawContributionChart(ctx, this);
                }
            });
        },
    };

    return chartManager;
}
