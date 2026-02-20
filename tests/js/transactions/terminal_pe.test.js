/* global KeyboardEvent */
import { jest } from '@jest/globals';

// Mock essential modules
jest.mock('@js/transactions/zoom.js', () => ({
    toggleZoom: jest.fn().mockResolvedValue({ zoomed: false, message: 'Mock Zoomed Out' }),
    getZoomState: jest.fn().mockReturnValue(false),
}));

jest.mock('@js/transactions/terminalStats.js', () => ({
    getStatsText: jest.fn(),
    getDynamicStatsText: jest.fn(),
}));

jest.mock('@js/transactions/chart/renderers/pe.js', () => {
    const original = jest.requireActual('@js/transactions/chart/renderers/pe.js');
    return {
        ...original,
        loadPEData: jest.fn(),
    };
});

let transactionState;
let loadPEDataMock;

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

describe('PE Ratio Terminal Integration', () => {
    const mockData = {
        dates: ['2023-01-01', '2023-06-01', '2024-01-01'],
        portfolio_pe: [20.0, 22.0, 25.0],
        ticker_pe: { GOOG: [25.0, 26.0, 28.0] },
        ticker_weights: { GOOG: [1.0, 1.0, 1.0] },
        forward_pe: {
            portfolio_forward_pe: 22.0,
            target_date: '2025-01-01',
            ticker_forward_pe: { GOOG: 24.0 },
        },
    };

    beforeEach(async () => {
        jest.resetModules();
        const peMod = await import('@js/transactions/chart/renderers/pe.js');
        loadPEDataMock = peMod.loadPEData;
        loadPEDataMock.mockResolvedValue(mockData);
    });

    test('plot pe command appends snapshot summary with component forward PE', async () => {
        const session = await initTerminalSession();
        await session.submitCommand('plot pe');

        const message = getLastTerminalMessage();
        expect(message).toContain('Showing weighted average P/E ratio chart');
        expect(message).toContain('Current: 25.00x');
        expect(message).toContain('Components: GOOG:28/24');
    });

    test('plot pe with date filter updates snapshot summary', async () => {
        const session = await initTerminalSession();
        await session.submitCommand('plot pe 2024');

        const message = getLastTerminalMessage();
        expect(message).toContain('for 2024');
        // Only 2024-01-01 is in range
        expect(message).toContain('Current: 25.00x');
        expect(message).toContain('Range: 25.00x - 25.00x');
        expect(message).toContain('Components: GOOG:28');
    });

    test('all command clears filter and updates P/E summary', async () => {
        const session = await initTerminalSession();

        // Start with a filter
        await session.submitCommand('plot pe 2024');
        expect(getLastTerminalMessage()).toContain('Range: 25.00x - 25.00x');

        // Clear all filters
        await session.submitCommand('all');
        const message = getLastTerminalMessage();
        expect(message).toContain('Showing all data');
        // Range should be restored to full dataset
        expect(message).toContain('Range: 20.00x - 25.00x');
        expect(session.chartManager.update).toHaveBeenCalled();
    });

    test('help strings include plot pe', async () => {
        const session = await initTerminalSession();

        // Check help command
        await session.submitCommand('help');
        expect(getLastTerminalMessage()).toContain('plot pe');

        // Check plot command help
        await session.submitCommand('plot');
        expect(getLastTerminalMessage()).toContain('plot pe');
        expect(getLastTerminalMessage()).toContain('pe            [year|quarter|qN]');
    });
});
