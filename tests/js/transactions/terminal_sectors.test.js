import { jest } from '@jest/globals';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Terminal Sectors Command', () => {
    jest.setTimeout(10000);
    let originalFetch;
    let fetchMock;

    beforeEach(() => {
        global.HTMLCanvasElement = global.HTMLCanvasElement || class {};
        jest.resetModules();

        originalFetch = global.fetch;
        fetchMock = jest.fn((url) => {
            if (url.includes('sectors.json')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        dates: ['2024-01-01', '2024-01-02'],
                        total_values: [1000, 1100],
                        series: {
                            Technology: [60, 65],
                            Financials: [40, 35],
                        },
                    }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: async () => ({}),
            });
        });
        global.fetch = fetchMock;

        document.body.innerHTML = `
            <div id="runningAmountSection"></div>
            <div id="runningAmountEmpty"></div>
            <div class="chart-legend"></div>
            <div class="table-responsive-container"></div>
            <canvas id="runningAmountCanvas" width="600" height="400"></canvas>
        `;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        document.body.innerHTML = '';
    });

    test('plot sectors command updates state and shows section', async () => {
        const { transactionState } = require('@js/transactions/state.js');
        const { handlePlotCommand } = require('@js/transactions/terminal/handlers/plot.js');

        const mockAppendMessage = jest.fn();
        const mockChartManager = { update: jest.fn() };

        await handlePlotCommand(['sectors'], {
            appendMessage: mockAppendMessage,
            chartManager: mockChartManager,
        });

        expect(transactionState.activeChart).toBe('sectors');
        const section = document.getElementById('runningAmountSection');
        expect(section.classList.contains('is-hidden')).toBe(false);

        // Should show summary
        await flushPromises();
        expect(mockAppendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Showing sector allocation chart')
        );
        expect(mockAppendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Sectors (2024-01-02):')
        );
        expect(mockAppendMessage).toHaveBeenCalledWith(expect.stringContaining('Technology'));
        expect(mockAppendMessage).toHaveBeenCalledWith(expect.stringContaining('Financials'));
    });

    test('plot sectors abs command updates state to sectorsAbs', async () => {
        const { transactionState } = require('@js/transactions/state.js');
        const { handlePlotCommand } = require('@js/transactions/terminal/handlers/plot.js');

        const mockAppendMessage = jest.fn();
        const mockChartManager = { update: jest.fn() };

        await handlePlotCommand(['sectors', 'abs'], {
            appendMessage: mockAppendMessage,
            chartManager: mockChartManager,
        });

        expect(transactionState.activeChart).toBe('sectorsAbs');
        await flushPromises();
        expect(mockAppendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Showing sector allocation (absolute) chart')
        );
        expect(mockAppendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Sectors Abs (2024-01-02):')
        );
    });

    test('abs and per commands switch between sector views', async () => {
        const { transactionState } = require('@js/transactions/state.js');
        const {
            handleAbsCommand,
            handlePercentageCommand,
        } = require('@js/transactions/terminal/handlers/misc.js');

        const mockAppendMessage = jest.fn();
        const mockChartManager = { update: jest.fn() };

        // 1. Initial state: sectors
        transactionState.activeChart = 'sectors';
        const section = document.getElementById('runningAmountSection');
        section.classList.remove('is-hidden');

        // 2. Switch to ABS
        await handleAbsCommand([], {
            appendMessage: mockAppendMessage,
            chartManager: mockChartManager,
        });

        expect(transactionState.activeChart).toBe('sectorsAbs');
        expect(mockAppendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Switched sector allocation chart to absolute view')
        );
        expect(mockChartManager.update).toHaveBeenCalled();
        mockAppendMessage.mockClear();

        // 3. Switch to PER
        await handlePercentageCommand([], {
            appendMessage: mockAppendMessage,
            chartManager: mockChartManager,
        });

        expect(transactionState.activeChart).toBe('sectors');
        expect(mockAppendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Switched sector allocation chart to percentage view')
        );
    });
});
