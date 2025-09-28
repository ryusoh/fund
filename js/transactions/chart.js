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
        const portfolioSeriesRaw = transactionState.portfolioSeries || [];
        const visibility = transactionState.chartVisibility || {};
        const showContribution = visibility.contribution !== false;
        const showBalance = visibility.balance !== false;
        const showBuy = visibility.buy !== false;
        const showSell = visibility.sell !== false;

        if (
            (!series || series.length === 0 || (!showContribution && !showBuy && !showSell)) &&
            (!showBalance || portfolioSeriesRaw.length === 0)
        ) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = canvas.offsetWidth * dpr;
                canvas.height = canvas.offsetHeight * dpr;
                ctx.scale(dpr, dpr);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            emptyState.style.display = 'none';
            return;
        }
        emptyState.style.display = 'none';

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Use smaller padding on mobile for larger chart area
        const isMobile = window.innerWidth <= 768;
        const padding = isMobile
            ? { top: 15, right: 20, bottom: 35, left: 50 }
            : { top: 20, right: 30, bottom: 48, left: 70 };
        const plotWidth = canvas.offsetWidth - padding.left - padding.right;
        const plotHeight = canvas.offsetHeight - padding.top - padding.bottom;

        const parsedSeries = (series || [])
            .map((item) => ({ ...item, date: new Date(item.tradeDate) }))
            .filter((item) => !Number.isNaN(item.date.getTime()));

        const portfolioSeries = (showBalance ? portfolioSeriesRaw : [])
            .map((item) => ({ ...item, date: new Date(item.date), value: item.value }))
            .filter((item) => !Number.isNaN(item.date.getTime()) && Number.isFinite(item.value))
            .sort((a, b) => a.date - b.date);

        if (
            (parsedSeries.length === 0 || (!showContribution && !showBuy && !showSell)) &&
            portfolioSeries.length === 0
        ) {
            return;
        }

        const includeContributionRange =
            parsedSeries.length > 0 && (showContribution || showBuy || showSell);
        const contributionMax = includeContributionRange
            ? Math.max(...parsedSeries.map((item) => item.amount))
            : 0;
        const portfolioMax = portfolioSeries.length
            ? Math.max(...portfolioSeries.map((item) => item.value))
            : 0;
        const maxAmount = Math.max(contributionMax, portfolioMax, 0);
        const yMax = maxAmount <= 0 ? 1 : maxAmount * 1.15;

        const contributionTimes = includeContributionRange
            ? parsedSeries.map((item) => item.date.getTime())
            : [];
        const portfolioTimes = portfolioSeries.map((item) => item.date.getTime());
        const allTimes = [...contributionTimes, ...portfolioTimes];
        if (allTimes.length === 0) {
            return;
        }
        const minTime = Math.min(...allTimes);
        const maxTime = Math.max(new Date().setHours(0, 0, 0, 0), ...allTimes);

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
            ctx.font = isMobile ? '10px var(--font-family-mono)' : '12px var(--font-family-mono)';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(formatCurrencyCompact(value), padding.left - (isMobile ? 8 : 10), y);
        }

        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + plotHeight);
        ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const tickCount = Math.min(6, Math.floor(plotWidth / (isMobile ? 100 : 120)));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = isMobile ? '10px var(--font-family-mono)' : '12px var(--font-family-mono)';
        for (let i = 0; i <= tickCount; i += 1) {
            const time = minTime + (i / tickCount) * (maxTime - minTime);
            const x = xScale(time);
            ctx.beginPath();
            ctx.moveTo(x, padding.top + plotHeight);
            ctx.lineTo(x, padding.top + plotHeight + (isMobile ? 4 : 6));
            ctx.stroke();
            const labelDate = new Date(time);
            ctx.fillText(
                labelDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                x,
                padding.top + plotHeight + (isMobile ? 8 : 10)
            );
        }

        const rootStyles =
            typeof window !== 'undefined' && window.getComputedStyle
                ? window.getComputedStyle(document.documentElement)
                : null;

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

        const pointSeries = parsedSeries.filter((item) => {
            const type = item.orderType.toLowerCase();
            if (type === 'buy') {
                return showBuy;
            }
            if (type === 'sell') {
                return showSell;
            }
            return false;
        });
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

        if (showBalance && portfolioSeries.length > 0) {
            ctx.beginPath();
            portfolioSeries.forEach((item, index) => {
                const x = xScale(item.date.getTime());
                const y = yScale(item.value);
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            const portfolioColor = rootStyles
                ? rootStyles.getPropertyValue('--portfolio-line').trim()
                : '#666666';
            ctx.strokeStyle = portfolioColor || '#666666';
            ctx.lineWidth = 2.5;
            ctx.stroke();
        }

        if (showContribution && parsedSeries.length > 0) {
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
            const contributionColor = rootStyles
                ? rootStyles.getPropertyValue('--contribution-line').trim()
                : '#b3b3b3';
            ctx.strokeStyle = contributionColor || '#b3b3b3';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function redraw() {
        const plotSection = document.getElementById('runningAmountSection');
        if (plotSection && !plotSection.classList.contains('is-hidden')) {
            requestAnimationFrame(() => {
                requestAnimationFrame(draw);
            });
        }
    }

    return { update, redraw };
}
