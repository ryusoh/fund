import fs from 'fs';
import path from 'path';
import {
    computeIsoCagrBands,
    computeMetrics,
    evaluateTickerDecision,
    getLatestJournalEntry,
    buildDecisionSnapshot,
    buildBoardSnapshot,
    solveGh7Kelly,
} from '../../../../js/pages/analysis/decision.js';

const ROOT = path.resolve(process.cwd());
const SNAPSHOT_NOW_MS = Date.parse('2026-11-20T18:00:00Z');
const FLAGS_GENERATED_AT = '2026-10-23T14:12:37.136441+00:00';
const SNAPSHOT_FLAGS = [
    {
        ticker: 'AEHR',
        kind: 'filing',
        form: '8-K',
        date: '2026-10-20',
    },
    {
        ticker: 'AEHR',
        kind: 'review-date',
        date: '2026-11-03',
    },
];

function loadLiveConfig(symbol) {
    const filePath = path.join(ROOT, 'data', 'analysis', `${symbol}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function buildSnapshotConfig(symbol, overrides = {}) {
    const cfg = loadLiveConfig(symbol);
    return {
        ...cfg,
        market: {
            ...cfg.market,
            marketDataUpdatedAt: '2026-11-20T16:22:57Z',
            ...(overrides.market || {}),
        },
        risk: {
            ...cfg.risk,
            ...(overrides.risk || {}),
        },
        model: {
            ...cfg.model,
            preferences: {
                ...cfg.model.preferences,
                ...(overrides.preferences || {}),
            },
        },
        belief_state: {
            ...cfg.belief_state,
            ...(overrides.belief_state || {}),
        },
    };
}

function makeSnapshotPortfolio() {
    return {
        GOOG: {
            config: buildSnapshotConfig('GOOG', {
                market: { price: 274.99, eps: 19.15, dividendYield: 0.32 },
                risk: { volatility: 0.33 },
            }),
            weight: 0.1967,
        },
        ANET: {
            config: buildSnapshotConfig('ANET', {
                market: { price: 170.99, eps: 3.73, dividendYield: 0 },
                risk: { volatility: 0.58 },
            }),
            weight: 0.3136,
        },
        PDD: {
            config: buildSnapshotConfig('PDD', {
                market: { price: 85.56, eps: 9.07, dividendYield: 0 },
                risk: { volatility: 0.35 },
            }),
            weight: 0.2036,
        },
        VT: {
            config: buildSnapshotConfig('VT', {
                market: { price: 144.96, eps: 8.0197, pe: 18.0755, dividendYield: 1.56 },
                risk: { volatility: 0.15 },
            }),
            weight: 0.2861,
        },
        AEHR: {
            config: buildSnapshotConfig('AEHR', {
                market: { price: 40.92, eps: -0.23, dividendYield: 0 },
                risk: { volatility: 1.31 },
            }),
            weight: 0,
        },
        CBRS: {
            config: buildSnapshotConfig('CBRS', {
                market: { price: 91.25, eps: -5.17, dividendYield: 0 },
                risk: { volatility: 1.13 },
            }),
            weight: 0,
        },
    };
}

describe('decision engine (WO3)', () => {
    it('evaluates all six snapshot verdicts, directional triggers, and boundary proximity', () => {
        const portfolio = makeSnapshotPortfolio();
        const decisions = {};
        const rows = [];

        Object.entries(portfolio).forEach(([symbol, { config, weight }]) => {
            const metrics = computeMetrics(config);
            const decision = evaluateTickerDecision(config, metrics, {
                currentWeight: weight,
                eventFlags: SNAPSHOT_FLAGS,
                flagsGeneratedAt: FLAGS_GENERATED_AT,
                nowMs: SNAPSHOT_NOW_MS,
            });
            decisions[symbol] = { config, metrics, decision };
            rows.push({
                symbol,
                decision,
                snapshot: buildDecisionSnapshot(config, decision, metrics),
            });
        });

        // GOOG: ADD (+5.3% to cap), Fair > $306.x (+11.4%), Rev 2026-11-30
        expect(decisions.GOOG.decision.verdictLabel).toBe('ADD');
        expect(decisions.GOOG.decision.zone).toBe('BUY');
        expect(decisions.GOOG.decision.targetWeight).toBeCloseTo(0.25, 4);
        expect(decisions.GOOG.decision.nextTrigger.label).toBe('Fair >');
        expect(decisions.GOOG.decision.nextTrigger.price).toBeCloseTo(306.2, 0);
        expect(decisions.GOOG.decision.nearBoundary).toBe(false);
        expect(decisions.GOOG.decision.reviewDate).toBe('2026-11-30');
        expect(decisions.GOOG.decision.hasTickerFlag).toBe(false);
        expect(decisions.GOOG.decision.flagsStale).toBe(true);

        // ANET: TRIM · OVER KELLY, alone near boundary (<2% from Fair)
        expect(decisions.ANET.decision.verdictLabel).toBe('TRIM · OVER KELLY');
        expect(decisions.ANET.decision.zone).toBe('BUY');
        expect(decisions.ANET.decision.nextTrigger.label).toBe('Fair >');
        expect(decisions.ANET.decision.nearBoundary).toBe(true);
        expect(decisions.ANET.decision.targetWeight).toBeCloseTo(0.078, 2);

        // PDD: TRIM · OVER KELLY, selects directional Buy < $70.103 despite Fair ~$90.174 being closer
        expect(decisions.PDD.decision.verdictLabel).toBe('TRIM · OVER KELLY');
        expect(decisions.PDD.decision.zone).toBe('FAIR');
        expect(decisions.PDD.decision.nextTrigger.label).toBe('Buy <');
        expect(decisions.PDD.decision.nextTrigger.price).toBeCloseTo(70.103, 2);
        expect(decisions.PDD.decision.nearBoundary).toBe(false);

        // VT: HOLD · AT TARGET (28.6% vs 30.0% within 3.0% deadband)
        expect(decisions.VT.decision.verdictLabel).toBe('HOLD · AT TARGET');
        expect(decisions.VT.decision.zone).toBe('BUY');
        expect(decisions.VT.decision.nearBoundary).toBe(false);

        // AEHR: BUY · INITIATE (not Deep Value) with overdue 2026-11-03 review flag
        expect(decisions.AEHR.decision.verdictLabel).toBe('BUY · INITIATE');
        expect(decisions.AEHR.decision.zone).toBe('BUY');
        expect(decisions.AEHR.decision.targetWeight).toBeCloseTo(0.009, 2);
        expect(decisions.AEHR.decision.hasTickerFlag).toBe(true);
        expect(decisions.AEHR.decision.activeEventFlags.map((f) => f.kind)).toEqual([
            'review-date',
        ]);

        // CBRS: AVOID · THESIS BROKEN (both non-positive EPS and thesis_intact_probability < 0.15), nextTrigger null
        expect(decisions.CBRS.decision.verdictLabel).toBe('AVOID · THESIS BROKEN');
        expect(decisions.CBRS.decision.gate1Broken).toBe(true);
        expect(decisions.CBRS.decision.gate1Reasons).toContain('thesis-intact-low');
        expect(decisions.CBRS.decision.nextTrigger).toBeNull();
        expect(decisions.CBRS.decision.bands).toBeNull();

        // Snapshot text uses compact Mean; Board labels residual target cash and global flagsStale
        const googSnap = buildDecisionSnapshot(
            decisions.GOOG.config,
            decisions.GOOG.decision,
            decisions.GOOG.metrics
        );
        expect(googSnap.text).toContain('Mean ');
        expect(googSnap.text).not.toContain('Expected CAGR');

        const board = buildBoardSnapshot(rows, {
            flagsGeneratedAt: FLAGS_GENERATED_AT,
            nowMs: SNAPSHOT_NOW_MS,
        });
        expect(board.flagsStale).toBe(true);
        expect(board.thesisProbUnmigrated).toBe(false);
        expect(board.warnings).toContain('FLAGS STALE');
        expect(board.warnings).not.toContain('THESIS PROB UNMIGRATED');
        expect(board.residualTargetCashLabel).toBe('Residual Target Cash');
        expect(board.totalCurrentWeight).toBeCloseTo(1.0, 3);
        expect(board.residualTargetCash).toBeCloseTo(1 - board.totalRecommendedWeight, 6);
        // Ranked by portfolio weight descending (with equal-weight ties broken by targetWeight / priority)
        const weights = board.rows.map((r) => r.decision.currentWeight);
        for (let i = 1; i < weights.length; i++) {
            expect(weights[i]).toBeLessThanOrEqual(weights[i - 1]);
        }
        expect(board.rows[0].symbol).toBe('ANET');
        expect(board.rows[board.rows.length - 1].decision.currentWeight).toBe(0);
    });

    it('downgrades Deep Value to BUY when synthetic price clears strongBuy but Geo < targetCagr', () => {
        const aehrAtDeepPrice = buildSnapshotConfig('AEHR', {
            market: { price: 38.0, eps: -0.23, dividendYield: 0 },
            risk: { volatility: 1.31 },
        });
        const metrics = computeMetrics(aehrAtDeepPrice);
        const bands = computeIsoCagrBands(
            metrics.expectedTerminalTotalValue,
            metrics.horizon,
            {
                targetCagr: metrics.targetCagr,
                benchmark: metrics.benchmark,
                riskFreeRate: metrics.riskFreeRate,
            },
            0
        );
        expect(38.0).toBeLessThanOrEqual(bands.strongBuy);
        expect(metrics.geometricCagr).toBeLessThan(metrics.targetCagr);

        const decision = evaluateTickerDecision(aehrAtDeepPrice, metrics, {
            currentWeight: 0,
            nowMs: SNAPSHOT_NOW_MS,
        });
        expect(decision.zone).toBe('BUY');
        expect(decision.verdictLabel).toBe('BUY · INITIATE');
    });

    it('returns expected terminal total value across all four bands when t === T', () => {
        const bands = computeIsoCagrBands(500, 5, { targetCagr: 0.12, benchmark: 0.065 }, 5);
        expect(bands).toEqual({
            strongBuy: 500,
            buy: 500,
            fair: 500,
            sell: 500,
        });
        expect(computeIsoCagrBands(500, 5, { targetCagr: 0.12, benchmark: 0.065 }, 5.1)).toBeNull();
        expect(
            computeIsoCagrBands(500, 5, { targetCagr: 0.12, benchmark: 0.065 }, -0.1)
        ).toBeNull();
    });

    it('saturates all-winning GH-7 Kelly at cap without empty-min errors', () => {
        const solved = solveGh7Kelly(
            [
                { prob: 0.5, ret: 0.25 },
                { prob: 0.5, ret: 0.15 },
            ],
            0,
            0.04,
            1.0
        );
        expect(solved).toBe(1.0);
    });

    it('handles missing or negative volatility without treating Kelly as zero', () => {
        const missingVolConfig = buildSnapshotConfig('GOOG', {
            market: { price: 274.99, eps: 19.15, dividendYield: 0.32 },
            risk: { volatility: null },
        });
        const metrics = computeMetrics(missingVolConfig);
        expect(metrics.fullKelly).toBeNull();
        expect(metrics.scaledKelly).toBeNull();

        const heldDecision = evaluateTickerDecision(missingVolConfig, metrics, {
            currentWeight: 0.2,
            nowMs: SNAPSHOT_NOW_MS,
        });
        expect(heldDecision.kellyUnavailable).toBe(true);
        expect(heldDecision.targetWeight).toBeNull();
        expect(heldDecision.weightDelta).toBeNull();
        expect(heldDecision.verdictLabel).toBe('HOLD · DATA');
        expect(heldDecision.tickerWarnings).toContain('KELLY UNAVAILABLE');

        const watchDecision = evaluateTickerDecision(missingVolConfig, metrics, {
            currentWeight: 0,
            nowMs: SNAPSHOT_NOW_MS,
        });
        expect(watchDecision.verdictLabel).toBe('WATCH · DATA');
    });

    it('activates filing flags through day 30 and deactivates on day 31, and checks overdue reviews', () => {
        const aehr = buildSnapshotConfig('AEHR', {
            market: { price: 40.92, eps: -0.23, marketDataUpdatedAt: '2026-11-19T12:00:00Z' },
        });
        const metrics = computeMetrics(aehr);

        const day30 = evaluateTickerDecision(aehr, metrics, {
            currentWeight: 0,
            eventFlags: SNAPSHOT_FLAGS,
            flagsGeneratedAt: FLAGS_GENERATED_AT,
            nowMs: Date.parse('2026-11-19T18:00:00Z'),
        });
        expect(day30.activeEventFlags.map((f) => f.kind)).toEqual(['filing', 'review-date']);

        const day31 = evaluateTickerDecision(aehr, metrics, {
            currentWeight: 0,
            eventFlags: SNAPSHOT_FLAGS,
            flagsGeneratedAt: FLAGS_GENERATED_AT,
            nowMs: SNAPSHOT_NOW_MS,
        });
        expect(day31.activeEventFlags.map((f) => f.kind)).toEqual(['review-date']);
    });

    it('detects overdue unresolved predictions only from explicit review_date or dueDate', () => {
        const cfg = buildSnapshotConfig('GOOG', {
            market: { price: 274.99, eps: 19.15, marketDataUpdatedAt: '2026-11-20T12:00:00Z' },
        });
        cfg.predictions = [
            {
                id: 'resolved',
                resolved: true,
                resolved_date: '2026-11-01',
                review_date: '2026-11-01',
            },
            { id: 'no-due', resolved: false, target_date: '2026-11-01' },
            { id: 'overdue', resolved: false, dueDate: '2026-11-10' },
        ];
        const decision = evaluateTickerDecision(cfg, computeMetrics(cfg), {
            currentWeight: 0.2,
            nowMs: SNAPSHOT_NOW_MS,
        });
        expect(decision.overduePredictions.map((p) => p.id)).toEqual(['overdue']);
        expect(decision.tickerWarnings).toContain('1 PRED OVERDUE');
    });

    it('sorts decision_journal ascending by ISO date to resolve latest entry and GOOG review_date 2026-11-30', () => {
        const goog = loadLiveConfig('GOOG');
        const latest = getLatestJournalEntry(goog.decision_journal);
        expect(latest.date).toBe('2026-11-23');
        expect(latest.review_date).toBe('2026-11-30');

        const outOfOrder = [
            { date: '2026-10-29', review_date: '2026-11-30' },
            { date: '2026-09-29', review_date: '2026-12-15' },
        ];
        expect(getLatestJournalEntry(outOfOrder).date).toBe('2026-10-29');
    });

    it('keeps Gate 1 probability test disabled and flags unmigrated board when thesis_intact_probability is omitted even if legacy probability=0.01', () => {
        const legacyOnlyCfg = buildSnapshotConfig('GOOG', {
            market: { price: 274.99, eps: 19.15 },
            belief_state: { probability: 0.01, confidence: 0.8 },
        });
        delete legacyOnlyCfg.belief_state.thesis_intact_probability;
        const metrics = computeMetrics(legacyOnlyCfg);

        const legacyOnly = evaluateTickerDecision(legacyOnlyCfg, metrics, {
            currentWeight: 0.2,
            nowMs: SNAPSHOT_NOW_MS,
        });
        expect(legacyOnly.gate1Broken).toBe(false);
        expect(legacyOnly.hasThesisIntactProbability).toBe(false);

        const unmigratedBoard = buildBoardSnapshot([{ symbol: 'GOOG', decision: legacyOnly }]);
        expect(unmigratedBoard.thesisProbUnmigrated).toBe(true);
        expect(unmigratedBoard.warnings).toContain('THESIS PROB UNMIGRATED');

        const migratedBroken = evaluateTickerDecision(
            {
                ...legacyOnlyCfg,
                belief_state: { ...legacyOnlyCfg.belief_state, thesis_intact_probability: 0.14 },
            },
            metrics,
            { currentWeight: 0.2, nowMs: SNAPSHOT_NOW_MS }
        );
        expect(migratedBroken.gate1Broken).toBe(true);
        expect(migratedBroken.gate1Reasons).toContain('thesis-intact-low');
        expect(migratedBroken.verdictLabel).toBe('EXIT · THESIS BROKEN');

        const migratedBoard = buildBoardSnapshot([{ symbol: 'GOOG', decision: migratedBroken }]);
        expect(migratedBoard.thesisProbUnmigrated).toBe(false);
    });

    it('ignores derived.fairValueRange when effective eps is non-positive', () => {
        const cfg = buildSnapshotConfig('AEHR', {
            preferences: { overrides: {} },
            market: { price: 40.92, eps: -0.23 },
        });
        cfg.derived = { fairValueRange: [45, 50] };
        const metrics = computeMetrics(cfg);
        expect(metrics.expectedMultiple).toBeNull();
        const decision = evaluateTickerDecision(cfg, metrics, {
            currentWeight: 0,
            nowMs: SNAPSHOT_NOW_MS,
        });
        expect(decision.gate1Broken).toBe(true);
        expect(decision.gate1Reasons).toContain('non-positive-eps');
    });
});
