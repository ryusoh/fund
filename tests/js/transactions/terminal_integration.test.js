/* global KeyboardEvent */
import { jest } from '@jest/globals';

// Mock modules
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

function getLastTerminalMessage() {
    const output = document.querySelector('#terminalOutput pre:last-child');
    return output ? output.textContent : '';
}

describe('terminal plot command integration', () => {
    let terminalInput;
    let initTerminal;
    let toggleZoom;
    let getZoomState;
    let getDynamicStatsText;

    beforeEach(() => {
        jest.resetModules();

        // Dynamic requires to get fresh modules/mocks
        ({ initTerminal } = require('@js/transactions/terminal.js'));
        const zoomModule = require('@js/transactions/zoom.js');
        toggleZoom = zoomModule.toggleZoom;
        getZoomState = zoomModule.getZoomState;

        const statsModule = require('@js/transactions/terminalStats.js');
        getDynamicStatsText = statsModule.getDynamicStatsText;

        // Reset mocks
        toggleZoom.mockClear();
        getZoomState.mockReset();
        getZoomState.mockReturnValue(false);

        // Setup DOM
        document.body.innerHTML = `
            <div id="terminal">
                <div id="terminalOutput"></div>
                <div class="terminal-prompt">
                    <input type="text" id="terminalInput" />
                </div>
            </div>
            <div class="table-responsive-container"><table><tbody id="transactionBody"></tbody></table></div>
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
        // Mock getDynamicStatsText response
        getDynamicStatsText.mockResolvedValue('\nTRANSACTION STATS\n(Mocked: 123)');

        // We need to re-init terminal or just trigger the interaction?
        // Terminal is already init in beforeEach.
        // And it imports getDynamicStatsText.
        // Since we updated the mock implementation on the fresh require, it should work.

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
        // Mock getDynamicStatsText
        getDynamicStatsText.mockResolvedValue('\nTRANSACTION STATS\n(Mocked: 999)');

        // Show the table first
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
    });

    test('filter command (e.g., "all") shows transaction stats when table is visible', async () => {
        // Mock getDynamicStatsText
        getDynamicStatsText.mockResolvedValue('\nTRANSACTION STATS\n(Mocked: 50)');

        // Ensure table is visible first
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
    });
});
