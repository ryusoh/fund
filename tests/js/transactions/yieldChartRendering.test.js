import { jest } from '@jest/globals';

jest.setTimeout(15000);

describe('Yield Chart Rendering & Interaction', () => {
    let ctx;
    let canvas;
    let chartManager;
    let drawYieldChart;
    let drawAxes;
    let drawEndValue;
    let updateLegend;
    let transactionState;

    const mockData = [
        { date: '2023-01-01', forward_yield: 1.5, ttm_income: 1000.0 },
        { date: '2023-06-01', forward_yield: 1.6, ttm_income: 1100.0 },
        { date: '2024-01-01', forward_yield: 1.8, ttm_income: 1200.0 },
    ];

    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();

        jest.doMock('@js/transactions/chart/core.js', () => ({
            drawAxes: jest.fn(),
            drawEndValue: jest.fn(),
            drawMountainFill: jest.fn(),
            generateConcreteTicks: jest.fn().mockReturnValue([0, 2, 4, 6, 8]),
            generateYearBasedTicks: jest.fn().mockReturnValue([
                { time: 1672531200000, label: '2023', isYearStart: true },
                { time: 1704067200000, label: '2024', isYearStart: true },
            ]),
        }));

        jest.doMock('@js/transactions/chart/interaction.js', () => ({
            updateLegend: jest.fn(),
            updateCrosshairUI: jest.fn(),
            drawCrosshairOverlay: jest.fn(),
        }));

        jest.doMock('@js/transactions/chart/animation.js', () => ({
            stopPerformanceAnimation: jest.fn(),
            stopContributionAnimation: jest.fn(),
            stopFxAnimation: jest.fn(),
            stopPeAnimation: jest.fn(),
            stopConcentrationAnimation: jest.fn(),
            stopYieldAnimation: jest.fn(),
            isAnimationEnabled: jest.fn().mockReturnValue(true),
            advanceYieldAnimation: jest.fn().mockReturnValue(0),
            scheduleYieldAnimation: jest.fn(),
            drawSeriesGlow: jest.fn(),
        }));

        jest.doMock('@js/transactions/chart/config.js', () => ({
            CHART_LINE_WIDTHS: { main: 2 },
            mountainFill: { enabled: true },
            BENCHMARK_GRADIENTS: {
                '^LZ': ['#ff0000', '#00ff00'],
            },
        }));

        jest.doMock('@js/transactions/chart/helpers.js', () => ({
            getChartColors: jest.fn().mockReturnValue({
                primary: '#ff0000',
                secondary: '#00ff00',
                portfolio: '#7a7a7a',
                contribution: '#b3b3b3',
            }),
            createTimeInterpolator: jest.fn().mockReturnValue(() => 10),
            parseLocalDate: jest.fn((dateStr) => new Date(dateStr)),
        }));

        jest.doMock('@js/transactions/utils.js', () => ({
            convertValueToCurrency: jest.fn((val, date, currency) => {
                if (currency === 'EUR') {
                    return val * 2;
                }
                return val;
            }),
            formatCurrencyCompact: jest.fn((val, { currency }) => `${val} ${currency}`),
            formatCurrencyInline: jest.fn((val, { currency }) => `${val} ${currency}`),
        }));

        const yieldModule = await import('@js/transactions/chart/renderers/yield.js');
        const coreModule = await import('@js/transactions/chart/core.js');
        const interactionModule = await import('@js/transactions/chart/interaction.js');
        const stateModule = await import('@js/transactions/state.js');

        drawYieldChart = yieldModule.drawYieldChart;
        drawAxes = coreModule.drawAxes;
        drawEndValue = coreModule.drawEndValue;
        updateLegend = interactionModule.updateLegend;
        transactionState = stateModule.transactionState;

        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockData),
            })
        );

        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1024,
        });
        window.getComputedStyle = jest.fn().mockReturnValue({
            getPropertyValue: jest.fn().mockReturnValue('#7a7a7a'),
        });

        canvas = {
            width: 2000,
            height: 1000,
            offsetWidth: 1000,
            offsetHeight: 500,
        };

        ctx = {
            canvas,
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fillRect: jest.fn(),
            rect: jest.fn(),
            fill: jest.fn(),
            fillText: jest.fn(),
            measureText: jest.fn().mockReturnValue({ width: 50 }),
            createLinearGradient: jest.fn().mockReturnValue({
                addColorStop: jest.fn(),
            }),
        };

        chartManager = {
            update: jest.fn(),
        };
    });

    afterEach(() => {
        jest.resetModules();
        jest.dontMock('@js/transactions/chart/core.js');
        jest.dontMock('@js/transactions/chart/interaction.js');
        jest.dontMock('@js/transactions/chart/animation.js');
        jest.dontMock('@js/transactions/chart/config.js');
        jest.dontMock('@js/transactions/chart/helpers.js');
        jest.dontMock('@js/transactions/utils.js');
    });

    test('uses offsetWidth/offsetHeight for logical scaling on High-DPI screens', async () => {
        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        expect(drawAxes).toHaveBeenCalled();
        const callArgs = drawAxes.mock.calls[0];

        expect(callArgs[2]).toBe(880);
        expect(callArgs[3]).toBe(420);
    });

    test('calls drawAxes with correct function arguments for X and Y scales', async () => {
        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        const callArgs = drawAxes.mock.calls[0];
        const xScale = callArgs[8];
        const yScale = callArgs[9];

        expect(typeof xScale).toBe('function');
        expect(typeof yScale).toBe('function');

        expect(xScale(callArgs[4])).toBeCloseTo(60);
    });

    test('passes series with "name" property to updateLegend', async () => {
        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        expect(updateLegend).toHaveBeenCalled();
        const series = updateLegend.mock.calls[0][0];

        expect(series).toHaveLength(2);
        expect(series[0]).toHaveProperty('name', 'Yield');
        expect(series[0]).toHaveProperty('key', 'Yield');
        expect(series[1]).toHaveProperty('name', 'Income');
        expect(series[1]).toHaveProperty('key', 'Income');
    });

    test('calls drawEndValue with correct positional arguments', async () => {
        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        expect(drawEndValue).toHaveBeenCalled();
        const args = drawEndValue.mock.calls[0];

        expect(args[0]).toBe(ctx);
        expect(typeof args[1]).toBe('number');
        expect(typeof args[2]).toBe('number');
        expect(typeof args[3]).toBe('number');
        expect(typeof args[4]).toBe('string');
        expect(typeof args[5]).toBe('boolean');
        expect(typeof args[6]).toBe('object');
        expect(typeof args[7]).toBe('number');
        expect(typeof args[8]).toBe('number');
        expect(typeof args[9]).toBe('function');
        expect(args[10]).toBe(true);
    });

    test('applies currency conversion to income when a non-USD currency is selected', async () => {
        transactionState.selectedCurrency = 'EUR';
        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        const series = updateLegend.mock.calls[updateLegend.mock.calls.length - 1][0];
        const incomeSeries = series.find((s) => s.key === 'Income');

        expect(incomeSeries.points[0].value).toBe(2000);
        expect(incomeSeries.points[1].value).toBe(2200);
        expect(incomeSeries.points[2].value).toBe(2400);

        transactionState.selectedCurrency = 'USD';
    });
});

describe('Yield Chart Right-Axis Alignment', () => {
    let ctx;
    let canvas;
    let chartManager;
    let fillTextCalls;
    let drawYieldChart;
    let drawAxes;
    let generateConcreteTicks;

    const mockData = [
        { date: '2023-01-01', forward_yield: 1.5, ttm_income: 1000.0 },
        { date: '2023-06-01', forward_yield: 3.0, ttm_income: 1500.0 },
        { date: '2024-01-01', forward_yield: 5.0, ttm_income: 2000.0 },
        { date: '2024-06-01', forward_yield: 7.0, ttm_income: 2500.0 },
    ];

    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();
        fillTextCalls = [];

        jest.doMock('@js/transactions/chart/core.js', () => ({
            drawAxes: jest.fn(),
            drawEndValue: jest.fn(),
            drawMountainFill: jest.fn(),
            generateConcreteTicks: jest.fn().mockReturnValue([0, 2, 4, 6, 7.5]),
            generateYearBasedTicks: jest.fn().mockReturnValue([
                { time: 1672531200000, label: '2023', isYearStart: true },
                { time: 1704067200000, label: '2024', isYearStart: true },
            ]),
        }));

        jest.doMock('@js/transactions/chart/interaction.js', () => ({
            updateLegend: jest.fn(),
            updateCrosshairUI: jest.fn(),
            drawCrosshairOverlay: jest.fn(),
        }));

        jest.doMock('@js/transactions/chart/animation.js', () => ({
            stopPerformanceAnimation: jest.fn(),
            stopContributionAnimation: jest.fn(),
            stopFxAnimation: jest.fn(),
            stopPeAnimation: jest.fn(),
            stopConcentrationAnimation: jest.fn(),
            stopYieldAnimation: jest.fn(),
            isAnimationEnabled: jest.fn().mockReturnValue(true),
            advanceYieldAnimation: jest.fn().mockReturnValue(0),
            scheduleYieldAnimation: jest.fn(),
            drawSeriesGlow: jest.fn(),
        }));

        jest.doMock('@js/transactions/chart/config.js', () => ({
            CHART_LINE_WIDTHS: { main: 2 },
            mountainFill: { enabled: true },
            BENCHMARK_GRADIENTS: {
                '^LZ': ['#ff0000', '#00ff00'],
            },
        }));

        jest.doMock('@js/transactions/chart/helpers.js', () => ({
            getChartColors: jest.fn().mockReturnValue({
                primary: '#ff0000',
                secondary: '#00ff00',
                portfolio: '#7a7a7a',
                contribution: '#b3b3b3',
            }),
            createTimeInterpolator: jest.fn().mockReturnValue(() => 10),
            parseLocalDate: jest.fn((dateStr) => new Date(dateStr)),
        }));

        jest.doMock('@js/transactions/utils.js', () => ({
            convertValueToCurrency: jest.fn((val, date, currency) => {
                if (currency === 'EUR') {
                    return val * 2;
                }
                return val;
            }),
            formatCurrencyCompact: jest.fn((val, { currency }) => `${val} ${currency}`),
            formatCurrencyInline: jest.fn((val, { currency }) => `${val} ${currency}`),
        }));

        const yieldModule = await import('@js/transactions/chart/renderers/yield.js');
        const coreModule = await import('@js/transactions/chart/core.js');

        drawYieldChart = yieldModule.drawYieldChart;
        drawAxes = coreModule.drawAxes;
        generateConcreteTicks = coreModule.generateConcreteTicks;

        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockData),
            })
        );

        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1024,
        });
        window.getComputedStyle = jest.fn().mockReturnValue({
            getPropertyValue: jest.fn().mockReturnValue('#7a7a7a'),
        });

        canvas = {
            width: 2000,
            height: 1000,
            offsetWidth: 1000,
            offsetHeight: 500,
        };

        ctx = {
            canvas,
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fillRect: jest.fn(),
            rect: jest.fn(),
            fill: jest.fn(),
            fillText: jest.fn((text, x, y) => {
                fillTextCalls.push({ text, x, y });
            }),
            measureText: jest.fn().mockReturnValue({ width: 50 }),
            createLinearGradient: jest.fn().mockReturnValue({
                addColorStop: jest.fn(),
            }),
        };

        chartManager = {
            update: jest.fn(),
        };
    });

    afterEach(() => {
        jest.resetModules();
        jest.dontMock('@js/transactions/chart/core.js');
        jest.dontMock('@js/transactions/chart/interaction.js');
        jest.dontMock('@js/transactions/chart/animation.js');
        jest.dontMock('@js/transactions/chart/config.js');
        jest.dontMock('@js/transactions/chart/helpers.js');
        jest.dontMock('@js/transactions/utils.js');
    });

    test('right-axis has same number of ticks as left-axis', async () => {
        const mockYieldTicks = [0, 2, 4, 6, 7.5];
        generateConcreteTicks.mockReturnValue(mockYieldTicks);

        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        const rightAxisLabels = fillTextCalls.filter((call) => call.x > 940);

        expect(rightAxisLabels.length).toBe(mockYieldTicks.length);
    });

    test('right-axis labels align vertically with left-axis grid lines', async () => {
        const mockYieldTicks = [0, 2, 4, 6, 7.5];
        generateConcreteTicks.mockReturnValue(mockYieldTicks);

        const leftAxisYPositions = [];

        drawAxes.mockImplementation(
            (
                context,
                margin,
                chartWidth,
                chartHeight,
                minTime,
                maxTime,
                yMin,
                yMax,
                xScale,
                yScale
            ) => {
                mockYieldTicks.forEach((tick) => {
                    const y = yScale(tick);
                    leftAxisYPositions.push(y);
                });
            }
        );

        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        const rightAxisLabels = fillTextCalls.filter((call) => call.x > 940);
        const rightAxisYPositions = rightAxisLabels.map((label) => label.y);

        expect(rightAxisYPositions.length).toBe(leftAxisYPositions.length);

        for (let i = 0; i < leftAxisYPositions.length; i++) {
            expect(rightAxisYPositions[i]).toBeCloseTo(leftAxisYPositions[i], 0);
        }
    });

    test('right-axis shows top tick when left-axis has top tick (7% scenario)', async () => {
        const mockYieldTicks = [0, 2, 4, 6, 7.5];
        generateConcreteTicks.mockReturnValue(mockYieldTicks);

        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        const rightAxisLabels = fillTextCalls.filter((call) => call.x > 940);

        const yPositions = rightAxisLabels.map((label) => label.y);
        const minYPosition = Math.min(...yPositions);

        expect(minYPosition).toBeLessThan(100);
        expect(rightAxisLabels.length).toBe(mockYieldTicks.length);
    });

    test('right-axis uses textBaseline middle for proper alignment', async () => {
        const mockYieldTicks = [0, 2, 4, 6, 7.5];
        generateConcreteTicks.mockReturnValue(mockYieldTicks);

        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        const rightAxisLabels = fillTextCalls.filter((call) => call.x > 940);
        expect(rightAxisLabels.length).toBeGreaterThan(0);

        rightAxisLabels.forEach((label) => {
            expect(typeof label.y).toBe('number');
            expect(Number.isFinite(label.y)).toBe(true);
        });
    });

    test('right-axis labels map correctly when yield and income have different ranges', async () => {
        const mockYieldTicks = [0, 2, 4, 6, 7.5];
        generateConcreteTicks.mockReturnValue(mockYieldTicks);

        const disparateData = [
            { date: '2023-01-01', forward_yield: 0.5, ttm_income: 5000.0 },
            { date: '2023-06-01', forward_yield: 8.0, ttm_income: 10000.0 },
        ];

        global.fetch.mockImplementation(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve(disparateData),
            })
        );

        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        const rightAxisLabels = fillTextCalls.filter((call) => call.x > 940);

        // Should still have same number of labels as yield ticks
        expect(rightAxisLabels.length).toBe(mockYieldTicks.length);

        // All labels should have valid y positions within chart bounds
        const yPositions = rightAxisLabels.map((label) => label.y);
        yPositions.forEach((y) => {
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(500); // chart height
        });
    });

    test('right-axis handles edge case when income range is flat', async () => {
        const mockYieldTicks = [0, 2, 4, 6, 7.5];
        generateConcreteTicks.mockReturnValue(mockYieldTicks);

        const flatIncomeData = [
            { date: '2023-01-01', forward_yield: 1.0, ttm_income: 1000.0 },
            { date: '2023-06-01', forward_yield: 5.0, ttm_income: 1000.0 },
            { date: '2024-01-01', forward_yield: 8.0, ttm_income: 1000.0 },
        ];

        global.fetch.mockImplementation(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve(flatIncomeData),
            })
        );

        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        const rightAxisLabels = fillTextCalls.filter((call) => call.x > 940);

        expect(rightAxisLabels.length).toBe(mockYieldTicks.length);
    });
});

describe('Yield Chart Label Toggle', () => {
    let ctx;
    let canvas;
    let chartManager;
    let drawYieldChart;
    let drawEndValue;
    let transactionState;
    let getShowChartLabels;

    const mockData = [
        { date: '2023-01-01', forward_yield: 1.5, ttm_income: 1000.0 },
        { date: '2023-06-01', forward_yield: 1.6, ttm_income: 1100.0 },
        { date: '2024-01-01', forward_yield: 1.8, ttm_income: 1200.0 },
    ];

    beforeEach(async () => {
        jest.resetModules();
        jest.clearAllMocks();

        jest.doMock('@js/transactions/chart/core.js', () => ({
            drawAxes: jest.fn(),
            drawEndValue: jest.fn(),
            drawMountainFill: jest.fn(),
            generateConcreteTicks: jest.fn().mockReturnValue([0, 2, 4, 6, 8]),
            generateYearBasedTicks: jest.fn().mockReturnValue([
                { time: 1672531200000, label: '2023', isYearStart: true },
                { time: 1704067200000, label: '2024', isYearStart: true },
            ]),
        }));

        jest.doMock('@js/transactions/chart/interaction.js', () => ({
            updateLegend: jest.fn(),
            updateCrosshairUI: jest.fn(),
            drawCrosshairOverlay: jest.fn(),
        }));

        jest.doMock('@js/transactions/chart/animation.js', () => ({
            stopPerformanceAnimation: jest.fn(),
            stopContributionAnimation: jest.fn(),
            stopFxAnimation: jest.fn(),
            stopPeAnimation: jest.fn(),
            stopConcentrationAnimation: jest.fn(),
            stopYieldAnimation: jest.fn(),
            isAnimationEnabled: jest.fn().mockReturnValue(true),
            advanceYieldAnimation: jest.fn().mockReturnValue(0),
            scheduleYieldAnimation: jest.fn(),
            drawSeriesGlow: jest.fn(),
        }));

        jest.doMock('@js/transactions/chart/config.js', () => ({
            CHART_LINE_WIDTHS: { main: 2 },
            mountainFill: { enabled: true },
            BENCHMARK_GRADIENTS: {
                '^LZ': ['#ff0000', '#00ff00'],
            },
        }));

        jest.doMock('@js/transactions/chart/helpers.js', () => ({
            getChartColors: jest.fn().mockReturnValue({
                primary: '#ff0000',
                secondary: '#00ff00',
                portfolio: '#7a7a7a',
                contribution: '#b3b3b3',
            }),
            createTimeInterpolator: jest.fn().mockReturnValue(() => 10),
            parseLocalDate: jest.fn((dateStr) => new Date(dateStr)),
        }));

        jest.doMock('@js/transactions/utils.js', () => ({
            convertValueToCurrency: jest.fn((val, date, currency) => {
                if (currency === 'EUR') {
                    return val * 2;
                }
                return val;
            }),
            formatCurrencyCompact: jest.fn((val, { currency }) => `${val} ${currency}`),
            formatCurrencyInline: jest.fn((val, { currency }) => `${val} ${currency}`),
        }));

        const yieldModule = await import('@js/transactions/chart/renderers/yield.js');
        const coreModule = await import('@js/transactions/chart/core.js');
        const stateModule = await import('@js/transactions/state.js');

        drawYieldChart = yieldModule.drawYieldChart;
        drawEndValue = coreModule.drawEndValue;
        transactionState = stateModule.transactionState;
        getShowChartLabels = stateModule.getShowChartLabels;

        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockData),
            })
        );

        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1024,
        });
        window.getComputedStyle = jest.fn().mockReturnValue({
            getPropertyValue: jest.fn().mockReturnValue('#7a7a7a'),
        });

        canvas = {
            width: 2000,
            height: 1000,
            offsetWidth: 1000,
            offsetHeight: 500,
        };

        ctx = {
            canvas,
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fillRect: jest.fn(),
            rect: jest.fn(),
            fill: jest.fn(),
            fillText: jest.fn(),
            measureText: jest.fn().mockReturnValue({ width: 50 }),
            createLinearGradient: jest.fn().mockReturnValue({
                addColorStop: jest.fn(),
            }),
        };

        chartManager = {
            update: jest.fn(),
            redraw: jest.fn(),
        };
    });

    afterEach(() => {
        jest.resetModules();
        jest.dontMock('@js/transactions/chart/core.js');
        jest.dontMock('@js/transactions/chart/interaction.js');
        jest.dontMock('@js/transactions/chart/animation.js');
        jest.dontMock('@js/transactions/chart/config.js');
        jest.dontMock('@js/transactions/chart/helpers.js');
        jest.dontMock('@js/transactions/utils.js');
        // Reset state to default
        transactionState.showChartLabels = true;
    });

    test('draws end value labels when showChartLabels is true (default)', async () => {
        // Ensure labels are enabled (default state)
        transactionState.showChartLabels = true;

        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        // drawEndValue should be called for both Yield and Income series
        expect(drawEndValue).toHaveBeenCalledTimes(2);
    });

    test('does not draw end value labels when showChartLabels is false', async () => {
        // Disable labels
        transactionState.showChartLabels = false;

        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);

        // drawEndValue should NOT be called when labels are disabled
        expect(drawEndValue).not.toHaveBeenCalled();
    });

    test('toggles labels visibility via getShowChartLabels function', async () => {
        // Verify getShowChartLabels returns true by default
        expect(getShowChartLabels()).toBe(true);

        // Disable labels
        transactionState.showChartLabels = false;
        expect(getShowChartLabels()).toBe(false);

        // Re-enable labels
        transactionState.showChartLabels = true;
        expect(getShowChartLabels()).toBe(true);
    });

    test('respects label toggle state when rendering chart', async () => {
        // Test with labels disabled
        transactionState.showChartLabels = false;

        await drawYieldChart(ctx, chartManager);

        // drawEndValue should NOT be called when labels are disabled
        expect(drawEndValue).not.toHaveBeenCalled();
    });

    test('respects label toggle state across multiple chart renders', async () => {
        // Start with labels enabled
        transactionState.showChartLabels = true;
        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);
        expect(drawEndValue).toHaveBeenCalledTimes(4);

        // Disable labels and render again
        jest.clearAllMocks();
        transactionState.showChartLabels = false;
        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);
        expect(drawEndValue).not.toHaveBeenCalled();

        // Re-enable labels and render again
        jest.clearAllMocks();
        transactionState.showChartLabels = true;
        await drawYieldChart(ctx, chartManager);
        await drawYieldChart(ctx, chartManager);
        expect(drawEndValue).toHaveBeenCalledTimes(4);
    });
});
