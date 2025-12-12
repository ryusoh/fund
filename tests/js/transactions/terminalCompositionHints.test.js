/* global KeyboardEvent */
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('@js/transactions/zoom.js', () => ({
    toggleZoom: jest.fn().mockResolvedValue({ zoomed: false, message: 'Mock Zoomed Out' }),
    getZoomState: jest.fn(),
}));

jest.mock('@js/transactions/dataLoader.js', () => ({
    loadCompositionSnapshotData: jest.fn().mockResolvedValue({
        dates: ['2023-01-01'],
        total_values: [10000],
        composition: {
            AAPL: [60],
            GOOG: [40],
        },
    }),
}));

import { initTerminal } from '@js/transactions/terminal.js';
import { transactionState } from '@js/transactions/state.js';

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
            <table>
                <tbody id="transactionBody"></tbody>
            </table>
        </div>
    `;
}

function initTerminalSession() {
    const filterAndSort = jest.fn();
    const chartManager = {
        update: jest.fn(),
        redraw: jest.fn(),
    };

    setupDom();

    // Reset state
    transactionState.activeChart = null;
    transactionState.chartDateRange = { from: null, to: null };
    transactionState.selectedCurrency = 'USD';

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
        // Allow async processing (promises in terminal.js) to complete
        await new Promise((resolve) => setTimeout(resolve, 0));
    };

    return { submitCommand };
}

function getLastTerminalMessage() {
    const output = document.querySelector('#terminalOutput pre:last-child');
    return output ? output.textContent : '';
}

describe('terminal composition hints', () => {
    test('shows hint for absolute view when running plot composition', async () => {
        const { submitCommand } = initTerminalSession();
        await submitCommand('plot composition');

        const message = getLastTerminalMessage();
        expect(message).toContain("Hint: use 'abs' for absolute values");
    });

    test('shows hint for percentage view when running plot composition abs', async () => {
        const { submitCommand } = initTerminalSession();
        await submitCommand('plot composition abs');

        const message = getLastTerminalMessage();
        expect(message).toContain("Hint: use 'per' for percentages");
    });

    test('shows hint for percentage view when switching via abs command', async () => {
        const { submitCommand } = initTerminalSession();
        // First must be in composition mode
        await submitCommand('plot composition');
        await submitCommand('abs');

        const message = getLastTerminalMessage();
        expect(message).toContain("Hint: use 'per' for percentages");
    });

    test('shows hint for absolute view when switching via per command', async () => {
        const { submitCommand } = initTerminalSession();
        // First must be in composition abs mode
        await submitCommand('plot composition abs');
        await submitCommand('per');

        const message = getLastTerminalMessage();
        expect(message).toContain("Hint: use 'abs' for absolute values");
    });
});
