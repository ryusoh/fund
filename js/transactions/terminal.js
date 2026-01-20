import {
    transactionState,
    pushCommandHistory,
    resetHistoryIndex,
    setHistoryIndex,
} from './state.js';

import { executeCommand } from './terminal/commands.js';
import { autocompleteCommand, resetAutocompleteState } from './terminal/autocomplete.js';

import { initFade, requestFadeUpdate } from './fade.js';
import { cycleCurrency } from '@ui/currencyToggleManager.js';

let crosshairOverlay = null;
let crosshairDetails = null;
let crosshairTimeout = null;
const crosshairDateFormatter =
    typeof Intl !== 'undefined'
        ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
        : null;

let lastEmptyFilterTerm = null;

function formatCrosshairDateLabel(time) {
    if (!Number.isFinite(time)) {
        return '';
    }
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    if (crosshairDateFormatter) {
        return crosshairDateFormatter.format(date);
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
        overlay.innerHTML = `
            <div class="terminal-crosshair-panel">
                <div class="terminal-crosshair-header">
                    <span class="terminal-crosshair-date" id="terminalCrosshairDate"></span>
                </div>
                <div class="terminal-crosshair-body">
                    <div id="terminalCrosshairList" class="terminal-crosshair-list"></div>
                    <div id="terminalCrosshairRange" class="terminal-crosshair-range" hidden></div>
                </div>
            </div>
        `;
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

    if (details.list) {
        const markup = snapshot.series
            .map(
                (series) => `
                <div class="terminal-crosshair-row">
                    <span class="terminal-crosshair-key">
                        <span class="terminal-crosshair-dot" style="background:${series.color};"></span>
                        ${series.label}
                    </span>
                    <span class="terminal-crosshair-value">${series.formatted}</span>
                </div>
            `
            )
            .join('');
        details.list.innerHTML = markup;
    }

    if (details.range) {
        if (!rangeSummary) {
            details.range.hidden = true;
            details.range.innerHTML = '';
        } else {
            const durationLabel =
                rangeSummary.durationDays >= 1
                    ? `${Math.round(rangeSummary.durationDays)} day${
                          Math.round(rangeSummary.durationDays) === 1 ? '' : 's'
                      }`
                    : `${Math.max(1, Math.round(rangeSummary.durationMs / (1000 * 60 * 60)))} hrs`;
            const entriesMarkup = rangeSummary.entries
                .map(
                    (entry) => `
                        <div class="terminal-crosshair-range-row">
                            <span class="terminal-crosshair-key">
                                <span class="terminal-crosshair-dot" style="background:${entry.color};"></span>
                                ${entry.label}
                            </span>
                            <span class="terminal-crosshair-value">${entry.deltaFormatted}${
                                entry.percentFormatted ? ` (${entry.percentFormatted})` : ''
                            }</span>
                        </div>
                    `
                )
                .join('');
            const startLabel = formatCrosshairDateLabel(rangeSummary.start);
            const endLabel = formatCrosshairDateLabel(rangeSummary.end);
            details.range.innerHTML = `
                <div class="terminal-crosshair-range-header">${startLabel} → ${endLabel} · ${durationLabel}</div>
                ${entriesMarkup ? `<div class="terminal-crosshair-range-body">${entriesMarkup}</div>` : ''}
            `;
            details.range.hidden = false;
        }
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
        const prompt = `<div><span class="prompt-user">lz@fund:~$</span> ${command}</div>`;
        outputContainer.innerHTML += prompt;
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

    async function handleTerminalInput(e) {
        const input = e.target;
        switch (e.key) {
            case 'Enter':
                if (input.value.trim()) {
                    const command = input.value.trim();
                    pushCommandHistory(command);
                    resetHistoryIndex();
                    await processCommand(command);
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

            case 'ArrowLeft':
                // Only cycle currency if the input is empty and no modifier keys (don't interfere when user is editing text)
                if (input.value.trim() === '' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    cycleCurrency(-1); // Move left/cycle backward
                } else if (e.ctrlKey || e.metaKey) {
                    // Process Cmd/Ctrl+arrows synchronously to prevent double firing
                    e.preventDefault();
                    cycleCurrency(-1); // Move left/cycle backward
                }
                resetAutocompleteState();
                requestFadeUpdate();
                break;
            case 'ArrowRight':
                // Only cycle currency if the input is empty and no modifier keys (don't interfere when user is editing text)
                if (input.value.trim() === '' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    cycleCurrency(1); // Move right/cycle forward
                } else if (e.ctrlKey || e.metaKey) {
                    // Process Cmd/Ctrl+arrows synchronously to prevent double firing
                    e.preventDefault();
                    cycleCurrency(1); // Move right/cycle forward
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
