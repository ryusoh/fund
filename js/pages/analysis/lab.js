/* global Worker */
import { compactNumber } from '../../utils/formatting.js';
import { BayesianEngine } from './bayes.js';
import { logger } from '../../utils/logger.js';

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
const kellyCurveCanvas = document.getElementById('kellyCurveCanvas');
const kellyMetricsEl = document.getElementById('kellyMetrics');
const beliefStateCardEl = document.getElementById('beliefStateCard');
const evidenceTimelineEl = document.getElementById('evidenceTimeline');
const predictionsCardEl = document.getElementById('predictionsCard');
const decisionJournalCardEl = document.getElementById('decisionJournalCard');

const state = {
    configs: [],
    activeSymbol: null,
    bayesEngine: null,
    evidenceCache: new Map(),
    // Module worker: the worker file uses ESM `export` (imported by its jest
    // test), which a classic worker cannot parse — it dies with a silent
    // "Unexpected token 'export'" pageerror and Monte Carlo never runs.
    monteCarloWorker: new Worker('../js/pages/analysis/monte_carlo.worker.js', { type: 'module' }),
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

function extractScenarioTitles(markdown) {
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
    } catch (error) {
        logger.warn('Analysis lab operations failed:', error);
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

function extractDirectShares(market) {
    return Number(
        market.sharesOutstanding ?? market.shares ?? market.basicShares ?? market.floatShares
    );
}

function deriveSharesFromMarketCap(market) {
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

function getSharesOutstanding(config) {
    const market = config.market || {};
    const direct = extractDirectShares(market);
    if (Number.isFinite(direct) && direct > 0) {
        return direct;
    }
    return deriveSharesFromMarketCap(market);
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

function extractGrowthParams(scenario) {
    const growth = scenario.growth || {};
    const epsCagrRaw = Number(growth.epsCagr ?? scenario.epsCagr ?? 0);
    const epsCagr = Number.isFinite(epsCagrRaw) ? epsCagrRaw : 0;
    const epsSigmaRaw = Number(growth.epsCagrSigma ?? scenario.epsCagrSigma);
    const epsSigma = Number.isFinite(epsSigmaRaw) ? epsSigmaRaw : null;
    return { epsCagr, epsSigma };
}

function extractValuationParams(scenario) {
    const valuation = scenario.valuation || {};
    const exitPeRaw = Number(valuation.exitPe ?? scenario.exitPe ?? 1);
    const exitPe = Number.isFinite(exitPeRaw) ? exitPeRaw : 1;
    const exitSigmaRaw = Number(valuation.exitPeSigma ?? scenario.exitPeSigma);
    const exitSigma = Number.isFinite(exitSigmaRaw) ? exitSigmaRaw : null;
    return { exitPe, exitSigma };
}

function extractPrecomputedParams(scenario) {
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
    return { precomputedMultiple, precomputedCagr, precomputedEarningsCagr };
}

function normalizeScenario(scenario) {
    const name = scenario.name || scenario.id || 'Scenario';
    const { epsCagr, epsSigma } = extractGrowthParams(scenario);
    const { exitPe, exitSigma } = extractValuationParams(scenario);
    const probRaw = Number(scenario.prob ?? 0);
    const { precomputedMultiple, precomputedCagr, precomputedEarningsCagr } =
        extractPrecomputedParams(scenario);
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

function extractOutcomeNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function computeBaseScenarioOutcome(scenario) {
    const prob = extractOutcomeNumber(scenario.prob, 0);
    return {
        id: scenario.id || scenario.name || 'scenario',
        name: scenario.name || scenario.id || 'Scenario',
        prob: prob,
    };
}

function deriveEarningsCagrHelper(terminalValue, entryEps, safeHorizon, fallbackEpsCagr) {
    if (entryEps === null || !Number.isFinite(terminalValue) || terminalValue <= 0) {
        return fallbackEpsCagr;
    }
    const ratio = terminalValue / entryEps;
    if (ratio <= 0) {
        return fallbackEpsCagr;
    }
    const derived = ratio ** (1 / safeHorizon) - 1;
    return Number.isFinite(derived) ? derived : fallbackEpsCagr;
}

function resolveFallbackEpsCagr(scenario) {
    if (Number.isFinite(scenario?.growth?.epsCagr) && scenario.growth.epsCagr !== null) {
        return scenario.growth.epsCagr;
    }
    if (Number.isFinite(scenario?.epsCagr)) {
        return scenario.epsCagr;
    }
    return null;
}

function resolvePrecomputedEarningsCagr(
    scenario,
    terminalEps,
    entryEps,
    safeHorizon,
    fallbackEpsCagr
) {
    const precomputedEarningsCagr = extractOutcomeNumber(scenario.precomputedEarningsCagr, null);
    if (precomputedEarningsCagr !== null) {
        return precomputedEarningsCagr;
    }
    return deriveEarningsCagrHelper(terminalEps, entryEps, safeHorizon, fallbackEpsCagr);
}

function resolvePrecomputedPriceCagr(scenario, precomputedMultiple, safeHorizon) {
    const precomputedCagr = extractOutcomeNumber(
        scenario.precomputedCagr ?? scenario.scenarioCagr,
        null
    );
    if (precomputedCagr !== null) {
        return precomputedCagr;
    }
    return precomputedMultiple ** (1 / safeHorizon) - 1;
}

function computePrecomputedScenarioOutcome(
    scenario,
    base,
    precomputedMultiple,
    entryEps,
    safeHorizon,
    fallbackEpsCagr
) {
    const priceCagr = resolvePrecomputedPriceCagr(scenario, precomputedMultiple, safeHorizon);
    const terminalEps = extractOutcomeNumber(
        scenario.precomputedTerminalEps ?? scenario.terminalEps,
        null
    );
    const earningsCagr = resolvePrecomputedEarningsCagr(
        scenario,
        terminalEps,
        entryEps,
        safeHorizon,
        fallbackEpsCagr
    );
    return { ...base, multiple: precomputedMultiple, priceCagr, earningsCagr, terminalEps };
}

function computeDerivedScenarioOutcome(
    scenario,
    base,
    price,
    eps,
    horizon,
    safeHorizon,
    entryEps,
    fallbackEpsCagr
) {
    const growth = scenario.growth || {};
    const valuation = scenario.valuation || {};
    const epsCagr = extractOutcomeNumber(growth.epsCagr ?? scenario.epsCagr, 0);
    const exitPe = extractOutcomeNumber(valuation.exitPe ?? scenario.exitPe, 1);
    const terminalEps = eps * (1 + epsCagr) ** horizon;
    const terminalPrice = terminalEps * exitPe;
    const multiple = price > 0 ? terminalPrice / price : 0;
    const priceCagr = multiple > 0 ? multiple ** (1 / safeHorizon) - 1 : 0;
    const earningsCagr = deriveEarningsCagrHelper(
        terminalEps,
        entryEps,
        safeHorizon,
        fallbackEpsCagr
    );
    return { ...base, multiple, priceCagr, earningsCagr, terminalEps };
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
    const base = computeBaseScenarioOutcome(scenario);
    const entryEps = Number.isFinite(eps) && eps > 0 ? eps : null;
    const fallbackEpsCagr = resolveFallbackEpsCagr(scenario);

    const precomputedMultiple = extractOutcomeNumber(
        scenario.precomputedMultiple ?? scenario.multiple,
        null
    );
    if (precomputedMultiple !== null && precomputedMultiple > 0) {
        return computePrecomputedScenarioOutcome(
            scenario,
            base,
            precomputedMultiple,
            entryEps,
            safeHorizon,
            fallbackEpsCagr
        );
    }
    return computeDerivedScenarioOutcome(
        scenario,
        base,
        price,
        eps,
        horizon,
        safeHorizon,
        entryEps,
        fallbackEpsCagr
    );
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
    let expectedMultiple = 0;
    for (let i = 0; i < outcomes.length; i++) {
        expectedMultiple += outcomes[i].prob * outcomes[i].multiple;
    }
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
    summaryStatsEl.replaceChildren();

    if (!config || !config.metrics) {
        const div = document.createElement('div');
        div.style.color = 'var(--text-muted)';
        div.style.padding = '0 10px';
        div.textContent = 'No metrics available';
        summaryStatsEl.appendChild(div);
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
        const h3 = document.createElement('h3');
        h3.textContent = stat.label;
        const p = document.createElement('p');
        p.textContent = stat.value;
        card.append(h3, p);
        summaryStatsEl.appendChild(card);
    });
}

function renderScenarioCards(config) {
    const outcomes = (config.metrics && config.metrics.outcomes) || [];
    scenarioResultsEl.replaceChildren();
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

        const h4 = document.createElement('h4');
        h4.textContent = outcome.name;
        card.appendChild(h4);

        const createP = (text) => {
            const p = document.createElement('p');
            p.textContent = text;
            return p;
        };

        card.appendChild(createP(`Prob: ${(outcome.prob * 100).toFixed(1)}%`));
        card.appendChild(createP(`Multiple: ${outcome.multiple.toFixed(2)}x`));
        card.appendChild(createP(`Price CAGR: ${formatPercent(outcome.priceCagr)}`));
        card.appendChild(createP(`Earnings CAGR: ${formatPercent(outcome.earningsCagr)}`));
        card.appendChild(createP(`Implied Annual EPS: ${formatCurrency(terminalEps)}`));
        card.appendChild(createP(`Total Annual Earnings: ${formatCompactCurrency(totalEarnings)}`));

        scenarioResultsEl.appendChild(card);
    });
}

function renderValueBands(config) {
    const preferences = getPreferences(config);
    const targetCagrRaw = Number(preferences.targetCagr ?? 0.1);
    const targetCagr = Number.isFinite(targetCagrRaw) ? targetCagrRaw : 0.1;
    const metrics = config.metrics;
    const exitYearValue = Number.isFinite(metrics.exitYear) ? metrics.exitYear : null;
    valueBandsEl.replaceChildren();
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

function drawKellyMarker(
    ctx,
    f,
    maxF,
    toX,
    toY,
    g,
    padTop,
    plotH,
    width,
    color,
    label,
    isDashed = false
) {
    if (f < 0 || f > maxF) {
        return;
    }
    const x = toX(f);
    const y = toY(g(f));
    if (typeof ctx.save === 'function') {
        ctx.save();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (isDashed && typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([3, 3]);
    }
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, padTop + plotH);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    if (typeof ctx.arc === 'function') {
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
    }
    if (typeof ctx.fillText === 'function') {
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(label, Math.min(x - 15, width - 60), padTop - 6);
    }
    if (typeof ctx.restore === 'function') {
        ctx.restore();
    }
}

function drawKellyCurvePath(ctx, toX, toY, g, maxF, pointsCount, padLeft, plotW, baselineY) {
    ctx.strokeStyle = '#003b00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, baselineY);
    ctx.lineTo(padLeft + plotW, baselineY);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 2;
    for (let i = 0; i <= pointsCount; i++) {
        const f = (i / pointsCount) * maxF;
        const y = toY(g(f));
        const x = toX(f);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}

function updateKellyMetricsBadges(
    targetEl,
    config,
    metrics,
    fullKelly,
    scaledKelly,
    currentWeight
) {
    if (!targetEl) {
        return;
    }
    targetEl.replaceChildren();
    const createBadge = (label, val, highlight = false) => {
        const span = document.createElement('span');
        span.className = 'concentration-badge';
        if (highlight) {
            span.style.borderColor = 'var(--text-main)';
        }
        span.textContent = `${label}: ${val}`;
        return span;
    };

    targetEl.appendChild(createBadge('Full Kelly', formatPercent(fullKelly)));
    targetEl.appendChild(createBadge('Scaled (½K)', formatPercent(scaledKelly), true));
    targetEl.appendChild(createBadge('Current Weight', formatPercent(currentWeight)));
    if (config.symbol === 'PORT' && metrics.covarianceRatio) {
        targetEl.appendChild(
            createBadge(
                'Covariance Dampener',
                `${metrics.covarianceRatio.toFixed(2)}x Vol vs Independence`
            )
        );
    }
}

function drawAllKellyMarkers(
    ctx,
    fullKelly,
    scaledKelly,
    currentWeight,
    maxF,
    toX,
    toY,
    g,
    padTop,
    plotH,
    width
) {
    if (fullKelly > 0) {
        drawKellyMarker(
            ctx,
            fullKelly * 0.25,
            maxF,
            toX,
            toY,
            g,
            padTop,
            plotH,
            width,
            '#8cf',
            '¼K',
            true
        );
        drawKellyMarker(
            ctx,
            scaledKelly,
            maxF,
            toX,
            toY,
            g,
            padTop,
            plotH,
            width,
            '#00ff41',
            '½K (Rec)',
            true
        );
        drawKellyMarker(
            ctx,
            fullKelly,
            maxF,
            toX,
            toY,
            g,
            padTop,
            plotH,
            width,
            '#fc0',
            'Full K',
            true
        );
        drawKellyMarker(
            ctx,
            fullKelly * 2,
            maxF,
            toX,
            toY,
            g,
            padTop,
            plotH,
            width,
            '#f30',
            '2x K (0 Growth)',
            true
        );
    }
    if (currentWeight > 0) {
        drawKellyMarker(
            ctx,
            currentWeight,
            maxF,
            toX,
            toY,
            g,
            padTop,
            plotH,
            width,
            '#4af',
            `Curr: ${(currentWeight * 100).toFixed(1)}%`
        );
    }
}

function computeKellyParameters(config, metrics) {
    const edge = metrics.edge || 0;
    const volatility = metrics.volatility || 0.3;
    const variance = volatility ** 2;
    const fullKelly = metrics.fullKelly || (variance > 0 ? edge / variance : 0);
    const scaledKelly = metrics.scaledKelly || fullKelly * (metrics.kellyScale || 0.5);
    const currentWeight =
        config.position && Number.isFinite(config.position.currentWeight)
            ? config.position.currentWeight
            : config.weight || 0;

    const maxF = Math.max(0.4, fullKelly > 0 ? fullKelly * 2.4 : 0.6);
    const r = metrics.benchmark || 0.065;
    const g = (f) => r + f * edge - 0.5 * f * f * variance;
    const peakG = g(fullKelly > 0 ? fullKelly : 0);
    const minG = Math.min(r - 0.05, g(maxF));
    const rangeG = Math.max(0.05, peakG - minG);

    return {
        r,
        fullKelly,
        scaledKelly,
        currentWeight,
        maxF,
        g,
        minG,
        rangeG,
    };
}

function renderKellyCurve(config) {
    if (!kellyCurveCanvas) {
        return;
    }
    const ctx = kellyCurveCanvas.getContext('2d');
    if (!ctx) {
        return;
    }
    const width = kellyCurveCanvas.width || 600;
    const height = kellyCurveCanvas.height || 200;
    if (typeof ctx.clearRect === 'function') {
        ctx.clearRect(0, 0, width, height);
    }

    const metrics = config.metrics;
    if (!metrics) {
        return;
    }

    const params = computeKellyParameters(config, metrics);
    const padLeft = 45;
    const padRight = 20;
    const padTop = 25;
    const padBottom = 25;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const toX = (f) => padLeft + (f / params.maxF) * plotW;
    const toY = (val) => padTop + (1 - (val - params.minG) / params.rangeG) * plotH;

    if (typeof ctx.beginPath === 'function') {
        drawKellyCurvePath(ctx, toX, toY, params.g, params.maxF, 40, padLeft, plotW, toY(params.r));
        drawAllKellyMarkers(
            ctx,
            params.fullKelly,
            params.scaledKelly,
            params.currentWeight,
            params.maxF,
            toX,
            toY,
            params.g,
            padTop,
            plotH,
            width
        );
    }

    updateKellyMetricsBadges(
        kellyMetricsEl,
        config,
        metrics,
        params.fullKelly,
        params.scaledKelly,
        params.currentWeight
    );
}

function renderBeliefState(config) {
    if (!beliefStateCardEl) {
        return;
    }
    beliefStateCardEl.replaceChildren();

    const belief = config.belief_state;
    if (!belief) {
        const p = document.createElement('p');
        p.style.color = 'var(--text-muted)';
        p.style.fontSize = '0.8rem';
        p.style.margin = '0';
        p.textContent = 'Belief state not yet initialized for this ticker.';
        beliefStateCardEl.appendChild(p);
        return;
    }

    const header = document.createElement('div');
    header.className = 'belief-header';

    const left = document.createElement('span');
    left.textContent = `Current Belief: ${(belief.probability * 100).toFixed(1)}% (Confidence: ${(belief.confidence * 100).toFixed(0)}%)`;
    left.style.fontWeight = '700';
    left.style.color = 'var(--text-main)';

    const asOf = document.createElement('span');
    asOf.style.fontSize = '0.75rem';
    asOf.style.color = 'var(--text-muted)';
    asOf.textContent = belief.as_of ? `As of: ${belief.as_of.slice(0, 10)}` : '';

    header.append(left, asOf);
    beliefStateCardEl.appendChild(header);

    if (config.industry_thesis) {
        const industryLink = document.createElement('div');
        industryLink.style.fontSize = '0.75rem';
        industryLink.style.marginTop = '4px';
        const docName = config.industry_thesis.split('/').pop();
        // security: remediate DOM-based XSS sink
        industryLink.innerHTML =
            '<span style="color: var(--text-muted)">Industry Layer:</span> <a style="color: var(--text-main); text-decoration: underline;"></a>';
        industryLink.querySelector('a').href = '../' + config.industry_thesis;
        industryLink.querySelector('a').textContent = docName;
        beliefStateCardEl.appendChild(industryLink);
    }

    if (belief.evidence_for && belief.evidence_for.length > 0) {
        const forTitle = document.createElement('div');
        forTitle.style.fontSize = '0.75rem';
        forTitle.style.color = 'var(--text-muted)';
        forTitle.textContent = 'Evidence For (Bullish Moat Factors):';
        const ul = document.createElement('ul');
        ul.className = 'belief-list';
        belief.evidence_for.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'evidence-for-item';
            li.textContent = item;
            ul.appendChild(li);
        });
        beliefStateCardEl.append(forTitle, ul);
    }

    if (belief.evidence_against && belief.evidence_against.length > 0) {
        const againstTitle = document.createElement('div');
        againstTitle.style.fontSize = '0.75rem';
        againstTitle.style.color = '#fa0';
        againstTitle.textContent = 'Evidence Against & Falsification Risks:';
        const ul = document.createElement('ul');
        ul.className = 'belief-list';
        belief.evidence_against.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'evidence-against-item';
            li.textContent = item;
            ul.appendChild(li);
        });
        beliefStateCardEl.append(againstTitle, ul);
    }

    if (belief.open_questions && belief.open_questions.length > 0) {
        const qTitle = document.createElement('div');
        qTitle.style.fontSize = '0.75rem';
        qTitle.style.color = 'var(--text-muted)';
        qTitle.textContent = 'Open Questions & Resolvable Unknowns:';
        const ul = document.createElement('ul');
        ul.className = 'belief-list';
        belief.open_questions.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'open-question-item';
            li.textContent = item;
            ul.appendChild(li);
        });
        beliefStateCardEl.append(qTitle, ul);
    }
}

async function renderEvidenceTimeline(config) {
    if (!evidenceTimelineEl) {
        return;
    }
    evidenceTimelineEl.replaceChildren();

    if (!config || !config.symbol || config.symbol === 'PORT') {
        const p = document.createElement('p');
        p.style.color = 'var(--text-muted)';
        p.style.fontSize = '0.8rem';
        p.textContent = 'Select an individual ticker to view chronological evidence log.';
        evidenceTimelineEl.appendChild(p);
        return;
    }

    let evidenceList = state.evidenceCache.get(config.symbol);
    if (!evidenceList) {
        try {
            const text = await fetchText(`../data/analysis/${config.symbol}.evidence.jsonl`);
            evidenceList = BayesianEngine.parseJsonl(text);
            state.evidenceCache.set(config.symbol, evidenceList);
        } catch {
            evidenceList = [];
        }
    }

    if (!evidenceList || evidenceList.length === 0) {
        const p = document.createElement('p');
        p.style.color = 'var(--text-muted)';
        p.style.fontSize = '0.8rem';
        p.textContent = 'No logged evidence entries on disk yet.';
        evidenceTimelineEl.appendChild(p);
        return;
    }

    const replayEngine = new BayesianEngine(config.scenarios);
    const { history } = replayEngine.replay(evidenceList);

    history.forEach((entry) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `timeline-entry ${entry.direction}`;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'timeline-meta';

        const leftSpan = document.createElement('span');
        leftSpan.textContent = `${entry.date || 'Undated'} · ${entry.direction.toUpperCase()} (${(entry.strength * 100).toFixed(0)}%)`;

        const posteriorSpan = document.createElement('span');
        const bullP = entry.posteriors[0] ? (entry.posteriors[0].prob * 100).toFixed(1) : '0';
        posteriorSpan.textContent = `Bull: ${bullP}%`;

        metaDiv.append(leftSpan, posteriorSpan);

        const claimP = document.createElement('div');
        claimP.className = 'timeline-claim';
        claimP.textContent = entry.claim;

        itemDiv.append(metaDiv, claimP);

        if (entry.sourceUrl) {
            const sourceLink = document.createElement('a');
            sourceLink.className = 'timeline-source';
            sourceLink.href = entry.sourceUrl;
            sourceLink.target = '_blank';
            sourceLink.rel = 'noopener noreferrer';
            sourceLink.textContent = entry.sourceUrl.replace(/^https?:\/\//, '').split('/')[0];
            itemDiv.appendChild(sourceLink);
        }

        evidenceTimelineEl.appendChild(itemDiv);
    });
}

function renderPredictions(config) {
    if (!predictionsCardEl) {
        return;
    }
    predictionsCardEl.replaceChildren();

    const predictions = config.predictions || [];
    const brierResult = BayesianEngine.computeBrierScore(predictions);

    const titleDiv = document.createElement('div');
    titleDiv.style.display = 'flex';
    titleDiv.style.justifyContent = 'space-between';
    titleDiv.style.alignItems = 'center';
    titleDiv.style.marginBottom = '6px';

    const h4 = document.createElement('h4');
    h4.style.margin = '0';
    h4.style.fontSize = '0.85rem';
    h4.style.color = 'var(--text-muted)';
    h4.style.textTransform = 'uppercase';
    h4.textContent = 'Falsifiable Predictions';

    const brierBadge = document.createElement('span');
    brierBadge.style.fontSize = '0.75rem';
    brierBadge.style.color = 'var(--text-main)';
    brierBadge.textContent = brierResult
        ? `Brier: ${brierResult.brierScore} (N=${brierResult.count})`
        : 'Brier: N/A';

    titleDiv.append(h4, brierBadge);
    predictionsCardEl.appendChild(titleDiv);

    if (predictions.length === 0) {
        const p = document.createElement('p');
        p.style.color = 'var(--text-muted)';
        p.style.fontSize = '0.8rem';
        p.style.margin = '0';
        p.textContent = 'No dated predictions recorded yet.';
        predictionsCardEl.appendChild(p);
        return;
    }

    predictions.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'prediction-item';

        const claimSpan = document.createElement('span');
        claimSpan.textContent = `${p.claim} (Target: ${p.target_date})`;

        const statusSpan = document.createElement('span');
        statusSpan.className = `prediction-status ${p.resolved ? 'status-resolved' : 'status-pending'}`;
        statusSpan.textContent = p.resolved
            ? p.outcome
                ? 'True'
                : 'False'
            : `Pending (${(p.probability * 100).toFixed(0)}%)`;

        row.append(claimSpan, statusSpan);
        predictionsCardEl.appendChild(row);
    });
}

function renderDecisionJournal(config) {
    if (!decisionJournalCardEl) {
        return;
    }
    decisionJournalCardEl.replaceChildren();

    const journal = config.decision_journal || [];
    const h4 = document.createElement('h4');
    h4.style.margin = '0 0 6px 0';
    h4.style.fontSize = '0.85rem';
    h4.style.color = 'var(--text-muted)';
    h4.style.textTransform = 'uppercase';
    h4.textContent = 'Decision Journal';
    decisionJournalCardEl.appendChild(h4);

    if (journal.length === 0) {
        const p = document.createElement('p');
        p.style.color = 'var(--text-muted)';
        p.style.fontSize = '0.8rem';
        p.style.margin = '0';
        p.textContent = 'No decision journal entries logged yet.';
        decisionJournalCardEl.appendChild(p);
        return;
    }

    const latest = journal[journal.length - 1];
    const actionDiv = document.createElement('div');
    // security: remediate DOM-based XSS sink
    actionDiv.innerHTML = '<span class="decision-action"></span> <span class="action-meta"></span>';
    actionDiv.querySelector('.decision-action').textContent = latest.action || 'ACTION';
    actionDiv.querySelector('.action-meta').textContent =
        `(${latest.date}) · Review: ${latest.review_date || 'TBD'}`;
    const sitDiv = document.createElement('div');
    sitDiv.style.color = 'var(--ink)';
    sitDiv.style.margin = '4px 0';
    sitDiv.textContent = latest.situation || '';

    decisionJournalCardEl.append(actionDiv, sitDiv);

    if (latest.alternatives_rejected && latest.alternatives_rejected.length > 0) {
        const altDiv = document.createElement('div');
        altDiv.style.fontSize = '0.75rem';
        altDiv.style.color = 'var(--text-muted)';
        altDiv.textContent = `Rejected: ${latest.alternatives_rejected.join('; ')}`;
        decisionJournalCardEl.appendChild(altDiv);
    }
}

function renderTickerList() {
    if (!tickerListEl) {
        return;
    }
    tickerListEl.replaceChildren();

    if (!state.configs || !state.configs.length) {
        const span = document.createElement('span');
        span.style.color = 'var(--text-muted)';
        span.style.padding = '0 10px';
        span.textContent = 'No tickers loaded';
        tickerListEl.appendChild(span);
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
    button.setAttribute(
        'aria-label',
        `${config.symbol}, ${config.name}, Weight: ${formatPercent(config.weight)}`
    );
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
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
    renderSummary(config);
    renderScenarioCards(config);
    renderValueBands(config);
    renderKellyCurve(config);
    renderBeliefState(config);
    renderEvidenceTimeline(config);
    renderPredictions(config);
    renderDecisionJournal(config);

    // Initialize Bayesian Engine
    state.bayesEngine = new BayesianEngine(config.scenarios);
    renderBayesOutput();

    // Reset Risk UI
    if (monteCarloCanvas) {
        const ctx = monteCarloCanvas.getContext('2d');
        if (ctx && typeof ctx.clearRect === 'function') {
            ctx.clearRect(0, 0, monteCarloCanvas.width, monteCarloCanvas.height);
        }
    }
    if (riskMetricsEl) {
        const p = document.createElement('p');
        p.textContent = 'Run simulation to see metrics.';
        riskMetricsEl.replaceChildren(p);
    }
}

// --- Bayesian Handlers ---

function renderBayesOutput() {
    if (!state.bayesEngine) {
        return;
    }
    const priors = state.bayesEngine.priors;
    const elements = priors.map((p) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.borderBottom = '1px dashed var(--ink)';
        row.style.padding = '4px 0';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;

        const probStrong = document.createElement('strong');
        probStrong.textContent = `${(p.prob * 100).toFixed(1)}%`;

        row.appendChild(nameSpan);
        row.appendChild(probStrong);
        return row;
    });

    bayesOutput.replaceChildren(...elements);
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

    const icon = document.createElement('i');
    icon.className = 'fa fa-spinner fa-spin';
    icon.setAttribute('aria-hidden', 'true');
    btnRunMonteCarlo.replaceChildren(icon, document.createTextNode(' Running...'));
    btnRunMonteCarlo.disabled = true;
    btnRunMonteCarlo.setAttribute('aria-busy', 'true');

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
        if (result && result.error) {
            riskMetricsEl.replaceChildren(document.createTextNode(result.error));
        } else {
            renderMonteCarloResults(result);
        }
        btnRunMonteCarlo.textContent = 'Run 10k Paths';
        btnRunMonteCarlo.disabled = false;
        btnRunMonteCarlo.removeAttribute('aria-busy');
    }
};

state.monteCarloWorker.onerror = function () {
    riskMetricsEl.replaceChildren(
        document.createTextNode('Monte Carlo simulation failed; see console for details.')
    );
    btnRunMonteCarlo.textContent = 'Run 10k Paths';
    btnRunMonteCarlo.disabled = false;
    btnRunMonteCarlo.removeAttribute('aria-busy');
};

function renderMonteCarloResults(result) {
    // Render Metrics
    riskMetricsEl.replaceChildren();

    const createStatCard = (title, value) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.style.padding = '10px';

        const h3 = document.createElement('h3');
        h3.textContent = title;

        const p = document.createElement('p');
        p.textContent = value;

        card.appendChild(h3);
        card.appendChild(p);
        return card;
    };

    if (Number.isFinite(result.median)) {
        riskMetricsEl.appendChild(createStatCard('Median Price', formatCurrency(result.median)));
    }
    riskMetricsEl.appendChild(createStatCard('Mean Terminal Price', formatCurrency(result.mean)));
    if (Number.isFinite(result.VaR_80)) {
        riskMetricsEl.appendChild(createStatCard('VaR (20% Tail)', formatCurrency(result.VaR_80)));
    }
    if (Number.isFinite(result.CVaR_80)) {
        riskMetricsEl.appendChild(
            createStatCard('CVaR (20% Tail)', formatCurrency(result.CVaR_80))
        );
    }
    riskMetricsEl.appendChild(createStatCard('VaR (95%)', formatCurrency(result.VaR_95)));
    riskMetricsEl.appendChild(createStatCard('CVaR (95%)', formatCurrency(result.CVaR_95)));

    // Render Histogram
    const ctx = monteCarloCanvas.getContext('2d');
    const { width, height } = monteCarloCanvas;
    if (typeof ctx.clearRect === 'function') {
        ctx.clearRect(0, 0, width, height);
    }

    if (result.histogram && result.histogram.counts && typeof ctx.fillRect === 'function') {
        const { counts } = result.histogram;
        let maxCount = -Infinity;
        for (let i = 0; i < counts.length; i++) {
            if (counts[i] > maxCount) {
                maxCount = counts[i];
            }
        }
        const barWidth = width / counts.length;

        ctx.fillStyle = '#ff3300'; // Safety Orange
        counts.forEach((count, i) => {
            const barHeight = (count / maxCount) * (height - 20);
            ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
        });
    }

    // Overlay fan chart bands if fanChart is available
    if (result.fanChart && result.fanChart.length > 1 && typeof ctx.beginPath === 'function') {
        const fan = result.fanChart;
        const padL = 40;
        const padR = 20;
        const padT = 20;
        const padB = 25;
        const plotW = width - padL - padR;
        const plotH = height - padT - padB;

        let minVal = Infinity;
        let maxVal = -Infinity;
        fan.forEach((pt) => {
            if (pt.p5 < minVal) {
                minVal = pt.p5;
            }
            if (pt.p95 > maxVal) {
                maxVal = pt.p95;
            }
        });
        minVal = Math.max(0, minVal * 0.9);
        maxVal = maxVal * 1.1;
        const range = maxVal - minVal || 1;

        const getX = (i) => padL + (i / (fan.length - 1)) * plotW;
        const getY = (val) => padT + (1 - (val - minVal) / range) * plotH;

        ctx.fillStyle = 'rgba(0, 255, 65, 0.15)';
        ctx.beginPath();
        ctx.moveTo(getX(0), getY(fan[0].p5));
        for (let i = 1; i < fan.length; i++) {
            ctx.lineTo(getX(i), getY(fan[i].p5));
        }
        for (let i = fan.length - 1; i >= 0; i--) {
            ctx.lineTo(getX(i), getY(fan[i].p95));
        }
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#00ff41';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(getX(0), getY(fan[0].median));
        for (let i = 1; i < fan.length; i++) {
            ctx.lineTo(getX(i), getY(fan[i].median));
        }
        ctx.stroke();

        if (typeof ctx.fillText === 'function') {
            ctx.fillStyle = '#008f11';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.fillText(
                `Fan Envelope (P5–P95) · ${result.runCount || 10000} paths`,
                padL + 10,
                padT + 12
            );
        }
    }
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

function _initBaseConfigFields(raw, holdingDetails) {
    return {
        symbol: raw.symbol || holdingDetails.symbol || '',
        name: raw.name || raw.symbol || '',
        meta: raw.meta || {},
        derived: raw.derived || {},
    };
}

function _initBaseConfigNested(raw) {
    return {
        model: raw.model ? { ...raw.model } : {},
        market: raw.market ? { ...raw.market } : {},
        risk: raw.risk ? { ...raw.risk } : {},
        position: raw.position ? { ...raw.position } : {},
        scenarios: Array.isArray(raw.scenarios)
            ? raw.scenarios.map((scenario) => ({ ...scenario }))
            : [],
    };
}

function _normalizeMarketConfig(market) {
    const norm = market || {};
    Object.keys(norm).forEach((key) => {
        const num = Number(norm[key]);
        if (Number.isFinite(num)) {
            norm[key] = num;
        }
    });
    return norm;
}

function _normalizeRiskConfig(risk) {
    const norm = risk || {};
    if (norm.volatility !== undefined) {
        const riskVol = Number(norm.volatility);
        norm.volatility = Number.isFinite(riskVol) ? riskVol : undefined;
    }
    return norm;
}

function _normalizeNumber(value, fallback) {
    const num = Number(value);
    if (Number.isFinite(num)) {
        return num;
    }
    return fallback;
}

function _normalizeModelPreferences(preferences, legacyManual) {
    preferences.horizon = _normalizeNumber(preferences.horizon ?? legacyManual.horizon, 5);
    preferences.kellyScale = _normalizeNumber(
        preferences.kellyScale ?? legacyManual.kellyScale,
        0.5
    );
    preferences.targetCagr = _normalizeNumber(
        preferences.targetCagr ?? legacyManual.targetCagr,
        0.1
    );

    const benchmarkSource =
        preferences.benchmark !== undefined
            ? { benchmark: preferences.benchmark }
            : { benchmark: legacyManual.benchmark ?? 0 };
    preferences.benchmark = getBenchmarkDescriptor(benchmarkSource);
}

function _normalizeModelOverrides(overrides, legacyManual) {
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
}

function _normalizeModelConfig(model, legacyManual) {
    const norm = model || {};
    norm.version = norm.version || '1.0.0';
    norm.engine = norm.engine || {
        type: 'fermat-pascal-kelly',
        useMonteCarlo: false,
        paths: 10000,
        useBayesianUpdate: false,
    };
    norm.preferences = norm.preferences || {};
    norm.preferences.overrides = norm.preferences.overrides
        ? { ...norm.preferences.overrides }
        : {};

    _normalizeModelPreferences(norm.preferences, legacyManual);
    _normalizeModelOverrides(norm.preferences.overrides, legacyManual);

    return norm;
}

function _normalizePositionConfig(position, raw, holdingDetails, legacyManual) {
    const norm = position || {};
    const holdingShares = holdingDetails?.shares ?? legacyManual.shares ?? raw.shares;
    if (holdingShares !== undefined) {
        const sharesNum = Number(holdingShares);
        if (Number.isFinite(sharesNum)) {
            norm.shares = sharesNum;
        }
    }
    norm.constraints = norm.constraints || { minWeight: 0, maxWeight: 0.3 };
    return norm;
}

function normalizeConfig(raw, holdingDetails = {}) {
    const legacyManual = raw.manual || {};
    const config = {
        ..._initBaseConfigFields(raw, holdingDetails),
        ..._initBaseConfigNested(raw),
    };

    config.market = _normalizeMarketConfig(config.market);
    config.risk = _normalizeRiskConfig(config.risk);
    config.model = _normalizeModelConfig(config.model, legacyManual);
    config.position = _normalizePositionConfig(config.position, raw, holdingDetails, legacyManual);

    config.scenarios = config.scenarios.map((scenario) => normalizeScenario(scenario));

    const price = getEffectivePrice(config);
    const shares = Number(config.position.shares) || 0;
    config.marketValue = shares * price;
    config.weight = 0;
    return config;
}

function getAssetPairCorrelation(symA, symB) {
    if (!symA || !symB || symA === symB) {
        return symA && symA === symB ? 1.0 : 0.0;
    }
    const pair = [symA, symB].sort().join(':');
    const CORRELATION_MAP = {
        'ANET:GOOG': 0.6,
        'ANET:PDD': 0.25,
        'ANET:VT': 0.65,
        'GOOG:PDD': 0.25,
        'GOOG:VT': 0.7,
        'PDD:VT': 0.35,
    };
    return CORRELATION_MAP[pair] !== undefined ? CORRELATION_MAP[pair] : 0.0;
}

function computePortfolioCovarianceVolatility(configs) {
    let covSum = 0;
    let diagSum = 0;
    for (let i = 0; i < configs.length; i++) {
        const wi = Number(configs[i].weight) || 0;
        const voli = getEffectiveVolatility(configs[i]);
        diagSum += Math.pow(wi, 2) * Math.pow(voli, 2);

        for (let j = 0; j < configs.length; j++) {
            const wj = Number(configs[j].weight) || 0;
            const volj = getEffectiveVolatility(configs[j]);
            const corr =
                i === j ? 1.0 : getAssetPairCorrelation(configs[i].symbol, configs[j].symbol);
            covSum += wi * wj * voli * volj * corr;
        }
    }
    const covVol = Math.sqrt(Math.max(0, covSum));
    const diagVol = Math.sqrt(Math.max(0, diagSum));
    return {
        volatility: covVol > 0 ? covVol : diagVol,
        volatilityZeroCorr: diagVol,
        covarianceRatio: diagVol > 0 ? covVol / diagVol : 1.0,
    };
}

function buildPortfolioConfig(configs) {
    if (!configs.length) {
        return null;
    }
    let totalValue = 0;
    for (let i = 0; i < configs.length; i++) {
        totalValue += configs[i].marketValue;
    }
    if (!(totalValue > 0)) {
        return null;
    }
    const weighted = (selector) => {
        let sum = 0;
        for (let i = 0; i < configs.length; i++) {
            sum += configs[i].weight * selector(configs[i]);
        }
        return sum;
    };
    const basePreferences = getPreferences(configs[0]);
    const horizonRaw = Number(basePreferences.horizon ?? 1);
    const horizon = Number.isFinite(horizonRaw) && horizonRaw > 0 ? horizonRaw : 1;
    const price = totalValue;
    const eps = 1;
    const benchmarkValue = weighted((cfg) => getBenchmarkDescriptor(getPreferences(cfg)).value);
    const kellyScale = weighted((cfg) => getPreferences(cfg).kellyScale ?? 0.5);
    const targetCagr = weighted((cfg) => getPreferences(cfg).targetCagr ?? 0.1);

    const covResult = computePortfolioCovarianceVolatility(configs);
    const volatility = covResult.volatility;

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
            volatilityZeroCorr: covResult.volatilityZeroCorr,
            covarianceRatio: covResult.covarianceRatio,
            estimateSource: covResult.covarianceRatio > 1.0 ? 'covariance-matrix' : 'weighted',
            correlations: covResult.covarianceRatio > 1.0 ? 'calibrated-cross-asset' : null,
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
    portfolio.metrics.volatilityZeroCorr = covResult.volatilityZeroCorr;
    portfolio.metrics.covarianceRatio = covResult.covarianceRatio;
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
            } catch (error) {
                logger.warn('Analysis lab operations failed:', error);
                return null;
            }
        })
    );

    const validConfigs = configs.filter(Boolean);
    let totalValue = 0;
    for (let i = 0; i < validConfigs.length; i++) {
        totalValue += validConfigs[i].marketValue;
    }
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
            const loadingDiv = document.createElement('div');
            loadingDiv.style.color = 'white';
            loadingDiv.style.padding = '10px';
            loadingDiv.textContent = 'Loading...';
            if (typeof summaryStatsEl.replaceChildren === 'function') {
                summaryStatsEl.replaceChildren(loadingDiv);
            } else if (typeof summaryStatsEl.appendChild === 'function') {
                summaryStatsEl.textContent = '';
                summaryStatsEl.appendChild(loadingDiv);
            } else {
                summaryStatsEl.textContent = '';
                summaryStatsEl.appendChild(loadingDiv);
            }
        }
        await buildConfigs();
        renderTickerList();
        renderActiveTicker();
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        if (summaryStatsEl) {
            const errDiv = document.createElement('div');
            errDiv.style.color = 'red';
            errDiv.style.padding = '10px';
            errDiv.textContent = `Error: ${err.message}`;
            if (typeof summaryStatsEl.replaceChildren === 'function') {
                summaryStatsEl.replaceChildren(errDiv);
            } else if (typeof summaryStatsEl.appendChild === 'function') {
                summaryStatsEl.textContent = '';
                summaryStatsEl.appendChild(errDiv);
            } else {
                summaryStatsEl.textContent = '';
                summaryStatsEl.appendChild(errDiv);
            }
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
    renderBayesOutput,
    state,
    normalizeConfig,
    buildPortfolioConfig,
    fetchText,
    getSharesOutstanding,
    getAssetPairCorrelation,
    computePortfolioCovarianceVolatility,
    renderKellyCurve,
    renderBeliefState,
    renderEvidenceTimeline,
    renderPredictions,
    renderDecisionJournal,
    renderMonteCarloResults,
};
