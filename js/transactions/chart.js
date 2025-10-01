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
            // Special handling for performance chart
            if (transactionState.activeChart === 'performance') {
                // LZ (portfolio) should always be visible - no toggle
                if (s.key === '^LZ') {
                    return; // Do nothing for portfolio
                }

                // Define all possible benchmarks (excluding portfolio)
                const benchmarks = ['^GSPC', '^IXIC', '^WORLD', '^DJI'];

                if (benchmarks.includes(s.key)) {
                    const disabled = item.classList.toggle('legend-disabled');
                    const isVisible = !disabled;

                    // If clicking a benchmark, hide other benchmarks
                    benchmarks.forEach((benchmark) => {
                        if (benchmark !== s.key) {
                            transactionState.chartVisibility[benchmark] = false;
                            // Update legend appearance
                            const otherItem = legendContainer.querySelector(
                                `[data-series="${benchmark}"]`
                            );
                            if (otherItem) {
                                otherItem.classList.add('legend-disabled');
                            }
                        }
                    });
                    // Set the clicked benchmark visibility
                    transactionState.chartVisibility[s.key] = isVisible;
                }
            } else {
                // Normal behavior for other charts
                const disabled = item.classList.toggle('legend-disabled');
                setChartVisibility(s.key, !disabled);
            }

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

function drawEndValue(
    context,
    x,
    y,
    value,
    color,
    isMobile,
    padding,
    plotWidth,
    plotHeight,
    formatValue,
    showBackground = false
) {
    const text = formatValue(value);
    const fontSize = isMobile ? 9 : 11;
    const fontFamily = 'var(--font-family-mono)';

    context.font = `${fontSize}px ${fontFamily}`;
    context.textAlign = 'left';
    context.textBaseline = 'middle';

    // Measure text width
    const textMetrics = context.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize;
    const bgPadding = 4;

    // Calculate position with boundary checks
    let textX, textY;

    if (isMobile) {
        // Mobile: always use right-side positioning with boundary check
        textX = padding.left + plotWidth - textWidth - 5;
        textY = Math.max(
            padding.top + textHeight / 2,
            Math.min(y, padding.top + plotHeight - textHeight / 2)
        );
    } else {
        // Desktop: try above/below endpoint first
        const spaceAbove = y - padding.top;
        const spaceBelow = padding.top + plotHeight - y;

        if (spaceAbove > textHeight + 8) {
            // Position above
            textX = x + 3;
            textY = y - 3;

            // Check if text would overflow right edge
            if (textX + textWidth > padding.left + plotWidth - 5) {
                textX = padding.left + plotWidth - textWidth - 5;
            }
        } else if (spaceBelow > textHeight + 8) {
            // Position below
            textX = x + 3;
            textY = y + textHeight + 3;

            // Check if text would overflow right edge
            if (textX + textWidth > padding.left + plotWidth - 5) {
                textX = padding.left + plotWidth - textWidth - 5;
            }
        } else {
            // Fall back to right-side positioning
            textX = padding.left + plotWidth - textWidth - 5;
            textY = Math.max(
                padding.top + textHeight / 2,
                Math.min(y, padding.top + plotHeight - textHeight / 2)
            );
        }
    }

    // Ensure text stays within chart boundaries
    textX = Math.max(padding.left + 2, Math.min(textX, padding.left + plotWidth - textWidth - 2));
    textY = Math.max(
        padding.top + textHeight / 2,
        Math.min(textY, padding.top + plotHeight - textHeight / 2)
    );

    // Draw background for contribution chart only
    if (showBackground) {
        // Create subtle dark background with rounded corners effect
        context.fillStyle = 'rgba(0, 0, 0, 0.4)';
        context.beginPath();
        context.roundRect(
            textX - bgPadding,
            textY - textHeight / 2 - bgPadding,
            textWidth + bgPadding * 2,
            textHeight + bgPadding * 2,
            3
        );
        context.fill();
    }

    // Draw text with series color
    context.fillStyle = color;
    context.fillText(text, textX, textY);
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

    // Add beginning month tick for desktop only
    if (!isMobile) {
        const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
        const startYear = startDate.getFullYear();
        const startLabel = `${startMonth} ${formatYear(startYear)}`;

        // Check if we already have a tick for the start date
        const hasStartTick = ticks.some((tick) => tick.time === minTime);
        if (!hasStartTick) {
            ticks.push({
                time: minTime,
                label: startLabel,
                isYearStart: false,
            });
        }
    }

    // Sort ticks by time
    ticks.sort((a, b) => a.time - b.time);

    // Remove duplicate ticks that are too close together (within 10 days)
    const filteredTicks = [];
    for (let i = 0; i < ticks.length; i++) {
        const currentTick = ticks[i];
        const isTooClose = filteredTicks.some(
            (existingTick) =>
                Math.abs(currentTick.time - existingTick.time) < 10 * 24 * 60 * 60 * 1000 // 10 days in milliseconds
        );

        if (!isTooClose) {
            filteredTicks.push(currentTick);
        } else {
            // If too close, prefer year boundaries (isYearStart: true) over start/end dates
            const isYearBoundary = currentTick.isYearStart;
            const existingIsYearBoundary = filteredTicks.some(
                (existingTick) =>
                    Math.abs(currentTick.time - existingTick.time) < 10 * 24 * 60 * 60 * 1000 &&
                    existingTick.isYearStart
            );

            if (isYearBoundary && !existingIsYearBoundary) {
                // Replace the existing tick with the year boundary
                const index = filteredTicks.findIndex(
                    (existingTick) =>
                        Math.abs(currentTick.time - existingTick.time) < 10 * 24 * 60 * 60 * 1000
                );
                if (index !== -1) {
                    filteredTicks[index] = currentTick;
                }
            }
        }
    }

    return filteredTicks;
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

        // Set text alignment based on tick position and layout
        if (isMobile) {
            // Mobile: center-align first tick, right-align last tick, center-align others
            if (index === 0) {
                ctx.textAlign = 'center';
            } else if (index === yearTicks.length - 1) {
                ctx.textAlign = 'right';
            } else {
                ctx.textAlign = 'center';
            }
        } else {
            // Desktop: center-align all ticks
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

    // When filtering by date, start from the filter start date, not the first data point
    let minTime;
    if (filterFrom && allTimes.length > 0) {
        minTime = Math.min(filterFrom.getTime(), Math.min(...allTimes));
    } else {
        minTime = Math.min(...allTimes);
    }
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

        // If we have a date filter and the filter start is before the first data point,
        // start the line from the filter start date with the first data point's value
        if (filterFrom && contributionData.length > 0) {
            const firstDataPoint = contributionData[0];
            const filterStartTime = filterFrom.getTime();
            const firstDataTime = firstDataPoint.date.getTime();

            if (filterStartTime < firstDataTime) {
                // Start from filter start date with first data point's value
                const x = xScale(filterStartTime);
                const y = yScale(firstDataPoint.amount);
                ctx.moveTo(x, y);
            }
        }

        contributionData.forEach((item, index) => {
            const x = xScale(item.date.getTime());
            const y = yScale(item.amount);
            if (index === 0 && (!filterFrom || filterFrom.getTime() >= item.date.getTime())) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
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

    // Draw end values
    if (showContribution && contributionData.length > 0) {
        const lastContribution = contributionData[contributionData.length - 1];
        const x = xScale(lastContribution.date.getTime());
        const y = yScale(lastContribution.amount);
        drawEndValue(
            ctx,
            x,
            y,
            lastContribution.amount,
            colors.contribution,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatCurrencyCompact,
            true
        );
    }

    if (showBalance && balanceData.length > 0) {
        const lastBalance = balanceData[balanceData.length - 1];
        const x = xScale(lastBalance.date.getTime());
        const y = yScale(lastBalance.value);

        // Use more granular formatting for balance line
        const formatBalanceValue = (value) => {
            const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
            const absolute = Math.abs(amount);
            const sign = amount < 0 ? '-' : '';

            if (absolute >= 1_000_000) {
                const millions = absolute / 1_000_000;
                return `${sign}$${millions.toFixed(2)}M`;
            }
            if (absolute >= 1_000) {
                const thousands = absolute / 1_000;
                return `${sign}$${thousands.toFixed(1)}k`;
            }
            return `${sign}$${amount.toFixed(0)}`;
        };

        drawEndValue(
            ctx,
            x,
            y,
            lastBalance.value,
            colors.portfolio,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatBalanceValue,
            true
        );
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

    // Set default visibility: always show LZ, show GSPC by default, hide other benchmarks
    const availableSeries = Object.keys(performanceSeries);
    if (availableSeries.length > 0) {
        // Initialize visibility state if not set
        availableSeries.forEach((key) => {
            if (transactionState.chartVisibility[key] === undefined) {
                if (key === '^LZ') {
                    // Always show portfolio
                    transactionState.chartVisibility[key] = true;
                } else {
                    // Show GSPC by default, hide other benchmarks
                    transactionState.chartVisibility[key] = key === '^GSPC';
                }
            }
        });
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

    // Draw Lines (filter based on visibility)
    normalizedSeriesToDraw.forEach((series) => {
        const isVisible = transactionState.chartVisibility[series.key] !== false;
        if (!isVisible) {
            return;
        } // Skip hidden series

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

    // Draw end values for visible series
    normalizedSeriesToDraw.forEach((series) => {
        const isVisible = transactionState.chartVisibility[series.key] !== false;
        if (!isVisible || series.data.length === 0) {
            return;
        }

        const lastPoint = series.data[series.data.length - 1];
        const x = xScale(new Date(lastPoint.date).getTime());
        const y = yScale(lastPoint.value);
        const color = colorMap[series.key] || colors.contribution;

        // Format value as percentage for performance chart (values are already in percentage format)
        const formatValue = (value) => `${value.toFixed(1)}%`;

        drawEndValue(
            ctx,
            x,
            y,
            lastPoint.value,
            color,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatValue,
            false
        );
    });

    // Update Legend
    const legendSeries = allPossibleSeries.map((s) => ({
        key: s.key,
        name: s.name,
        color: colorMap[s.key] || colors.contribution,
    }));
    updateLegend(legendSeries, chartManager);
}

function drawCompositionChart(ctx, chartManager) {
    const canvas = ctx.canvas;
    const emptyState = document.getElementById('runningAmountEmpty');

    // Clear any existing legend
    const legendContainer = document.querySelector('.chart-legend');
    if (legendContainer) {
        legendContainer.innerHTML = '';
    }

    // Load composition data
    fetch('../data/output/figures/composition.json')
        .then((response) => response.json())
        .then((data) => {
            if (!data || !data.dates || data.dates.length === 0) {
                emptyState.style.display = 'block';
                return;
            }
            emptyState.style.display = 'none';

            const isMobile = window.innerWidth <= 768;
            const padding = isMobile
                ? { top: 15, right: 20, bottom: 35, left: 50 }
                : { top: 20, right: 30, bottom: 48, left: 70 };
            const plotWidth = canvas.offsetWidth - padding.left - padding.right;
            const plotHeight = canvas.offsetHeight - padding.top - padding.bottom;

            // Filter data by date range
            const { chartDateRange } = transactionState;
            const filterFrom = chartDateRange.from ? new Date(chartDateRange.from) : null;
            const filterTo = chartDateRange.to ? new Date(chartDateRange.to) : null;

            const filteredIndices = [];
            data.dates.forEach((dateStr, index) => {
                const date = new Date(dateStr);
                if ((!filterFrom || date >= filterFrom) && (!filterTo || date <= filterTo)) {
                    filteredIndices.push(index);
                }
            });

            if (filteredIndices.length === 0) {
                emptyState.style.display = 'block';
                return;
            }

            const filteredDates = filteredIndices.map((i) => data.dates[i]);
            const filteredTotalValues = filteredIndices.map((i) => data.total_values[i]);

            // Get ALL holdings that had any percentage during the filtered period
            const allHoldings = {};
            Object.keys(data.composition).forEach((ticker) => {
                const values = filteredIndices.map((i) => data.composition[ticker][i] || 0);
                const avgValue = values.reduce((sum, val) => sum + val, 0) / values.length; // Average percentage
                if (avgValue > 0) {
                    // Include ALL holdings with any percentage > 0
                    allHoldings[ticker] = avgValue; // Rank by average percentage
                }
            });

            // Sort by latest date percentage (largest first, so largest goes at bottom of stack)
            const sortLatestIndex = filteredDates.length - 1;
            const sortedTickers = Object.entries(allHoldings).sort((a, b) => {
                const aLatestValue = filteredIndices.map((i) => data.composition[a[0]][i] || 0)[
                    sortLatestIndex
                ];
                const bLatestValue = filteredIndices.map((i) => data.composition[b[0]][i] || 0)[
                    sortLatestIndex
                ];
                return bLatestValue - aLatestValue; // Largest first (bottom of stack)
            });

            // Show ALL holdings (no limit)
            const topTickers = sortedTickers.map(([ticker]) => ticker);

            // Use original data without normalization
            const chartData = {};
            topTickers.forEach((ticker) => {
                chartData[ticker] = filteredIndices.map((i) => data.composition[ticker][i] || 0);
            });

            // Create ultra-granular blue-to-green spectrum palette
            const colors = [
                // Deep navy blues (darkest)
                '#0F172A',
                '#1E293B',
                '#334155',
                '#475569',
                '#64748B',
                '#94A3B8',
                '#CBD5E1',
                '#E2E8F0',
                '#F1F5F9',
                '#F8FAFC',

                // Rich navy blues
                '#1E3A8A',
                '#1E40AF',
                '#2563EB',
                '#3B82F6',
                '#60A5FA',
                '#93C5FD',
                '#BFDBFE',
                '#DBEAFE',
                '#EFF6FF',
                '#F0F9FF',

                // Deep ocean blues
                '#0C4A6E',
                '#075985',
                '#0369A1',
                '#0284C7',
                '#0EA5E9',
                '#38BDF8',
                '#7DD3FC',
                '#BAE6FD',
                '#E0F2FE',
                '#F0F9FF',

                // Medium ocean blues
                '#0F4C75',
                '#1A5F8A',
                '#2A7BA0',
                '#3B9BC7',
                '#4DB8E9',
                '#5DD3FC',
                '#7DE8FD',
                '#9DF6FE',
                '#C0F8FF',
                '#E0FCFF',

                // Sky blues
                '#164E63',
                '#155E75',
                '#0E7490',
                '#0891B2',
                '#06B6D4',
                '#22D3EE',
                '#67E8F9',
                '#A7F3D0',
                '#D1FAE5',
                '#ECFDF5',

                // Light sky blues
                '#1A5F7A',
                '#2A7BA0',
                '#3B9BC7',
                '#4DB8E9',
                '#5DD3FC',
                '#7DE8FD',
                '#9DF6FE',
                '#C0F8FF',
                '#E0FCFF',
                '#F0FDFF',

                // Cyan blues
                '#0D7377',
                '#14A085',
                '#2DD4BF',
                '#5EEAD4',
                '#99F6E4',
                '#CCFBF1',
                '#F0FDFA',
                '#F0FDF4',
                '#F7FEE7',
                '#FEFCE8',

                // Teal spectrum (blue-green transition)
                '#0D9488',
                '#14B8A6',
                '#2DD4BF',
                '#5EEAD4',
                '#99F6E4',
                '#CCFBF1',
                '#F0FDFA',
                '#F0FDF4',
                '#F7FEE7',
                '#FEFCE8',

                // Medium teals
                '#0F766E',
                '#1A9B8A',
                '#2BB5A6',
                '#3BC7B8',
                '#4DD9CA',
                '#5EEBDC',
                '#7FFDEE',
                '#9FFFF0',
                '#C0FFF2',
                '#E0FFF4',

                // Light teals
                '#134E4A',
                '#1A6B5B',
                '#2A8A7A',
                '#3BA999',
                '#4DC8B8',
                '#5EE7D7',
                '#7FF6E5',
                '#9FFFF3',
                '#C0FFF1',
                '#E0FFF9',

                // Green spectrum
                '#166534',
                '#16A34A',
                '#22C55E',
                '#4ADE80',
                '#86EFAC',
                '#BBF7D0',
                '#DCFCE7',
                '#F0FDF4',
                '#F7FEE7',
                '#FEFCE8',

                // Medium greens
                '#14532D',
                '#15803D',
                '#22C55E',
                '#4ADE80',
                '#86EFAC',
                '#BBF7D0',
                '#DCFCE7',
                '#F0FDF4',
                '#F7FEE7',
                '#FEFCE8',

                // Light greens
                '#1A5F3A',
                '#2A7B5A',
                '#3B9B7A',
                '#4DBB9A',
                '#5EDBBA',
                '#7EFBDA',
                '#9EFBFA',
                '#C0FBF0',
                '#E0FBF5',
                '#F0FBF9',

                // Forest greens
                '#14532D',
                '#15803D',
                '#22C55E',
                '#4ADE80',
                '#86EFAC',
                '#BBF7D0',
                '#DCFCE7',
                '#F0FDF4',
                '#F7FEE7',
                '#FEFCE8',

                // Dark forest greens
                '#0F3D2A',
                '#1A5F3A',
                '#2A7B5A',
                '#3B9B7A',
                '#4DBB9A',
                '#5EDBBA',
                '#7EFBDA',
                '#9EFBFA',
                '#C0FBF0',
                '#E0FBF5',

                // Steel blues and grays
                '#1F2937',
                '#374151',
                '#4B5563',
                '#6B7280',
                '#9CA3AF',
                '#D1D5DB',
                '#E5E7EB',
                '#F3F4F6',
                '#F9FAFB',
                '#FFFFFF',

                // Additional ultra-granular variations
                '#1E3A8A',
                '#1E40AF',
                '#2563EB',
                '#3B82F6',
                '#60A5FA',
                '#0D9488',
                '#14B8A6',
                '#2DD4BF',
                '#5EEAD4',
                '#99F6E4',
                '#166534',
                '#16A34A',
                '#22C55E',
                '#4ADE80',
                '#86EFAC',
                '#0F766E',
                '#1A9B8A',
                '#2BB5A6',
                '#3BC7B8',
                '#4DD9CA',
                '#134E4A',
                '#1A6B5B',
                '#2A8A7A',
                '#3BA999',
                '#4DC8B8',
                '#0F3D2A',
                '#1A5F3A',
                '#2A7B5A',
                '#3B9B7A',
                '#4DBB9A',
            ];

            // Set up scales
            const minTime = new Date(filteredDates[0]).getTime();
            const maxTime = new Date(filteredDates[filteredDates.length - 1]).getTime();
            const xScale = (time) =>
                padding.left + ((time - minTime) / (maxTime - minTime)) * plotWidth;
            const yScale = (value) => padding.top + plotHeight - (value / 100) * plotHeight;

            // Draw axes - always show 0-100% for composition with more tick marks
            drawAxes(
                ctx,
                padding,
                plotWidth,
                plotHeight,
                minTime,
                maxTime,
                0,
                100,
                xScale,
                yScale,
                (val) => `${val}%`,
                true // Use performance chart tick generation for more y-axis values
            );

            // Draw stacked areas
            let cumulativeValues = new Array(filteredDates.length).fill(0);

            topTickers.forEach((ticker, tickerIndex) => {
                // Largest holdings get bluer colors (shorter wavelengths) - sortedTickers already puts largest first
                const color = colors[tickerIndex % colors.length];
                const values = chartData[ticker];

                ctx.beginPath();
                ctx.fillStyle = color + '59'; // Add 35% opacity
                ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)'; // Half opaque gray
                ctx.lineWidth = 1;

                // Draw area
                filteredDates.forEach((dateStr, index) => {
                    const x = xScale(new Date(dateStr).getTime());
                    const y = yScale(cumulativeValues[index] + values[index]);
                    if (index === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });

                // Close the area
                for (let i = filteredDates.length - 1; i >= 0; i--) {
                    const x = xScale(new Date(filteredDates[i]).getTime());
                    const y = yScale(cumulativeValues[i]);
                    ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Update cumulative values
                cumulativeValues = cumulativeValues.map((val, index) => val + values[index]);
            });

            // Add hover detection for dynamic legend
            canvas.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Check if mouse is over any composition area
                let hoveredTicker = null;
                let hoveredPercentage = 0;

                // Find which ticker the mouse is over
                for (let i = topTickers.length - 1; i >= 0; i--) {
                    const ticker = topTickers[i];
                    const values = chartData[ticker];

                    // Find the closest date to mouse x position
                    const mouseTime =
                        minTime + ((x - padding.left) / plotWidth) * (maxTime - minTime);
                    const closestIndex = Math.round(
                        ((mouseTime - minTime) / (maxTime - minTime)) * (filteredDates.length - 1)
                    );

                    if (closestIndex >= 0 && closestIndex < values.length) {
                        const tickerValue = values[closestIndex];
                        const cumulativeValue = topTickers.slice(0, i).reduce((sum, prevTicker) => {
                            return sum + chartData[prevTicker][closestIndex];
                        }, 0);

                        const tickerY = yScale(cumulativeValue + tickerValue);
                        const prevY = yScale(cumulativeValue);

                        if (y >= tickerY && y <= prevY && tickerValue > 0) {
                            hoveredTicker = ticker;
                            hoveredPercentage = tickerValue;
                            break;
                        }
                    }
                }

                // Show/hide dynamic legend
                const legendElement = document.getElementById('dynamicLegend');
                if (hoveredTicker && hoveredPercentage > 0.1) {
                    if (!legendElement) {
                        // Create dynamic legend element
                        const legend = document.createElement('div');
                        legend.id = 'dynamicLegend';
                        legend.style.cssText = `
                            position: absolute;
                            background: rgba(0, 0, 0, 0.8);
                            color: white;
                            padding: 8px 12px;
                            border-radius: 6px;
                            font-size: 12px;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            pointer-events: none;
                            z-index: 1000;
                            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                        `;
                        document.body.appendChild(legend);
                    }

                    const legend = document.getElementById('dynamicLegend');
                    const tickerIndex = topTickers.indexOf(hoveredTicker);
                    // Largest holdings get bluer colors - sortedTickers already puts largest first
                    const tickerColor = colors[tickerIndex % colors.length];

                    // Fix BRKB ticker symbol display in tooltip
                    const displayTicker = hoveredTicker === 'BRKB' ? 'BRK-B' : hoveredTicker;
                    legend.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 12px; height: 12px; background: ${tickerColor}; border-radius: 2px;"></div>
                            <span><strong>${displayTicker}</strong>: ${hoveredPercentage.toFixed(2)}%</span>
                        </div>
                    `;

                    // Position legend near mouse
                    legend.style.left = e.clientX + 10 + 'px';
                    legend.style.top = e.clientY - 30 + 'px';
                    legend.style.display = 'block';
                } else if (legendElement) {
                    legendElement.style.display = 'none';
                }
            });

            // Hide legend when mouse leaves canvas
            canvas.addEventListener('mouseleave', () => {
                const legendElement = document.getElementById('dynamicLegend');
                if (legendElement) {
                    legendElement.style.display = 'none';
                }
            });

            // Show latest 6 largest holdings in proper legend format
            const latestIndex = filteredDates.length - 1;
            const latestHoldings = topTickers
                .map((ticker) => ({
                    ticker,
                    percentage: chartData[ticker][latestIndex] || 0,
                }))
                .filter((holding) => holding.percentage > 0.1)
                .sort((a, b) => b.percentage - a.percentage)
                .slice(0, 6);

            // Create legend series in same format as other charts
            const legendSeries = latestHoldings.map((holding, index) => {
                const tickerIndex = topTickers.indexOf(holding.ticker);
                // Largest holdings get bluer colors - sortedTickers already puts largest first
                // Fix BRKB ticker symbol display
                const displayName = holding.ticker === 'BRKB' ? 'BRK-B' : holding.ticker;
                return {
                    key: holding.ticker,
                    name: displayName,
                    color: colors[tickerIndex % colors.length],
                };
            });

            // Use the same updateLegend function for visual consistency
            // Hide legend on mobile due to space constraints
            if (!isMobile) {
                updateLegend(legendSeries, chartManager);
            }
        })
        .catch((error) => {
            console.error('Error loading composition data:', error);
            emptyState.style.display = 'block';
        });
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
                } else if (transactionState.activeChart === 'composition') {
                    drawCompositionChart(ctx, this);
                } else {
                    drawContributionChart(ctx, this);
                }
            });
        },
    };

    return chartManager;
}
