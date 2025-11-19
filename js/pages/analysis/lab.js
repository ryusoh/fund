/* global Worker */
import { compactNumber } from '../../utils/formatting.js';
import { BayesianEngine } from './bayes.js';

const tickerListEl = document.getElementById('tickerList');
const summaryStatsEl = document.getElementById('summaryStats');
const scenarioResultsEl = document.getElementById('scenarioResults');
const valueBandsEl = document.getElementById('valueBands');

// New Elements
const btnBayesBull = document.getElementById('btnBayesBull');
const btnBayesBear = document.getElementById('btnBayesBear');
const btnBayesReset = document.getElementById('btnBayesReset');
const bayesOutput = document.getElementById('bayesOutput');
const btnRunMonteCarlo = document.getElementById('btnRunMonteCarlo');
const monteCarloCanvas = document.getElementById('monteCarloCanvas');
const riskMetricsEl = document.getElementById('riskMetrics');

const state = {
    configs: [],
    activeSymbol: null,
    bayesEngine: null,
    monteCarloWorker: new Worker('../js/pages/analysis/monte_carlo.worker.js'),
};
const DATA_CACHE_BUST = Date.now().toString();
const thesisTitleCache = new Map();

export async function fetchJson(path) {
    const url = new URL(path, window.location.href);
    url.searchParams.set('v', DATA_CACHE_BUST);
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load ${path}`);
    }
    return response.json();
}

export async function fetchText(path) {
    const url = new URL(path, window.location.href);
    url.searchParams.set('v', DATA_CACHE_BUST);
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load ${path}`);
    }
    return response.text();
}

function formatPercent(value) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    const pct = value * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
}

function formatCurrency(value) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    return `$${value.toFixed(2)}`;
}

function formatCompactCurrency(value) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    return `$${compactNumber(value)}`;
}

function resolveNumeric(manualValue, marketValue, fallback = 0, treatZeroAsMissing = false) {
    const manualNum = Number(manualValue);
    if (Number.isFinite(manualNum) && (!treatZeroAsMissing || manualNum !== 0)) {
        return manualNum;
    }
    const marketNum = Number(marketValue);
    if (Number.isFinite(marketNum)) {
        return marketNum;
    }
    return fallback;
}

function getPreferences(config) {
    if (!config || typeof config !== 'object') {
        return {};
    }
    const model = config.model;
    if (!model || typeof model !== 'object') {
        return {};
    }
    return model.preferences && typeof model.preferences === 'object' ? model.preferences : {};
}

function getOverrides(config) {
    const preferences = getPreferences(config);
    if (preferences.overrides && typeof preferences.overrides === 'object') {
        return preferences.overrides;
    }
    return {};
}

function stripWrappingQuotes(value) {
    if (typeof value !== 'string') {
        return value;
    }
    const trimmed = value.trim();
    if (trimmed.length < 2) {
        return trimmed;
    }
    const start = trimmed[0];
    const end = trimmed[trimmed.length - 1];
    const quotePairs = [
        ['"', '"'],
        ["'", "'"],
        ['“', '”'],
        ['‘', '’'],
    ];
    const hasPair = quotePairs.some(([open, close]) => start === open && end === close);
    return hasPair ? trimmed.slice(1, -1).trim() : trimmed;
}

export function extractScenarioTitles(markdown) {
    if (typeof markdown !== 'string' || !markdown.length) {
        return null;
    }
    const regex = /^###\s+(.+)$/gim;
    const titles = {};
    let match = regex.exec(markdown);
    while (match) {
        const heading = match[1]?.trim() || '';
        const scenarioMatch = heading.match(/\b(Bull|Base|Bear)\b(?:\s+Case)?\s*(?:[-–]\s*(.+))?/i);
        if (scenarioMatch) {
            const key = scenarioMatch[1].toLowerCase();
            const descriptor = stripWrappingQuotes(scenarioMatch[2] || '');
            if (descriptor) {
                titles[key] = descriptor;
            }
        }
        match = regex.exec(markdown);
    }
    return Object.keys(titles).length ? titles : null;
}

async function fetchThesisScenarioTitles(symbol) {
    if (!symbol) {
        return null;
    }
    if (thesisTitleCache.has(symbol)) {
        return thesisTitleCache.get(symbol);
    }
    try {
        const markdown = await fetchText(`../docs/thesis/${symbol}.md`);
        const titles = extractScenarioTitles(markdown);
        thesisTitleCache.set(symbol, titles);
        return titles;
    } catch {
        thesisTitleCache.set(symbol, null);
        return null;
    }
}

function applyThesisScenarioTitles(config, titles) {
    if (!titles || !config?.scenarios?.length) {
        return;
    }
    config.scenarios = config.scenarios.map((scenario) => {
        const key = (scenario.id || scenario.name || '').toLowerCase();
        const descriptor = titles[key];
        if (!descriptor) {
            return scenario;
        }
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        return {
            ...scenario,
            name: `${label} – ${descriptor}`,
        };
    });
}

function getBenchmarkDescriptor(preferences) {
    const benchmark = preferences?.benchmark;
    if (benchmark && typeof benchmark === 'object') {
        return {
            type: benchmark.type || 'annualReturn',
            name: benchmark.name || 'Benchmark',
            value: Number(benchmark.value ?? 0) || 0,
        };
    }
    const value = Number(benchmark ?? 0) || 0;
    return { type: 'annualReturn', name: 'Benchmark', value };
}

function getEffectivePrice(config) {
    const overrides = getOverrides(config);
    const market = config.market || {};
    return resolveNumeric(overrides.price, market.price, 0, true);
}

function getEffectiveEps(config) {
    const overrides = getOverrides(config);
    const market = config.market || {};
    return resolveNumeric(overrides.eps, market.eps, 0, true);
}

function getEffectiveVolatility(config) {
    const overrides = getOverrides(config);
    const market = config.market || {};
    const risk = config.risk || {};
    return resolveNumeric(overrides.volatility, risk.volatility ?? market.volatility, 0.35, true);
}

function getSharesOutstanding(config) {
    const market = config.market || {};
    const direct = Number(
        market.sharesOutstanding ?? market.shares ?? market.basicShares ?? market.floatShares
    );
    if (Number.isFinite(direct) && direct > 0) {
        return direct;
    }
    const price = Number(market.price);
    const marketCap = Number(market.marketCap);
    if (Number.isFinite(price) && price > 0 && Number.isFinite(marketCap) && marketCap > 0) {
        const derived = marketCap / price;
        if (Number.isFinite(derived) && derived > 0) {
            return derived;
        }
    }
    return null;
}

function getAsOfYear(config) {
    const asOf = config?.meta?.asOf;
    if (typeof asOf === 'string') {
        const parsed = new Date(asOf);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.getUTCFullYear();
        }
    }
    return new Date().getUTCFullYear();
}

function computeExitYear(config, horizon) {
    const baseYear = getAsOfYear(config);
    const numericHorizon = Number(horizon);
    if (!Number.isFinite(numericHorizon)) {
        return baseYear;
    }
    const roundedHorizon = Math.max(0, Math.round(numericHorizon));
    return baseYear + roundedHorizon;
}

function normalizeScenario(scenario) {
    const name = scenario.name || scenario.id || 'Scenario';
    const growth = scenario.growth || {};
    const valuation = scenario.valuation || {};
    const epsCagrRaw = Number(growth.epsCagr ?? scenario.epsCagr ?? 0);
    const epsCagr = Number.isFinite(epsCagrRaw) ? epsCagrRaw : 0;
    const exitPeRaw = Number(valuation.exitPe ?? scenario.exitPe ?? 1);
    const exitPe = Number.isFinite(exitPeRaw) ? exitPeRaw : 1;
    const epsSigmaRaw = Number(growth.epsCagrSigma ?? scenario.epsCagrSigma);
    const epsSigma = Number.isFinite(epsSigmaRaw) ? epsSigmaRaw : null;
    const exitSigmaRaw = Number(valuation.exitPeSigma ?? scenario.exitPeSigma);
    const exitSigma = Number.isFinite(exitSigmaRaw) ? exitSigmaRaw : null;
    const probRaw = Number(scenario.prob ?? 0);
    const precomputedMultipleRaw = Number(scenario.precomputedMultiple ?? scenario.multiple);
    const precomputedMultiple = Number.isFinite(precomputedMultipleRaw)
        ? precomputedMultipleRaw
        : null;
    const precomputedCagrRaw = Number(scenario.precomputedCagr ?? scenario.scenarioCagr);
    const precomputedCagr = Number.isFinite(precomputedCagrRaw) ? precomputedCagrRaw : null;
    const precomputedEarningsCagrRaw = Number(scenario.precomputedEarningsCagr);
    const precomputedEarningsCagr = Number.isFinite(precomputedEarningsCagrRaw)
        ? precomputedEarningsCagrRaw
        : null;
    return {
        id: scenario.id || name.toLowerCase(),
        name,
        prob: Number.isFinite(probRaw) ? probRaw : 0,
        growth: {
            epsCagr,
            epsCagrSigma: epsSigma,
        },
        valuation: {
            exitPe,
            exitPeSigma: exitSigma,
        },
        notes: scenario.notes ?? null,
        precomputedMultiple,
        precomputedCagr,
        precomputedEarningsCagr,
    };
}

function diffDescriptor(price, entry) {
    if (!Number.isFinite(entry) || entry <= 0) {
        return 'n/a';
    }
    const diff = ((price - entry) / entry) * 100;
    const direction = diff >= 0 ? 'above' : 'below';
    return `${Math.abs(diff).toFixed(1)}% ${direction} target`;
}

function computeScenarioOutcome(scenario, { price, eps, horizon }) {
    const safeHorizon = horizon > 0 ? horizon : 1;
    const baseProbRaw = Number(scenario.prob ?? 0);
    const base = {
        id: scenario.id || scenario.name || 'scenario',
        name: scenario.name || scenario.id || 'Scenario',
        prob: Number.isFinite(baseProbRaw) ? baseProbRaw : 0,
    };
    const entryEps = Number.isFinite(eps) && eps > 0 ? eps : null;
    const fallbackEpsCagr =
        Number.isFinite(scenario?.growth?.epsCagr) && scenario.growth.epsCagr !== null
            ? scenario.growth.epsCagr
            : Number.isFinite(scenario?.epsCagr)
              ? scenario.epsCagr
              : null;
    const deriveEarningsCagr = (terminalValue) => {
        if (entryEps !== null && Number.isFinite(terminalValue) && terminalValue > 0) {
            const ratio = terminalValue / entryEps;
            if (ratio > 0) {
                const derived = ratio ** (1 / safeHorizon) - 1;
                if (Number.isFinite(derived)) {
                    return derived;
                }
            }
        }
        return fallbackEpsCagr;
    };

    const precomputedMultipleRaw = Number(scenario.precomputedMultiple ?? scenario.multiple);
    if (Number.isFinite(precomputedMultipleRaw) && precomputedMultipleRaw > 0) {
        const multiple = precomputedMultipleRaw;
        const precomputedCagrRaw = Number(scenario.precomputedCagr ?? scenario.scenarioCagr);
        const priceCagr = Number.isFinite(precomputedCagrRaw)
            ? precomputedCagrRaw
            : multiple > 0
              ? multiple ** (1 / safeHorizon) - 1
              : 0;
        const impliedEpsRaw = Number(scenario.precomputedTerminalEps ?? scenario.terminalEps);
        const terminalEps = Number.isFinite(impliedEpsRaw) ? impliedEpsRaw : null;
        const precomputedEarningsCagrRaw = Number(scenario.precomputedEarningsCagr);
        const earningsCagr = Number.isFinite(precomputedEarningsCagrRaw)
            ? precomputedEarningsCagrRaw
            : deriveEarningsCagr(terminalEps);
        return { ...base, multiple, priceCagr, earningsCagr, terminalEps };
    }

    const growth = scenario.growth || {};
    const valuation = scenario.valuation || {};
    const epsCagrRaw = Number(growth.epsCagr ?? scenario.epsCagr ?? 0);
    const epsCagr = Number.isFinite(epsCagrRaw) ? epsCagrRaw : 0;
    const exitPeRaw = Number(valuation.exitPe ?? scenario.exitPe ?? 1);
    const exitPe = Number.isFinite(exitPeRaw) ? exitPeRaw : 1;
    const terminalEps = eps * (1 + epsCagr) ** horizon;
    const terminalPrice = terminalEps * exitPe;
    const multiple = price > 0 ? terminalPrice / price : 0;
    const priceCagr = multiple > 0 ? multiple ** (1 / safeHorizon) - 1 : 0;
    const earningsCagr = deriveEarningsCagr(terminalEps);
    return { ...base, multiple, priceCagr, earningsCagr, terminalEps };
}

function computeMetrics(config) {
    const preferences = getPreferences(config);
    const market = config.market || {};
    const scenarios = Array.isArray(config.scenarios) ? config.scenarios : [];
    const price = getEffectivePrice(config);
    const eps = getEffectiveEps(config);
    const volatility = getEffectiveVolatility(config);
    const horizonRaw = Number(preferences.horizon ?? 1);
    const horizon = Number.isFinite(horizonRaw) && horizonRaw > 0 ? horizonRaw : 1;
    const benchmarkDescriptor = getBenchmarkDescriptor(preferences);
    const benchmark = benchmarkDescriptor.value;
    const kellyScaleRaw = Number(preferences.kellyScale ?? 0.5);
    const kellyScale = Number.isFinite(kellyScaleRaw) ? kellyScaleRaw : 0.5;
    const targetCagrRaw = Number(preferences.targetCagr ?? 0.1);
    const targetCagr = Number.isFinite(targetCagrRaw) ? targetCagrRaw : 0.1;
    const exitYear = computeExitYear(config, horizon);
    const sharesOutstanding = getSharesOutstanding(config);

    const normalizedScenarios = scenarios.map((scenario) => normalizeScenario(scenario));
    const outcomes = normalizedScenarios.map((scenario) =>
        computeScenarioOutcome(scenario, { price, eps, horizon })
    );
    const expectedMultiple = outcomes.reduce(
        (sum, outcome) => sum + outcome.prob * outcome.multiple,
        0
    );
    const expectedCagr = expectedMultiple > 0 ? expectedMultiple ** (1 / horizon) - 1 : 0;
    const edge = expectedCagr - benchmark;
    const variance = volatility ** 2;
    const fullKelly = variance > 0 ? edge / variance : 0;
    const scaledKelly = fullKelly * kellyScale;
    const expectedTerminalPrice = expectedMultiple * price;
    const entryPriceForTarget =
        targetCagr > -1 && price > 0 ? expectedTerminalPrice / (1 + targetCagr) ** horizon : 0;

    return {
        outcomes,
        expectedMultiple,
        expectedCagr,
        edge,
        fullKelly,
        scaledKelly,
        expectedTerminalPrice,
        entryPriceForTarget,
        price,
        eps,
        horizon,
        benchmark,
        benchmarkDescriptor,
        market,
        volatility,
        kellyScale,
        targetCagr,
        exitYear,
        sharesOutstanding,
    };
}

function renderSummary(config) {
    if (!summaryStatsEl) {
        return;
    }
    summaryStatsEl.innerHTML = '';

    if (!config || !config.metrics) {
        summaryStatsEl.innerHTML =
            '<div style="color:var(--text-muted); padding:0 10px;">No metrics available</div>';
        return;
    }

    const metrics = config.metrics;
    const preferences = getPreferences(config);
    const benchmarkDescriptor = metrics.benchmarkDescriptor || getBenchmarkDescriptor(preferences);
    const edgeLabel = `Edge vs ${benchmarkDescriptor.name || 'Benchmark'}`;

    [
        { label: 'Expected CAGR', value: formatPercent(metrics.expectedCagr) },
        { label: edgeLabel, value: formatPercent(metrics.edge) },
        { label: 'Full Kelly', value: formatPercent(metrics.fullKelly) },
        { label: 'Scaled Kelly', value: formatPercent(metrics.scaledKelly) },
        { label: 'Price', value: formatCurrency(metrics.price) },
    ].forEach((stat) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `<h3>${stat.label}</h3><p>${stat.value}</p>`;
        summaryStatsEl.appendChild(card);
    });
}

function renderScenarioCards(config) {
    const outcomes = (config.metrics && config.metrics.outcomes) || [];
    scenarioResultsEl.innerHTML = '';
    const sharesOutstanding =
        config.metrics && Number.isFinite(config.metrics.sharesOutstanding)
            ? config.metrics.sharesOutstanding
            : null;
    outcomes.forEach((outcome) => {
        const terminalEps =
            outcome && Number.isFinite(outcome.terminalEps) ? outcome.terminalEps : null;
        const totalEarnings =
            terminalEps !== null && sharesOutstanding !== null
                ? terminalEps * sharesOutstanding
                : null;
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <h4>${outcome.name}</h4>
            <p>Prob: ${(outcome.prob * 100).toFixed(1)}%</p>
            <p>Multiple: ${outcome.multiple.toFixed(2)}x</p>
            <p>Price CAGR: ${formatPercent(outcome.priceCagr)}</p>
            <p>Earnings CAGR: ${formatPercent(outcome.earningsCagr)}</p>
            <p>Implied Annual EPS: ${formatCurrency(terminalEps)}</p>
            <p>Total Annual Earnings: ${formatCompactCurrency(totalEarnings)}</p>
        `;
        scenarioResultsEl.appendChild(card);
    });
}

function renderValueBands(config) {
    const preferences = getPreferences(config);
    const targetCagrRaw = Number(preferences.targetCagr ?? 0.1);
    const targetCagr = Number.isFinite(targetCagrRaw) ? targetCagrRaw : 0.1;
    const metrics = config.metrics;
    const exitYearValue = Number.isFinite(metrics.exitYear) ? metrics.exitYear : null;
    valueBandsEl.innerHTML = '';
    [
        { label: 'Expected Terminal Price', value: formatCurrency(metrics.expectedTerminalPrice) },
        {
            label: `Price for ${(targetCagr * 100).toFixed(1)}% CAGR`,
            value: formatCurrency(metrics.entryPriceForTarget),
        },
        {
            label: 'Current Price vs Value',
            value: diffDescriptor(metrics.price, metrics.entryPriceForTarget),
        },
        {
            label: 'Exit Year',
            value: exitYearValue ?? 'n/a',
        },
    ].forEach((band) => {
        const dt = document.createElement('dt');
        dt.textContent = band.label;
        const dd = document.createElement('dd');
        dd.textContent = band.value;
        valueBandsEl.append(dt, dd);
    });
}

function renderTickerList() {
    if (!tickerListEl) {
        return;
    }
    tickerListEl.innerHTML = '';

    if (!state.configs || !state.configs.length) {
        tickerListEl.innerHTML =
            '<span style="color:var(--text-muted); padding:0 10px;">No tickers loaded</span>';
        return;
    }

    const portfolio = state.configs.find((cfg) => cfg.symbol === 'PORT');
    const others = state.configs
        .filter((cfg) => cfg.symbol !== 'PORT')
        .sort((a, b) => b.weight - a.weight);

    if (portfolio) {
        appendTickerButton(portfolio, ' ticker-btn-port');
        if (others.length) {
            const divider = document.createElement('div');
            divider.className = 'ticker-divider';
            tickerListEl.appendChild(divider);
        }
    }

    others.forEach((config) => {
        appendTickerButton(config);
    });
}

function appendTickerButton(config, extraClass = '') {
    const button = document.createElement('button');
    const isActive = config.symbol === state.activeSymbol;
    button.className = `ticker-btn${extraClass}${isActive ? ' active' : ''}`;
    button.textContent = config.symbol;
    button.title = `${config.name} · ${formatPercent(config.weight)}`;
    button.addEventListener('click', () => {
        state.activeSymbol = config.symbol;
        renderTickerList();
        renderActiveTicker();
    });
    tickerListEl.appendChild(button);
}

function renderActiveTicker() {
    const config = state.configs.find((cfg) => cfg.symbol === state.activeSymbol);
    if (!config) {
        return;
    }
    // selectedTickerLabel and selectedTickerName elements were removed from HTML
    // so we no longer update them here.
    renderSummary(config);
    renderScenarioCards(config);
    renderValueBands(config);

    // Initialize Bayesian Engine
    state.bayesEngine = new BayesianEngine(config.scenarios);
    renderBayesOutput();

    // Reset Risk UI
    const ctx = monteCarloCanvas.getContext('2d');
    ctx.clearRect(0, 0, monteCarloCanvas.width, monteCarloCanvas.height);
    riskMetricsEl.innerHTML = '<p>Run simulation to see metrics.</p>';
}

// --- Bayesian Handlers ---

function renderBayesOutput() {
    if (!state.bayesEngine) {
        return;
    }
    const priors = state.bayesEngine.priors;
    bayesOutput.innerHTML = priors
        .map(
            (p) => `
        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed var(--ink); padding: 4px 0;">
            <span>${p.name}</span>
            <strong>${(p.prob * 100).toFixed(1)}%</strong>
        </div>
    `
        )
        .join('');
}

btnBayesBull.addEventListener('click', () => {
    if (state.bayesEngine) {
        state.bayesEngine.update('bullish', 0.6);
        renderBayesOutput();
    }
});

btnBayesBear.addEventListener('click', () => {
    if (state.bayesEngine) {
        state.bayesEngine.update('bearish', 0.6);
        renderBayesOutput();
    }
});

btnBayesReset.addEventListener('click', () => {
    const config = state.configs.find((cfg) => cfg.symbol === state.activeSymbol);
    if (config && state.bayesEngine) {
        state.bayesEngine.reset(config.scenarios);
        renderBayesOutput();
    }
});

// --- Monte Carlo Handlers ---

btnRunMonteCarlo.addEventListener('click', () => {
    const config = state.configs.find((cfg) => cfg.symbol === state.activeSymbol);
    if (!config) {
        return;
    }

    btnRunMonteCarlo.textContent = 'Running...';
    btnRunMonteCarlo.disabled = true;

    state.monteCarloWorker.postMessage({
        type: 'RUN_SIMULATION',
        payload: {
            price: config.metrics.price,
            eps: config.metrics.eps,
            scenarios: config.scenarios,
            volatility: config.metrics.volatility,
            horizon: config.metrics.horizon,
            paths: 10000,
        },
    });
});

state.monteCarloWorker.onmessage = function (e) {
    const { type, result } = e.data;
    if (type === 'SIMULATION_COMPLETE') {
        renderMonteCarloResults(result);
        btnRunMonteCarlo.textContent = 'Run 10k Paths';
        btnRunMonteCarlo.disabled = false;
    }
};

function renderMonteCarloResults(result) {
    // Render Metrics
    riskMetricsEl.innerHTML = `
        <div class="stat-card" style="padding: 10px;">
            <h3>Mean Terminal Price</h3>
            <p>${formatCurrency(result.mean)}</p>
        </div>
        <div class="stat-card" style="padding: 10px;">
            <h3>VaR (95%)</h3>
            <p>${formatCurrency(result.VaR_95)}</p>
        </div>
        <div class="stat-card" style="padding: 10px;">
            <h3>CVaR (95%)</h3>
            <p>${formatCurrency(result.CVaR_95)}</p>
        </div>
    `;

    // Render Histogram
    const ctx = monteCarloCanvas.getContext('2d');
    const { width, height } = monteCarloCanvas;
    ctx.clearRect(0, 0, width, height);

    const { counts } = result.histogram;
    const maxCount = Math.max(...counts);
    const barWidth = width / counts.length;

    ctx.fillStyle = '#ff3300'; // Safety Orange
    counts.forEach((count, i) => {
        const barHeight = (count / maxCount) * (height - 20);
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    });
}

function aggregateScenarios(configs, horizon) {
    const scenarioMap = new Map();
    configs.forEach((cfg) => {
        const holdingWeight = Number(cfg.weight ?? 0);
        if (!(holdingWeight > 0)) {
            return;
        }
        cfg.metrics.outcomes.forEach((outcome) => {
            const id = outcome.id || outcome.name || 'scenario';
            const entry = scenarioMap.get(id) || {
                name: outcome.name || id,
                weightedMultiple: 0,
                weightedProb: 0,
                weightedEarningsCagr: 0,
                earningsWeight: 0,
            };
            entry.weightedMultiple += holdingWeight * outcome.multiple;
            entry.weightedProb += holdingWeight * outcome.prob;
            if (Number.isFinite(outcome.earningsCagr)) {
                entry.weightedEarningsCagr += holdingWeight * outcome.earningsCagr;
                entry.earningsWeight += holdingWeight;
            }
            scenarioMap.set(id, entry);
        });
    });

    return Array.from(scenarioMap.entries()).map(([id, entry]) => {
        const multiple = entry.weightedMultiple;
        const priceCagr = multiple > 0 && horizon > 0 ? multiple ** (1 / horizon) - 1 : 0;
        const normalizedProb = entry.weightedProb;
        const earningsCagr =
            entry.earningsWeight > 0 ? entry.weightedEarningsCagr / entry.earningsWeight : null;
        const displayName = id.charAt(0).toUpperCase() + id.slice(1);
        return {
            id,
            name: displayName,
            prob: normalizedProb,
            precomputedMultiple: multiple,
            precomputedCagr: priceCagr,
            precomputedEarningsCagr: earningsCagr,
            notes: `Weighted ${displayName} scenario`,
        };
    });
}

function normalizeConfig(raw, holdingDetails = {}) {
    const legacyManual = raw.manual || {};
    const config = {
        symbol: raw.symbol || holdingDetails.symbol || '',
        name: raw.name || raw.symbol || '',
        meta: raw.meta || {},
        model: raw.model ? { ...raw.model } : {},
        market: raw.market ? { ...raw.market } : {},
        risk: raw.risk ? { ...raw.risk } : {},
        position: raw.position ? { ...raw.position } : {},
        derived: raw.derived || {},
        scenarios: Array.isArray(raw.scenarios)
            ? raw.scenarios.map((scenario) => ({ ...scenario }))
            : [],
    };

    config.market = config.market || {};
    Object.keys(config.market).forEach((key) => {
        const num = Number(config.market[key]);
        if (Number.isFinite(num)) {
            config.market[key] = num;
        }
    });

    config.risk = config.risk || {};
    if (config.risk.volatility !== undefined) {
        const riskVol = Number(config.risk.volatility);
        config.risk.volatility = Number.isFinite(riskVol) ? riskVol : undefined;
    }

    config.model = config.model || {};
    config.model.version = config.model.version || '1.0.0';
    config.model.engine = config.model.engine || {
        type: 'fermat-pascal-kelly',
        useMonteCarlo: false,
        paths: 10000,
        useBayesianUpdate: false,
    };
    config.model.preferences = config.model.preferences || {};
    const preferences = config.model.preferences;
    preferences.overrides = preferences.overrides ? { ...preferences.overrides } : {};
    const overrides = preferences.overrides;

    const normalizeNumber = (value, fallback) => {
        const num = Number(value);
        if (Number.isFinite(num)) {
            return num;
        }
        return fallback;
    };

    preferences.horizon = normalizeNumber(preferences.horizon ?? legacyManual.horizon, 5);
    preferences.kellyScale = normalizeNumber(
        preferences.kellyScale ?? legacyManual.kellyScale,
        0.5
    );
    preferences.targetCagr = normalizeNumber(
        preferences.targetCagr ?? legacyManual.targetCagr,
        0.1
    );

    const benchmarkSource =
        preferences.benchmark !== undefined
            ? { benchmark: preferences.benchmark }
            : { benchmark: legacyManual.benchmark ?? 0 };
    const benchmarkDescriptor = getBenchmarkDescriptor(benchmarkSource);
    preferences.benchmark = benchmarkDescriptor;

    ['price', 'eps', 'volatility'].forEach((key) => {
        const value = overrides[key] !== undefined ? overrides[key] : legacyManual[key];
        if (value !== undefined && value !== null) {
            const num = Number(value);
            if (Number.isFinite(num)) {
                overrides[key] = num;
            } else {
                delete overrides[key];
            }
        }
    });

    config.position = config.position || {};
    const holdingShares = holdingDetails?.shares ?? legacyManual.shares ?? raw.shares;
    if (holdingShares !== undefined) {
        const sharesNum = Number(holdingShares);
        if (Number.isFinite(sharesNum)) {
            config.position.shares = sharesNum;
        }
    }
    config.position.constraints = config.position.constraints || { minWeight: 0, maxWeight: 0.3 };

    config.scenarios = config.scenarios.map((scenario) => normalizeScenario(scenario));

    const price = getEffectivePrice(config);
    const shares = Number(config.position.shares) || 0;
    config.marketValue = shares * price;
    config.weight = 0;
    return config;
}

function buildPortfolioConfig(configs) {
    if (!configs.length) {
        return null;
    }
    const totalValue = configs.reduce((sum, cfg) => sum + cfg.marketValue, 0);
    if (!(totalValue > 0)) {
        return null;
    }
    const weighted = (selector) =>
        configs.reduce((sum, cfg) => sum + cfg.weight * selector(cfg), 0);
    const basePreferences = getPreferences(configs[0]);
    const horizonRaw = Number(basePreferences.horizon ?? 1);
    const horizon = Number.isFinite(horizonRaw) && horizonRaw > 0 ? horizonRaw : 1;
    const price = totalValue;
    const eps = 1;
    const benchmarkValue = weighted((cfg) => getBenchmarkDescriptor(getPreferences(cfg)).value);
    const kellyScale = weighted((cfg) => getPreferences(cfg).kellyScale ?? 0.5);
    const targetCagr = weighted((cfg) => getPreferences(cfg).targetCagr ?? 0.1);
    const volatility = Math.sqrt(
        configs.reduce((sum, cfg) => {
            const vol = getEffectiveVolatility(cfg);
            return sum + Math.pow(cfg.weight, 2) * Math.pow(vol, 2);
        }, 0)
    );
    const overrides = {
        price,
        eps,
        volatility,
    };
    const model = {
        version: '1.0.0',
        engine: {
            type: 'fermat-pascal-kelly',
            useMonteCarlo: false,
            paths: 10000,
            useBayesianUpdate: false,
        },
        preferences: {
            horizon,
            benchmark: {
                type: 'composite',
                value: benchmarkValue,
                name: 'SP500',
            },
            kellyScale,
            targetCagr,
            overrides,
        },
    };
    const scenarios = aggregateScenarios(configs, horizon);
    const portfolio = {
        symbol: 'PORT',
        name: 'Portfolio',
        meta: {
            schemaVersion: '1.1.0',
            asOf: new Date().toISOString(),
            timezone: 'UTC',
            source: 'analysis-lab',
        },
        model,
        market: {
            price,
            eps,
        },
        risk: {
            volatility,
            estimateSource: 'weighted',
            correlations: null,
        },
        position: {
            shares: totalValue && price > 0 ? totalValue / price : totalValue,
            currentWeight: 1,
            targetWeight: null,
            maxKellyWeight: null,
            portfolioId: 'PORT',
            constraints: { minWeight: 0, maxWeight: 1 },
        },
        derived: {
            expectedCagr: null,
            expectedMultiple: null,
            fairValueRange: null,
            kelly: { fullKelly: null, scaledKelly: null },
        },
        scenarios,
        marketValue: totalValue,
        weight: 1,
    };
    portfolio.metrics = computeMetrics(portfolio);
    return portfolio;
}

async function buildConfigs() {
    const [analysisIndex, holdingsData] = await Promise.all([
        fetchJson('../data/analysis/index.json'),
        fetchJson('../data/holdings_details.json'),
    ]);

    const configs = await Promise.all(
        (analysisIndex.tickers || []).map(async (entry) => {
            try {
                const [raw, thesisTitles] = await Promise.all([
                    fetchJson(entry.path),
                    fetchThesisScenarioTitles(entry.symbol),
                ]);
                const config = normalizeConfig(
                    { ...raw, symbol: raw.symbol || entry.symbol, name: raw.name || entry.name },
                    holdingsData[entry.symbol] || {}
                );
                config.symbol = entry.symbol;
                config.name = raw.name || entry.name || entry.symbol;
                applyThesisScenarioTitles(config, thesisTitles);
                config.metrics = computeMetrics(config);
                return config;
            } catch {
                return null;
            }
        })
    );

    const validConfigs = configs.filter(Boolean);
    const totalValue = validConfigs.reduce((sum, cfg) => sum + cfg.marketValue, 0);
    validConfigs.forEach((cfg) => {
        cfg.weight = totalValue > 0 ? cfg.marketValue / totalValue : 0;
    });

    const portfolioConfig = buildPortfolioConfig(validConfigs);
    const ordered = portfolioConfig ? [portfolioConfig, ...validConfigs] : validConfigs;
    state.configs = ordered;
    state.activeSymbol = ordered.length ? ordered[0].symbol : null;
}

async function init() {
    try {
        if (summaryStatsEl) {
            summaryStatsEl.innerHTML = '<div style="color:white; padding:10px;">Loading...</div>';
        }
        await buildConfigs();
        renderTickerList();
        renderActiveTicker();
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        if (summaryStatsEl) {
            summaryStatsEl.innerHTML = `<div style="color:red; padding:10px;">Error: ${err.message}</div>`;
        }

        // eslint-disable-next-line no-undef
        alert(`Analysis Init Error: ${err.message}`);
    }
}

if (typeof window !== 'undefined' && !window.__SKIP_ANALYSIS_AUTO_INIT__) {
    init();
}

export const __analysisLabTesting = {
    normalizeScenario,
    computeScenarioOutcome,
    aggregateScenarios,
    extractScenarioTitles,
};
