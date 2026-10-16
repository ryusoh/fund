import {
    drawSectorsChart,
    drawSectorsAbsoluteChart,
} from '../../../../../js/transactions/chart/renderers/sectors.js';
import { transactionState } from '../../../../../js/transactions/state.js';
import { chartLayouts } from '../../../../../js/transactions/chart/state.js';
import { loadSectorsSnapshotData } from '../../../../../js/transactions/dataLoader.js';
import { drawAxes } from '../../../../../js/transactions/chart/core.js';

jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: {
        performanceSeries: {},
        selectedCurrency: 'USD',
        chartVisibility: {},
        chartDateRange: { from: null, to: null },
    },
    getShowChartLabels: jest.fn(() => true),
}));
jest.mock('../../../../../js/transactions/chart/state.js', () => ({
    chartLayouts: {},
}));

const testData = {
    dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
    sectors: ['Technology', 'Healthcare'],
    series: {
        Technology: [100, 110, 120],
        Healthcare: [50, 55, 60],
    },
};

jest.mock('../../../../../js/transactions/dataLoader.js', () => ({
    loadSectorsSnapshotData: jest.fn(() => Promise.resolve(testData)),
}));
jest.mock('../../../../../js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
    updateLegend: jest.fn(),
}));
jest.mock('../../../../../js/transactions/chart/animation.js', () => ({
    stopSectorsAnimation: jest.fn(),
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
}));
jest.mock('../../../../../js/utils/smoothing.js', () => ({
    smoothFinancialData: jest.fn((data) => data),
}));
jest.mock('../../../../../js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
}));
jest.mock('../../../../../js/transactions/utils.js', () => ({
    formatCurrencyInlineValue: jest.fn((val) => `$${val}`),
    formatCurrencyCompact: jest.fn((val) => `$${val}`),
    convertValueToCurrency: jest.fn((val) => val),
}));
jest.mock('../../../../../js/transactions/chart/helpers.js', () => {
    const actual = jest.requireActual('../../../../../js/transactions/chart/helpers.js');
    return {
        ...actual,
        createTimeInterpolator: jest.fn(() => jest.fn(() => 1)),
        clampTime: jest.fn((t) => t),
        formatPercentInline: jest.fn((v) => `${v}%`),
        parseLocalDate: jest.fn((str) => new Date(str)),
    };
});

describe('Sectors Chart Renderer', () => {
    let mockCtx;
    let mockCanvas;
    let mockChartManager;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCanvas = {
            offsetWidth: 800,
            offsetHeight: 600,
            style: { display: 'block' },
        };

        mockCtx = {
            canvas: mockCanvas,
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            setLineDash: jest.fn(),
            fill: jest.fn(),
            closePath: jest.fn(),
            globalAlpha: 1,
            fillStyle: '',
        };

        mockChartManager = {
            updateCrosshairTarget: jest.fn(),
            filterFrom: null,
            getFilterState: jest.fn(() => ({ from: null, to: null })),
        };

        document.body.innerHTML = '<div id="runningAmountEmpty"></div>';
        chartLayouts.sectors = null;
        chartLayouts.sectorsAbs = null;
        transactionState.chartVisibility = {};
        transactionState.chartDateRange = { from: null, to: null };
        loadSectorsSnapshotData.mockClear();
    });

    it('handles empty data gracefully by showing empty state', async () => {
        loadSectorsSnapshotData.mockResolvedValueOnce(null);
        await drawSectorsChart(mockCtx, mockChartManager);

        expect(loadSectorsSnapshotData).toHaveBeenCalled();
        expect(chartLayouts.sectors).toBeNull();
    });

    it('draws sectors chart with valid data in percent mode', async () => {
        loadSectorsSnapshotData.mockResolvedValueOnce(testData);
        await drawSectorsChart(mockCtx, mockChartManager);

        expect(chartLayouts.sectors).not.toBeNull();
        expect(drawAxes).toHaveBeenCalled();

        const inverted = chartLayouts.sectors.invertX(400);
        expect(inverted).toBeDefined();
    });

    it('draws sectors chart with valid data in absolute mode', async () => {
        // Because of the cache `let sectorsDataCache = null;`, it uses the data from the previous test if run in sequence.
        await drawSectorsAbsoluteChart(mockCtx, mockChartManager);

        expect(chartLayouts.sectorsAbs).not.toBeNull();
        expect(drawAxes).toHaveBeenCalled();
    });
});
