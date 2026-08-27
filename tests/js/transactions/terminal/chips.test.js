import { initChips } from '../../../../js/transactions/terminal/chips.js';

function setupDom() {
    document.body.innerHTML = `
        <div id="terminal">
            <div id="terminalOutput"></div>
            <div class="terminal-prompt">
                <input type="text" id="terminalInput" />
            </div>
        </div>
    `;
    return {
        input: document.getElementById('terminalInput'),
        processCommand: jest.fn().mockResolvedValue(undefined),
    };
}

describe('terminal chips', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('renders chip container with top-level commands and filters', () => {
        const { input, processCommand } = setupDom();
        initChips({ terminalInput: input, processCommand });
        const container = document.querySelector('.terminal-chips');
        expect(container).not.toBeNull();
        const chips = container.querySelectorAll('.terminal-chip');
        expect(chips.length).toBeGreaterThan(0);
        expect([...chips].some((c) => c.textContent === 'stats')).toBe(true);
        expect([...chips].some((c) => c.textContent === 'type:buy')).toBe(true);
    });

    test('clicking an executable chip runs the command and clears input', async () => {
        const { input, processCommand } = setupDom();
        initChips({ terminalInput: input, processCommand });
        const container = document.querySelector('.terminal-chips');
        const summaryChip = [...container.querySelectorAll('.terminal-chip')].find(
            (c) => c.textContent === 'summary'
        );
        summaryChip.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(processCommand).toHaveBeenCalledWith('summary');
        expect(input.value).toBe('');
    });

    test('clicking stats inserts text and switches to subcommand chips', () => {
        const { input, processCommand } = setupDom();
        initChips({ terminalInput: input, processCommand });
        const container = document.querySelector('.terminal-chips');
        const statsChip = [...container.querySelectorAll('.terminal-chip')].find(
            (c) => c.textContent === 'stats'
        );
        statsChip.click();
        expect(input.value).toBe('stats ');
        const subcommandChips = container.querySelectorAll('.terminal-chip');
        expect([...subcommandChips].some((c) => c.textContent === 'cagr')).toBe(true);
    });

    test('typing stats manually switches chip bar to subcommands', () => {
        const { input, processCommand } = setupDom();
        initChips({ terminalInput: input, processCommand });
        input.value = 'stats';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const container = document.querySelector('.terminal-chips');
        const subcommandChips = container.querySelectorAll('.terminal-chip');
        expect([...subcommandChips].some((c) => c.textContent === 'cagr')).toBe(true);
    });

    test('clicking a subcommand chip executes the full command', async () => {
        const { input, processCommand } = setupDom();
        initChips({ terminalInput: input, processCommand });
        const container = document.querySelector('.terminal-chips');

        // Enter stats mode
        const statsChip = [...container.querySelectorAll('.terminal-chip')].find(
            (c) => c.textContent === 'stats'
        );
        statsChip.click();

        const cagrChip = [...container.querySelectorAll('.terminal-chip')].find(
            (c) => c.textContent === 'cagr'
        );
        cagrChip.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(processCommand).toHaveBeenCalledWith('stats cagr');
        expect(input.value).toBe('');
    });
});
