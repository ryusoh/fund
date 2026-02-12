import { niceNumber, getMonoFontFamily, colorWithAlpha, clamp01 } from './helpers.js';

export function computePercentTickInfo(yMin, yMax) {
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

export function generateConcreteTicks(yMin, yMax, isPerformanceChart) {
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

export function generateYearBasedTicks(minTime, maxTime) {
    const ticks = [];
    const startDate = new Date(minTime);
    const endDate = new Date(maxTime);
    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;

    const formatYear = (year) => {
        return isMobile ? `'${String(year).slice(2)}` : year;
    };

    // Calculate data span in months
    const dataSpanMonths =
        (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1;

    // Check if data is within a single year (same year OR spans \u226415 months)
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

        // If data spans into a new year and primary year is the start year,
        // add a tick at Jan 1 of the new year so the year label appears at the year boundary
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

    // Add beginning tick - for single-year mode, always add year label at start
    // For multi-year mode, only add start tick on desktop
    const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
    const startYear = startDate.getFullYear();

    // In single-year mode, show the year as the first label (industry standard)
    // This matches financial charting conventions (Bloomberg, TradingView, etc.)
    let startLabel;
    let shouldAddStartTick = false;

    if (isSingleYear) {
        // For single-year filtered data, always show the year as the first label
        const displayYear =
            startDate.getFullYear() === endDate.getFullYear()
                ? startDate.getFullYear()
                : startDate.getMonth() >= 6
                  ? endDate.getFullYear()
                  : startDate.getFullYear();
        startLabel = `${formatYear(displayYear)}`;
        shouldAddStartTick = true; // Always add for single-year mode (mobile and desktop)
    } else if (!isMobile) {
        // Multi-year: only add start tick on desktop
        startLabel = startMonth === 'Jan' ? `${formatYear(startYear)}` : startMonth;
        shouldAddStartTick = true;
    }

    if (shouldAddStartTick) {
        // Check if we already have a tick for the start date
        const hasStartTick = ticks.some((tick) => tick.time === minTime);
        if (!hasStartTick) {
            ticks.push({
                time: minTime,
                label: startLabel,
                isYearStart: isSingleYear || startMonth === 'Jan',
            });
        }
    }

    // Sort ticks by time
    ticks.sort((a, b) => a.time - b.time);

    return ticks;
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
    const { drawXAxis = true, drawYAxis = true } = axisOptions;

    // Generate concrete tick values
    const ticks = generateConcreteTicks(yMin, yMax, isPerformanceChart || forcePercent, currency);

    // Y-axis grid lines and labels
    if (drawYAxis) {
        const fontSize = isMobile ? 9 : 11;
        const halfTextHeight = fontSize / 2;
        ticks.forEach((value) => {
            const y = yScale(value);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + plotWidth, y);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.stroke();
            ctx.fillStyle = '#8b949e';
            ctx.font = `${fontSize}px ${monoFont}`;
            ctx.textAlign = 'right';
            // Use 'top' baseline only when label would be clipped at canvas top
            const wouldClipTop = y - halfTextHeight < 2;
            ctx.textBaseline = wouldClipTop ? 'top' : 'middle';
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

        // Check for label collision (Desktop & Mobile)
        let shouldDrawLabel = true;
        if (index > 0) {
            const prevTickX = xScale(yearTicks[index - 1].time);
            // Minimum spacing threshold (pixels)
            const minSpacing = isMobile ? 30 : 40;

            if (x - prevTickX < minSpacing) {
                shouldDrawLabel = false;
            }
        }

        if (drawXAxis && shouldDrawLabel) {
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
        // Note: This is drawn even if the label was skipped due to collision
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

export function drawMountainFill(ctx, coords, baselineY, options) {
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

    let textX, textY;

    if (isMobile) {
        textX = padding.left + plotWidth - textWidth - 5;
        textY = Math.max(
            padding.top + textHeight / 2,
            Math.min(y, padding.top + plotHeight - textHeight / 2)
        );
    } else {
        const spaceAbove = y - padding.top;
        const spaceBelow = padding.top + plotHeight - y;

        if (spaceAbove > textHeight + 8) {
            textX = x + 3;
            textY = y - 3;
            if (textX + textWidth > padding.left + plotWidth - 5) {
                textX = padding.left + plotWidth - textWidth - 5;
            }
        } else if (spaceBelow > textHeight + 8) {
            textX = x + 3;
            textY = y + textHeight + 3;
            if (textX + textWidth > padding.left + plotWidth - 5) {
                textX = padding.left + plotWidth - textWidth - 5;
            }
        } else {
            textX = padding.left + plotWidth - textWidth - 5;
            textY = Math.max(
                padding.top + textHeight / 2,
                Math.min(y, padding.top + plotHeight - textHeight / 2)
            );
        }
    }

    textX = Math.max(padding.left + 2, Math.min(textX, padding.left + plotWidth - textWidth - 2));
    textY = Math.max(
        padding.top + textHeight / 2,
        Math.min(textY, padding.top + plotHeight - textHeight / 2)
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
