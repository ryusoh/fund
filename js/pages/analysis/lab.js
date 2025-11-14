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

async function fetchJson(path) {
    const response = await fetch(path);
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

function diffDescriptor(price, entry) {
    if (!Number.isFinite(entry) || entry <= 0) {
        return 'n/a';
    }
    const diff = ((price - entry) / entry) * 100;
    const direction = diff >= 0 ? 'above' : 'below';
    return `${Math.abs(diff).toFixed(1)}% ${direction} target`;
}

function computeScenarioOutcome(scenario, { price, eps, horizon }) {
    const terminalEps = eps * (1 + scenario.epsCagr) ** horizon;
    const terminalPrice = terminalEps * scenario.exitPe;
    const multiple = price > 0 ? terminalPrice / price : 0;
    const scenarioCagr = multiple > 0 ? multiple ** (1 / horizon) - 1 : 0;
    return { name: scenario.name, prob: scenario.prob, multiple, scenarioCagr };
}

function computeMetrics(config) {
    const { manual = {}, market = {}, scenarios } = config;
    const price = resolveNumeric(manual.price, market.price, 0, true);
    const eps = resolveNumeric(manual.eps, market.eps, 0, true);
    const volatility = resolveNumeric(manual.volatility, market.volatility, 0.35, true);
    const horizon = Number(manual.horizon ?? 1);
    const benchmark = Number(manual.benchmark ?? 0);
    const kellyScale = Number(manual.kellyScale ?? 0.5);
    const targetCagr = Number(manual.targetCagr ?? 0.1);

    const outcomes = scenarios.map((scenario) =>
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
        volatility,
        kellyScale,
        targetCagr,
    };
}

function renderSummary(metrics) {
    summaryStatsEl.innerHTML = '';
    [
        { label: 'Expected CAGR', value: formatPercent(metrics.expectedCagr) },
        { label: 'Edge vs Benchmark', value: formatPercent(metrics.edge) },
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
    const { manual, metrics } = config;
    valueBandsEl.innerHTML = '';
    [
        { label: 'Expected Terminal Price', value: formatCurrency(metrics.expectedTerminalPrice) },
        {
            label: `Price for ${(manual.targetCagr * 100).toFixed(1)}% CAGR`,
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
    renderSummary(config.metrics);
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
            name,
            prob,
            epsCagr,
            exitPe,
        };
    });
}

function buildPortfolioConfig(configs) {
    if (!configs.length) {
        return null;
    }
    const manual = {
        price: configs.reduce(
            (sum, cfg) =>
                sum + resolveNumeric(cfg.manual.price, cfg.market.price, 0, true) * cfg.weight,
            0
        ),
        eps: 1,
        horizon: configs[0].manual.horizon,
        benchmark: configs.reduce((sum, cfg) => sum + cfg.weight * cfg.manual.benchmark, 0),
        volatility: Math.sqrt(
            configs.reduce(
                (sum, cfg) =>
                    sum +
                    Math.pow(cfg.weight, 2) *
                        Math.pow(
                            resolveNumeric(
                                cfg.manual.volatility,
                                cfg.market.volatility,
                                0.35,
                                true
                            ),
                            2
                        ),
                0
            )
        ),
        kellyScale: configs.reduce((sum, cfg) => sum + cfg.weight * cfg.manual.kellyScale, 0),
        targetCagr: configs.reduce((sum, cfg) => sum + cfg.weight * cfg.manual.targetCagr, 0),
    };
    const scenarios = aggregateScenarios(configs, manual.horizon);
    const portfolio = {
        symbol: 'PORT',
        name: 'Portfolio',
        manual,
        market: {},
        scenarios,
        shares: configs.reduce((sum, cfg) => sum + cfg.shares, 0),
        marketValue: manual.price,
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
                const manualSrc = raw.manual || {};
                const manual = {
                    horizon: Number(manualSrc.horizon ?? 1),
                    benchmark: Number(manualSrc.benchmark ?? 0.065),
                    kellyScale: Number(manualSrc.kellyScale ?? 0.5),
                    targetCagr: Number(manualSrc.targetCagr ?? 0.1),
                };
                ['price', 'eps', 'volatility'].forEach((key) => {
                    if (manualSrc[key] !== undefined && manualSrc[key] !== null) {
                        const num = Number(manualSrc[key]);
                        if (Number.isFinite(num)) {
                            manual[key] = num;
                        }
                    }
                });
                const market = { ...(raw.market || {}) };
                Object.keys(market).forEach((key) => {
                    const num = Number(market[key]);
                    if (Number.isFinite(num)) {
                        market[key] = num;
                    }
                });
                const shares = parseFloat(holdingsData[entry.symbol]?.shares ?? '0');
                const effectivePrice = resolveNumeric(manual.price, market.price, 0, true);
                const config = {
                    symbol: entry.symbol,
                    name: raw.name || entry.name || entry.symbol,
                    manual,
                    market,
                    scenarios: raw.scenarios || [],
                    shares,
                    marketValue: shares * effectivePrice,
                };
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

init();
