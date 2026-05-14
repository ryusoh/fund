import { drawSectorsChart } from '@js/transactions/chart/renderers/sectors.js';
import { transactionState } from '@js/transactions/state.js';
import { chartLayouts } from '@js/transactions/chart/state.js';
import { loadSectorsSnapshotData } from '@js/transactions/dataLoader.js';

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
jest.mock('@js/transactions/dataLoader.js', () => ({
    loadSectorsSnapshotData: jest.fn(() => Promise.resolve({})),
}));
jest.mock('@js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
}));
jest.mock('@js/transactions/chart/animation.js', () => ({
    stopSectorsAnimation: jest.fn(),
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
}));
jest.mock('@js/utils/smoothing.js', () => ({
    smoothFinancialData: jest.fn(),
}));
jest.mock('@js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
}));

describe('Sectors Chart Renderer', () => {
    it('handles empty data gracefully by showing empty state', async () => {
        document.body.innerHTML = '<div id="runningAmountEmpty"></div>';
        const ctx = {};
        const chartManager = {};

        await drawSectorsChart(ctx, chartManager, 0);

        expect(loadSectorsSnapshotData).toHaveBeenCalled();
        expect(chartLayouts.sectors).toBeNull();
    });
});
