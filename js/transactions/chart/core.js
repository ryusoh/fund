import { niceNumber, getMonoFontFamily, colorWithAlpha, clamp01 } from './helpers.js';

function sanitizeRange(yMin, yMax) {
    const safeMin = Number.isFinite(yMin) ? Number(yMin) : 0;
    const safeMax = Number.isFinite(yMax) ? Number(yMax) : safeMin;
    let minValue = Math.min(safeMin, safeMax);
    let maxValue = Math.max(safeMin, safeMax);
    if (!Number.isFinite(minValue)) {
        minValue = 0;
    }
    if (!Number.isFinite(maxValue) || maxValue - minValue < 1e-6) {
        maxValue = minValue + 1;
    }
    return { minValue, maxValue, range: maxValue - minValue };
}

function calculatePercentSpacing(range, targetSegments) {
    const niceRange = niceNumber(range, false);
    let tickSpacing = Math.abs(niceNumber(niceRange / targetSegments, true));

    if (!Number.isFinite(tickSpacing) || tickSpacing === 0) {
        tickSpacing = Math.abs(niceNumber(range / targetSegments, true));
    }
    if (!Number.isFinite(tickSpacing) || tickSpacing === 0) {
        tickSpacing = range / targetSegments;
    }
    return Math.max(tickSpacing, 1e-2);
}

function generatePercentTicksForSpacing(minValue, maxValue, tickSpacing) {
    const startTick = Math.floor(minValue / tickSpacing) * tickSpacing;
    const endTick = Math.ceil(maxValue / tickSpacing) * tickSpacing;
    const ticks = [];
    for (let tick = startTick; tick <= endTick + tickSpacing * 0.001; tick += tickSpacing) {
        const rounded = Number((Math.round(tick / tickSpacing) * tickSpacing).toFixed(6));
        ticks.push(rounded);
    }
    return { ticks, startTick, endTick };
}

export function computePercentTickInfo(yMin, yMax) {
    const { minValue, maxValue, range } = sanitizeRange(yMin, yMax);
    const desiredTicks = 6;
    const targetSegments = Math.max(1, desiredTicks - 1);
    let tickSpacing = calculatePercentSpacing(range, targetSegments);

    const minRequiredTicks = 5;
    const maxRetries = 6;
    let result = { ticks: [], startTick: 0, endTick: 0 };

    for (let retry = 0; retry < maxRetries; retry++) {
        result = generatePercentTicksForSpacing(minValue, maxValue, tickSpacing);
        const viewTicks = result.ticks.filter(
            (t) => t >= minValue - tickSpacing * 0.25 && t <= maxValue + tickSpacing * 0.25
        );

        if (viewTicks.length >= minRequiredTicks) {
            break;
        }

        tickSpacing /= 2;
        if (tickSpacing < 1e-2) {
            break;
        }
    }

    return {
        ticks: result.ticks,
        tickSpacing,
        startTick: result.startTick,
        endTick: result.endTick,
    };
}

function handleFlatLineRange(yMin, yMax, range) {
    if (Number.isFinite(range) && range > 1e-9) {
        return { yMin, yMax, range };
    }
    const base = Math.abs(yMin) < 1e-9 ? 100 : Math.abs(yMin);
    const margin = base * 0.05; // +/- 5% margin
    const safeMargin = margin < 1e-9 ? 1 : margin;

    // Create artificial range
    const newMin = yMin - safeMargin;
    const newMax = yMax + safeMargin;
    return { yMin: newMin, yMax: newMax, range: newMax - newMin };
}

function calculateTickSpacing(yMin, yMax, maxTicks) {
    const initialRange = yMax - yMin;
    const {
        yMin: adjustedMin,
        yMax: adjustedMax,
        range,
    } = handleFlatLineRange(yMin, yMax, initialRange);

    const desiredTicks = maxTicks || 6;
    const targetSegments = Math.max(1, desiredTicks - 1) * (maxTicks ? 2 : 1);

    let tickSpacing = Math.abs(niceNumber(range / targetSegments, true));
    if (!Number.isFinite(tickSpacing) || tickSpacing === 0) {
        tickSpacing = Math.pow(10, Math.floor(Math.log10(Math.abs(range))));
    }
    // Duplicate check from original code
    if (!Number.isFinite(tickSpacing) || tickSpacing === 0) {
        tickSpacing = Math.pow(10, Math.floor(Math.log10(Math.abs(range))));
    }
    tickSpacing = Math.max(tickSpacing, 1e-6); // Avoid zero spacing

    return { yMin: adjustedMin, yMax: adjustedMax, tickSpacing };
}

function generateTickSequence(yMin, yMax, initialTickSpacing, maxTicks) {
    let finalTicks = [];
    const minRequiredTicks = maxTicks ? Math.floor(maxTicks * 0.5) : 5;
    const maxRetries = 6;
    let tickSpacing = initialTickSpacing;

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

export function generateConcreteTicks(yMin, yMax, isPerformanceChart, currency, options = {}) {
    if (isPerformanceChart) {
        const percentTickInfo = computePercentTickInfo(yMin, yMax);
        const margin = percentTickInfo.tickSpacing * 0.25;
        return percentTickInfo.ticks.filter(
            (tick) => tick >= yMin - margin && tick <= yMax + margin
        );
    }

    // maxTicks: compact panes (e.g. the volume subpane) ask for fewer, larger
    // steps instead of the default dense grid
    const maxTicks = Number.isFinite(options?.maxTicks) ? Math.max(1, options.maxTicks) : null;
    const {
        yMin: adjustedMin,
        yMax: adjustedMax,
        tickSpacing,
    } = calculateTickSpacing(yMin, yMax, maxTicks);

    return generateTickSequence(adjustedMin, adjustedMax, tickSpacing, maxTicks);
}

function getPrimaryYearForSingleYear(startDate, endDate) {
    if (startDate.getFullYear() === endDate.getFullYear()) {
        return startDate.getFullYear();
    }
    const endOfStartYear = new Date(startDate.getFullYear(), 11, 31);
    const startOfEndYear = new Date(endDate.getFullYear(), 0, 1);
    const timeInStartYear = endOfStartYear.getTime() - startDate.getTime();
    const timeInEndYear = endDate.getTime() - startOfEndYear.getTime();
    return timeInEndYear > timeInStartYear ? endDate.getFullYear() : startDate.getFullYear();
}

function generateSingleYearTicks(startDate, endDate, minTime, maxTime, formatYear) {
    const ticks = [];
    const year = getPrimaryYearForSingleYear(startDate, endDate);
    const formattedYear = formatYear(year);
    const quarters = [
        { month: 0, label: `${formattedYear}`, isYearStart: true },
        { month: 3, label: 'Apr', isYearStart: false },
        { month: 6, label: 'Jul', isYearStart: false },
        { month: 9, label: 'Oct', isYearStart: false },
    ];

    const marginMs = 30 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < quarters.length; i++) {
        const q = quarters[i];
        const quarterDate = new Date(year, q.month, 1).getTime();
        if (quarterDate >= minTime - marginMs && quarterDate <= maxTime + marginMs) {
            ticks.push({
                time: quarterDate,
                label: q.label,
                isYearStart: q.isYearStart,
            });
        }
    }

    if (startDate.getFullYear() !== endDate.getFullYear() && year === startDate.getFullYear()) {
        const newYearJan1 = new Date(endDate.getFullYear(), 0, 1).getTime();
        if (newYearJan1 >= minTime && newYearJan1 <= maxTime) {
            ticks.push({
                time: newYearJan1,
                label: `${formatYear(endDate.getFullYear())}`,
                isYearStart: true,
            });
        }
    }
    return ticks;
}

function generateMultiYearTicks(startDate, endDate, minTime, maxTime, formatYear) {
    const ticks = [];
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
    return ticks;
}

function createEndTick(endDate, maxTime, ticks, formatYear) {
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
    const endYear = endDate.getFullYear();
    const hasYearTick = ticks.some(
        (t) => t.isYearStart && new Date(t.time).getFullYear() === endYear
    );

    let endLabel;
    if (endMonth === 'Jan' && hasYearTick) {
        endLabel = 'Jan';
    } else {
        endLabel = endMonth === 'Jan' ? `${formatYear(endYear)}` : endMonth;
    }

    return {
        time: maxTime,
        label: endLabel,
        isYearStart: endMonth === 'Jan' && !hasYearTick,
    };
}

function createStartTick(startDate, endDate, minTime, isSingleYear, isMobile, formatYear) {
    const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
    const startYear = startDate.getFullYear();

    if (isSingleYear) {
        const displayYear =
            startDate.getFullYear() === endDate.getFullYear()
                ? startDate.getFullYear()
                : startDate.getMonth() >= 6
                  ? endDate.getFullYear()
                  : startDate.getFullYear();
        return {
            time: minTime,
            label: `${formatYear(displayYear)}`,
            isYearStart: true,
        };
    }

    if (!isMobile) {
        return {
            time: minTime,
            label: startMonth === 'Jan' ? `${formatYear(startYear)}` : startMonth,
            isYearStart: startMonth === 'Jan',
        };
    }

    return null;
}

export function generateYearBasedTicks(minTime, maxTime) {
    const startDate = new Date(minTime);
    const endDate = new Date(maxTime);
    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
    const formatYear = (year) => (isMobile ? `'${String(year).slice(2)}` : year);

    const dataSpanMonths =
        (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1;
    const isSingleYear = startDate.getFullYear() === endDate.getFullYear() || dataSpanMonths <= 15;

    const ticks = isSingleYear
        ? generateSingleYearTicks(startDate, endDate, minTime, maxTime, formatYear)
        : generateMultiYearTicks(startDate, endDate, minTime, maxTime, formatYear);

    ticks.push(createEndTick(endDate, maxTime, ticks, formatYear));

    const startTick = createStartTick(
        startDate,
        endDate,
        minTime,
        isSingleYear,
        isMobile,
        formatYear
    );
    if (startTick && !ticks.some((tick) => tick.time === minTime)) {
        ticks.push(startTick);
    }

    ticks.sort((a, b) => a.time - b.time);
    return ticks;
}

function preparePrioritizedTicks(ticks, yScale, yMin, yMax) {
    let ticksMax = -Infinity;
    let ticksMin = Infinity;
    for (let i = 0; i < ticks.length; i++) {
        const v = ticks[i];
        if (v > ticksMax) {
            ticksMax = v;
        }
        if (v < ticksMin) {
            ticksMin = v;
        }
    }

    const filteredTicks = new Array(ticks.length);
    for (let i = 0; i < ticks.length; i++) {
        const value = ticks[i];
        let priority = 2;
        const absVal = Math.abs(value);
        if (absVal < 1e-9) {
            priority = 0;
        } else if (value === yMax || value === yMin || value === ticksMax || value === ticksMin) {
            priority = 1;
        }
        filteredTicks[i] = { value, y: yScale(value), priority, abs: absVal };
    }

    filteredTicks.sort((a, b) => b.abs - a.abs);
    return filteredTicks;
}

function checkTickCollision(tickY, selectedTicks, minSpacingPixels, avoidY, minAvoidSpacing) {
    for (let s = 0; s < selectedTicks.length; s++) {
        if (Math.abs(tickY - selectedTicks[s].y) < minSpacingPixels) {
            return true;
        }
    }
    if (Array.isArray(avoidY) && avoidY.length > 0) {
        for (let a = 0; a < avoidY.length; a++) {
            if (Math.abs(tickY - avoidY[a]) < minAvoidSpacing) {
                return true;
            }
        }
    }
    return false;
}

function selectYAxisTicks(ticks, yScale, fontSize, isMobile, yMin, yMax, avoidY) {
    const minSpacingPixels = Math.floor(fontSize);
    const minAvoidSpacing = fontSize + (isMobile ? 4 : 6);
    const prioritizedTicks = preparePrioritizedTicks(ticks, yScale, yMin, yMax);
    const selectedTicks = [];

    for (let p = 0; p <= 2; p++) {
        for (let i = 0; i < prioritizedTicks.length; i++) {
            const tick = prioritizedTicks[i];
            if (tick.priority !== p) {
                continue;
            }

            if (
                !checkTickCollision(
                    tick.y,
                    selectedTicks,
                    minSpacingPixels,
                    avoidY,
                    minAvoidSpacing
                )
            ) {
                selectedTicks.push(tick);
            }
        }
    }
    return selectedTicks;
}

function renderYAxis(
    ctx,
    selectedTicks,
    padding,
    plotWidth,
    fontSize,
    monoFont,
    isMobile,
    yLabelFormatter
) {
    const halfTextHeight = fontSize / 2;
    for (let i = 0; i < selectedTicks.length; i++) {
        const { value, y } = selectedTicks[i];
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + plotWidth, y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.stroke();
        ctx.fillStyle = '#8b949e';
        ctx.font = `${fontSize}px ${monoFont}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = y - halfTextHeight < 2 ? 'top' : 'middle';
        ctx.fillText(yLabelFormatter(value), padding.left - (isMobile ? 8 : 10), y);
    }
}

function renderXAxisGrid(ctx, tick, x, padding, plotHeight, plotWidth) {
    if (x <= padding.left + 5 || x >= padding.left + plotWidth - 5) {
        return;
    }
    if (tick.isYearStart) {
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + plotHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (
        tick.label.includes('Apr') ||
        tick.label.includes('Jul') ||
        tick.label.includes('Oct')
    ) {
        ctx.beginPath();
        ctx.setLineDash([2, 2]);
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + plotHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function renderXAxis(
    ctx,
    yearTicks,
    xScale,
    padding,
    plotWidth,
    plotHeight,
    isMobile,
    monoFont,
    drawXAxis
) {
    if (drawXAxis) {
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + plotHeight);
        ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = isMobile ? `9px ${monoFont}` : `11px ${monoFont}`;
    }

    const minSpacing = isMobile ? 30 : 40;
    for (let index = 0; index < yearTicks.length; index++) {
        const tick = yearTicks[index];
        const x = xScale(tick.time);

        let shouldDrawLabel = true;
        if (index > 0) {
            const prevTickX = xScale(yearTicks[index - 1].time);
            if (x - prevTickX < minSpacing) {
                shouldDrawLabel = false;
            }
        }

        if (drawXAxis && shouldDrawLabel) {
            if (isMobile && index === yearTicks.length - 1) {
                ctx.textAlign = 'right';
            } else {
                ctx.textAlign = 'center';
            }

            ctx.beginPath();
            ctx.moveTo(x, padding.top + plotHeight);
            ctx.lineTo(x, padding.top + plotHeight + (isMobile ? 4 : 6));
            ctx.stroke();

            ctx.fillText(tick.label, x, padding.top + plotHeight + (isMobile ? 8 : 10));
        }

        renderXAxisGrid(ctx, tick, x, padding, plotHeight, plotWidth);
    }
}

export function drawAxes(
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
    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
    const monoFont = getMonoFontFamily();
    const { drawXAxis = true, drawYAxis = true, maxTicks = null, avoidY = [] } = axisOptions;

    const ticks = generateConcreteTicks(yMin, yMax, isPerformanceChart || forcePercent, currency, {
        maxTicks,
    });

    let selectedTicks = [];
    if (drawYAxis) {
        const fontSize = isMobile ? 9 : 11;
        selectedTicks = selectYAxisTicks(ticks, yScale, fontSize, isMobile, yMin, yMax, avoidY);
        renderYAxis(
            ctx,
            selectedTicks,
            padding,
            plotWidth,
            fontSize,
            monoFont,
            isMobile,
            yLabelFormatter
        );
    }

    const yearTicks = generateYearBasedTicks(minTime, maxTime);
    renderXAxis(
        ctx,
        yearTicks,
        xScale,
        padding,
        plotWidth,
        plotHeight,
        isMobile,
        monoFont,
        drawXAxis
    );

    return { selectedTicks };
}

function getSharedCanvas(width, height) {
    if (!drawMountainFill._sharedCanvas && typeof document !== 'undefined') {
        drawMountainFill._sharedCanvas = document.createElement('canvas');
        drawMountainFill._sharedCtx = drawMountainFill._sharedCanvas.getContext('2d');
    }

    const offscreen = drawMountainFill._sharedCanvas;
    const offCtx = drawMountainFill._sharedCtx;

    if (!offscreen || !offCtx) {
        return null;
    }

    if (offscreen.width !== width) {
        offscreen.width = width;
    }
    if (offscreen.height !== height) {
        offscreen.height = height;
    }
    offCtx.clearRect(0, 0, width, height);
    return { offscreen, offCtx };
}

function applyMountainFillColor(offCtx, width, color, colorStops) {
    if (Array.isArray(colorStops) && colorStops.length > 0) {
        const horizontalGradient = offCtx.createLinearGradient(0, 0, width, 0);
        const stopCount = colorStops.length;
        for (let index = 0; index < stopCount; index++) {
            const stopColor = colorStops[index];
            const offset = stopCount === 1 ? 0 : index / (stopCount - 1);
            horizontalGradient.addColorStop(offset, colorWithAlpha(stopColor, 1));
        }
        offCtx.fillStyle = horizontalGradient;
    } else {
        offCtx.fillStyle = colorWithAlpha(color, 1);
    }
    offCtx.fill();
}

function applyMountainFillAlphaGradient(
    offCtx,
    width,
    height,
    areaCoords,
    clampedBaselineY,
    bounds,
    opacityTop,
    opacityBottom
) {
    let minYRel = clampedBaselineY - bounds.top;
    let maxYRel = clampedBaselineY - bounds.top;
    for (let i = 0; i < areaCoords.length; i += 1) {
        const relativeY = areaCoords[i].y - bounds.top;
        if (relativeY < minYRel) {
            minYRel = relativeY;
        }
        if (relativeY > maxYRel) {
            maxYRel = relativeY;
        }
    }
    const gradientTop = Math.min(minYRel, maxYRel - 0.0001);
    const gradientBottom = Math.max(maxYRel, gradientTop + 0.0001);

    offCtx.globalCompositeOperation = 'destination-in';
    const alphaGradient = offCtx.createLinearGradient(0, gradientTop, 0, gradientBottom);
    alphaGradient.addColorStop(0, `rgba(0, 0, 0, ${clamp01(opacityTop)})`);
    alphaGradient.addColorStop(1, `rgba(0, 0, 0, ${clamp01(opacityBottom)})`);
    offCtx.fillStyle = alphaGradient;
    offCtx.fillRect(0, 0, width, height);
    offCtx.globalCompositeOperation = 'source-over';
}

export function drawMountainFill(ctx, coords, baselineY, options) {
    if (!Array.isArray(coords) || coords.length === 0) {
        return;
    }

    const { color, colorStops, opacityTop = 0.35, opacityBottom = 0, bounds } = options || {};

    if (!bounds || bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
        return;
    }

    if (typeof document === 'undefined' || !Number.isFinite(baselineY)) {
        return;
    }

    const clampedBaselineY = Math.min(Math.max(baselineY, bounds.top), bounds.bottom);
    const baseCoords = coords.length === 1 ? [coords[0], coords[0]] : coords;
    const areaCoords = new Array(baseCoords.length);
    for (let i = 0; i < baseCoords.length; i++) {
        areaCoords[i] = {
            x: baseCoords[i].x,
            y: baseCoords[i].y,
        };
    }

    const width = Math.max(1, Math.ceil(bounds.right - bounds.left));
    const height = Math.max(1, Math.ceil(bounds.bottom - bounds.top));

    const shared = getSharedCanvas(width, height);
    if (!shared) {
        return;
    }
    const { offscreen, offCtx } = shared;

    offCtx.beginPath();
    offCtx.moveTo(areaCoords[0].x - bounds.left, areaCoords[0].y - bounds.top);
    for (let i = 1; i < areaCoords.length; i += 1) {
        offCtx.lineTo(areaCoords[i].x - bounds.left, areaCoords[i].y - bounds.top);
    }
    offCtx.lineTo(areaCoords[areaCoords.length - 1].x - bounds.left, clampedBaselineY - bounds.top);
    offCtx.lineTo(areaCoords[0].x - bounds.left, clampedBaselineY - bounds.top);
    offCtx.closePath();

    applyMountainFillColor(offCtx, width, color, colorStops);
    applyMountainFillAlphaGradient(
        offCtx,
        width,
        height,
        areaCoords,
        clampedBaselineY,
        bounds,
        opacityTop,
        opacityBottom
    );

    ctx.drawImage(offscreen, bounds.left, bounds.top);
}

export function drawMarker(context, x, y, radius, isBuy, colors, chartBounds) {
    const clampedY = Math.max(chartBounds.top + radius, Math.min(y, chartBounds.bottom - radius));

    context.beginPath();
    context.arc(x, clampedY, radius, 0, Math.PI * 2);
    context.fillStyle = isBuy ? colors.buyFill : colors.sellFill;
    context.strokeStyle = isBuy ? colors.buy : colors.sell;
    context.lineWidth = 1;
    context.fill();
    context.stroke();
}

/**
 * Nudge a label's vertical position so it does not overlap any previously
 * placed labels.  The function tries moving the label in the direction that
 * keeps it closer to its natural position (where the data line is); if that
 * would push it out of the visible plot area it tries the other direction.
 *
 * @param {number} textY – initial y centre of the label
 * @param {number} textHeight – total text height
 * @param {number} bgPadding – padding around the text background
 * @param {Array} existingBounds – bounding boxes of previously placed labels
 * @param {object} padding – chart padding ({ top, … })
 * @param {number} plotHeight – available plot height
 * @param {number} [naturalY] – optional, the y position of the data point
 *   on the chart.  When provided, the nudge direction will prefer moving
 *   toward this position rather than always trying downward first.
 */
export function nudgeLabelPosition(
    textY,
    textHeight,
    bgPadding,
    existingBounds,
    padding,
    plotHeight,
    naturalY
) {
    if (!Number.isFinite(textY)) {
        return textY;
    }
    if (!Array.isArray(existingBounds) || existingBounds.length === 0) {
        return textY;
    }

    // Filter out invalid bounds
    const validBounds = existingBounds.filter(
        (b) => Number.isFinite(b.y) && Number.isFinite(b.height)
    );
    if (validBounds.length === 0) {
        return textY;
    }

    const targetY = naturalY !== undefined ? naturalY : textY;
    const halfHeight = textHeight / 2 + bgPadding;
    const minY = padding.top + halfHeight;
    const maxY = padding.top + plotHeight - halfHeight;
    const gap = 2;

    // 1. Generate candidates: target, plus just above/below each existing label
    const candidates = [targetY];
    for (const bound of validBounds) {
        const boundTop = bound.y - bound.height / 2;
        const boundBottom = bound.y + bound.height / 2;

        candidates.push(boundTop - gap - halfHeight);
        candidates.push(boundBottom + gap + halfHeight);
    }

    // 2. Sort candidates by distance to targetY to find best position
    candidates.sort((a, b) => Math.abs(a - targetY) - Math.abs(b - targetY));

    // 3. Find first valid candidate that doesn't overlap
    for (const candidateY of candidates) {
        // Clamp to plot area first
        const y = Math.max(minY, Math.min(candidateY, maxY));

        // Check if this position causes overlap
        const myTop = y - halfHeight;
        const myBottom = y + halfHeight;
        let overlap = false;

        for (const bound of validBounds) {
            const bTop = bound.y - bound.height / 2;
            const bBottom = bound.y + bound.height / 2;

            // Simple vertical overlap check (assuming shared X space)
            if (myBottom > bTop && myTop < bBottom) {
                overlap = true;
                break;
            }
        }

        if (!overlap) {
            return y;
        }
    }

    // Fallback: if all candidate positions overlap (e.g. crowded),
    // return the target position clamped to screen
    return Math.max(minY, Math.min(targetY, maxY));
}

function calculateEndValuePosition(
    x,
    y,
    textWidth,
    textHeight,
    isMobile,
    padding,
    plotWidth,
    plotHeight
) {
    if (isMobile) {
        return {
            textX: padding.left + plotWidth - textWidth - 5,
            textY: Math.max(
                padding.top + textHeight / 2,
                Math.min(y, padding.top + plotHeight - textHeight / 2)
            ),
        };
    }

    const spaceAbove = y - padding.top;
    const spaceBelow = padding.top + plotHeight - y;
    let textX;
    let textY;

    if (spaceAbove > textHeight + 8) {
        textX = x + 3;
        textY = y - 3;
    } else if (spaceBelow > textHeight + 8) {
        textX = x + 3;
        textY = y + textHeight + 3;
    } else {
        textX = padding.left + plotWidth - textWidth - 5;
        textY = Math.max(
            padding.top + textHeight / 2,
            Math.min(y, padding.top + plotHeight - textHeight / 2)
        );
    }

    if (textX + textWidth > padding.left + plotWidth - 5) {
        textX = padding.left + plotWidth - textWidth - 5;
    }

    return { textX, textY };
}

export function drawEndValue(
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
    showBackground = false,
    existingBounds = null
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

    const rawPos = calculateEndValuePosition(
        x,
        y,
        textWidth,
        textHeight,
        isMobile,
        padding,
        plotWidth,
        plotHeight
    );

    const textX = Math.max(
        padding.left + 2,
        Math.min(rawPos.textX, padding.left + plotWidth - textWidth - 2)
    );
    let textY = Math.max(
        padding.top + textHeight / 2,
        Math.min(rawPos.textY, padding.top + plotHeight - textHeight / 2)
    );

    // Nudge away from any previously drawn labels
    if (existingBounds) {
        textY = nudgeLabelPosition(
            textY,
            textHeight,
            bgPadding,
            existingBounds,
            padding,
            plotHeight,
            y
        );
    }

    if (showBackground) {
        context.fillStyle = 'rgba(0, 0, 0, 0.4)';
        context.beginPath();
        if (typeof context.roundRect === 'function') {
            context.roundRect(
                textX - bgPadding,
                textY - textHeight / 2 - bgPadding,
                textWidth + bgPadding * 2,
                textHeight + bgPadding * 2,
                3
            );
        } else {
            context.rect(
                textX - bgPadding,
                textY - textHeight / 2 - bgPadding,
                textWidth + bgPadding * 2,
                textHeight + bgPadding * 2
            );
        }
        context.fill();
    }

    context.fillStyle = color;
    context.fillText(text, textX, textY);

    return {
        x: textX,
        y: textY,
        width: textWidth + bgPadding * 2,
        height: textHeight + bgPadding * 2,
    };
}

export function drawStartValue(
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
    showBackground = false,
    existingBounds = null
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
    let textY = Math.max(
        padding.top + textHeight / 2,
        Math.min(y, padding.top + plotHeight - textHeight / 2)
    );

    // Nudge away from any previously drawn labels
    if (existingBounds) {
        textY = nudgeLabelPosition(
            textY,
            textHeight,
            bgPadding,
            existingBounds,
            padding,
            plotHeight,
            y
        );
    }

    if (showBackground) {
        context.fillStyle = 'rgba(0, 0, 0, 0.4)';
        context.beginPath();
        if (typeof context.roundRect === 'function') {
            context.roundRect(
                textX - bgPadding,
                textY - textHeight / 2 - bgPadding,
                textWidth + bgPadding * 2,
                textHeight + bgPadding * 2,
                3
            );
        } else {
            context.rect(
                textX - bgPadding,
                textY - textHeight / 2 - bgPadding,
                textWidth + bgPadding * 2,
                textHeight + bgPadding * 2
            );
        }
        context.fill();
    }

    context.fillStyle = color;
    context.fillText(text, textX, textY);

    return {
        x: textX,
        y: textY,
        width: textWidth + bgPadding * 2,
        height: textHeight + bgPadding * 2,
    };
}
