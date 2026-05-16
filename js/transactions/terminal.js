import {
    transactionState,
    pushCommandHistory,
    resetHistoryIndex,
    setHistoryIndex,
} from './state.js';

// Bolt: Cache Intl.DateTimeFormat instance to prevent expensive recreation
const getCrosshairDateFormatter = (() => {
    let formatter = null;
    return () => {
        if (!formatter && typeof Intl !== 'undefined') {
            formatter = new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
            });
        }
        return formatter;
    };
})();

import { executeCommand } from './terminal/commands.js';
import { autocompleteCommand, resetAutocompleteState } from './terminal/autocomplete.js';

import { initFade, requestFadeUpdate } from './fade.js';
import { cycleCurrency } from '@ui/currencyToggleManager.js';

let crosshairOverlay = null;
let crosshairDetails = null;
let crosshairTimeout = null;

let lastEmptyFilterTerm = null;

function formatCrosshairDateLabel(time) {
    if (!Number.isFinite(time)) {
        return '';
    }
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const formatter = getCrosshairDateFormatter();
    if (formatter) {
        return formatter.format(date);
    }
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function ensureCrosshairOverlay() {
    if (crosshairOverlay && crosshairDetails) {
        return { overlay: crosshairOverlay, details: crosshairDetails };
    }

    const terminalElement = document.getElementById('terminal');
    if (!terminalElement) {
        return { overlay: null, details: null };
    }

    let overlay = document.getElementById('terminalCrosshairOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'terminalCrosshairOverlay';
        overlay.className = 'terminal-crosshair-overlay';
        overlay.style.visibility = 'hidden';
        overlay.classList.remove('terminal-crosshair-active');
        const panel = document.createElement('div');
        panel.className = 'terminal-crosshair-panel';

        const header = document.createElement('div');
        header.className = 'terminal-crosshair-header';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'terminal-crosshair-date';
        dateSpan.id = 'terminalCrosshairDate';
        header.appendChild(dateSpan);

        const body = document.createElement('div');
        body.className = 'terminal-crosshair-body';

        const listDiv = document.createElement('div');
        listDiv.id = 'terminalCrosshairList';
        listDiv.className = 'terminal-crosshair-list';
        body.appendChild(listDiv);

        const rangeDiv = document.createElement('div');
        rangeDiv.id = 'terminalCrosshairRange';
        rangeDiv.className = 'terminal-crosshair-range';
        rangeDiv.hidden = true;
        body.appendChild(rangeDiv);

        panel.appendChild(header);
        panel.appendChild(body);

        overlay.appendChild(panel);
        terminalElement.appendChild(overlay);
    }

    const details = {
        date: overlay.querySelector('#terminalCrosshairDate'),
        list: overlay.querySelector('#terminalCrosshairList'),
        range: overlay.querySelector('#terminalCrosshairRange'),
    };

    crosshairOverlay = overlay;
    crosshairDetails = details;

    overlay.addEventListener('transitionend', () => {
        if (!overlay.classList.contains('terminal-crosshair-active')) {
            overlay.style.visibility = 'hidden';
        }
    });

    return { overlay, details };
}

function updateCrosshairDetailsList(detailsList, snapshot) {
    if (typeof detailsList.replaceChildren === 'function') {
        detailsList.replaceChildren();
    } else {
        detailsList.textContent = '';
    }

    if (snapshot.header) {
        const headerDiv = document.createElement('div');
        headerDiv.className = 'terminal-crosshair-header';
        headerDiv.textContent = snapshot.header;
        detailsList.appendChild(headerDiv);
    }

    if (Array.isArray(snapshot.series)) {
        snapshot.series.forEach((series) => {
            const formattedLines = series.formatted.split('\n');
            const mainVal = formattedLines[0];

            const rowDiv = document.createElement('div');
            rowDiv.className = 'terminal-crosshair-row';

            const keySpan = document.createElement('span');
            keySpan.className = 'terminal-crosshair-key';

            const dotSpan = document.createElement('span');
            dotSpan.className = 'terminal-crosshair-dot';
            dotSpan.style.background = series.color;

            keySpan.appendChild(dotSpan);
            keySpan.appendChild(document.createTextNode(' ' + (series.label || series.key)));

            const valSpan = document.createElement('span');
            valSpan.className = 'terminal-crosshair-value';
            valSpan.textContent = mainVal;

            rowDiv.appendChild(keySpan);
            rowDiv.appendChild(valSpan);

            if (formattedLines[1]) {
                const breakdownDiv = document.createElement('div');
                breakdownDiv.className = 'terminal-crosshair-breakdown';
                breakdownDiv.textContent = formattedLines[1];
                rowDiv.appendChild(breakdownDiv);
            }

            detailsList.appendChild(rowDiv);
        });
    }
}

function updateCrosshairRangeDetails(rangeContainer, rangeSummary) {
    if (!rangeSummary) {
        rangeContainer.hidden = true;
        if (typeof rangeContainer.replaceChildren === 'function') {
            rangeContainer.replaceChildren();
        } else {
            rangeContainer.textContent = '';
        }
        return;
    }

    if (typeof rangeContainer.replaceChildren === 'function') {
        rangeContainer.replaceChildren();
    } else {
        rangeContainer.textContent = '';
    }

    const durationLabel =
        rangeSummary.durationDays >= 1
            ? `${Math.round(rangeSummary.durationDays)} day${
                  Math.round(rangeSummary.durationDays) === 1 ? '' : 's'
              }`
            : `${Math.max(1, Math.round(rangeSummary.durationMs / (1000 * 60 * 60)))} hrs`;

    const startLabel = formatCrosshairDateLabel(rangeSummary.start);
    const endLabel = formatCrosshairDateLabel(rangeSummary.end);

    const headerDiv = document.createElement('div');
    headerDiv.className = 'terminal-crosshair-range-header';
    headerDiv.textContent = `${startLabel} → ${endLabel} · ${durationLabel}`;
    rangeContainer.appendChild(headerDiv);

    if (rangeSummary.entries && rangeSummary.entries.length > 0) {
        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'terminal-crosshair-range-body';

        rangeSummary.entries.forEach((entry) => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'terminal-crosshair-range-row';

            const keySpan = document.createElement('span');
            keySpan.className = 'terminal-crosshair-key';

            const dotSpan = document.createElement('span');
            dotSpan.className = 'terminal-crosshair-dot';
            dotSpan.style.background = entry.color;

            keySpan.appendChild(dotSpan);
            keySpan.appendChild(document.createTextNode(' ' + entry.label));

            const valSpan = document.createElement('span');
            valSpan.className = 'terminal-crosshair-value';
            valSpan.textContent =
                entry.deltaFormatted +
                (entry.percentFormatted ? ` (${entry.percentFormatted})` : '');

            rowDiv.appendChild(keySpan);
            rowDiv.appendChild(valSpan);
            bodyDiv.appendChild(rowDiv);
        });

        rangeContainer.appendChild(bodyDiv);
    }

    rangeContainer.hidden = false;
}

export function updateTerminalCrosshair(snapshot, rangeSummary) {
    const { overlay, details } = ensureCrosshairOverlay();
    if (!overlay || !details) {
        return;
    }

    if (!snapshot) {
        overlay.classList.remove('terminal-crosshair-active');
        if (crosshairTimeout) {
            clearTimeout(crosshairTimeout);
        }
        crosshairTimeout = setTimeout(() => {
            overlay.style.visibility = 'hidden';
        }, 160);
        return;
    }

    if (crosshairTimeout) {
        clearTimeout(crosshairTimeout);
        crosshairTimeout = null;
    }

    overlay.style.visibility = 'visible';
    requestAnimationFrame(() => overlay.classList.add('terminal-crosshair-active'));

    if (details.date) {
        details.date.textContent = snapshot.dateLabel || '';
    }

    if (details.list && snapshot) {
        updateCrosshairDetailsList(details.list, snapshot);
    }

    if (details.range) {
        updateCrosshairRangeDetails(details.range, rangeSummary);
    }
}

export function initTerminal({
    filterAndSort,
    toggleTable,
    closeAllFilterDropdowns,
    resetSortState,
    chartManager,
    onCommandExecuted,
}) {
    const terminalInput = document.getElementById('terminalInput');
    const terminal = document.getElementById('terminal');
    const outputContainer = document.getElementById('terminalOutput');

    function appendMessage(message) {
        if (!outputContainer) {
            return;
        }
        const pre = document.createElement('pre');
        pre.textContent = message;
        outputContainer.appendChild(pre);
        outputContainer.scrollTop = outputContainer.scrollHeight;
        requestFadeUpdate(outputContainer);
    }
    async function processCommand(command) {
        if (!outputContainer) {
            return;
        }
        const promptDiv = document.createElement('div');
        const promptSpan = document.createElement('span');
        promptSpan.className = 'prompt-user';
        promptSpan.textContent = 'lz@fund:~$ ';
        promptDiv.appendChild(promptSpan);
        promptDiv.appendChild(document.createTextNode(command));
        outputContainer.appendChild(promptDiv);
        requestFadeUpdate();

        await executeCommand(command, {
            appendMessage,
            terminalInput,
            chartManager,
            filterAndSort,
            toggleTable,
            closeAllFilterDropdowns,
            resetSortState,
            onCommandExecuted,
        });

        outputContainer.scrollTop = outputContainer.scrollHeight;
    }

    async function processEnterKey(input) {
        if (input.value.trim()) {
            const command = input.value.trim();
            pushCommandHistory(command);
            resetHistoryIndex();
            await processCommand(command);
            input.value = '';
        }
        resetAutocompleteState();
        requestFadeUpdate();
    }

    function processArrowUp(e, input) {
        e.preventDefault();
        if (transactionState.historyIndex < transactionState.commandHistory.length - 1) {
            setHistoryIndex(transactionState.historyIndex + 1);
            input.value = transactionState.commandHistory[transactionState.historyIndex];
        }
        resetAutocompleteState();
        requestFadeUpdate();
    }

    function processArrowDown(e, input) {
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
    }

    function processArrowLeftRight(e, input, direction) {
        if (input.value.trim() === '' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            cycleCurrency(direction);
        } else if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            cycleCurrency(direction);
        }
        resetAutocompleteState();
        requestFadeUpdate();
    }

    async function handleTerminalInput(e) {
        const input = e.target;
        switch (e.key) {
            case 'Enter':
                await processEnterKey(input);
                break;
            case 'ArrowUp':
                processArrowUp(e, input);
                break;
            case 'ArrowDown':
                processArrowDown(e, input);
                break;
            case 'ArrowLeft':
                processArrowLeftRight(e, input, -1);
                break;
            case 'ArrowRight':
                processArrowLeftRight(e, input, 1);
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
        requestFadeUpdate(outputContainer);
    });

    if (outputContainer) {
        // Initialize scroll fading
        initFade(outputContainer);
    }

    return {
        processCommand,
    };
}
