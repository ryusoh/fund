import {
    drawCompositionChart,
    drawCompositionAbsoluteChart,
} from '../../../../../js/transactions/chart/renderers/composition.js';
import { loadCompositionSnapshotData } from '../../../../../js/transactions/dataLoader.js';

jest.mock('../../../../../js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

jest.mock('../../../../../js/transactions/state.js', () => ({
    transactionState: {
        activeChart: 'composition',
    },
    getCompositionFilterTickers: jest.fn().mockReturnValue([]),
    getCompositionAssetClassFilter: jest.fn().mockReturnValue(''),
}));

jest.mock('../../../../../js/transactions/chart/state.js', () => ({
    chartLayouts: {
        composition: null,
        compositionAbs: null,
    },
}));

jest.mock('../../../../../js/transactions/dataLoader.js', () => ({
    loadCompositionSnapshotData: jest.fn(),
}));

jest.mock('../../../../../js/transactions/chart/animation.js', () => ({
    stopPerformanceAnimation: jest.fn(),
    stopContributionAnimation: jest.fn(),
    stopFxAnimation: jest.fn(),
}));

jest.mock('../../../../../js/transactions/chart/interaction.js', () => ({
    updateCrosshairUI: jest.fn(),
    updateLegend: jest.fn(),
    drawCrosshairOverlay: jest.fn(),
}));

jest.mock('../../../../../js/transactions/chart/core.js', () => ({
    drawAxes: jest.fn(),
}));

jest.mock('../../../../../js/transactions/chart/helpers.js', () => ({
    createTimeInterpolator: jest.fn(),
    clampTime: jest.fn(),
    formatPercentInline: jest.fn(),
    parseLocalDate: jest.fn(),
}));

jest.mock('../../../../../js/transactions/utils.js', () => ({
    formatCurrencyInlineValue: jest.fn(),
    formatCurrencyCompact: jest.fn(),
    convertValueToCurrency: jest.fn(),
}));

describe('drawCompositionChart', () => {
    let ctxMock;
    let chartManagerMock;
    let emptyStateMock;

    beforeEach(() => {
        ctxMock = {
            canvas: { width: 800, height: 600, style: {} },
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            fill: jest.fn(),
            stroke: jest.fn(),
            clip: jest.fn(),
            clearRect: jest.fn(),
        };
        chartManagerMock = {
            canvas: { width: 800, height: 600, style: {} },
        };

        emptyStateMock = { style: { display: 'none' } };
        jest.spyOn(document, 'getElementById').mockReturnValue(emptyStateMock);
        loadCompositionSnapshotData.mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should show empty state if composition data fails to load', async () => {
        loadCompositionSnapshotData.mockRejectedValueOnce(new Error('Network error'));

        drawCompositionChart(ctxMock, chartManagerMock);

        // Wait for next tick so promise rejection is handled
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(emptyStateMock.style.display).toBe('block');
    });

    it('should handle falsy data from data loader', async () => {
        loadCompositionSnapshotData.mockResolvedValueOnce(null);

        drawCompositionChart(ctxMock, chartManagerMock);

        // Wait for next tick so promise rejection is handled
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(emptyStateMock.style.display).toBe('block');
    });

    it('should handle invalid data structure', async () => {
        loadCompositionSnapshotData.mockResolvedValueOnce({ invalid: 'data' });

        drawCompositionChart(ctxMock, chartManagerMock);

        // Wait for next tick so promise is handled
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(emptyStateMock.style.display).toBe('block');
    });

    it('should handle absolute mode with falsy data', async () => {
        loadCompositionSnapshotData.mockResolvedValueOnce(null);

        drawCompositionAbsoluteChart(ctxMock, chartManagerMock);

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(emptyStateMock.style.display).toBe('block');
    });
});
