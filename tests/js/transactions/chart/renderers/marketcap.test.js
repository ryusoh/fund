import {
    drawMarketcapChart,
    drawMarketcapAbsoluteChart,
} from '@js/transactions/chart/renderers/marketcap.js';

jest.mock('@js/transactions/state.js', () => ({
    transactionState: {},
}));
jest.mock('@js/transactions/chart/state.js', () => ({
    chartLayouts: {},
}));
jest.mock('@js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    updateLegend: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
}));
jest.mock('@js/transactions/chart/animation.js', () => ({
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
}));
jest.mock('@js/transactions/dataLoader.js', () => ({
    loadMarketcapSnapshotData: jest.fn().mockResolvedValue(null),
}));
jest.mock('@js/utils/logger.js', () => ({
    logger: { warn: jest.fn() },
}));

describe('Marketcap Chart Renderer', () => {
    it('handles empty initialization safely', () => {
        document.body.innerHTML = '<div id="runningAmountEmpty"></div>';
        const ctx = {};
        const chartManager = {};

        drawMarketcapChart(ctx, chartManager);
        drawMarketcapAbsoluteChart(ctx, chartManager);

        return new Promise(process.nextTick).then(() => {
            expect(document.getElementById('runningAmountEmpty').style.display).toBe('block');
        });
    });
});
