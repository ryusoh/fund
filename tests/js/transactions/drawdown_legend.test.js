import { transactionState } from '../../../js/transactions/state.js';
import { drawDrawdownChart } from '../../../js/transactions/chart/renderers/drawdown.js';
import { updateLegend } from '../../../js/transactions/chart/interaction.js';

// Mock dependencies
jest.mock('../../../js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    updateLegend: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
    chartLayouts: {},
    legendState: {
        performanceDirty: false,
    },
}));

jest.mock('../../../js/transactions/chart/animation.js', () => ({
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
    stopPerformanceAnimation: jest.fn(),
    isAnimationEnabled: jest.fn().mockReturnValue(false),
    advancePerformanceAnimation: jest.fn(),
    drawSeriesGlow: jest.fn(),
    schedulePerformanceAnimation: jest.fn(),
}));

jest.mock('../../../js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
    drawMountainFill: jest.fn(),
    drawEndValue: jest.fn(),
}));

describe('Drawdown Legend Logic', () => {
    let ctx;
    let chartManager;

    beforeEach(() => {
        // Setup mocks
        ctx = {
            canvas: {
                offsetWidth: 800,
                offsetHeight: 400,
            },
            createLinearGradient: jest.fn().mockReturnValue({
                addColorStop: jest.fn(),
            }),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fill: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
        };

        chartManager = {
            requestRender: jest.fn(),
        };

        // Reset state
        transactionState.performanceSeries = {
            '^LZ': [
                { date: '2024-01-01', value: 100 },
                { date: '2024-01-02', value: 105 },
            ],
            '^GSPC': [
                { date: '2024-01-01', value: 100 },
                { date: '2024-01-02', value: 102 },
            ],
            '^IXIC': [
                { date: '2024-01-01', value: 100 },
                { date: '2024-01-02', value: 103 },
            ],
        };
        transactionState.chartVisibility = {
            '^LZ': true,
            '^GSPC': true,
            '^IXIC': false, // Hidden series
        };
        transactionState.chartDateRange = { from: null, to: null };
        transactionState.selectedCurrency = 'USD';

        jest.clearAllMocks();
    });

    test('should include ALL benchmarks in legend entries, even hidden ones', async () => {
        await drawDrawdownChart(ctx, chartManager, 0);

        expect(updateLegend).toHaveBeenCalled();
        const legendCalls = updateLegend.mock.calls;
        const lastCallArgs = legendCalls[legendCalls.length - 1];
        const passedEntries = lastCallArgs[0];

        // Should contain all keys: ^LZ, ^GSPC, and ^IXIC (even though IXIC is hidden)
        const keys = passedEntries.map((e) => e.key);
        expect(keys).toContain('^LZ');
        expect(keys).toContain('^GSPC');
        expect(keys).toContain('^IXIC');
        expect(keys.length).toBe(3);
    });
});
