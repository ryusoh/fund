import { drawAxes, drawMarker } from '../core.js';

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

        if (timestamp < minTime || timestamp > maxTime) {
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

    if (markerGroups.size > 0) {
        markerGroups.forEach((group, timestamp) => {
            const x = xScale(timestamp);

            const sortedBuys = [...group.buys].sort((a, b) => b.radius - a.radius);
            let buyOffset = 8;
            sortedBuys.forEach((marker) => {
                const y = yScale(marker.amount) - buyOffset - marker.radius;
                drawMarker(ctx, x, y, marker.radius, true, colors, bounds);
                buyOffset += marker.radius * 2 + 4;
            });

            const sortedSells = [...group.sells].sort((a, b) => b.radius - a.radius);
            let sellOffset = 8;
            sortedSells.forEach((marker) => {
                const y = yScale(marker.amount) + sellOffset + marker.radius;
                drawMarker(ctx, x, y, marker.radius, false, colors, bounds);
                sellOffset += marker.radius * 2 + 4;
            });
        });
    }
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
    } = options;

    const buyVolumeMap = new Map();
    const sellVolumeMap = new Map();
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

    let volumeYScale = null;
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
            selectedCurrency || 'USD'
        );
    }

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

            const dayMaxVolume = Math.max(totalBuyVolume, totalSellVolume);

            bars.forEach((bar) => {
                const topY = volumeYScale(bar.volume);
                const height = baselineY - topY;

                let actualWidth = barWidth;
                if (bar.volume < dayMaxVolume) {
                    actualWidth = barWidth * 0.5;
                } else if (
                    bars.length === 2 &&
                    totalBuyVolume === totalSellVolume &&
                    bar.type === 'sell'
                ) {
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
                        order: actualWidth < barWidth ? 1 : 0,
                    });
                }
            });
        });

        const originalFill = ctx.fillStyle;
        const originalStroke = ctx.strokeStyle;
        const originalLineWidth = ctx.lineWidth;

        allVolumeRects
            .sort((a, b) => {
                if (a.height !== b.height) {
                    return b.height - a.height;
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

        ctx.fillStyle = originalFill;
        ctx.strokeStyle = originalStroke;
        ctx.lineWidth = originalLineWidth;
    }

    return { buyVolumeMap, sellVolumeMap, volumeYScale };
}
