describe('Geography Chart Renderer', () => {
    let ctx;
    let chartManager;
    let loadGeographySnapshotData;
    let drawGeographyChart;
    let drawGeographyAbsoluteChart;

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
        };
        chartManager = { redraw: jest.fn() };

        loadGeographySnapshotData = jest.fn();

        jest.doMock('@js/transactions/state.js', () => ({
            transactionState: {
                chartDateRange: { from: null, to: null },
                selectedCurrency: 'USD',
            },
        }));
        jest.doMock('@js/transactions/chart/state.js', () => ({
            chartLayouts: {},
        }));
        jest.doMock('@js/transactions/chart/interaction.js', () => ({
            updateCrosshairUI: jest.fn(),
            updateLegend: jest.fn(),
            drawCrosshairOverlay: jest.fn(),
        }));
        jest.doMock('@js/transactions/chart/animation.js', () => ({
            stopPerformanceAnimation: jest.fn(),
            stopContributionAnimation: jest.fn(),
            stopFxAnimation: jest.fn(),
            stopPeAnimation: jest.fn(),
            stopConcentrationAnimation: jest.fn(),
        }));
        jest.doMock('@js/transactions/dataLoader.js', () => ({
            loadGeographySnapshotData,
        }));
        jest.doMock('@js/utils/logger.js', () => ({
            logger: { warn: jest.fn() },
        }));
        jest.doMock('@js/transactions/chart/core.js', () => ({
            drawAxes: jest.fn(),
        }));
        jest.doMock('@js/transactions/utils.js', () => ({
            parseLocalDate: jest.fn((date) => {
                if (date === 'invalid') {
                    return new Date('invalid');
                }
                return new Date(date);
            }),
            convertValueToCurrency: jest.fn((val) => val),
            formatCurrencyCompact: jest.fn((val) => `$${val}`),
            formatCurrencyInlineValue: jest.fn((val) => `$${val}`),
            formatPercentInline: jest.fn((val) => `${val}%`),
        }));
        jest.doMock('@js/utils/date.js', () => ({
            clampTime: jest.fn((val) => val),
        }));
        jest.doMock('@js/utils/smoothing.js', () => ({
            createTimeInterpolator: jest.fn(() => jest.fn()),
        }));

        const module = await import('@js/transactions/chart/renderers/geography.js');
        drawGeographyChart = module.drawGeographyChart;
        drawGeographyAbsoluteChart = module.drawGeographyAbsoluteChart;
    });

    it('handles empty initialization safely', async () => {
        loadGeographySnapshotData.mockResolvedValueOnce(null);
        drawGeographyChart(ctx, chartManager);
        await new Promise(process.nextTick);
        expect(document.getElementById('runningAmountEmpty').style.display).toBe('block');
    });

    it('handles invalid data format', async () => {
        const mockData = { invalid: true };
        loadGeographySnapshotData.mockResolvedValueOnce(mockData);

        drawGeographyChart(ctx, chartManager);
        await new Promise(process.nextTick);

        expect(document.getElementById('runningAmountEmpty').style.display).toBe('block');
    });

    it('handles empty dimensions', async () => {
        const mockData = {
            dates: ['2023-01-01'],
            total_values: [1000],
            series: { US: [100] },
        };
        loadGeographySnapshotData.mockResolvedValueOnce(mockData);
        ctx.canvas.offsetWidth = 0;
        ctx.canvas.offsetHeight = 0;

        drawGeographyChart(ctx, chartManager);
        await new Promise(process.nextTick);

        expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it('renders geography percent chart with valid data', async () => {
        const mockData = {
            dates: ['2023-01-01', '2023-01-02'],
            total_values: [1000, 1100],
            series: {
                US: [50, 60],
                UK: [50, 40],
            },
        };
        loadGeographySnapshotData.mockResolvedValueOnce(mockData);

        drawGeographyChart(ctx, chartManager);

        await new Promise(process.nextTick);

        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.fill).toHaveBeenCalled();
        expect(document.getElementById('runningAmountEmpty').style.display).toBe('none');
    });

    it('renders geography absolute chart with valid data', async () => {
        const mockData = {
            dates: ['2023-01-01', '2023-01-02'],
            total_values: [1000, 1100],
            series: {
                US: [50, 60],
                UK: [50, 40],
            },
        };
        loadGeographySnapshotData.mockResolvedValueOnce(mockData);

        drawGeographyAbsoluteChart(ctx, chartManager);

        await new Promise(process.nextTick);

        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.fill).toHaveBeenCalled();
    });

    it('filters dates correctly', async () => {
        const mockState = require('@js/transactions/state.js').transactionState;
        mockState.chartDateRange = { from: '2023-01-02', to: '2023-01-03' };

        const mockData = {
            dates: ['2023-01-01', '2023-01-02', '2023-01-03', '2023-01-04'],
            total_values: [1000, 1100, 1200, 1300],
            series: {
                US: [50, 60, 70, 80],
            },
        };
        loadGeographySnapshotData.mockResolvedValueOnce(mockData);

        drawGeographyChart(ctx, chartManager);
        await new Promise(process.nextTick);

        expect(ctx.beginPath).toHaveBeenCalled();
    });

    it('handles empty filtered dates array safely', async () => {
        const mockState = require('@js/transactions/state.js').transactionState;
        mockState.chartDateRange = { from: '2023-02-01', to: '2023-02-02' };

        const mockData = {
            dates: ['2023-01-01', '2023-01-02'],
            total_values: [1000, 1100],
            series: {
                US: [50, 60],
            },
        };
        loadGeographySnapshotData.mockResolvedValueOnce(mockData);

        drawGeographyAbsoluteChart(ctx, chartManager);
        await new Promise(process.nextTick);

        expect(ctx.beginPath).not.toHaveBeenCalled();
        expect(document.getElementById('runningAmountEmpty').style.display).toBe('block');
    });
});
