/* global KeyboardEvent */
import { jest } from '@jest/globals';

// Mock zoom module functions since they are imported by terminal.js
jest.mock('@js/transactions/zoom.js', () => ({
    toggleZoom: jest.fn().mockResolvedValue({ zoomed: false, message: 'Mock Zoomed Out' }),
    getZoomState: jest.fn(),
}));

jest.mock('@js/transactions/terminalStats.js', () => {
    const original = jest.requireActual('@js/transactions/terminalStats.js');
    return {
        ...original,
        getStatsText: jest.fn(),
    };
});

import { initTerminal } from '@js/transactions/terminal.js';
import { transactionState } from '@js/transactions/state.js';
import { toggleZoom, getZoomState } from '@js/transactions/zoom.js';
import { getStatsText } from '@js/transactions/terminalStats.js';

function resetTransactionState() {
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
    transactionState.allTransactions = [
        {
            transactionId: 1,
            tradeDate: '2024-01-01',
            orderType: 'Buy',
            security: 'AAA',
            quantity: 1,
            price: 100,
            netAmount: 100,
        },
        {
            transactionId: 2,
            tradeDate: '2025-01-01',
            orderType: 'Buy',
            security: 'BBB',
            quantity: 1,
            price: 200,
            netAmount: 200,
        },
    ];
    transactionState.filteredTransactions = [...transactionState.allTransactions];
    transactionState.splitHistory = [];
    transactionState.selectedCurrency = 'USD';
    transactionState.currencySymbol = '$';
    transactionState.fxRatesByCurrency = {};
    transactionState.historicalPrices = {};
    transactionState.showChartLabels = true;
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
    resetTransactionState();
    if (typeof setupState === 'function') {
        setupState(transactionState);
    }

    const chartManager = providedChartManager || {
        update: jest.fn(),
        redraw: jest.fn(),
    };

    if (!global.requestAnimationFrame) {
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    }

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

async function runCommand(
    command,
    { tableVisible = false, chartManager: providedChartManager = null, setupState } = {}
) {
    const session = initTerminalSession({
        tableVisible,
        chartManager: providedChartManager,
        setupState,
    });
    await session.submitCommand(command);
    return {
        filterAndSort: session.filterAndSort,
        chartManager: session.chartManager,
        toggleTable: session.toggleTable,
        closeAllFilterDropdowns: session.closeAllFilterDropdowns,
        resetSortState: session.resetSortState,
    };
}

function getLastTerminalMessage() {
    const output = document.querySelector('#terminalOutput pre:last-child');
    return output ? output.textContent : '';
}

describe('terminal date filters respect table visibility', () => {
    test('rejects date filters when transaction table is hidden', async () => {
        expect(transactionState.chartDateRange).toEqual({ from: null, to: null });
        const { filterAndSort } = await runCommand('2025', { tableVisible: false });

        expect(filterAndSort).not.toHaveBeenCalled();
        expect(transactionState.chartDateRange).toEqual({ from: null, to: null });
        expect(getLastTerminalMessage()).toContain('Transaction table is hidden');
    });

    test('applies date filters when transaction table is visible', async () => {
        const { filterAndSort } = await runCommand('2025', { tableVisible: true });

        expect(filterAndSort).toHaveBeenCalledTimes(1);
        expect(filterAndSort).toHaveBeenCalledWith('');
        expect(transactionState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });
        expect(getLastTerminalMessage()).toContain(
            'Applied date filter 2025 to transactions table.'
        );
    });
});

describe('plot command date range handling', () => {
    test('retains active date filter across chart toggles', async () => {
        const session = initTerminalSession();

        await session.submitCommand('plot balance 2025');
        expect(transactionState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });

        await session.submitCommand('plot composition');
        expect(transactionState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });

        await session.submitCommand('plot performance');
        expect(transactionState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });

        await session.submitCommand('plot fx');
        expect(transactionState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });
        expect(getLastTerminalMessage()).toContain('Showing FX chart (base USD) for 2025.');
    });

    test('allows explicit reset via special tokens', async () => {
        const session = initTerminalSession();

        await session.submitCommand('plot balance 2025');
        expect(transactionState.chartDateRange.from).toBe('2025-01-01');

        await session.submitCommand('plot composition all');
        expect(transactionState.chartDateRange).toEqual({ from: null, to: null });
        expect(getLastTerminalMessage()).toContain('Showing composition chart for all time.');
    });

    test('ignores unrecognized date tokens and keeps existing range', async () => {
        const session = initTerminalSession();
        await session.submitCommand('plot balance 2025');

        await session.submitCommand('plot composition someday');
        expect(transactionState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });
        expect(getLastTerminalMessage()).toContain('Showing composition chart for 2025.');
    });
});

describe('label command', () => {
    test('turns chart labels off and requests redraw', async () => {
        const chartManager = { update: jest.fn(), redraw: jest.fn() };
        await runCommand('label', { chartManager });

        expect(transactionState.showChartLabels).toBe(false);
        expect(chartManager.redraw).toHaveBeenCalledTimes(1);
        expect(getLastTerminalMessage()).toContain('Chart labels are now hidden.');
    });

    test('turns chart labels back on when already hidden', async () => {
        const chartManager = { update: jest.fn(), redraw: jest.fn() };
        await runCommand('label', {
            chartManager,
            setupState: (state) => {
                state.showChartLabels = false;
            },
        });

        expect(transactionState.showChartLabels).toBe(true);
        expect(chartManager.redraw).toHaveBeenCalledTimes(1);
        expect(getLastTerminalMessage()).toContain('Chart labels are now visible.');
    });
});

describe('allstock command clears ticker filters', () => {
    let initTerminal, transactionState, filterAndSortMock, chartManagerMock;

    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = `
            <div id="terminal">
                <div id="terminalOutput"></div>
                <div class="terminal-prompt">
                    <input type="text" id="terminalInput" />
                </div>
            </div>
            <section id="runningAmountSection"></section>
            <div class="table-responsive-container">
                <table>
                    <tbody id="transactionBody"></tbody>
                </table>
            </div>
        `;

        jest.isolateModules(() => {
            ({ initTerminal } = require('@js/transactions/terminal.js'));
            ({ transactionState } = require('@js/transactions/state.js'));
        });

        transactionState.activeFilterTerm = 'anet goog stock';
        transactionState.compositionFilterTickers = ['ANET', 'GOOG'];
        transactionState.compositionAssetClassFilter = 'stock';
        transactionState.filteredTransactions = [
            { transactionId: 1, tradeDate: '2024-01-01', orderType: 'Buy', security: 'ANET' },
        ];
        filterAndSortMock = jest.fn();
        chartManagerMock = { update: jest.fn(), redraw: jest.fn() };
    });

    it('removes ticker filters and refreshes chart', async () => {
        initTerminal({
            filterAndSort: filterAndSortMock,
            toggleTable: jest.fn(),
            closeAllFilterDropdowns: jest.fn(),
            resetSortState: jest.fn(),
            chartManager: chartManagerMock,
        });

        await initTerminal({
            filterAndSort: filterAndSortMock,
            toggleTable: jest.fn(),
            closeAllFilterDropdowns: jest.fn(),
            resetSortState: jest.fn(),
            chartManager: chartManagerMock,
        }).processCommand('allstock');

        expect(filterAndSortMock).toHaveBeenCalledWith('');
        expect(chartManagerMock.update).toHaveBeenCalled();
        expect(transactionState.compositionFilterTickers).toEqual([]);
        expect(transactionState.compositionAssetClassFilter).toBeNull();
    });
});

describe('terminal plot command integration', () => {
    let terminalInput;

    beforeEach(() => {
        // Reset mocks
        toggleZoom.mockClear();
        getZoomState.mockReset();
        getZoomState.mockReturnValue(false);

        // Setup DOM
        document.body.innerHTML = `
            <div id="terminalOutput"></div>
            <input id="terminalInput" type="text" />
            <div class="table-responsive-container"></div>
            <div id="runningAmountSection" class="chart-card is-hidden"></div>
            <div id="performanceSection" class="chart-card is-hidden"></div>
        `;
        terminalInput = document.getElementById('terminalInput');

        // Initialize terminal
        initTerminal({
            filterAndSort: jest.fn(),
            toggleTable: jest.fn(),
            closeAllFilterDropdowns: jest.fn(),
            resetSortState: jest.fn(),
            chartManager: { update: jest.fn() },
            onCommandExecuted: jest.fn(),
        });
    });

    test('plot command triggers un-zoom if terminal is currently zoomed', async () => {
        // Simulate zoomed state
        getZoomState.mockReturnValue(true);

        // Execute plot command
        const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
        terminalInput.value = 'plot balance';
        terminalInput.dispatchEvent(enterEvent);

        // Wait a bit for async processing
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(toggleZoom).toHaveBeenCalled();
    });

    test('plot command does not trigger un-zoom if terminal is not zoomed', async () => {
        // Simulate not zoomed state
        getZoomState.mockReturnValue(false);

        // Execute plot command
        const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
        terminalInput.value = 'plot balance';
        terminalInput.dispatchEvent(enterEvent);

        // Wait a bit for async processing
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(toggleZoom).not.toHaveBeenCalled();
    });
    test('transaction command triggers un-zoom if terminal is currently zoomed', async () => {
        // Simulate zoomed state
        getZoomState.mockReturnValue(true);

        // Execute transaction command
        const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
        terminalInput.value = 'transaction';
        terminalInput.dispatchEvent(enterEvent);

        // Wait a bit for async processing
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(toggleZoom).toHaveBeenCalled();
    });

    test('transaction command shows stats summary', async () => {
        // Mock getStatsText response
        getStatsText.mockResolvedValue('\nTRANSACTION STATS\n(Mocked: 123)');

        // Re-initialize terminal to use the mocked fetch
        initTerminal({
            filterAndSort: jest.fn(),
            toggleTable: jest.fn(),
            closeAllFilterDropdowns: jest.fn(),
            resetSortState: jest.fn(),
            chartManager: { update: jest.fn() },
            onCommandExecuted: jest.fn(),
        });

        const terminalInput = document.getElementById('terminalInput');
        const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
        terminalInput.value = 'transaction';
        terminalInput.dispatchEvent(enterEvent);

        // Wait for async command processing
        await new Promise((resolve) => setTimeout(resolve, 50));

        const output = getLastTerminalMessage();
        // Checks that we get some table visibility message and the stats
        expect(output).toMatch(/(Showing|Toggled) transaction table/);
        expect(output).toContain('TRANSACTION STATS');
        expect(output).toContain('(Mocked: 123)');
    });

    test('summary command shows transaction stats when table is visible', async () => {
        // Mock getStatsText
        getStatsText.mockResolvedValue('\nTRANSACTION STATS\n(Mocked: 999)');

        initTerminal({
            filterAndSort: jest.fn(),
            toggleTable: jest.fn(),
            closeAllFilterDropdowns: jest.fn(),
            resetSortState: jest.fn(),
            chartManager: {
                update: jest.fn(),
                getSummary: jest.fn().mockReturnValue('Unwanted Chart Summary'),
            },
            onCommandExecuted: jest.fn(),
        });

        // Show the table first
        const terminalInput = document.getElementById('terminalInput');
        terminalInput.value = 'transaction';
        terminalInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Now run summary
        terminalInput.value = 'summary';
        terminalInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await new Promise((resolve) => setTimeout(resolve, 50));

        const output = getLastTerminalMessage();
        expect(output).toContain('TRANSACTION STATS');
        expect(output).toContain('(Mocked: 999)');
        expect(output).not.toContain('Unwanted Chart Summary');
    });

    test('filter command (e.g., "all") shows transaction stats when table is visible', async () => {
        // Mock getStatsText
        getStatsText.mockResolvedValue('\nTRANSACTION STATS\n(Mocked: 50)');

        initTerminal({
            filterAndSort: jest.fn(),
            toggleTable: jest.fn(),
            closeAllFilterDropdowns: jest.fn(),
            resetSortState: jest.fn(),
            chartManager: {
                update: jest.fn(),
                getSummary: jest.fn().mockReturnValue('Unwanted Chart Summary'),
            },
            onCommandExecuted: jest.fn(),
        });

        // Ensure table is visible first
        const terminalInput = document.getElementById('terminalInput');
        terminalInput.value = 'transaction';
        terminalInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Submit filter command "all"
        terminalInput.value = 'all';
        terminalInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await new Promise((resolve) => setTimeout(resolve, 50));

        const output = getLastTerminalMessage();
        expect(output).toContain('Showing all data');
        expect(output).toContain('TRANSACTION STATS');
        expect(output).toContain('(Mocked: 50)');
        expect(output).not.toContain('Unwanted Chart Summary');
    });
});
