import { transactionState } from '../state.js';
import { chartLayouts } from './state.js';
import { CHART_LINE_WIDTHS, CROSSHAIR_SETTINGS } from '../../config.js';
import {
    getMonoFontFamily,
    formatPercentInline,
    formatCrosshairDateLabel,
    clampTime,
    createTimeInterpolator,
} from './helpers.js';
import { formatCurrencyInline, convertValueToCurrency } from '../utils.js';

export const crosshairState = {
    active: false,
    hoverTime: null,
    hoverY: null,
    dragging: false,
    rangeStart: null,
    rangeEnd: null,
    pointerId: null,
};

let crosshairElementsCache = null;
let crosshairExternalUpdate = null;

export function setCrosshairExternalUpdate(fn) {
    crosshairExternalUpdate = fn;
}

export function getCrosshairElements() {
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

export function updateCrosshairUI(snapshot, rangeSummary) {
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

/**
 * Given a cursor Y position on a composition (stacked-area) chart, determine
 * which holding's band the cursor is inside by inverting the Y coordinate
 * and walking the stacked series in order.
 *
 * @param {object} layout    – the composition chart layout
 * @param {number} time      – the crosshair hover timestamp
 * @param {number} hoverY    – the cursor Y pixel coordinate
 * @param {Array}  holdings  – enhanced holdings array (sorted by value desc)
 * @returns {object} the matched holding, or holdings[0] as fallback
 */
export function findHoveredHolding(layout, time, hoverY, holdings) {
    if (!holdings || holdings.length === 0) {
        return null;
    }
    if (
        !layout ||
        !Array.isArray(layout.series) ||
        !layout.chartBounds ||
        !Number.isFinite(hoverY)
    ) {
        return holdings[0];
    }

    const { top, bottom } = layout.chartBounds;
    const plotHeight = bottom - top;
    if (plotHeight <= 0) {
        return holdings[0];
    }

    // Invert yScale: y = top + plotHeight - (value / stackMax) * plotHeight
    // => value = ((bottom - y) / plotHeight) * stackMax
    const stackMax = layout.stackMaxValue || 100;
    const invertedValue = ((bottom - hoverY) / plotHeight) * stackMax;

    // Build a set of holding keys for quick lookup
    const holdingsByKey = new Map();
    holdings.forEach((h) => holdingsByKey.set(h.key, h));

    // Walk through layout.series in stacking order, accumulating values,
    // to find which band the cursor falls in.
    let cumulativeValue = 0;
    for (const series of layout.series) {
        const value = typeof series.getValueAtTime === 'function' ? series.getValueAtTime(time) : 0;
        if (!Number.isFinite(value) || value <= 0) {
            continue;
        }
        const bandBottom = cumulativeValue;
        cumulativeValue += value;
        const bandTop = cumulativeValue;

        // Check if the inverted cursor value falls within this band
        if (invertedValue >= bandBottom && invertedValue <= bandTop) {
            const matched = holdingsByKey.get(series.key);
            if (matched) {
                return matched;
            }
        }
    }

    // Fallback: return the largest holding
    return holdings[0];
}

export function drawCrosshairOverlay(ctx, layout) {
    if (!layout) {
        updateCrosshairUI(null, null);
        return;
    }

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
    const isCompositionLayout =
        layout.key === 'composition' ||
        layout.key === 'compositionAbs' ||
        layout.key === 'sectors' ||
        layout.key === 'sectorsAbs' ||
        layout.key === 'geography' ||
        layout.key === 'geographyAbs';

    // Special handling for composition/sector charts to show breakdown at the crosshair time
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
                percent: isAbsoluteMode ? 0 : value, // Will be enhanced below
                formatted: series.formatValue
                    ? series.formatValue(value, time)
                    : layout.valueType === 'percent' || layout.valueType === 'fx'
                      ? formatPercentInline(value)
                      : formatCurrencyInline(value),
            });
        });

        // Filter out holdings that had 0% allocation at this time (were not held)
        // Only keep holdings that had actual positive allocation
        const nonZeroHoldings = valuesAtTime.filter((item) => item.value > 0.01); // Lower threshold to capture small sectors

        // Sort by value (percentage or absolute) in descending order
        nonZeroHoldings.sort((a, b) => b.value - a.value);

        const totalValueRaw =
            typeof layout.getTotalValueAtTime === 'function'
                ? layout.getTotalValueAtTime(time)
                : null;
        const totalValueBase = Number.isFinite(totalValueRaw) ? totalValueRaw : 0;

        // Enhance ALL non-zero holdings so Y-position hit testing can match any stock
        const enhanceHolding = (holding) => {
            const absoluteValue = isAbsoluteMode
                ? holding.value
                : convertValueToCurrency(
                      (totalValueBase * holding.value) / 100,
                      crosshairDate,
                      selectedCurrency
                  );

            let percentValue = 0;
            if (!isAbsoluteMode) {
                percentValue = holding.value;
            } else if (layout.percentSeriesMap && layout.percentSeriesMap[holding.key]) {
                const dates = layout.dates || [];
                const interpolator = createTimeInterpolator(
                    dates.map((d, i) => ({
                        time: new Date(d).getTime(),
                        value: layout.percentSeriesMap[holding.key][i],
                    }))
                );
                percentValue = interpolator(time) ?? 0;
            } else {
                percentValue = totalValueBase > 0 ? (holding.value / totalValueBase) * 100 : 0;
            }

            const currencyText = formatCurrencyInline(absoluteValue);
            const percentText = `${percentValue.toFixed(2)}%`;
            return {
                ...holding,
                percent: percentValue,
                absoluteValue,
                formatted: isAbsoluteMode ? `${currencyText} (${percentText})` : holding.formatted,
                formattedPercent: percentText,
                formattedValue: currencyText,
            };
        };

        const allEnhancedHoldings = nonZeroHoldings.map(enhanceHolding);
        // Top 7 for display in snapshot panel and dots
        const enhancedHoldings = allEnhancedHoldings.slice(0, 7);

        enhancedHoldings.forEach((h) => seriesSnapshot.push(h));

        // Draw dots for composition chart (stacked)
        if (hasHover && typeof layout.yScale === 'function') {
            const visibleKeys = new Set(enhancedHoldings.map((h) => h.key));
            let stackValue = 0;

            layout.series.forEach((series) => {
                const value = series.getValueAtTime ? series.getValueAtTime(time) : 0;
                if (!Number.isFinite(value)) {
                    return;
                }

                stackValue += value;

                // Only draw dot if it's one of the top holdings shown in the panel
                if (!visibleKeys.has(series.key)) {
                    return;
                }

                // Only draw dot if value is significant enough to be visible as a layer
                if (Math.abs(value) < 0.1) {
                    return;
                }

                const y = layout.yScale(stackValue);
                if (Number.isFinite(y)) {
                    ctx.beginPath();
                    ctx.fillStyle = series.color || '#ffffff';
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
                    ctx.lineWidth = 1.5;
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
            });
        }

        if (hasHover && allEnhancedHoldings.length > 0) {
            const hoveredHolding = findHoveredHolding(
                layout,
                time,
                crosshairState.hoverY,
                allEnhancedHoldings
            );
            drawCompositionHoverPanel(ctx, layout, x, crosshairState.hoverY, time, hoveredHolding);
        }
    } else {
        layout.series.forEach((series) => {
            if (typeof series.getValueAtTime !== 'function') {
                return;
            }
            const value = series.getValueAtTime(time);
            if (value === null || value === undefined) {
                return;
            }

            const isBuySellBar = series.key === 'buyVolume' || series.key === 'sellVolume';

            seriesSnapshot.push({
                key: series.key,
                label: series.label || series.key,
                color: series.color || '#ffffff',
                value,
                formatted: series.formatValue
                    ? series.formatValue(value, time)
                    : layout.valueType === 'percent' || layout.valueType === 'fx'
                      ? formatPercentInline(value)
                      : formatCurrencyInline(value),
                isBuySellBar,
            });

            if (
                hasHover &&
                !isBuySellBar &&
                (typeof series.yScale === 'function' || typeof layout.yScale === 'function')
            ) {
                const yScale = typeof series.yScale === 'function' ? series.yScale : layout.yScale;
                const y = yScale(value);
                if (Number.isFinite(y)) {
                    ctx.beginPath();
                    ctx.fillStyle = series.color || '#ffffff';
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
                    ctx.lineWidth = 1.5;
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
            }
        });
    }

    // Sort snapshot for display
    seriesSnapshot.sort((a, b) => {
        // Buy/Sell bars always at the bottom
        if (a.isBuySellBar && !b.isBuySellBar) {
            return 1;
        }
        if (!a.isBuySellBar && b.isBuySellBar) {
            return -1;
        }
        // Then by value descending
        return Math.abs(b.value) - Math.abs(a.value);
    });

    const dateLabel = formatCrosshairDateLabel(time);

    // Build range summary if range is selected
    let rangeSummary = null;
    if (hasRange) {
        rangeSummary = buildRangeSummary(
            layout,
            crosshairState.rangeStart,
            crosshairState.rangeEnd
        );
    }

    updateCrosshairUI(
        {
            time,
            dateLabel,
            series: seriesSnapshot,
            chartKey: layout.key,
        },
        rangeSummary
    );
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

export function drawCompositionHoverPanel(ctx, layout, crosshairX, crosshairY, time, holding) {
    if (!holding) {
        return;
    }
    const dateLabel = formatCrosshairDateLabel(time);
    const bounds = layout.chartBounds;
    if (!bounds || !dateLabel) {
        return;
    }

    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
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

export const legendState = {
    performanceDirty: true,
    contributionDirty: true,
};

export function setDependentChartVisibility() {
    // Logic to update visibility state, assuming transactionState works
    // This function is needed if we move updateLegend here.
}

export function updateLegend(series, chartManager) {
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

        // Skip click events for stacked charts (composition, sectors, geography)
        if (
            transactionState.activeChart !== 'composition' &&
            transactionState.activeChart !== 'sectors' &&
            transactionState.activeChart !== 'geography'
        ) {
            item.addEventListener('click', () => {
                if (
                    transactionState.activeChart === 'performance' ||
                    transactionState.activeChart === 'drawdown' ||
                    transactionState.activeChart === 'rolling' ||
                    transactionState.activeChart === 'volatility' ||
                    transactionState.activeChart === 'beta'
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
                        legendState.performanceDirty = true; // Mark legend as needing update
                    }
                } else {
                    // Normal behavior for other charts (like Contribution)
                    const isDisabled = item.classList.toggle('legend-disabled');
                    // We need setChartVisibility here, or access transactionState directly
                    transactionState.chartVisibility[s.key] = !isDisabled;
                    legendState.contributionDirty = true; // Set flag to redraw legend
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

// --- Crosshair Event Handling ---

let pointerCanvas = null;
let pointerEventsAttached = false;
let containerPointerBound = false;
let crosshairChartManager = null;

function getActiveChartKey() {
    const active = transactionState.activeChart || 'contribution';
    if (
        active === 'performance' ||
        active === 'composition' ||
        active === 'compositionAbs' ||
        active === 'sectors' ||
        active === 'sectorsAbs' ||
        active === 'geography' ||
        active === 'geographyAbs' ||
        active === 'concentration' ||
        active === 'pe' ||
        active === 'contribution' ||
        active === 'fx' ||
        active === 'drawdown' ||
        active === 'drawdownAbs' ||
        active === 'rolling' ||
        active === 'volatility' ||
        active === 'beta' ||
        active === 'yield'
    ) {
        return active;
    }
    return 'contribution';
}

function getActiveLayout() {
    const key = getActiveChartKey();
    return chartLayouts[key];
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

    // Skip range functionality for composition/sector/beta/yield charts
    if (
        layout.key === 'composition' ||
        layout.key === 'compositionAbs' ||
        layout.key === 'sectors' ||
        layout.key === 'sectorsAbs' ||
        layout.key === 'geography' ||
        layout.key === 'geographyAbs' ||
        layout.key === 'beta' ||
        layout.key === 'yield'
    ) {
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

    // Skip range functionality for composition/sector/beta/yield charts
    if (
        layout.key === 'composition' ||
        layout.key === 'compositionAbs' ||
        layout.key === 'sectors' ||
        layout.key === 'sectorsAbs' ||
        layout.key === 'geography' ||
        layout.key === 'geographyAbs' ||
        layout.key === 'beta' ||
        layout.key === 'yield'
    ) {
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

    // Skip range functionality for composition/sector/beta/yield charts
    if (
        layout &&
        (layout.key === 'composition' ||
            layout.key === 'compositionAbs' ||
            layout.key === 'sectors' ||
            layout.key === 'sectorsAbs' ||
            layout.key === 'geography' ||
            layout.key === 'geographyAbs' ||
            layout.key === 'beta' ||
            layout.key === 'yield')
    ) {
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

export function attachCrosshairEvents(canvas, chartManager) {
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
