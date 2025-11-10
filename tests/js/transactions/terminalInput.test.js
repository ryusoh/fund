/* global KeyboardEvent */
import { jest } from '@jest/globals';
import { initTerminal } from '@js/transactions/terminal.js';
import { transactionState } from '@js/transactions/state.js';
import { CURRENCY_SYMBOLS } from '@js/config.js';

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
            tradeDate: '2024-02-01',
            orderType: 'Buy',
            security: 'TEST',
            quantity: 1,
            price: 100,
            netAmount: 100,
        },
    ];
    transactionState.filteredTransactions = [...transactionState.allTransactions];
    transactionState.splitHistory = [];
    transactionState.selectedCurrency = 'USD';
    transactionState.currencySymbol = '$';
    transactionState.fxRatesByCurrency = {};
    transactionState.historicalPrices = {};
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

async function submitCommand(command, { activeChart = null, currency = 'USD' } = {}) {
    const filterAndSort = jest.fn();
    const toggleTable = jest.fn();
    const closeAllFilterDropdowns = jest.fn();
    const resetSortState = jest.fn();
    const chartManager = { update: jest.fn() };

    setupDom();
    resetTransactionState();
    transactionState.activeChart = activeChart;
    const normalizedCurrency = typeof currency === 'string' ? currency.toUpperCase() : 'USD';
    transactionState.selectedCurrency = normalizedCurrency;
    transactionState.currencySymbol =
        CURRENCY_SYMBOLS[normalizedCurrency] || CURRENCY_SYMBOLS.USD || '$';

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
    test('plot balance clears the prompt for non-USD currency', async () => {
        const value = await submitCommand('plot balance', { currency: 'CNY' });
        expect(value).toBe('');
    });

    test('year shortcut clears prompt when contribution chart is active', async () => {
        const value = await submitCommand('2025', { activeChart: 'contribution', currency: 'CNY' });
        expect(value).toBe('');
    });
});
