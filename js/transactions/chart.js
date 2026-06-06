import { transactionState } from './state.js';

import {
    stopPerformanceAnimation,
    stopContributionAnimation,
    stopFxAnimation,
} from './chart/animation.js';

import {
    getContributionSeriesForTransactions,
    buildContributionSeriesFromTransactions,
    buildFilteredBalanceSeries,
} from './chart/data/contribution.js';

export {
    getContributionSeriesForTransactions,
    buildContributionSeriesFromTransactions,
    buildFilteredBalanceSeries,
};

export { hasActiveTransactionFilters } from './state.js';

import {
    generateConcreteTicks,
    generateYearBasedTicks,
    computePercentTickInfo,
} from './chart/core.js';
import {
    updateCrosshairUI,
    legendState,
    setCrosshairExternalUpdate,
    attachCrosshairEvents,
} from './chart/interaction.js';

// ---------------------------------------------------------------------------
// Lazy renderer loader — each renderer is only fetched on first use
// ---------------------------------------------------------------------------

const rendererCache = {};

async function loadRenderer(name) {
    if (rendererCache[name]) {
        return rendererCache[name];
    }
    const mod = await import(`./chart/renderers/${name}.js`);
    rendererCache[name] = mod;
    return mod;
}

// --- Main Chart Manager ---

export function createChartManager(options = {}) {
    const crosshairCallbacks = options.crosshairCallbacks || {};
    setCrosshairExternalUpdate(crosshairCallbacks.onUpdate || null);
    updateCrosshairUI(null, null);

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
            const { drawPerformanceChart } = await loadRenderer('performance');
            await drawPerformanceChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'drawdown') {
            const { drawDrawdownChart } = await loadRenderer('drawdown');
            await drawDrawdownChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'drawdownAbs') {
            const { drawContributionChart } = await loadRenderer('contribution');
            await drawContributionChart(ctx, chartManager, timestamp, { drawdownMode: true });
        } else if (transactionState.activeChart === 'composition') {
            const { drawCompositionChart } = await loadRenderer('composition');
            drawCompositionChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'compositionAbs') {
            const { drawCompositionAbsoluteChart } = await loadRenderer('composition');
            drawCompositionAbsoluteChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'concentration') {
            const { drawConcentrationChart } = await loadRenderer('concentration');
            drawConcentrationChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'pe') {
            const { drawPEChart } = await loadRenderer('pe');
            drawPEChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'sectors') {
            const { drawSectorsChart } = await loadRenderer('sectors');
            drawSectorsChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'sectorsAbs') {
            const { drawSectorsAbsoluteChart } = await loadRenderer('sectors');
            drawSectorsAbsoluteChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'geography') {
            const { drawGeographyChart } = await loadRenderer('geography');
            drawGeographyChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'geographyAbs') {
            const { drawGeographyAbsoluteChart } = await loadRenderer('geography');
            drawGeographyAbsoluteChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'marketcap') {
            const { drawMarketcapChart } = await loadRenderer('marketcap');
            drawMarketcapChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'marketcapAbs') {
            const { drawMarketcapAbsoluteChart } = await loadRenderer('marketcap');
            drawMarketcapAbsoluteChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'rolling') {
            const { drawRollingChart } = await loadRenderer('rolling');
            await drawRollingChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'volatility') {
            const { drawVolatilityChart } = await loadRenderer('volatility');
            await drawVolatilityChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'beta') {
            const { drawBetaChart } = await loadRenderer('beta');
            await drawBetaChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'yield') {
            const { drawYieldChart } = await loadRenderer('yield');
            await drawYieldChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'fx') {
            const { drawFxChart } = await loadRenderer('fx');
            drawFxChart(ctx, chartManager, timestamp);
        } else {
            const { drawContributionChart } = await loadRenderer('contribution');
            await drawContributionChart(ctx, chartManager, timestamp);
        }
    };

    const chartManager = {
        update() {
            legendState.performanceDirty = true;
            legendState.contributionDirty = true;
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
    generateConcreteTicks,
    computePercentTickInfo,
    buildFilteredBalanceSeries,
    generateYearBasedTicks,
};
