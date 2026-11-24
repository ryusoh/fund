/* global ResizeObserver */
import {
    DEFAULT_RISK_FREE_RATE,
    computeIsoCagrBands,
    getBenchmarkRate,
    getEffectiveDividendRate,
    getEffectivePrice,
} from './decision.js';
import {
    convertValueToCurrency,
    formatCurrency as formatInSelectedCurrency,
    formatCurrencyCompact as formatCompactInSelectedCurrency,
} from '../../transactions/utils.js';
import { getSelectedCurrency } from '../../transactions/state.js';

import {
    _drawXAxisBaseline,
    _drawXAxisTickLabel,
    drawEndValue,
} from '../../transactions/chart/core.js';
import { formatCrosshairDateLabel, getMonoFontFamily } from '../../transactions/chart/helpers.js';
import {
    drawCrosshairLine,
    drawCrosshairPoint,
    updateCrosshairUI,
} from '../../transactions/chart/interaction.js';

export const CHART_FONT_SIZE = 10;
export const CHART_FONT_FAMILY = `${CHART_FONT_SIZE}px ${getMonoFontFamily()}`;
export const DEFAULT_CHART_PADDING = { top: 16, right: 16, bottom: 24, left: 54 };
export const UNIT_BREAK_LABEL = 'PRICE → TOTAL-RETURN VALUE';

const LATEST_FX_DATE = '9999-12-31';
const YEAR_MS = 365.25 * 86_400_000;
const LOG_MULTIPLIERS = [1, 1.5, 2, 3, 5, 7];
const FORWARD_SAMPLE_COUNT = 25;
const LABEL_MIN_GAP_PX = 12;

function isFinitePositive(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function formatPriceValue(usdValue) {
    if (!Number.isFinite(usdValue)) {
        return 'n/a';
    }
    const converted = convertValueToCurrency(usdValue, LATEST_FX_DATE, getSelectedCurrency());
    return formatInSelectedCurrency(converted);
}

function formatCompactPriceValue(usdValue) {
    if (!Number.isFinite(usdValue)) {
        return 'n/a';
    }
    const converted = convertValueToCurrency(usdValue, LATEST_FX_DATE, getSelectedCurrency());
    return formatCompactInSelectedCurrency(converted);
}

function parseUtcDayMs(dateStr) {
    if (typeof dateStr !== 'string') {
        return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
    if (!match) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const ms = Date.UTC(year, month - 1, day);
    return Number.isFinite(ms) ? ms : null;
}

function resolveTodayMs(config, history, decision) {
    const snapshotDay = parseUtcDayMs(decision?.snapshotDate);
    if (snapshotDay !== null) {
        return snapshotDay;
    }
    const prices = Array.isArray(history?.prices) ? history.prices : [];
    for (let i = prices.length - 1; i >= 0; i--) {
        const ms = parseUtcDayMs(prices[i]?.d);
        if (ms !== null) {
            return ms;
        }
    }
    const marketTs = parseUtcDayMs(config?.market?.marketDataUpdatedAt);
    if (marketTs !== null) {
        return marketTs;
    }
    const metaTs = parseUtcDayMs(config?.meta?.asOf);
    return metaTs !== null ? metaTs : Date.UTC(2026, 10, 20);
}

function collectNiceLogCandidates(yMin, yMax) {
    const candidates = [];
    const minExp = Math.floor(Math.log10(yMin)) - 1;
    const maxExp = Math.ceil(Math.log10(yMax)) + 1;
    for (let exp = minExp; exp <= maxExp; exp++) {
        const base = 10 ** exp;
        for (let i = 0; i < LOG_MULTIPLIERS.length; i++) {
            const val = LOG_MULTIPLIERS[i] * base;
            if (val >= yMin * 0.999 && val <= yMax * 1.001) {
                candidates.push(val);
            }
        }
    }
    return candidates;
}

export function computeLogTicks(
    yMin,
    yMax,
    yScale,
    { fontSize = CHART_FONT_SIZE, anchors = [] } = {}
) {
    if (!isFinitePositive(yMin) || !isFinitePositive(yMax) || yMax <= yMin) {
        return [];
    }
    const minSpacingPixels = Math.floor(fontSize);
    const seen = new Set();
    const pool = [];

    const addCandidate = (value, priority, isAnchor = false) => {
        if (!isFinitePositive(value) || value < yMin * 0.999 || value > yMax * 1.001) {
            return;
        }
        const key = Number(value.toPrecision(6));
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        const y = yScale(value);
        if (Number.isFinite(y)) {
            pool.push({ value, y, priority, isAnchor });
        }
    };

    for (let i = 0; i < anchors.length; i++) {
        addCandidate(anchors[i], 0, true);
    }

    const niceValues = collectNiceLogCandidates(yMin, yMax);
    if (niceValues.length > 0) {
        addCandidate(niceValues[0], 1);
        addCandidate(niceValues[niceValues.length - 1], 1);
    } else {
        addCandidate(yMin, 1);
        addCandidate(yMax, 1);
    }
    for (let i = 0; i < niceValues.length; i++) {
        addCandidate(niceValues[i], 2);
    }

    pool.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return b.value - a.value;
    });

    const selected = [];
    for (let i = 0; i < pool.length; i++) {
        const cand = pool[i];
        let collides = false;
        for (let j = 0; j < selected.length; j++) {
            if (Math.abs(cand.y - selected[j].y) < minSpacingPixels) {
                collides = true;
                break;
            }
        }
        if (!collides) {
            selected.push(cand);
        }
    }

    selected.sort((a, b) => a.value - b.value);
    return selected;
}

function extractSortedPositiveEps(history, todayMs) {
    const raw = Array.isArray(history?.eps) ? history.eps : [];
    const parsed = [];
    for (let i = 0; i < raw.length; i++) {
        const entry = raw[i];
        const dMs = parseUtcDayMs(entry?.d);
        const v = Number(entry?.v);
        if (dMs !== null && dMs <= todayMs && isFinitePositive(v)) {
            parsed.push({ d: entry.d, dMs, v });
        }
    }
    parsed.sort((a, b) => a.dMs - b.dMs);
    return parsed;
}

function extractSortedPositivePrices(history, minPastMs, todayMs) {
    const raw = Array.isArray(history?.prices) ? history.prices : [];
    const parsed = [];
    for (let i = 0; i < raw.length; i++) {
        const entry = raw[i];
        const dMs = parseUtcDayMs(entry?.d);
        const c = Number(entry?.c);
        if (dMs !== null && dMs >= minPastMs && dMs <= todayMs && isFinitePositive(c)) {
            parsed.push({ d: entry.d, dMs, close: c });
        }
    }
    parsed.sort((a, b) => a.dMs - b.dMs);
    return parsed;
}

function stepHoldEpsAt(epsPoints, dMs) {
    let current = epsPoints[0].v;
    for (let i = 0; i < epsPoints.length; i++) {
        if (epsPoints[i].dMs <= dMs) {
            current = epsPoints[i].v;
        } else {
            break;
        }
    }
    return current;
}

function resolveBandOptions(config, metrics) {
    const prefs = config?.model?.preferences || {};
    const targetCagr = Number.isFinite(Number(metrics?.targetCagr))
        ? Number(metrics.targetCagr)
        : Number(prefs.targetCagr ?? 0.12);
    const benchmark = Number.isFinite(Number(metrics?.benchmark))
        ? Number(metrics.benchmark)
        : getBenchmarkRate(config);
    const riskFreeRate = Number.isFinite(Number(metrics?.riskFreeRate))
        ? Number(metrics.riskFreeRate)
        : Number(prefs.riskFreeRate ?? DEFAULT_RISK_FREE_RATE);
    const horizon = Number.isFinite(Number(metrics?.horizon))
        ? Number(metrics.horizon)
        : Number(prefs.horizon ?? 5);
    const expectedTerminalTotalValue = Number.isFinite(Number(metrics?.expectedTerminalTotalValue))
        ? Number(metrics.expectedTerminalTotalValue)
        : null;
    return {
        targetCagr,
        benchmark,
        riskFreeRate,
        strongCagr: targetCagr + 0.05,
        horizon: horizon > 0 ? horizon : 5,
        expectedTerminalTotalValue,
    };
}

function buildPastPointsAndBands({
    mode,
    pastPrices,
    epsPoints,
    bandToday,
    epsHistAtToday,
    xPastScale,
}) {
    let multiples = null;
    if (mode === 'eps-corridor' && bandToday && isFinitePositive(epsHistAtToday)) {
        multiples = {
            strongBuy: bandToday.strongBuy / epsHistAtToday,
            buy: bandToday.buy / epsHistAtToday,
            fair: bandToday.fair / epsHistAtToday,
            sell: bandToday.sell / epsHistAtToday,
        };
    }

    const pastPoints = pastPrices.map((pt) => {
        let bands = null;
        if (mode === 'eps-corridor' && multiples) {
            const epsVal = stepHoldEpsAt(epsPoints, pt.dMs);
            bands = {
                strongBuy: multiples.strongBuy * epsVal,
                buy: multiples.buy * epsVal,
                fair: multiples.fair * epsVal,
                sell: multiples.sell * epsVal,
            };
        } else if (mode === 'horizontal-bands' && bandToday) {
            bands = { ...bandToday };
        }
        return {
            ...pt,
            x: xPastScale(pt.dMs),
            bands,
        };
    });

    return { pastPoints, multiples };
}

function buildForwardCurvesAndRays({
    mode,
    todayPrice,
    futureYears,
    bandOpts,
    outcomes,
    xFutureScale,
}) {
    if (mode === 'thesis-broken') {
        return { futureCurves: [], scenarioRays: [] };
    }
    const futureCurves = [];
    for (let i = 0; i < FORWARD_SAMPLE_COUNT; i++) {
        const t = (i / (FORWARD_SAMPLE_COUNT - 1)) * futureYears;
        const bands = computeIsoCagrBands(
            bandOpts.expectedTerminalTotalValue,
            bandOpts.horizon,
            bandOpts,
            t
        );
        if (bands) {
            futureCurves.push({ t, x: xFutureScale(t), bands });
        }
    }

    const activeOutcomes = Array.isArray(outcomes) ? outcomes : [];
    const scenarioRays = [];
    for (let i = 0; i < activeOutcomes.length; i++) {
        const outcome = activeOutcomes[i];
        const cagr = Number(outcome?.totalReturnCagr);
        if (!isFinitePositive(todayPrice) || !Number.isFinite(cagr) || 1 + cagr <= 0) {
            continue;
        }
        const points = [];
        for (let s = 0; s < FORWARD_SAMPLE_COUNT; s++) {
            const t = (s / (FORWARD_SAMPLE_COUNT - 1)) * futureYears;
            points.push({ t, x: xFutureScale(t), value: todayPrice * (1 + cagr) ** t });
        }
        const endValue = todayPrice * (1 + cagr) ** futureYears;
        const terminalTotalValue = isFinitePositive(Number(outcome.terminalTotalValue))
            ? Number(outcome.terminalTotalValue)
            : todayPrice * (1 + cagr) ** bandOpts.horizon;
        scenarioRays.push({
            id: outcome.id || String(outcome.name || 'scenario').toLowerCase(),
            name: outcome.name || outcome.id || 'Scenario',
            prob: Number(outcome.prob ?? 0),
            totalReturnCagr: cagr,
            endValue,
            terminalTotalValue,
            points,
        });
    }

    return { futureCurves, scenarioRays };
}

function computeYDomain(todayPrice, pastPoints, futureCurves, scenarioRays) {
    const coreValues = [];
    if (isFinitePositive(todayPrice)) {
        coreValues.push(todayPrice);
    }
    for (let i = 0; i < pastPoints.length; i++) {
        if (isFinitePositive(pastPoints[i].close)) {
            coreValues.push(pastPoints[i].close);
        }
    }
    for (let i = 0; i < scenarioRays.length; i++) {
        const pts = scenarioRays[i].points;
        for (let j = 0; j < pts.length; j++) {
            if (isFinitePositive(pts[j].value)) {
                coreValues.push(pts[j].value);
            }
        }
    }

    if (coreValues.length === 0) {
        return { yMin: 1, yMax: 100 };
    }
    const coreMin = Math.min(...coreValues);
    const coreMax = Math.max(...coreValues);
    const clampLo = 0.35 * coreMin;
    const clampHi = 3.0 * coreMax;

    const allValues = [...coreValues];
    const pushClampedBands = (bands) => {
        if (!bands) {
            return;
        }
        [bands.strongBuy, bands.buy, bands.fair, bands.sell].forEach((val) => {
            if (isFinitePositive(val)) {
                allValues.push(clamp(val, clampLo, clampHi));
            }
        });
    };
    pastPoints.forEach((pt) => pushClampedBands(pt.bands));
    futureCurves.forEach((pt) => pushClampedBands(pt.bands));

    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const logMin = Math.log(rawMin);
    const logMax = Math.log(rawMax);
    const span = Math.max(logMax - logMin, Math.log(1.2));
    return {
        yMin: Math.exp(logMin - 0.08 * span),
        yMax: Math.exp(logMax + 0.08 * span),
    };
}

function formatEdgePrice(usdValue) {
    if (!Number.isFinite(usdValue)) {
        return 'n/a';
    }
    const converted = convertValueToCurrency(usdValue, LATEST_FX_DATE, getSelectedCurrency());
    if (Math.abs(converted) >= 100) {
        return formatCompactInSelectedCurrency(Math.round(converted));
    }
    return formatInSelectedCurrency(converted);
}

function formatEdgeLabel(ray) {
    const endStr = formatEdgePrice(ray.endValue);
    const tvStr = formatEdgePrice(ray.terminalTotalValue);
    if (!Number.isFinite(ray.terminalTotalValue) || endStr === tvStr) {
        return endStr;
    }
    return `${endStr}→${tvStr}`;
}

function packRightEdgeLabels(scenarioRays, yScale, plotTop, plotBottom) {
    const items = scenarioRays
        .map((ray) => {
            const targetY = yScale(ray.endValue);
            const isBase = String(ray.id || ray.name || '')
                .toLowerCase()
                .startsWith('base');
            return {
                id: ray.id,
                isBase,
                targetY,
                y: clamp(targetY, plotTop + 6, plotBottom - 6),
                label: formatEdgeLabel(ray),
                endValue: ray.endValue,
                terminalTotalValue: ray.terminalTotalValue,
            };
        })
        .sort((a, b) => a.targetY - b.targetY);

    for (let i = 1; i < items.length; i++) {
        if (items[i].y - items[i - 1].y < LABEL_MIN_GAP_PX) {
            items[i].y = items[i - 1].y + LABEL_MIN_GAP_PX;
        }
    }
    const maxY = plotBottom - 6;
    if (items.length > 0 && items[items.length - 1].y > maxY) {
        items[items.length - 1].y = maxY;
        for (let i = items.length - 2; i >= 0; i--) {
            if (items[i + 1].y - items[i].y < LABEL_MIN_GAP_PX) {
                items[i].y = Math.max(plotTop + 6, items[i + 1].y - LABEL_MIN_GAP_PX);
            }
        }
    }
    return items;
}

function resolveChartMode(decision, epsAll, todayMs) {
    if (decision && decision.gate1Broken) {
        return 'thesis-broken';
    }
    const twoYearsAgoMs = todayMs - 2 * YEAR_MS;
    const epsInTwoYears = epsAll.filter((pt) => pt.dMs >= twoYearsAgoMs);
    return epsInTwoYears.length >= 2 ? 'eps-corridor' : 'horizontal-bands';
}

function resolveChartSplits(mode, horizonMode, horizon, plotLeft, plotRight) {
    const pastYears = mode === 'horizontal-bands' ? 1 : 2;
    const futureYears = horizonMode === 'full' ? horizon : Math.min(2, horizon);
    const naturalSplit = pastYears / (pastYears + futureYears);
    const splitRatio = clamp(naturalSplit, 0.3, 0.6);
    const hasScaleBreak = Math.abs(splitRatio - naturalSplit) > 0.02;
    const xToday = plotLeft + (plotRight - plotLeft) * splitRatio;
    return { pastYears, futureYears, splitRatio, hasScaleBreak, xToday };
}

function buildChartMetadata(history, decision, metrics, config) {
    const dividendRate = getEffectiveDividendRate(config) ?? 0;
    const h = history || {};
    const d = decision || {};
    const m = metrics || {};
    return {
        priceBasis: h.priceBasis || 'unavailable',
        priceBasisVerified: Boolean(h.priceBasisVerified),
        epsPointInTimeCertified: Boolean(h.epsPointInTimeCertified),
        hasDividends: dividendRate > 0,
        unitBreak: UNIT_BREAK_LABEL,
        verdictLabel: d.verdictLabel || '',
        nextTrigger: d.nextTrigger || null,
        meanCagr: m.expectedCagr !== undefined ? m.expectedCagr : null,
    };
}

export function buildDecisionChartGeometry({
    config,
    history,
    decision,
    metrics,
    horizonMode = '2y',
    width,
    height,
    padding = DEFAULT_CHART_PADDING,
} = {}) {
    if (!isFinitePositive(width) || !isFinitePositive(height)) {
        return null;
    }
    const plotLeft = padding.left;
    const plotRight = width - padding.right;
    const plotTop = padding.top;
    const plotBottom = height - padding.bottom;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;
    if (!(plotWidth > 0) || !(plotHeight > 0)) {
        return null;
    }

    const metricsPrice = Number(metrics && metrics.price);
    const todayPrice = isFinitePositive(metricsPrice) ? metricsPrice : getEffectivePrice(config);
    const bandOpts = resolveBandOptions(config, metrics);
    const todayMs = resolveTodayMs(config, history, decision);

    const epsAll = extractSortedPositiveEps(history, todayMs);
    const mode = resolveChartMode(decision, epsAll, todayMs);
    const { pastYears, futureYears, splitRatio, hasScaleBreak, xToday } = resolveChartSplits(
        mode,
        horizonMode,
        bandOpts.horizon,
        plotLeft,
        plotRight
    );

    const minPastMs = todayMs - pastYears * YEAR_MS;
    const xPastScale = (dMs) =>
        plotLeft + ((dMs - minPastMs) / (todayMs - minPastMs)) * (xToday - plotLeft);
    const xFutureScale = (t) => xToday + (t / futureYears) * (plotRight - xToday);

    const bandToday =
        mode === 'thesis-broken'
            ? null
            : (decision && decision.bands) ||
              computeIsoCagrBands(
                  bandOpts.expectedTerminalTotalValue,
                  bandOpts.horizon,
                  bandOpts,
                  0
              );
    const epsHistAtToday = epsAll.length > 0 ? epsAll[epsAll.length - 1].v : null;

    const pastPrices = extractSortedPositivePrices(history, minPastMs, todayMs);
    const { pastPoints, multiples } = buildPastPointsAndBands({
        mode,
        pastPrices,
        epsPoints: epsAll,
        bandToday,
        epsHistAtToday,
        xPastScale,
    });

    const { futureCurves, scenarioRays } = buildForwardCurvesAndRays({
        mode,
        todayPrice,
        futureYears,
        bandOpts,
        outcomes: metrics && metrics.outcomes,
        xFutureScale,
    });

    const { yMin, yMax } = computeYDomain(todayPrice, pastPoints, futureCurves, scenarioRays);
    const logMin = Math.log(yMin);
    const logSpan = Math.log(yMax) - logMin;
    const yScale = (val) => {
        if (!isFinitePositive(val) || !(logSpan > 0)) {
            return plotBottom;
        }
        return plotBottom - ((Math.log(val) - logMin) / logSpan) * plotHeight;
    };

    const yTicks = computeLogTicks(yMin, yMax, yScale, {
        fontSize: CHART_FONT_SIZE,
        anchors: isFinitePositive(todayPrice) ? [todayPrice] : [],
    });
    const rightLabels = packRightEdgeLabels(scenarioRays, yScale, plotTop, plotBottom);

    return {
        mode,
        horizonMode,
        horizon: bandOpts.horizon,
        pastYears,
        futureYears,
        splitRatio,
        hasScaleBreak,
        width,
        height,
        padding,
        plotLeft,
        plotRight,
        plotTop,
        plotBottom,
        plotWidth,
        plotHeight,
        xToday,
        minPastMs,
        todayMs,
        todayPrice,
        bandOpts,
        bandToday,
        epsHistAtToday,
        epsMultiples: multiples,
        pastPoints,
        futureCurves,
        scenarioRays,
        rightLabels,
        yMin,
        yMax,
        yScale,
        yTicks,
        ...buildChartMetadata(history, decision, metrics, config),
    };
}

function classifyPointZone(value, bands) {
    if (!bands || !isFinitePositive(value)) {
        return 'n/a';
    }
    if (value <= bands.strongBuy) {
        return 'DEEP';
    }
    if (value <= bands.buy) {
        return 'BUY';
    }
    if (value <= bands.fair) {
        return 'FAIR';
    }
    if (value <= bands.sell) {
        return 'RICH';
    }
    return 'SELL';
}

function findNearestPastPoint(pastPoints, pointerX) {
    if (!pastPoints || pastPoints.length === 0) {
        return null;
    }
    let lo = 0;
    let hi = pastPoints.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pastPoints[mid].x < pointerX) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    if (lo > 0) {
        const prevDist = Math.abs(pastPoints[lo - 1].x - pointerX);
        const currDist = Math.abs(pastPoints[lo].x - pointerX);
        if (prevDist <= currDist) {
            return pastPoints[lo - 1];
        }
    }
    return pastPoints[lo];
}

function findScenarioRay(rays, role) {
    return rays.find((ray) =>
        String(ray.id || ray.name || '')
            .toLowerCase()
            .startsWith(role)
    );
}

export function resolveCrosshairHit(pointerX, geometry) {
    if (!geometry || !Number.isFinite(pointerX)) {
        return null;
    }
    if (pointerX < geometry.plotLeft || pointerX > geometry.plotRight) {
        return null;
    }
    if (pointerX <= geometry.xToday) {
        const pt = findNearestPastPoint(geometry.pastPoints, pointerX);
        if (!pt) {
            return null;
        }
        const zoneLabel =
            geometry.mode === 'thesis-broken'
                ? 'THESIS BROKEN'
                : classifyPointZone(pt.close, pt.bands);
        const basisLabel = geometry.priceBasisVerified ? 'Raw close' : 'Legacy close (unverified)';
        const epsCaveat =
            geometry.mode === 'eps-corridor'
                ? 'Thesis×EPS cached (not strictly point-in-time; not for backtesting)'
                : null;
        return {
            side: 'past',
            x: pt.x,
            y: geometry.yScale(pt.close),
            date: pt.d,
            close: pt.close,
            priceBasis: geometry.priceBasis,
            priceBasisVerified: geometry.priceBasisVerified,
            basisLabel,
            zoneLabel,
            epsPointInTimeCertified: geometry.epsPointInTimeCertified,
            epsCaveat,
            unit: 'closePrice',
        };
    }

    const futureSpan = geometry.plotRight - geometry.xToday;
    const yearsAhead =
        futureSpan > 0
            ? clamp(
                  ((pointerX - geometry.xToday) / futureSpan) * geometry.futureYears,
                  0,
                  geometry.futureYears
              )
            : 0;
    if (geometry.mode === 'thesis-broken') {
        return {
            side: 'future',
            x: pointerX,
            yearsAhead,
            bullValue: null,
            baseValue: null,
            bearValue: null,
            buyEntryValue: null,
            fairEntryValue: null,
            hasScaleBreak: geometry.hasScaleBreak,
            hasDividends: geometry.hasDividends,
            unit: 'totalReturnValue',
        };
    }
    const rayValue = (role) => {
        const ray = findScenarioRay(geometry.scenarioRays, role);
        if (!ray || !isFinitePositive(geometry.todayPrice)) {
            return null;
        }
        return geometry.todayPrice * (1 + ray.totalReturnCagr) ** yearsAhead;
    };
    const futureBands = computeIsoCagrBands(
        geometry.bandOpts.expectedTerminalTotalValue,
        geometry.horizon,
        geometry.bandOpts,
        yearsAhead
    );
    return {
        side: 'future',
        x: pointerX,
        yearsAhead,
        bullValue: rayValue('bull'),
        baseValue: rayValue('base'),
        bearValue: rayValue('bear'),
        buyEntryValue: futureBands ? futureBands.buy : null,
        fairEntryValue: futureBands ? futureBands.fair : null,
        hasScaleBreak: geometry.hasScaleBreak,
        hasDividends: geometry.hasDividends,
        unit: 'totalReturnValue',
    };
}

function paintZoneBands(ctx, geometry, colors) {
    const { mode, pastPoints, futureCurves, yScale, plotTop, plotBottom, plotRight, xToday } =
        geometry;
    if (mode === 'thesis-broken') {
        ctx.save();
        ctx.fillStyle = colors.muted || '#8b949e';
        ctx.globalAlpha = 0.22;
        ctx.font = '700 18px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            'THESIS BROKEN',
            (geometry.plotLeft + plotRight) / 2,
            (plotTop + plotBottom) / 2
        );
        ctx.restore();
        return;
    }

    const fillBandPoly = (pts, topKey, botKey, fillStyle) => {
        const valid = pts.filter((p) => p.bands);
        if (valid.length < 2) {
            return;
        }
        ctx.save();
        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        for (let i = 0; i < valid.length; i++) {
            const yVal = topKey
                ? clamp(yScale(valid[i].bands[topKey]), plotTop, plotBottom)
                : plotTop;
            if (i === 0) {
                ctx.moveTo(valid[i].x, yVal);
            } else {
                ctx.lineTo(valid[i].x, yVal);
            }
        }
        for (let i = valid.length - 1; i >= 0; i--) {
            const yVal = botKey
                ? clamp(yScale(valid[i].bands[botKey]), plotTop, plotBottom)
                : plotBottom;
            ctx.lineTo(valid[i].x, yVal);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };

    const pastBandSeries =
        pastPoints.length >= 2
            ? pastPoints
            : geometry.bandToday
              ? [
                    { x: geometry.plotLeft, bands: geometry.bandToday },
                    { x: xToday, bands: geometry.bandToday },
                ]
              : [];

    const greenDeep = colors.greenDeepFill || 'rgba(52, 168, 83, 0.14)';
    const greenBuy = colors.greenFill || 'rgba(52, 168, 83, 0.08)';
    const goldRich = colors.goldFill || 'rgba(240, 185, 11, 0.09)';
    const redSell = colors.redFill || 'rgba(234, 67, 53, 0.12)';

    [pastBandSeries, futureCurves].forEach((series) => {
        fillBandPoly(series, 'strongBuy', null, greenDeep);
        fillBandPoly(series, 'buy', 'strongBuy', greenBuy);
        fillBandPoly(series, 'sell', 'fair', goldRich);
        fillBandPoly(series, null, 'sell', redSell);
    });

    if (geometry.bandToday) {
        const tags = [
            { label: 'SELL', val: geometry.bandToday.sell, color: colors.red || '#ea4335' },
            { label: 'RICH', val: geometry.bandToday.fair, color: colors.gold || '#f0b90b' },
            { label: 'BUY', val: geometry.bandToday.buy, color: colors.green || '#34a853' },
            { label: 'DEEP', val: geometry.bandToday.strongBuy, color: colors.green || '#34a853' },
        ];
        ctx.save();
        ctx.font = CHART_FONT_FAMILY;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        tags.forEach((tag) => {
            const y = clamp(yScale(tag.val), plotTop + 6, plotBottom - 6);
            ctx.fillStyle = tag.color;
            ctx.fillText(tag.label, xToday - 4, y);
        });
        ctx.restore();
    }
}

function paintAxesAndGrid(ctx, geometry, colors) {
    const {
        plotLeft,
        plotRight,
        plotTop,
        plotBottom,
        yTicks,
        xToday,
        pastYears,
        futureYears,
        hasScaleBreak,
    } = geometry;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;
    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
    const monoFont = getMonoFontFamily();

    ctx.save();
    ctx.font = CHART_FONT_FAMILY;
    ctx.strokeStyle = colors.grid || 'rgba(255, 255, 255, 0.08)';
    ctx.fillStyle = colors.muted || '#8b949e';
    ctx.lineWidth = 1;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    yTicks.forEach((tick) => {
        ctx.beginPath();
        ctx.moveTo(plotLeft, tick.y);
        ctx.lineTo(plotRight, tick.y);
        ctx.stroke();
        ctx.fillStyle = tick.isAnchor ? colors.gold || '#f0b90b' : colors.muted || '#8b949e';
        ctx.fillText(formatCompactPriceValue(tick.value), plotLeft - (isMobile ? 8 : 10), tick.y);
    });

    const axisPadding = { left: plotLeft, top: plotTop };
    const futureLabel = `+${Number.isInteger(futureYears) ? futureYears : futureYears.toFixed(1)}Y`;
    const xTicks = [
        { label: `-${pastYears}Y`, x: plotLeft },
        { label: 'TODAY', x: xToday },
        { label: futureLabel, x: plotRight },
    ];
    _drawXAxisBaseline(ctx, axisPadding, plotWidth, plotHeight, isMobile, monoFont);
    ctx.font = CHART_FONT_FAMILY;
    ctx.fillStyle = colors.muted || '#8b949e';
    xTicks.forEach((tick, idx) => {
        _drawXAxisTickLabel(ctx, tick, idx, tick.x, xTicks, axisPadding, plotHeight, isMobile);
    });
    if (hasScaleBreak) {
        ctx.textAlign = 'center';
        ctx.fillText('// compressed', (plotLeft + xToday) / 2, plotBottom + (isMobile ? 8 : 10));
    }
    ctx.restore();
}

function paintHeaders(ctx, geometry, colors) {
    const { plotLeft, xToday, futureYears, hasDividends, mode, priceBasisVerified } = geometry;
    ctx.save();
    ctx.font = CHART_FONT_FAMILY;
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.muted || '#8b949e';

    let leftHeader = 'Current bands';
    if (mode === 'eps-corridor') {
        leftHeader = 'Thesis×EPS · cached';
    } else if (mode === 'thesis-broken') {
        leftHeader = 'Thesis broken';
    }
    if (!priceBasisVerified) {
        leftHeader += ' · ⚑ PRICE BASIS UNVERIFIED';
    }
    ctx.textAlign = 'left';
    ctx.fillText(leftHeader, plotLeft + 4, 2);

    const fLabel = Number.isInteger(futureYears) ? `${futureYears}Y` : `${futureYears.toFixed(1)}Y`;
    const divSuffix = hasDividends ? ' (div. reinvested)' : '';
    ctx.fillText(`Forward ${fLabel} total value${divSuffix}`, xToday + 6, 2);
    ctx.restore();
}

function paintCurvesAndRays(ctx, geometry, colors) {
    if (geometry.mode === 'thesis-broken') {
        return;
    }
    const { futureCurves, scenarioRays, rightLabels, yScale, plotTop, plotBottom } = geometry;
    const strokeSeries = (pts, valueFn, strokeStyle, lineWidth, dashed = false) => {
        if (pts.length < 2) {
            return;
        }
        ctx.save();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        if (dashed) {
            ctx.setLineDash([4, 4]);
        }
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            const y = clamp(yScale(valueFn(pts[i])), plotTop, plotBottom);
            if (i === 0) {
                ctx.moveTo(pts[i].x, y);
            } else {
                ctx.lineTo(pts[i].x, y);
            }
        }
        ctx.stroke();
        ctx.restore();
    };

    const bandKeys = [
        { key: 'strongBuy', color: colors.green || '#34a853' },
        { key: 'buy', color: colors.green || '#34a853' },
        { key: 'fair', color: colors.gold || '#f0b90b' },
        { key: 'sell', color: colors.red || '#ea4335' },
    ];
    bandKeys.forEach(({ key, color }) => {
        strokeSeries(futureCurves, (pt) => pt.bands[key], color, 1, true);
    });

    const bullRay = findScenarioRay(scenarioRays, 'bull');
    const bearRay = findScenarioRay(scenarioRays, 'bear');
    if (bullRay && bearRay && bullRay.points.length >= 2 && bearRay.points.length >= 2) {
        ctx.save();
        ctx.fillStyle = colors.scenarioFill || 'rgba(100, 181, 246, 0.07)';
        ctx.beginPath();
        for (let i = 0; i < bullRay.points.length; i++) {
            ctx.lineTo(
                bullRay.points[i].x,
                clamp(yScale(bullRay.points[i].value), plotTop, plotBottom)
            );
        }
        for (let i = bearRay.points.length - 1; i >= 0; i--) {
            ctx.lineTo(
                bearRay.points[i].x,
                clamp(yScale(bearRay.points[i].value), plotTop, plotBottom)
            );
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    scenarioRays.forEach((ray) => {
        const isBase = String(ray.id || ray.name || '')
            .toLowerCase()
            .startsWith('base');
        strokeSeries(
            ray.points,
            (pt) => pt.value,
            isBase ? colors.blue || '#64b5f6' : colors.line || '#c9d1d9',
            isBase ? 2 : 1.25,
            false
        );
    });

    const axisPadding = { left: geometry.plotLeft, top: geometry.plotTop };
    const plotWidth = geometry.plotRight - geometry.plotLeft;
    const plotHeight = plotBottom - plotTop;
    const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
    const drawnBounds = [];
    const orderedLabels = [...rightLabels].sort((a, b) => Number(b.isBase) - Number(a.isBase));

    ctx.save();
    orderedLabels.forEach((item) => {
        const color = item.isBase ? colors.blue || '#64b5f6' : colors.line || '#c9d1d9';
        const bounds = drawEndValue(
            ctx,
            geometry.plotRight,
            item.targetY,
            item.label,
            color,
            isMobile,
            axisPadding,
            plotWidth,
            plotHeight,
            (v) => v,
            true,
            drawnBounds
        );
        if (bounds) {
            drawnBounds.push(bounds);
        }
    });
    ctx.restore();
}

function paintTodayAndHistory(ctx, geometry, colors) {
    const { xToday, plotTop, plotBottom, pastPoints, todayPrice, yScale, mode } = geometry;
    ctx.save();
    ctx.strokeStyle = colors.muted || '#8b949e';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(xToday, plotTop);
    ctx.lineTo(xToday, plotBottom);
    ctx.stroke();
    ctx.restore();

    if (pastPoints.length > 0) {
        ctx.save();
        ctx.strokeStyle =
            mode === 'thesis-broken' ? colors.red || '#ea4335' : colors.line || '#c9d1d9';
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        for (let i = 0; i < pastPoints.length; i++) {
            const y = clamp(yScale(pastPoints[i].close), plotTop, plotBottom);
            if (i === 0) {
                ctx.moveTo(pastPoints[i].x, y);
            } else {
                ctx.lineTo(pastPoints[i].x, y);
            }
        }
        if (isFinitePositive(todayPrice)) {
            ctx.lineTo(xToday, clamp(yScale(todayPrice), plotTop, plotBottom));
        }
        ctx.stroke();
        ctx.restore();
    }

    if (isFinitePositive(todayPrice)) {
        ctx.save();
        ctx.fillStyle = colors.gold || '#f0b90b';
        ctx.beginPath();
        ctx.arc(xToday, clamp(yScale(todayPrice), plotTop, plotBottom), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.save();
    ctx.font = `9px ${getMonoFontFamily()}`;
    ctx.fillStyle = colors.muted || '#8b949e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(geometry.unitBreak, xToday, plotBottom - 2);
    ctx.restore();
}

const ZONE_COLOR_KEYS = {
    DEEP: 'green',
    BUY: 'green',
    FAIR: 'gold',
    RICH: 'gold',
    SELL: 'red',
    'THESIS BROKEN': 'red',
};

function resolvePastDateLabel(dateStr) {
    const ms = parseUtcDayMs(dateStr);
    if (ms !== null) {
        return formatCrosshairDateLabel(ms) || dateStr;
    }
    return dateStr || '';
}

function buildPastCrosshairSnapshot(crosshairHit, geometry, symbol, colors) {
    const lineColor =
        geometry.mode === 'thesis-broken' ? colors.red || '#ea4335' : colors.line || '#c9d1d9';
    const zoneColorKey = ZONE_COLOR_KEYS[crosshairHit.zoneLabel] || 'muted';
    const zoneColor = colors[zoneColorKey] || colors.muted || '#8b949e';
    return {
        dateLabel: resolvePastDateLabel(crosshairHit.date),
        chartKey: 'valuation',
        series: [
            {
                key: 'price',
                label: symbol,
                color: lineColor,
                formatted: formatPriceValue(crosshairHit.close),
            },
            {
                key: 'zone',
                label: 'Zone',
                color: zoneColor,
                formatted: crosshairHit.zoneLabel || 'n/a',
            },
        ],
    };
}

function buildFutureCrosshairSnapshot(crosshairHit, colors) {
    const futureLabel = `+${crosshairHit.yearsAhead.toFixed(1)}Y${crosshairHit.hasDividends ? ' · TR' : ''}`;
    const series = [];
    const specs = [
        ['bull', 'Bull', colors.line || '#c9d1d9', crosshairHit.bullValue],
        ['base', 'Base', colors.blue || '#64b5f6', crosshairHit.baseValue],
        ['bear', 'Bear', colors.line || '#c9d1d9', crosshairHit.bearValue],
        ['buy', 'Buy ≤', colors.green || '#34a853', crosshairHit.buyEntryValue],
    ];
    for (const [key, label, color, value] of specs) {
        if (isFinitePositive(value)) {
            series.push({ key, label, color, formatted: formatPriceValue(value) });
        }
    }
    if (series.length === 0) {
        series.push({
            key: 'broken',
            label: 'Status',
            color: colors.red || '#ea4335',
            formatted: 'THESIS BROKEN',
        });
    }
    return {
        dateLabel: futureLabel,
        chartKey: 'valuation',
        series,
    };
}

export function buildValuationCrosshairSnapshot(crosshairHit, geometry, config, colors = {}) {
    if (!crosshairHit || !geometry) {
        return null;
    }
    const symbol = config?.symbol || 'Price';
    if (crosshairHit.side === 'past') {
        return buildPastCrosshairSnapshot(crosshairHit, geometry, symbol, colors);
    }
    return buildFutureCrosshairSnapshot(crosshairHit, colors);
}

function paintCrosshair(ctx, geometry, crosshairHit, colors) {
    if (!crosshairHit) {
        return;
    }
    const { plotTop, plotBottom, plotLeft, plotRight, yScale, mode } = geometry;
    const cx = clamp(crosshairHit.x, plotLeft, plotRight);
    drawCrosshairLine(
        ctx,
        { chartBounds: { top: plotTop, bottom: plotBottom, left: plotLeft, right: plotRight } },
        cx
    );

    ctx.save();
    if (crosshairHit.side === 'past') {
        const y = clamp(crosshairHit.y, plotTop, plotBottom);
        const color = mode === 'thesis-broken' ? colors.red || '#ea4335' : colors.line || '#c9d1d9';
        drawCrosshairPoint(ctx, cx, y, color);
    } else if (mode !== 'thesis-broken') {
        const rays = [
            { val: crosshairHit.bullValue, color: colors.line || '#c9d1d9' },
            { val: crosshairHit.baseValue, color: colors.blue || '#64b5f6' },
            { val: crosshairHit.bearValue, color: colors.line || '#c9d1d9' },
        ];
        rays.forEach(({ val, color }) => {
            if (isFinitePositive(val)) {
                drawCrosshairPoint(ctx, cx, clamp(yScale(val), plotTop, plotBottom), color);
            }
        });
    }
    ctx.restore();
}

function buildChartAriaLabel(config, decision, metrics, geometry) {
    const symbol = config?.symbol || '';
    const verdict = decision?.verdictDisplay || decision?.verdictLabel || 'HOLD';
    const priceStr = formatPriceValue(geometry.todayPrice);
    const buyVal = geometry.bandToday ? formatPriceValue(geometry.bandToday.buy) : 'n/a';
    const meanStr = Number.isFinite(metrics?.expectedCagr)
        ? `${(metrics.expectedCagr * 100).toFixed(1)}%`
        : 'n/a';
    const trig = decision?.nextTrigger
        ? `${decision.nextTrigger.label} ${formatPriceValue(decision.nextTrigger.price)}`
        : 'n/a';
    return `${symbol} decision chart: ${verdict}, price ${priceStr}, Buy entry ${buyVal}, trigger ${trig}, Mean-wealth CAGR ${meanStr}`;
}

export function renderDecisionChart(canvas, payload, colors = {}, crosshairHit = null) {
    if (!canvas || typeof canvas.getContext !== 'function') {
        return null;
    }
    const rect =
        typeof canvas.getBoundingClientRect === 'function'
            ? canvas.getBoundingClientRect()
            : { width: canvas.clientWidth || 0, height: canvas.clientHeight || 0 };
    if (!(rect.width > 0) || !(rect.height > 0)) {
        return null;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return null;
    }

    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    const targetWidth = Math.round(rect.width * dpr);
    const targetHeight = Math.round(rect.height * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const geometry = buildDecisionChartGeometry({
        ...payload,
        width: rect.width,
        height: rect.height,
    });
    if (!geometry) {
        return null;
    }

    paintZoneBands(ctx, geometry, colors);
    paintAxesAndGrid(ctx, geometry, colors);
    paintHeaders(ctx, geometry, colors);
    paintCurvesAndRays(ctx, geometry, colors);
    paintTodayAndHistory(ctx, geometry, colors);
    paintCrosshair(ctx, geometry, crosshairHit, colors);

    if (typeof canvas.setAttribute === 'function') {
        canvas.setAttribute(
            'aria-label',
            buildChartAriaLabel(payload?.config, payload?.decision, payload?.metrics, geometry)
        );
    }
    return geometry;
}

export function attachDecisionChartInteractions(canvas, getRenderArgs) {
    if (!canvas || typeof canvas.addEventListener !== 'function') {
        return () => {};
    }
    if (typeof canvas._decisionChartDetach === 'function') {
        canvas._decisionChartDetach();
    }

    let rafId = null;
    let lastGeometry = null;
    let activeHit = null;

    const redraw = (hit = activeHit) => {
        const args = typeof getRenderArgs === 'function' ? getRenderArgs() : null;
        if (!args || !args.payload) {
            return null;
        }
        lastGeometry = renderDecisionChart(canvas, args.payload, args.colors || {}, hit);
        return args;
    };

    const onPointerMove = (event) => {
        if (rafId !== null) {
            return;
        }
        const clientX = event?.clientX;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            const rect = canvas.getBoundingClientRect();
            const pointerX = Number.isFinite(clientX) ? clientX - rect.left : NaN;
            let args = typeof getRenderArgs === 'function' ? getRenderArgs() : null;
            if (!lastGeometry) {
                args = redraw(null);
            }
            activeHit = resolveCrosshairHit(pointerX, lastGeometry);
            redraw(activeHit);
            updateCrosshairUI(
                buildValuationCrosshairSnapshot(
                    activeHit,
                    lastGeometry,
                    args?.payload?.config,
                    args?.colors || {}
                ),
                null
            );
        });
    };

    const onPointerLeave = () => {
        if (rafId !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        activeHit = null;
        redraw(null);
        updateCrosshairUI(null, null);
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);

    let resizeObserver = null;
    if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => {
            redraw(activeHit);
        });
        resizeObserver.observe(canvas);
    }

    const detach = () => {
        if (rafId !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (canvas._decisionChartDetach === detach) {
            delete canvas._decisionChartDetach;
        }
        updateCrosshairUI(null, null);
    };

    canvas._decisionChartDetach = detach;
    return detach;
}
