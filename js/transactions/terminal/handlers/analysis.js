import { setAnalysisAutocompleteSymbols } from '../autocomplete.js';
import { updateCrosshairUI } from '../../chart/interaction.js';

let labModulePromise = null;
let paneInitialized = false;

function loadLabModule() {
    if (!labModulePromise) {
        labModulePromise = import('@pages/analysis/lab.js');
    }
    return labModulePromise;
}

const USAGE_LINE = 'Usage: plot valuation | plot valuation <TICKER> [all] (alias: p val)';

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

function getVisibleAnalysisSection() {
    if (!paneInitialized) {
        return null;
    }
    const section = document.getElementById('analysisSection');
    return section && !section.classList.contains('is-hidden') ? section : null;
}

async function handleBoardSubcommand(lab, appendMessage) {
    const visibleSection = getVisibleAnalysisSection();
    if (visibleSection && lab.getActiveAnalysisConfig() === null) {
        visibleSection.classList.add('is-hidden');
        updateCrosshairUI(null, null);
        appendMessage('Hidden valuation board.');
        return;
    }
    const section = await openAnalysisPane(lab);
    if (!section) {
        appendMessage('Valuation pane is not available on this page.');
        return;
    }
    appendMessage(formatBoardMessage(lab.showDecisionBoard()));
}

async function handleTickerSubcommand(lab, rawSymbol, horizonMode, appendMessage) {
    const symbol = rawSymbol.toUpperCase();
    const visibleSection = getVisibleAnalysisSection();
    const activeCfg = visibleSection ? lab.getActiveAnalysisConfig() : null;
    const activeHorizon =
        typeof lab.getActiveAnalysisHorizonMode === 'function'
            ? lab.getActiveAnalysisHorizonMode()
            : '2y';
    if (visibleSection && activeCfg?.symbol === symbol && activeHorizon === horizonMode) {
        visibleSection.classList.add('is-hidden');
        updateCrosshairUI(null, null);
        appendMessage(`Hidden ${symbol} valuation chart.`);
        return;
    }

    const section = await openAnalysisPane(lab);
    if (!section) {
        appendMessage('Valuation pane is not available on this page.');
        return;
    }

    const snapshot = lab.showTickerDecision(symbol, { horizonMode });
    if (snapshot) {
        appendMessage(snapshot.text);
        return;
    }

    const available = lab.getAnalysisSymbols().join(', ');
    appendMessage(
        `Unknown valuation symbol: ${rawSymbol}\nAvailable symbols: ${available}\n${USAGE_LINE}`
    );
}

export async function handleAnalysisCommand(args, { appendMessage }) {
    const first = args[0] ? String(args[0]).trim() : '';
    const flag = args[1] ? String(args[1]).trim().toLowerCase() : '';
    if (first && flag && flag !== 'all') {
        appendMessage(`Unknown valuation option: ${args[1]}\n${USAGE_LINE}`);
        return;
    }

    const lab = await loadLabModule();
    if (!first) {
        await handleBoardSubcommand(lab, appendMessage);
        return;
    }

    const horizonMode = flag === 'all' ? 'full' : '2y';
    await handleTickerSubcommand(lab, first, horizonMode, appendMessage);
}
