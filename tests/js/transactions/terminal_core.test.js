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
    transactionState.compositionFilterTickers = [];
    transactionState.compositionAssetClassFilter = null;
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
    beforeEach(() => {
        jest.resetModules();
    });

    test('rejects date filters when transaction table is hidden', async () => {
        // Need to run session to initialize state first
        await runCommand('dummy', { tableVisible: false }); // Or just use runCommand('2025') directly, but expectations depend on state

        // Actually runCommand initializes state.

        await runCommand('2025', { tableVisible: false });

        // We need to access the session's filterAndSort?
        // runCommand returns it. But we didn't capture it above.
        // Let's rewrite the test to capture returns.

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

describe('label command', () => {
    beforeEach(() => {
        jest.resetModules();
    });

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
    let chartManagerMock;

    beforeEach(() => {
        jest.resetModules();
        chartManagerMock = { update: jest.fn(), redraw: jest.fn() };
    });

    it('removes ticker filters and refreshes chart', async () => {
        const session = initTerminalSession({
            chartManager: chartManagerMock,
            setupState: (state) => {
                state.compositionFilterTickers = ['ANET', 'GOOG'];
                state.compositionAssetClassFilter = 'stock';
                state.activeChart = 'composition';
            },
        });

        // Ensure chart is visible in DOM
        document.getElementById('runningAmountSection').classList.remove('is-hidden');

        await session.submitCommand('allstock');

        expect(session.filterAndSort).toHaveBeenCalledWith('');
        expect(chartManagerMock.update).toHaveBeenCalled();
        expect(transactionState.compositionFilterTickers).toEqual([]);
        expect(transactionState.compositionAssetClassFilter).toBeNull();
    });
});
