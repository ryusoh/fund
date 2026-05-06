import { drawRollingChart } from '@js/transactions/chart/renderers/rolling.js';
import { transactionState } from '@js/transactions/state.js';
import { chartLayouts } from '@js/transactions/chart/state.js';

jest.mock('@js/transactions/state.js', () => ({
    transactionState: {
        performanceSeries: {},
        selectedCurrency: 'USD',
        chartVisibility: {},
    },
    getShowChartLabels: jest.fn(),
}));
jest.mock('@js/transactions/chart/state.js', () => ({
    chartLayouts: {},
}));
jest.mock('@js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
}));
jest.mock('@js/transactions/chart/animation.js', () => ({
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
}));
jest.mock('@js/utils/smoothing.js', () => ({
    smoothFinancialData: jest.fn(),
}));

describe('Rolling Chart Renderer', () => {
    it('handles empty performanceSeries', async () => {
        const ctx = {};
        const chartManager = {};
        transactionState.performanceSeries = {};
        await drawRollingChart(ctx, chartManager, 0);
        expect(chartLayouts.rolling).toBeNull();
    });
});
