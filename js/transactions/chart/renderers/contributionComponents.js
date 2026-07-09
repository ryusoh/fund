import { drawAxes, drawMarker } from '../core.js';
import { CONTRIBUTION_CHART_SETTINGS } from '../../../config.js';

export function drawContributionMarkers(ctx, rawContributionData, options = {}) {
    const {
        showMarkersConfig,
        showBuy,
        showSell,
        minTime,
        maxTime,
        xScale,
        yScale,
        bounds,
        colors,
    } = options;

    if (showMarkersConfig === false) {
        return;
    }

    const markerGroups = new Map();

    // Bolt: Use explicit loops instead of .forEach to eliminate closure allocations and reduce GC overhead
    for (let i = 0; i < rawContributionData.length; i += 1) {
        const item = rawContributionData[i];
        if (typeof item.orderType !== 'string') {
            continue;
        }
        const type = item.orderType.toLowerCase();
        if (!((type === 'buy' && showBuy) || (type === 'sell' && showSell))) {
            continue;
        }
        const timestamp = item.date.getTime();
        if (!Number.isFinite(timestamp)) {
            continue;
        }

        if (timestamp < minTime || timestamp > maxTime) {
            continue;
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
    }

    if (markerGroups.size > 0) {
        // Bolt: Use explicit loop over Map entries
        for (const [timestamp, group] of markerGroups.entries()) {
            const x = xScale(timestamp);

            const sortedBuys = [...group.buys].sort((a, b) => b.radius - a.radius);
            let buyOffset = 8;
            for (let j = 0; j < sortedBuys.length; j += 1) {
                const marker = sortedBuys[j];
                const y = yScale(marker.amount) - buyOffset - marker.radius;
                drawMarker(ctx, x, y, marker.radius, true, colors, bounds);
                buyOffset += marker.radius * 2 + 4;
            }

            const sortedSells = [...group.sells].sort((a, b) => b.radius - a.radius);
            let sellOffset = 8;
            for (let j = 0; j < sortedSells.length; j += 1) {
                const marker = sortedSells[j];
                const y = yScale(marker.amount) + sellOffset + marker.radius;
                drawMarker(ctx, x, y, marker.radius, false, colors, bounds);
                sellOffset += marker.radius * 2 + 4;
            }
        }
    }
}

// Tooltip getter over a per-day volume map. Returns 0 when the day
// has no entry so the crosshair persists the row, preventing visual disruption.
export function createVolumeGetter(volumeMap) {
    return (time) => {
        const day = new Date(time);
        day.setHours(0, 0, 0, 0);
        const value = volumeMap.get(day.getTime());
        return Number.isFinite(value) ? value : 0;
    };
}

export function drawVolumeChart(ctx, rawContributionData, options = {}) {
    const {
        showBuy,
        showSell,
        minTime,
        maxTime,
        volumeHeight,
        volumeTop,
        padding,
        plotWidth,
        xScale,
        formatCurrencyCompact,
        selectedCurrency,
        colors = {},
    } = options;

    const buyBarFill = colors.buyBarFill || 'rgba(48, 209, 88, 0.75)';
    const sellBarFill = colors.sellBarFill || 'rgba(255, 69, 58, 0.75)';

    const buyVolumeMap = new Map();
    const sellVolumeMap = new Map();
    const volumeEntries = [];
    let inflowMax = 0;
    let outflowMax = 0;
    const volumeGroups = new Map();

    // Bolt: Use explicit loops instead of .forEach to eliminate closure allocations
    for (let i = 0; i < rawContributionData.length; i += 1) {
        const item = rawContributionData[i];
        if (typeof item.orderType !== 'string') {
            continue;
        }
        const type = item.orderType.toLowerCase();

        // If we have explicit volume data, we can process even if type is 'mixed'
        const hasExplicitVolume =
            Number(item.buyVolume) > 0 ||
            Number(item.sellVolume) > 0 ||
            Number(item.dividendVolume) > 0;

        if (!hasExplicitVolume && !((type === 'buy' && showBuy) || (type === 'sell' && showSell))) {
            continue;
        }
        const normalizedDate = new Date(item.date.getTime());
        normalizedDate.setHours(0, 0, 0, 0);
        const timestamp = normalizedDate.getTime();
        if (!Number.isFinite(timestamp)) {
            continue;
        }
        // Ensure volume bars are strictly within the visible chart range
        if (timestamp < minTime || timestamp > maxTime) {
            continue;
        }
        const netAmount = Math.abs(Number(item.netAmount) || 0);
        if (!hasExplicitVolume && netAmount <= 0) {
            continue;
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
    }

    for (const [timestamp, totals] of volumeGroups.entries()) {
        const { totalBuy, totalSell } = totals;
        const totalBuyVolume = totalBuy;
        const totalSellVolume = totalSell;
        if (totalBuyVolume === 0 && totalSellVolume === 0) {
            continue;
        }

        inflowMax = Math.max(inflowMax, totalBuyVolume);
        outflowMax = Math.max(outflowMax, totalSellVolume);
        volumeEntries.push({
            timestamp,
            totalBuyVolume,
            totalSellVolume,
        });
    }

    for (let i = 0; i < volumeEntries.length; i += 1) {
        const { timestamp, totalBuyVolume, totalSellVolume } = volumeEntries[i];
        if (totalBuyVolume > 0) {
            buyVolumeMap.set(timestamp, totalBuyVolume);
        }
        if (totalSellVolume > 0) {
            sellVolumeMap.set(timestamp, totalSellVolume);
        }
    }

    const volumePadding = {
        top: volumeTop,
        right: padding.right,
        bottom: padding.bottom,
        left: padding.left,
    };

    const hasAnyVolume = inflowMax > 0 || outflowMax > 0;

    let volumeYScale = null;
    if (volumeHeight > 0) {
        // Diverging domain: inflows (buys) above zero, outflows (sells)
        // below. 10% headroom on each populated side. Pixel positions use a
        // square-root transform so heavy-tailed volumes stay readable
        // (median day ≈ $1k vs max ≈ $165k on real data).
        const volumeYMax = inflowMax > 0 ? inflowMax * 1.1 : hasAnyVolume ? 0 : 1;
        const volumeYMin = outflowMax > 0 ? -outflowMax * 1.1 : 0;
        const sqrtTransform = (value) => Math.sign(value) * Math.sqrt(Math.abs(value));
        const sqrtTop = sqrtTransform(volumeYMax);
        const sqrtRange = sqrtTop - sqrtTransform(volumeYMin) || 1;
        volumeYScale = (value) =>
            volumePadding.top + ((sqrtTop - sqrtTransform(value)) / sqrtRange) * volumeHeight;

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
            (value) => formatCurrencyCompact(Math.abs(value)),
            false,
            {
                drawYAxis: hasAnyVolume,
                maxTicks: CONTRIBUTION_CHART_SETTINGS.volumePane?.axisMaxTicks ?? 14,
            },
            selectedCurrency || 'USD'
        );
    }

    if (volumeHeight > 0 && volumeEntries.length > 0 && typeof volumeYScale === 'function') {
        volumeEntries.sort((a, b) => a.timestamp - b.timestamp);
        const {
            minBarHeight = 1.5,
            barWidthFraction = 0.6,
            minBarWidth = 1,
            maxBarWidth = 12,
        } = CONTRIBUTION_CHART_SETTINGS.volumePane || {};
        // Width follows visible date density: a fraction of one day-slot,
        // clamped so bars stay visible zoomed out and restrained zoomed in
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const daySpan = Math.max(1, (maxTime - minTime) / MS_PER_DAY);
        const barWidth = Math.min(
            maxBarWidth,
            Math.max(minBarWidth, Math.round((plotWidth / daySpan) * barWidthFraction))
        );
        const baselineY = volumeYScale(0);

        const originalFill = ctx.fillStyle;

        for (let i = 0; i < volumeEntries.length; i += 1) {
            const entry = volumeEntries[i];
            const { timestamp, totalBuyVolume, totalSellVolume } = entry;
            const x = xScale(timestamp);
            const barX = Math.round(x - barWidth / 2);

            if (totalBuyVolume > 0) {
                const height = Math.max(baselineY - volumeYScale(totalBuyVolume), minBarHeight);
                ctx.fillStyle = buyBarFill;
                ctx.fillRect(barX, baselineY - height, barWidth, height);
            }
            if (totalSellVolume > 0) {
                const height = Math.max(volumeYScale(-totalSellVolume) - baselineY, minBarHeight);
                ctx.fillStyle = sellBarFill;
                ctx.fillRect(barX, baselineY, barWidth, height);
            }
        }

        ctx.fillStyle = originalFill;
    }

    return { buyVolumeMap, sellVolumeMap, volumeYScale };
}
