import { STATS_SUBCOMMANDS, PLOT_SUBCOMMANDS } from './constants.js';

const TOP_LEVEL_CHIPS = [
    { command: 'stats', label: 'stats', mode: 'stats' },
    { command: 'plot', label: 'plot', mode: 'plot' },
    { command: 'transaction', label: 'transaction' },
    { command: 'summary', label: 'summary' },
    { command: 'all', label: 'all' },
    { command: 'reset', label: 'reset' },
    { command: 'clear', label: 'clear' },
    { command: 'help', label: 'help' },
    { command: 'label', label: 'label' },
    { command: 'zoom', label: 'zoom' },
];

const FILTER_CHIPS = [
    { command: 'type:buy', label: 'type:buy' },
    { command: 'type:sell', label: 'type:sell' },
    { command: 'stock', label: 'stock' },
    { command: 'etf', label: 'etf' },
    { command: 'abs', label: 'abs' },
    { command: 'per', label: 'per' },
    { command: 'alltime', label: 'alltime' },
    { command: 'allstock', label: 'allstock' },
];

function createChip({ command, label, mode }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'terminal-chip';
    button.dataset.command = command;
    if (mode) {
        button.dataset.mode = mode;
    }
    button.textContent = label || command;
    return button;
}

function renderChips(container, chips) {
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    chips.forEach((chipSpec) => {
        fragment.appendChild(createChip(chipSpec));
    });
    container.appendChild(fragment);
}

export function initChips({ terminalInput, processCommand }) {
    const terminal = document.getElementById('terminal');
    const terminalPrompt = document.querySelector('.terminal-prompt');
    if (!terminal || !terminalPrompt || !terminalInput || typeof processCommand !== 'function') {
        return;
    }

    const chipContainer = document.createElement('div');
    chipContainer.className = 'terminal-chips';
    chipContainer.setAttribute('aria-label', 'Command suggestions');
    terminal.insertBefore(chipContainer, terminalPrompt);

    let currentMode = 'commands';

    function getChipsForMode(mode) {
        if (mode === 'stats') {
            return STATS_SUBCOMMANDS.filter((cmd) => cmd !== 'holdings-debug').map((cmd) => ({
                command: `stats ${cmd}`,
                label: cmd,
            }));
        }
        if (mode === 'plot') {
            return PLOT_SUBCOMMANDS.map((cmd) => ({
                command: `plot ${cmd}`,
                label: cmd,
            }));
        }
        return [...TOP_LEVEL_CHIPS, ...FILTER_CHIPS];
    }

    function updateChips() {
        renderChips(chipContainer, getChipsForMode(currentMode));
    }

    function resetToTopLevel() {
        currentMode = 'commands';
        updateChips();
    }

    chipContainer.addEventListener('click', async (event) => {
        const chip = event.target.closest('.terminal-chip');
        if (!chip) {
            return;
        }
        event.stopPropagation();

        const command = chip.dataset.command;
        const mode = chip.dataset.mode;

        if (mode) {
            terminalInput.value = `${command} `;
            currentMode = mode;
            updateChips();
        } else {
            terminalInput.value = '';
            resetToTopLevel();
            await processCommand(command);
        }
    });

    terminalInput.addEventListener('input', () => {
        const value = terminalInput.value.trim().toLowerCase();
        if (value === 'stats' || value === 's') {
            currentMode = 'stats';
        } else if (value === 'plot' || value === 'p') {
            currentMode = 'plot';
        } else {
            currentMode = 'commands';
        }
        updateChips();
    });

    updateChips();
}
