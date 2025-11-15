const tickerListEl = document.getElementById('tickerList');
const summaryStatsEl = document.getElementById('summaryStats');
const scenarioResultsEl = document.getElementById('scenarioResults');
const valueBandsEl = document.getElementById('valueBands');
const edgeEl = document.getElementById('edge');
const fullKellyEl = document.getElementById('fullKelly');
const scaledKellyEl = document.getElementById('scaledKelly');
const selectedTickerLabel = document.getElementById('selectedTickerLabel');
const selectedTickerName = document.getElementById('selectedTickerName');

const state = {
    configs: [],
    activeSymbol: null,
};
const DATA_CACHE_BUST = Date.now().toString();

export async function fetchJson(path) {
    const url = new URL(path, window.location.href);
    url.searchParams.set('v', DATA_CACHE_BUST);
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load ${path}`);
    }
    return response.json();
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
    const growth = scenario.growth || {};
    const valuation = scenario.valuation || {};
    const epsCagrRaw = Number(growth.epsCagr ?? scenario.epsCagr ?? 0);
    const epsCagr = Number.isFinite(epsCagrRaw) ? epsCagrRaw : 0;
    const exitPeRaw = Number(valuation.exitPe ?? scenario.exitPe ?? 1);
    const exitPe = Number.isFinite(exitPeRaw) ? exitPeRaw : 1;
    const probRaw = Number(scenario.prob ?? 0);
    const terminalEps = eps * (1 + epsCagr) ** horizon;
    const terminalPrice = terminalEps * exitPe;
    const multiple = price > 0 ? terminalPrice / price : 0;
    const safeHorizon = horizon > 0 ? horizon : 1;
    const scenarioCagr = multiple > 0 ? multiple ** (1 / safeHorizon) - 1 : 0;
    return {
        id: scenario.id || scenario.name || 'scenario',
        name: scenario.name || scenario.id || 'Scenario',
        prob: Number.isFinite(probRaw) ? probRaw : 0,
        multiple,
        scenarioCagr,
    };
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
    };
}

function renderSummary(config) {
    const metrics = config.metrics;
    const preferences = getPreferences(config);
    const benchmarkDescriptor = metrics.benchmarkDescriptor || getBenchmarkDescriptor(preferences);
    const edgeLabel = `Edge vs ${benchmarkDescriptor.name || 'Benchmark'}`;
    summaryStatsEl.innerHTML = '';
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

function renderScenarioCards(outcomes) {
    scenarioResultsEl.innerHTML = '';
    outcomes.forEach((outcome) => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <h4>${outcome.name}</h4>
            <p>Prob: ${(outcome.prob * 100).toFixed(1)}%</p>
            <p>Multiple: ${outcome.multiple.toFixed(2)}x</p>
            <p>CAGR: ${formatPercent(outcome.scenarioCagr)}</p>
        `;
        scenarioResultsEl.appendChild(card);
    });
}

function renderValueBands(config) {
    const preferences = getPreferences(config);
    const targetCagrRaw = Number(preferences.targetCagr ?? 0.1);
    const targetCagr = Number.isFinite(targetCagrRaw) ? targetCagrRaw : 0.1;
    const metrics = config.metrics;
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
    ].forEach((band) => {
        const dt = document.createElement('dt');
        dt.textContent = band.label;
        const dd = document.createElement('dd');
        dd.textContent = band.value;
        valueBandsEl.append(dt, dd);
    });
}

function renderTickerList() {
    tickerListEl.innerHTML = '';
    const ordered = [...state.configs].sort((a, b) => {
        if (a.symbol === 'PORT') {
            return -1;
        }
        if (b.symbol === 'PORT') {
            return 1;
        }
        return b.weight - a.weight;
    });
    ordered.forEach((config) => {
        const button = document.createElement('button');
        button.className = `ticker-btn${config.symbol === state.activeSymbol ? ' active' : ''}`;
        button.textContent = config.symbol;
        button.title = `${config.name} · ${formatPercent(config.weight)}`;
        button.addEventListener('click', () => {
            state.activeSymbol = config.symbol;
            renderTickerList();
            renderActiveTicker();
        });
        tickerListEl.appendChild(button);
    });
}

function renderActiveTicker() {
    const config = state.configs.find((cfg) => cfg.symbol === state.activeSymbol);
    if (!config) {
        return;
    }
    selectedTickerLabel.textContent = `${config.symbol} · ${formatPercent(config.weight)}`;
    selectedTickerName.textContent = config.name;
    renderSummary(config);
    renderScenarioCards(config.metrics.outcomes);
    renderValueBands(config);
    edgeEl.textContent = formatPercent(config.metrics.edge);
    fullKellyEl.textContent = formatPercent(config.metrics.fullKelly);
    scaledKellyEl.textContent = formatPercent(config.metrics.scaledKelly);
}

function aggregateScenarios(configs, horizon) {
    const scenarioMap = new Map();
    configs.forEach((cfg) => {
        cfg.metrics.outcomes.forEach((outcome) => {
            const entry = scenarioMap.get(outcome.name) || {
                prob: 0,
                multiple: 0,
                scenarioCagr: 0,
            };
            entry.prob += cfg.weight * outcome.prob;
            entry.multiple += cfg.weight * outcome.multiple;
            entry.scenarioCagr += cfg.weight * outcome.scenarioCagr;
            scenarioMap.set(outcome.name, entry);
        });
    });
    const totalProb = Array.from(scenarioMap.values()).reduce((sum, entry) => sum + entry.prob, 0);
    return Array.from(scenarioMap.entries()).map(([name, entry]) => {
        const prob = totalProb > 0 ? entry.prob / totalProb : 0;
        const epsCagr = entry.scenarioCagr;
        const multiple = entry.multiple;
        const exitPe = multiple > 0 && horizon > 0 ? multiple / (1 + epsCagr) ** horizon : 1;
        return {
            id: name.toLowerCase(),
            name,
            prob,
            growth: {
                epsCagr,
                epsCagrSigma: null,
            },
            valuation: {
                exitPe,
                exitPeSigma: null,
            },
            notes: `Aggregated scenario for ${name}`,
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
    const weighted = (selector) =>
        configs.reduce((sum, cfg) => sum + cfg.weight * selector(cfg), 0);
    const basePreferences = getPreferences(configs[0]);
    const horizonRaw = Number(basePreferences.horizon ?? 1);
    const horizon = Number.isFinite(horizonRaw) && horizonRaw > 0 ? horizonRaw : 1;
    const price = weighted((cfg) => getEffectivePrice(cfg));
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
                name: 'Weighted Benchmark',
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
                const raw = await fetchJson(entry.path);
                const config = normalizeConfig(
                    { ...raw, symbol: raw.symbol || entry.symbol, name: raw.name || entry.name },
                    holdingsData[entry.symbol] || {}
                );
                config.symbol = entry.symbol;
                config.name = raw.name || entry.name || entry.symbol;
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
    await buildConfigs();
    renderTickerList();
    renderActiveTicker();
}

if (typeof window !== 'undefined' && !window.__SKIP_ANALYSIS_AUTO_INIT__) {
    init();
}
