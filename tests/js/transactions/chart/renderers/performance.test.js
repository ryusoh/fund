import { drawPerformanceChart } from '@js/transactions/chart/renderers/performance.js';
import { transactionState } from '@js/transactions/state.js';
import { chartLayouts } from '@js/transactions/chart/state.js';

jest.mock('@js/transactions/state.js', () => ({
    transactionState: {
        performanceSeries: {},
        selectedCurrency: 'USD',
        chartVisibility: {},
    },
    getShowChartLabels: jest.fn(),
    legendState: { performanceDirty: false },
}));
jest.mock('@js/transactions/chart/state.js', () => ({
    chartLayouts: {},
}));
jest.mock('@js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
    updateLegend: jest.fn(),
}));
jest.mock('@js/transactions/chart/animation.js', () => ({
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
    isAnimationEnabled: jest.fn(() => false),
    advancePerformanceAnimation: jest.fn(() => 1),
    schedulePerformanceAnimation: jest.fn(),
}));
jest.mock('@js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
}));

describe('Performance Chart Renderer', () => {
    it('handles empty performanceSeries gracefully', async () => {
        const ctx = {};
        const chartManager = {};
        transactionState.performanceSeries = {};
        await drawPerformanceChart(ctx, chartManager, 0);
        expect(chartLayouts.performance).toBeNull();
    });
});
