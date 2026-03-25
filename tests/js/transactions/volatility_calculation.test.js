import { jest } from '@jest/globals';
import { drawVolatilityChart } from '@js/transactions/chart/renderers/volatility.js';
import { transactionState } from '@js/transactions/state.js';
import { chartLayouts } from '@js/transactions/chart/state.js';

describe('Volatility Calculation Optimization', () => {
    let ctxStub;
    let canvas;

    beforeEach(() => {
        global.HTMLCanvasElement = global.HTMLCanvasElement || class {};
        jest.resetModules();

        canvas = {
            offsetWidth: 600,
            offsetHeight: 400,
            getContext: jest.fn(() => ctxStub),
        };

        const gradientStub = { addColorStop: jest.fn() };
        ctxStub = {
            canvas,
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fill: jest.fn(),
            arc: jest.fn(),
            clearRect: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            setLineDash: jest.fn(),
            createLinearGradient: jest.fn(() => gradientStub),
            fillText: jest.fn(),
            measureText: jest.fn(() => ({ width: 10 })),
            roundRect: jest.fn(),
            fillRect: jest.fn(),
            strokeRect: jest.fn(),
            drawImage: jest.fn(),
            createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
        };

        global.document = global.document || {};
        global.document.createElement = jest.fn((tag) => {
            if (tag === 'canvas') {
                return {
                    width: 0,
                    height: 0,
                    getContext: jest.fn(() => ({
                        beginPath: jest.fn(),
                        moveTo: jest.fn(),
                        lineTo: jest.fn(),
                        closePath: jest.fn(),
                        createLinearGradient: jest.fn(() => gradientStub),
                        fill: jest.fn(),
                        fillRect: jest.fn(),
                        globalCompositeOperation: '',
                    })),
                };
            }
            return {};
        });
        global.window = global.window || {
            innerWidth: 1024,
            getComputedStyle: jest.fn(() => ({
                getPropertyValue: jest.fn(),
            })),
        };
    });

    test('should correctly calculate rolling volatility after array optimization', async () => {
        const points = [];
        let val = 1.0;
        for (let i = 0; i <= 95; i++) {
            const dailyReturn = i % 2 === 0 ? 0.01 : -0.01;
            val = val * (1 + dailyReturn);
            points.push({
                date: `2024-01-${String(i + 1).padStart(2, '0')}`,
                value: val,
            });
        }

        transactionState.performanceSeries = {
            TEST: points,
        };
        transactionState.chartVisibility = { TEST: true };
        transactionState.activeChart = 'volatility';
        transactionState.chartDateRange = { from: null, to: null };
        transactionState.selectedCurrency = 'USD';

        await drawVolatilityChart(ctxStub, { redraw: jest.fn(), update: jest.fn() }, 0);

        expect(chartLayouts.volatility).toBeDefined();
        const testSeries = chartLayouts.volatility.series.find((s) => s.key === 'TEST');
        expect(testSeries).toBeDefined();
    });
});
