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

    function processCommand(command) {
        if (!outputContainer) {
            return;
        }
        const prompt = `<div><span class="prompt-user">lz@fund:~$</span> ${command}</div>`;
        outputContainer.innerHTML += prompt;

        const [cmd] = command.toLowerCase().split(' ');
        let result = '';

        switch (cmd.toLowerCase()) {
            case 'h':
            case 'help':
                result =
                    'Available commands:\n  stats              - Display summary statistics.\n  holdings           - Display current holdings.\n  table (t)          - Toggle the transaction table visibility.\n  plot (p)           - Toggle the running cost basis chart.\n  filter             - Show available filter commands.\n  clear              - Clear the terminal screen.\n  help (h)           - Show this help message.\n\nAny other input is treated as a filter for the transaction table.';
                break;
            case 'filter':
                result =
                    'Usage: <filter>:<value>\n\nAvailable filters:\n  type     - Filter by order type (buy or sell).\n             Example: type:buy\n  security - Filter by security ticker.\n             Example: security:NVDA\n  min      - Show transactions with a net amount greater than value.\n             Example: min:1000\n  max      - Show transactions with a net amount less than value.\n             Example: max:5000\n\nAny text not part of a command is used for a general text search.';
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
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (transactionState.historyIndex < transactionState.commandHistory.length - 1) {
                    setHistoryIndex(transactionState.historyIndex + 1);
                    input.value = transactionState.commandHistory[transactionState.historyIndex];
                }
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
                break;
            default:
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

    return {
        processCommand,
    };
}
