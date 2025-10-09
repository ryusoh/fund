import { transactionState, setChartVisibility, setHistoricalPrices } from './state.js';
import { computeRunningTotals, getSplitAdjustment } from './calculations.js';
import { formatCurrencyCompact } from './utils.js';
import { smoothFinancialData } from '../utils/smoothing.js';
import { createGlowTrailAnimator } from '../plugins/glowTrailAnimator.js';
import {
    ANIMATED_LINE_SETTINGS,
    CHART_SMOOTHING,
    CHART_MARKERS,
    CONTRIBUTION_CHART_SETTINGS,
    mountainFill,
} from '../config.js';

function hasActiveTransactionFilters() {
    const allTransactions = transactionState.allTransactions || [];
    const filteredTransactions = transactionState.filteredTransactions || [];
    if (!allTransactions.length) {
        return false;
    }
    return (
        filteredTransactions.length > 0 && filteredTransactions.length !== allTransactions.length
    );
}

function buildContributionSeriesFromTransactions(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }

    const runningTotals = computeRunningTotals(transactions, transactionState.splitHistory);
    const sortedTransactions = [...transactions].sort(
        (a, b) =>
            new Date(a.tradeDate) - new Date(b.tradeDate) ||
            (a.transactionId ?? 0) - (b.transactionId ?? 0)
    );

    const series = [];

    sortedTransactions.forEach((t, index) => {
        const totals = runningTotals.get(t.transactionId);
        const currentPoint = {
            tradeDate: t.tradeDate,
            amount: totals ? totals.portfolio : 0,
            orderType: t.orderType,
            netAmount: parseFloat(t.netAmount) || 0,
        };

        if (index > 0) {
            const prevTransaction = sortedTransactions[index - 1];
            const prevTotals = runningTotals.get(prevTransaction.transactionId);
            const prevAmount = prevTotals ? prevTotals.portfolio : 0;

            const prevDate = new Date(prevTransaction.tradeDate);
            const currentDate = new Date(t.tradeDate);

            if (prevDate.toISOString().split('T')[0] !== currentDate.toISOString().split('T')[0]) {
                const intermediateDate = new Date(currentDate);
                intermediateDate.setDate(intermediateDate.getDate() - 1);

                series.push({
                    tradeDate: intermediateDate.toISOString().split('T')[0],
                    amount: prevAmount,
                    orderType: 'padding',
                    netAmount: 0,
                });
            }
        }

        series.push(currentPoint);
    });

    const lastPoint = series[series.length - 1];
    if (lastPoint) {
        const today = new Date();
        const lastTransactionDate = new Date(lastPoint.tradeDate);

        if (today > lastTransactionDate) {
            series.push({
                tradeDate: today.toISOString().split('T')[0],
                amount: lastPoint.amount,
                orderType: 'padding',
                netAmount: 0,
            });
        }
    }

    return series;
}

function normalizeSymbolForPricing(symbol) {
    if (typeof symbol !== 'string') {
        return symbol;
    }
    return symbol.replace(/-/g, '').toUpperCase();
}

function getPriceFromHistoricalData(historicalPrices, symbol, dateStr) {
    if (!historicalPrices || typeof historicalPrices !== 'object') {
        return null;
    }
    const normalized = normalizeSymbolForPricing(symbol);
    const priceSeries =
        historicalPrices[normalized] ||
        historicalPrices[symbol] ||
        historicalPrices[symbol?.toUpperCase?.()] ||
        null;
    if (!priceSeries) {
        return null;
    }
    if (priceSeries[dateStr] !== undefined) {
        return priceSeries[dateStr];
    }
    const fallbackDate = new Date(dateStr);
    if (Number.isNaN(fallbackDate.getTime())) {
        return null;
    }
    for (let i = 0; i < 10; i += 1) {
        fallbackDate.setDate(fallbackDate.getDate() - 1);
        const priorStr = fallbackDate.toISOString().split('T')[0];
        if (priceSeries[priorStr] !== undefined) {
            return priceSeries[priorStr];
        }
    }
    return null;
}

function buildFilteredBalanceSeries(transactions, historicalPrices, splitHistory) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }

    const sortedTransactions = [...transactions].sort(
        (a, b) =>
            new Date(a.tradeDate) - new Date(b.tradeDate) ||
            (a.transactionId ?? 0) - (b.transactionId ?? 0)
    );

    const firstDate = new Date(sortedTransactions[0].tradeDate);
    const lastTransactionDate = new Date(
        sortedTransactions[sortedTransactions.length - 1].tradeDate
    );
    if (Number.isNaN(firstDate.getTime()) || Number.isNaN(lastTransactionDate.getTime())) {
        return [];
    }

    firstDate.setHours(0, 0, 0, 0);
    lastTransactionDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastDate = today > lastTransactionDate ? today : lastTransactionDate;

    const splitsByDate = new Map();
    (Array.isArray(splitHistory) ? splitHistory : []).forEach((split) => {
        if (!split || !split.splitDate || !split.symbol) {
            return;
        }
        const dateKey = new Date(split.splitDate).toISOString().split('T')[0];
        const multiplier = Number(split.splitMultiplier) || Number(split.split_multiplier) || 1;
        const symbolKey = normalizeSymbolForPricing(split.symbol);
        if (!splitsByDate.has(dateKey)) {
            splitsByDate.set(dateKey, []);
        }
        splitsByDate.get(dateKey).push({ symbol: symbolKey, multiplier });
    });

    const transactionsByDate = new Map();
    sortedTransactions.forEach((txn) => {
        const dateStr = new Date(txn.tradeDate).toISOString().split('T')[0];
        if (!transactionsByDate.has(dateStr)) {
            transactionsByDate.set(dateStr, []);
        }
        transactionsByDate.get(dateStr).push(txn);
    });

    const holdings = new Map();
    const series = [];
    const iterDate = new Date(firstDate);

    while (iterDate <= lastDate) {
        const dateStr = iterDate.toISOString().split('T')[0];

        const splitsToday = splitsByDate.get(dateStr);
        if (splitsToday) {
            splitsToday.forEach(({ symbol, multiplier }) => {
                if (!Number.isFinite(multiplier) || multiplier <= 0) {
                    return;
                }
                const currentQty = holdings.get(symbol);
                if (currentQty !== undefined) {
                    holdings.set(symbol, currentQty * multiplier);
                }
            });
        }

        const todaysTransactions = transactionsByDate.get(dateStr) || [];
        todaysTransactions.forEach((txn) => {
            const normalizedSymbol = normalizeSymbolForPricing(txn.security);
            const quantity = parseFloat(txn.quantity) || 0;
            if (!Number.isFinite(quantity) || quantity === 0) {
                return;
            }
            const isBuy = String(txn.orderType).toLowerCase() === 'buy';
            const currentQty = holdings.get(normalizedSymbol) || 0;
            const updatedQty = currentQty + (isBuy ? quantity : -quantity);
            if (Math.abs(updatedQty) < 1e-8) {
                holdings.delete(normalizedSymbol);
            } else {
                holdings.set(normalizedSymbol, updatedQty);
            }
        });

        let totalValue = 0;
        holdings.forEach((qty, symbol) => {
            if (!Number.isFinite(qty) || Math.abs(qty) < 1e-8) {
                return;
            }
            const price = getPriceFromHistoricalData(historicalPrices, symbol, dateStr);
            if (price === null) {
                return;
            }
            const adjustment = getSplitAdjustment(splitHistory, symbol, dateStr);
            totalValue += qty * price * adjustment;
        });

        series.push({ date: dateStr, value: totalValue });
        iterDate.setDate(iterDate.getDate() + 1);
    }

    return series;
}

// --- Helper Functions ---

const COLOR_PARSER_CONTEXT = (() => {
    if (typeof document === 'undefined') {
        return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.getContext('2d');
})();

function clamp01(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

function componentFromChannel(channel) {
    const trimmed = channel.trim();
    if (trimmed.endsWith('%')) {
        const percentage = parseFloat(trimmed.slice(0, -1));
        if (!Number.isFinite(percentage)) {
            return 0;
        }
        return Math.round((percentage / 100) * 255);
    }
    const numeric = parseFloat(trimmed);
    return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function colorWithAlpha(baseColor, alpha) {
    const normalizedAlpha = clamp01(alpha);
    if (normalizedAlpha <= 0) {
        return 'rgba(0, 0, 0, 0)';
    }

    if (typeof baseColor !== 'string' || baseColor.length === 0) {
        return baseColor;
    }

    const hexMatch = baseColor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((char) => char + char)
                .join('');
        }
        const intVal = parseInt(hex, 16);
        const r = (intVal >> 16) & 255;
        const g = (intVal >> 8) & 255;
        const b = intVal & 255;
        return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
    }

    const rgbMatch = baseColor.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(',');
        if (parts.length >= 3) {
            const r = componentFromChannel(parts[0]);
            const g = componentFromChannel(parts[1]);
            const b = componentFromChannel(parts[2]);
            return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
        }
    }

    if (COLOR_PARSER_CONTEXT) {
        const ctx = COLOR_PARSER_CONTEXT;
        ctx.save();
        ctx.fillStyle = baseColor;
        const computed = ctx.fillStyle;
        ctx.restore();
        if (computed && computed !== baseColor) {
            return colorWithAlpha(computed, normalizedAlpha);
        }
    }

    return baseColor;
}

function drawMountainFill(ctx, coords, baselineY, options) {
    if (!Array.isArray(coords) || coords.length === 0) {
        return;
    }

    const { color, colorStops, opacityTop = 0.35, opacityBottom = 0, bounds } = options || {};

    if (!bounds) {
        return;
    }

    if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
        return;
    }

    if (typeof document === 'undefined') {
        return;
    }

    let clampedBaselineY = baselineY;
    if (!Number.isFinite(clampedBaselineY)) {
        return;
    }
    clampedBaselineY = Math.min(Math.max(clampedBaselineY, bounds.top), bounds.bottom);

    const areaCoords = (coords.length === 1 ? [coords[0], coords[0]] : coords).map((coord) => ({
        x: coord.x,
        y: coord.y,
    }));

    const width = Math.max(1, Math.ceil(bounds.right - bounds.left));
    const height = Math.max(1, Math.ceil(bounds.bottom - bounds.top));

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) {
        return;
    }

    offCtx.beginPath();
    offCtx.moveTo(areaCoords[0].x - bounds.left, areaCoords[0].y - bounds.top);
    for (let i = 1; i < areaCoords.length; i += 1) {
        offCtx.lineTo(areaCoords[i].x - bounds.left, areaCoords[i].y - bounds.top);
    }
    offCtx.lineTo(areaCoords[areaCoords.length - 1].x - bounds.left, clampedBaselineY - bounds.top);
    offCtx.lineTo(areaCoords[0].x - bounds.left, clampedBaselineY - bounds.top);
    offCtx.closePath();

    let horizontalGradient = null;
    if (Array.isArray(colorStops) && colorStops.length > 0) {
        horizontalGradient = offCtx.createLinearGradient(0, 0, width, 0);
        const stopCount = colorStops.length;
        colorStops.forEach((stopColor, index) => {
            const offset = stopCount === 1 ? 0 : index / (stopCount - 1);
            horizontalGradient.addColorStop(offset, colorWithAlpha(stopColor, 1));
        });
    }

    if (horizontalGradient) {
        offCtx.fillStyle = horizontalGradient;
    } else {
        offCtx.fillStyle = colorWithAlpha(color, 1);
    }
    offCtx.fill();

    const relativeYs = areaCoords.map((c) => c.y - bounds.top);
    relativeYs.push(clampedBaselineY - bounds.top);
    const minYRel = Math.min(...relativeYs);
    const maxYRel = Math.max(...relativeYs);
    const gradientTop = Math.min(minYRel, maxYRel - 0.0001);
    const gradientBottom = Math.max(maxYRel, gradientTop + 0.0001);

    offCtx.globalCompositeOperation = 'destination-in';
    const alphaGradient = offCtx.createLinearGradient(0, gradientTop, 0, gradientBottom);
    alphaGradient.addColorStop(0, `rgba(0, 0, 0, ${clamp01(opacityTop)})`);
    alphaGradient.addColorStop(1, `rgba(0, 0, 0, ${clamp01(opacityBottom)})`);
    offCtx.fillStyle = alphaGradient;
    offCtx.fillRect(0, 0, width, height);
    offCtx.globalCompositeOperation = 'source-over';

    ctx.drawImage(offscreen, bounds.left, bounds.top);
}

const BENCHMARK_GRADIENTS = {
    '^LZ': ['#fb8500', '#ffef2f'],
    '^GSPC': ['#0d3b66', '#64b5f6'],
    '^IXIC': ['#0f4c81', '#74c0fc'],
    '^DJI': ['#123c69', '#6aaefc'],
    '^SSEC': ['#0e487a', '#5da9f6'],
    '^HSI': ['#0d4977', '#7ab8ff'],
    '^N225': ['#0b3d63', '#89c2ff'],
};

// Gradient definitions for balance chart lines
const BALANCE_GRADIENTS = {
    balance: ['#fb8500', '#ffef2f'], // Yellow gradient for balance line (same as portfolio)
    contribution: ['#0d3b66', '#64b5f6'], // Blue gradient for contribution line (same as S&P 500)
};

// Helper function to get smoothing configuration
function getSmoothingConfig(chartType) {
    if (!CHART_SMOOTHING.enabled) {
        return null; // Smoothing disabled
    }

    const methodName = CHART_SMOOTHING.charts[chartType] || 'balanced';
    return CHART_SMOOTHING.methods[methodName] || CHART_SMOOTHING.methods.balanced;
}

const glowAnimator = createGlowTrailAnimator(ANIMATED_LINE_SETTINGS);

const isAnimationEnabled = (chartKey) => glowAnimator.isEnabledFor(chartKey);

let performanceLegendDirty = true;
let contributionLegendDirty = true;

function stopPerformanceAnimation() {
    glowAnimator.stop('performance');
}

function stopContributionAnimation() {
    glowAnimator.stop('contribution');
}

function schedulePerformanceAnimation(chartManager) {
    if (!isAnimationEnabled('performance')) {
        glowAnimator.stop('performance');
        return;
    }
    glowAnimator.schedule('performance', chartManager, {
        isActive: () => transactionState.activeChart === 'performance',
    });
}

function scheduleContributionAnimation(chartManager) {
    if (!isAnimationEnabled('contribution')) {
        glowAnimator.stop('contribution');
        return;
    }
    glowAnimator.schedule('contribution', chartManager, {
        isActive: () => transactionState.activeChart === 'contribution',
    });
}

function advancePerformanceAnimation(timestamp) {
    if (!isAnimationEnabled('performance')) {
        return 0;
    }
    return glowAnimator.advance('performance', timestamp);
}

function advanceContributionAnimation(timestamp) {
    if (!isAnimationEnabled('contribution')) {
        return 0;
    }
    return glowAnimator.advance('contribution', timestamp);
}

function getChartColors(rootStyles) {
    return {
        portfolio: rootStyles.getPropertyValue('--portfolio-line').trim() || '#7a7a7a',
        contribution: rootStyles.getPropertyValue('--contribution-line').trim() || '#b3b3b3',
        sp500: rootStyles.getPropertyValue('--sp500-line').trim() || '#ef553b',
        nasdaq: rootStyles.getPropertyValue('--nasdaq-line').trim() || '#00d5ff',
        dji: rootStyles.getPropertyValue('--dji-line').trim() || '#ab63fa',
        ssec: rootStyles.getPropertyValue('--sse-line').trim() || '#ffa15a',
        hsi: rootStyles.getPropertyValue('--hsi-line').trim() || '#19d3f3',
        nikkei: rootStyles.getPropertyValue('--n225-line').trim() || '#ff6692',
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
        swatch.style.background = 'none';
        swatch.style.backgroundColor = s.color;
        swatch.style.border = '';

        const label = document.createElement('span');
        label.textContent = s.name;

        item.appendChild(swatch);
        item.appendChild(label);

        // Skip click events for composition chart (non-interactive legend)
        if (transactionState.activeChart !== 'composition') {
            item.addEventListener('click', () => {
                if (transactionState.activeChart === 'performance') {
                    // Special handling for performance chart
                    if (s.key === '^LZ') {
                        return; // Portfolio line ('^LZ') is not toggleable
                    }

                    const benchmarks = ['^GSPC', '^IXIC', '^DJI', '^SSEC', '^HSI', '^N225'];
                    if (benchmarks.includes(s.key)) {
                        const isDisabled = item.classList.toggle('legend-disabled');
                        const isVisible = !isDisabled;

                        // Hide other benchmarks for a "radio button" style interaction
                        benchmarks.forEach((benchmark) => {
                            if (benchmark !== s.key) {
                                transactionState.chartVisibility[benchmark] = false;
                                const otherItem = legendContainer.querySelector(
                                    `[data-series="${benchmark}"]`
                                );
                                if (otherItem) {
                                    otherItem.classList.add('legend-disabled');
                                }
                            }
                        });

                        transactionState.chartVisibility[s.key] = isVisible;
                        performanceLegendDirty = true; // Mark legend as needing update
                    }
                } else {
                    // Normal behavior for other charts (like Contribution)
                    const isDisabled = item.classList.toggle('legend-disabled');
                    setChartVisibility(s.key, !isDisabled);
                    contributionLegendDirty = true; // Set flag to redraw legend
                }

                // Redraw the chart to apply visibility changes
                if (typeof chartManager.redraw === 'function') {
                    chartManager.redraw();
                }
            });
        } // End of conditional for non-composition charts

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

    return textY;
}

function drawStartValue(
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

    const textMetrics = context.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize;
    const bgPadding = 4;

    // Anchor near the left plot boundary while respecting vertical limits
    const baseX = padding.left + (isMobile ? 4 : 6);
    const textX = Math.min(baseX, padding.left + plotWidth - textWidth - 2);
    const textY = Math.max(
        padding.top + textHeight / 2,
        Math.min(y, padding.top + plotHeight - textHeight / 2)
    );

    if (showBackground) {
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

    context.fillStyle = color;
    context.fillText(text, textX, textY);

    return textY;
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
    isPerformanceChart = false,
    axisOptions = {}
) {
    const isMobile = window.innerWidth <= 768;
    const { drawXAxis = true, drawYAxis = true } = axisOptions;

    // Generate concrete tick values
    const ticks = generateConcreteTicks(yMin, yMax, isPerformanceChart);

    // Y-axis grid lines and labels
    if (drawYAxis) {
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
    }

    // X-axis line
    if (drawXAxis) {
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + plotHeight);
        ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // Generate year-based x-axis ticks
    const yearTicks = generateYearBasedTicks(minTime, maxTime);

    if (drawXAxis) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = isMobile ? '10px var(--font-family-mono)' : '12px var(--font-family-mono)';
    }

    yearTicks.forEach((tick, index) => {
        const x = xScale(tick.time);

        if (drawXAxis) {
            // Prevent label collision on mobile by hiding the last tick if it's too close to the previous one
            if (isMobile && index === yearTicks.length - 1 && index > 0) {
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
        }

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

async function drawContributionChart(ctx, chartManager, timestamp) {
    stopPerformanceAnimation();

    const runningAmountSeries = Array.isArray(transactionState.runningAmountSeries)
        ? transactionState.runningAmountSeries
        : [];
    const portfolioSeries = Array.isArray(transactionState.portfolioSeries)
        ? transactionState.portfolioSeries
        : [];
    const filteredTransactions = Array.isArray(transactionState.filteredTransactions)
        ? transactionState.filteredTransactions
        : [];

    const filtersActive = hasActiveTransactionFilters();
    const contributionSource = filtersActive
        ? buildContributionSeriesFromTransactions(filteredTransactions)
        : runningAmountSeries;

    let historicalPrices = transactionState.historicalPrices;
    if (filtersActive && (!historicalPrices || Object.keys(historicalPrices).length === 0)) {
        try {
            const response = await fetch('../data/historical_prices.json');
            if (response.ok) {
                historicalPrices = await response.json();
                setHistoricalPrices(historicalPrices);
            } else {
                historicalPrices = {};
            }
        } catch {
            historicalPrices = {};
        }
    } else {
        historicalPrices = historicalPrices || {};
    }

    const balanceSource = filtersActive
        ? buildFilteredBalanceSeries(
              filteredTransactions,
              historicalPrices,
              transactionState.splitHistory
          )
        : portfolioSeries;
    const hasBalanceSeries = Array.isArray(balanceSource) && balanceSource.length > 0;

    const { chartVisibility } = transactionState;
    const visibility = chartVisibility || {};
    const showContribution = visibility.contribution !== false;
    const showBalance = visibility.balance !== false && hasBalanceSeries;
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

    const rawContributionData = filterDataByDateRange(
        (contributionSource || [])
            .map((item) => ({ ...item, date: new Date(item.tradeDate || item.date) }))
            .filter((item) => !Number.isNaN(item.date.getTime()))
    );
    const rawBalanceData = showBalance
        ? filterDataByDateRange(
              (balanceSource || [])
                  .map((item) => ({ ...item, date: new Date(item.date) }))
                  .filter((item) => !Number.isNaN(item.date.getTime()))
          )
        : [];

    // Apply smoothing to contribution and balance data
    const contributionSmoothingConfig = getSmoothingConfig('contribution');
    const contributionData =
        rawContributionData.length > 2 && contributionSmoothingConfig
            ? smoothFinancialData(
                  rawContributionData.map((item) => ({ x: item.date.getTime(), y: item.amount })),
                  contributionSmoothingConfig,
                  true // preserveEnd - keep the last point unchanged
              ).map((p) => ({ date: new Date(p.x), amount: p.y }))
            : rawContributionData;

    const balanceData =
        rawBalanceData.length > 2 && contributionSmoothingConfig
            ? smoothFinancialData(
                  rawBalanceData.map((item) => ({ x: item.date.getTime(), y: item.value })),
                  contributionSmoothingConfig,
                  true // preserveEnd - keep the last point unchanged
              ).map((p) => ({ date: new Date(p.x), value: p.y }))
            : rawBalanceData;

    if (contributionData.length === 0 && balanceData.length === 0) {
        stopContributionAnimation();
        if (emptyState) {
            emptyState.style.display = '';
        }
        return;
    }
    if (emptyState) {
        emptyState.style.display = 'none';
    }

    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 50 }
        : { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvas.offsetWidth - padding.left - padding.right;
    const totalPlotHeight = canvas.offsetHeight - padding.top - padding.bottom;
    const volumeGap = isMobile ? 10 : 16;
    const minMainHeight = isMobile ? 120 : 180;
    const minVolumeHeight = isMobile ? 50 : 80;
    const availableHeight = Math.max(totalPlotHeight - volumeGap, 0);

    let mainPlotHeight = 0;
    let volumeHeight = 0;

    if (availableHeight <= 0) {
        mainPlotHeight = Math.max(totalPlotHeight, 0);
    } else if (availableHeight < minMainHeight + minVolumeHeight) {
        const scale = availableHeight / (minMainHeight + minVolumeHeight);
        mainPlotHeight = minMainHeight * scale;
        volumeHeight = minVolumeHeight * scale;
    } else {
        mainPlotHeight = Math.max(minMainHeight, availableHeight * 0.7);
        volumeHeight = availableHeight - mainPlotHeight;
        if (volumeHeight < minVolumeHeight) {
            volumeHeight = minVolumeHeight;
            mainPlotHeight = availableHeight - volumeHeight;
        }
    }

    const plotHeight = mainPlotHeight;
    const volumeTop = padding.top + plotHeight + (volumeHeight > 0 ? volumeGap : 0);

    const allTimes = [
        ...contributionData.map((d) => d.date.getTime()),
        ...balanceData.map((d) => d.date.getTime()),
    ];

    const effectiveMinTimes = [];
    if (rawContributionData.length > 0) {
        const firstContributionPoint = filtersActive
            ? rawContributionData.find(
                  (item) =>
                      typeof item.orderType !== 'string' ||
                      item.orderType.toLowerCase() !== 'padding'
              )
            : rawContributionData[0];
        if (firstContributionPoint) {
            effectiveMinTimes.push(firstContributionPoint.date.getTime());
        }
    }
    if (showBalance && rawBalanceData.length > 0) {
        effectiveMinTimes.push(rawBalanceData[0].date.getTime());
    }

    const fallbackMinTime = allTimes.length > 0 ? Math.min(...allTimes) : Date.now();
    let minTime = effectiveMinTimes.length > 0 ? Math.min(...effectiveMinTimes) : fallbackMinTime;

    if (filterFrom && Number.isFinite(filterFrom.getTime())) {
        minTime = Math.max(minTime, filterFrom.getTime());
    }
    // If we have a date range filter, use only the filtered data range
    // Otherwise, extend to today for real-time data
    const maxTime =
        filterFrom || filterTo
            ? Math.max(...allTimes)
            : Math.max(new Date().setHours(0, 0, 0, 0), ...allTimes);

    if (showContribution && contributionData.length > 0) {
        const lastDataPoint = contributionData[contributionData.length - 1];
        if (lastDataPoint.date.getTime() < maxTime) {
            contributionData.push({
                ...lastDataPoint,
                date: new Date(maxTime),
            });
        }
    }

    const contributionValues = contributionData.map((item) => item.amount);
    const balanceValues = balanceData.map((item) => item.value);
    const combinedValues = [...contributionValues, ...balanceValues].filter((value) =>
        Number.isFinite(value)
    );
    const hasValues = combinedValues.length > 0;
    const rawMin = hasValues ? Math.min(...combinedValues) : 0;
    const rawMax = hasValues ? Math.max(...combinedValues) : 0;

    const {
        startYAxisAtZero = true,
        paddingRatio: configuredPaddingRatio = 0.05,
        minPaddingValue: configuredMinPadding = 0,
    } = CONTRIBUTION_CHART_SETTINGS || {};

    const paddingRatio = Number.isFinite(configuredPaddingRatio)
        ? Math.max(configuredPaddingRatio, 0)
        : 0.05;
    const minPaddingValue = Number.isFinite(configuredMinPadding)
        ? Math.max(configuredMinPadding, 0)
        : 0;

    let yMin = startYAxisAtZero ? Math.min(0, rawMin) : rawMin;
    let yMax = startYAxisAtZero ? Math.max(rawMax, 0) : rawMax;

    if (!hasValues) {
        yMin = startYAxisAtZero ? 0 : 0;
        yMax = 1;
    }

    const range = yMax - yMin;
    const paddingDelta =
        range > 0
            ? Math.max(range * paddingRatio, minPaddingValue)
            : Math.max(Math.abs(yMax || yMin) * paddingRatio, minPaddingValue || 1);

    if (startYAxisAtZero) {
        yMax += paddingDelta;
    } else {
        yMin -= paddingDelta;
        yMax += paddingDelta;
    }

    if (yMax <= yMin) {
        const fallbackSpan = paddingDelta || 1;
        yMax = yMin + fallbackSpan;
    }

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
        false, // isPerformanceChart
        volumeHeight > 0 ? { drawXAxis: false } : {}
    );

    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);
    const contributionAnimationEnabled = isAnimationEnabled('contribution');
    const animationPhase = advanceContributionAnimation(timestamp);

    const animatedSeries = [];
    const filterStartTime = filterFrom ? filterFrom.getTime() : null;

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

    let firstContributionLabelY = null;
    let contributionEndLabelY = null;

    if (showContribution && contributionData.length > 0) {
        animatedSeries.push({
            key: 'contribution',
            color: colors.contribution,
            lineWidth: 2,
            order: 1,
            data: contributionData.map((item) => ({
                time: item.date.getTime(),
                value: item.amount,
            })),
        });
    }

    if (showBalance && balanceData.length > 0) {
        animatedSeries.push({
            key: 'balance',
            color: colors.portfolio,
            lineWidth: 2,
            order: 2,
            data: balanceData.map((item) => ({
                time: item.date.getTime(),
                value: item.value,
            })),
        });
    }

    animatedSeries.forEach((series) => {
        const coords = [];
        if (filterStartTime !== null && series.data.length > 0) {
            const firstPoint = series.data[0];
            if (filterStartTime < firstPoint.time) {
                coords.push({
                    x: xScale(filterStartTime),
                    y: yScale(firstPoint.value),
                    time: filterStartTime,
                    value: firstPoint.value,
                });
            }
        }

        series.data.forEach((point) => {
            coords.push({
                x: xScale(point.time),
                y: yScale(point.value),
                time: point.time,
                value: point.value,
            });
        });

        series.coords = coords;
    });

    // --- Draw Markers ---
    // Use raw data for markers since smoothed data doesn't have orderType
    const showMarkersConfig = CHART_MARKERS?.showContributionMarkers !== false;
    const markerGroups = new Map();

    if (showMarkersConfig) {
        rawContributionData.forEach((item) => {
            if (typeof item.orderType !== 'string') {
                return;
            }
            const type = item.orderType.toLowerCase();
            if (!((type === 'buy' && showBuy) || (type === 'sell' && showSell))) {
                return;
            }
            const timestamp = item.date.getTime();
            if (!Number.isFinite(timestamp)) {
                return;
            }

            if (!markerGroups.has(timestamp)) {
                markerGroups.set(timestamp, { buys: [], sells: [] });
            }
            const group = markerGroups.get(timestamp);
            const netAmount = Number(item.netAmount) || 0;
            const amount = Number(item.amount) || 0;
            const radius = Math.min(8, Math.max(2, Math.abs(netAmount) / 500));
            if (type === 'buy') {
                group.buys.push({ radius, amount, netAmount });
            } else {
                group.sells.push({ radius, amount, netAmount });
            }
        });
    }

    const volumeEntries = [];
    let maxVolume = 0;
    const volumeGroups = new Map();

    rawContributionData.forEach((item) => {
        if (typeof item.orderType !== 'string') {
            return;
        }
        const type = item.orderType.toLowerCase();
        if (!((type === 'buy' && showBuy) || (type === 'sell' && showSell))) {
            return;
        }
        const timestamp = item.date.getTime();
        if (!Number.isFinite(timestamp)) {
            return;
        }
        const netAmount = Math.abs(Number(item.netAmount) || 0);
        if (netAmount <= 0) {
            return;
        }

        if (!volumeGroups.has(timestamp)) {
            volumeGroups.set(timestamp, { totalBuy: 0, totalSell: 0 });
        }
        const totals = volumeGroups.get(timestamp);
        if (type === 'buy') {
            totals.totalBuy += netAmount;
        } else {
            totals.totalSell += netAmount;
        }
    });

    volumeGroups.forEach((totals, timestamp) => {
        const { totalBuy, totalSell } = totals;
        const totalBuyVolume = totalBuy;
        const totalSellVolume = totalSell;
        if (totalBuyVolume === 0 && totalSellVolume === 0) {
            return;
        }

        maxVolume = Math.max(maxVolume, totalBuyVolume, totalSellVolume);
        volumeEntries.push({
            timestamp,
            totalBuyVolume,
            totalSellVolume,
        });
    });

    const volumePadding = {
        top: volumeTop,
        right: padding.right,
        bottom: padding.bottom,
        left: padding.left,
    };

    let volumeYScale;
    if (volumeHeight > 0) {
        const volumeYMin = 0;
        const volumeYMax = maxVolume > 0 ? maxVolume * 1.1 : 1;
        const volumeRange = volumeYMax - volumeYMin || 1;
        volumeYScale = (value) =>
            volumePadding.top + volumeHeight - ((value - volumeYMin) / volumeRange) * volumeHeight;

        drawAxes(
            ctx,
            volumePadding,
            plotWidth,
            volumeHeight,
            minTime,
            maxTime,
            volumeYMin,
            volumeYMax,
            xScale,
            volumeYScale,
            formatCurrencyCompact,
            false,
            { drawYAxis: maxVolume > 0 }
        );
    }

    if (volumeHeight > 0 && volumeEntries.length > 0 && typeof volumeYScale === 'function') {
        volumeEntries.sort((a, b) => a.timestamp - b.timestamp);
        const barWidth = 8;
        const barGap = 3;
        const baselineY = volumePadding.top + volumeHeight;

        volumeEntries.forEach((entry) => {
            const { timestamp, totalBuyVolume, totalSellVolume } = entry;
            const x = xScale(timestamp);

            const bars = [];
            if (totalBuyVolume > 0) {
                bars.push({
                    volume: totalBuyVolume,
                    fill: 'rgba(76, 175, 80, 0.6)',
                    stroke: 'rgba(76, 175, 80, 0.8)',
                });
            }
            if (totalSellVolume > 0) {
                bars.push({
                    volume: totalSellVolume,
                    fill: 'rgba(244, 67, 54, 0.6)',
                    stroke: 'rgba(244, 67, 54, 0.8)',
                });
            }
            if (bars.length === 0) {
                return;
            }

            const totalBarWidth = bars.length * barWidth + (bars.length - 1) * barGap;
            let currentX = x - totalBarWidth / 2;

            bars.forEach((bar) => {
                const topY = volumeYScale(bar.volume);
                const height = baselineY - topY;
                if (height <= 0) {
                    currentX += barWidth + barGap;
                    return;
                }

                ctx.fillStyle = bar.fill;
                ctx.fillRect(currentX, topY, barWidth, height);

                ctx.strokeStyle = bar.stroke;
                ctx.lineWidth = 1;
                ctx.strokeRect(currentX, topY, barWidth, height);

                currentX += barWidth + barGap;
            });
        });
    }

    const chartBounds = {
        top: padding.top,
        bottom: volumeHeight > 0 ? volumeTop : padding.top + plotHeight,
        left: padding.left,
        right: padding.left + plotWidth,
    };

    if (showMarkersConfig && markerGroups.size > 0) {
        markerGroups.forEach((group, timestamp) => {
            const x = xScale(timestamp);

            const sortedBuys = [...group.buys].sort((a, b) => b.radius - a.radius);
            let buyOffset = 8;
            sortedBuys.forEach((marker) => {
                const y = yScale(marker.amount) - buyOffset - marker.radius;
                drawMarker(ctx, x, y, marker.radius, true, colors, chartBounds);
                buyOffset += marker.radius * 2 + 4;
            });

            const sortedSells = [...group.sells].sort((a, b) => b.radius - a.radius);
            let sellOffset = 8;
            sortedSells.forEach((marker) => {
                const y = yScale(marker.amount) + sellOffset + marker.radius;
                drawMarker(ctx, x, y, marker.radius, false, colors, chartBounds);
                sellOffset += marker.radius * 2 + 4;
            });
        });
    }

    const sortedSeries = animatedSeries
        .map((series) => ({ ...series }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    let hasAnimatedSeries = false;

    const areaBaselineY = chartBounds.bottom;

    sortedSeries.forEach((series, index) => {
        const coords = series.coords || [];
        if (coords.length === 0) {
            return;
        }

        // Apply gradient effect for balance chart lines
        const gradientStops = BALANCE_GRADIENTS[series.key];
        if (gradientStops) {
            const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + plotWidth, 0);
            gradient.addColorStop(0, gradientStops[0]);
            gradient.addColorStop(1, gradientStops[1]);
            ctx.strokeStyle = gradient;
        } else {
            ctx.strokeStyle = series.color;
        }

        if (mountainFill.enabled) {
            const gradientStops = BALANCE_GRADIENTS[series.key];
            const colorStops =
                gradientStops && gradientStops.length === 2
                    ? gradientStops
                    : [series.color, series.color];

            drawMountainFill(ctx, coords, areaBaselineY, {
                color: series.color,
                colorStops,
                opacityTop: 0.35,
                opacityBottom: 0,
                bounds: chartBounds,
            });
        }

        ctx.beginPath();
        coords.forEach((coord, coordIndex) => {
            if (coordIndex === 0) {
                ctx.moveTo(coord.x, coord.y);
            } else {
                ctx.lineTo(coord.x, coord.y);
            }
        });
        ctx.lineWidth = series.lineWidth;
        ctx.stroke();

        if (contributionAnimationEnabled) {
            // Use gradient end color for glow effect
            const glowColor = gradientStops ? gradientStops[1] : series.color;
            glowAnimator.drawSeriesGlow(
                ctx,
                { coords, color: glowColor, lineWidth: series.lineWidth },
                {
                    basePhase: animationPhase,
                    seriesIndex: index,
                    isMobile,
                    chartKey: 'contribution',
                }
            );
            hasAnimatedSeries = true;
        }
    });

    if (contributionAnimationEnabled && hasAnimatedSeries) {
        scheduleContributionAnimation(chartManager);
    } else {
        stopContributionAnimation();
    }

    // Draw start and end values using raw data to ensure accuracy
    if (showContribution && rawContributionData.length > 0) {
        const contributionGradient = BALANCE_GRADIENTS['contribution'];
        const contributionStartColor = contributionGradient
            ? contributionGradient[0]
            : colors.contribution;
        const contributionEndColor = contributionGradient
            ? contributionGradient[1]
            : colors.contribution;

        const firstContribution =
            rawContributionData.find((item) => {
                if (typeof item.orderType !== 'string') {
                    return true;
                }
                return item.orderType.toLowerCase() !== 'padding';
            }) ?? rawContributionData[0];
        const firstContributionX = xScale(firstContribution.date.getTime());
        const firstContributionY = yScale(firstContribution.amount);
        firstContributionLabelY = drawStartValue(
            ctx,
            firstContributionX,
            firstContributionY,
            firstContribution.amount,
            contributionStartColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatCurrencyCompact,
            true
        );

        const lastContribution = rawContributionData[rawContributionData.length - 1];
        const lastContributionX = xScale(lastContribution.date.getTime());
        const lastContributionY = yScale(lastContribution.amount);
        contributionEndLabelY = drawEndValue(
            ctx,
            lastContributionX,
            lastContributionY,
            lastContribution.amount,
            contributionEndColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatCurrencyCompact,
            true
        );
    }

    if (showBalance && rawBalanceData.length > 0) {
        const balanceGradient = BALANCE_GRADIENTS['balance'];
        const balanceStartColor = balanceGradient ? balanceGradient[0] : colors.portfolio;
        const balanceEndColor = balanceGradient ? balanceGradient[1] : colors.portfolio;

        const firstBalance = rawBalanceData[0];
        const firstBalanceX = xScale(firstBalance.date.getTime());
        let firstBalanceY = yScale(firstBalance.value);
        if (firstContributionLabelY !== null) {
            const minGap = isMobile ? 18 : 14;
            if (Math.abs(firstBalanceY - firstContributionLabelY) < minGap) {
                if (firstBalanceY >= firstContributionLabelY) {
                    firstBalanceY = Math.min(
                        firstBalanceY + minGap,
                        padding.top + plotHeight - minGap / 2
                    );
                } else {
                    firstBalanceY = Math.max(firstBalanceY - minGap, padding.top + minGap / 2);
                }
            }
        }
        drawStartValue(
            ctx,
            firstBalanceX,
            firstBalanceY,
            firstBalance.value,
            balanceStartColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatBalanceValue,
            true
        );

        const lastBalance = rawBalanceData[rawBalanceData.length - 1];
        const lastBalanceX = xScale(lastBalance.date.getTime());
        let lastBalanceY = yScale(lastBalance.value);
        if (contributionEndLabelY !== null) {
            const minGap = isMobile ? 18 : 14;
            if (Math.abs(lastBalanceY - contributionEndLabelY) < minGap) {
                if (lastBalanceY >= contributionEndLabelY) {
                    lastBalanceY = Math.min(
                        lastBalanceY + minGap,
                        padding.top + plotHeight - minGap / 2
                    );
                } else {
                    lastBalanceY = Math.max(lastBalanceY - minGap, padding.top + minGap / 2);
                }
            }
        }
        drawEndValue(
            ctx,
            lastBalanceX,
            lastBalanceY,
            lastBalance.value,
            balanceEndColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatBalanceValue,
            true
        );
    }

    if (contributionLegendDirty) {
        // Use gradient end colors for legend
        const contributionGradient = BALANCE_GRADIENTS['contribution'];
        const balanceGradient = BALANCE_GRADIENTS['balance'];
        const legendSeries = [
            {
                key: 'contribution',
                name: 'Contribution',
                color: contributionGradient ? contributionGradient[1] : colors.contribution,
            },
        ];
        if (showBalance && rawBalanceData.length > 0) {
            legendSeries.push({
                key: 'balance',
                name: 'Balance',
                color: balanceGradient ? balanceGradient[1] : colors.portfolio,
            });
        }
        legendSeries.push({ key: 'buy', name: 'Buy', color: colors.buy });
        legendSeries.push({ key: 'sell', name: 'Sell', color: colors.sell });
        updateLegend(legendSeries, chartManager);
        contributionLegendDirty = false;
    }

    if (contributionAnimationEnabled && hasAnimatedSeries) {
        scheduleContributionAnimation(chartManager);
    } else {
        stopContributionAnimation();
    }
}

async function drawPerformanceChart(ctx, chartManager, timestamp) {
    const performanceSeries =
        transactionState.performanceSeries && typeof transactionState.performanceSeries === 'object'
            ? transactionState.performanceSeries
            : {};

    const { chartVisibility } = transactionState;
    stopContributionAnimation();
    if (Object.keys(performanceSeries).length === 0) {
        stopPerformanceAnimation();
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
        return {
            key,
            name: key,
            data: points.map((point) => ({
                date: point.date,
                value: Number(point.value),
            })),
        };
    });

    const visibility = chartVisibility || {};
    const seriesToDraw = allPossibleSeries.filter((s) => visibility[s.key] !== false);

    if (seriesToDraw.length === 0 && allPossibleSeries.length > 0) {
        // Draw axes and legend only
    } else if (seriesToDraw.length === 0) {
        stopPerformanceAnimation();
        return;
    }

    const canvas = ctx.canvas;
    const emptyState = document.getElementById('runningAmountEmpty');
    if (emptyState) {
        emptyState.style.display = 'none';
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

    const cloneSeries = (series) => ({
        ...series,
        data: Array.isArray(series.data) ? series.data.map((point) => ({ ...point })) : [],
    });

    let normalizedSeriesToDraw = seriesToDraw.map(cloneSeries);

    if (filterFrom || filterTo) {
        normalizedSeriesToDraw = normalizedSeriesToDraw.map((series) => {
            const filteredData = series.data
                .map((d) => ({ ...d, date: new Date(d.date) }))
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

    const allTimes = allPoints.map((p) => new Date(p.date).getTime());
    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);
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

    const rootStyles = window.getComputedStyle(document.documentElement);
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

    const lineThickness = 2;
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
                  rawPoints.map((p) => ({ x: new Date(p.date).getTime(), y: p.value })),
                  smoothingConfig,
                  true // preserveEnd - keep the last point unchanged
              )
            : rawPoints.map((p) => ({ x: new Date(p.date).getTime(), y: p.value }));

        const points = smoothedPoints.map((p) => ({ date: new Date(p.x), value: p.y }));
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
            const time = new Date(point.date).getTime();
            const x = xScale(time);
            const y = yScale(point.value);
            return { x, y };
        });

        if (mountainFill.enabled) {
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
        });

        if (performanceAnimationEnabled) {
            glowAnimator.drawSeriesGlow(
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

    renderedSeries.forEach((series) => {
        const { x, y, color, value } = series;

        drawEndValue(
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
            false
        );
    });

    if (performanceLegendDirty) {
        const legendSeries = allPossibleSeries.map((s) => ({
            key: s.key,
            name: s.name,
            color: colorMap[s.key] || colors.contribution,
        }));
        updateLegend(legendSeries, chartManager);
        performanceLegendDirty = false;
    }
}

function drawCompositionChart(ctx, chartManager) {
    stopPerformanceAnimation();
    stopContributionAnimation();
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
            // const filteredTotalValues = filteredIndices.map((i) => data.total_values[i]);

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

            // Apply smoothing to composition data for each ticker
            const chartData = {};
            topTickers.forEach((ticker) => {
                const rawValues = filteredIndices.map((i) => data.composition[ticker][i] || 0);

                // Apply smoothing to the percentage data
                const compositionSmoothingConfig = getSmoothingConfig('composition');
                const smoothedValues =
                    rawValues.length > 2 && compositionSmoothingConfig
                        ? smoothFinancialData(
                              rawValues.map((value, index) => ({
                                  x: new Date(filteredDates[index]).getTime(),
                                  y: value,
                              })),
                              compositionSmoothingConfig,
                              true // preserveEnd - keep the last point unchanged
                          ).map((p) => p.y)
                        : rawValues;

                chartData[ticker] = smoothedValues;
            });

            // Create natural spectrum progression: deep blue -> deep green (highest to lowest weight)
            // Avoid extreme pale colors like white, light gray, and very pale tones for better visibility
            const colors = [
                // Deep blue (highest weight) - darkest, most saturated blues
                '#0F172A',
                '#1E293B',
                '#1E3A8A',
                '#1E40AF',
                '#2563EB',
                '#1A237E',
                '#283593',
                '#303F9F',
                '#3949AB',
                '#3F51B5',
                '#0D47A1',
                '#1565C0',
                '#1976D2',
                '#1E88E5',
                '#2196F3',

                // Dark blue - rich, deep blues
                '#0C4A6E',
                '#075985',
                '#0369A1',
                '#0284C7',
                '#0EA5E9',
                '#0D47A1',
                '#1565C0',
                '#1976D2',
                '#1E88E5',
                '#2196F3',
                '#42A5F5',
                '#64B5F6',
                '#90CAF9',

                // Blue - medium blues
                '#164E63',
                '#155E75',
                '#0E7490',
                '#0891B2',
                '#06B6D4',
                '#0F4C75',
                '#1A5F8A',
                '#2A7BA0',
                '#3B9BC7',
                '#4DB8E9',
                '#5DD3FC',
                '#7DE8FD',
                '#9DF6FE',

                // Light blue - vibrant lighter blues (avoiding very pale tones)
                '#1A5F7A',
                '#2A7BA0',
                '#3B9BC7',
                '#4DB8E9',
                '#5DD3FC',
                '#7DE8FD',
                '#9DF6FE',
                '#81D4FA',
                '#4FC3F7',
                '#29B6F6',

                // Light green - transition from blue to green (avoiding pale tones)
                '#00ACC1',
                '#00BCD4',
                '#26C6DA',
                '#4DD0E1',
                '#80DEEA',
                '#00BCD4',
                '#26C6DA',
                '#4DD0E1',
                '#80DEEA',

                // Cyan - blue-green transition (avoiding pale tones)
                '#0D7377',
                '#14A085',
                '#2DD4BF',
                '#5EEAD4',
                '#99F6E4',
                '#00ACC1',
                '#00BCD4',
                '#26C6DA',
                '#4DD0E1',
                '#80DEEA',

                // Green - vibrant greens
                '#166534',
                '#16A34A',
                '#22C55E',
                '#4ADE80',
                '#86EFAC',
                '#00E676',
                '#00C853',
                '#00A152',
                '#00897B',
                '#00695C',
                '#2E7D32',
                '#388E3C',
                '#43A047',
                '#4CAF50',
                '#66BB6A',

                // Dark green - deeper greens (avoiding pale tones)
                '#14532D',
                '#15803D',
                '#1B5E20',
                '#2E7D32',
                '#388E3C',
                '#43A047',
                '#4CAF50',
                '#66BB6A',
                '#81C784',
                '#A5D6A7',

                // Deep green (lowest weight) - darkest, most saturated greens
                '#0F3D2A',
                '#1A5F3A',
                '#2E7D32',
                '#388E3C',
                '#43A047',
                '#1B5E20',
                '#2E7D32',
                '#388E3C',
                '#43A047',
                '#4CAF50',
                '#2E7D32',
                '#388E3C',
                '#43A047',
                '#4CAF50',
                '#66BB6A',

                // Additional vibrant variations for smooth transitions (avoiding pale colors)
                '#0F172A',
                '#1E293B',
                '#1E3A8A',
                '#1E40AF',
                '#2563EB',
                '#0C4A6E',
                '#075985',
                '#0369A1',
                '#0284C7',
                '#0EA5E9',
                '#164E63',
                '#155E75',
                '#0E7490',
                '#0891B2',
                '#06B6D4',
                '#1A5F7A',
                '#2A7BA0',
                '#3B9BC7',
                '#4DB8E9',
                '#5DD3FC',
                '#00ACC1',
                '#00BCD4',
                '#26C6DA',
                '#4DD0E1',
                '#80DEEA',
                '#0D7377',
                '#14A085',
                '#2DD4BF',
                '#5EEAD4',
                '#99F6E4',
                '#166534',
                '#16A34A',
                '#22C55E',
                '#4ADE80',
                '#86EFAC',
                '#14532D',
                '#15803D',
                '#1B5E20',
                '#2E7D32',
                '#388E3C',
                '#0F3D2A',
                '#1A5F3A',
                '#2E7D32',
                '#388E3C',
                '#43A047',

                // Additional vibrant blues and greens to replace pale colors
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
                '#1A237E',
                '#283593',
                '#303F9F',
                '#3949AB',
                '#3F51B5',
                '#00E676',
                '#00C853',
                '#00A152',
                '#00897B',
                '#00695C',
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
                ctx.fillStyle = color + '80'; // Add 50% opacity
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
                // Only show composition hover when composition chart is active
                if (transactionState.activeChart !== 'composition') {
                    return;
                }

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
                // Only hide composition legend when composition chart is active
                if (transactionState.activeChart !== 'composition') {
                    return;
                }

                const legendElement = document.getElementById('dynamicLegend');
                if (legendElement) {
                    legendElement.style.display = 'none';
                }
            });

            // Show latest 6 largest holdings in proper legend format
            const latestIndex = filteredDates.length - 1;

            // Check if "Others" has any data
            const othersPercentage = chartData['Others']
                ? chartData['Others'][latestIndex] || 0
                : 0;

            // If "Others" is the dominant holding (>50%), include it in legend
            const shouldIncludeOthers = othersPercentage > 50;

            const latestHoldings = topTickers
                .filter((ticker) => shouldIncludeOthers || ticker !== 'Others') // Include Others if dominant
                .map((ticker) => ({
                    ticker,
                    percentage: chartData[ticker][latestIndex] || 0,
                }))
                .filter((holding) => holding.percentage > 0.1) // Back to 0.1% threshold
                .sort((a, b) => b.percentage - a.percentage)
                .slice(0, 6);

            // Create legend series in same format as other charts
            // If no holdings above threshold, show top holdings regardless of percentage
            const holdingsForLegend =
                latestHoldings.length > 0
                    ? latestHoldings
                    : topTickers
                          .filter((ticker) => shouldIncludeOthers || ticker !== 'Others') // Include Others if dominant
                          .map((ticker) => ({
                              ticker,
                              percentage: chartData[ticker][latestIndex] || 0,
                          }))
                          .sort((a, b) => b.percentage - a.percentage)
                          .slice(0, 6);

            const legendSeries = holdingsForLegend.map((holding) => {
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
        .catch(() => {
            // console.error('Error loading composition data:', error);
            emptyState.style.display = 'block';
        });
}

// --- Main Chart Manager ---

export function createChartManager() {
    let pendingFrame = null;

    const renderFrame = async (timestamp) => {
        pendingFrame = null;
        const canvas = document.getElementById('runningAmountCanvas');
        if (!canvas) {
            stopPerformanceAnimation();
            stopContributionAnimation();
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            stopPerformanceAnimation();
            stopContributionAnimation();
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const displayWidth = canvas.offsetWidth;
        const displayHeight = canvas.offsetHeight;

        if (displayWidth === 0 || displayHeight === 0) {
            stopPerformanceAnimation();
            stopContributionAnimation();
            return;
        }

        const targetWidth = Math.round(displayWidth * dpr);
        const targetHeight = Math.round(displayHeight * dpr);
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, displayWidth, displayHeight);

        if (transactionState.activeChart === 'performance') {
            await drawPerformanceChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'composition') {
            drawCompositionChart(ctx, chartManager);
        } else {
            await drawContributionChart(ctx, chartManager, timestamp);
        }
    };

    const chartManager = {
        update() {
            performanceLegendDirty = true;
            contributionLegendDirty = true;
            this.redraw();
        },

        redraw() {
            if (pendingFrame !== null) {
                return;
            }
            pendingFrame = requestAnimationFrame(renderFrame);
        },
    };

    return chartManager;
}
