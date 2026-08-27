/* global jest */

jest.mock('../../../../js/transactions/zoom.js', () => ({
    toggleZoom: jest.fn().mockResolvedValue({ zoomed: false, message: 'Mock Zoomed Out' }),
    getZoomState: jest.fn(),
}));

jest.mock('../../../../js/transactions/terminalStats.js', () => {
    const original = jest.requireActual('../../../../js/transactions/terminalStats.js');
    return {
        ...original,
        getStatsText: jest.fn(),
        getDynamicStatsText: jest.fn(),
    };
});

function setupMatchMedia(isCoarse) {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === '(pointer: coarse)' ? isCoarse : !isCoarse,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    }));
}

function resetTransactionState() {
    const transactionState = require('../../../../js/transactions/state.js').transactionState;
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
    transactionState.splitHistory = [];
    transactionState.selectedCurrency = 'USD';
    transactionState.currencySymbol = '$';
    transactionState.fxRatesByCurrency = {};
    transactionState.historicalPrices = {};
    transactionState.showChartLabels = true;
    transactionState.compositionFilterTickers = [];
    transactionState.compositionAssetClassFilter = null;
}

function initTerminalSession({ beforeInit } = {}) {
    document.body.innerHTML = `
        <div id="terminal">
            <div id="terminalOutput"></div>
            <div class="terminal-prompt">
                <input type="text" id="terminalInput" />
            </div>
        </div>
        <section id="runningAmountSection" class="is-hidden"></section>
    `;
    resetTransactionState();
    const input = document.getElementById('terminalInput');
    if (beforeInit) {
        beforeInit(input);
    }
    const { initTerminal } = require('../../../../js/transactions/terminal.js');
    initTerminal({
        filterAndSort: jest.fn(),
        toggleTable: jest.fn(),
        closeAllFilterDropdowns: jest.fn(),
        resetSortState: jest.fn(),
        chartManager: { update: jest.fn(), redraw: jest.fn() },
    });
    return { input };
}

describe('terminal focus on mobile', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    test('does not focus input when pointer is coarse', () => {
        setupMatchMedia(true);
        let focusSpy;
        const { input } = initTerminalSession({
            beforeInit: (inp) => {
                focusSpy = jest.spyOn(inp, 'focus');
            },
        });
        expect(focusSpy).not.toHaveBeenCalled();
        expect(document.activeElement).not.toBe(input);
    });

    test('focuses input when pointer is fine', () => {
        setupMatchMedia(false);
        const { input } = initTerminalSession();
        expect(document.activeElement).toBe(input);
    });

    test('renders chip bar on coarse pointer', () => {
        setupMatchMedia(true);
        initTerminalSession();
        expect(document.querySelector('.terminal-chips')).not.toBeNull();
    });

    test('does not render chip bar on fine pointer', () => {
        setupMatchMedia(false);
        initTerminalSession();
        expect(document.querySelector('.terminal-chips')).toBeNull();
    });
});
