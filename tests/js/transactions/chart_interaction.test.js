import { createChartManager } from '../../../js/transactions/chart.js';
import {
    setCrosshairExternalUpdate,
    updateCrosshairUI,
} from '../../../js/transactions/chart/interaction.js';

// Mock dependencies
jest.mock('../../../js/transactions/chart/interaction.js', () => ({
    ...jest.requireActual('../../../js/transactions/chart/interaction.js'),
    setCrosshairExternalUpdate: jest.fn(),
    updateCrosshairUI: jest.fn(),
    legendState: { performanceDirty: true, contributionDirty: true },
}));

// Mock other dependencies to avoid errors during createChartManager
jest.mock('../../../js/transactions/chart/state.js', () => ({
    chartLayouts: {},
    transactionState: { activeChart: 'performance' },
}));

jest.mock('../../../js/transactions/chart/animation.js', () => ({
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
}));

describe('Chart Interaction Regression Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Setup document body for canvas if needed, though mostly mocking
        document.body.innerHTML = '<canvas id="runningAmountCanvas"></canvas>';
    });

    test('createChartManager should register crosshair callback', () => {
        const mockUpdate = jest.fn();
        const options = {
            crosshairCallbacks: {
                onUpdate: mockUpdate,
            },
        };

        createChartManager(options);

        // Verify setCrosshairExternalUpdate was called with our mock
        expect(setCrosshairExternalUpdate).toHaveBeenCalledWith(mockUpdate);

        // Verify initial UI update is triggered
        expect(updateCrosshairUI).toHaveBeenCalledWith(null, null);
    });

    test('createChartManager should handle missing callbacks gracefully', () => {
        createChartManager({});

        // Verify setCrosshairExternalUpdate was called with null
        expect(setCrosshairExternalUpdate).toHaveBeenCalledWith(null);

        // Verify initial UI update is still triggered
        expect(updateCrosshairUI).toHaveBeenCalledWith(null, null);
    });

    // Note: Actual drawing logic is in interaction.js which is mocked here.
    // To test drawCrosshairOverlay's dot drawing, we would need to unit test interaction.js directly
    // rather than through createChartManager integration.
    // However, we confirmed the code change in interaction.js manually.
});
