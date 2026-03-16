/* global KeyboardEvent */
import { jest } from '@jest/globals';

// Mock zoom
jest.mock('@js/transactions/zoom.js', () => ({
    toggleZoom: jest.fn().mockResolvedValue({ zoomed: false, message: 'Mock Zoomed Out' }),
    getZoomState: jest.fn(),
}));

jest.mock('@js/transactions/terminalStats.js', () => {
    const original = jest.requireActual('@js/transactions/terminalStats.js');
    return {
        ...original,
        getStatsText: jest.fn(),
        getDynamicStatsText: jest.fn(),
    };
});

let transactionState;

function resetTransactionState() {
    transactionState = require('@js/transactions/state.js').transactionState;
    transactionState.commandHistory = [];
    transactionState.historyIndex = -1;
    transactionState.activeChart = null;
    transactionState.chartDateRange = { from: null, to: null };
    transactionState.runningAmountSeries = [
        { tradeDate: '2024-01-01', amount: 0, netAmount: 0 },
        { tradeDate: '2024-02-01', amount: 100, netAmount: 100 },
    ];
    transactionState.portfolioSeries = [
        { date: '2024-01-01', value: 1000 },
        { date: '2024-02-01', value: 1100 },
    ];
    transactionState.runningAmountSeriesByCurrency = {};
    transactionState.portfolioSeriesByCurrency = {};
    // Simplified reset
    transactionState.selectedCurrency = 'USD';
    transactionState.currencySymbol = '$';
    transactionState.filteredTransactions = [];
    transactionState.allTransactions = [];
    transactionState.fxRatesByCurrency = {};
    transactionState.historicalPrices = {};
    transactionState.showChartLabels = true;
    return transactionState;
}

function setupDom({ tableVisible = false } = {}) {
    const tableClass = tableVisible ? '' : 'is-hidden';
    document.body.innerHTML = `
        <div id="terminal">
            <div id="terminalOutput"></div>
            <div class="terminal-prompt">
                <input type="text" id="terminalInput" />
            </div>
        </div>
        <section id="runningAmountSection" class="is-hidden"></section>
        <div class="table-responsive-container ${tableClass}">
            <table>
                <tbody id="transactionBody"></tbody>
            </table>
        </div>
    `;
}

function initTerminalSession({
    tableVisible = false,
    chartManager: providedChartManager = null,
    setupState,
} = {}) {
    const filterAndSort = jest.fn();
    const toggleTable = jest.fn();
    const closeAllFilterDropdowns = jest.fn();
    const resetSortState = jest.fn();

    setupDom({ tableVisible });
    const localState = resetTransactionState();
    if (typeof setupState === 'function') {
        setupState(localState);
    }

    const chartManager = providedChartManager || {
        update: jest.fn(),
        redraw: jest.fn(),
    };

    if (!global.requestAnimationFrame) {
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    }

    const { initTerminal } = require('@js/transactions/terminal.js');
    initTerminal({
        filterAndSort,
        toggleTable,
        closeAllFilterDropdowns,
        resetSortState,
        chartManager,
    });

    const submitCommand = async (command) => {
        const input = document.getElementById('terminalInput');
        input.value = command;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
    };

    return {
        submitCommand,
        filterAndSort,
        chartManager,
        toggleTable,
        closeAllFilterDropdowns,
        resetSortState,
    };
}

function getLastTerminalMessage() {
    const output = document.querySelector('#terminalOutput pre:last-child');
    return output ? output.textContent : '';
}

describe('plot command chart toggling', () => {
    let session;
    let chartSection;

    beforeEach(() => {
        jest.resetModules();
        session = initTerminalSession();
        chartSection = document.getElementById('runningAmountSection');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    const toggleCases = [
        ['balance', 'contribution', 'Hidden contribution chart.'],
        ['performance', 'performance', 'Hidden performance chart.'],
        ['composition', 'composition', 'Hidden composition chart.'],
        ['sectors', 'sectors', 'Hidden sector allocation chart.'],
        ['geography', 'geography', 'Hidden geography chart.'],
        ['fx', 'fx', 'Hidden FX chart.'],
        ['drawdown', 'drawdown', 'Hidden drawdown chart.'],
        ['concentration', 'concentration', 'Hidden concentration chart.'],
        ['pe', 'pe', 'Hidden P/E ratio chart.'],
        ['rolling', 'rolling', 'Hidden 1-Year rolling returns chart.'],
        ['volatility', 'volatility', 'Hidden 90-Day annualized rolling volatility chart.'],
        ['beta', 'beta', 'Hidden portfolio beta chart.'],
        ['yield', 'yield', 'Hidden dividend yield and income chart.']
    ];

    test.each(toggleCases)(
        'toggles off %s chart when already active without date args',
        async (commandArgs, expectedChartState, expectedMessage) => {
            const stateLocal = require('@js/transactions/state.js').transactionState;
            const command = `plot ${commandArgs}`;

            // Ensure section has a clean start for visibility toggle test
            chartSection.classList.add('is-hidden');

            // First call activates the chart
            await session.submitCommand(command);
            expect(stateLocal.activeChart).toBe(expectedChartState);
            expect(chartSection.classList.contains('is-hidden')).toBe(false);

            // Second call toggles it off
            await session.submitCommand(command);
            expect(stateLocal.activeChart).toBe(null);
            expect(chartSection.classList.contains('is-hidden')).toBe(true);
            expect(getLastTerminalMessage()).toContain(expectedMessage);
        }
    );
});

describe('plot command date range handling', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    test('retains active date filter across chart toggles', async () => {
        const session = initTerminalSession();
        const localState = require('@js/transactions/state.js').transactionState;

        await session.submitCommand('plot balance 2025');
        expect(localState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });

        await session.submitCommand('plot composition');
        expect(localState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });

        await session.submitCommand('plot performance');
        expect(localState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });

        await session.submitCommand('plot fx');
        expect(localState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });
        expect(getLastTerminalMessage()).toContain('Showing FX chart (base USD) for 2025.');
    }, 30000);

    test('allows explicit reset via special tokens', async () => {
        const session = initTerminalSession();
        const localState = require('@js/transactions/state.js').transactionState;

        await session.submitCommand('plot balance 2025');
        expect(localState.chartDateRange.from).toBe('2025-01-01');

        // Reset chart visibility before testing composition to avoid toggle behavior
        const chartSection = document.getElementById('runningAmountSection');
        if (chartSection) {
            chartSection.classList.add('is-hidden');
        }
        localState.activeChart = null;

        await session.submitCommand('plot composition all');
        expect(localState.chartDateRange).toEqual({ from: null, to: null });
        expect(getLastTerminalMessage()).toContain('Showing composition chart for all time.');
    }, 30000);

    test('ignores unrecognized date tokens and keeps existing range', async () => {
        const session = initTerminalSession();
        const localState = require('@js/transactions/state.js').transactionState;

        await session.submitCommand('plot balance 2025');

        await session.submitCommand('plot composition someday');
        expect(localState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });
        expect(getLastTerminalMessage()).toContain('Showing composition chart for 2025.');
    }, 30000);
});
