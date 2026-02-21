/* global KeyboardEvent */
import { jest } from '@jest/globals';

jest.setTimeout(15000);

// Mock essential modules
jest.mock('@js/transactions/zoom.js', () => ({
    toggleZoom: jest.fn().mockResolvedValue({ zoomed: false, message: 'Mock Zoomed Out' }),
    getZoomState: jest.fn().mockReturnValue(false),
}));

jest.mock('@js/transactions/terminalStats.js', () => ({
    getStatsText: jest.fn(),
    getDynamicStatsText: jest.fn(),
}));

jest.mock('@js/transactions/chart/renderers/yield.js', () => {
    return {
        loadYieldData: jest.fn(),
        drawYieldChart: jest.fn(),
    };
});

let transactionState;
let loadYieldDataMock;

function resetTransactionState() {
    transactionState = require('@js/transactions/state.js').transactionState;
    transactionState.commandHistory = [];
    transactionState.historyIndex = -1;
    transactionState.activeChart = null;
    transactionState.chartDateRange = { from: null, to: null };
    transactionState.selectedCurrency = 'USD';
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
        <div class="table-responsive-container is-hidden">
            <table><tbody id="transactionBody"></tbody></table>
        </div>
    `;
}

async function initTerminalSession() {
    setupDom();
    resetTransactionState();

    const chartManager = {
        update: jest.fn(),
        redraw: jest.fn(),
    };

    if (!global.requestAnimationFrame) {
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    }

    const { initTerminal } = require('@js/transactions/terminal.js');
    const { filterAndSort } = require('@js/transactions/table.js').initTable({
        onFilterChange: () => {},
    });

    initTerminal({
        filterAndSort,
        toggleTable: jest.fn(),
        closeAllFilterDropdowns: jest.fn(),
        resetSortState: jest.fn(),
        chartManager,
    });

    const submitCommand = async (command) => {
        const input = document.getElementById('terminalInput');
        input.value = command;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
    };

    return { submitCommand, chartManager };
}

function getLastTerminalMessage() {
    const outputs = document.querySelectorAll('#terminalOutput pre');
    return outputs.length > 0 ? outputs[outputs.length - 1].textContent : '';
}

describe('Yield Chart Terminal Integration', () => {
    const mockData = [
        { date: '2023-01-01', forward_yield: 1.5, ttm_income: 1000.0, market_value: 100000.0 },
        { date: '2023-06-01', forward_yield: 1.6, ttm_income: 1100.0, market_value: 110000.0 },
        { date: '2024-01-01', forward_yield: 1.8, ttm_income: 1200.0, market_value: 120000.0 },
    ];

    beforeEach(async () => {
        jest.resetModules();
        const yieldMod = await import('@js/transactions/chart/renderers/yield.js');
        loadYieldDataMock = yieldMod.loadYieldData;
        loadYieldDataMock.mockResolvedValue(mockData);
    });

    test('plot yield command updates snapshot summary', async () => {
        const session = await initTerminalSession();
        await session.submitCommand('plot yield');

        const message = getLastTerminalMessage();
        expect(message).toContain('Showing dividend yield and income chart');
        expect(message).toContain('Forward Yield: 1.80%');
        expect(message).toContain('Range: 1.50% - 1.80%');
        expect(message).toContain('TTM Dividend Income: $1,200.00');
    });

    test('plot yield with date filter updates snapshot summary', async () => {
        const session = await initTerminalSession();
        await session.submitCommand('plot yield 2024');

        const message = getLastTerminalMessage();
        expect(message).toContain('for 2024');
        expect(message).toContain('Forward Yield: 1.80%');
        expect(message).toContain('Range: 1.80% - 1.80%');
        expect(message).toContain('TTM Dividend Income: $1,200.00');
    });

    test('help strings include plot yield', async () => {
        const session = await initTerminalSession();

        await session.submitCommand('help');
        expect(getLastTerminalMessage()).toContain('plot yield');

        await session.submitCommand('plot');
        expect(getLastTerminalMessage()).toContain('plot yield');
        expect(getLastTerminalMessage()).toContain('yield         [year|quarter|qN]');
    });
});
