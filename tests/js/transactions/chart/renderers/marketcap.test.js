describe('Marketcap Chart Renderer', () => {
    let ctx;
    let chartManager;
    let loadMarketcapSnapshotData;
    let drawMarketcapChart;
    let drawMarketcapAbsoluteChart;

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

        loadMarketcapSnapshotData = jest.fn();

        jest.doMock('../../../../../js/transactions/state.js', () => ({
            transactionState: {
                chartDateRange: { from: null, to: null },
                selectedCurrency: 'USD',
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
        }));
        jest.doMock('../../../../../js/transactions/dataLoader.js', () => ({
            loadMarketcapSnapshotData,
        }));
        jest.doMock('../../../../../js/utils/logger.js', () => ({
            logger: { warn: jest.fn() },
        }));
        jest.doMock('../../../../../js/transactions/chart/core.js', () => ({
            drawAxes: jest.fn(),
        }));
        jest.doMock('../../../../../js/transactions/utils.js', () => ({
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
        jest.doMock('../../../../../js/utils/date.js', () => ({
            clampTime: jest.fn((val) => val),
        }));
        jest.doMock('../../../../../js/utils/smoothing.js', () => ({
            createTimeInterpolator: jest.fn(() => jest.fn()),
        }));

        const module = await import('../../../../../js/transactions/chart/renderers/marketcap.js');
        drawMarketcapChart = module.drawMarketcapChart;
        drawMarketcapAbsoluteChart = module.drawMarketcapAbsoluteChart;
    });

    it('handles empty initialization safely', async () => {
        loadMarketcapSnapshotData.mockResolvedValueOnce(null);
        drawMarketcapChart(ctx, chartManager);
        await new Promise(process.nextTick);
        expect(document.getElementById('runningAmountEmpty').style.display).toBe('block');
    });

    it('handles invalid data format', async () => {
        const mockData = { invalid: true };
        loadMarketcapSnapshotData.mockResolvedValueOnce(mockData);

        drawMarketcapChart(ctx, chartManager);
        await new Promise(process.nextTick);

        expect(document.getElementById('runningAmountEmpty').style.display).toBe('block');
    });

    it('handles invalid date parsing', async () => {
        const mockData = {
            dates: ['invalid'],
            total_values: [1000],
            series: { Mega: [100] },
        };
        loadMarketcapSnapshotData.mockResolvedValueOnce(mockData);

        drawMarketcapChart(ctx, chartManager);
        await new Promise(process.nextTick);

        expect(document.getElementById('runningAmountEmpty').style.display).toBe('block');
    });

    it('handles empty dimensions', async () => {
        const mockData = {
            dates: ['2023-01-01'],
            total_values: [1000],
            series: { Mega: [100] },
        };
        loadMarketcapSnapshotData.mockResolvedValueOnce(mockData);
        ctx.canvas.offsetWidth = 0;
        ctx.canvas.offsetHeight = 0;

        drawMarketcapChart(ctx, chartManager);
        await new Promise(process.nextTick);

        expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it('renders marketcap percent chart with valid data', async () => {
        const mockData = {
            dates: ['2023-01-01', '2023-01-02'],
            total_values: [1000, 1100],
            series: {
                Mega: [50, 60],
                Large: [50, 40],
            },
        };
        loadMarketcapSnapshotData.mockResolvedValueOnce(mockData);

        drawMarketcapChart(ctx, chartManager);

        await new Promise(process.nextTick);

        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.fill).toHaveBeenCalled();
        expect(document.getElementById('runningAmountEmpty').style.display).toBe('none');
    });

    it('renders marketcap absolute chart with valid data', async () => {
        const mockData = {
            dates: ['2023-01-01', '2023-01-02'],
            total_values: [1000, 1100],
            series: {
                Mega: [50, 60],
                Large: [50, 40],
            },
        };
        loadMarketcapSnapshotData.mockResolvedValueOnce(mockData);

        drawMarketcapAbsoluteChart(ctx, chartManager);

        await new Promise(process.nextTick);

        expect(ctx.beginPath).toHaveBeenCalled();
        expect(ctx.fill).toHaveBeenCalled();
    });

    it('filters dates correctly', async () => {
        const mockState = require('../../../../../js/transactions/state.js').transactionState;
        mockState.chartDateRange = { from: '2023-01-02', to: '2023-01-03' };

        const mockData = {
            dates: ['2023-01-01', '2023-01-02', '2023-01-03', '2023-01-04'],
            total_values: [1000, 1100, 1200, 1300],
            series: {
                Mega: [50, 60, 70, 80],
            },
        };
        loadMarketcapSnapshotData.mockResolvedValueOnce(mockData);

        drawMarketcapChart(ctx, chartManager);
        await new Promise(process.nextTick);

        expect(ctx.beginPath).toHaveBeenCalled();
    });

    it('handles empty filtered dates array safely', async () => {
        const mockState = require('../../../../../js/transactions/state.js').transactionState;
        mockState.chartDateRange = { from: '2023-02-01', to: '2023-02-02' };

        const mockData = {
            dates: ['2023-01-01', '2023-01-02'],
            total_values: [1000, 1100],
            series: {
                Mega: [50, 60],
            },
        };
        loadMarketcapSnapshotData.mockResolvedValueOnce(mockData);

        drawMarketcapAbsoluteChart(ctx, chartManager);
        await new Promise(process.nextTick);

        expect(ctx.beginPath).not.toHaveBeenCalled();
        expect(document.getElementById('runningAmountEmpty').style.display).toBe('block');
    });
});
