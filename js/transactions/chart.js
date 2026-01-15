function niceNumber(range, round) {
    if (!Number.isFinite(range) || range === 0) {
        return 1;
    }
    const exponent = Math.floor(Math.log10(Math.abs(range)));
    const fraction = Math.abs(range) / 10 ** exponent;
    let niceFraction;
    if (round) {
        if (fraction < 1.5) {
            niceFraction = 1;
        } else if (fraction < 3) {
            niceFraction = 2;
        } else if (fraction < 7) {
            niceFraction = 5;
        } else {
            niceFraction = 10;
        }
    } else if (fraction <= 1) {
        niceFraction = 1;
    } else if (fraction <= 2) {
        niceFraction = 2;
    } else if (fraction <= 5) {
        niceFraction = 5;
    } else {
        niceFraction = 10;
    }
    return (range < 0 ? -1 : 1) * niceFraction * 10 ** exponent;
}

import {
    transactionState,
    setChartVisibility,
    setHistoricalPrices,
    setRunningAmountSeries,
    getShowChartLabels,
    getCompositionFilterTickers,
    getCompositionAssetClassFilter,
} from './state.js';
import { getSplitAdjustment } from './calculations.js';
import {
    formatCurrencyCompact,
    formatCurrencyInlineValue,
    formatCurrencyInline,
    convertValueToCurrency,
    convertBetweenCurrencies,
} from './utils.js';
import { smoothFinancialData } from '../utils/smoothing.js';
import { createGlowTrailAnimator } from '../plugins/glowTrailAnimator.js';
import { loadCompositionSnapshotData } from './dataLoader.js';
import {
    ANIMATED_LINE_SETTINGS,
    CHART_SMOOTHING,
    CHART_MARKERS,
    CONTRIBUTION_CHART_SETTINGS,
    mountainFill,
    COLOR_PALETTES,
    CROSSHAIR_SETTINGS,
    CHART_LINE_WIDTHS,
    getHoldingAssetClass,
} from '../config.js';

const chartLayouts = {
    contribution: null,
    performance: null,
    composition: null,
    compositionAbs: null,
    fx: null,
    drawdown: null,
    drawdownAbs: null,
};

let compositionDataCache = null;
let compositionDataLoading = false;

export const PERFORMANCE_SERIES_CURRENCY = {
    '^LZ': 'USD',
    '^DJI': 'USD',
    '^GSPC': 'USD',
    '^IXIC': 'USD',
    '^HSI': 'USD', // treat HKD as USD due to peg
    '^N225': 'JPY',
    '^SSEC': 'CNY',
};

const FX_CURRENCY_ORDER = ['USD', 'CNY', 'JPY', 'KRW'];
const FX_LINE_COLORS = {
    USD: '#FF8E53',
    CNY: '#ff4d4d',
    JPY: '#64b5f6',
    KRW: '#ffef2f',
};
const FX_GRADIENTS = {
    USD: ['#CC4E1F', '#FF9A62'],
    CNY: ['#7A0B0B', '#FF4D4D'],
    JPY: ['#0d3b66', '#64b5f6'],
    KRW: ['#fb8500', '#ffef2f'],
};

const crosshairState = {
    active: false,
    hoverTime: null,
    hoverY: null,
    dragging: false,
    rangeStart: null,
    rangeEnd: null,
    pointerId: null,
};

let crosshairElementsCache = null;
let pointerCanvas = null;
let pointerEventsAttached = false;
let crosshairExternalUpdate = null;
let containerPointerBound = false;
let crosshairChartManager = null;

const contributionSeriesCache = new WeakMap();

const crosshairDateFormatter =
    typeof Intl !== 'undefined'
        ? new Intl.DateTimeFormat('en-US', {
              year: 'numeric',
              month: 'short',
              day: '2-digit',
          })
        : null;

function getCrosshairElements() {
    if (crosshairElementsCache) {
        return crosshairElementsCache;
    }
    if (typeof document === 'undefined') {
        crosshairElementsCache = {
            info: null,
            date: null,
            values: null,
            range: null,
        };
        return crosshairElementsCache;
    }
    crosshairElementsCache = {
        info: document.getElementById('chartCrosshairInfo'),
        date: document.getElementById('chartCrosshairDate'),
        values: document.getElementById('chartCrosshairValues'),
        range: document.getElementById('chartRangeSummary'),
    };
    return crosshairElementsCache;
}

function parseLocalDate(value) {
    if (value instanceof Date) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (typeof value === 'number') {
        const temp = new Date(value);
        if (!Number.isNaN(temp.getTime())) {
            return new Date(temp.getFullYear(), temp.getMonth(), temp.getDate());
        }
        return null;
    }
    if (typeof value === 'string') {
        const parts = value.split('-');
        if (parts.length >= 3) {
            const year = Number(parts[0]);
            const month = Number(parts[1]) - 1;
            const day = Number(parts[2]);
            if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
                return new Date(year, month, day);
            }
        }
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        }
    }
    return null;
}

function clampTime(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return value;
    }
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
}

function createTimeInterpolator(points) {
    if (!Array.isArray(points) || points.length === 0) {
        return () => null;
    }
    const sorted = points.slice().sort((a, b) => a.time - b.time);
    return (time) => {
        if (!Number.isFinite(time)) {
            return null;
        }
        const clampedTime = clampTime(time, sorted[0].time, sorted[sorted.length - 1].time);
        let low = 0;
        let high = sorted.length - 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const midTime = sorted[mid].time;
            if (midTime === clampedTime) {
                return sorted[mid].value;
            }
            if (midTime < clampedTime) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        const leftIndex = Math.max(0, Math.min(sorted.length - 1, high));
        const rightIndex = Math.max(0, Math.min(sorted.length - 1, low));
        const leftPoint = sorted[leftIndex];
        const rightPoint = sorted[rightIndex] || leftPoint;
        if (!leftPoint || !rightPoint) {
            return null;
        }
        if (leftPoint.time === rightPoint.time) {
            return leftPoint.value;
        }
        const ratio = (clampedTime - leftPoint.time) / (rightPoint.time - leftPoint.time || 1e-12);
        return leftPoint.value + (rightPoint.value - leftPoint.value) * ratio;
    };
}

const DEFAULT_MONO_FONT = "'JetBrains Mono','IBM Plex Mono','Menlo',monospace";

function getMonoFontFamily() {
    if (typeof window !== 'undefined' && window.getComputedStyle) {
        const value = window
            .getComputedStyle(document.documentElement)
            .getPropertyValue('--font-family-mono');
        if (value && value.trim()) {
            return value.trim();
        }
    }
    return DEFAULT_MONO_FONT;
}

const formatPercentInline = (value) => {
    if (!Number.isFinite(value)) {
        return '0%';
    }
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${Math.abs(value).toFixed(2)}%`;
};

function formatFxValue(value) {
    if (!Number.isFinite(value)) {
        return '–';
    }
    const absValue = Math.abs(value);
    if (absValue >= 100) {
        return value.toFixed(1);
    }
    if (absValue >= 10) {
        return value.toFixed(2);
    }
    if (absValue >= 1) {
        return value.toFixed(3);
    }
    return value.toFixed(4);
}

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

function formatCrosshairDateLabel(time) {
    if (!Number.isFinite(time)) {
        return '';
    }
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    if (crosshairDateFormatter) {
        return crosshairDateFormatter.format(date);
    }
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function getActiveChartKey() {
    const active = transactionState.activeChart || 'contribution';
    if (
        active === 'performance' ||
        active === 'composition' ||
        active === 'compositionAbs' ||
        active === 'contribution' ||
        active === 'fx' ||
        active === 'drawdown' ||
        active === 'drawdownAbs'
    ) {
        return active;
    }
    return 'contribution';
}

function getActiveLayout() {
    const key = getActiveChartKey();
    return chartLayouts[key];
}

function buildRangeSummary(layout, rawStart, rawEnd) {
    if (!layout || !Array.isArray(layout.series) || layout.series.length === 0) {
        return null;
    }
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawStart === rawEnd) {
        return null;
    }

    const start = clampTime(Math.min(rawStart, rawEnd), layout.minTime, layout.maxTime);
    const end = clampTime(Math.max(rawStart, rawEnd), layout.minTime, layout.maxTime);
    if (start === end) {
        return null;
    }

    const entries = [];

    layout.series.forEach((series) => {
        if (series && series.includeInRangeSummary === false) {
            return;
        }
        if (typeof series.getValueAtTime !== 'function') {
            return;
        }
        const startValue = series.getValueAtTime(start);
        const endValue = series.getValueAtTime(end);
        if (
            startValue === null ||
            startValue === undefined ||
            endValue === null ||
            endValue === undefined
        ) {
            return;
        }
        const delta = endValue - startValue;
        let percent = null;
        if (layout.valueType === 'percent') {
            const startFactor = 1 + startValue / 100;
            const endFactor = 1 + endValue / 100;
            if (
                Number.isFinite(startFactor) &&
                Number.isFinite(endFactor) &&
                Math.abs(startFactor) > 1e-9
            ) {
                percent = (endFactor / startFactor - 1) * 100;
            }
        } else if (Number.isFinite(startValue) && Math.abs(startValue) > 1e-9) {
            percent = (delta / Math.abs(startValue)) * 100;
        }
        const formattedDelta = series.formatDelta
            ? series.formatDelta(delta, percent, start, end)
            : layout.valueType === 'percent' || layout.valueType === 'fx'
              ? formatPercentInline(delta)
              : formatCurrencyInline(delta);
        if (formattedDelta === null || formattedDelta === undefined) {
            return;
        }
        let formattedPercent =
            percent !== null && Number.isFinite(percent) ? formatPercentInline(percent) : null;
        if (layout.valueType === 'percent') {
            formattedPercent = null;
        }

        entries.push({
            key: series.key,
            label: series.label || series.key,
            color: series.color || '#ffffff',
            delta,
            percent,
            deltaFormatted: formattedDelta,
            percentFormatted: formattedPercent,
        });
    });

    if (entries.length === 0) {
        return null;
    }

    const durationMs = end - start;
    const durationDays = durationMs / (1000 * 60 * 60 * 24);

    return {
        start,
        end,
        durationMs,
        durationDays,
        entries,
    };
}

function updateCrosshairUI(snapshot, rangeSummary) {
    const elements = getCrosshairElements();
    const { info, range } = elements;

    if (info) {
        info.hidden = true;
    }
    if (range) {
        range.hidden = true;
    }

    if (typeof crosshairExternalUpdate === 'function') {
        crosshairExternalUpdate(snapshot, rangeSummary);
    }
}

function drawCrosshairOverlay(ctx, layout) {
    if (!layout) {
        updateCrosshairUI(null, null);
        return;
    }

    const showChartLabels = getShowChartLabels();
    const hasHover = crosshairState.active && Number.isFinite(crosshairState.hoverTime);
    const hasRange =
        Number.isFinite(crosshairState.rangeStart) && Number.isFinite(crosshairState.rangeEnd);

    if (!hasHover && !hasRange) {
        updateCrosshairUI(null, null);
        return;
    }

    const referenceTime = hasHover
        ? crosshairState.hoverTime
        : hasRange
          ? (crosshairState.rangeEnd ?? crosshairState.rangeStart)
          : null;

    if (!Number.isFinite(referenceTime)) {
        updateCrosshairUI(null, null);
        return;
    }

    const time = clampTime(referenceTime, layout.minTime, layout.maxTime);
    const x = layout.xScale(time);
    if (!Number.isFinite(x) || x < layout.chartBounds.left || x > layout.chartBounds.right) {
        updateCrosshairUI(null, null);
        return;
    }

    if (hasRange) {
        const startTime = clampTime(
            Math.min(crosshairState.rangeStart, crosshairState.rangeEnd),
            layout.minTime,
            layout.maxTime
        );
        const endTime = clampTime(
            Math.max(crosshairState.rangeStart, crosshairState.rangeEnd),
            layout.minTime,
            layout.maxTime
        );
        const startX = layout.xScale(startTime);
        const endX = layout.xScale(endTime);
        ctx.save();
        ctx.fillStyle = 'rgba(120, 145, 255, 0.12)';
        ctx.fillRect(
            Math.min(startX, endX),
            layout.chartBounds.top,
            Math.abs(endX - startX),
            layout.chartBounds.bottom - layout.chartBounds.top
        );
        ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = CHART_LINE_WIDTHS.crosshairMarker ?? 1;
    ctx.beginPath();
    ctx.moveTo(x, layout.chartBounds.top);
    ctx.lineTo(x, layout.chartBounds.bottom);
    ctx.stroke();
    ctx.restore();

    const seriesSnapshot = [];
    const isCompositionLayout = layout.key === 'composition' || layout.key === 'compositionAbs';

    // Special handling for composition charts to show holdings breakdown at the crosshair time
    if (isCompositionLayout) {
        const crosshairDate = new Date(time);
        const selectedCurrency = layout.currency || transactionState.selectedCurrency || 'USD';
        const isAbsoluteMode = layout.valueMode === 'absolute';
        // Get values at the current time for all series
        const valuesAtTime = [];
        layout.series.forEach((series) => {
            if (typeof series.getValueAtTime !== 'function') {
                return;
            }
            const value = series.getValueAtTime(time);
            // For composition chart, include all non-null values, even if very small
            // This ensures holdings like FNSFX at 100% on Jan 01, 2021 are shown
            if (value === null || value === undefined) {
                return;
            }

            valuesAtTime.push({
                key: series.key,
                label: series.label || series.key,
                color: series.color || '#ffffff',
                value,
                formatted: series.formatValue
                    ? series.formatValue(value, time)
                    : layout.valueType === 'percent' || layout.valueType === 'fx'
                      ? formatPercentInline(value)
                      : formatCurrencyInline(value),
            });
        });

        // Filter out holdings that had 0% allocation at this time (were not held)
        // Only keep holdings that had actual positive allocation
        const nonZeroHoldings = valuesAtTime.filter((item) => item.value > 0.1); // Using higher threshold to avoid noise

        // Sort by value (percentage) in descending order and take up to 7 (or fewer if less available)
        const topHoldings = nonZeroHoldings.sort((a, b) => b.value - a.value).slice(0, 7);

        const totalValueRaw =
            typeof layout.getTotalValueAtTime === 'function'
                ? layout.getTotalValueAtTime(time)
                : null;
        const totalValueBase = Number.isFinite(totalValueRaw) ? totalValueRaw : 0;

        const enhancedHoldings = topHoldings.map((holding) => {
            const absoluteValue = isAbsoluteMode
                ? holding.value
                : convertValueToCurrency(
                      (totalValueBase * holding.value) / 100,
                      crosshairDate,
                      selectedCurrency
                  );
            const percentValue =
                totalValueBase > 0
                    ? isAbsoluteMode
                        ? (holding.value / totalValueBase) * 100
                        : holding.value
                    : 0;
            const currencyText = formatCurrencyInline(absoluteValue);
            const percentText = `${percentValue.toFixed(2)}%`;
            return {
                ...holding,
                absoluteValue,
                formatted: `${currencyText} (${percentText})`,
                percentValue,
            };
        });

        // Add to seriesSnapshot - show only available holdings (may be fewer than 7)
        // For composition chart, we need to calculate the correct Y position based on the original rendering order.
        // Get all values at the crosshair time to calculate cumulative positions.
        const valuesAtTimeMap = new Map();
        for (const series of layout.series) {
            const value = series.getValueAtTime(time);
            if (value !== null && value !== undefined) {
                valuesAtTimeMap.set(series.key, { value, series });
            }
        }

        // In a stacked area chart:
        // 1. Components are rendered in a specific order (bottom to top).
        // 2. Each component's visual position depends on the cumulative sum of all components BELOW it.
        // 3. The crosshair dot for a component should appear at the TOP of that component's area.
        // 4. The dot color should match the component's color in the chart.
        const topHoldingsKeys = new Set(enhancedHoldings.map((h) => h.key));
        const boundsHeight = layout.chartBounds
            ? layout.chartBounds.bottom - layout.chartBounds.top
            : 0;
        const stackMaxValue =
            layout && Number.isFinite(layout.stackMaxValue) ? layout.stackMaxValue : 100;
        const pointerStackValue =
            Number.isFinite(crosshairState.hoverY) && boundsHeight > 0
                ? ((layout.chartBounds.bottom - crosshairState.hoverY) / boundsHeight) *
                  stackMaxValue
                : null;
        let cumulativeValue = 0;
        let pointerHolding = null;

        for (const series of layout.series) {
            const seriesData = valuesAtTimeMap.get(series.key);
            if (!seriesData) {
                continue;
            }

            const { value: componentValue } = seriesData;

            if (topHoldingsKeys.has(series.key)) {
                const dotPositionValue = cumulativeValue + componentValue;
                const y = layout.yScale(dotPositionValue);

                if (Number.isFinite(y) && series.drawMarker !== false) {
                    ctx.save();
                    ctx.fillStyle = series.color || '#ffffff';
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
                    ctx.lineWidth = CHART_LINE_WIDTHS.crosshairMarker ?? 2;
                    ctx.beginPath();
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
            }

            if (
                pointerHolding === null &&
                Number.isFinite(pointerStackValue) &&
                componentValue > 0
            ) {
                const clampedValue = Math.max(0, Math.min(stackMaxValue, pointerStackValue));
                const lowerBound = cumulativeValue;
                const upperBound = cumulativeValue + componentValue;
                const epsilon = Math.max(stackMaxValue * 1e-4, 1e-4);
                if (clampedValue >= lowerBound - epsilon && clampedValue <= upperBound + epsilon) {
                    const absoluteValue = isAbsoluteMode
                        ? componentValue
                        : convertValueToCurrency(
                              (totalValueBase * componentValue) / 100,
                              crosshairDate,
                              selectedCurrency
                          );
                    const percentValue =
                        totalValueBase > 0
                            ? isAbsoluteMode
                                ? (componentValue / totalValueBase) * 100
                                : componentValue
                            : 0;
                    pointerHolding = {
                        key: series.key,
                        label: series.label || series.key,
                        color: series.color || '#ffffff',
                        percent: percentValue,
                        absoluteValue,
                        formattedPercent: `${percentValue.toFixed(2)}%`,
                        formattedValue: formatCurrencyInline(absoluteValue),
                        dotY: layout.yScale(cumulativeValue + componentValue),
                    };
                }
            }

            cumulativeValue += componentValue;
        }

        if (showChartLabels && pointerHolding) {
            drawCompositionHoverPanel(ctx, layout, x, pointerHolding.dotY, time, pointerHolding);
        }

        // Add this item to the crosshair display (sorted by value at crosshair time)
        seriesSnapshot.push(...enhancedHoldings);
    } else {
        // Original behavior for other charts
        layout.series.forEach((series) => {
            if (typeof series.getValueAtTime !== 'function') {
                return;
            }
            const value = series.getValueAtTime(time);
            if (value === null || value === undefined) {
                return;
            }
            const y = layout.yScale(value);
            if (Number.isFinite(y) && series.drawMarker !== false) {
                ctx.save();
                ctx.fillStyle = series.color || '#ffffff';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
            const formatted = series.formatValue
                ? series.formatValue(value, time)
                : layout.valueType === 'percent' || layout.valueType === 'fx'
                  ? formatPercentInline(value)
                  : formatCurrencyInline(value);
            seriesSnapshot.push({
                key: series.key,
                label: series.label || series.key,
                color: series.color || '#ffffff',
                value,
                formatted,
            });
        });

        if (layout.key === 'contribution' && seriesSnapshot.length > 1) {
            const priorityMap = new Map([
                ['buyVolume', 0],
                ['sellVolume', 1],
                ['contribution', 2],
                ['balance', 3],
            ]);
            seriesSnapshot.sort((a, b) => {
                const priorityA = priorityMap.has(a.key) ? priorityMap.get(a.key) : 99;
                const priorityB = priorityMap.has(b.key) ? priorityMap.get(b.key) : 99;
                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }
                return (a.label || '').localeCompare(b.label || '');
            });
        }
    }

    const snapshot =
        seriesSnapshot.length > 0
            ? {
                  time,
                  label: formatCrosshairDateLabel(time),
                  series: seriesSnapshot,
              }
            : null;

    let rangeSummary = null;
    // Skip range summary for composition chart
    if (
        hasRange &&
        crosshairState.rangeStart !== crosshairState.rangeEnd &&
        layout.key !== 'composition' &&
        layout.key !== 'compositionAbs'
    ) {
        rangeSummary = buildRangeSummary(
            layout,
            crosshairState.rangeStart,
            crosshairState.rangeEnd
        );
    }

    updateCrosshairUI(snapshot, rangeSummary);
}

function drawCompositionHoverPanel(ctx, layout, crosshairX, crosshairY, time, holding) {
    if (!holding) {
        return;
    }
    const dateLabel = formatCrosshairDateLabel(time);
    const bounds = layout.chartBounds;
    if (!bounds || !dateLabel) {
        return;
    }

    const isMobile = window.innerWidth <= 768;
    const fontFamily = getMonoFontFamily();
    const lineFontSize = isMobile ? 10 : 11;
    const paddingConfig = CROSSHAIR_SETTINGS.compositionHoverPadding || {};
    const paddingX = isMobile ? (paddingConfig.mobile?.x ?? 10) : (paddingConfig.desktop?.x ?? 12);
    const paddingY = isMobile ? (paddingConfig.mobile?.y ?? 8) : (paddingConfig.desktop?.y ?? 10);
    const lineGapConfig = CROSSHAIR_SETTINGS.compositionHoverLineGap || {};
    const lineGap = isMobile ? (lineGapConfig.mobile ?? 4) : (lineGapConfig.desktop ?? 6);
    const dotRadius = 4;
    const dotGap = 6;
    const markerOffset = dotRadius * 2 + dotGap;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.font = `${lineFontSize}px ${fontFamily}`;
    let contentWidth = ctx.measureText(dateLabel).width;

    const label = holding.label || holding.key || '';
    const percentText = holding.formattedPercent || `${holding.percent?.toFixed?.(2) ?? 0}%`;

    ctx.font = `${lineFontSize}px ${fontFamily}`;
    let absoluteText = holding.formattedValue || null;
    if (!absoluteText || !absoluteText.trim()) {
        const rawValue = Number.isFinite(holding.absoluteValue) ? holding.absoluteValue : null;
        absoluteText = formatCurrencyInline(rawValue);
    }
    const detailLine = `${label} ${absoluteText} (${percentText})`;
    const detailLineWidth = markerOffset + ctx.measureText(detailLine).width;
    contentWidth = Math.max(contentWidth, detailLineWidth);

    const boxWidth = paddingX * 2 + contentWidth;
    const boxHeight = paddingY * 2 + lineFontSize * 2 + lineGap;

    const preferRight = crosshairX < bounds.left + (bounds.right - bounds.left) / 2;
    let boxX = preferRight ? crosshairX + 12 : crosshairX - boxWidth - 12;
    boxX = Math.max(bounds.left + 4, Math.min(boxX, bounds.right - boxWidth - 4));

    let boxY = crosshairY - boxHeight / 2;
    const minY = bounds.top + 6;
    const maxY = bounds.bottom - boxHeight - 6;
    boxY = Math.max(minY, Math.min(boxY, maxY));

    const backgroundColor = CROSSHAIR_SETTINGS.compositionHoverBackground || 'rgba(6, 9, 22, 0.8)';
    const borderColor = CROSSHAIR_SETTINGS.compositionHoverBorder || 'rgba(255,255,255,0.08)';
    const cornerRadius = CROSSHAIR_SETTINGS.compositionHoverCornerRadius ?? 6;

    ctx.fillStyle = backgroundColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, cornerRadius);
        ctx.fill();
        ctx.stroke();
    } else {
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    }

    ctx.font = `${lineFontSize}px ${fontFamily}`;
    ctx.fillStyle = 'rgba(248, 250, 252, 0.78)';
    const headerY = boxY + paddingY + lineFontSize / 2;
    ctx.fillText(dateLabel, boxX + paddingX, headerY);

    ctx.font = `${lineFontSize}px ${fontFamily}`;
    ctx.fillStyle = 'rgba(241, 245, 249, 0.78)';
    const lineY = headerY + lineFontSize / 2 + lineGap + lineFontSize / 2;
    const dotX = boxX + paddingX + dotRadius;
    ctx.beginPath();
    ctx.fillStyle = holding.color || '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.arc(dotX, lineY, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(241, 245, 249, 0.78)';
    const textX = dotX + dotRadius + dotGap;
    ctx.fillText(detailLine, textX, lineY);

    ctx.restore();
}

function requestChartRedraw() {
    if (crosshairChartManager && typeof crosshairChartManager.redraw === 'function') {
        crosshairChartManager.redraw();
    }
}

function handleContainerLeave() {
    if (crosshairState.dragging) {
        return;
    }
    crosshairState.active = false;
    crosshairState.hoverTime = null;
    crosshairState.hoverY = null;
    crosshairState.rangeStart = null;
    crosshairState.rangeEnd = null;
    requestChartRedraw();
}

function handlePointerMove(event) {
    if (!pointerCanvas) {
        return;
    }
    const layout = getActiveLayout();
    if (!layout) {
        updateCrosshairUI(null, null);
        return;
    }
    if (event.pointerType === 'touch') {
        event.preventDefault();
    }
    const rect = pointerCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const insideX = x >= layout.chartBounds.left && x <= layout.chartBounds.right;
    const insideY = y >= layout.chartBounds.top && y <= layout.chartBounds.bottom;

    if (!insideX || !insideY) {
        if (!crosshairState.dragging) {
            crosshairState.active = false;
            crosshairState.hoverTime = null;
        }
        requestChartRedraw();
        return;
    }

    const time = layout.invertX ? layout.invertX(x) : null;
    if (!Number.isFinite(time)) {
        return;
    }

    crosshairState.active = true;
    crosshairState.hoverTime = time;
    crosshairState.hoverY = Math.max(
        layout.chartBounds.top,
        Math.min(y, layout.chartBounds.bottom)
    );

    // Skip range functionality for composition charts
    if (layout.key === 'composition' || layout.key === 'compositionAbs') {
        crosshairState.dragging = false;
        crosshairState.rangeStart = null;
        crosshairState.rangeEnd = null;
    } else if (crosshairState.dragging) {
        crosshairState.rangeEnd = time;
    }

    requestChartRedraw();
}

function handlePointerLeave() {
    if (crosshairState.dragging) {
        return;
    }
    crosshairState.active = false;
    crosshairState.hoverTime = null;
    crosshairState.hoverY = null;
    requestChartRedraw();
}

function handlePointerDown(event) {
    const layout = getActiveLayout();
    if (!layout) {
        return;
    }
    if (event.pointerType === 'touch') {
        event.preventDefault();
    }
    if (pointerCanvas && pointerCanvas.setPointerCapture) {
        pointerCanvas.setPointerCapture(event.pointerId);
    }
    const rect = pointerCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const insideX = x >= layout.chartBounds.left && x <= layout.chartBounds.right;
    const insideY = y >= layout.chartBounds.top && y <= layout.chartBounds.bottom;
    if (!insideX || !insideY) {
        return;
    }
    const time = layout.invertX ? layout.invertX(x) : null;
    if (!Number.isFinite(time)) {
        return;
    }

    // Skip range functionality for composition charts
    if (layout.key === 'composition' || layout.key === 'compositionAbs') {
        crosshairState.pointerId = event.pointerId;
        crosshairState.active = true;
        crosshairState.hoverTime = time;
        crosshairState.hoverY = Math.max(
            layout.chartBounds.top,
            Math.min(y, layout.chartBounds.bottom)
        );
        crosshairState.rangeStart = null;
        crosshairState.rangeEnd = null;
        requestChartRedraw();
        return;
    }

    crosshairState.pointerId = event.pointerId;
    crosshairState.active = true;
    crosshairState.dragging = true;
    crosshairState.hoverTime = time;
    crosshairState.hoverY = Math.max(
        layout.chartBounds.top,
        Math.min(y, layout.chartBounds.bottom)
    );
    crosshairState.rangeStart = time;
    crosshairState.rangeEnd = time;
    requestChartRedraw();
}

function handlePointerUp(event) {
    if (pointerCanvas && pointerCanvas.releasePointerCapture) {
        try {
            pointerCanvas.releasePointerCapture(event.pointerId);
        } catch {
            // Ignore release errors
        }
    }
    const layout = getActiveLayout();
    if (layout) {
        const rect = pointerCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const time = layout.invertX ? layout.invertX(x) : null;
        if (Number.isFinite(time)) {
            crosshairState.hoverTime = time;
        }
        crosshairState.hoverY = Math.max(
            layout.chartBounds.top,
            Math.min(y, layout.chartBounds.bottom)
        );
    }

    // Skip range functionality for composition charts
    if (layout && (layout.key === 'composition' || layout.key === 'compositionAbs')) {
        crosshairState.dragging = false;
        crosshairState.rangeStart = null;
        crosshairState.rangeEnd = null;
    } else {
        crosshairState.dragging = false;
        const hasRangeSelection =
            Number.isFinite(crosshairState.rangeStart) &&
            Number.isFinite(crosshairState.rangeEnd) &&
            Math.abs(crosshairState.rangeEnd - crosshairState.rangeStart) >= 1;
        if (!hasRangeSelection) {
            crosshairState.rangeStart = null;
            crosshairState.rangeEnd = null;
        }
    }

    crosshairState.pointerId = null;
    requestChartRedraw();
}

function handleDoubleClick() {
    crosshairState.rangeStart = null;
    crosshairState.rangeEnd = null;
    crosshairState.hoverTime = null;
    crosshairState.hoverY = null;
    crosshairState.active = false;
    crosshairState.dragging = false;
    updateCrosshairUI(null, null);
    requestChartRedraw();
}

function attachCrosshairEvents(canvas, chartManager) {
    if (!canvas) {
        return;
    }
    pointerCanvas = canvas;
    crosshairChartManager = chartManager;
    if (pointerEventsAttached) {
        return;
    }
    canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('dblclick', handleDoubleClick);
    const container = canvas.closest('.chart-container');
    if (container && !containerPointerBound) {
        container.addEventListener('pointerleave', handleContainerLeave);
        containerPointerBound = true;
    }
    pointerEventsAttached = true;
}

export function hasActiveTransactionFilters() {
    const allTransactions = transactionState.allTransactions || [];
    const filteredTransactions = transactionState.filteredTransactions || [];
    if (!allTransactions.length) {
        return false;
    }
    return (
        filteredTransactions.length > 0 && filteredTransactions.length !== allTransactions.length
    );
}

export function getContributionSeriesForTransactions(
    transactions,
    { includeSyntheticStart = false, padToDate = null, currency = null } = {}
) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }
    const splitHistoryRef = transactionState.splitHistory;
    const cached = contributionSeriesCache.get(transactions);
    const targetCurrency = currency || transactionState.selectedCurrency || 'USD';
    if (
        cached &&
        cached.splitHistory === splitHistoryRef &&
        cached.includeSyntheticStart === includeSyntheticStart &&
        cached.padToDate === padToDate &&
        cached.currency === targetCurrency
    ) {
        return cached.series;
    }
    const series = buildContributionSeriesFromTransactions(transactions, {
        includeSyntheticStart,
        padToDate,
        currency: targetCurrency,
    });
    contributionSeriesCache.set(transactions, {
        splitHistory: splitHistoryRef,
        includeSyntheticStart,
        padToDate,
        currency: targetCurrency,
        series,
    });
    return series;
}

export function buildContributionSeriesFromTransactions(
    transactions,
    { includeSyntheticStart = false, padToDate = null, currency = null } = {}
) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }

    const sortedTransactions = [...transactions].sort(
        (a, b) =>
            new Date(a.tradeDate) - new Date(b.tradeDate) ||
            (a.transactionId ?? 0) - (b.transactionId ?? 0)
    );

    // Consolidate transactions by date
    const dailyMap = new Map();
    sortedTransactions.forEach((t) => {
        const dateStr = t.tradeDate;
        if (!dailyMap.has(dateStr)) {
            dailyMap.set(dateStr, {
                netAmount: 0,
                orderTypes: new Set(),
                buyVolume: 0,
                sellVolume: 0,
            });
        }
        const entry = dailyMap.get(dateStr);
        const amount = Number.parseFloat(t.netAmount) || 0;
        entry.netAmount += amount;
        entry.orderTypes.add(t.orderType);

        const type = String(t.orderType).toLowerCase();
        if (type === 'buy') {
            entry.buyVolume += Math.abs(amount);
        } else if (type === 'sell') {
            entry.sellVolume += Math.abs(amount);
        }
    });

    const uniqueDates = Array.from(dailyMap.keys()).sort((a, b) => new Date(a) - new Date(b));
    const series = [];
    let cumulativeAmount = 0;

    uniqueDates.forEach((dateStr, index) => {
        const entry = dailyMap.get(dateStr);
        const netDelta = entry.netAmount;

        if (index > 0) {
            const prevDateStr = uniqueDates[index - 1];
            const prevDate = new Date(prevDateStr);
            const currentDate = new Date(dateStr);

            if (prevDate.toISOString().split('T')[0] !== currentDate.toISOString().split('T')[0]) {
                const intermediateDate = new Date(currentDate);
                intermediateDate.setDate(intermediateDate.getDate() - 1);

                // Only add padding if there is actually a gap > 1 day
                const prevPlusOne = new Date(prevDate);
                prevPlusOne.setDate(prevPlusOne.getDate() + 1);

                if (intermediateDate > prevDate) {
                    series.push({
                        tradeDate: intermediateDate.toISOString().split('T')[0],
                        amount: cumulativeAmount,
                        orderType: 'padding',
                        netAmount: 0,
                    });
                }
            }
        }

        cumulativeAmount += netDelta;

        // Determine a representative order type for the consolidated point
        let orderType = 'mixed';
        if (entry.orderTypes.size === 1) {
            orderType = entry.orderTypes.values().next().value;
        } else if (entry.orderTypes.size > 0) {
            const types = Array.from(entry.orderTypes).map((t) => String(t).toLowerCase());
            if (types.every((t) => t === 'buy')) {
                orderType = 'buy';
            } else if (types.every((t) => t === 'sell')) {
                orderType = 'sell';
            }
        }

        series.push({
            tradeDate: dateStr,
            amount: cumulativeAmount,
            orderType: orderType,
            netAmount: netDelta,
            buyVolume: entry.buyVolume,
            sellVolume: entry.sellVolume,
        });
    });

    const lastPoint = series[series.length - 1];
    if (lastPoint) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDateRaw = padToDate ? new Date(padToDate) : today;
        const targetDate = Number.isNaN(targetDateRaw.getTime()) ? today : targetDateRaw;
        targetDate.setHours(0, 0, 0, 0);
        const clampedTarget = targetDate > today ? today : targetDate;
        const lastTransactionDate = new Date(lastPoint.tradeDate);

        if (clampedTarget > lastTransactionDate) {
            series.push({
                tradeDate: clampedTarget.toISOString().split('T')[0],
                amount: lastPoint.amount,
                orderType: 'padding',
                netAmount: 0,
            });
        }
    }

    if (includeSyntheticStart && series.length > 0) {
        const epsilon = 1e-6;
        const firstActual =
            series.find((point) => (point.orderType || '').toLowerCase() !== 'padding') ||
            series[0];
        const firstValue = Number(firstActual?.amount) || 0;
        const firstDate = new Date(firstActual?.tradeDate || firstActual?.date);
        if (!Number.isNaN(firstDate.getTime()) && Math.abs(firstValue) > epsilon) {
            const syntheticDate = new Date(firstDate);
            syntheticDate.setDate(syntheticDate.getDate() - 1);
            const syntheticDateStr = syntheticDate.toISOString().split('T')[0];
            const existing = series.find((point) => point.tradeDate === syntheticDateStr);
            if (!existing) {
                series.unshift({
                    tradeDate: syntheticDateStr,
                    amount: 0,
                    orderType: 'padding',
                    netAmount: 0,
                    synthetic: true,
                });
            }
        }
    }

    const selectedCurrency = currency || transactionState.selectedCurrency || 'USD';
    if (selectedCurrency === 'USD') {
        return series;
    }

    let cumulative = 0;
    return series.map((point) => {
        const dateRef = point.tradeDate || point.date;
        const convertedNet = convertValueToCurrency(point.netAmount, dateRef, selectedCurrency);
        cumulative += convertedNet;
        return {
            ...point,
            netAmount: convertedNet,
            amount: cumulative,
        };
    });
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

export function buildFilteredBalanceSeries(transactions, historicalPrices, splitHistory) {
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
    const lastKnownPrices = new Map(); // Track last known price from transactions
    const series = [];
    const iterationStart = new Date(firstDate);
    iterationStart.setDate(iterationStart.getDate() - 1);

    const iterDate = new Date(iterationStart);

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
                // Adjust last known price for split
                const lastPrice = lastKnownPrices.get(symbol);
                if (lastPrice !== undefined && multiplier > 0) {
                    lastKnownPrices.set(symbol, lastPrice / multiplier);
                }
            });
        }

        const todaysTransactions = transactionsByDate.get(dateStr) || [];
        todaysTransactions.forEach((txn) => {
            const normalizedSymbol = normalizeSymbolForPricing(txn.security);
            const quantity = parseFloat(txn.quantity) || 0;
            const txnPrice = parseFloat(txn.price);
            if (!Number.isFinite(quantity) || quantity === 0) {
                return;
            }
            // Update last known price from this transaction
            if (Number.isFinite(txnPrice) && txnPrice > 0) {
                lastKnownPrices.set(normalizedSymbol, txnPrice);
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
            let price = getPriceFromHistoricalData(historicalPrices, symbol, dateStr);
            // Fallback to last known transaction price if historical price unavailable
            if (price === null) {
                price = lastKnownPrices.get(symbol) ?? null;
            }
            if (price === null) {
                return;
            }
            const adjustment = getSplitAdjustment(splitHistory, symbol, dateStr);
            totalValue += qty * price * adjustment;
        });

        series.push({ date: dateStr, value: totalValue });
        iterDate.setDate(iterDate.getDate() + 1);
    }

    const epsilon = 1e-6;
    let keepSyntheticStart = false;
    for (let i = 0; i < series.length; i += 1) {
        const point = series[i];
        if (!point || !Number.isFinite(point.value)) {
            continue;
        }
        if (Math.abs(point.value) > epsilon) {
            if (i > 0 && Math.abs(series[i - 1]?.value || 0) <= epsilon) {
                keepSyntheticStart = true;
            }
            break;
        }
    }

    if (keepSyntheticStart && series.length > 0) {
        series[0].synthetic = true;
    } else if (series.length > 0 && Math.abs(series[0].value || 0) <= epsilon) {
        series.shift();
    }

    return series;
}

// --- Helper Functions ---

// --- Drawdown Calculation Helper ---

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

export function injectSyntheticStartPoint(filteredData, fullSeries, filterFrom = null) {
    if (!Array.isArray(filteredData) || filteredData.length === 0) {
        return filteredData;
    }
    if (!Array.isArray(fullSeries) || fullSeries.length === 0) {
        return filteredData;
    }

    const firstFiltered = filteredData[0];
    const firstTime =
        firstFiltered && firstFiltered.date instanceof Date
            ? firstFiltered.date.getTime()
            : new Date(firstFiltered.date).getTime();
    if (!Number.isFinite(firstTime)) {
        return filteredData;
    }

    const matchingIndex = fullSeries.findIndex((item) => {
        if (!item) {
            return false;
        }
        const itemDate = new Date(item.date);
        if (Number.isNaN(itemDate.getTime())) {
            return false;
        }
        return itemDate.getTime() === firstTime;
    });

    if (matchingIndex <= 0) {
        return filteredData;
    }

    const previousPoint = fullSeries[matchingIndex - 1];
    if (!previousPoint || !previousPoint.synthetic) {
        return filteredData;
    }

    const prevDate = new Date(previousPoint.date);
    if (Number.isNaN(prevDate.getTime())) {
        return filteredData;
    }

    // If we have a filterFrom date and the synthetic point is before it, clamp it to filterFrom
    // This fixes the "left-edge overhang" where the line starts to the left of the Y-axis
    if (filterFrom && prevDate < filterFrom) {
        // Check if we already have a point at filterFrom to avoid duplicates
        const firstFiltered = filteredData[0];
        const firstTime =
            firstFiltered && firstFiltered.date instanceof Date
                ? firstFiltered.date.getTime()
                : new Date(firstFiltered.date).getTime();

        if (Math.abs(firstTime - filterFrom.getTime()) < 1000) {
            return filteredData;
        }

        return [
            {
                ...previousPoint,
                date: new Date(filterFrom),
                synthetic: true,
            },
            ...filteredData,
        ];
    }

    const prevValue = Number(previousPoint.value);
    const epsilon = 1e-6;
    if (!Number.isFinite(prevValue) || Math.abs(prevValue) > epsilon) {
        return filteredData;
    }

    // Don't add the synthetic point if it would be at the same position as the first filtered point
    if (
        filteredData[0].date instanceof Date &&
        filteredData[0].date.getTime() === prevDate.getTime()
    ) {
        return filteredData;
    }

    // Only add synthetic point if it's within the filter range
    // Note: The clamping logic above handles the case where prevDate < filterFrom
    if (filterFrom && prevDate < filterFrom) {
        // This block is now redundant due to the clamping above, but keeping for safety
        // in case the logic flow changes.
        return filteredData;
    }

    const syntheticPoint = {
        date: prevDate,
        value: Number.isFinite(prevValue) ? prevValue : 0,
        synthetic: true,
    };

    return [syntheticPoint, ...filteredData];
}

function constrainSeriesToRange(series, rangeStart, rangeEnd) {
    if (!Array.isArray(series) || (!rangeStart && !rangeEnd)) {
        return series;
    }

    const startTime =
        rangeStart instanceof Date && Number.isFinite(rangeStart.getTime())
            ? rangeStart.getTime()
            : null;
    const endTime =
        rangeEnd instanceof Date && Number.isFinite(rangeEnd.getTime()) ? rangeEnd.getTime() : null;

    if (!Number.isFinite(startTime) && !Number.isFinite(endTime)) {
        return series;
    }

    return series.filter((point) => {
        if (!point) {
            return false;
        }
        const pointDate = point.date instanceof Date ? point.date : new Date(point.date);
        const time = pointDate.getTime();
        if (Number.isNaN(time)) {
            return false;
        }
        if (Number.isFinite(startTime) && time < startTime) {
            return false;
        }
        if (Number.isFinite(endTime) && time > endTime) {
            return false;
        }
        return true;
    });
}

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

function parseColorToRgb(baseColor) {
    if (typeof baseColor !== 'string' || baseColor.length === 0) {
        return null;
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
        return {
            r: (intVal >> 16) & 255,
            g: (intVal >> 8) & 255,
            b: intVal & 255,
        };
    }

    const rgbMatch = baseColor.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(',');
        if (parts.length >= 3) {
            return {
                r: componentFromChannel(parts[0]),
                g: componentFromChannel(parts[1]),
                b: componentFromChannel(parts[2]),
            };
        }
    }

    if (!COLOR_PARSER_CONTEXT) {
        return null;
    }

    const ctx = COLOR_PARSER_CONTEXT;
    ctx.save();
    try {
        ctx.fillStyle = baseColor;
        const computed = ctx.fillStyle;
        ctx.restore();
        if (computed && computed !== baseColor) {
            return parseColorToRgb(computed);
        }
    } catch {
        ctx.restore();
        return null;
    }
    return null;
}

function lightenColor(baseColor, amount = 0.3) {
    const components = parseColorToRgb(baseColor);
    if (!components) {
        return baseColor;
    }
    const ratio = clamp01(amount);
    const mixChannel = (value) => Math.round(value + (255 - value) * ratio);
    const r = mixChannel(components.r);
    const g = mixChannel(components.g);
    const b = mixChannel(components.b);
    return `rgb(${r}, ${g}, ${b})`;
}

function darkenColor(baseColor, amount = 0.3) {
    const components = parseColorToRgb(baseColor);
    if (!components) {
        return baseColor;
    }
    const ratio = clamp01(amount);
    const mixChannel = (value) => Math.round(value * (1 - ratio));
    const r = mixChannel(components.r);
    const g = mixChannel(components.g);
    const b = mixChannel(components.b);
    return `rgb(${r}, ${g}, ${b})`;
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
    const methodConfig = CHART_SMOOTHING.methods[methodName] || CHART_SMOOTHING.methods.balanced;
    if (!methodConfig || methodConfig.method === 'none') {
        return null;
    }
    return methodConfig;
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

function stopFxAnimation() {
    glowAnimator.stop('fx');
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

function scheduleFxAnimation(chartManager) {
    if (!isAnimationEnabled('fx')) {
        glowAnimator.stop('fx');
        return;
    }
    glowAnimator.schedule('fx', chartManager, {
        isActive: () => transactionState.activeChart === 'fx',
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

function advanceFxAnimation(timestamp) {
    if (!isAnimationEnabled('fx')) {
        return 0;
    }
    return glowAnimator.advance('fx', timestamp);
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
                if (
                    transactionState.activeChart === 'performance' ||
                    transactionState.activeChart === 'drawdown'
                ) {
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
    const fontFamily = getMonoFontFamily();

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
    const fontFamily = getMonoFontFamily();

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

function computePercentTickInfo(yMin, yMax) {
    const safeMin = Number.isFinite(yMin) ? Number(yMin) : 0;
    const safeMax = Number.isFinite(yMax) ? Number(yMax) : safeMin;
    let minValue = Math.min(safeMin, safeMax);
    let maxValue = Math.max(safeMin, safeMax);
    if (!Number.isFinite(minValue)) {
        minValue = 0;
    }
    if (!Number.isFinite(maxValue)) {
        maxValue = minValue + 1;
    }
    if (maxValue - minValue < 1e-6) {
        maxValue = minValue + 1;
    }
    const range = maxValue - minValue;

    // Use dynamic spacing instead of hardcoded thresholds
    const desiredTicks = 6;
    const targetSegments = Math.max(1, desiredTicks - 1);

    const niceRange = niceNumber(range, false);
    let tickSpacing = Math.abs(niceNumber(niceRange / targetSegments, true));

    if (!Number.isFinite(tickSpacing) || tickSpacing === 0) {
        tickSpacing = Math.abs(niceNumber(range / targetSegments, true));
    }
    if (!Number.isFinite(tickSpacing) || tickSpacing === 0) {
        tickSpacing = range / targetSegments;
    }
    // Ensure we don't get microscopic spacing for percentages (e.g. 0.0001%)
    // But allowing down to 0.01 or 0.1 is fine for small ranges.
    tickSpacing = Math.max(tickSpacing, 1e-2);

    const minRequiredTicks = 5;
    const maxRetries = 6;
    let finalTicks = [];
    let finalStartTick = 0;
    let finalEndTick = 0;

    for (let retry = 0; retry < maxRetries; retry++) {
        const startTick = Math.floor(minValue / tickSpacing) * tickSpacing;
        const endTick = Math.ceil(maxValue / tickSpacing) * tickSpacing;

        const ticks = [];
        for (let tick = startTick; tick <= endTick + tickSpacing * 0.001; tick += tickSpacing) {
            const rounded = Number((Math.round(tick / tickSpacing) * tickSpacing).toFixed(6));
            ticks.push(rounded);
        }

        const viewTicks = ticks.filter(
            (t) => t >= minValue - tickSpacing * 0.25 && t <= maxValue + tickSpacing * 0.25
        );

        if (viewTicks.length >= minRequiredTicks) {
            finalTicks = ticks;
            finalStartTick = startTick;
            finalEndTick = endTick;
            break;
        }

        tickSpacing /= 2;
        if (tickSpacing < 1e-2) {
            finalTicks = ticks;
            finalStartTick = startTick;
            finalEndTick = endTick;
            break;
        }

        if (retry === maxRetries - 1) {
            finalTicks = ticks;
            finalStartTick = startTick;
            finalEndTick = endTick;
        }
    }

    return {
        ticks: finalTicks,
        tickSpacing,
        startTick: finalStartTick,
        endTick: finalEndTick,
    };
}

function generateConcreteTicks(yMin, yMax, isPerformanceChart) {
    if (isPerformanceChart) {
        const percentTickInfo = computePercentTickInfo(yMin, yMax);
        const margin = percentTickInfo.tickSpacing * 0.25;
        return percentTickInfo.ticks.filter(
            (tick) => tick >= yMin - margin && tick <= yMax + margin
        );
    }

    const desiredTicks = 6;
    let range = yMax - yMin;

    // Handle flat-line constant value case
    if (!Number.isFinite(range) || range <= 1e-9) {
        const base = Math.abs(yMin) < 1e-9 ? 100 : Math.abs(yMin);
        const margin = base * 0.05; // +/- 5% margin
        const safeMargin = margin < 1e-9 ? 1 : margin;

        // Create artificial range
        yMin = yMin - safeMargin;
        yMax = yMax + safeMargin;
        range = yMax - yMin;
    }

    const niceRange = niceNumber(range, false);
    const targetSegments = Math.max(1, desiredTicks - 1);
    let tickSpacing = Math.abs(niceNumber(niceRange / targetSegments, true));
    if (!Number.isFinite(tickSpacing) || tickSpacing === 0) {
        tickSpacing = Math.abs(niceNumber(range / targetSegments, true));
    }
    if (!Number.isFinite(tickSpacing) || tickSpacing === 0) {
        tickSpacing = Math.pow(10, Math.floor(Math.log10(Math.abs(range))));
    }
    tickSpacing = Math.max(tickSpacing, 1e-6); // Avoid zero spacing

    // Retry loop to ensure at least 4 ticks
    let finalTicks = [];
    const minRequiredTicks = 5;
    const maxRetries = 6;

    for (let retry = 0; retry < maxRetries; retry++) {
        // Do not clamp to zero if we have negative values (e.g. drawdown or PnL)
        const clampToZero = yMin >= 0;
        const niceMin = clampToZero
            ? Math.max(0, Math.floor(yMin / tickSpacing) * tickSpacing)
            : Math.floor(yMin / tickSpacing) * tickSpacing;
        const niceMax = Math.ceil(yMax / tickSpacing) * tickSpacing;

        // Safety break if tickSpacing became dangerously small
        if (tickSpacing <= 1e-9) {
            break;
        }

        const ticks = [];
        // Add a small buffer to loop limit to avoid floating point issues excluding the last tick
        for (let tick = niceMin; tick <= niceMax + tickSpacing * 0.001; tick += tickSpacing) {
            // Precision rounding to avoid 0.30000000004
            const rounded = Number((Math.round(tick / tickSpacing) * tickSpacing).toFixed(6));
            ticks.push(rounded);
        }

        // Filter to view range with slight buffer
        const viewTicks = ticks.filter(
            (tick) => tick >= yMin - tickSpacing * 0.25 && tick <= yMax + tickSpacing * 0.25
        );

        if (viewTicks.length >= minRequiredTicks) {
            finalTicks = viewTicks;
            break;
        }

        // If we didn't get enough ticks, halve the spacing and try again
        tickSpacing /= 2;

        // If this was the last retry and we still don't have enough, just use what we have (best effort)
        if (retry === maxRetries - 1) {
            finalTicks = viewTicks;
        }
    }

    return finalTicks;
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
        // User request: Jan -> Year, Others -> Month only
        const quarters = [
            { month: 0, label: `${formattedYear}`, isYearStart: true },
            { month: 3, label: 'Apr', isYearStart: false },
            { month: 6, label: 'Jul', isYearStart: false },
            { month: 9, label: 'Oct', isYearStart: false },
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
                    label: `${formatYear(year)}`,
                    isYearStart: true,
                });
            }
        }
    }

    // Add end date
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
    const endYear = endDate.getFullYear();

    // Check if we already have a start-of-year tick for this year
    // This helps us decide if we should label the end tick as "Jan" (if we already have "2026")
    // or "2026" (if this is the only tick for the year)
    const hasYearTick = ticks.some(
        (t) => t.isYearStart && new Date(t.time).getFullYear() === endYear
    );

    let endLabel;
    if (endMonth === 'Jan' && hasYearTick) {
        endLabel = 'Jan';
    } else {
        endLabel = endMonth === 'Jan' ? `${formatYear(endYear)}` : endMonth;
    }

    ticks.push({
        time: maxTime,
        label: endLabel,
        isYearStart: endMonth === 'Jan' && !hasYearTick, // Only treat as year start if it's the primary label for the year
    });

    // Add beginning month tick for desktop only
    if (!isMobile) {
        const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
        const startYear = startDate.getFullYear();
        const startLabel = startMonth === 'Jan' ? `${formatYear(startYear)}` : startMonth;

        // Check if we already have a tick for the start date
        const hasStartTick = ticks.some((tick) => tick.time === minTime);
        if (!hasStartTick) {
            ticks.push({
                time: minTime,
                label: startLabel,
                isYearStart: startMonth === 'Jan',
            });
        }
    }

    // Sort ticks by time
    ticks.sort((a, b) => a.time - b.time);

    // Calculate dynamic proximity threshold
    // For very short ranges (e.g. 1 month), 10 days is too aggressive.
    // We scale it: Max of (Range / 20) or (1 day), capped at 10 days.
    const rangeDuration = maxTime - minTime;
    const minConflictTime = Math.max(
        24 * 60 * 60 * 1000, // Min 1 day
        Math.min(
            10 * 24 * 60 * 60 * 1000, // Max 10 days
            rangeDuration / 15 // ~1/15th of the chart width
        )
    );

    // Deduplicate ticks by label + Remove duplicate ticks that are too close together
    const filteredTicks = [];
    const seenLabels = new Set();

    for (let i = 0; i < ticks.length; i++) {
        const currentTick = ticks[i];

        // 1. Deduplicate by label (keep the version that is a year start if available, or just the first one)
        // If we have "2026" already, we usually want to keep the "Jan 1" version (which is year start)
        // rather than a later date labeled "2026".
        if (seenLabels.has(currentTick.label)) {
            // Check if we should replace the existing one?
            // Usually the first one is sorted by time, so it's the earlier date.
            // For "2026" (Jan 1) vs "2026" (Jan 15), we want Jan 1. So skipping duplicates is correct.
            continue;
        }

        const isTooClose = filteredTicks.some(
            (existingTick) => Math.abs(currentTick.time - existingTick.time) < minConflictTime
        );

        if (!isTooClose) {
            filteredTicks.push(currentTick);
            seenLabels.add(currentTick.label);
        } else {
            // If too close, prefer year boundaries (isYearStart: true) over start/end dates
            const existingIndex = filteredTicks.findIndex(
                (existingTick) => Math.abs(currentTick.time - existingTick.time) < minConflictTime
            );

            if (existingIndex !== -1) {
                const existingTick = filteredTicks[existingIndex];
                if (currentTick.isYearStart && !existingTick.isYearStart) {
                    // Replace existing with current because current is a year boundary
                    // But wait, existing label might be different?
                    // If labels are different but times are close, we still might want to replace.
                    // E.g. Dec 31 "Dec" vs Jan 1 "2026". We prefer "2026".
                    seenLabels.delete(existingTick.label);
                    filteredTicks[existingIndex] = currentTick;
                    seenLabels.add(currentTick.label);
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
    axisOptions = {},
    currency = 'USD',
    forcePercent = false
) {
    const isMobile = window.innerWidth <= 768;
    const monoFont = getMonoFontFamily();
    const { drawXAxis = true, drawYAxis = true } = axisOptions;

    // Generate concrete tick values
    const ticks = generateConcreteTicks(yMin, yMax, isPerformanceChart || forcePercent, currency);

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
            ctx.font = isMobile ? `9px ${monoFont}` : `11px ${monoFont}`;
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
        ctx.font = isMobile ? `9px ${monoFont}` : `11px ${monoFont}`;
    }

    yearTicks.forEach((tick, index) => {
        const x = xScale(tick.time);

        if (drawXAxis) {
            // Prevent label collision (Desktop & Mobile)
            if (index > 0) {
                const prevTickX = xScale(yearTicks[index - 1].time);
                // Minimum spacing threshold (pixels)
                const minSpacing = isMobile ? 30 : 40;

                if (x - prevTickX < minSpacing) {
                    // If specifically the last tick (end date) is colliding, we might want to keep it and hide the previous one?
                    // But usually hiding the current one is safer/easier.
                    // For the "Feb overlaps 2026" case: 2026 is at index i-1, Feb is at i.
                    // 2026 is year start (important). Feb is month. We skip Feb. Correct.
                    return;
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

async function drawContributionChart(ctx, chartManager, timestamp, options = {}) {
    const { drawdownMode = false } = options;
    stopPerformanceAnimation();
    stopFxAnimation();

    const runningAmountSeries = Array.isArray(transactionState.runningAmountSeries)
        ? transactionState.runningAmountSeries
        : [];
    const portfolioSeries = Array.isArray(transactionState.portfolioSeries)
        ? transactionState.portfolioSeries
        : [];
    const filteredTransactions = Array.isArray(transactionState.filteredTransactions)
        ? transactionState.filteredTransactions
        : [];
    const allTransactions = Array.isArray(transactionState.allTransactions)
        ? transactionState.allTransactions
        : [];

    const filtersActive =
        hasActiveTransactionFilters() &&
        transactionState.activeFilterTerm &&
        transactionState.activeFilterTerm.trim().length > 0;
    const selectedCurrency = transactionState.selectedCurrency || 'USD';

    const contributionTransactions = filtersActive ? filteredTransactions : allTransactions;
    let contributionSource = [];
    let contributionFromTransactions = false;

    if (contributionTransactions.length > 0) {
        const today = parseLocalDate(new Date());
        const rangeTo = transactionState.chartDateRange?.to
            ? parseLocalDate(transactionState.chartDateRange.to)
            : null;
        let padToDate;
        if (rangeTo && today) {
            padToDate = Math.min(rangeTo.getTime(), today.getTime());
        } else if (today) {
            padToDate = today.getTime();
        } else {
            padToDate = rangeTo?.getTime() ?? Date.now();
        }
        contributionSource = getContributionSeriesForTransactions(contributionTransactions, {
            includeSyntheticStart: true,
            padToDate,
            currency: null,
        });
        contributionFromTransactions =
            filtersActive && Array.isArray(contributionSource) && contributionSource.length > 0;
        if (!filtersActive && contributionSource !== runningAmountSeries) {
            setRunningAmountSeries(contributionSource);
        }
    } else {
        const mappedSeries =
            transactionState.runningAmountSeriesByCurrency?.[selectedCurrency] || null;

        if (mappedSeries && mappedSeries === runningAmountSeries) {
            contributionSource = runningAmountSeries;
        } else {
            contributionSource = runningAmountSeries.map((entry) => {
                const tradeDate = entry.tradeDate || entry.date;
                // Removed drawdownMode check to allow currency conversion

                return {
                    ...entry,
                    amount: convertValueToCurrency(entry.amount, tradeDate, selectedCurrency),
                    netAmount: convertValueToCurrency(entry.netAmount, tradeDate, selectedCurrency),
                };
            });
        }
    }

    if (
        (!Array.isArray(contributionSource) || contributionSource.length === 0) &&
        runningAmountSeries.length > 0
    ) {
        // Force dynamic conversion to ensure accuracy and avoid stale cache
        contributionSource = runningAmountSeries.map((item) => {
            // Removed drawdownMode check to allow currency conversion

            return {
                ...item,
                amount: convertValueToCurrency(
                    item.amount,
                    item.tradeDate || item.date,
                    selectedCurrency
                ),
            };
        });
    }

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

    let balanceSource = filtersActive
        ? buildFilteredBalanceSeries(
              filteredTransactions,
              historicalPrices,
              transactionState.splitHistory
          )
        : portfolioSeries;

    if (
        !drawdownMode &&
        selectedCurrency !== 'USD' &&
        Array.isArray(balanceSource) &&
        filtersActive
    ) {
        balanceSource = [...balanceSource]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map((entry) => ({
                ...entry,
                value: convertValueToCurrency(entry.value, entry.date, selectedCurrency),
            }));
    }
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
    const filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;
    const filterFromTime =
        filterFrom && Number.isFinite(filterFrom.getTime()) ? filterFrom.getTime() : null;
    const filterToTime =
        filterTo && Number.isFinite(filterTo.getTime()) ? filterTo.getTime() : null;

    const filterDataByDateRange = (data) => {
        return data.filter((item) => {
            const itemDate = parseLocalDate(item.date);
            if (!itemDate) {
                return false;
            }

            // Normalize dates to date-only strings for comparison (YYYY-MM-DD)
            const itemDateStr = itemDate.toISOString().split('T')[0];
            const filterFromStr = filterFrom ? filterFrom.toISOString().split('T')[0] : null;
            const filterToStr = filterTo ? filterTo.toISOString().split('T')[0] : null;

            // Check if item is within the filter range
            const withinStart = !filterFromStr || itemDateStr >= filterFromStr;
            const withinEnd = !filterToStr || itemDateStr <= filterToStr;

            // Preserve padding points that extend the series to the filter endpoint
            const isPadding = item.orderType && item.orderType.toLowerCase() === 'padding';
            if (isPadding && filterToStr) {
                // If it's a padding point, allow it if it matches the filter end
                // or if it's within the valid range (which is covered by withinStart && withinEnd)
                if (itemDateStr === filterToStr) {
                    return withinStart;
                }
            }

            return withinStart && withinEnd;
        });
    };

    const rawContributionData = filterDataByDateRange(
        (contributionSource || [])
            .map((item) => ({ ...item, date: parseLocalDate(item.tradeDate || item.date) }))
            .filter((item) => item.date && !Number.isNaN(item.date.getTime()))
    );
    const mappedBalanceSource = showBalance
        ? (balanceSource || [])
              .map((item) => ({ ...item, date: parseLocalDate(item.date) }))
              .filter((item) => item.date && !Number.isNaN(item.date.getTime()))
        : [];
    const rawBalanceData = showBalance
        ? injectSyntheticStartPoint(
              filterDataByDateRange(mappedBalanceSource),
              balanceSource,
              filterFrom
          )
        : [];
    const balanceDataWithinRange =
        (filterFrom || filterTo) && rawBalanceData.length > 0
            ? constrainSeriesToRange(rawBalanceData, filterFrom, filterTo)
            : rawBalanceData;

    // Apply smoothing to contribution and balance data
    const contributionSmoothingConfig = getSmoothingConfig('contribution');
    const balanceSmoothingConfig = getSmoothingConfig('balance') || contributionSmoothingConfig;
    const rangeActive = Boolean(filterFrom || filterTo);
    const shouldSmoothContribution =
        !rangeActive &&
        !contributionFromTransactions &&
        rawContributionData.length > 2 &&
        contributionSmoothingConfig;
    const contributionData = shouldSmoothContribution
        ? smoothFinancialData(
              rawContributionData.map((item) => ({ x: item.date.getTime(), y: item.amount })),
              contributionSmoothingConfig,
              true // preserveEnd - keep the last point unchanged
          ).map((p) => ({ date: new Date(p.x), amount: p.y }))
        : rawContributionData;

    const shouldSmoothBalance =
        !filtersActive && balanceDataWithinRange.length > 2 && balanceSmoothingConfig;
    const balanceData = shouldSmoothBalance
        ? smoothFinancialData(
              balanceDataWithinRange.map((item) => ({ x: item.date.getTime(), y: item.value })),
              balanceSmoothingConfig,
              true // preserveEnd - keep the last point unchanged
          ).map((p) => ({ date: new Date(p.x), value: p.y }))
        : balanceDataWithinRange;

    if (contributionData.length === 0 && balanceData.length === 0) {
        stopContributionAnimation();
        if (emptyState) {
            emptyState.style.display = '';
        }
        return;
    }

    // Apply drawdown transformation if in drawdown mode
    let finalContributionData = contributionData;
    let finalBalanceData = balanceData;

    if (drawdownMode) {
        // Helper to apply HWM drawdown to a series
        const applyDrawdown = (data, valueKey) => {
            if (data.length === 0) {
                return [];
            }
            // Sort by date first
            const sorted = [...data].sort((a, b) => a.date - b.date);
            let runningPeak = -Infinity;
            return sorted.map((p) => {
                const val = p[valueKey];
                if (val > runningPeak) {
                    runningPeak = val;
                }
                return {
                    ...p,
                    [valueKey]: val - runningPeak, // <= 0
                };
            });
        };

        finalContributionData = applyDrawdown(contributionData, 'amount');
        finalBalanceData = applyDrawdown(balanceData, 'value');
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

    // Calculate effective min times based on actual data within filter range
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

    if (Number.isFinite(filterFromTime)) {
        // Ensure minTime is at least the filter start time
        minTime = Math.max(minTime, filterFromTime);
    }
    // Calculate maxTime - use filter end if specified (clamped to today), otherwise use data max
    let maxTime;
    if (Number.isFinite(filterToTime)) {
        // When filter is active, extend to min(filterEnd, today)
        // This handles both past periods (stops at filter end) and current periods (stops at today)
        maxTime = Math.min(filterToTime, Date.now());
    } else if (allTimes.length > 0) {
        // No filter: use the maximum time from the data (including padding points)
        maxTime = Math.max(...allTimes);
    } else {
        maxTime = Date.now();
    }

    // Force-extend series to maxTime to ensure the line reaches the right edge of the chart
    // This fixes issues where the line stops at the last transaction date instead of the filter end/today
    if (contributionData.length > 0) {
        const lastPoint = contributionData[contributionData.length - 1];
        if (lastPoint.date.getTime() < maxTime) {
            contributionData.push({
                date: new Date(maxTime),
                amount: lastPoint.amount,
            });
        }
    }

    if (balanceData.length > 0) {
        const lastPoint = balanceData[balanceData.length - 1];
        if (lastPoint.date.getTime() < maxTime) {
            balanceData.push({
                date: new Date(maxTime),
                value: lastPoint.value,
            });
        }
    }

    // Remove debug object
    if (window.DEBUG_CHART) {
        delete window.DEBUG_CHART;
    }

    const contributionValues = finalContributionData.map((item) => item.amount);
    const balanceValues = finalBalanceData.map((item) => item.value);
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

    // In drawdown mode, force yMax to 0 and yMin to include all negative values
    if (drawdownMode) {
        yMax = 0;
        yMin = Math.min(rawMin, 0);
    }

    if (!hasValues) {
        yMin = startYAxisAtZero || drawdownMode ? 0 : 0;
        yMax = drawdownMode ? 0 : 1;
        if (drawdownMode) {
            yMin = -1;
        }
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
        volumeHeight > 0 ? { drawXAxis: false } : {},
        transactionState.selectedCurrency || 'USD'
    );

    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);
    const contributionAnimationEnabled = isAnimationEnabled('contribution');
    const animationPhase = advanceContributionAnimation(timestamp);

    const animatedSeries = [];
    const filterStartTime = Number.isFinite(filterFromTime) ? filterFromTime : null;

    const formatBalanceValue = (value) =>
        formatCurrencyCompact(value, { currency: transactionState.selectedCurrency || 'USD' });

    const formatContributionAnnotationValue = (value) => {
        const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
        if (Math.abs(amount) < 1) {
            return formatBalanceValue(amount);
        }
        const currency = transactionState.selectedCurrency || 'USD';
        return formatCurrencyCompact(amount, { currency });
    };

    const showChartLabels = getShowChartLabels();
    let firstContributionLabelY = null;
    let contributionEndLabelY = null;

    if (showContribution && finalContributionData.length > 0) {
        animatedSeries.push({
            key: 'contribution',
            color: colors.contribution,
            lineWidth: CHART_LINE_WIDTHS.contribution ?? 2,
            order: 1,
            data: finalContributionData
                .filter((item) => {
                    const t = item.date.getTime();
                    return t >= minTime && t <= maxTime;
                })
                .map((item) => ({
                    time: item.date.getTime(),
                    value: item.amount,
                })),
        });
    }

    if (showBalance && finalBalanceData.length > 0) {
        animatedSeries.push({
            key: 'balance',
            color: colors.portfolio,
            lineWidth: CHART_LINE_WIDTHS.balance ?? 2,
            order: 2,
            data: finalBalanceData
                .filter((item) => {
                    const t = item.date.getTime();
                    return t >= minTime && t <= maxTime;
                })
                .map((item) => ({
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

        // If we have explicit volume data, we can process even if type is 'mixed'
        const hasExplicitVolume = Number(item.buyVolume) > 0 || Number(item.sellVolume) > 0;

        if (!hasExplicitVolume && !((type === 'buy' && showBuy) || (type === 'sell' && showSell))) {
            return;
        }
        const normalizedDate = new Date(item.date.getTime());
        normalizedDate.setHours(0, 0, 0, 0);
        const timestamp = normalizedDate.getTime();
        if (!Number.isFinite(timestamp)) {
            return;
        }
        // Ensure volume bars are strictly within the visible chart range
        if (timestamp < minTime || timestamp > maxTime) {
            return;
        }
        const netAmount = Math.abs(Number(item.netAmount) || 0);
        if (!hasExplicitVolume && netAmount <= 0) {
            return;
        }

        if (!volumeGroups.has(timestamp)) {
            volumeGroups.set(timestamp, { totalBuy: 0, totalSell: 0 });
        }
        const totals = volumeGroups.get(timestamp);

        // Use pre-consolidated volumes if available
        if (Number.isFinite(item.buyVolume) || Number.isFinite(item.sellVolume)) {
            if (showBuy) {
                totals.totalBuy += Number(item.buyVolume) || 0;
            }
            if (showSell) {
                totals.totalSell += Number(item.sellVolume) || 0;
            }
        } else if (type === 'buy') {
            // Fallback for non-consolidated items
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

    const buyVolumeMap = new Map();
    const sellVolumeMap = new Map();
    volumeEntries.forEach(({ timestamp, totalBuyVolume, totalSellVolume }) => {
        if (totalBuyVolume > 0) {
            buyVolumeMap.set(timestamp, totalBuyVolume);
        }
        if (totalSellVolume > 0) {
            sellVolumeMap.set(timestamp, totalSellVolume);
        }
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
            { drawYAxis: maxVolume > 0 },
            transactionState.selectedCurrency || 'USD'
        );
    }

    // Clip the drawing area to prevent overhangs and spikes for ALL chart elements
    ctx.save();
    ctx.beginPath();
    // Include volume area in clipping if volume is shown
    // clipTop must start at padding.top to include the main chart!
    const clipTop = padding.top;
    const clipHeight =
        volumeHeight > 0
            ? plotHeight + (volumeGap || 0) + volumeHeight + (volumePadding?.top || 0)
            : plotHeight;

    ctx.rect(padding.left, clipTop, plotWidth, clipHeight);
    ctx.clip();

    if (volumeHeight > 0 && volumeEntries.length > 0 && typeof volumeYScale === 'function') {
        volumeEntries.sort((a, b) => a.timestamp - b.timestamp);
        const barWidth = 8;
        const baselineY = volumePadding.top + volumeHeight;

        const allVolumeRects = [];

        volumeEntries.forEach((entry) => {
            const { timestamp, totalBuyVolume, totalSellVolume } = entry;
            const x = xScale(timestamp);

            const bars = [];
            if (totalBuyVolume > 0) {
                bars.push({
                    type: 'buy',
                    volume: totalBuyVolume,
                    fill: 'rgba(76, 175, 80, 0.6)',
                    stroke: 'rgba(76, 175, 80, 0.8)',
                });
            }
            if (totalSellVolume > 0) {
                bars.push({
                    type: 'sell',
                    volume: totalSellVolume,
                    fill: 'rgba(244, 67, 54, 0.6)',
                    stroke: 'rgba(244, 67, 54, 0.8)',
                });
            }
            if (bars.length === 0) {
                return;
            }

            // Determine max volume for this day to identify which bar should be narrower
            const dayMaxVolume = Math.max(totalBuyVolume, totalSellVolume);

            bars.forEach((bar) => {
                const topY = volumeYScale(bar.volume);
                const height = baselineY - topY;

                // Nested Widths Pattern:
                // If this bar is smaller than the day's max (or equal but we want one to be inner),
                // we adjust width. If both are equal, we can arbitrarily shrink one,
                // or keep both full width (which blends colors).
                // Better UX: If volumes are distinct, shrink the smaller one.
                // If volumes are exactly equal, shrink 'sell' to make it look like a "core" inside "buy"?
                // Or just keep them same size.
                // Let's go with: strictly smaller volume gets smaller width.

                let actualWidth = barWidth;
                if (bar.volume < dayMaxVolume) {
                    actualWidth = barWidth * 0.5; // 4px if base is 8px
                } else if (
                    bars.length === 2 &&
                    totalBuyVolume === totalSellVolume &&
                    bar.type === 'sell'
                ) {
                    // Tie-breaker: if equal, make sell bar narrower so both are seen
                    actualWidth = barWidth * 0.5;
                }

                const currentX = x - actualWidth / 2;

                if (height > 0) {
                    allVolumeRects.push({
                        timestamp,
                        x: currentX,
                        width: actualWidth,
                        topY,
                        height,
                        fill: bar.fill,
                        stroke: bar.stroke,
                        order: actualWidth < barWidth ? 1 : 0, // Draw narrower bars (1) after wider bars (0)
                    });
                }
            });
        });

        allVolumeRects
            .sort((a, b) => {
                if (a.height !== b.height) {
                    return b.height - a.height; // draw taller bars first so shorter remain visible
                }
                if (a.timestamp !== b.timestamp) {
                    return a.timestamp - b.timestamp;
                }
                return a.order - b.order;
            })
            .forEach((rect) => {
                ctx.fillStyle = rect.fill;
                ctx.fillRect(rect.x, rect.topY, rect.width, rect.height);

                ctx.strokeStyle = rect.stroke;
                ctx.lineWidth = 1;
                ctx.strokeRect(rect.x, rect.topY, rect.width, rect.height);
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

    const areaBaselineY = drawdownMode ? yScale(0) : chartBounds.bottom;

    // Line chart clipping is now handled by the global clip above,
    // but we might want to restrict it further to just the plot area (excluding volume)
    // However, since volume is below, and line chart is above, they don't overlap much.
    // But to be safe and consistent with previous logic:

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
                opacityTop: drawdownMode ? 0 : 0.35,
                opacityBottom: drawdownMode ? 0.35 : 0,
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

    // ctx.restore(); // Removed inner restore, will restore at the end

    if (contributionAnimationEnabled && hasAnimatedSeries) {
        scheduleContributionAnimation(chartManager);
    } else {
        stopContributionAnimation();
    }

    // Draw start and end values using raw data to ensure accuracy (or transformed data for drawdown)
    const labelContributionData = drawdownMode ? finalContributionData : rawContributionData;
    if (showChartLabels && showContribution && labelContributionData.length > 0) {
        const contributionGradient = BALANCE_GRADIENTS['contribution'];
        const contributionStartColor = contributionGradient
            ? contributionGradient[0]
            : colors.contribution;
        const contributionEndColor = contributionGradient
            ? contributionGradient[1]
            : colors.contribution;

        const firstContribution =
            labelContributionData.find((item) => item.synthetic) ||
            labelContributionData.find((item) => {
                if (typeof item.orderType !== 'string') {
                    return true;
                }
                return item.orderType.toLowerCase() !== 'padding';
            }) ||
            labelContributionData[0];
        if (firstContribution) {
            const firstContributionX = xScale(firstContribution.date.getTime());
            const firstContributionY = yScale(
                drawdownMode ? firstContribution.amount : firstContribution.amount
            );
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
                formatContributionAnnotationValue,
                true
            );
        }

        const lastContribution = labelContributionData[labelContributionData.length - 1];
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
            formatContributionAnnotationValue,
            true
        );
    }

    const labelBalanceData = drawdownMode ? finalBalanceData : rawBalanceData;
    if (showChartLabels && showBalance && labelBalanceData.length > 0) {
        const balanceGradient = BALANCE_GRADIENTS['balance'];
        const balanceStartColor = balanceGradient ? balanceGradient[0] : colors.portfolio;
        const balanceEndColor = balanceGradient ? balanceGradient[1] : colors.portfolio;

        const firstBalance = labelBalanceData[0];
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

        const lastBalance = labelBalanceData[labelBalanceData.length - 1];
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

    ctx.restore(); // Restore the global clip

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
        if (hasBalanceSeries) {
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

    const normalizeToDay = (time) => {
        const day = new Date(time);
        day.setHours(0, 0, 0, 0);
        return day.getTime();
    };

    const baseSeries = animatedSeries.map((series) => {
        const displayLabel = series.key === 'balance' ? 'Balance' : 'Contribution';
        let displayColor = series.color;
        if (series.key === 'balance') {
            displayColor =
                (BALANCE_GRADIENTS.balance && BALANCE_GRADIENTS.balance[1]) || colors.portfolio;
        } else if (series.key === 'contribution') {
            displayColor =
                (BALANCE_GRADIENTS.contribution && BALANCE_GRADIENTS.contribution[1]) ||
                colors.contribution;
        }
        return {
            key: series.key,
            label: displayLabel,
            color: displayColor,
            getValueAtTime: createTimeInterpolator(series.data),
            formatValue: formatBalanceValue,
            formatDelta: (delta) => formatCurrencyInline(delta),
        };
    });

    const volumeSeries = [];
    const makeVolumeGetter = (map) => (time) => {
        const value = map.get(normalizeToDay(time));
        return Number.isFinite(value) ? value : 0;
    };

    volumeSeries.push({
        key: 'buyVolume',
        label: 'Buy',
        color: colors.buy,
        getValueAtTime: makeVolumeGetter(buyVolumeMap),
        formatValue: formatCurrencyInline,
        includeInRangeSummary: false,
        drawMarker: false,
    });

    volumeSeries.push({
        key: 'sellVolume',
        label: 'Sell',
        color: colors.sell,
        getValueAtTime: makeVolumeGetter(sellVolumeMap),
        formatValue: formatCurrencyInline,
        includeInRangeSummary: false,
        drawMarker: false,
    });

    const layoutKey = drawdownMode ? 'drawdownAbs' : 'contribution';
    chartLayouts[layoutKey] = {
        key: layoutKey,
        minTime,
        maxTime,
        valueType: 'currency',
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
        series: [...baseSeries, ...volumeSeries],
    };

    drawCrosshairOverlay(ctx, chartLayouts[layoutKey]);

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
            return { x, y, time, value: point.value };
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
            points: coords.map((coord) => ({ time: coord.time, value: coord.value })),
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

    const showChartLabels = getShowChartLabels();

    if (showChartLabels) {
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
                true
            );
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

function drawFxChart(ctx, chartManager, timestamp) {
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
    const filterFrom = chartDateRange.from ? new Date(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? new Date(chartDateRange.to) : null;

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
            drawEndValue(
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
                true
            );
        }

        renderedSeries.push({
            key: series.key,
            label: series.label,
            color: resolvedColor,
            points: coords.map((coord) => ({ time: coord.time, value: coord.value })),
            rawPoints: coords.map((coord) => ({ time: coord.time, value: coord.rawValue })),
        });

        if (fxAnimationEnabled) {
            glowAnimator.drawSeriesGlow(
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

async function drawDrawdownChart(ctx, chartManager, timestamp) {
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
        series: renderedSeries.map((s) => ({
            key: s.key,
            label: s.name,
            color: s.color,
            getValueAtTime: createTimeInterpolator(s.points || []),
            formatValue: valueFormatter,
            formatDelta: deltaFormatter,
        })),
    };

    drawCrosshairOverlay(ctx, chartLayouts[layoutKey]);

    if (performanceLegendDirty) {
        const legendSeries = orderedKeys.map((key) => ({
            key,
            name: key,
            color: colorMap[key] || colors.contribution,
        }));
        updateLegend(legendSeries, chartManager);
        performanceLegendDirty = false;
    }
}

function aggregateCompositionSeries(tickers, chartData, seriesLength) {
    if (!Array.isArray(tickers) || tickers.length === 0 || !Number.isFinite(seriesLength)) {
        return null;
    }
    const aggregated = Array.from({ length: seriesLength }, () => 0);
    tickers.forEach((ticker) => {
        const values = chartData[ticker] || [];
        for (let i = 0; i < seriesLength; i += 1) {
            const value = Number(values[i] ?? 0);
            if (Number.isFinite(value)) {
                aggregated[i] += value;
            }
        }
    });
    return aggregated;
}

function buildCompositionDisplayOrder(
    baseOrder,
    chartData,
    filterTickers,
    seriesLength,
    referenceData = null
) {
    if (!Array.isArray(baseOrder) || baseOrder.length === 0) {
        return { order: [], filteredOthers: null };
    }
    const normalizedFilter = Array.isArray(filterTickers)
        ? filterTickers.map((ticker) => ticker.toUpperCase()).filter(Boolean)
        : [];
    if (normalizedFilter.length === 0) {
        return { order: [...baseOrder], filteredOthers: null };
    }

    const filterSet = new Set(normalizedFilter);
    const selectedOrder = baseOrder.filter((ticker) => filterSet.has(ticker.toUpperCase()));
    if (selectedOrder.length === 0) {
        return { order: [...baseOrder], filteredOthers: null };
    }

    const remainder = baseOrder.filter((ticker) => !filterSet.has(ticker.toUpperCase()));
    const includeFilteredOthers = remainder.length > 0 && !filterSet.has('OTHERS');
    const filteredOthers = includeFilteredOthers
        ? aggregateCompositionSeries(remainder, chartData, seriesLength)
        : null;
    const filteredReference =
        includeFilteredOthers && referenceData
            ? aggregateCompositionSeries(remainder, referenceData, seriesLength)
            : null;
    const order = filteredOthers ? [...selectedOrder, 'Others'] : selectedOrder;
    return { order, filteredOthers, filteredReference };
}

function renderCompositionChartWithMode(ctx, chartManager, data, options = {}) {
    const valueMode = options.valueMode === 'absolute' ? 'absolute' : 'percent';

    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray(data.dates) ||
        data.dates.length === 0
    ) {
        chartLayouts.composition = null;
        chartLayouts.compositionAbs = null;
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
    const rawSeries = data.composition || data.series || {};
    const selectedCurrency = transactionState.selectedCurrency || 'USD';

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? new Date(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? new Date(chartDateRange.to) : null;

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
            chartLayouts.compositionAbs = null;
        } else {
            chartLayouts.composition = null;
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
    const totalValuesUsd =
        mappedTotalValues.length === dates.length
            ? mappedTotalValues
            : dates.map((_, idx) => Number(mappedTotalValues[idx] ?? 0));
    const totalValuesConverted = totalValuesUsd.map((value, idx) => {
        const converted = convertValueToCurrency(value, dates[idx], selectedCurrency);
        return Number.isFinite(converted) ? converted : 0;
    });

    const percentSeriesMap = {};
    const chartData = {};
    Object.entries(rawSeries).forEach(([ticker, values]) => {
        const arr = Array.isArray(values) ? values : [];
        const mappedPercent =
            filteredIndices.length > 0
                ? filteredIndices.map((i) => Number(arr[i] ?? 0))
                : arr.map((value) => Number(value ?? 0));
        const percentValues =
            mappedPercent.length === dates.length
                ? mappedPercent
                : dates.map((_, idx) => Number(mappedPercent[idx] ?? 0));
        percentSeriesMap[ticker] = percentValues;
        if (valueMode === 'absolute') {
            chartData[ticker] = percentValues.map(
                (pct, idx) => ((totalValuesConverted[idx] ?? 0) * pct) / 100
            );
        } else {
            chartData[ticker] = percentValues;
        }
    });

    const baseTickerOrder = Object.keys(chartData).sort((a, b) => {
        const arrA = chartData[a] || [];
        const arrB = chartData[b] || [];
        const lastA = arrA[arrA.length - 1] ?? 0;
        const lastB = arrB[arrB.length - 1] ?? 0;
        return lastB - lastA;
    });

    const explicitTickerFilters = getCompositionFilterTickers();
    let derivedTickerFilters = explicitTickerFilters;
    if (!derivedTickerFilters.length) {
        const assetClassFilter = getCompositionAssetClassFilter();
        if (assetClassFilter === 'etf' || assetClassFilter === 'stock') {
            const shouldMatchEtf = assetClassFilter === 'etf';
            derivedTickerFilters = baseTickerOrder.filter((ticker) => {
                if (typeof ticker === 'string' && ticker.toUpperCase() === 'OTHERS') {
                    return false;
                }
                const assetClass = getHoldingAssetClass(ticker);
                return shouldMatchEtf ? assetClass === 'etf' : assetClass !== 'etf';
            });
        }
    }

    const {
        order: filteredOrder,
        filteredOthers,
        filteredReference,
    } = buildCompositionDisplayOrder(
        baseTickerOrder,
        chartData,
        derivedTickerFilters,
        dates.length,
        valueMode === 'absolute' ? percentSeriesMap : null
    );
    const percentOthersSeries = valueMode === 'absolute' ? filteredReference : filteredOthers;
    const activeTickerOrder = filteredOrder.length > 0 ? filteredOrder : baseTickerOrder;
    const usingFilteredOthers = Boolean(filteredOthers);

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
        if (valueMode === 'absolute') {
            chartLayouts.compositionAbs = null;
        } else {
            chartLayouts.composition = null;
        }
        updateCrosshairUI(null, null);
        return;
    }

    const colors = COLOR_PALETTES.COMPOSITION_CHART_COLORS;
    const resolveTickerColor = (ticker) => {
        let colorIndex = baseTickerOrder.indexOf(ticker);
        if (colorIndex === -1 && ticker === 'Others') {
            colorIndex = baseTickerOrder.indexOf('Others');
        }
        if (colorIndex === -1) {
            colorIndex = baseTickerOrder.length;
        }
        return colors[colorIndex % colors.length];
    };

    const dateTimes = dates.map((dateStr) => new Date(dateStr).getTime());
    const minTime = Math.min(...dateTimes);
    const maxTime = Math.max(...dateTimes);

    const xScale = (time) =>
        padding.left +
        (maxTime === minTime
            ? plotWidth / 2
            : ((time - minTime) / (maxTime - minTime)) * plotWidth);

    const yMin = 0;
    const maxTotalValue = Math.max(
        ...totalValuesConverted.filter((value) => Number.isFinite(value)),
        0
    );
    const yMax = valueMode === 'absolute' ? Math.max(maxTotalValue, 1) : 100;
    const yScale = (value) =>
        padding.top + plotHeight - ((value - yMin) / (yMax - yMin || 1)) * plotHeight;
    const axisFormatter =
        valueMode === 'absolute'
            ? (val) => formatCurrencyCompact(val, { currency: selectedCurrency })
            : (val) => `${val}%`;
    const chartBounds = {
        top: padding.top,
        bottom: padding.top + plotHeight,
        left: padding.left,
        right: padding.left + plotWidth,
    };

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

    activeTickerOrder.forEach((ticker, tickerIndex) => {
        const values =
            ticker === 'Others' && usingFilteredOthers ? filteredOthers : chartData[ticker] || [];
        if (!Array.isArray(values) || values.length !== dates.length) {
            return;
        }
        const color = resolveTickerColor(ticker) || colors[tickerIndex % colors.length];
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
    const percentSeriesForTicker = (ticker) => {
        if (ticker === 'Others' && percentOthersSeries) {
            return percentOthersSeries;
        }
        return percentSeriesMap[ticker] || [];
    };
    const othersPercentSeries = percentSeriesForTicker('Others');
    const othersPercentage =
        othersPercentSeries.length > 0 ? (othersPercentSeries[latestIndex] ?? 0) : 0;
    const shouldIncludeOthers = othersPercentage > 50 || usingFilteredOthers;

    const buildHoldingInfo = (ticker) => {
        const percentSeries = percentSeriesForTicker(ticker);
        const percent = percentSeries[latestIndex] ?? 0;
        const absoluteSeries =
            ticker === 'Others' && usingFilteredOthers ? filteredOthers : chartData[ticker] || [];
        const latestTotal = totalValuesConverted[latestIndex] ?? 0;
        const absoluteValue =
            valueMode === 'absolute'
                ? (absoluteSeries[latestIndex] ?? 0)
                : (latestTotal * percent) / 100;
        return {
            ticker,
            percent,
            absolute: absoluteValue,
        };
    };

    const latestHoldings = activeTickerOrder
        .filter((ticker) => shouldIncludeOthers || ticker !== 'Others')
        .map(buildHoldingInfo)
        .filter((holding) => holding.percent > 0.1)
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 6);

    const holdingsForLegend =
        latestHoldings.length > 0
            ? latestHoldings
            : activeTickerOrder
                  .filter((ticker) => shouldIncludeOthers || ticker !== 'Others')
                  .map(buildHoldingInfo)
                  .sort((a, b) => b.percent - a.percent)
                  .slice(0, 6);

    const legendSeries = holdingsForLegend.map((holding) => {
        const displayName = holding.ticker === 'BRKB' ? 'BRK-B' : holding.ticker;
        return {
            key: holding.ticker,
            name: displayName,
            color: resolveTickerColor(holding.ticker),
        };
    });

    const seriesForCrosshair = [];
    activeTickerOrder.forEach((ticker) => {
        const values =
            ticker === 'Others' && usingFilteredOthers ? filteredOthers : chartData[ticker];
        if (!Array.isArray(values) || values.length !== dates.length) {
            return;
        }
        const points = dateTimes.map((time, idx) => ({
            time,
            value: values[idx],
        }));
        const label = ticker === 'BRKB' ? 'BRK-B' : ticker;
        const color = resolveTickerColor(ticker);
        seriesForCrosshair.push({
            key: ticker,
            label,
            color,
            getValueAtTime: createTimeInterpolator(points),
            formatValue: (value) =>
                valueMode === 'absolute'
                    ? formatCurrencyInlineValue(value, selectedCurrency)
                    : `${value.toFixed(2)}%`,
            formatDelta: (delta) =>
                valueMode === 'absolute'
                    ? formatCurrencyInlineValue(delta, selectedCurrency)
                    : formatPercentInline(delta),
            originalIndex: activeTickerOrder.indexOf(ticker),
        });
    });

    const sortedSeriesForCrosshair = seriesForCrosshair.sort((a, b) => {
        const indexA = activeTickerOrder.indexOf(a.key);
        const indexB = activeTickerOrder.indexOf(b.key);
        return indexA - indexB;
    });

    const totalValuePoints = dateTimes.map((time, idx) => ({
        time,
        value: Number(totalValuesConverted[idx] ?? 0),
    }));

    const layoutKey = valueMode === 'absolute' ? 'compositionAbs' : 'composition';
    if (valueMode === 'absolute') {
        chartLayouts.composition = null;
    } else {
        chartLayouts.compositionAbs = null;
    }
    chartLayouts[layoutKey] = {
        key: layoutKey,
        minTime,
        maxTime,
        valueType: valueMode === 'absolute' ? 'currency' : 'percent',
        valueMode,
        currency: selectedCurrency,
        stackMaxValue: yMax,
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
        series: sortedSeriesForCrosshair,
        percentSeriesMap,
        percentOthersSeries,
        getTotalValueAtTime: createTimeInterpolator(totalValuePoints),
    };

    drawCrosshairOverlay(ctx, chartLayouts[layoutKey]);

    updateLegend(legendSeries, chartManager);
}

function drawCompositionChart(ctx, chartManager) {
    drawCompositionChartLoader(ctx, chartManager, 'percent');
}

function drawCompositionAbsoluteChart(ctx, chartManager) {
    drawCompositionChartLoader(ctx, chartManager, 'absolute');
}

function drawCompositionChartLoader(ctx, chartManager, valueMode) {
    stopPerformanceAnimation();
    stopContributionAnimation();
    stopFxAnimation();
    const emptyState = document.getElementById('runningAmountEmpty');

    if (!compositionDataCache && compositionDataLoading) {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    if (compositionDataCache) {
        renderCompositionChartWithMode(ctx, chartManager, compositionDataCache, { valueMode });
        return;
    }

    compositionDataLoading = true;
    compositionDataLoading = true;
    loadCompositionSnapshotData()
        .then((data) => {
            if (!data) {
                throw new Error('Failed to load composition data');
            }
            compositionDataCache = data;
            renderCompositionChartWithMode(ctx, chartManager, data, { valueMode });
        })
        .catch(() => {
            if (valueMode === 'absolute') {
                chartLayouts.compositionAbs = null;
            } else {
                chartLayouts.composition = null;
            }
            updateCrosshairUI(null, null);
            if (emptyState) {
                emptyState.style.display = 'block';
            }
        })
        .finally(() => {
            compositionDataLoading = false;
        });
}

// --- Main Chart Manager ---

export function createChartManager(options = {}) {
    const crosshairCallbacks = options.crosshairCallbacks || {};
    crosshairExternalUpdate = crosshairCallbacks.onUpdate || null;
    if (typeof crosshairExternalUpdate === 'function') {
        crosshairExternalUpdate(null, null);
    }

    let pendingFrame = null;

    const renderFrame = async (timestamp) => {
        pendingFrame = null;
        const canvas = document.getElementById('runningAmountCanvas');
        if (!canvas) {
            stopPerformanceAnimation();
            stopContributionAnimation();
            stopFxAnimation();
            updateCrosshairUI(null, null);
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            stopPerformanceAnimation();
            stopContributionAnimation();
            stopFxAnimation();
            updateCrosshairUI(null, null);
            return;
        }

        attachCrosshairEvents(canvas, chartManager);

        const dpr = window.devicePixelRatio || 1;
        const displayWidth = canvas.offsetWidth;
        const displayHeight = canvas.offsetHeight;

        if (displayWidth === 0 || displayHeight === 0) {
            stopPerformanceAnimation();
            stopContributionAnimation();
            stopFxAnimation();
            updateCrosshairUI(null, null);
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
        } else if (transactionState.activeChart === 'drawdown') {
            // Percentage drawdown (benchmarks)
            await drawDrawdownChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'drawdownAbs') {
            // Absolute drawdown - use contribution chart with drawdown transformation
            await drawContributionChart(ctx, chartManager, timestamp, { drawdownMode: true });
        } else if (transactionState.activeChart === 'composition') {
            drawCompositionChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'compositionAbs') {
            drawCompositionAbsoluteChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'fx') {
            drawFxChart(ctx, chartManager, timestamp);
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

export const __chartTestables = {
    buildCompositionDisplayOrder,
    aggregateCompositionSeries,
    generateConcreteTicks,
    computePercentTickInfo,
    buildFilteredBalanceSeries,
    buildDrawdownSeries,
};
