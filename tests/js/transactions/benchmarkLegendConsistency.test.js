import { jest } from '@jest/globals';

describe('Benchmark Legend Consistency Tests', () => {
    jest.setTimeout(10000);
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

    const benchmarkChartTypes = ['performance', 'drawdown', 'rolling', 'volatility', 'beta'];

    benchmarkChartTypes.forEach((chartType) => {
        test(`legend clicks in ${chartType} chart toggle benchmarks as radio buttons`, async () => {
            const { transactionState } = require('@js/transactions/state.js');
            const { updateLegend } = require('@js/transactions/chart/interaction.js');

            transactionState.activeChart = chartType;

            // Initialize visibility state
            // ^LZ should be portfolio, others are benchmarks
            transactionState.chartVisibility = {
                '^LZ': true,
                '^GSPC': true,
                '^IXIC': false,
                '^DJI': false,
            };

            const mockChartManager = {
                redraw: jest.fn(),
            };

            const series = [
                { key: '^LZ', name: 'Portfolio', color: 'gold' },
                { key: '^GSPC', name: 'S&P 500', color: 'blue' },
                { key: '^IXIC', name: 'Nasdaq', color: 'red' },
                { key: '^DJI', name: 'Dow Jones', color: 'green' },
            ];

            document.body.innerHTML = '<div class="chart-legend"></div>';

            // Initial render of legend
            updateLegend(series, mockChartManager);

            const getLegendItem = (key) =>
                document.querySelector(`.legend-item[data-series="${key}"]`);

            const gspcItem = getLegendItem('^GSPC');
            const ixicItem = getLegendItem('^IXIC');
            const lzItem = getLegendItem('^LZ');

            expect(gspcItem).not.toBeNull();
            expect(ixicItem).not.toBeNull();
            expect(lzItem).not.toBeNull();

            // 1. Portfolio (^LZ) should not be toggleable
            lzItem.dispatchEvent(new Event('click', { bubbles: true }));
            expect(transactionState.chartVisibility['^LZ']).toBe(true);
            expect(mockChartManager.redraw).not.toHaveBeenCalled();

            // 2. Click a disabled benchmark (^IXIC)
            // It should become enabled, and the previously enabled benchmark (^GSPC) should become disabled
            ixicItem.dispatchEvent(new Event('click', { bubbles: true }));

            expect(transactionState.chartVisibility['^IXIC']).toBe(true);
            expect(transactionState.chartVisibility['^GSPC']).toBe(false);
            expect(transactionState.chartVisibility['^LZ']).toBe(true); // Portfolio stays visible
            expect(mockChartManager.redraw).toHaveBeenCalled();
            mockChartManager.redraw.mockClear();

            // 3. Click the same benchmark again (^IXIC)
            // It should toggle off, leaving only the portfolio visible (or behave as radio button)
            // Current interaction.js logic: benchmarks.includes(s.key) => toggles current, hides others.
            // If it was already on, toggle off makes it off, and others were already off.
            ixicItem.dispatchEvent(new Event('click', { bubbles: true }));
            expect(transactionState.chartVisibility['^IXIC']).toBe(false);
            expect(transactionState.chartVisibility['^GSPC']).toBe(false);
            expect(transactionState.chartVisibility['^LZ']).toBe(true);

            // 4. Click a different benchmark (^DJI)
            const djiItem = getLegendItem('^DJI');
            djiItem.dispatchEvent(new Event('click', { bubbles: true }));
            expect(transactionState.chartVisibility['^DJI']).toBe(true);
            expect(transactionState.chartVisibility['^IXIC']).toBe(false);
            expect(transactionState.chartVisibility['^GSPC']).toBe(false);
        });
    });
});
