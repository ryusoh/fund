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
} from './chart/renderers/contribution.js';

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

export { buildFxChartSeries };
export { buildDrawdownSeries };

import {
    generateConcreteTicks,
    generateYearBasedTicks,
    computePercentTickInfo,
} from './chart/core.js';
import {
    crosshairState,
    updateCrosshairUI,
    legendState,
    setCrosshairExternalUpdate,
} from './chart/interaction.js';
import { chartLayouts } from './chart/state.js';

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

// --- Helper Functions ---

// --- Drawdown Calculation Helper ---

// Helper function to get smoothing configuration
// --- Chart Drawing Functions ---

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
