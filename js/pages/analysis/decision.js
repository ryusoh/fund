export const GH7_NODES = [
    -3.7504397177, -2.3667594107, -1.1544053947, 0.0, 1.1544053947, 2.3667594107, 3.7504397177,
];

export const GH7_WEIGHTS = [
    0.0005482689, 0.030757124, 0.2401231786, 0.4571428571, 0.2401231786, 0.030757124, 0.0005482689,
];

export const DEFAULT_RISK_FREE_RATE = 0.04;
export const KELLY_FRACTION_CAP = 1;

const DAY_MS = 86_400_000;
const STALE_AGE_MS = 7 * DAY_MS;
const FILING_ACTIVE_DAYS = 30;
const NEAR_BOUNDARY_PCT = 0.02;

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
        return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function pickFiniteNumber(candidates, fallback = null) {
    for (let i = 0; i < candidates.length; i++) {
        const val = toFiniteNumber(candidates[i]);
        if (val !== null) {
            return val;
        }
    }
    return fallback;
}

function formatUtcIsoDate(ms) {
    const dt = new Date(ms);
    const year = dt.getUTCFullYear();
    const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dt.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseIsoDayMs(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const ms = Date.UTC(year, month - 1, day);
    const check = new Date(ms);
    if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
    ) {
        return null;
    }
    return ms;
}

function parseTimestampMs(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function getObjectField(obj, key) {
    if (obj && typeof obj === 'object') {
        const val = obj[key];
        if (val && typeof val === 'object') {
            return val;
        }
    }
    return {};
}

function getPreferences(config) {
    const model = getObjectField(config, 'model');
    return getObjectField(model, 'preferences');
}

function getOverrides(config) {
    return getObjectField(getPreferences(config), 'overrides');
}

export function getBenchmarkRate(config) {
    const prefs = getPreferences(config);
    const benchmark = prefs.benchmark;
    if (benchmark && typeof benchmark === 'object') {
        return pickFiniteNumber([benchmark.value], 0.065);
    }
    return pickFiniteNumber([benchmark], 0.065);
}

export function getEffectivePrice(config) {
    const overrides = getOverrides(config);
    const overridePrice = toFiniteNumber(overrides.price);
    if (overridePrice !== null && overridePrice !== 0) {
        return overridePrice;
    }
    const market = getObjectField(config, 'market');
    return pickFiniteNumber([market.price], 0);
}

export function getEffectiveEps(config) {
    const overrides = getOverrides(config);
    const overrideEps = toFiniteNumber(overrides.eps);
    if (overrideEps !== null && overrideEps !== 0) {
        return overrideEps;
    }
    const market = getObjectField(config, 'market');
    return pickFiniteNumber([market.eps], 0);
}

export function getEffectiveVolatility(config) {
    const overrides = getOverrides(config);
    const risk = getObjectField(config, 'risk');
    const market = getObjectField(config, 'market');
    const candidates = [overrides.volatility, risk.volatility, market.volatility];
    for (let i = 0; i < candidates.length; i++) {
        const raw = candidates[i];
        if (raw === null || raw === undefined || raw === '') {
            continue;
        }
        const num = toFiniteNumber(raw);
        if (num !== null && num >= 0) {
            return num;
        }
        return null;
    }
    return null;
}

export function getEffectiveDividendRate(config) {
    const market = getObjectField(config, 'market');
    const raw = market.dividendYield;
    if (raw === null || raw === undefined || raw === '') {
        return 0;
    }
    const num = toFiniteNumber(raw);
    if (num === null) {
        return null;
    }
    return Math.min(0.25, Math.max(0, num / 100));
}

export function isRetiredScenario(scenario) {
    const rawName = scenario && scenario.name ? scenario.name : '';
    return String(rawName).trim().toUpperCase().startsWith('RETIRED');
}

export function getLatestJournalEntry(journal) {
    if (!Array.isArray(journal) || journal.length === 0) {
        return null;
    }
    const indexed = [];
    for (let i = 0; i < journal.length; i++) {
        const entry = journal[i];
        if (entry && typeof entry === 'object') {
            indexed.push({ entry, idx: i, dateStr: String(entry.date || '') });
        }
    }
    if (indexed.length === 0) {
        return null;
    }
    indexed.sort((a, b) => {
        if (a.dateStr < b.dateStr) {
            return -1;
        }
        if (a.dateStr > b.dateStr) {
            return 1;
        }
        return a.idx - b.idx;
    });
    return indexed[indexed.length - 1].entry;
}

function buildPrecomputedOutcome(scenario, base, precomputedMultiple, price, safeHorizon) {
    const preCagr = pickFiniteNumber([scenario.precomputedCagr, scenario.scenarioCagr]);
    const totalReturnCagr =
        preCagr !== null ? preCagr : precomputedMultiple ** (1 / safeHorizon) - 1;
    const terminalTotalValue =
        isFiniteNumber(price) && price > 0 ? precomputedMultiple * price : null;
    return {
        ...base,
        multiple: precomputedMultiple,
        totalReturnCagr,
        earningsCagr: toFiniteNumber(scenario.precomputedEarningsCagr),
        terminalEps: pickFiniteNumber([scenario.precomputedTerminalEps, scenario.terminalEps]),
        terminalPrice: null,
        terminalTotalValue,
    };
}

function buildDerivedOutcome(item, base, price, eps, safeHorizon, divRate) {
    const growth = getObjectField(item, 'growth');
    const valuation = getObjectField(item, 'valuation');
    const epsCagr = pickFiniteNumber([growth.epsCagr, item.epsCagr], 0);
    const exitPe = pickFiniteNumber([valuation.exitPe, item.exitPe], 1);
    if (!isFiniteNumber(eps) || eps <= 0 || 1 + epsCagr <= 0 || exitPe <= 0) {
        return {
            ...base,
            multiple: 0,
            totalReturnCagr: null,
            earningsCagr: epsCagr,
            terminalEps: null,
            terminalPrice: null,
            terminalTotalValue: null,
        };
    }

    const safeDivRate = isFiniteNumber(divRate) ? Math.min(0.25, Math.max(0, divRate)) : 0;
    const terminalEps = eps * (1 + epsCagr) ** safeHorizon;
    const terminalPrice = terminalEps * exitPe;
    const terminalTotalValue = terminalPrice * (1 + safeDivRate) ** safeHorizon;
    const multiple = isFiniteNumber(price) && price > 0 ? terminalTotalValue / price : 0;
    const totalReturnCagr = multiple > 0 ? multiple ** (1 / safeHorizon) - 1 : null;
    const earningsCagr = terminalEps > 0 ? (terminalEps / eps) ** (1 / safeHorizon) - 1 : epsCagr;
    return {
        ...base,
        multiple,
        totalReturnCagr,
        earningsCagr,
        terminalEps,
        terminalPrice,
        terminalTotalValue,
    };
}

export function computeScenarioOutcome(scenario, { price, eps, horizon, divRate = 0 }) {
    const safeHorizon = isFiniteNumber(horizon) && horizon > 0 ? horizon : 1;
    const item = scenario && typeof scenario === 'object' ? scenario : {};
    const prob = pickFiniteNumber([item.prob], 0);
    const base = {
        id: item.id || item.name || 'scenario',
        name: item.name || item.id || 'Scenario',
        prob,
        macroState: item.macroState ?? null,
    };

    const precomputedMultiple = pickFiniteNumber([item.precomputedMultiple, item.multiple]);
    if (precomputedMultiple !== null && precomputedMultiple > 0) {
        return buildPrecomputedOutcome(item, base, precomputedMultiple, price, safeHorizon);
    }
    return buildDerivedOutcome(item, base, price, eps, safeHorizon, divRate);
}

export function computeGeometricCagr(kellyReturns) {
    if (!Array.isArray(kellyReturns) || kellyReturns.length === 0) {
        return null;
    }
    let sum = 0;
    for (let i = 0; i < kellyReturns.length; i++) {
        const ret = kellyReturns[i].ret;
        if (!isFiniteNumber(ret) || ret <= -1) {
            return ret === -1 ? -1 : null;
        }
        sum += kellyReturns[i].prob * Math.log(1 + ret);
    }
    return Math.exp(sum) - 1;
}

export function computeScenarioVolatility(kellyReturns) {
    if (!Array.isArray(kellyReturns) || kellyReturns.length === 0) {
        return null;
    }
    let mean = 0;
    for (let i = 0; i < kellyReturns.length; i++) {
        mean += kellyReturns[i].prob * kellyReturns[i].ret;
    }
    let variance = 0;
    for (let i = 0; i < kellyReturns.length; i++) {
        variance += kellyReturns[i].prob * (kellyReturns[i].ret - mean) ** 2;
    }
    return Math.sqrt(variance);
}

function kellyGrowthDerivative(fraction, states, riskFreeRate) {
    let sum = 0;
    for (let i = 0; i < states.length; i++) {
        const { prob, ret } = states[i];
        const excess = ret - riskFreeRate;
        const wealth = 1 + riskFreeRate + fraction * excess;
        if (wealth <= 0) {
            return -Infinity;
        }
        sum += (prob * excess) / wealth;
    }
    return sum;
}

function expandScenarioShock(prob, ret, sigma, states) {
    if (sigma === 0) {
        states.push({ prob, ret });
        return true;
    }
    for (let k = 0; k < GH7_NODES.length; k++) {
        const shocked = (1 + ret) * Math.exp(sigma * GH7_NODES[k] - 0.5 * sigma * sigma) - 1;
        if (!Number.isFinite(shocked) || shocked <= -1) {
            return false;
        }
        states.push({ prob: prob * GH7_WEIGHTS[k], ret: shocked });
    }
    return true;
}

function expandGh7States(kellyReturns, sigma) {
    if (!Array.isArray(kellyReturns) || kellyReturns.length === 0) {
        return null;
    }
    let probSum = 0;
    const states = [];
    for (let i = 0; i < kellyReturns.length; i++) {
        const prob = kellyReturns[i].prob;
        const ret = kellyReturns[i].ret;
        if (!isFiniteNumber(prob) || prob < 0 || prob > 1 || !isFiniteNumber(ret) || 1 + ret <= 0) {
            return null;
        }
        probSum += prob;
        if (prob > 0 && !expandScenarioShock(prob, ret, sigma, states)) {
            return null;
        }
    }
    return Math.abs(probSum - 1) <= 1e-9 && states.length > 0 ? states : null;
}

export function solveGh7Kelly(
    kellyReturns,
    sigma,
    riskFreeRate = DEFAULT_RISK_FREE_RATE,
    cap = KELLY_FRACTION_CAP
) {
    if (!isFiniteNumber(sigma) || sigma < 0 || !isFiniteNumber(cap) || cap < 0) {
        return null;
    }
    if (!isFiniteNumber(riskFreeRate) || 1 + riskFreeRate <= 0) {
        return null;
    }
    const states = expandGh7States(kellyReturns, sigma);
    if (!states) {
        return null;
    }
    if (cap === 0) {
        return 0;
    }

    let hi = cap;
    for (let i = 0; i < states.length; i++) {
        const ret = states[i].ret;
        if (ret < riskFreeRate) {
            hi = Math.min(hi, ((1 + riskFreeRate) / (riskFreeRate - ret)) * (1 - 1e-7));
        }
    }

    if (kellyGrowthDerivative(0, states, riskFreeRate) <= 0) {
        return 0;
    }
    if (kellyGrowthDerivative(hi, states, riskFreeRate) >= 0) {
        return hi;
    }

    let lo = 0;
    for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (kellyGrowthDerivative(mid, states, riskFreeRate) > 0) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return (lo + hi) / 2;
}

function buildEmptyMetrics(baseMeta, outcomes) {
    return {
        ...baseMeta,
        outcomes,
        expectedMultiple: null,
        expectedCagr: null,
        geometricCagr: null,
        edge: null,
        fullKelly: null,
        scaledKelly: null,
        scenarioVolatility: null,
        kellyReturns: [],
        expectedTerminalPrice: null,
        expectedTerminalTotalValue: null,
        entryPriceForTarget: null,
    };
}

function aggregateOutcomes(outcomes) {
    let expectedMultiple = 0;
    let probTotal = 0;
    const kellyReturns = [];
    for (let i = 0; i < outcomes.length; i++) {
        const outcome = outcomes[i];
        const validProb = isFiniteNumber(outcome.prob) && outcome.prob >= 0 && outcome.prob <= 1;
        const validOutcome =
            isFiniteNumber(outcome.multiple) &&
            outcome.multiple > 0 &&
            isFiniteNumber(outcome.totalReturnCagr);
        if (!validProb || !validOutcome) {
            return null;
        }
        expectedMultiple += outcome.prob * outcome.multiple;
        probTotal += outcome.prob;
        if (outcome.prob > 0) {
            kellyReturns.push({ prob: outcome.prob, ret: outcome.totalReturnCagr });
        }
    }
    if (Math.abs(probTotal - 1) > 1e-9 || !(expectedMultiple > 0)) {
        return null;
    }
    return { expectedMultiple, kellyReturns };
}

export function computeMetrics(config) {
    const preferences = getPreferences(config);
    const price = getEffectivePrice(config);
    const eps = getEffectiveEps(config);
    const volatility = getEffectiveVolatility(config);
    const divRate = getEffectiveDividendRate(config);
    const horizon = toFiniteNumber(preferences.horizon);
    const safeHorizon = horizon !== null && horizon > 0 ? horizon : null;
    const benchmark = getBenchmarkRate(config);
    const riskFreeRate = pickFiniteNumber([preferences.riskFreeRate], DEFAULT_RISK_FREE_RATE);
    const kellyScale = pickFiniteNumber([preferences.kellyScale], 0.5);
    const targetCagr = pickFiniteNumber([preferences.targetCagr], 0.12);

    const rawScenarios = Array.isArray(config?.scenarios) ? config.scenarios : [];
    const activeScenarios = rawScenarios.filter((s) => !isRetiredScenario(s));
    const baseMeta = {
        price,
        eps,
        horizon: safeHorizon ?? 1,
        benchmark,
        riskFreeRate,
        volatility,
        kellyScale,
        targetCagr,
        dividendRate: divRate ?? 0,
    };

    if (activeScenarios.length === 0 || safeHorizon === null || divRate === null || !(price > 0)) {
        return buildEmptyMetrics(baseMeta, []);
    }

    const outcomes = activeScenarios.map((scenario) =>
        computeScenarioOutcome(scenario, { price, eps, horizon: safeHorizon, divRate })
    );
    const agg = aggregateOutcomes(outcomes);
    if (!agg) {
        return buildEmptyMetrics(baseMeta, outcomes);
    }

    const { expectedMultiple, kellyReturns } = agg;
    const expectedCagr = expectedMultiple ** (1 / safeHorizon) - 1;
    const geometricCagr = computeGeometricCagr(kellyReturns);
    const scenarioVolatility = computeScenarioVolatility(kellyReturns);
    const fullKelly = solveGh7Kelly(kellyReturns, volatility, riskFreeRate, KELLY_FRACTION_CAP);
    const scaledKelly = fullKelly !== null && kellyScale >= 0 ? fullKelly * kellyScale : null;
    const expectedTerminalTotalValue = expectedMultiple * price;
    const hasPriceOnly = outcomes.every((o) => isFiniteNumber(o.terminalPrice));
    const expectedTerminalPrice = hasPriceOnly
        ? outcomes.reduce((sum, o) => sum + o.prob * o.terminalPrice, 0)
        : null;
    const entryPriceForTarget =
        targetCagr > -1 ? expectedTerminalTotalValue / (1 + targetCagr) ** safeHorizon : null;

    return {
        ...baseMeta,
        outcomes,
        expectedMultiple,
        expectedCagr,
        geometricCagr,
        edge: expectedCagr - benchmark,
        fullKelly,
        scaledKelly,
        scenarioVolatility,
        kellyReturns,
        expectedTerminalPrice,
        expectedTerminalTotalValue,
        entryPriceForTarget,
    };
}

function areValidBandRates(rates) {
    for (let i = 0; i < rates.length; i++) {
        if (rates[i] === null || 1 + rates[i] <= 0) {
            return false;
        }
    }
    return true;
}

export function computeIsoCagrBands(
    expectedTerminalTotalValue,
    horizon,
    { targetCagr, benchmark, riskFreeRate = DEFAULT_RISK_FREE_RATE, strongCagr } = {},
    t = 0
) {
    const validHorizon = isFiniteNumber(horizon) && horizon > 0;
    const validT = isFiniteNumber(t) && t >= 0 && t <= horizon;
    const validTv = isFiniteNumber(expectedTerminalTotalValue) && expectedTerminalTotalValue > 0;
    if (!validTv || !validHorizon || !validT) {
        return null;
    }
    const target = toFiniteNumber(targetCagr);
    const bench = toFiniteNumber(benchmark);
    const rf = toFiniteNumber(riskFreeRate);
    const strong = toFiniteNumber(strongCagr ?? (target !== null ? target + 0.05 : null));
    if (!areValidBandRates([target, bench, rf, strong])) {
        return null;
    }

    const remaining = horizon - t;
    return {
        strongBuy: expectedTerminalTotalValue / (1 + strong) ** remaining,
        buy: expectedTerminalTotalValue / (1 + target) ** remaining,
        fair: expectedTerminalTotalValue / (1 + bench) ** remaining,
        sell: expectedTerminalTotalValue / (1 + rf) ** remaining,
    };
}

function evaluateGate1(config, latestJournal, scenarios) {
    const actionText = latestJournal && latestJournal.action ? latestJournal.action : '';
    const action = String(actionText).trim().toUpperCase();
    const journalClosed = action === 'CLOSE_LONG' || action === 'EXIT';
    const allScenariosRetired =
        scenarios.length > 0 && scenarios.every((s) => isRetiredScenario(s));
    const effectiveEps = getEffectiveEps(config);
    const nonPositiveEps = !isFiniteNumber(effectiveEps) || effectiveEps <= 0;

    const beliefState = getObjectField(config, 'belief_state');
    const thesisIntactProbability = toFiniteNumber(beliefState.thesis_intact_probability);
    const hasThesisIntactProbability = thesisIntactProbability !== null;
    const lowThesisProb = hasThesisIntactProbability && thesisIntactProbability < 0.15;

    const reasons = [];
    if (journalClosed) {
        reasons.push('journal-closed');
    }
    if (allScenariosRetired) {
        reasons.push('scenarios-retired');
    }
    if (nonPositiveEps) {
        reasons.push('non-positive-eps');
    }
    if (lowThesisProb) {
        reasons.push('thesis-intact-low');
    }

    return {
        gate1Broken: reasons.length > 0,
        reasons,
        allScenariosRetired,
        hasThesisIntactProbability,
        thesisIntactProbability,
    };
}

function isTickerFlagActive(flag, symbol, snapshotDate, snapshotDayMs) {
    if (!flag || (flag.ticker && String(flag.ticker).toUpperCase() !== symbol)) {
        return false;
    }
    const flagDayMs = parseIsoDayMs(flag.date);
    if (flagDayMs === null || snapshotDayMs === null) {
        return false;
    }
    if (flag.kind === 'filing') {
        const ageDays = Math.round((snapshotDayMs - flagDayMs) / DAY_MS);
        return ageDays >= 0 && ageDays <= FILING_ACTIVE_DAYS;
    }
    if (flag.kind === 'review-date') {
        return flag.date <= snapshotDate;
    }
    return false;
}

function collectTickerWarnings(
    activeEventFlags,
    overduePredictions,
    lowConfidence,
    marketStale,
    marketAgeUnknown
) {
    const warnings = [];
    for (let i = 0; i < activeEventFlags.length; i++) {
        const flag = activeEventFlags[i];
        if (flag.kind === 'filing') {
            warnings.push(`${flag.form || 'FILING'} ${flag.date}`);
        } else if (flag.kind === 'review-date') {
            warnings.push(`REVIEW ${flag.date}`);
        }
    }
    if (overduePredictions.length > 0) {
        warnings.push(`${overduePredictions.length} PRED OVERDUE`);
    }
    if (lowConfidence) {
        warnings.push('LOW CONF');
    }
    if (marketStale) {
        warnings.push('MARKET STALE');
    }
    if (marketAgeUnknown) {
        warnings.push('MARKET AGE UNKNOWN');
    }
    return warnings;
}

function evaluateFlagsAndStaleness(config, eventFlags, flagsGeneratedAt, nowMs) {
    const snapshotDate = formatUtcIsoDate(nowMs);
    const snapshotDayMs = parseIsoDayMs(snapshotDate);

    const market = getObjectField(config, 'market');
    const marketMs = parseTimestampMs(market.marketDataUpdatedAt);
    const marketAgeUnknown = marketMs === null;
    const marketStale = marketMs !== null && nowMs - marketMs > STALE_AGE_MS;

    const flagsGenMs = parseTimestampMs(flagsGeneratedAt);
    const flagsStale = flagsGenMs !== null && nowMs - flagsGenMs > STALE_AGE_MS;

    const symbol = String(config && config.symbol ? config.symbol : '').toUpperCase();
    const list = Array.isArray(eventFlags) ? eventFlags : [];
    const activeEventFlags = list.filter((flag) =>
        isTickerFlagActive(flag, symbol, snapshotDate, snapshotDayMs)
    );

    const predictions = Array.isArray(config?.predictions) ? config.predictions : [];
    const overduePredictions = predictions.filter((pred) => {
        if (!pred || pred.resolved) {
            return false;
        }
        const dueField = pred.review_date || pred.dueDate;
        const dueDayMs = parseIsoDayMs(dueField);
        return dueDayMs !== null && dueField < snapshotDate;
    });

    const beliefState = getObjectField(config, 'belief_state');
    const confidence = toFiniteNumber(beliefState.confidence);
    const lowConfidence = confidence !== null && confidence < 0.5;
    const tickerWarnings = collectTickerWarnings(
        activeEventFlags,
        overduePredictions,
        lowConfidence,
        marketStale,
        marketAgeUnknown
    );

    return {
        snapshotDate,
        marketStale,
        marketAgeUnknown,
        flagsStale,
        activeEventFlags,
        overduePredictions,
        lowConfidence,
        confidence,
        tickerWarnings,
    };
}

function classifyGate2Zone(price, bands, geometricCagr, targetCagr) {
    if (!bands || !(price > 0)) {
        return {
            zone: 'UNAVAILABLE',
            nextTrigger: null,
            triggerDistancePct: null,
            nearBoundary: false,
        };
    }

    let zone;
    if (price <= bands.strongBuy && isFiniteNumber(geometricCagr) && geometricCagr >= targetCagr) {
        zone = 'DEEP_VALUE';
    } else if (price <= bands.buy) {
        zone = 'BUY';
    } else if (price <= bands.fair) {
        zone = 'FAIR';
    } else if (price <= bands.sell) {
        zone = 'RICH';
    } else {
        zone = 'OVERVALUED';
    }

    const triggerDistancePct = bands.buy / price - 1;
    const nextTrigger = {
        label: price <= bands.buy ? 'Fair >' : 'Buy <',
        price: bands.buy,
        distancePct: triggerDistancePct,
    };
    const nearBoundary = Math.abs(triggerDistancePct) < NEAR_BOUNDARY_PCT;

    return { zone, nextTrigger, triggerDistancePct, nearBoundary };
}

function formatPctLabel(fraction) {
    return `${(fraction * 100).toFixed(1)}%`;
}

function formatSignedDeltaPct(delta) {
    const sign = delta >= 0 ? '+' : '-';
    return `${sign}${(Math.abs(delta) * 100).toFixed(1)}%`;
}

function buildVerdict(
    baseSizing,
    verdictCode,
    verdictLabel,
    verdictDisplay,
    verdictTone,
    sortPriority
) {
    return {
        ...baseSizing,
        verdictCode,
        verdictLabel,
        verdictDisplay,
        verdictTone,
        sortPriority,
    };
}

function synthesizeBuyZoneVerdict({ isDeep, wCurr, wMax, wRec, wDelta, delta, baseSizing }) {
    if (wCurr === 0 && wRec > 0) {
        const label = isDeep ? 'STRONG BUY' : 'BUY · INITIATE';
        const code = isDeep ? 'STRONG_BUY_INITIATE' : 'BUY_INITIATE';
        return buildVerdict(
            baseSizing,
            code,
            label,
            `${label} (≤${formatPctLabel(wRec)})`,
            'green',
            3
        );
    }
    if (wCurr > wMax + delta && wRec >= wMax) {
        return buildVerdict(
            baseSizing,
            'TRIM_TO_CAP',
            'TRIM TO CAP',
            `TRIM TO CAP (${formatSignedDeltaPct(wMax - wCurr)})`,
            'red',
            2
        );
    }
    if (wCurr > wRec + delta) {
        return buildVerdict(
            baseSizing,
            'TRIM_OVER_KELLY',
            'TRIM · OVER KELLY',
            `TRIM · OVER KELLY (${formatSignedDeltaPct(wDelta)})`,
            'red',
            2
        );
    }
    if (wDelta > delta) {
        const label = isDeep ? 'STRONG BUY' : 'ADD';
        const code = isDeep ? 'STRONG_BUY_ADD' : 'ADD';
        const suffix =
            wRec >= wMax ? `${formatSignedDeltaPct(wDelta)} to cap` : formatSignedDeltaPct(wDelta);
        return buildVerdict(baseSizing, code, label, `${label} (${suffix})`, 'green', 3);
    }
    if (wCurr > wMax && wCurr <= wMax + delta) {
        return buildVerdict(
            baseSizing,
            'HOLD_AT_CAP',
            'HOLD · AT CAP',
            'HOLD · AT CAP',
            'muted',
            5
        );
    }
    if (wCurr === 0 && wRec === 0) {
        return buildVerdict(baseSizing, 'WATCH', 'WATCH', 'WATCH', 'muted', 6);
    }
    return buildVerdict(
        baseSizing,
        'HOLD_AT_TARGET',
        'HOLD · AT TARGET',
        'HOLD · AT TARGET',
        'muted',
        5
    );
}

function synthesizeFairZoneVerdict({ wCurr, wMax, wRec, wDelta, delta, nextTrigger, baseSizing }) {
    if (wCurr > wMax + delta && wRec >= wMax) {
        return buildVerdict(
            baseSizing,
            'TRIM_TO_CAP',
            'TRIM TO CAP',
            `TRIM TO CAP (${formatSignedDeltaPct(wMax - wCurr)})`,
            'red',
            2
        );
    }
    if (wCurr > wRec + delta) {
        return buildVerdict(
            baseSizing,
            'TRIM_OVER_KELLY',
            'TRIM · OVER KELLY',
            `TRIM · OVER KELLY (${formatSignedDeltaPct(wDelta)})`,
            'red',
            2
        );
    }
    if (wCurr > 0) {
        return buildVerdict(baseSizing, 'HOLD', 'HOLD', 'HOLD', 'muted', 5);
    }
    const buyStr = nextTrigger ? ` (< $${nextTrigger.price.toFixed(1)})` : '';
    return buildVerdict(baseSizing, 'WATCH', 'WATCH', `WATCH${buyStr}`, 'muted', 6);
}

function synthesizeRichZoneVerdict({ wCurr, wMax, wRec, delta, baseSizing }) {
    const wRich = Math.min(wRec, 0.5 * wMax);
    const richSizing = { ...baseSizing, richTargetWeight: wRich };
    if (wCurr > wRich + delta) {
        return buildVerdict(
            richSizing,
            'TRIM_RICH',
            'TRIM',
            `TRIM (${formatSignedDeltaPct(wRich - wCurr)})`,
            'gold',
            4
        );
    }
    if (wCurr > 0) {
        return buildVerdict(richSizing, 'HOLD_RICH', 'HOLD · RICH', 'HOLD · RICH', 'gold', 5);
    }
    return buildVerdict(richSizing, 'PASS', 'PASS', 'PASS', 'muted', 6);
}

function synthesizeGate3Verdict({
    zone,
    bands,
    currentWeight,
    maxWeight,
    scaledKelly,
    nextTrigger,
}) {
    const wCurr = isFiniteNumber(currentWeight) && currentWeight > 0 ? currentWeight : 0;
    const wMax = isFiniteNumber(maxWeight) && maxWeight >= 0 ? maxWeight : 0.3;
    const delta = Math.max(0.005, 0.1 * wMax);

    if (!bands || zone === 'UNAVAILABLE' || !isFiniteNumber(scaledKelly)) {
        const verdictLabel = wCurr > 0 ? 'HOLD · DATA' : 'WATCH · DATA';
        const code = wCurr > 0 ? 'HOLD_DATA' : 'WATCH_DATA';
        return {
            verdictCode: code,
            verdictLabel,
            verdictDisplay: verdictLabel,
            verdictTone: 'muted',
            sortPriority: 5,
            targetWeight: null,
            richTargetWeight: null,
            weightDelta: null,
            deadband: delta,
            kellyUnavailable: true,
        };
    }

    const wRec = Math.min(scaledKelly, wMax);
    const wDelta = wRec - wCurr;
    const baseSizing = {
        targetWeight: wRec,
        richTargetWeight: null,
        weightDelta: wDelta,
        deadband: delta,
        kellyUnavailable: false,
    };

    if (zone === 'DEEP_VALUE' || zone === 'BUY') {
        return synthesizeBuyZoneVerdict({
            isDeep: zone === 'DEEP_VALUE',
            wCurr,
            wMax,
            wRec,
            wDelta,
            delta,
            baseSizing,
        });
    }
    if (zone === 'FAIR') {
        return synthesizeFairZoneVerdict({
            wCurr,
            wMax,
            wRec,
            wDelta,
            delta,
            nextTrigger,
            baseSizing,
        });
    }
    if (zone === 'RICH') {
        return synthesizeRichZoneVerdict({ wCurr, wMax, wRec, delta, baseSizing });
    }
    if (wCurr > 0) {
        return buildVerdict(baseSizing, 'SELL_TRIM', 'SELL / TRIM', 'SELL / TRIM', 'red', 1);
    }
    return buildVerdict(baseSizing, 'AVOID', 'AVOID', 'AVOID', 'red', 6);
}

function summarizeScenarioSplit(scenarios, allRetired) {
    if (allRetired) {
        return 'RETIRED';
    }
    const active = (Array.isArray(scenarios) ? scenarios : []).filter((s) => !isRetiredScenario(s));
    if (active.length === 0) {
        return 'RETIRED';
    }
    const byRole = { bull: null, base: null, bear: null };
    for (let i = 0; i < active.length; i++) {
        const item = active[i];
        const rawKey = item && (item.id || item.name) ? item.id || item.name : '';
        const key = String(rawKey).trim().toLowerCase();
        if (key.startsWith('bull')) {
            byRole.bull = item.prob;
        } else if (key.startsWith('base')) {
            byRole.base = item.prob;
        } else if (key.startsWith('bear')) {
            byRole.bear = item.prob;
        }
    }
    if (byRole.bull !== null && byRole.base !== null && byRole.bear !== null) {
        return `${Math.round(byRole.bull * 100)}/${Math.round(byRole.base * 100)}/${Math.round(byRole.bear * 100)}`;
    }
    return active.map((s) => Math.round((toFiniteNumber(s.prob) ?? 0) * 100)).join('/');
}

function resolveBandInputs(config, metrics) {
    const prefs = getPreferences(config);
    const m = metrics && typeof metrics === 'object' ? metrics : {};
    const price = pickFiniteNumber([m.price], getEffectivePrice(config));
    const horizon = pickFiniteNumber([m.horizon, prefs.horizon], 5);
    const targetCagr = pickFiniteNumber([m.targetCagr, prefs.targetCagr], 0.12);
    const benchmark = pickFiniteNumber([m.benchmark], getBenchmarkRate(config));
    const riskFreeRate = pickFiniteNumber(
        [m.riskFreeRate, prefs.riskFreeRate],
        DEFAULT_RISK_FREE_RATE
    );
    const fallbackTv =
        isFiniteNumber(m.expectedMultiple) && price > 0 ? m.expectedMultiple * price : null;
    const expectedTerminalTotalValue = pickFiniteNumber([m.expectedTerminalTotalValue, fallbackTv]);
    return {
        price,
        horizon,
        targetCagr,
        benchmark,
        riskFreeRate,
        expectedTerminalTotalValue,
        geometricCagr: toFiniteNumber(m.geometricCagr),
        scaledKelly: toFiniteNumber(m.scaledKelly),
    };
}

function buildBrokenDecision({
    symbol,
    gate1,
    flagState,
    wCurr,
    maxWeight,
    scenarioSplit,
    confidencePct,
    reviewDate,
}) {
    const brokenLabel = wCurr > 0 ? 'EXIT · THESIS BROKEN' : 'AVOID · THESIS BROKEN';
    const hasTickerFlag = flagState.tickerWarnings.length > 0;
    return {
        symbol,
        gate1Broken: true,
        gate1Reasons: gate1.reasons,
        hasThesisIntactProbability: gate1.hasThesisIntactProbability,
        thesisIntactProbability: gate1.thesisIntactProbability,
        zone: 'THESIS_BROKEN',
        bands: null,
        nextTrigger: null,
        triggerDistancePct: null,
        nearBoundary: false,
        verdictCode: wCurr > 0 ? 'EXIT_BROKEN' : 'AVOID_BROKEN',
        verdictLabel: brokenLabel,
        verdictDisplay: brokenLabel,
        verdictTone: 'red',
        sortPriority: 0,
        currentWeight: wCurr,
        targetWeight: 0,
        richTargetWeight: null,
        maxWeight,
        weightDelta: -wCurr,
        deadband: Math.max(0.005, 0.1 * maxWeight),
        kellyUnavailable: false,
        scenarioSplit,
        confidence: flagState.confidence,
        confidencePct,
        reviewDate,
        ...flagState,
        hasTickerFlag,
        hasFlag: hasTickerFlag || flagState.flagsStale,
    };
}

export function evaluateTickerDecision(
    config,
    metrics,
    { currentWeight = 0, eventFlags = [], flagsGeneratedAt = null, nowMs } = {}
) {
    if (!isFiniteNumber(nowMs)) {
        throw new Error('evaluateTickerDecision requires a finite nowMs timestamp');
    }

    const scenarios = Array.isArray(config?.scenarios) ? config.scenarios : [];
    const latestJournal = getLatestJournalEntry(config?.decision_journal);
    const reviewDate = latestJournal?.review_date ? String(latestJournal.review_date) : null;

    const gate1 = evaluateGate1(config, latestJournal, scenarios);
    const flagState = evaluateFlagsAndStaleness(config, eventFlags, flagsGeneratedAt, nowMs);

    const wCurr = isFiniteNumber(currentWeight) && currentWeight > 0 ? currentWeight : 0;
    const constraints = getObjectField(getObjectField(config, 'position'), 'constraints');
    const maxWeight = pickFiniteNumber([constraints.maxWeight], 0.3);
    const safeMaxWeight = maxWeight >= 0 ? maxWeight : 0.3;
    const scenarioSplit = summarizeScenarioSplit(scenarios, gate1.allScenariosRetired);
    const confidencePct =
        flagState.confidence !== null ? Math.round(flagState.confidence * 100) : null;
    const symbol = config && config.symbol ? config.symbol : '';

    if (gate1.gate1Broken) {
        return buildBrokenDecision({
            symbol,
            gate1,
            flagState,
            wCurr,
            maxWeight: safeMaxWeight,
            scenarioSplit,
            confidencePct,
            reviewDate,
        });
    }

    const inputs = resolveBandInputs(config, metrics);
    const bands = computeIsoCagrBands(
        inputs.expectedTerminalTotalValue,
        inputs.horizon,
        {
            targetCagr: inputs.targetCagr,
            benchmark: inputs.benchmark,
            riskFreeRate: inputs.riskFreeRate,
            strongCagr: inputs.targetCagr + 0.05,
        },
        0
    );
    const gate2 = classifyGate2Zone(inputs.price, bands, inputs.geometricCagr, inputs.targetCagr);
    const gate3 = synthesizeGate3Verdict({
        zone: gate2.zone,
        bands,
        currentWeight: wCurr,
        maxWeight: safeMaxWeight,
        scaledKelly: inputs.scaledKelly,
        nextTrigger: gate2.nextTrigger,
    });

    const tickerWarnings = gate3.kellyUnavailable
        ? [...flagState.tickerWarnings, 'KELLY UNAVAILABLE']
        : [...flagState.tickerWarnings];
    const hasTickerFlag = tickerWarnings.length > 0;

    return {
        symbol,
        gate1Broken: false,
        gate1Reasons: [],
        hasThesisIntactProbability: gate1.hasThesisIntactProbability,
        thesisIntactProbability: gate1.thesisIntactProbability,
        zone: gate2.zone,
        bands,
        nextTrigger: gate2.nextTrigger,
        triggerDistancePct: gate2.triggerDistancePct,
        nearBoundary: gate2.nearBoundary,
        ...gate3,
        currentWeight: wCurr,
        maxWeight: safeMaxWeight,
        scenarioSplit,
        confidence: flagState.confidence,
        confidencePct,
        reviewDate,
        ...flagState,
        tickerWarnings,
        hasTickerFlag,
        hasFlag: hasTickerFlag || flagState.flagsStale,
    };
}

function formatTriggerSummary(nextTrigger) {
    if (!nextTrigger) {
        return 'n/a';
    }
    return `${nextTrigger.label} $${nextTrigger.price.toFixed(1)} (${formatSignedDeltaPct(nextTrigger.distancePct)})`;
}

function orNull(value) {
    return value === undefined ? null : value;
}

export function buildDecisionSnapshot(config, decision, metricsArg = null) {
    const cfg = config || {};
    const metrics = metricsArg || cfg.metrics || {};
    const dec = decision || {};
    const meanStr = isFiniteNumber(metrics.expectedCagr)
        ? `${(metrics.expectedCagr * 100).toFixed(1)}%`
        : 'n/a';
    const triggerStr = formatTriggerSummary(dec.nextTrigger);
    const symbol = cfg.symbol || dec.symbol || '';
    const verdict = dec.verdictDisplay || dec.verdictLabel || 'HOLD';
    return {
        symbol,
        name: cfg.name || symbol,
        verdict,
        verdictCode: orNull(dec.verdictCode),
        zone: orNull(dec.zone),
        meanCagr: orNull(metrics.expectedCagr),
        geoCagr: orNull(metrics.geometricCagr),
        expectedMultiple: orNull(metrics.expectedMultiple),
        currentWeight: isFiniteNumber(dec.currentWeight) ? dec.currentWeight : 0,
        targetWeight: orNull(dec.targetWeight),
        maxWeight: orNull(dec.maxWeight),
        weightDelta: orNull(dec.weightDelta),
        nextTrigger: orNull(dec.nextTrigger),
        triggerDistancePct: orNull(dec.triggerDistancePct),
        nearBoundary: Boolean(dec.nearBoundary),
        scenarioSplit: dec.scenarioSplit || '',
        confidencePct: orNull(dec.confidencePct),
        reviewDate: orNull(dec.reviewDate),
        hasFlag: Boolean(dec.hasFlag),
        text: `${symbol}: ${verdict} · Mean ${meanStr} · ${triggerStr}`,
    };
}

export function buildBoardSnapshot(rows = [], metadata = {}) {
    const sorted = [...rows].sort((a, b) => {
        const pa = a?.decision?.sortPriority ?? 99;
        const pb = b?.decision?.sortPriority ?? 99;
        if (pa !== pb) {
            return pa - pb;
        }
        return String(a?.symbol || '').localeCompare(String(b?.symbol || ''));
    });

    let totalCurrentWeight = 0;
    let totalRecommendedWeight = 0;
    let thesisProbUnmigrated = false;
    let anyRowFlagsStale = false;

    for (let i = 0; i < sorted.length; i++) {
        const dec = sorted[i] && sorted[i].decision;
        if (!dec) {
            continue;
        }
        totalCurrentWeight += isFiniteNumber(dec.currentWeight) ? dec.currentWeight : 0;
        totalRecommendedWeight += isFiniteNumber(dec.targetWeight) ? dec.targetWeight : 0;
        if (!dec.hasThesisIntactProbability) {
            thesisProbUnmigrated = true;
        }
        if (dec.flagsStale) {
            anyRowFlagsStale = true;
        }
    }

    const flagsGenMs = parseTimestampMs(metadata.flagsGeneratedAt);
    const nowMs = metadata.nowMs;
    const metaFlagsStale =
        flagsGenMs !== null && isFiniteNumber(nowMs) && nowMs - flagsGenMs > STALE_AGE_MS;
    const flagsStale = Boolean(metadata.flagsStale || metaFlagsStale || anyRowFlagsStale);
    const residualTargetCash = 1 - totalRecommendedWeight;
    const budgetExceeded = totalRecommendedWeight > 1 + 1e-9;

    const warnings = [];
    if (thesisProbUnmigrated) {
        warnings.push('THESIS PROB UNMIGRATED');
    }
    if (flagsStale) {
        warnings.push('FLAGS STALE');
    }
    if (budgetExceeded) {
        warnings.push('Budget >100% — scale ADDs pro-rata');
    }

    return {
        rows: sorted,
        totalCurrentWeight,
        totalRecommendedWeight,
        residualTargetCash,
        residualTargetCashLabel: 'Residual Target Cash',
        budgetExceeded,
        thesisProbUnmigrated,
        flagsStale,
        warnings,
    };
}
