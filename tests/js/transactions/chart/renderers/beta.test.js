import { jest } from '@jest/globals';

jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: {
        chartDateRange: { from: null, to: null },
        chartVisibility: {},
    },
}));

jest.mock('../../../../../js/transactions/chart/state.js', () => ({
    chartLayouts: {},
    legendState: { performanceDirty: false },
}));

jest.mock('../../../../../js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
    drawMountainFill: jest.fn(),
    drawEndValue: jest.fn(),
}));

jest.mock('../../../../../js/transactions/chart/animation.js', () => ({
    advancePerformanceAnimation: jest.fn(),
    isAnimationEnabled: jest.fn(() => false),
    stopPerformanceAnimation: jest.fn(),
    schedulePerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
    stopPeAnimation: jest.fn(),
    stopConcentrationAnimation: jest.fn(),
    drawSeriesGlow: jest.fn(),
}));

jest.mock('../../../../../js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    updateLegend: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
}));

jest.mock('../../../../../js/config.js', () => ({
    mountainFill: { enabled: false },
    CHART_LINE_WIDTHS: { performance: 2 },
}));

jest.mock('../../../../../js/transactions/utils.js', () => ({
    getShowChartLabels: jest.fn(() => true),
}));

jest.mock('../../../../../js/transactions/chart/helpers.js', () => ({
    parseLocalDate: jest.fn((d) => new Date(d)),
    clampTime: jest.fn((v, min, max) => Math.max(min, Math.min(max, v))),
    createTimeInterpolator: jest.fn(() => jest.fn()),
}));

describe('drawBetaChart', () => {
    it('gracefully exits when there are no series to draw', async () => {
        const { drawBetaChart } = await import('../../../../../js/transactions/chart/renderers/beta.js');
        const { stopContributionAnimation } = await import('../../../../../js/transactions/chart/animation.js');
        const { chartLayouts } = await import('../../../../../js/transactions/chart/state.js');

        const mockCtx = {
            canvas: { offsetWidth: 800, offsetHeight: 400 },
        };

        drawBetaChart(mockCtx, {}, 0);

        expect(stopContributionAnimation).toHaveBeenCalled();
        expect(chartLayouts.beta).toBeNull();
    });
});
