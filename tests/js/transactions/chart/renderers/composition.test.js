import {
    aggregateCompositionSeries,
    buildCompositionDisplayOrder,
} from '@js/transactions/chart/renderers/composition.js';

describe('aggregateCompositionSeries', () => {
    it('returns null for invalid inputs', () => {
        expect(aggregateCompositionSeries(null, {}, 5)).toBeNull();
        expect(aggregateCompositionSeries([], {}, 5)).toBeNull();
        expect(aggregateCompositionSeries(['AAPL'], {}, null)).toBeNull();
    });

    it('aggregates series data across tickers', () => {
        const chartData = {
            AAPL: [10, 20, 30],
            MSFT: [5, 10, 15],
        };
        const result = aggregateCompositionSeries(['AAPL', 'MSFT'], chartData, 3);
        expect(result).toEqual([15, 30, 45]);
    });

    it('handles missing tickers in chartData', () => {
        const chartData = {
            AAPL: [10, 20, 30],
        };
        const result = aggregateCompositionSeries(['AAPL', 'MSFT'], chartData, 3);
        expect(result).toEqual([10, 20, 30]);
    });
});

describe('buildCompositionDisplayOrder', () => {
    it('returns empty order for invalid baseOrder', () => {
        expect(buildCompositionDisplayOrder(null, {}, null, 5)).toEqual({
            order: [],
            filteredOthers: null,
        });
        expect(buildCompositionDisplayOrder([], {}, null, 5)).toEqual({
            order: [],
            filteredOthers: null,
        });
    });

    it('returns baseOrder if filterTickers is empty', () => {
        const baseOrder = ['AAPL', 'MSFT'];
        expect(buildCompositionDisplayOrder(baseOrder, {}, null, 5)).toEqual({
            order: ['AAPL', 'MSFT'],
            filteredOthers: null,
        });
    });

    it('filters out tickers and generates Others bucket', () => {
        const baseOrder = ['AAPL', 'MSFT', 'GOOG'];
        const chartData = {
            AAPL: [10],
            MSFT: [5],
            GOOG: [5],
        };
        const result = buildCompositionDisplayOrder(baseOrder, chartData, ['AAPL'], 1);
        expect(result.order).toEqual(['AAPL', 'Others']);
        expect(result.filteredOthers).toEqual([10]); // MSFT(5) + GOOG(5)
    });

    it('handles case where no tickers match filter', () => {
        const baseOrder = ['AAPL', 'MSFT'];
        const chartData = { AAPL: [10], MSFT: [5] };
        const result = buildCompositionDisplayOrder(baseOrder, chartData, ['GOOG'], 1);
        // Fallback to baseOrder
        expect(result.order).toEqual(['AAPL', 'MSFT']);
        expect(result.filteredOthers).toBeNull();
    });

    it('omits filteredOthers if all remainder is empty or OTHERS is in filter', () => {
        const baseOrder = ['AAPL', 'OTHERS'];
        const chartData = { AAPL: [10], OTHERS: [5] };
        const result = buildCompositionDisplayOrder(baseOrder, chartData, ['AAPL', 'OTHERS'], 1);
        expect(result.order).toEqual(['AAPL', 'OTHERS']);
        expect(result.filteredOthers).toBeNull();
    });
});

describe('drawCompositionChart', () => {
    let mockState;
    let mockCtx;
    let mockChartManager;

    beforeEach(() => {
        jest.resetModules();
        mockState = {
            transactionState: { chartDateRange: {} },
            chartLayouts: {},
        };
        jest.mock('@js/transactions/state.js', () => ({
            transactionState: mockState.transactionState,
            getCompositionFilterTickers: jest.fn().mockReturnValue([]),
            getCompositionAssetClassFilter: jest.fn().mockReturnValue(null),
        }));
        jest.mock('@js/transactions/chart/state.js', () => ({
            chartLayouts: mockState.chartLayouts,
        }));

        mockCtx = {
            canvas: { offsetWidth: 800, offsetHeight: 400 },
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            closePath: jest.fn(),
            fill: jest.fn(),
            stroke: jest.fn(),
        };
        mockChartManager = { redraw: jest.fn() };

        jest.mock('@js/transactions/dataLoader.js', () => ({
            loadCompositionSnapshotData: jest.fn().mockResolvedValue({
                dates: ['2023-01-01', '2023-01-02'],
                total_values: [1000, 2000],
                composition: {
                    AAPL: [100, 100],
                },
            }),
        }));

        jest.mock('@js/transactions/chart/core.js', () => ({
            drawAxes: jest.fn(),
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

        document.body.innerHTML = '<div id="runningAmountEmpty"></div>';
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('handles empty data', async () => {
        const { loadCompositionSnapshotData } = await import('@js/transactions/dataLoader.js');
        loadCompositionSnapshotData.mockResolvedValueOnce(null);

        const { drawCompositionChart } =
            await import('@js/transactions/chart/renderers/composition.js');
        drawCompositionChart(mockCtx, mockChartManager);

        // Wait for async
        await new Promise(process.nextTick);

        expect(mockState.chartLayouts.composition).toBeNull();
        const emptyState = document.getElementById('runningAmountEmpty');
        expect(emptyState.style.display).toBe('block');
    });

    it('draws percent chart', async () => {
        const { drawCompositionChart } =
            await import('@js/transactions/chart/renderers/composition.js');
        drawCompositionChart(mockCtx, mockChartManager);

        // Wait for async load
        await new Promise(process.nextTick);

        expect(mockState.chartLayouts.composition).toBeDefined();
        expect(mockState.chartLayouts.composition.valueMode).toBe('percent');
        const emptyState = document.getElementById('runningAmountEmpty');
        expect(emptyState.style.display).toBe('none');
    });

    it('draws absolute chart', async () => {
        const { drawCompositionAbsoluteChart } =
            await import('@js/transactions/chart/renderers/composition.js');
        drawCompositionAbsoluteChart(mockCtx, mockChartManager);

        // Wait for async load
        await new Promise(process.nextTick);

        expect(mockState.chartLayouts.compositionAbs).toBeDefined();
        expect(mockState.chartLayouts.compositionAbs.valueMode).toBe('absolute');
    });

    it('includes both explicit tickers and asset-class-matched tickers with OR logic', async () => {
        const { loadCompositionSnapshotData } = await import('@js/transactions/dataLoader.js');
        loadCompositionSnapshotData.mockResolvedValueOnce({
            dates: ['2023-01-01', '2023-01-02'],
            total_values: [1000, 2000],
            composition: {
                AAPL: [400, 500],
                VT: [300, 400],
                MSFT: [200, 300],
                VOO: [100, 200],
            },
        });

        // AAPL is a stock, VT and VOO are ETFs, MSFT is a stock
        // Filter: etf + MSFT → should show VT, VOO (etf) and MSFT (explicit ticker)
        const stateModule = await import('@js/transactions/state.js');
        stateModule.getCompositionFilterTickers.mockReturnValue(['MSFT']);
        stateModule.getCompositionAssetClassFilter.mockReturnValue('etf');

        jest.mock('@js/config.js', () => ({
            COLOR_PALETTES: { COMPOSITION_CHART_COLORS: ['#1', '#2', '#3', '#4', '#5'] },
            getHoldingAssetClass: jest.fn((ticker) => {
                if (ticker === 'VT' || ticker === 'VOO') {
                    return 'etf';
                }
                return 'stock';
            }),
        }));

        const { drawCompositionChart } =
            await import('@js/transactions/chart/renderers/composition.js');
        drawCompositionChart(mockCtx, mockChartManager);

        await new Promise(process.nextTick);

        expect(mockState.chartLayouts.composition).toBeDefined();
        const seriesKeys = mockState.chartLayouts.composition.series.map((s) => s.key);
        expect(seriesKeys).toContain('MSFT');
        expect(seriesKeys).toContain('VT');
        expect(seriesKeys).toContain('VOO');
        // AAPL should be folded into Others, not shown as its own series
        expect(seriesKeys).not.toContain('AAPL');
        expect(seriesKeys).toContain('Others');
    });

    it('filters data by date range', async () => {
        mockState.transactionState.chartDateRange = { from: '2023-01-02', to: '2023-01-02' };

        const { drawCompositionChart } =
            await import('@js/transactions/chart/renderers/composition.js');
        drawCompositionChart(mockCtx, mockChartManager);

        // Wait for async load
        await new Promise(process.nextTick);

        expect(mockState.chartLayouts.composition).toBeDefined();
        // Since original dates were ['2023-01-01', '2023-01-02'] and we filter for just 01-02
        expect(
            mockState.chartLayouts.composition.series[0].getValueAtTime(
                new Date('2023-01-02').getTime()
            )
        ).toBe(100);
    });

    it('sets chartLayouts.composition to null on empty snapshot data', async () => {
        const { drawCompositionChart } = await import('@js/transactions/chart/renderers/composition.js');
        const { chartLayouts } = await import('@js/transactions/chart/state.js');
        const { loadCompositionSnapshotData } = await import('@js/transactions/dataLoader.js');

        loadCompositionSnapshotData.mockResolvedValueOnce({ valid: true, data: [] });

        const ctx = { canvas: { offsetWidth: 800, offsetHeight: 600 } };
        const chartManager = {};
        await drawCompositionChart(ctx, chartManager, 0);

        expect(chartLayouts.composition).toBeNull();
    });
});
