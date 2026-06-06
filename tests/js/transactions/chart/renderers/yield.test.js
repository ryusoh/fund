import {
    drawYieldChart,
    loadYieldData,
    getCachedYieldData,
} from '../../../../../js/transactions/chart/renderers/yield.js';

jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: {
        performanceSeries: {},
        selectedCurrency: 'USD',
        chartVisibility: {},
    },
    getShowChartLabels: jest.fn(),
    legendState: { yieldDirty: false },
}));
jest.mock('../../../../../js/transactions/chart/state.js', () => ({
    chartLayouts: {},
}));
jest.mock('../../../../../js/transactions/dataLoader.js', () => ({
    loadYieldData: jest.fn(() => Promise.resolve({ series: [], xLabels: [] })),
}));
jest.mock('../../../../../js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
    updateLegend: jest.fn(),
}));
jest.mock('../../../../../js/transactions/chart/animation.js', () => ({
    stopPeAnimation: jest.fn(),
    stopConcentrationAnimation: jest.fn(),
    stopYieldAnimation: jest.fn(),
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
    isAnimationEnabled: jest.fn(() => false),
    advancePerformanceAnimation: jest.fn(() => 1),
    schedulePerformanceAnimation: jest.fn(),
}));
jest.mock('../../../../../js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
}));

describe('Yield Chart Renderer', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('handles empty fetch gracefully by updating chartManager', async () => {
        document.body.innerHTML = '<div id="runningAmountEmpty"></div>';
        const ctx = {
            canvas: { offsetWidth: 800, offsetHeight: 600 },
        };
        const chartManager = { update: jest.fn() };

        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: false,
            })
        );

        await drawYieldChart(ctx, chartManager, 0);
        expect(global.fetch).toHaveBeenCalled();
        await new Promise(process.nextTick);
        expect(chartManager.update).toHaveBeenCalled();
    });

    describe('Yield Data Caching', () => {
        beforeEach(() => {
            // Reset module state by isolating tests if necessary,
            // or we mock fetch to return data.
        });

        it('loadYieldData fetches once and caches the result', async () => {
            const mockData = [{ date: '2020-01-01', daily_dividend: 10 }];
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockData),
                })
            );

            // First call should fetch
            const data1 = await loadYieldData();
            expect(data1).toEqual(mockData);
            expect(global.fetch).toHaveBeenCalledTimes(1);

            // Second call should return cached data without fetching
            const data2 = await loadYieldData();
            expect(data2).toEqual(mockData);
            expect(global.fetch).toHaveBeenCalledTimes(1);

            // getCachedYieldData should return the same object synchronously
            expect(getCachedYieldData()).toBe(data1);
        });
    });
});
