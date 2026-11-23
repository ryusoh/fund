import { setAnalysisAutocompleteSymbols } from '../autocomplete.js';

let labModulePromise = null;
let paneInitialized = false;

function loadLabModule() {
    if (!labModulePromise) {
        labModulePromise = import('@pages/analysis/lab.js');
    }
    return labModulePromise;
}

const USAGE_LINE = 'Usage: analysis | analysis <TICKER> [full] | analysis close';

async function openAnalysisPane(lab) {
    const section = document.getElementById('analysisSection');
    if (!section) {
        return null;
    }
    if (!paneInitialized) {
        paneInitialized = true;
        await lab.initAnalysisPane(section);
    }
    setAnalysisAutocompleteSymbols(lab.getAnalysisSymbols());
    const table = document.querySelector('.table-responsive-container');
    if (table) {
        table.classList.add('is-hidden');
    }
    const chartSection = document.getElementById('runningAmountSection');
    if (chartSection) {
        chartSection.classList.add('is-hidden');
    }
    section.classList.remove('is-hidden');
    return section;
}

function handleCloseCommand(appendMessage) {
    const section = document.getElementById('analysisSection');
    if (section) {
        section.classList.add('is-hidden');
    }
    appendMessage('Analysis pane closed.');
}

function formatBoardMessage(board) {
    if (!board || !Array.isArray(board.rows) || board.rows.length === 0) {
        return `Portfolio Decision Board — no tickers loaded.\n${USAGE_LINE}`;
    }
    const summaryRows = board.rows
        .map(
            (row) => `${row.symbol}: ${row.decision?.verdictDisplay || row.decision?.verdictLabel}`
        )
        .join(' | ');
    const wCurrPct = (board.totalCurrentWeight * 100).toFixed(1);
    const wRecPct = (board.totalRecommendedWeight * 100).toFixed(1);
    const cashPct = (board.residualTargetCash * 100).toFixed(1);
    return (
        `PORT Decision Board — ${summaryRows}\n` +
        `Σw_curr ${wCurrPct}% · Σw_rec ${wRecPct}% · Residual Target Cash ${cashPct}%\n` +
        USAGE_LINE
    );
}

export async function handleAnalysisCommand(args, { appendMessage }) {
    const first = args[0] ? String(args[0]).trim() : '';
    if (first.toLowerCase() === 'close') {
        handleCloseCommand(appendMessage);
        return;
    }

    const lab = await loadLabModule();
    const section = await openAnalysisPane(lab);
    if (!section) {
        appendMessage('Analysis pane is not available on this page.');
        return;
    }

    if (!first) {
        const board = lab.showDecisionBoard();
        appendMessage(formatBoardMessage(board));
        return;
    }

    const flag = args[1] ? String(args[1]).trim().toLowerCase() : '';
    if (flag && flag !== 'full') {
        appendMessage(`Unknown analysis option: ${args[1]}\n${USAGE_LINE}`);
        return;
    }

    const horizonMode = flag === 'full' ? 'full' : '2y';
    const symbol = first.toUpperCase();
    const snapshot = lab.showTickerDecision(symbol, { horizonMode });
    if (snapshot) {
        appendMessage(snapshot.text);
        return;
    }

    const available = lab.getAnalysisSymbols().join(', ');
    appendMessage(
        `Unknown analysis symbol or subcommand: ${first}\nAvailable symbols: ${available}\n${USAGE_LINE}`
    );
}
