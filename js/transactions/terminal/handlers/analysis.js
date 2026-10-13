// Analysis lab handler — opens the analysis pane (Section D of
// docs/terminal-analysis-merge.md) and drives its per-section function views.
// The lab module is lazy-loaded on first use (chart-renderer precedent,
// js/transactions/chart.js:39-48).

import { convertValueToCurrency, formatCurrency as formatInSelectedCurrency } from '../../utils.js';
import { getSelectedCurrency } from '../../state.js';

let labModulePromise = null;
let paneInitialized = false;

function loadLabModule() {
    if (!labModulePromise) {
        labModulePromise = import('@pages/analysis/lab.js');
    }
    return labModulePromise;
}

// Function subcommands mapped to their pane section. `scenarios` and `value`
// live inside the overview block (summary + scenario cards + value bands).
const SECTION_BY_SUBCOMMAND = {
    scenarios: 'overview',
    value: 'overview',
    kelly: 'kelly',
    belief: 'belief',
    evidence: 'evidence',
    predictions: 'predictions',
    journal: 'journal',
};

const USAGE_LINE =
    'Usage: analysis [scenarios|value|kelly|belief|evidence|predictions|journal|mc [paths]|bull|bear|reset|close] or analysis <TICKER>';

// Analysis prices are current USD snapshots, not dated series — convert with
// the latest FX rate, never a historical one (WO14 guardrail,
// docs/terminal-analysis-merge.md). A far-future date resolves to the newest
// available rate in findFxRate's closest-date search.
const LATEST_FX_DATE = '9999-12-31';

function formatUsd(value) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    return formatInSelectedCurrency(
        convertValueToCurrency(value, LATEST_FX_DATE, getSelectedCurrency())
    );
}

function buildSnapshotLine(lab, func) {
    const config = lab.getActiveAnalysisConfig();
    if (!config || !config.metrics) {
        return `Showing analysis '${func}'.`;
    }
    const metrics = config.metrics;
    const bits = [config.symbol];
    if (Number.isFinite(metrics.price)) {
        bits.push(`price ${formatUsd(metrics.price)}`);
    }
    if (Number.isFinite(metrics.eps)) {
        bits.push(`EPS ${formatUsd(metrics.eps)}`);
    }
    if (Number.isFinite(metrics.volatility)) {
        bits.push(`vol ${(metrics.volatility * 100).toFixed(1)}%`);
    }
    if (Number.isFinite(metrics.horizon)) {
        bits.push(`${metrics.horizon}y horizon`);
    }
    return `Showing analysis '${func}' — ${bits.join(', ')}.`;
}

async function openAnalysisPane(lab) {
    const section = document.getElementById('analysisSection');
    if (!section) {
        return null;
    }
    if (!paneInitialized) {
        paneInitialized = true;
        await lab.initAnalysisPane(section);
    }
    // Pane-exclusion pattern (inverse of viewUtils.ensureTransactionTableVisible)
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

async function handleMonteCarlo(lab, args, appendMessage) {
    const parsed = args[1] ? parseInt(args[1], 10) : NaN;
    const paths = Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
    lab.showAnalysisSection('mc');
    const result = await lab.runMonteCarloSimulation(paths);
    if (!result) {
        appendMessage('Monte Carlo simulation failed; see the analysis pane for details.');
        return;
    }
    appendMessage(
        `MC (${paths.toLocaleString('en-US')} paths) — VaR (95%): ${formatUsd(
            result.VaR_95
        )}, CVaR (95%): ${formatUsd(result.CVaR_95)}.`
    );
}

function handleSandbox(lab, action, appendMessage) {
    const priors = lab.applyBayesSandbox(action);
    if (!priors) {
        appendMessage('Belief sandbox unavailable — no active scenario config.');
        return;
    }
    const text = priors.map((p) => `${p.name}: ${(p.prob * 100).toFixed(1)}%`).join(', ');
    appendMessage(`Belief sandbox (${action}) — ${text}.`);
}

export async function handleAnalysisCommand(args, { appendMessage }) {
    if (args[0] === 'close') {
        const section = document.getElementById('analysisSection');
        if (section) {
            section.classList.add('is-hidden');
        }
        appendMessage('Analysis pane closed.');
        return;
    }

    const lab = await loadLabModule();
    const section = await openAnalysisPane(lab);
    if (!section) {
        appendMessage('Analysis pane is not available on this page.');
        return;
    }

    if (args.length === 0) {
        lab.showAnalysisSection('overview');
        const symbols = lab.getAnalysisSymbols().join(', ');
        appendMessage(`Analysis lab — securities: ${symbols}.\n${USAGE_LINE}`);
        return;
    }

    const sub = args[0];
    if (SECTION_BY_SUBCOMMAND[sub]) {
        lab.showAnalysisSection(SECTION_BY_SUBCOMMAND[sub]);
        appendMessage(buildSnapshotLine(lab, sub));
        return;
    }
    if (sub === 'mc') {
        await handleMonteCarlo(lab, args, appendMessage);
        return;
    }
    if (sub === 'bull' || sub === 'bear' || sub === 'reset') {
        handleSandbox(lab, sub, appendMessage);
        return;
    }

    // Anything else is a ticker token (args arrive lowercased from commands.js).
    const symbol = sub.toUpperCase();
    if (lab.setActiveAnalysisSymbol(symbol)) {
        appendMessage(`Analysis context: ${symbol}.`);
        return;
    }
    appendMessage(
        `Unknown analysis symbol or subcommand: ${sub}\nAvailable symbols: ${lab
            .getAnalysisSymbols()
            .join(', ')}\n${USAGE_LINE}`
    );
}
