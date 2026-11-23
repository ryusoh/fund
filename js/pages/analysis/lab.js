/* global getComputedStyle */
import { computeBrierScore } from './bayes.js';
import {
    DEFAULT_RISK_FREE_RATE,
    buildBoardSnapshot,
    buildDecisionSnapshot,
    computeMetrics,
    evaluateTickerDecision,
    getEffectivePrice,
    getEffectiveVolatility,
} from './decision.js';
import { attachDecisionChartInteractions, renderDecisionChart } from './decisionChart.js';
import { fetchRealTimeData } from '../../transactions/realtimeData.js';
import { isLocalhost } from '../../utils/host.js';
import { logger } from '../../utils/logger.js';
import {
    convertValueToCurrency,
    formatCurrency as formatInSelectedCurrency,
    formatCurrencyCompact as formatCompactInSelectedCurrency,
} from '../../transactions/utils.js';
import { getSelectedCurrency, whenTransactionDataReady } from '../../transactions/state.js';

let paneRoot = null;
let contextEl = null;
let decisionBoardEl = null;
let boardBudgetFooterEl = null;
let verdictStripEl = null;
let decisionChartCanvas = null;
let sizingBulletEl = null;
let riskFooterEl = null;
let detachChartInteractions = null;

const state = {
    configs: [],
    activeSymbol: 'PORT',
    activeSection: 'board',
    horizonMode: '2y',
    eventFlags: null,
    portfolioTotalValue: 0,
    lastNowMs: null,
};

const DATA_CACHE_BUST = Date.now().toString();
const LATEST_FX_DATE = '9999-12-31';

const ANALYSIS_SECTIONS = ['board', 'ticker'];

const PANE_MARKUP = `
    <div class="pane-context" id="paneContext"></div>
    <div class="analysis-stage" tabindex="0">
        <div class="output-grid">
            <section data-analysis-section="board" class="decision-board-section">
                <div
                    class="decision-board"
                    id="decisionBoard"
                    role="table"
                    aria-label="Portfolio decision board"
                ></div>
                <div class="board-budget-footer" id="boardBudgetFooter"></div>
            </section>
            <section
                data-analysis-section="ticker"
                class="decision-ticker-section is-hidden"
            >
                <div class="verdict-strip" id="verdictStrip"></div>
                <div class="decision-chart-wrap">
                    <canvas
                        id="decisionChartCanvas"
                        class="pane-canvas"
                        role="img"
                        aria-label="Ticker valuation corridor and decision chart"
                    ></canvas>
                </div>
                <div class="sizing-bullet" id="sizingBullet"></div>
                <div class="risk-footer" id="riskFooter"></div>
            </section>
        </div>
    </div>
`;

const PANE_CHART_COLORS = {
    grid: 'rgba(109, 121, 155, 0.35)',
    line: '#c9d1d9',
    muted: '#8b949e',
    gold: '#f0b90b',
    green: '#34a853',
    greenFill: 'rgba(52, 168, 83, 0.08)',
    greenDeepFill: 'rgba(52, 168, 83, 0.14)',
    goldFill: 'rgba(240, 185, 11, 0.09)',
    redFill: 'rgba(234, 67, 53, 0.12)',
    red: '#ea4335',
    blue: '#64b5f6',
};

const TOKEN_PROPERTIES = {
    line: '--text-color',
    muted: '--muted-text',
    gold: '--primary-color',
    green: '--green-color',
    red: '--red-color',
    blue: '--blue-color',
};

function syncPaneChartColors() {
    if (!paneRoot || typeof getComputedStyle !== 'function') {
        return;
    }
    const computed = getComputedStyle(paneRoot);
    Object.entries(TOKEN_PROPERTIES).forEach(([key, prop]) => {
        const value = computed.getPropertyValue(prop).trim();
        if (value) {
            PANE_CHART_COLORS[key] = value;
        }
    });
    const hexMatch = PANE_CHART_COLORS.green.match(/^#([0-9a-f]{6})$/i);
    if (hexMatch) {
        const r = parseInt(hexMatch[1].slice(0, 2), 16);
        const g = parseInt(hexMatch[1].slice(2, 4), 16);
        const b = parseInt(hexMatch[1].slice(4, 6), 16);
        PANE_CHART_COLORS.greenFill = `rgba(${r}, ${g}, ${b}, 0.08)`;
        PANE_CHART_COLORS.greenDeepFill = `rgba(${r}, ${g}, ${b}, 0.14)`;
    }
}

export async function fetchJson(path) {
    const url = new URL(path, window.location.href);
    url.searchParams.set('v', DATA_CACHE_BUST);
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load ${path}`);
    }
    return response.json();
}

function formatCurrency(value) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    return formatInSelectedCurrency(
        convertValueToCurrency(value, LATEST_FX_DATE, getSelectedCurrency())
    );
}

function formatCompactCurrency(value) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    return formatCompactInSelectedCurrency(
        convertValueToCurrency(value, LATEST_FX_DATE, getSelectedCurrency())
    );
}

function formatSignedPercent(value, decimals = 1) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    const pct = value * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(decimals)}%`;
}

function formatPlainPercent(value, decimals = 1) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    return `${(value * 100).toFixed(decimals)}%`;
}

function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
        return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeMarketConfig(market) {
    const norm = market ? { ...market } : {};
    Object.keys(norm).forEach((key) => {
        const num = toFiniteNumber(norm[key]);
        if (num !== null) {
            norm[key] = num;
        }
    });
    return norm;
}

function normalizeRiskConfig(risk) {
    const norm = risk ? { ...risk } : {};
    const vol = toFiniteNumber(norm.volatility);
    norm.volatility = vol !== null ? vol : null;
    return norm;
}

function normalizeBenchmark(benchmark) {
    if (benchmark && typeof benchmark === 'object') {
        return {
            type: benchmark.type || 'annualReturn',
            name: benchmark.name || 'Benchmark',
            value: toFiniteNumber(benchmark.value) ?? 0.065,
        };
    }
    return {
        type: 'annualReturn',
        name: 'Benchmark',
        value: toFiniteNumber(benchmark) ?? 0.065,
    };
}

function normalizeModelConfig(model) {
    const norm = model ? { ...model } : {};
    norm.version = norm.version || '1.0.0';
    const prefs = norm.preferences ? { ...norm.preferences } : {};
    prefs.horizon = toFiniteNumber(prefs.horizon) ?? 5;
    prefs.kellyScale = toFiniteNumber(prefs.kellyScale) ?? 0.5;
    prefs.targetCagr = toFiniteNumber(prefs.targetCagr) ?? 0.12;
    prefs.riskFreeRate = toFiniteNumber(prefs.riskFreeRate) ?? DEFAULT_RISK_FREE_RATE;
    prefs.benchmark = normalizeBenchmark(prefs.benchmark);
    const overrides = prefs.overrides ? { ...prefs.overrides } : {};
    ['price', 'eps', 'volatility'].forEach((key) => {
        const num = toFiniteNumber(overrides[key]);
        if (num !== null) {
            overrides[key] = num;
        } else {
            delete overrides[key];
        }
    });
    prefs.overrides = overrides;
    norm.preferences = prefs;
    return norm;
}

function normalizeConfig(raw, holdingDetails = {}) {
    const shares = toFiniteNumber(holdingDetails.shares ?? raw.position?.shares ?? raw.shares);
    const position = raw.position ? { ...raw.position } : {};
    if (shares !== null) {
        position.shares = shares;
    }
    position.constraints = position.constraints || { minWeight: 0, maxWeight: 0.3 };

    const config = {
        ...raw,
        symbol: raw.symbol || holdingDetails.symbol || '',
        name: raw.name || raw.symbol || '',
        meta: raw.meta ? { ...raw.meta } : {},
        market: normalizeMarketConfig(raw.market),
        risk: normalizeRiskConfig(raw.risk),
        model: normalizeModelConfig(raw.model),
        position,
        scenarios: Array.isArray(raw.scenarios) ? raw.scenarios.map((s) => ({ ...s })) : [],
    };
    const price = getEffectivePrice(config);
    config.marketValue = (Number(position.shares) || 0) * price;
    config.weight = 0;
    return config;
}

function unavailableHistory(symbol) {
    return {
        symbol,
        prices: [],
        eps: [],
        priceBasis: 'unavailable',
        priceBasisVerified: false,
        epsPointInTimeCertified: false,
    };
}

function resolvePriceSourceAndApplyLive(config, realTimeData) {
    const prefs = config.model.preferences || {};
    const overrides = prefs.overrides || {};
    const hasPriceOverride = toFiniteNumber(overrides.price) !== null;
    const sym = config.symbol;
    const rtPrices = realTimeData && realTimeData.prices ? realTimeData.prices : {};
    const rtPrice = toFiniteNumber(rtPrices[sym]);
    const marketUpdatedAt = config.market.marketDataUpdatedAt || null;

    if (hasPriceOverride) {
        config.priceSource = 'override';
        config.priceAsOf = config.meta.asOf || null;
        return;
    }

    if (rtPrice !== null && rtPrice > 0) {
        config.market.price = rtPrice;
        const host =
            typeof window !== 'undefined' && window.location ? window.location.hostname || '' : '';
        const local = typeof window === 'undefined' || isLocalhost(host);
        config.priceSource = local ? 'static_fund_data' : 'realtime_feed';
        config.priceAsOf = realTimeData.date || marketUpdatedAt;
        return;
    }

    config.priceSource = 'config_snapshot';
    config.priceAsOf = marketUpdatedAt || config.meta.asOf || null;
}

function buildCompositionWeightMap(realTimeData) {
    const map = new Map();
    const list = Array.isArray(realTimeData?.composition) ? realTimeData.composition : [];
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const sym = item?.ticker ? String(item.ticker).toUpperCase() : '';
        const pct = toFiniteNumber(item?.percent);
        if (sym && pct !== null) {
            map.set(sym, pct / 100);
        }
    }
    return map;
}

function resolveNormalizedWeight(cfg, realTimeData, compWeightMap, fallbackTotalValue) {
    if (compWeightMap.has(cfg.symbol)) {
        return compWeightMap.get(cfg.symbol);
    }
    const balance = toFiniteNumber(realTimeData?.balance);
    const usdWeight = toFiniteNumber(realTimeData?.tickerWeights?.[cfg.symbol]);
    if (balance !== null && balance > 0 && usdWeight !== null) {
        return usdWeight / balance;
    }
    return fallbackTotalValue > 0 ? cfg.marketValue / fallbackTotalValue : 0;
}

function groupFlagsBySymbol(eventFlags) {
    const map = new Map();
    const flags = Array.isArray(eventFlags?.flags) ? eventFlags.flags : [];
    for (let i = 0; i < flags.length; i++) {
        const flag = flags[i];
        const sym = flag?.ticker ? String(flag.ticker).toUpperCase() : '';
        if (!sym) {
            continue;
        }
        if (!map.has(sym)) {
            map.set(sym, []);
        }
        map.get(sym).push(flag);
    }
    return map;
}

async function buildConfigs() {
    const [analysisIndex, holdingsData, eventFlags, realTimeData] = await Promise.all([
        fetchJson('../data/analysis/index.json'),
        fetchJson('../data/holdings_details.json'),
        fetchJson('../data/analysis/event_flags.json').catch(() => null),
        fetchRealTimeData().catch(() => null),
    ]);
    const nowMs = Date.now();
    state.lastNowMs = nowMs;
    state.eventFlags = eventFlags;

    const entries = Array.isArray(analysisIndex?.tickers) ? analysisIndex.tickers : [];
    const loaded = await Promise.all(
        entries.map(async (entry) => {
            try {
                const histPath =
                    entry.historyPath || `../data/analysis/${entry.symbol}.history.json`;
                const [raw, history] = await Promise.all([
                    fetchJson(entry.path),
                    fetchJson(histPath).catch(() => unavailableHistory(entry.symbol)),
                ]);
                const config = normalizeConfig(
                    { ...raw, symbol: raw.symbol || entry.symbol, name: raw.name || entry.name },
                    holdingsData[entry.symbol] || {}
                );
                config.symbol = String(entry.symbol).toUpperCase();
                config.name = raw.name || entry.name || config.symbol;
                config.history = history;
                resolvePriceSourceAndApplyLive(config, realTimeData);
                config.marketValue =
                    (Number(config.position?.shares) || 0) * getEffectivePrice(config);
                return config;
            } catch (error) {
                logger.warn('Analysis lab load failed:', error);
                return null;
            }
        })
    );

    const validConfigs = loaded.filter(Boolean);
    const fallbackTotalValue = validConfigs.reduce((sum, cfg) => sum + cfg.marketValue, 0);
    const rtBalance = toFiniteNumber(realTimeData?.balance);
    state.portfolioTotalValue =
        rtBalance !== null && rtBalance > 0 ? rtBalance : fallbackTotalValue;

    const compWeightMap = buildCompositionWeightMap(realTimeData);
    const flagsBySymbol = groupFlagsBySymbol(eventFlags);

    validConfigs.forEach((cfg) => {
        cfg.weight = resolveNormalizedWeight(cfg, realTimeData, compWeightMap, fallbackTotalValue);
        cfg.metrics = computeMetrics(cfg);
        cfg.decision = evaluateTickerDecision(cfg, cfg.metrics, {
            currentWeight: cfg.weight,
            eventFlags: flagsBySymbol.get(cfg.symbol) || [],
            flagsGeneratedAt: eventFlags?.generatedAt || null,
            nowMs,
        });
    });

    state.configs = validConfigs;
}

function buildPaneDom(rootEl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'lab-container';
    // Static markup only — no interpolated data.
    wrapper.innerHTML = PANE_MARKUP;
    rootEl.appendChild(wrapper);
}

function resolvePaneElements(rootEl) {
    paneRoot = rootEl;
    syncPaneChartColors();
    contextEl = rootEl.querySelector('#paneContext');
    decisionBoardEl = rootEl.querySelector('#decisionBoard');
    boardBudgetFooterEl = rootEl.querySelector('#boardBudgetFooter');
    verdictStripEl = rootEl.querySelector('#verdictStrip');
    decisionChartCanvas = rootEl.querySelector('#decisionChartCanvas');
    sizingBulletEl = rootEl.querySelector('#sizingBullet');
    riskFooterEl = rootEl.querySelector('#riskFooter');
}

function makeEl(tag, className, textContent = null) {
    const el = document.createElement(tag);
    if (className) {
        el.className = className;
    }
    if (textContent !== null && textContent !== undefined) {
        el.textContent = textContent;
    }
    return el;
}

function createContextPill(label, isActive) {
    const pill = makeEl('span', `context-pill${isActive ? ' is-active' : ''}`, label);
    if (isActive) {
        pill.setAttribute('aria-current', 'page');
    }
    return pill;
}

function renderContextStrip() {
    if (!contextEl) {
        return;
    }
    contextEl.replaceChildren();

    const strip = makeEl('div', 'context-strip');
    strip.appendChild(createContextPill('PORT', state.activeSection === 'board'));
    state.configs.forEach((cfg) => {
        const isCurrent = state.activeSection === 'ticker' && state.activeSymbol === cfg.symbol;
        strip.appendChild(createContextPill(cfg.symbol, isCurrent));
    });

    const activeCfg =
        state.activeSection === 'ticker'
            ? state.configs.find((c) => c.symbol === state.activeSymbol)
            : null;
    let metaText = 'BOARD';
    if (activeCfg) {
        const horizonLabel =
            state.horizonMode === 'full' ? `FULL ${activeCfg.metrics?.horizon || 5}Y` : '2Y';
        const asOf = activeCfg.priceAsOf ? String(activeCfg.priceAsOf).slice(0, 10) : 'n/a';
        metaText = `${horizonLabel} · ${asOf} (${activeCfg.priceSource || 'snapshot'})`;
    } else if (state.configs.length > 0) {
        const firstDate = state.configs[0].priceAsOf
            ? String(state.configs[0].priceAsOf).slice(0, 10)
            : 'n/a';
        metaText = `BOARD · ${firstDate}`;
    }

    contextEl.append(strip, makeEl('span', 'context-meta', metaText));
}

function createValuationSpark(decision, price) {
    const wrap = makeEl('div', 'val-spark');
    const bands = decision?.bands;
    const triggerPct = decision?.triggerDistancePct;
    const trigLabel = Number.isFinite(triggerPct) ? formatSignedPercent(triggerPct) : 'n/a';

    if (!bands || !(price > 0) || decision.gate1Broken) {
        wrap.appendChild(makeEl('span', 'val-spark-na', 'suppressed'));
        return wrap;
    }

    const lo = bands.strongBuy * 0.85;
    const hi = bands.sell * 1.15;
    const span = Math.log(hi) - Math.log(lo);
    const pos = span > 0 ? Math.min(1, Math.max(0, (Math.log(price) - Math.log(lo)) / span)) : 0.5;
    const track = makeEl('span', 'val-spark-track');
    const dot = makeEl('span', `val-spark-dot tone-${decision.verdictTone || 'muted'}`);
    dot.style.left = `${(pos * 100).toFixed(1)}%`;
    track.appendChild(dot);

    wrap.append(track, makeEl('span', 'val-spark-pct', trigLabel));
    return wrap;
}

function createMiniSizingBullet(decision) {
    const wrap = makeEl('div', 'mini-bullet');
    if (decision.kellyUnavailable) {
        wrap.appendChild(makeEl('span', 'mini-bullet-na', 'Kelly n/a'));
        return wrap;
    }
    const wMax = decision.maxWeight || 0.3;
    const wCurr = decision.currentWeight || 0;
    const wRec = decision.targetWeight ?? 0;
    const scaleMax = Math.max(wMax * 1.25, wCurr * 1.15, 0.1);

    const track = makeEl('span', 'mini-bullet-track');
    const fill = makeEl('span', `mini-bullet-fill tone-${decision.verdictTone || 'muted'}`);
    fill.style.width = `${Math.min(100, (wCurr / scaleMax) * 100).toFixed(1)}%`;
    const tick = makeEl('span', 'mini-bullet-tick');
    tick.style.left = `${Math.min(100, (wRec / scaleMax) * 100).toFixed(1)}%`;
    track.append(fill, tick);

    const text = `${formatPlainPercent(wCurr, 0)}→${formatPlainPercent(wRec, 0)}`;
    wrap.append(track, makeEl('span', 'mini-bullet-text', text));
    return wrap;
}

function renderDecisionBoard() {
    const board = buildBoardSnapshot(
        state.configs.map((cfg) => ({ symbol: cfg.symbol, config: cfg, decision: cfg.decision })),
        { flagsGeneratedAt: state.eventFlags?.generatedAt || null, nowMs: state.lastNowMs }
    );
    if (!decisionBoardEl || !boardBudgetFooterEl) {
        return board;
    }

    decisionBoardEl.replaceChildren();
    const header = makeEl('div', 'board-row board-header');
    header.setAttribute('role', 'row');
    ['TICKER', 'VERDICT', 'VALUATION', 'MEAN', 'SIZING', 'PROBS / FLAGS'].forEach((title) => {
        const cell = makeEl('span', 'board-cell', title);
        cell.setAttribute('role', 'columnheader');
        header.appendChild(cell);
    });
    decisionBoardEl.appendChild(header);

    board.rows.forEach(({ symbol, config, decision }) => {
        const rowEl = makeEl('div', 'board-row');
        rowEl.setAttribute('role', 'row');

        const symCell = makeEl('span', 'board-cell board-ticker', symbol);
        const verdictCell = makeEl(
            'span',
            `board-cell board-verdict tone-${decision.verdictTone}`,
            decision.verdictDisplay
        );
        const sparkCell = makeEl('span', 'board-cell board-val-cell');
        sparkCell.appendChild(createValuationSpark(decision, config.metrics?.price));
        const meanCell = makeEl(
            'span',
            'board-cell board-mean',
            formatPlainPercent(config.metrics?.expectedCagr)
        );
        const sizeCell = makeEl('span', 'board-cell board-size-cell');
        sizeCell.appendChild(createMiniSizingBullet(decision));

        const probsCell = makeEl('span', 'board-cell board-probs');
        const confText = decision.confidencePct !== null ? ` · c${decision.confidencePct}%` : '';
        probsCell.appendChild(makeEl('span', null, `${decision.scenarioSplit}${confText}`));
        if (decision.hasTickerFlag) {
            probsCell.appendChild(makeEl('span', 'flag-badge', ' ⚑'));
        }

        [symCell, verdictCell, sparkCell, meanCell, sizeCell, probsCell].forEach((c) => {
            c.setAttribute('role', 'cell');
            rowEl.appendChild(c);
        });
        decisionBoardEl.appendChild(rowEl);
    });

    boardBudgetFooterEl.replaceChildren();
    const summaryText =
        `Normalized Holdings Σw_curr ${formatPlainPercent(board.totalCurrentWeight)} · ` +
        `Kelly Target Σw_rec ${formatPlainPercent(board.totalRecommendedWeight)} · ` +
        `Residual Target Cash ${formatPlainPercent(board.residualTargetCash)} ` +
        '(not actual cash; incl. watchlist)';
    boardBudgetFooterEl.appendChild(makeEl('span', 'budget-summary', summaryText));
    board.warnings.forEach((warning) => {
        boardBudgetFooterEl.appendChild(makeEl('span', 'flag-pill', `⚑ ${warning}`));
    });

    return board;
}

function renderVerdictStrip(config, decision, metrics) {
    if (!verdictStripEl) {
        return;
    }
    verdictStripEl.replaceChildren();
    const identity = makeEl('span', 'verdict-identity', `${config.symbol} · ${config.name}`);
    const badge = makeEl(
        'span',
        `verdict-badge tone-${decision.verdictTone}`,
        decision.verdictDisplay
    );
    const meanText = `Mean ${formatPlainPercent(metrics?.expectedCagr)}`;
    const trigText = decision.nextTrigger
        ? `${decision.nextTrigger.label} ${formatCurrency(decision.nextTrigger.price)} (${formatSignedPercent(decision.nextTrigger.distancePct)})`
        : 'Trigger n/a';
    const probsText = `${decision.scenarioSplit}${decision.confidencePct !== null ? ` · c${decision.confidencePct}%` : ''}`;

    verdictStripEl.append(
        identity,
        badge,
        makeEl('span', 'verdict-metric', `${meanText} · ${trigText}`),
        makeEl('span', 'verdict-probs', probsText)
    );

    decision.tickerWarnings.forEach((warn) => {
        verdictStripEl.appendChild(makeEl('span', 'flag-pill', `⚑ ${warn}`));
    });
    if (decision.flagsStale) {
        verdictStripEl.appendChild(makeEl('span', 'flag-pill', '⚑ FLAGS STALE'));
    }
}

function renderSizingBullet(decision, metrics) {
    if (!sizingBulletEl) {
        return;
    }
    sizingBulletEl.replaceChildren();

    const wCurr = decision.currentWeight || 0;
    const wMax = decision.maxWeight || 0.3;
    const wRec = decision.targetWeight;
    const scaleMax = Math.max(wMax * 1.25, wCurr * 1.15, 0.1);

    const track = makeEl('div', 'bullet-track');
    if (!decision.kellyUnavailable && wRec !== null) {
        const recZone = makeEl('span', 'bullet-zone-rec');
        recZone.style.width = `${Math.min(100, (wRec / scaleMax) * 100).toFixed(1)}%`;
        const roomZone = makeEl('span', 'bullet-zone-room');
        roomZone.style.left = `${Math.min(100, (wRec / scaleMax) * 100).toFixed(1)}%`;
        roomZone.style.width = `${Math.max(0, Math.min(100, (wMax / scaleMax) * 100) - Math.min(100, (wRec / scaleMax) * 100)).toFixed(1)}%`;
        const overZone = makeEl('span', 'bullet-zone-over');
        overZone.style.left = `${Math.min(100, (wMax / scaleMax) * 100).toFixed(1)}%`;
        track.append(recZone, roomZone, overZone);
    }

    const bar = makeEl('span', `bullet-bar tone-${decision.verdictTone}`);
    bar.style.width = `${Math.min(100, (wCurr / scaleMax) * 100).toFixed(1)}%`;
    const capLine = makeEl('span', 'bullet-cap');
    capLine.style.left = `${Math.min(100, (wMax / scaleMax) * 100).toFixed(1)}%`;
    track.append(bar, capLine);

    if (!decision.kellyUnavailable && wRec !== null) {
        const targetTick = makeEl('span', 'bullet-target');
        targetTick.style.left = `${Math.min(100, (wRec / scaleMax) * 100).toFixed(1)}%`;
        track.appendChild(targetTick);
    }

    let readoutText;
    if (decision.kellyUnavailable) {
        readoutText = `${formatPlainPercent(wCurr)} / cap ${formatPlainPercent(wMax, 0)} · Kelly n/a`;
    } else {
        const delta = decision.weightDelta ?? 0;
        const deltaUsd = state.portfolioTotalValue > 0 ? delta * state.portfolioTotalValue : null;
        const usdBit =
            deltaUsd !== null
                ? ` · ${deltaUsd >= 0 ? '+' : '-'}${formatCompactCurrency(Math.abs(deltaUsd))}`
                : '';
        const halfKellyBit =
            metrics?.fullKelly >= 1 - 1e-6
                ? '½K ≥50% (cap)'
                : `½K ${formatPlainPercent(metrics?.scaledKelly, 0)}`;
        readoutText =
            `${formatPlainPercent(wCurr)} / ${formatPlainPercent(wRec)} target ` +
            `(${formatSignedPercent(delta)}${usdBit}) · ${halfKellyBit}`;
    }

    sizingBulletEl.append(
        makeEl('span', 'bullet-label', 'SIZE'),
        track,
        makeEl('span', 'bullet-readout', readoutText)
    );
}

function renderRiskFooter(config, decision, metrics) {
    if (!riskFooterEl) {
        return;
    }
    riskFooterEl.replaceChildren();

    const outcomes = metrics?.outcomes || [];
    const bearOutcome = outcomes.find((o) =>
        String(o.id || o.name || '')
            .toLowerCase()
            .startsWith('bear')
    );
    const bearStr =
        bearOutcome && Number.isFinite(bearOutcome.totalReturnCagr)
            ? `${formatSignedPercent(bearOutcome.totalReturnCagr)}/yr`
            : 'n/a';
    const geoStr = formatPlainPercent(metrics?.geometricCagr);
    const low52 = toFiniteNumber(config.market?.fiftyTwoWeekLow);
    const high52 = toFiniteNumber(config.market?.fiftyTwoWeekHigh);
    const rangeStr =
        low52 !== null && high52 !== null
            ? `${formatCurrency(low52)}–${formatCurrency(high52)}`
            : 'n/a';

    const predictions = Array.isArray(config.predictions) ? config.predictions : [];
    const brier = computeBrierScore(predictions);
    const predStr = brier
        ? `${brier.count}/${predictions.length} (${brier.brierScore.toFixed(2)})`
        : `0/${predictions.length} (n/a)`;
    const revStr = decision.reviewDate || 'TBD';

    const digest = `Bear ${bearStr} · Geo ${geoStr} · 52w ${rangeStr} · Pred ${predStr} · Rev ${revStr}`;
    const hint = `an ${config.symbol} full | an | an close`;

    riskFooterEl.append(
        makeEl('span', 'risk-label', 'RISK'),
        makeEl('span', 'risk-digest', digest),
        makeEl('span', 'risk-hint', hint)
    );
}

function currentChartPayload() {
    const config = state.configs.find((c) => c.symbol === state.activeSymbol);
    if (!config) {
        return null;
    }
    return {
        config,
        history: config.history || unavailableHistory(config.symbol),
        decision: config.decision,
        metrics: config.metrics,
        horizonMode: state.horizonMode,
    };
}

function renderTickerDecision(config) {
    if (!config) {
        return;
    }
    renderVerdictStrip(config, config.decision, config.metrics);
    if (decisionChartCanvas) {
        renderDecisionChart(
            decisionChartCanvas,
            {
                config,
                history: config.history || unavailableHistory(config.symbol),
                decision: config.decision,
                metrics: config.metrics,
                horizonMode: state.horizonMode,
            },
            PANE_CHART_COLORS
        );
        if (!detachChartInteractions) {
            detachChartInteractions = attachDecisionChartInteractions(decisionChartCanvas, () => ({
                payload: currentChartPayload(),
                colors: PANE_CHART_COLORS,
            }));
        }
    }
    renderSizingBullet(config.decision, config.metrics);
    renderRiskFooter(config, config.decision, config.metrics);
}

function toggleSectionVisibility(target) {
    const resolved = ANALYSIS_SECTIONS.includes(target) ? target : 'board';
    state.activeSection = resolved;
    if (!paneRoot) {
        return;
    }
    paneRoot.querySelectorAll('[data-analysis-section]').forEach((section) => {
        section.classList.toggle('is-hidden', section.dataset.analysisSection !== resolved);
    });
}

export function checkPaneViewportFit() {
    if (!paneRoot) {
        return null;
    }
    const stage = paneRoot.querySelector('.analysis-stage');
    if (!stage) {
        return null;
    }
    const client = stage.clientHeight;
    const scroll = stage.scrollHeight;
    if (client === 0 || scroll === 0) {
        return null;
    }
    const overflow = scroll - client;
    if (overflow > 1) {
        logger.warn(
            `Analysis pane layout: '${state.activeSection}' section is ${overflow}px ` +
                `taller than the stage viewport (${scroll}px > ${client}px).`
        );
        return { section: state.activeSection, overflow };
    }
    return { section: state.activeSection, overflow: 0 };
}

export function showDecisionBoard() {
    state.activeSymbol = 'PORT';
    toggleSectionVisibility('board');
    renderContextStrip();
    const board = renderDecisionBoard();
    checkPaneViewportFit();
    return board;
}

export function showTickerDecision(symbol, { horizonMode = '2y' } = {}) {
    const norm = String(symbol || '')
        .trim()
        .toUpperCase();
    const config = state.configs.find((cfg) => cfg.symbol === norm);
    if (!config) {
        return null;
    }
    state.activeSymbol = config.symbol;
    state.horizonMode = horizonMode === 'full' ? 'full' : '2y';
    toggleSectionVisibility('ticker');
    renderContextStrip();
    renderTickerDecision(config);
    checkPaneViewportFit();
    return buildDecisionSnapshot(config, config.decision, config.metrics);
}

export function getAnalysisSymbols() {
    return state.configs.map((cfg) => cfg.symbol);
}

export function getActiveAnalysisConfig() {
    if (state.activeSection === 'board') {
        return null;
    }
    return state.configs.find((cfg) => cfg.symbol === state.activeSymbol) || null;
}

// Temporary WO6 compatibility shims — removed in WO6.
export function showAnalysisSection(name) {
    if (name === 'overview' || name === 'board') {
        showDecisionBoard();
        return;
    }
    if (state.activeSymbol && state.activeSymbol !== 'PORT') {
        showTickerDecision(state.activeSymbol, { horizonMode: state.horizonMode });
        return;
    }
    showDecisionBoard();
}

export function setActiveAnalysisSymbol(symbol) {
    if (String(symbol || '').toUpperCase() === 'PORT') {
        showDecisionBoard();
        return true;
    }
    return Boolean(showTickerDecision(symbol, { horizonMode: state.horizonMode }));
}

export function buildAnalysisSnapshot() {
    if (state.activeSection === 'ticker') {
        const cfg = getActiveAnalysisConfig();
        return cfg
            ? buildDecisionSnapshot(cfg, cfg.decision, cfg.metrics).text
            : 'Analysis board active.';
    }
    const board = buildBoardSnapshot(
        state.configs.map((cfg) => ({ symbol: cfg.symbol, config: cfg, decision: cfg.decision })),
        { flagsGeneratedAt: state.eventFlags?.generatedAt || null, nowMs: state.lastNowMs }
    );
    return `Board — ${board.rows.map((r) => `${r.symbol}:${r.decision.verdictLabel}`).join(', ')}`;
}

export async function initAnalysisPane(rootEl, { autoLoad = true } = {}) {
    if (detachChartInteractions) {
        detachChartInteractions();
        detachChartInteractions = null;
    }
    buildPaneDom(rootEl);
    resolvePaneElements(rootEl);
    toggleSectionVisibility('board');
    if (!autoLoad) {
        return;
    }
    try {
        if (decisionBoardEl) {
            decisionBoardEl.replaceChildren(makeEl('div', 'pane-empty', 'Loading analysis data…'));
        }
        await buildConfigs();
        showDecisionBoard();
    } catch (err) {
        logger.error('Analysis init failed:', err);
        if (decisionBoardEl) {
            decisionBoardEl.replaceChildren(
                makeEl('div', 'pane-empty pane-empty--error', `Error: ${err.message}`)
            );
        }
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('currencyChangedGlobal', async (event) => {
        if (!paneRoot || !event?.detail?.currency) {
            return;
        }
        await whenTransactionDataReady();
        if (state.activeSection === 'ticker') {
            const config = state.configs.find((cfg) => cfg.symbol === state.activeSymbol);
            if (config) {
                renderTickerDecision(config);
            }
        } else {
            renderDecisionBoard();
        }
    });
}

export const __analysisLabTesting = {
    state,
    normalizeConfig,
    computeMetrics,
    getEffectiveVolatility,
    renderDecisionBoard,
    renderTickerDecision,
    renderContextStrip,
    syncPaneChartColors,
    checkPaneViewportFit,
    PANE_CHART_COLORS,
};
