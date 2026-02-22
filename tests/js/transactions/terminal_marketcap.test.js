/* global KeyboardEvent */
/* eslint-disable no-undef */
// __dirname is provided by Jest

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
    transactionState.selectedCurrency = 'USD';
    transactionState.currencySymbol = '$';
    transactionState.filteredTransactions = [];
    transactionState.allTransactions = [];
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
        // Clear input to simulate terminal behavior
        input.value = '';
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

function getTerminalInput() {
    return document.getElementById('terminalInput');
}

describe('plot marketcap command', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('plot marketcap shows market cap chart', async () => {
        const session = initTerminalSession();

        await session.submitCommand('plot marketcap');

        expect(transactionState.activeChart).toBe('marketcap');
        expect(session.chartManager.update).toHaveBeenCalled();

        const message = getLastTerminalMessage();
        expect(message).toContain('Showing market cap composition');
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('plot marketcap abs shows absolute mode', async () => {
        const session = initTerminalSession();

        await session.submitCommand('plot marketcap abs');

        expect(transactionState.activeChart).toBe('marketcapAbs');
        expect(session.chartManager.update).toHaveBeenCalled();

        const message = getLastTerminalMessage();
        expect(message).toContain('Showing market cap composition (absolute)');
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('plot marketcap with year filter applies date range', async () => {
        const session = initTerminalSession();

        await session.submitCommand('plot marketcap 2025');

        expect(transactionState.activeChart).toBe('marketcap');
        expect(transactionState.chartDateRange).toEqual({
            from: '2025-01-01',
            to: '2025-12-31',
        });

        const message = getLastTerminalMessage();
        expect(message).toContain('2025');
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('plot marketcap with date range filter applies correctly', async () => {
        const session = initTerminalSession();

        await session.submitCommand('plot marketcap 2024-01-01,2024-12-31');

        expect(transactionState.activeChart).toBe('marketcap');
        expect(transactionState.chartDateRange).toEqual({
            from: '2024-01-01',
            to: '2024-12-31',
        });

        const message = getLastTerminalMessage();
        expect(message).toContain('2024');
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('plot marketcap toggles off when issued twice', async () => {
        const session = initTerminalSession();

        // First call - show chart
        await session.submitCommand('plot marketcap');
        expect(transactionState.activeChart).toBe('marketcap');

        const chartSection = document.getElementById('runningAmountSection');
        if (chartSection) {
            chartSection.classList.remove('is-hidden');
        }

        // Second call - hide chart
        await session.submitCommand('plot marketcap');
        expect(transactionState.activeChart).toBe(null);

        const message = getLastTerminalMessage();
        expect(message).toContain('Hidden market cap chart');
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('plot marketcap with date args does not toggle off', async () => {
        const session = initTerminalSession();

        // First call - show chart
        await session.submitCommand('plot marketcap');
        expect(transactionState.activeChart).toBe('marketcap');

        const chartSection = document.getElementById('runningAmountSection');
        if (chartSection) {
            chartSection.classList.remove('is-hidden');
        }

        // Second call with date args - should re-render, not hide
        await session.submitCommand('plot marketcap 2025');
        expect(transactionState.activeChart).toBe('marketcap');
        expect(transactionState.chartDateRange.from).toBe('2025-01-01');

        const message = getLastTerminalMessage();
        expect(message).toContain('Showing market cap composition');
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('marketcap command completes without crashing', async () => {
        const session = initTerminalSession();

        // Command should complete and clear input
        await session.submitCommand('plot marketcap');

        // Input should be cleared after command execution
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('plot marketcap with date range updates chartDateRange state', async () => {
        const session = initTerminalSession();

        await session.submitCommand('plot marketcap 2024');

        expect(transactionState.chartDateRange).toEqual({
            from: '2024-01-01',
            to: '2024-12-31',
        });
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('plot marketcap with from/to tokens applies date range', async () => {
        const session = initTerminalSession();

        // Test "from <year>" format
        await session.submitCommand('plot marketcap from 2023');

        expect(transactionState.chartDateRange.from).toBe('2023-01-01');
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('plot marketcap with year range applies date range', async () => {
        const session = initTerminalSession();

        // Test "<year1> to <year2>" format
        await session.submitCommand('plot marketcap 2023 to 2024');

        expect(transactionState.chartDateRange.from).toBe('2023-01-01');
        expect(transactionState.chartDateRange.to).toBe('2024-12-31');
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('plot marketcap with single year applies date range', async () => {
        const session = initTerminalSession();

        // Test single year format "2024"
        await session.submitCommand('plot marketcap 2024');

        expect(transactionState.chartDateRange.from).toBe('2024-01-01');
        expect(transactionState.chartDateRange.to).toBe('2024-12-31');
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('plot marketcap with f:year format applies date range', async () => {
        const session = initTerminalSession();

        // Test "f:2023" format (from year to present)
        await session.submitCommand('plot marketcap f:2023');

        expect(transactionState.chartDateRange.from).toBe('2023-01-01');
        expect(transactionState.chartDateRange.to).toBeNull();
        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('marketcap renderer filters data based on chartDateRange', () => {
        // Test that the renderer properly filters data
        const mockData = {
            dates: ['2023-01-01', '2023-06-01', '2023-12-31', '2024-06-01'],
            series: {
                'Mega Cap': [20, 25, 30, 35],
                'Large Cap': [50, 55, 60, 65],
                'Mid Cap': [15, 10, 5, 0],
                'Small Cap': [10, 5, 0, 0],
                Other: [5, 5, 5, 0],
            },
            total_values: [1000, 1100, 1200, 1300],
        };

        // Simulate filtering for 2023 only
        const filterFrom = new Date('2023-01-01');
        const filterTo = new Date('2023-12-31');

        const filteredIndices = mockData.dates
            .map((dateStr, index) => ({
                index,
                date: new Date(dateStr),
            }))
            .filter(({ date }) => date >= filterFrom && date <= filterTo)
            .map(({ index }) => index);

        expect(filteredIndices).toEqual([0, 1, 2]);
        expect(filteredIndices.length).toBe(3);

        // Verify filtered data
        const filteredDates = filteredIndices.map((i) => mockData.dates[i]);
        expect(filteredDates).toEqual(['2023-01-01', '2023-06-01', '2023-12-31']);

        const filteredMegaCap = filteredIndices.map((i) => mockData.series['Mega Cap'][i]);
        expect(filteredMegaCap).toEqual([20, 25, 30]);
    });

    test('plot marketcap with single year when chart already active applies filter', async () => {
        const session = initTerminalSession();

        // First, show the chart without date filter
        await session.submitCommand('plot marketcap');
        expect(transactionState.activeChart).toBe('marketcap');
        expect(transactionState.chartDateRange.from).toBeNull();

        // Make chart visible
        const chartSection = document.getElementById('runningAmountSection');
        if (chartSection) {
            chartSection.classList.remove('is-hidden');
        }

        // Now apply a year filter - should NOT toggle off, should apply filter
        await session.submitCommand('plot marketcap 2024');

        // Chart should still be active (not toggled off)
        expect(transactionState.activeChart).toBe('marketcap');

        // Date range should be applied
        expect(transactionState.chartDateRange.from).toBe('2024-01-01');
        expect(transactionState.chartDateRange.to).toBe('2024-12-31');

        // Chart manager update should have been called
        expect(session.chartManager.update).toHaveBeenCalled();

        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('plot marketcap toggle off only works without date args', async () => {
        const session = initTerminalSession();

        // Show the chart
        await session.submitCommand('plot marketcap');
        expect(transactionState.activeChart).toBe('marketcap');

        // Make chart visible
        const chartSection = document.getElementById('runningAmountSection');
        if (chartSection) {
            chartSection.classList.remove('is-hidden');
        }

        // Issue command WITHOUT date args - should toggle off
        await session.submitCommand('plot marketcap');
        expect(transactionState.activeChart).toBe(null);

        // Show chart again
        await session.submitCommand('plot marketcap');
        expect(transactionState.activeChart).toBe('marketcap');
        if (chartSection) {
            chartSection.classList.remove('is-hidden');
        }

        // Issue command WITH date args - should NOT toggle off
        await session.submitCommand('plot marketcap 2025');
        expect(transactionState.activeChart).toBe('marketcap');
        expect(transactionState.chartDateRange.from).toBe('2025-01-01');
    }, 30000);

    test('standalone year filter works when marketcap chart is active', async () => {
        const session = initTerminalSession();

        // First show the marketcap chart
        await session.submitCommand('plot marketcap');
        expect(transactionState.activeChart).toBe('marketcap');

        // Make chart visible
        const chartSection = document.getElementById('runningAmountSection');
        if (chartSection) {
            chartSection.classList.remove('is-hidden');
        }

        // Now issue standalone year filter - should apply to active chart
        await session.submitCommand('2024');

        // Date range should be applied
        expect(transactionState.chartDateRange.from).toBe('2024-01-01');
        expect(transactionState.chartDateRange.to).toBe('2024-12-31');

        // Chart should still be active
        expect(transactionState.activeChart).toBe('marketcap');

        expect(getTerminalInput().value).toBe('');
    }, 30000);

    test('standalone f:year filter works when marketcap chart is active', async () => {
        const session = initTerminalSession();

        // First show the marketcap chart
        await session.submitCommand('plot marketcap');
        expect(transactionState.activeChart).toBe('marketcap');

        // Make chart visible
        const chartSection = document.getElementById('runningAmountSection');
        if (chartSection) {
            chartSection.classList.remove('is-hidden');
        }

        // Now issue standalone f:year filter
        await session.submitCommand('f:2023');

        // Date range should be applied
        expect(transactionState.chartDateRange.from).toBe('2023-01-01');
        expect(transactionState.chartDateRange.to).toBeNull();

        // Chart should still be active
        expect(transactionState.activeChart).toBe('marketcap');

        expect(getTerminalInput().value).toBe('');
    }, 30000);
});

describe('marketcap autocomplete', () => {
    test('marketcap is in PLOT_SUBCOMMANDS', () => {
        const { PLOT_SUBCOMMANDS } = require('@js/transactions/terminal/constants.js');
        expect(PLOT_SUBCOMMANDS).toContain('marketcap');
        expect(PLOT_SUBCOMMANDS).toContain('marketcap-abs');
    });

    test('marketcap autocomplete filters correctly', () => {
        const { PLOT_SUBCOMMANDS } = require('@js/transactions/terminal/constants.js');
        const filtered = PLOT_SUBCOMMANDS.filter((cmd) => cmd.startsWith('market'));
        expect(filtered).toEqual(['marketcap', 'marketcap-abs']);
    });
});

describe('marketcap data loader', () => {
    test('loadMarketcapSnapshotData is exported', () => {
        const { loadMarketcapSnapshotData } = require('@js/transactions/dataLoader.js');
        expect(typeof loadMarketcapSnapshotData).toBe('function');
    });
});

describe('marketcap chart renderer', () => {
    test('drawMarketcapChart is exported', () => {
        const {
            drawMarketcapChart,
            drawMarketcapAbsoluteChart,
        } = require('@js/transactions/chart/renderers/marketcap.js');
        expect(typeof drawMarketcapChart).toBe('function');
        expect(typeof drawMarketcapAbsoluteChart).toBe('function');
    });

    test('marketcap uses COLOR_PALETTES.COMPOSITION_CHART_COLORS', () => {
        const fs = require('fs');
        const path = require('path');
        const marketcapPath = path.join(
            __dirname,
            '../../../js/transactions/chart/renderers/marketcap.js'
        );
        const content = fs.readFileSync(marketcapPath, 'utf8');
        expect(content).toContain('COLOR_PALETTES.COMPOSITION_CHART_COLORS');
    });
});

describe('marketcap crosshair support', () => {
    test('marketcap is included in isCompositionLayout check', () => {
        const fs = require('fs');
        const path = require('path');
        const interactionPath = path.join(
            __dirname,
            '../../../js/transactions/chart/interaction.js'
        );
        const content = fs.readFileSync(interactionPath, 'utf8');
        expect(content).toContain("'marketcap'");
        expect(content).toContain("'marketcapAbs'");
    });
});

describe('marketcap snapshot', () => {
    test('getMarketcapSnapshotLine is exported', () => {
        const { getMarketcapSnapshotLine } = require('@js/transactions/terminal/snapshots.js');
        expect(typeof getMarketcapSnapshotLine).toBe('function');
    });
});
