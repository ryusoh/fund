const { initTerminal, updateTerminalCrosshair } = require('../../../../js/transactions/terminal.js');
const { transactionState, setHistoryIndex } = require('../../../../js/transactions/state.js');

jest.mock('../../../../js/transactions/state.js', () => ({
    transactionState: {
        subscribe: jest.fn(),
        get: jest.fn().mockReturnValue({ chartSort: 'size', chartLimit: 15, chartCombineSmall: true }),
        commandHistory: ['help', 'clear', 'foobar'],
        historyIndex: 1
    },
    pushCommandHistory: jest.fn(),
    resetHistoryIndex: jest.fn(),
    setHistoryIndex: jest.fn((val) => {
        const state = require('../../../../js/transactions/state.js').transactionState;
        state.historyIndex = val;
    }),
    getCommandHistory: jest.fn().mockReturnValue(['help', 'clear', 'foobar']),
    getHistoryIndex: jest.fn().mockReturnValue(1)
}));

jest.mock('../../../../js/ui/currencyToggleManager.js', () => ({
    cycleCurrency: jest.fn()
}));

const commands = require('../../../../js/transactions/terminal/commands.js');
jest.mock('../../../../js/transactions/terminal/commands.js', () => ({
    executeCommand: jest.fn().mockImplementation(async () => {
        return true;
    })
}));

jest.mock('../../../../js/transactions/terminal/autocomplete.js', () => ({
    autocompleteCommand: jest.fn(),
    resetAutocompleteState: jest.fn()
}));

describe('updateTerminalCrosshair and helpers', () => {
    beforeAll(() => {
        document.body.innerHTML = `
            <div id="terminal"></div>
        `;
    });

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('populates data and makes overlay active with formatting', () => {
        updateTerminalCrosshair(
            { header: 'Test Header', dateLabel: '2024-01-01' },
            {
                start: 1704067200000,
                end: 1704153600000,
                durationDays: 1,
                entries: [{
                    color: 'red',
                    label: 'Test Label',
                    deltaFormatted: '+10',
                    percentFormatted: '10%'
                }]
            }
        );

        const overlay = document.querySelector('.terminal-crosshair-overlay');
        expect(overlay.style.visibility).toBe('visible');

        overlay.classList.remove('terminal-crosshair-active');
        const transitionEndEvent = new Event('transitionend');
        overlay.dispatchEvent(transitionEndEvent);
        expect(overlay.style.visibility).toBe('hidden');
    });

    it('hides overlay when snapshot is null', () => {
        updateTerminalCrosshair(
            { header: 'Test Header', dateLabel: '2024-01-01' }, null
        );
        const overlay = document.querySelector('.terminal-crosshair-overlay');
        expect(overlay).toBeTruthy();

        updateTerminalCrosshair(null, null);
        expect(overlay.classList.contains('terminal-crosshair-active')).toBe(false);

        jest.runAllTimers();
        expect(overlay.style.visibility).toBe('hidden');
    });

    it('handles range data with durationMs and empty entries', () => {
        updateTerminalCrosshair(
            { header: 'Test Header' },
            {
                start: 1704067200000,
                end: 1704070800000,
                durationDays: 0,
                durationMs: 3600000,
                entries: []
            }
        );
        const overlay = document.querySelector('.terminal-crosshair-overlay');
        expect(overlay.style.visibility).toBe('visible');
    });

    it('covers Intl fallback path for date formatting', () => {
        const originalIntl = global.Intl;
        global.Intl = undefined;

        updateTerminalCrosshair(
            { header: 'Test Header' },
            {
                start: 1704067200000,
                end: 1704070800000,
                durationDays: 0,
                durationMs: 3600000,
                entries: []
            }
        );

        global.Intl = originalIntl;
        const overlay = document.querySelector('.terminal-crosshair-overlay');
        expect(overlay.style.visibility).toBe('visible');
    });

    it('covers missing replaceChildren in DOM environments', () => {
        updateTerminalCrosshair({ header: 'Setup' }, null);
        const list = document.getElementById('terminalCrosshairList');
        const range = document.getElementById('terminalCrosshairRange');

        if (list) {delete list.replaceChildren;}
        if (range) {delete range.replaceChildren;}

        updateTerminalCrosshair(
            { header: 'Test Header' },
            {
                start: Infinity,
                end: NaN,
                durationDays: 1,
                entries: [{
                    color: 'blue',
                    label: 'No Percent',
                    deltaFormatted: '+5',
                    percentFormatted: ''
                }]
            }
        );
        const overlay = document.querySelector('.terminal-crosshair-overlay');
        expect(overlay.style.visibility).toBe('visible');
    });

    it('covers empty snapshot branches', () => {
        updateTerminalCrosshair({}, { start: 1, end: 2, durationDays: 1, entries: [] });
        const overlay = document.querySelector('.terminal-crosshair-overlay');
        expect(overlay.style.visibility).toBe('visible');
    });
});

describe('initTerminal command processing and events', () => {
    let terminalObj;
    let inputElement;
    let outputContainer;
    let terminalContainer;
    let searchInput;
    let matchCount;
    let searchArrows;

    beforeAll(() => {
        // Reset DOM for these tests
        document.body.innerHTML = `
            <div id="terminalContainer"></div>
            <input type="text" id="terminalInput" />
            <div id="terminalOutput"></div>
            <input type="text" id="terminalSearchInput" />
            <div id="searchMatchCount"></div>
            <div id="searchArrows"></div>
        `;
        inputElement = document.getElementById('terminalInput');
        outputContainer = document.getElementById('terminalOutput');
        terminalContainer = document.getElementById('terminalContainer');
        searchInput = document.getElementById('terminalSearchInput');
        matchCount = document.getElementById('searchMatchCount');
        searchArrows = document.getElementById('searchArrows');

        terminalObj = initTerminal({
            inputElement,
            outputContainer,
            terminal: terminalContainer,
            searchInput,
            matchCount,
            searchArrows
        });
    });

    it('handles empty command', async () => {
        outputContainer.innerHTML = '';
        await terminalObj.processCommand('   ');
        // processCommand appends prompt, so innerHTML won't be empty
        expect(outputContainer.innerHTML).toContain('prompt-user');
    });

    it('handles clear command', async () => {
        outputContainer.innerHTML = '<div>old output</div>';
        await terminalObj.processCommand('clear');
        expect(commands.executeCommand).toHaveBeenCalled();
    });

    it('handles unknown command with hint', async () => {
        // Mock to return false for foobar to trigger 'Command not found'
        commands.executeCommand.mockResolvedValueOnce(false);
        await terminalObj.processCommand('foobar');
    });

    it('handles keyboard navigation (ArrowUp, ArrowDown)', () => {
        inputElement.value = ''; // clear

        // ArrowUp
        const arrowUpEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
        inputElement.dispatchEvent(arrowUpEvent);
        expect(inputElement.value).toBe('foobar'); // commandHistory[historyIndex]

        // ArrowDown
        const arrowDownEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
        inputElement.dispatchEvent(arrowDownEvent);
        expect(inputElement.value).toBe('clear');

        // ArrowDown to 0
        require('../../../../js/transactions/state.js').transactionState.historyIndex = 0;
        inputElement.dispatchEvent(arrowDownEvent);
        expect(inputElement.value).toBe('');

        // Tab
        const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
        inputElement.dispatchEvent(tabEvent);
        expect(require('../../../../js/transactions/terminal/autocomplete.js').autocompleteCommand).toHaveBeenCalled();

        // Default
        const aEvent = new KeyboardEvent('keydown', { key: 'a' });
        inputElement.dispatchEvent(aEvent);
        expect(require('../../../../js/transactions/terminal/autocomplete.js').resetAutocompleteState).toHaveBeenCalled();

        // Enter
        inputElement.value = 'test command';
        const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
        inputElement.dispatchEvent(enterEvent);
    });

    it('handles ArrowLeft/Right', () => {
        inputElement.value = '';
        const arrowLeftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
        inputElement.dispatchEvent(arrowLeftEvent);
        expect(require('../../../../js/ui/currencyToggleManager.js').cycleCurrency).toHaveBeenCalledWith(-1);

        inputElement.value = 'hello';
        const arrowRightEventCtrl = new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true });
        inputElement.dispatchEvent(arrowRightEventCtrl);
        expect(require('../../../../js/ui/currencyToggleManager.js').cycleCurrency).toHaveBeenCalledWith(1);

        const arrowRightEventMeta = new KeyboardEvent('keydown', { key: 'ArrowRight', metaKey: true });
        inputElement.dispatchEvent(arrowRightEventMeta);
        expect(require('../../../../js/ui/currencyToggleManager.js').cycleCurrency).toHaveBeenCalled();

        const arrowRightEventNormal = new KeyboardEvent('keydown', { key: 'ArrowRight' });
        inputElement.dispatchEvent(arrowRightEventNormal);
    });

    it('handles click on terminal to focus input', () => {
        terminalContainer.dispatchEvent(new Event('click'));
    });

    it('handles searchInput event', () => {
        searchInput.value = 'search text';
        searchInput.dispatchEvent(new Event('input'));
        expect(searchInput.value).toBe('search text');
    });

    it('handles transactionFilterResult event with count 0', () => {
        const event = new CustomEvent('transactionFilterResult', {
            detail: { count: 0, searchTerm: 'foo' }
        });
        document.dispatchEvent(event);

        expect(outputContainer.textContent).toContain('No transactions match the current filter');

        // trigger again with same term
        document.dispatchEvent(event);
        const textCount = (outputContainer.textContent.match(/No transactions match/g) || []).length;
        expect(textCount).toBe(1);

        // trigger with different term
        const event2 = new CustomEvent('transactionFilterResult', {
            detail: { count: 0, searchTerm: 'bar' }
        });
        document.dispatchEvent(event2);
        const textCount2 = (outputContainer.textContent.match(/No transactions match/g) || []).length;
        expect(textCount2).toBe(2);
    });

    it('handles transactionFilterResult event with count > 0', () => {
        const event = new CustomEvent('transactionFilterResult', {
            detail: { count: 5, searchTerm: 'foo' }
        });
        document.dispatchEvent(event);
    });

    it('handles transactionFilterResult event with no detail', () => {
        const event = new Event('transactionFilterResult');
        document.dispatchEvent(event);
    });
});

describe('initTerminal edge cases', () => {
    it('returns early when outputContainer is missing in processCommand', async () => {
        document.body.innerHTML = '';
        const terminal = initTerminal({});
        await terminal.processCommand('test');
        expect(document.querySelector('.prompt-user')).toBeNull();
    });

    it('returns early when outputContainer is missing in appendMessage', async () => {
        document.body.innerHTML = '<input type="text" id="terminalInput" />';
        initTerminal({});

        const event = new CustomEvent('transactionFilterResult', {
            detail: { count: 0, searchTerm: 'foo' }
        });
        document.dispatchEvent(event);
        expect(document.querySelector('pre')).toBeNull();
    });
});
