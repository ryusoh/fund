import {
    transactionState,
    pushCommandHistory,
    resetHistoryIndex,
    setHistoryIndex,
} from './state.js';
import { formatCurrency } from './utils.js';
import { calculateStats, calculateHoldings } from './calculations.js';

function getStatsText() {
    const stats = calculateStats(transactionState.allTransactions, transactionState.splitHistory);
    return `\n-------------------- TRANSACTION STATS ---------------------\n  Total Transactions: ${stats.totalTransactions.toLocaleString()}\n  Buy Orders:         ${stats.totalBuys.toLocaleString()}\n  Sell Orders:        ${stats.totalSells.toLocaleString()}\n  Total Buy Amount:   ${formatCurrency(stats.totalBuyAmount)}\n  Total Sell Amount:  ${formatCurrency(stats.totalSellAmount)}\n  Net Amount:         ${formatCurrency(stats.netAmount)}\n  Realized Gain:      ${formatCurrency(stats.realizedGain)}\n`;
}

function getHoldingsText() {
    const holdings = calculateHoldings(
        transactionState.allTransactions,
        transactionState.splitHistory
    );
    const activeHoldings = Object.entries(holdings).filter(
        ([, data]) => Math.abs(data.shares) > 0.001
    );
    if (activeHoldings.length === 0) {
        return 'No current holdings.';
    }

    let table = '  Security        | Shares         | Avg Price      | Total Cost     \n';
    table += '  ----------------|----------------|----------------|----------------\n';
    activeHoldings
        .sort((a, b) => b[1].totalCost - a[1].totalCost)
        .forEach(([security, data]) => {
            const isNegative = data.shares < 0;
            const sec = `  ${security}${isNegative ? ' ⚠️' : ''}`.padEnd(17);
            const shares = data.shares
                .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                .padStart(14);
            const avgPrice = `$${data.avgPrice.toFixed(2)}`.padStart(14);
            const totalCost = formatCurrency(data.totalCost).padStart(14);
            table += `${sec} | ${shares} | ${avgPrice} | ${totalCost}\n`;
        });
    return table;
}

let lastEmptyFilterTerm = null;
const COMMAND_ALIASES = [
    'help',
    'h',
    'filter',
    'reset',
    'clear',
    'stats',
    'holdings',
    'table',
    't',
    'plot',
    'p',
];

const MIN_FADE_OPACITY = 0.1;

const autocompleteState = {
    prefix: '',
    matches: [],
    index: -1,
};

function resetAutocompleteState() {
    autocompleteState.prefix = '';
    autocompleteState.matches = [];
    autocompleteState.index = -1;
}

export function initTerminal({
    filterAndSort,
    toggleTable,
    togglePlot,
    closeAllFilterDropdowns,
    resetSortState,
}) {
    const terminalInput = document.getElementById('terminalInput');
    const terminal = document.getElementById('terminal');
    const outputContainer = document.getElementById('terminalOutput');
    let fadeUpdateScheduled = false;

    function appendMessage(message) {
        if (!outputContainer) {
            return;
        }
        const pre = document.createElement('pre');
        pre.textContent = message;
        outputContainer.appendChild(pre);
        outputContainer.scrollTop = outputContainer.scrollHeight;
        requestFadeUpdate();
    }

    function updateOutputFade() {
        if (!outputContainer) {
            return;
        }

        const viewHeight = outputContainer.clientHeight;
        if (viewHeight <= 0) {
            return;
        }

        const threshold = viewHeight * 0.25;
        const viewTop = outputContainer.scrollTop;

        Array.from(outputContainer.children).forEach((child) => {
            if (!child || child.nodeType !== 1) {
                return;
            }

            if (!child.style.transition) {
                child.style.transition = 'opacity 0.18s ease-out';
            }

            const relativeTop = child.offsetTop - viewTop;
            const relativeBottom = relativeTop + child.offsetHeight;

            if (relativeBottom <= 0) {
                child.style.opacity = '0';
                return;
            }

            if (relativeTop >= threshold) {
                child.style.opacity = '';
                return;
            }

            const center = Math.max(0, Math.min(relativeTop + child.offsetHeight / 2, threshold));
            const ratio = center / threshold;
            const opacity = MIN_FADE_OPACITY + (1 - MIN_FADE_OPACITY) * ratio;
            child.style.opacity = opacity.toFixed(2);
        });
    }

    function requestFadeUpdate() {
        if (fadeUpdateScheduled) {
            return;
        }
        fadeUpdateScheduled = true;
        requestAnimationFrame(() => {
            fadeUpdateScheduled = false;
            updateOutputFade();
        });
    }

    function autocompleteCommand(input) {
        if (!input) {
            return;
        }
        const rawValue = input.value;
        const trimmedValue = rawValue.trim();
        let searchPrefix = trimmedValue;

        if (autocompleteState.matches.length > 0) {
            const currentMatch = autocompleteState.matches[autocompleteState.index];
            if (trimmedValue === currentMatch) {
                searchPrefix = autocompleteState.prefix;
            }
        }

        if (searchPrefix.includes(' ') || searchPrefix.includes(':')) {
            resetAutocompleteState();
            return;
        }

        const lowerPrefix = searchPrefix.toLowerCase();
        const matches = (
            lowerPrefix
                ? COMMAND_ALIASES.filter((cmd) => cmd.startsWith(lowerPrefix))
                : COMMAND_ALIASES
        ).filter((cmd, index, arr) => arr.indexOf(cmd) === index);

        if (matches.length === 0) {
            resetAutocompleteState();
            return;
        }

        if (
            autocompleteState.prefix === lowerPrefix &&
            autocompleteState.matches.length > 0 &&
            trimmedValue === autocompleteState.matches[autocompleteState.index]
        ) {
            autocompleteState.index =
                (autocompleteState.index + 1) % autocompleteState.matches.length;
        } else {
            autocompleteState.prefix = lowerPrefix;
            autocompleteState.matches = matches;
            autocompleteState.index = 0;
        }

        const completed = autocompleteState.matches[autocompleteState.index];
        const shouldAppendSpace = matches.length === 1;
        input.value = completed + (shouldAppendSpace ? ' ' : '');
        const newLength = input.value.length;
        input.setSelectionRange(newLength, newLength);
    }

    function processCommand(command) {
        if (!outputContainer) {
            return;
        }
        const prompt = `<div><span class="prompt-user">lz@fund:~$</span> ${command}</div>`;
        outputContainer.innerHTML += prompt;
        requestFadeUpdate();

        const [cmd] = command.toLowerCase().split(' ');
        let result = '';

        switch (cmd.toLowerCase()) {
            case 'h':
            case 'help':
                result =
                    'Available commands:\n  stats              - Display summary statistics.\n  holdings           - Display current holdings.\n  table (t)          - Toggle the transaction table visibility.\n  plot (p)           - Toggle the running cost basis chart.\n  filter             - Show available filter commands.\n  reset              - Restore full transaction list and show table/chart.\n  clear              - Clear the terminal screen.\n  help (h)           - Show this help message.\n\nHint: Press Tab to auto-complete command names.\n\nAny other input is treated as a filter for the transaction table.';
                break;
            case 'filter':
                result =
                    'Usage: <filter>:<value>\n\nAvailable filters:\n  type     - Filter by order type (buy or sell).\n             Example: type:buy\n  security - Filter by security ticker.\n             Example: security:NVDA\n  min      - Show transactions with a net amount greater than value.\n             Example: min:1000\n  max      - Show transactions with a net amount less than value.\n             Example: max:5000\n\nAny text not part of a command is used for a general text search.';
                break;
            case 'reset':
                closeAllFilterDropdowns();
                resetSortState();
                if (terminalInput) {
                    terminalInput.value = '';
                }
                const tableContainer = document.querySelector('.table-responsive-container');
                const plotSection = document.getElementById('runningAmountSection');
                if (tableContainer) {
                    tableContainer.classList.remove('is-hidden');
                    const transactionTable = document.getElementById('transactionTable');
                    if (transactionTable) {
                        transactionTable.style.display = 'table';
                    }
                }
                if (plotSection) {
                    plotSection.classList.add('is-hidden');
                }
                filterAndSort('');
                result =
                    'Reset filters and displaying full transaction history. Use `plot` to view the chart.';
                requestFadeUpdate();
                break;
            case 'clear':
                outputContainer.innerHTML = '';
                closeAllFilterDropdowns();
                resetSortState();
                if (terminalInput) {
                    terminalInput.value = '';
                }
                filterAndSort('');
                document
                    .querySelectorAll('.table-responsive-container, #runningAmountSection')
                    .forEach((el) => el.classList.add('is-hidden'));
                requestFadeUpdate();
                break;
            case 'stats':
                result = getStatsText();
                break;
            case 'holdings':
                result = getHoldingsText();
                break;
            case 't':
            case 'table':
                toggleTable();
                result = 'Toggled transaction table visibility.';
                break;
            case 'p':
            case 'plot':
                togglePlot();
                result = 'Toggled plot visibility.';
                break;
            default:
                filterAndSort(command);
                result = `Filtering transactions by: "${command}"...`;
                break;
        }

        if (result) {
            const pre = document.createElement('pre');
            pre.textContent = result;
            outputContainer.appendChild(pre);
        }
        outputContainer.scrollTop = outputContainer.scrollHeight;
        requestFadeUpdate();
    }

    function handleTerminalInput(e) {
        const input = e.target;
        switch (e.key) {
            case 'Enter':
                if (input.value.trim()) {
                    const command = input.value.trim();
                    pushCommandHistory(command);
                    resetHistoryIndex();
                    processCommand(command);
                    input.value = '';
                }
                resetAutocompleteState();
                requestFadeUpdate();
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (transactionState.historyIndex < transactionState.commandHistory.length - 1) {
                    setHistoryIndex(transactionState.historyIndex + 1);
                    input.value = transactionState.commandHistory[transactionState.historyIndex];
                }
                resetAutocompleteState();
                requestFadeUpdate();
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (transactionState.historyIndex > 0) {
                    setHistoryIndex(transactionState.historyIndex - 1);
                    input.value = transactionState.commandHistory[transactionState.historyIndex];
                } else {
                    resetHistoryIndex();
                    input.value = '';
                }
                resetAutocompleteState();
                requestFadeUpdate();
                break;
            case 'Tab':
                e.preventDefault();
                autocompleteCommand(input);
                break;
            default:
                resetAutocompleteState();
                break;
        }
    }

    if (terminalInput) {
        terminalInput.focus();
        terminalInput.addEventListener('keydown', handleTerminalInput);
    }

    if (terminal) {
        terminal.addEventListener('click', (e) => {
            if (terminalInput && e.target !== terminalInput) {
                terminalInput.focus();
            }
        });
    }

    document.addEventListener('transactionFilterResult', (event) => {
        if (!outputContainer) {
            return;
        }
        const detail = event.detail || {};
        const { count } = detail;
        const searchTerm = typeof detail.searchTerm === 'string' ? detail.searchTerm.trim() : '';
        if (count === 0 && searchTerm) {
            if (lastEmptyFilterTerm !== searchTerm) {
                appendMessage("No transactions match the current filter. Type 'clear' to reset.");
                lastEmptyFilterTerm = searchTerm;
            }
        } else if (count > 0) {
            lastEmptyFilterTerm = null;
        }
        outputContainer.scrollTop = outputContainer.scrollHeight;
        requestFadeUpdate();
    });

    if (outputContainer) {
        outputContainer.addEventListener('scroll', requestFadeUpdate, { passive: true });
        requestFadeUpdate();
    }

    return {
        processCommand,
    };
}
