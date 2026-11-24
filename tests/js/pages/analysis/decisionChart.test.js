import fs from 'fs';
import path from 'path';
import {
    CHART_FONT_SIZE,
    attachDecisionChartInteractions,
    buildDecisionChartGeometry,
    buildValuationCrosshairSnapshot,
    computeLogTicks,
    renderDecisionChart,
    resolveCrosshairHit,
} from '../../../../js/pages/analysis/decisionChart.js';
import { setCrosshairExternalUpdate } from '../../../../js/transactions/chart/interaction.js';
import { computeMetrics, evaluateTickerDecision } from '../../../../js/pages/analysis/decision.js';

const ROOT = path.resolve(process.cwd());
const NOW_MS = Date.parse('2026-11-20T18:00:00Z');

function loadJson(relPath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf-8'));
}

function makeStubCanvas(width = 672, height = 192) {
    const ops = [];
    const attrs = {};
    const listeners = new Map();
    const ctx = {
        setTransform: jest.fn((...args) => ops.push(['setTransform', ...args])),
        clearRect: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        beginPath: jest.fn(),
        closePath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        arc: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn(),
        fillRect: jest.fn(),
        setLineDash: jest.fn(),
        fillText: jest.fn((text, x, y) => ops.push(['fillText', text, x, y])),
        measureText: jest.fn((text) => ({ width: String(text).length * 6 })),
    };
    return {
        width: 0,
        height: 0,
        ops,
        attrs,
        listeners,
        getContext: jest.fn(() => ctx),
        getBoundingClientRect: jest.fn(() => ({ left: 0, top: 0, width, height })),
        setAttribute: jest.fn((k, v) => {
            attrs[k] = v;
        }),
        addEventListener: jest.fn((type, fn) => {
            if (!listeners.has(type)) {
                listeners.set(type, new Set());
            }
            listeners.get(type).add(fn);
        }),
        removeEventListener: jest.fn((type, fn) => {
            listeners.get(type)?.delete(fn);
        }),
        ctx,
    };
}

describe('decisionChart (WO4)', () => {
    it('selects all three modes and preserves geometric continuity at TODAY with PDD cache EPS', () => {
        const pdd = loadJson('data/analysis/PDD.json');
        const pddHistory = {
            symbol: 'PDD',
            priceBasis: 'rawClose',
            priceBasisVerified: true,
            epsPointInTimeCertified: false,
            prices: [
                { d: '2025-01-06', c: 95 },
                { d: '2026-01-05', c: 88 },
                { d: '2026-11-16', c: 85.56 },
            ],
            eps: [
                { d: '2025-06-30', v: 9.5 },
                { d: '2026-06-30', v: 10.1340807 },
            ],
        };
        const pddMetrics = computeMetrics(pdd);
        const pddDecision = evaluateTickerDecision(pdd, pddMetrics, {
            currentWeight: 0.2,
            nowMs: NOW_MS,
        });
        const pddGeo = buildDecisionChartGeometry({
            config: pdd,
            history: pddHistory,
            decision: pddDecision,
            metrics: pddMetrics,
            horizonMode: '2y',
            width: 672,
            height: 192,
        });

        expect(pddGeo.mode).toBe('eps-corridor');
        expect(pddGeo.epsHistAtToday).toBeCloseTo(10.1340807, 6);
        expect(pddGeo.epsPointInTimeCertified).toBe(false);
        expect(pddGeo.unitBreak).toBe('PRICE → TOTAL-RETURN VALUE');
        const lastPast = pddGeo.pastPoints[pddGeo.pastPoints.length - 1];
        expect(lastPast.bands.buy).toBeCloseTo(pddGeo.bandToday.buy, 6);
        expect(lastPast.bands.fair).toBeCloseTo(pddGeo.bandToday.fair, 6);
        expect(pddGeo.splitRatio).toBeCloseTo(0.5, 4);
        expect(pddGeo.hasScaleBreak).toBe(false);

        const vt = loadJson('data/analysis/VT.json');
        const vtHistory = loadJson('data/analysis/VT.history.json');
        const vtMetrics = computeMetrics(vt);
        const vtDecision = evaluateTickerDecision(vt, vtMetrics, {
            currentWeight: 0.28,
            nowMs: NOW_MS,
        });
        const vtGeo = buildDecisionChartGeometry({
            config: vt,
            history: vtHistory,
            decision: vtDecision,
            metrics: vtMetrics,
            horizonMode: '2y',
            width: 672,
            height: 192,
        });
        expect(vtGeo.mode).toBe('horizontal-bands');
        expect(vtGeo.pastYears).toBe(1);
        expect(vtGeo.splitRatio).toBeCloseTo(1 / 3, 3);
        expect(vtGeo.hasDividends).toBe(true);

        const cbrs = loadJson('data/analysis/CBRS.json');
        const cbrsHistory = loadJson('data/analysis/CBRS.history.json');
        const cbrsMetrics = computeMetrics(cbrs);
        const cbrsDecision = evaluateTickerDecision(cbrs, cbrsMetrics, {
            currentWeight: 0,
            nowMs: NOW_MS,
        });
        const cbrsGeo = buildDecisionChartGeometry({
            config: cbrs,
            history: cbrsHistory,
            decision: cbrsDecision,
            metrics: cbrsMetrics,
            horizonMode: '2y',
            width: 672,
            height: 192,
        });
        expect(cbrsGeo.mode).toBe('thesis-broken');
        expect(cbrsGeo.futureCurves).toEqual([]);
        expect(cbrsGeo.scenarioRays).toEqual([]);
    });

    it('handles full horizon scale break, valid t=T samples, log-ratio symmetry, and yMax_full >= terminalBullTotalValue', () => {
        const goog = loadJson('data/analysis/GOOG.json');
        const googHistory = loadJson('data/analysis/GOOG.history.json');
        const metrics = computeMetrics(goog);
        const decision = evaluateTickerDecision(goog, metrics, {
            currentWeight: 0.2,
            nowMs: NOW_MS,
        });
        const geoFull = buildDecisionChartGeometry({
            config: goog,
            history: googHistory,
            decision,
            metrics,
            horizonMode: 'full',
            width: 672,
            height: 240,
        });

        expect(geoFull.futureYears).toBe(10);
        expect(geoFull.splitRatio).toBeCloseTo(0.3, 6);
        expect(geoFull.hasScaleBreak).toBe(true);

        const lastFuture = geoFull.futureCurves[geoFull.futureCurves.length - 1];
        expect(lastFuture.t).toBe(10);
        expect(lastFuture.bands.buy).toBeCloseTo(metrics.expectedTerminalTotalValue, 4);

        const bullRay = geoFull.scenarioRays.find((r) => r.id.startsWith('bull'));
        expect(geoFull.yMax).toBeGreaterThanOrEqual(bullRay.terminalTotalValue);
        expect(geoFull.rightLabels.every((item) => item.label.includes('→TV'))).toBe(true);

        // Log-ratio symmetry: equal multiplicative factors produce equal pixel intervals
        const p = geoFull.todayPrice;
        const dyUp = geoFull.yScale(p) - geoFull.yScale(p * 2);
        const dyDown = geoFull.yScale(p * 0.5) - geoFull.yScale(p);
        expect(dyUp).toBeCloseTo(dyDown, 6);
    });

    it('enforces tick collision spacing >= floor(fontSize)', () => {
        const yMin = 50;
        const yMax = 500;
        const plotTop = 16;
        const plotBottom = 170;
        const yScale = (v) =>
            plotBottom -
            ((Math.log(v) - Math.log(yMin)) / (Math.log(yMax) - Math.log(yMin))) *
                (plotBottom - plotTop);
        const ticks = computeLogTicks(yMin, yMax, yScale, {
            fontSize: CHART_FONT_SIZE,
            anchors: [171],
        });
        expect(ticks.length).toBeGreaterThan(2);
        const sortedByY = [...ticks].sort((a, b) => a.y - b.y);
        for (let i = 1; i < sortedByY.length; i++) {
            expect(sortedByY[i].y - sortedByY[i - 1].y).toBeGreaterThanOrEqual(
                Math.floor(CHART_FONT_SIZE)
            );
        }
    });

    it('resolves past vs future crosshair units and discloses legacy/cached caveats', () => {
        const goog = loadJson('data/analysis/GOOG.json');
        const legacyHistory = {
            symbol: 'GOOG',
            priceBasis: 'legacyClose',
            priceBasisVerified: false,
            epsPointInTimeCertified: false,
            prices: [
                { d: '2025-01-06', c: 190 },
                { d: '2026-01-05', c: 250 },
                { d: '2026-11-16', c: 264 },
            ],
            eps: [
                { d: '2025-06-30', v: 15 },
                { d: '2026-06-30', v: 19.39 },
            ],
        };
        const metrics = computeMetrics(goog);
        const decision = evaluateTickerDecision(goog, metrics, {
            currentWeight: 0.2,
            nowMs: NOW_MS,
        });
        const geo = buildDecisionChartGeometry({
            config: goog,
            history: legacyHistory,
            decision,
            metrics,
            horizonMode: '2y',
            width: 672,
            height: 192,
        });

        expect(resolveCrosshairHit(geo.plotLeft - 5, geo)).toBeNull();
        expect(resolveCrosshairHit(geo.plotRight + 5, geo)).toBeNull();

        const pastHit = resolveCrosshairHit(geo.plotLeft + 20, geo);
        expect(pastHit.side).toBe('past');
        expect(pastHit.unit).toBe('closePrice');
        expect(pastHit.priceBasis).toBe('legacyClose');
        expect(pastHit.priceBasisVerified).toBe(false);
        expect(pastHit.epsPointInTimeCertified).toBe(false);
        expect(pastHit.epsCaveat).toContain('not strictly point-in-time');

        const futureHit = resolveCrosshairHit(geo.xToday + 50, geo);
        expect(futureHit.side).toBe('future');
        expect(futureHit.unit).toBe('totalReturnValue');
        expect(futureHit.bullValue).toBeGreaterThan(futureHit.bearValue);
        expect(futureHit.buyEntryValue).toBeGreaterThan(0);

        const canvas = makeStubCanvas(672, 192);
        const rendered = renderDecisionChart(
            canvas,
            { config: goog, history: legacyHistory, decision, metrics, horizonMode: '2y' },
            {},
            futureHit
        );
        expect(rendered).not.toBeNull();
        const drawnTexts = canvas.ops.filter((op) => op[0] === 'fillText').map((op) => op[1]);
        expect(drawnTexts.some((t) => t.includes('PRICE BASIS UNVERIFIED'))).toBe(true);
        expect(drawnTexts.some((t) => t.includes('PRICE → TOTAL-RETURN VALUE'))).toBe(true);
        expect(drawnTexts.some((t) => t.includes('→TV'))).toBe(true);
        expect(canvas.attrs['aria-label']).toContain('Mean-wealth CAGR');
    });

    it('bails out cleanly on a 0x0 canvas and avoids duplicate interaction listeners', () => {
        const goog = loadJson('data/analysis/GOOG.json');
        const history = loadJson('data/analysis/GOOG.history.json');
        const metrics = computeMetrics(goog);
        const decision = evaluateTickerDecision(goog, metrics, {
            currentWeight: 0.2,
            nowMs: NOW_MS,
        });

        const zeroCanvas = makeStubCanvas(0, 0);
        expect(
            renderDecisionChart(zeroCanvas, { config: goog, history, decision, metrics })
        ).toBeNull();
        expect(zeroCanvas.width).toBe(0);
        expect(zeroCanvas.ctx.clearRect).not.toHaveBeenCalled();

        const liveCanvas = makeStubCanvas(672, 192);
        const getArgs = () => ({
            payload: { config: goog, history, decision, metrics },
            colors: {},
        });
        const detach1 = attachDecisionChartInteractions(liveCanvas, getArgs);
        expect(liveCanvas.listeners.get('pointermove').size).toBe(1);
        const detach2 = attachDecisionChartInteractions(liveCanvas, getArgs);
        expect(liveCanvas.listeners.get('pointermove').size).toBe(1);
        detach1();
        detach2();
        expect(liveCanvas.listeners.get('pointermove').size).toBe(0);
    });

    it('uses unified dashed crosshair, dots, and updates external terminal crosshair overlay on hover/leave', () => {
        const goog = loadJson('data/analysis/GOOG.json');
        const history = loadJson('data/analysis/GOOG.history.json');
        const metrics = computeMetrics(goog);
        const decision = evaluateTickerDecision(goog, metrics, {
            currentWeight: 0.2,
            nowMs: NOW_MS,
        });
        const geo = buildDecisionChartGeometry({
            config: goog,
            history,
            decision,
            metrics,
            horizonMode: '2y',
            width: 672,
            height: 226,
        });

        const pastHit = resolveCrosshairHit(geo.plotLeft + 25, geo);
        const pastSnap = buildValuationCrosshairSnapshot(pastHit, geo, goog, {});
        expect(pastSnap.chartKey).toBe('valuation');
        expect(pastSnap.series.map((s) => s.label)).toEqual(['GOOG', 'Zone']);

        const futureHit = resolveCrosshairHit(geo.xToday + 40, geo);
        const futureSnap = buildValuationCrosshairSnapshot(futureHit, geo, goog, {});
        expect(futureSnap.dateLabel).toContain('Y');
        expect(futureSnap.series.map((s) => s.label)).toEqual(['Bull', 'Base', 'Bear', 'Buy ≤']);

        const canvas = makeStubCanvas(672, 226);
        renderDecisionChart(canvas, { config: goog, history, decision, metrics }, {}, futureHit);
        expect(canvas.ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
        expect(canvas.ctx.arc).toHaveBeenCalled();

        const externalUpdates = [];
        setCrosshairExternalUpdate((snap) => externalUpdates.push(snap));
        const origRaf = global.requestAnimationFrame;
        global.requestAnimationFrame = (cb) => {
            cb();
            return 1;
        };
        try {
            const detach = attachDecisionChartInteractions(canvas, () => ({
                payload: { config: goog, history, decision, metrics },
                colors: {},
            }));
            const onMove = Array.from(canvas.listeners.get('pointermove'))[0];
            const onLeave = Array.from(canvas.listeners.get('pointerleave'))[0];
            onMove({ clientX: geo.xToday + 40 });
            expect(externalUpdates[externalUpdates.length - 1].chartKey).toBe('valuation');
            onLeave();
            expect(externalUpdates[externalUpdates.length - 1]).toBeNull();
            detach();
        } finally {
            setCrosshairExternalUpdate(null);
            global.requestAnimationFrame = origRaf;
        }
    });
});
