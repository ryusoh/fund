import { jest } from '@jest/globals';

describe('Contribution chart legend toggles', () => {
    let originalRAF;
    let originalCAF;
    let originalGetContext;

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
        originalGetContext = global.HTMLCanvasElement.prototype.getContext;
    });

    afterEach(() => {
        if (originalRAF) {
            global.requestAnimationFrame = originalRAF;
        } else {
            delete global.requestAnimationFrame;
        }
        if (originalCAF) {
            global.cancelAnimationFrame = originalCAF;
        } else {
            delete global.cancelAnimationFrame;
        }
        global.HTMLCanvasElement.prototype.getContext = originalGetContext;
        document.body.innerHTML = '';
    });

    test('legend clicks toggle contribution visibility', () => {
        const { ANIMATED_LINE_SETTINGS } = require('../../js/config.js');
        ANIMATED_LINE_SETTINGS.enabled = false;
        ANIMATED_LINE_SETTINGS.charts.contribution.enabled = false;
        ANIMATED_LINE_SETTINGS.charts.performance.enabled = false;

        const { transactionState } = require('../../js/transactions/state.js');
        const { createChartManager } = require('../../js/transactions/chart.js');

        transactionState.activeChart = 'contribution';
        transactionState.chartVisibility = {
            contribution: true,
            balance: true,
            buy: true,
            sell: true,
        };
        transactionState.chartDateRange = { from: null, to: null };
        transactionState.runningAmountSeries = [
            { tradeDate: '2024-01-01', orderType: 'buy', amount: 100, netAmount: 500 },
            { tradeDate: '2024-01-02', orderType: 'sell', amount: 120, netAmount: -300 },
        ];
        transactionState.portfolioSeries = [
            { date: '2024-01-01', value: 200 },
            { date: '2024-01-02', value: 210 },
        ];

        document.body.innerHTML = `
            <div id="runningAmountSection"></div>
            <div id="runningAmountEmpty"></div>
            <div class="chart-legend"></div>
            <canvas id="runningAmountCanvas" width="600" height="400"></canvas>
        `;

        const canvas = document.getElementById('runningAmountCanvas');
        Object.defineProperty(canvas, 'offsetWidth', { value: 600, configurable: true });
        Object.defineProperty(canvas, 'offsetHeight', { value: 400, configurable: true });

        const gradientStub = { addColorStop: jest.fn() };
        const ctxStub = {
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fill: jest.fn(),
            arc: jest.fn(),
            clearRect: jest.fn(),
            scale: jest.fn(),
            setTransform: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            setLineDash: jest.fn(),
            createLinearGradient: jest.fn(() => gradientStub),
            createRadialGradient: jest.fn(() => gradientStub),
            fillText: jest.fn(),
            measureText: jest.fn(() => ({ width: 10 })),
            roundRect: jest.fn(),
        };
        ctxStub.canvas = canvas;

        global.HTMLCanvasElement.prototype.getContext = jest.fn(() => ctxStub);

        const chartManager = createChartManager({
            buildRunningAmountSeries: () => transactionState.runningAmountSeries,
            buildPortfolioSeries: () => transactionState.portfolioSeries,
        });

        chartManager.redraw();

        let contributionLegend = document.querySelector(
            '.chart-legend .legend-item[data-series="contribution"]'
        );
        expect(contributionLegend).not.toBeNull();
        expect(transactionState.chartVisibility.contribution).toBe(true);

        contributionLegend.dispatchEvent(new Event('click', { bubbles: true }));

        contributionLegend = document.querySelector(
            '.chart-legend .legend-item[data-series="contribution"]'
        );
        expect(contributionLegend).not.toBeNull();
        expect(contributionLegend.classList.contains('legend-disabled')).toBe(true);
        expect(transactionState.chartVisibility.contribution).toBe(false);

        contributionLegend.dispatchEvent(new Event('click', { bubbles: true }));

        contributionLegend = document.querySelector(
            '.chart-legend .legend-item[data-series="contribution"]'
        );
        expect(contributionLegend.classList.contains('legend-disabled')).toBe(false);
        expect(transactionState.chartVisibility.contribution).toBe(true);
    });
});
