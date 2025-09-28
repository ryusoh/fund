import { transactionState, setRunningAmountSeries } from './state.js';
import { formatCurrencyCompact } from './utils.js';

export function createChartManager({ buildRunningAmountSeries }) {
    function update(transactions, splitHistory) {
        const series = buildRunningAmountSeries(transactions, splitHistory);
        setRunningAmountSeries(series);

        const plotSection = document.getElementById('runningAmountSection');
        if (plotSection && !plotSection.classList.contains('is-hidden')) {
            requestAnimationFrame(() => {
                requestAnimationFrame(draw);
            });
        }
    }

    function draw() {
        const canvas = document.getElementById('runningAmountCanvas');
        const emptyState = document.getElementById('runningAmountEmpty');
        if (!canvas || !emptyState) {
            return;
        }

        const series = transactionState.runningAmountSeries;
        if (!series || series.length === 0) {
            emptyState.style.display = 'flex';
            return;
        }
        emptyState.style.display = 'none';

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const padding = { top: 20, right: 30, bottom: 48, left: 70 };
        const plotWidth = canvas.offsetWidth - padding.left - padding.right;
        const plotHeight = canvas.offsetHeight - padding.top - padding.bottom;

        const parsedSeries = series
            .map((item) => ({ ...item, date: new Date(item.tradeDate) }))
            .filter((item) => !Number.isNaN(item.date.getTime()));
        if (parsedSeries.length === 0) {
            return;
        }

        const maxAmount = Math.max(...parsedSeries.map((item) => item.amount), 0);
        const yMax = maxAmount <= 0 ? 1 : maxAmount * 1.15;

        const times = parsedSeries.map((item) => item.date.getTime());
        const minTime = Math.min(...times);
        const maxTime = Math.max(new Date().setHours(0, 0, 0, 0), ...times);

        const xScale = (t) => {
            if (maxTime === minTime) {
                return padding.left + plotWidth / 2;
            }
            return padding.left + ((t - minTime) / (maxTime - minTime)) * plotWidth;
        };

        const yScale = (v) => padding.top + plotHeight - (v / yMax) * plotHeight;

        for (let i = 0; i <= 4; i += 1) {
            const value = (yMax / 4) * i;
            const y = yScale(value);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + plotWidth, y);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#8b949e';
            ctx.font = '12px var(--font-family-mono)';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(formatCurrencyCompact(value), padding.left - 10, y);
        }

        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + plotHeight);
        ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const tickCount = Math.min(6, Math.floor(plotWidth / 120));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i <= tickCount; i += 1) {
            const time = minTime + (i / tickCount) * (maxTime - minTime);
            const x = xScale(time);
            ctx.beginPath();
            ctx.moveTo(x, padding.top + plotHeight);
            ctx.lineTo(x, padding.top + plotHeight + 6);
            ctx.stroke();
            const labelDate = new Date(time);
            ctx.fillText(
                labelDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                x,
                padding.top + plotHeight + 10
            );
        }

        ctx.beginPath();
        parsedSeries.forEach((item, index) => {
            const x = xScale(item.date.getTime());
            const y = yScale(item.amount);
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        const rootStyles =
            typeof window !== 'undefined' && window.getComputedStyle
                ? window.getComputedStyle(document.documentElement)
                : null;
        const mutedStroke = rootStyles ? rootStyles.getPropertyValue('--muted-text').trim() : '';
        ctx.strokeStyle = mutedStroke || '#8b949e';
        ctx.lineWidth = 2;
        ctx.stroke();

        const drawMarker = (context, x, y, radius, isBuy) => {
            const clampedY = Math.max(
                padding.top + radius,
                Math.min(y, padding.top + plotHeight - radius)
            );
            context.beginPath();
            context.arc(x, clampedY, radius, 0, Math.PI * 2);
            context.fillStyle = isBuy ? 'rgba(48, 209, 88, 0.45)' : 'rgba(255, 69, 58, 0.45)';
            context.strokeStyle = isBuy ? 'rgba(48, 209, 88, 0.8)' : 'rgba(255, 69, 58, 0.8)';
            context.lineWidth = 1;
            context.fill();
            context.stroke();
        };

        const pointSeries = parsedSeries.filter(
            (item) =>
                item.orderType.toLowerCase() === 'buy' || item.orderType.toLowerCase() === 'sell'
        );
        const grouped = new Map();
        if (pointSeries.length > 0) {
            pointSeries.forEach((item) => {
                const timestamp = item.date.getTime();
                if (!grouped.has(timestamp)) {
                    grouped.set(timestamp, { buys: [], sells: [] });
                }
                const group = grouped.get(timestamp);
                const radius = Math.min(8, Math.max(2, Math.abs(item.netAmount) / 500));
                if (item.orderType.toLowerCase() === 'buy') {
                    group.buys.push({ radius });
                } else {
                    group.sells.push({ radius });
                }
            });
        }

        parsedSeries.forEach((item) => {
            const group = grouped.get(item.date.getTime());
            if (group && !group.drawn) {
                const x = xScale(item.date.getTime());
                const baseY = yScale(item.amount);
                let buyOffset = 8;
                group.buys.forEach((marker) => {
                    const y = baseY - buyOffset - marker.radius;
                    drawMarker(ctx, x, y, marker.radius, true);
                    buyOffset += marker.radius * 2 + 8;
                });
                let sellOffset = 8;
                group.sells.forEach((marker) => {
                    const y = baseY + sellOffset + marker.radius;
                    drawMarker(ctx, x, y, marker.radius, false);
                    sellOffset += marker.radius * 2 + 8;
                });
                group.drawn = true;
            }
        });
    }

    return { update, draw };
}
