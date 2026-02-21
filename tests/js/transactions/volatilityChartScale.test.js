import { jest } from '@jest/globals';

describe('Volatility Chart Scaling', () => {
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
            createRadialGradient: jest.fn(() => ({
                addColorStop: jest.fn(),
            })),
        };

        // Mock document.createElement for offscreen canvas
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

    test('volatility chart should have a negative yMin buffer to keep 0% visible', async () => {
        const { transactionState } = require('@js/transactions/state.js');
        const { drawVolatilityChart } = require('@js/transactions/chart/renderers/volatility.js');
        const core = require('@js/transactions/chart/core.js');

        // Spy on drawAxes to inspect the scale parameters
        const drawAxesSpy = jest.spyOn(core, 'drawAxes');

        transactionState.performanceSeries = {
            '^LZ': [
                { date: '2024-01-01', value: 1.0 },
                { date: '2024-01-02', value: 1.01 },
                // ... need 91 points for volatility, but let's mock the data processing if needed
                // or just provide enough dummy data
            ],
        };
        // Fill up to 95 points so volatility can be calculated
        for (let i = 2; i <= 95; i++) {
            transactionState.performanceSeries['^LZ'].push({
                date: `2024-01-${i < 10 ? '0' + i : i}`,
                value: 1.0 + i * 0.001,
            });
        }

        transactionState.chartVisibility = { '^LZ': true };
        transactionState.activeChart = 'volatility';
        transactionState.chartDateRange = { from: null, to: null };

        const mockChartManager = { redraw: jest.fn(), update: jest.fn() };

        await drawVolatilityChart(ctxStub, mockChartManager, 0);

        // Verify drawAxes was called
        expect(drawAxesSpy).toHaveBeenCalled();

        // The 7th argument to drawAxes is yMin
        const yMinCalled = drawAxesSpy.mock.calls[0][6];
        const yMaxCalled = drawAxesSpy.mock.calls[0][7];

        // Check if yMin is less than 0 (the buffer we added)
        expect(yMinCalled).toBeLessThan(0);
        expect(yMaxCalled).toBeGreaterThan(0);
    });
});
