import { transactionState } from './state.js';

import {
    stopPerformanceAnimation,
    stopContributionAnimation,
    stopFxAnimation,
} from './chart/animation.js';

import { drawContributionChart } from './chart/renderers/contribution.js';
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
import { drawPerformanceChart } from './chart/renderers/performance.js';
import { drawFxChart, buildFxChartSeries } from './chart/renderers/fx.js';
import { drawDrawdownChart, buildDrawdownSeries } from './chart/renderers/drawdown.js';
import {
    drawCompositionChart,
    drawCompositionAbsoluteChart,
    aggregateCompositionSeries,
    buildCompositionDisplayOrder,
} from './chart/renderers/composition.js';
import { drawConcentrationChart } from './chart/renderers/concentration.js';
import { drawPEChart } from './chart/renderers/pe.js';
import { drawRollingChart } from './chart/renderers/rolling.js';
import { drawVolatilityChart } from './chart/renderers/volatility.js';
import { drawSectorsChart, drawSectorsAbsoluteChart } from './chart/renderers/sectors.js';
import { drawBetaChart } from './chart/renderers/beta.js';
import { drawYieldChart } from './chart/renderers/yield.js';

export { buildFxChartSeries };
export { buildDrawdownSeries };

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
        } else if (transactionState.activeChart === 'concentration') {
            drawConcentrationChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'pe') {
            drawPEChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'sectors') {
            drawSectorsChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'sectorsAbs') {
            drawSectorsAbsoluteChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'rolling') {
            await drawRollingChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'volatility') {
            await drawVolatilityChart(ctx, chartManager, timestamp);
        } else if (transactionState.activeChart === 'beta') {
            await drawBetaChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'yield') {
            await drawYieldChart(ctx, chartManager);
        } else if (transactionState.activeChart === 'fx') {
            drawFxChart(ctx, chartManager, timestamp);
        } else {
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
    buildCompositionDisplayOrder,
    aggregateCompositionSeries,
    generateConcreteTicks,
    computePercentTickInfo,
    buildFilteredBalanceSeries,
    buildDrawdownSeries,
    generateYearBasedTicks,
};
