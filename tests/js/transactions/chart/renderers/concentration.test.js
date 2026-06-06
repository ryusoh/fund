describe('Concentration Chart Renderer', () => {
    let ctx;
    let chartManager;
    let loadCompositionSnapshotData;
    let drawConcentrationChart;
    let buildConcentrationSeries;

    beforeEach(async () => {
        jest.resetModules();
        document.body.innerHTML = '<div id="runningAmountEmpty"></div>';
        ctx = {
            canvas: { offsetWidth: 800, offsetHeight: 400 },
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            closePath: jest.fn(),
            fill: jest.fn(),
            stroke: jest.fn(),
            createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
        };
        chartManager = { redraw: jest.fn() };

        loadCompositionSnapshotData = jest.fn().mockResolvedValue({
            dates: ['2023-01-01'],
            series: { AAPL: [100] },
        });

        jest.doMock('../../../../../js/transactions/state.js', () => ({
            transactionState: {
                chartDateRange: { from: null, to: null },
            },
        }));
        jest.doMock('../../../../../js/transactions/chart/state.js', () => ({
            chartLayouts: {},
        }));
        jest.doMock('../../../../../js/transactions/chart/interaction.js', () => ({
            updateCrosshairUI: jest.fn(),
            updateLegend: jest.fn(),
            drawCrosshairOverlay: jest.fn(),
        }));
        jest.doMock('../../../../../js/transactions/chart/animation.js', () => ({
            stopPerformanceAnimation: jest.fn(),
            stopContributionAnimation: jest.fn(),
            stopFxAnimation: jest.fn(),
            stopPeAnimation: jest.fn(),
            stopConcentrationAnimation: jest.fn(),
            isAnimationEnabled: jest.fn(() => false),
            advanceConcentrationAnimation: jest.fn(() => 0),
            scheduleConcentrationAnimation: jest.fn(),
            drawSeriesGlow: jest.fn(),
        }));
        jest.doMock('../../../../../js/transactions/dataLoader.js', () => ({
            loadCompositionSnapshotData,
        }));
        jest.doMock('../../../../../js/utils/logger.js', () => ({
            logger: { warn: jest.fn() },
        }));
        jest.doMock('../../../../../js/transactions/chart/core.js', () => ({
            drawAxes: jest.fn(),
            drawMountainFill: jest.fn(),
            drawEndValue: jest.fn(),
        }));
        jest.doMock('../../../../../js/config.js', () => ({
            mountainFill: { enabled: true },
            CHART_LINE_WIDTHS: { contribution: 2 },
            BENCHMARK_GRADIENTS: { '^LZ': ['#fff', '#000'] },
        }));
        jest.doMock('../../../../../js/utils/colors.js', () => ({
            getChartColors: jest.fn(() => ({ portfolio: '#fff' })),
        }));
        jest.doMock('../../../../../js/transactions/utils.js', () => ({
            parseLocalDate: jest.fn((date) => {
                if (date === 'invalid') {
                    return new Date('invalid');
                }
                return new Date(date);
            }),
        }));
        jest.doMock('../../../../../js/utils/date.js', () => ({
            clampTime: jest.fn((val) => val),
        }));
        jest.doMock('../../../../../js/utils/smoothing.js', () => ({
            createTimeInterpolator: jest.fn(() => jest.fn()),
        }));

        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ SPY: 500 }),
            })
        );

        const module =
            await import('../../../../../js/transactions/chart/renderers/concentration.js');
        drawConcentrationChart = module.drawConcentrationChart;
        buildConcentrationSeries = module.buildConcentrationSeries;
    });

    it('handles empty initialization safely', async () => {
        loadCompositionSnapshotData.mockResolvedValueOnce(null);
        await drawConcentrationChart(ctx, chartManager, 0);
        expect(document.getElementById('runningAmountEmpty').style.display).toBe('block');
    });

    it('handles invalid data format', async () => {
        const mockData = { invalid: true };
        loadCompositionSnapshotData.mockResolvedValueOnce(mockData);
        await drawConcentrationChart(ctx, chartManager, 0);
        expect(document.getElementById('runningAmountEmpty').style.display).toBe('block');
    });

    it('handles empty dimensions', async () => {
        const mockData = {
            dates: ['2023-01-01'],
            composition: { AAPL: [100] },
        };
        loadCompositionSnapshotData.mockResolvedValueOnce(mockData);
        ctx.canvas.offsetWidth = 0;
        ctx.canvas.offsetHeight = 0;

        await drawConcentrationChart(ctx, chartManager, 0);
        await new Promise(process.nextTick);

        expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it('renders concentration chart with valid data', async () => {
        const mockData = {
            dates: ['2023-01-01', '2023-01-02'],
            series: {
                AAPL: [60, 50],
                MSFT: [40, 50],
            },
        };
        loadCompositionSnapshotData.mockResolvedValueOnce(mockData);

        await drawConcentrationChart(ctx, chartManager, 0);

        // At this point, data is cached and redraw is called
        expect(chartManager.redraw).toHaveBeenCalled();

        // Second call will actually render
        await drawConcentrationChart(ctx, chartManager, 0);

        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.stroke).toHaveBeenCalled();
        expect(document.getElementById('runningAmountEmpty').style.display).toBe('none');
    });

    it('filters dates correctly in buildConcentrationSeries', () => {
        const rawDates = ['2023-01-01', '2023-01-02', '2023-01-03'];
        const compositionSeries = {
            AAPL: [100, 100, 100],
        };
        const filterFrom = new Date('2023-01-02');
        const filterTo = new Date('2023-01-02');

        const series = buildConcentrationSeries(rawDates, compositionSeries, filterFrom, filterTo);
        expect(series.length).toBe(1);
        expect(series[0].hhi).toBeCloseTo(1.0, 3);
        expect(series[0].effectiveHoldings).toBeCloseTo(1.0, 3);
    });

    it('handles negative or zero values in buildConcentrationSeries gracefully', () => {
        const rawDates = ['2023-01-01'];
        const compositionSeries = {
            AAPL: [100],
            CASH: [-50],
            BAD: [0],
        };
        const series = buildConcentrationSeries(rawDates, compositionSeries, null, null);

        expect(series.length).toBe(1);
        expect(series[0].hhi).toBeCloseTo(1.0, 3);
    });

    it('applies ETF lookthrough in buildConcentrationSeries via internal dictionary fallback', async () => {
        // Run fetch once to populate internal dictionary
        await drawConcentrationChart(ctx, chartManager, 0);

        const rawDates = ['2023-01-01'];
        const compositionSeries = {
            SPY: [100],
        };

        const series = buildConcentrationSeries(rawDates, compositionSeries, null, null);

        expect(series.length).toBe(1);
        expect(series[0].hhi).toBeCloseTo(0.05, 3);
    });
});
