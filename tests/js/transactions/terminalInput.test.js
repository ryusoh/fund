/* global KeyboardEvent */
import { jest } from '@jest/globals';
import { initTerminal } from '@js/transactions/terminal.js';
import { transactionState } from '@js/transactions/state.js';

function resetTransactionState() {
    transactionState.commandHistory = [];
    transactionState.historyIndex = -1;
    transactionState.activeChart = null;
    transactionState.chartDateRange = { from: null, to: null };
    transactionState.runningAmountSeries = [];
    transactionState.portfolioSeries = [];
    transactionState.runningAmountSeriesByCurrency = {};
    transactionState.portfolioSeriesByCurrency = {};
    transactionState.allTransactions = [];
    transactionState.filteredTransactions = [];
}

function setupDom() {
    document.body.innerHTML = `
        <div id="terminal">
            <div id="terminalOutput"></div>
            <div class="terminal-prompt">
                <input type="text" id="terminalInput" />
            </div>
        </div>
        <section id="runningAmountSection" class="is-hidden"></section>
        <div class="table-responsive-container is-hidden"></div>
    `;
}

async function submitCommand(command, { activeChart = null } = {}) {
    const filterAndSort = jest.fn();
    const toggleTable = jest.fn();
    const closeAllFilterDropdowns = jest.fn();
    const resetSortState = jest.fn();
    const chartManager = { update: jest.fn() };

    setupDom();
    resetTransactionState();
    transactionState.activeChart = activeChart;

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

    const input = document.getElementById('terminalInput');
    input.value = command;
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    input.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return input.value;
}

describe('terminal input clearing', () => {
    test('plot performance command clears the prompt', async () => {
        const value = await submitCommand('plot performance');
        expect(value).toBe('');
    });

    test('year shortcut clears prompt when a chart is active', async () => {
        const value = await submitCommand('2025', { activeChart: 'performance' });
        expect(value).toBe('');
    });
});
