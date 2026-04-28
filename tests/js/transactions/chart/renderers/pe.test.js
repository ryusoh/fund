import { buildPESeries } from '@js/transactions/chart/renderers/pe.js';

describe('buildPESeries', () => {
    it('returns an empty array if dates is empty', () => {
        expect(buildPESeries([], [10], {}, {}, null, null)).toEqual([]);
    });

    it('returns an empty array if portfolioPE is empty', () => {
        expect(buildPESeries(['2023-01-01'], [], {}, {}, null, null)).toEqual([]);
    });

    it('filters data outside the date range', () => {
        const dates = ['2023-01-01', '2023-01-02', '2023-01-03'];
        const pe = [15, 16, 17];
        const filterFrom = new Date('2023-01-02');
        const result = buildPESeries(dates, pe, null, null, filterFrom, null);
        expect(result).toHaveLength(2);
        expect(result[0].pe).toBe(16);
        expect(result[1].pe).toBe(17);
    });

    it('skips invalid PE values', () => {
        const dates = ['2023-01-01', '2023-01-02', '2023-01-03'];
        const pe = [15, NaN, 17];
        const result = buildPESeries(dates, pe, null, null, null, null);
        expect(result).toHaveLength(2);
        expect(result[0].pe).toBe(15);
        expect(result[1].pe).toBe(17);
    });

    it('builds series with ticker PEs and weights', () => {
        const dates = ['2023-01-01'];
        const pe = [15];
        const tickerPE = { AAPL: [20], MSFT: [30] };
        const tickerWeights = { AAPL: [0.6], MSFT: [0.4] };
        const result = buildPESeries(dates, pe, tickerPE, tickerWeights, null, null);
        expect(result).toHaveLength(1);
        expect(result[0].pe).toBe(15);
        expect(result[0].tickerPEs).toEqual({ AAPL: 20, MSFT: 30 });
        expect(result[0].tickerWeights).toEqual({ AAPL: 0.6, MSFT: 0.4 });
    });
});

describe('drawPEChart GSPC benchmark visibility', () => {
    let mockTransactionState;
    let mockChartLayouts;

    function createMockCtx() {
        const noop = jest.fn();
        return {
            canvas: { offsetWidth: 800, offsetHeight: 400 },
            beginPath: noop,
            moveTo: noop,
            lineTo: noop,
            stroke: noop,
            fill: noop,
            closePath: noop,
            save: noop,
            restore: noop,
            setLineDash: noop,
            createLinearGradient: jest.fn(() => ({ addColorStop: noop })),
            strokeStyle: '',
            fillStyle: '',
            lineWidth: 1,
            globalAlpha: 1,
        };
    }

    beforeEach(() => {
        jest.resetModules();

        mockTransactionState = {
            chartDateRange: { from: null, to: null },
            chartVisibility: { '^GSPC': false, '^IXIC': true },
            showChartLabels: false,
        };
        mockChartLayouts = {};

        jest.doMock('@js/transactions/state.js', () => ({
            transactionState: mockTransactionState,
        }));
        jest.doMock('@js/transactions/chart/state.js', () => ({
            chartLayouts: mockChartLayouts,
        }));
        jest.doMock('@js/utils/logger.js', () => ({
            logger: { warn: jest.fn() },
        }));
        jest.doMock('@js/transactions/chart/animation.js', () => ({
            stopPerformanceAnimation: jest.fn(),
            stopContributionAnimation: jest.fn(),
            stopFxAnimation: jest.fn(),
            stopPeAnimation: jest.fn(),
            stopConcentrationAnimation: jest.fn(),
            isAnimationEnabled: jest.fn(() => false),
            advancePeAnimation: jest.fn(() => 0),
            schedulePeAnimation: jest.fn(),
            drawSeriesGlow: jest.fn(),
        }));
        jest.doMock('@js/transactions/chart/interaction.js', () => ({
            updateCrosshairUI: jest.fn(),
            updateLegend: jest.fn(),
            drawCrosshairOverlay: jest.fn(),
        }));
        jest.doMock('@js/transactions/chart/core.js', () => ({
            drawAxes: jest.fn(),
            drawMountainFill: jest.fn(),
            drawEndValue: jest.fn(() => null),
        }));
        jest.doMock('@js/config.js', () => ({
            mountainFill: { enabled: false },
            CHART_LINE_WIDTHS: { contribution: 2 },
        }));

        // Mock document/window for DOM access
        if (typeof document !== 'undefined') {
            jest.spyOn(document, 'getElementById').mockReturnValue(null);
            jest.spyOn(window, 'getComputedStyle').mockReturnValue({
                getPropertyValue: () => '#fff',
            });
        }
    });

    it('shows GSPC benchmark even when chartVisibility has it disabled', async () => {
        // Simulate: user selected ^IXIC in performance chart, so ^GSPC visibility is false
        mockTransactionState.chartVisibility = { '^GSPC': false, '^IXIC': true };

        const peModule = await import('@js/transactions/chart/renderers/pe.js');

        // Inject cached PE data with benchmark
        const peData = {
            dates: ['2023-01-01', '2023-01-02', '2023-01-03'],
            portfolio_pe: [15, 16, 17],
            ticker_pe: {},
            ticker_weights: {},
            benchmark_pe: {
                '^GSPC': [20, 21, 22],
            },
        };

        // We need to set peDataCache. Since it's a module-level variable,
        // we trigger it via loadPEData mock. Instead, call drawPEChart after
        // priming the cache by calling loadPEData first.
        // Actually, let's mock fetch to return our data and call drawPEChart twice.
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve(peData),
            })
        );

        const ctx = createMockCtx();
        const chartManager = { redraw: jest.fn() };

        // First call triggers the fetch
        peModule.drawPEChart(ctx, chartManager, 0);
        // Wait for the fetch to resolve
        await new Promise((r) => setTimeout(r, 0));

        // redraw was called after fetch resolved, now call drawPEChart again with cached data
        peModule.drawPEChart(ctx, chartManager, 0);

        // chartLayouts.pe should have been set with the benchmark series
        expect(mockChartLayouts.pe).not.toBeNull();
        expect(mockChartLayouts.pe.series.length).toBe(2); // portfolio + ^GSPC
        const gspcSeries = mockChartLayouts.pe.series.find((s) => s.key === '^GSPC');
        expect(gspcSeries).toBeDefined();
    });

    it('does not dim GSPC legend when chartVisibility has it disabled', async () => {
        // Simulate: user selected ^IXIC in performance chart, so ^GSPC visibility is false
        mockTransactionState.chartVisibility = { '^GSPC': false, '^IXIC': true };

        const { updateLegend } = await import('@js/transactions/chart/interaction.js');
        const peModule = await import('@js/transactions/chart/renderers/pe.js');

        const peData = {
            dates: ['2023-01-01', '2023-01-02', '2023-01-03'],
            portfolio_pe: [15, 16, 17],
            ticker_pe: {},
            ticker_weights: {},
            benchmark_pe: {
                '^GSPC': [20, 21, 22],
            },
        };

        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve(peData),
            })
        );

        const ctx = createMockCtx();
        const chartManager = { redraw: jest.fn() };

        peModule.drawPEChart(ctx, chartManager, 0);
        await new Promise((r) => setTimeout(r, 0));
        peModule.drawPEChart(ctx, chartManager, 0);

        // updateLegend should have been called
        expect(updateLegend).toHaveBeenCalled();

        // At the moment updateLegend was called, chartVisibility['^GSPC'] should have been true
        // so the legend dot is not dimmed. Verify by checking the spy was called while
        // visibility was temporarily overridden.
        const callArgs = updateLegend.mock.calls;
        const lastCall = callArgs[callArgs.length - 1];
        const legendItems = lastCall[0];

        // Verify GSPC is included in legend items
        const gspcLegend = legendItems.find((item) => item.key === '^GSPC');
        expect(gspcLegend).toBeDefined();

        // Verify chartVisibility['^GSPC'] was true when updateLegend was invoked
        // We capture the value at call time via a custom mock
        // Since the mock already ran, we verify the state was restored after
        expect(mockTransactionState.chartVisibility['^GSPC']).toBe(false); // restored to original

        // Replace updateLegend with a spy that captures visibility at call time
        updateLegend.mockImplementation(() => {
            // Capture the visibility state at the moment of the call
            updateLegend._capturedGSPCVisibility = mockTransactionState.chartVisibility['^GSPC'];
        });

        // Run drawPEChart again to capture visibility during updateLegend call
        peModule.drawPEChart(ctx, chartManager, 0);
        expect(updateLegend._capturedGSPCVisibility).toBe(true);

        // And after the call, it should be restored back to false
        expect(mockTransactionState.chartVisibility['^GSPC']).toBe(false);
    });
});

describe('getPESnapshotText', () => {
    let mockState;

    beforeEach(() => {
        jest.resetModules();
        mockState = {
            transactionState: { chartDateRange: {} },
            chartLayouts: {},
        };
        jest.mock('@js/transactions/state.js', () => ({
            transactionState: mockState.transactionState,
        }));
        jest.mock('@js/transactions/chart/state.js', () => ({
            chartLayouts: mockState.chartLayouts,
        }));
    });

    it('returns loading state if series is empty', async () => {
        const { getPESnapshotText } = await import('@js/transactions/chart/renderers/pe.js');
        expect(getPESnapshotText()).toBe('Loading PE data...');
    });

    it('returns formatted stats', async () => {
        mockState.chartLayouts.pe = {
            rawSeries: [
                { date: new Date(2023, 0, 1), pe: 15 },
                { date: new Date(2023, 0, 2), pe: 20 },
                { date: new Date(2023, 0, 3), pe: 10 },
            ],
        };
        const { getPESnapshotText } = await import('@js/transactions/chart/renderers/pe.js');
        expect(getPESnapshotText()).toBe(
            'Current: 10.00x | Range: 10.00x - 20.00x | Harmonic Mean (1 / Σ(w/PE))'
        );
    });

    it('filters data based on date range', async () => {
        mockState.transactionState.chartDateRange = { from: '2023-01-02', to: '2023-01-02' };
        mockState.chartLayouts.pe = {
            rawSeries: [
                { date: new Date(2023, 0, 1), pe: 15 },
                { date: new Date(2023, 0, 2), pe: 20 },
                { date: new Date(2023, 0, 3), pe: 10 },
            ],
        };
        const { getPESnapshotText } = await import('@js/transactions/chart/renderers/pe.js');
        expect(getPESnapshotText()).toBe(
            'Current: 20.00x | Range: 20.00x - 20.00x | Harmonic Mean (1 / Σ(w/PE))'
        );
    });

    it('handles forward PE formatting', async () => {
        mockState.chartLayouts.pe = {
            rawSeries: [{ date: new Date(2023, 0, 1), pe: 15 }],
            forwardPE: {
                portfolio_forward_pe: 18,
                benchmark_forward_pe: { '^GSPC': 22 },
            },
        };
        const { getPESnapshotText } = await import('@js/transactions/chart/renderers/pe.js');
        expect(getPESnapshotText()).toBe(
            'Current: 15.00x | Range: 15.00x - 15.00x | Harmonic Mean (1 / Σ(w/PE)) | Forward: 18.00x (S&P 500: 22.00x)'
        );
    });
});
