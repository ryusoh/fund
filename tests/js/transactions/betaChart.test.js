import { jest } from '@jest/globals';

describe('Beta Chart Renderer Tests', () => {
    let originalRAF;
    let originalCAF;

    beforeEach(() => {
        global.HTMLCanvasElement = global.HTMLCanvasElement || class {};
        jest.resetModules();

        originalRAF = global.requestAnimationFrame;
        originalCAF = global.cancelAnimationFrame;
        global.requestAnimationFrame = (cb) => {
            cb(16);
            return 1;
        };
        global.cancelAnimationFrame = jest.fn();
    });

    afterEach(() => {
        global.requestAnimationFrame = originalRAF;
        global.cancelAnimationFrame = originalCAF;
        document.body.innerHTML = '';
    });

    it('should correctly calculate beta and align time ranges', async () => {
        const { transactionState } = require('@js/transactions/state.js');
        const { drawBetaChart } = require('@js/transactions/chart/renderers/beta.js');

        // Create some mock data
        // We need at least 126+1 points for a 6-month rolling window (126 returns)
        const dates = [];
        const lzValues = [];
        const gspcValues = [];

        let lzVal = 100;
        let gspcVal = 100;

        for (let i = 0; i < 200; i++) {
            const date = new Date(2023, 0, i + 1).toISOString().split('T')[0];
            dates.push(date);
            // LZ follows GSPC with some noise but mostly 1.2x returns
            const dailyRet = (Math.random() - 0.5) * 0.01;
            gspcVal *= 1 + dailyRet;
            lzVal *= 1 + dailyRet * 1.2;

            lzValues.push({ date, value: lzVal });
            gspcValues.push({ date, value: gspcVal });
        }

        // Add some extra leading history to GSPC to test range alignment
        const gspcWithLead = [
            { date: '2022-01-01', value: 50 },
            { date: '2022-06-01', value: 75 },
            ...gspcValues,
        ];

        transactionState.performanceSeries = {
            '^LZ': lzValues,
            '^GSPC': gspcWithLead,
        };
        transactionState.chartVisibility = {
            '^LZ': true,
            '^GSPC': true,
        };
        transactionState.selectedCurrency = 'USD';

        const mockCtx = {
            canvas: { offsetWidth: 1000, offsetHeight: 500, width: 1000, height: 500 },
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fill: jest.fn(),
            closePath: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            setLineDash: jest.fn(),
            createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
            createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
            fillText: jest.fn(),
            measureText: jest.fn(() => ({ width: 10 })),
            arc: jest.fn(),
            rect: jest.fn(),
            roundRect: jest.fn(),
            drawImage: jest.fn(),
            clearRect: jest.fn(),
            scale: jest.fn(),
            setTransform: jest.fn(),
        };

        const mockChartManager = { redraw: jest.fn(), update: jest.fn() };

        await drawBetaChart(mockCtx, mockChartManager, 0);

        const { chartLayouts } = require('@js/transactions/chart/state.js');
        const betaLayout = chartLayouts.beta;

        expect(betaLayout).not.toBeNull();

        // Find portfolio and GSPC series in layout
        const lzSeries = betaLayout.series.find((s) => s.key === '^LZ');
        const gspcSeries = betaLayout.series.find((s) => s.key === '^GSPC');

        expect(lzSeries).toBeDefined();
        expect(gspcSeries).toBeDefined();

        // Latest GSPC beta must be exactly 1.0
        const latestGspcBeta = gspcSeries.getValueAtTime(betaLayout.maxTime);
        expect(latestGspcBeta).toBeCloseTo(1.0, 5);

        // Portfolio beta should be around 1.2
        const latestLzBeta = lzSeries.getValueAtTime(betaLayout.maxTime);
        expect(latestLzBeta).toBeGreaterThan(1.0);
        expect(latestLzBeta).toBeLessThan(1.5);

        // Time range verification
        // Intersection starts 2023-01-01. Rolling 126 days later should be the minTime.
        expect(betaLayout.minTime).toBeGreaterThanOrEqual(new Date('2023-01-01').getTime());
    });
});
