import { jest } from '@jest/globals';

const FLAG = '__SKIP_ANALYSIS_AUTO_INIT__';
global[FLAG] = true;

global.Worker = class {
    constructor(stringUrl) {
        this.url = stringUrl;
        this.onmessage = () => {};
    }
    postMessage() {}
    terminate() {}
};

const domSetup = `
    <div id="tickerList"></div>
    <div id="summaryStats"></div>
    <div id="scenarioResults"></div>
    <div id="valueBands"></div>
    <canvas id="kellyCurveCanvas" width="600" height="200"></canvas>
    <div id="kellyMetrics"></div>
    <div id="beliefStateCard"></div>
    <div id="evidenceTimeline"></div>
    <div id="predictionsCard"></div>
    <div id="decisionJournalCard"></div>
    <div id="bayesOutput"></div>
    <button id="btnBayesBull"></button>
    <button id="btnBayesBear"></button>
    <button id="btnBayesReset"></button>
    <button id="btnRunMonteCarlo"></button>
    <div id="riskMetrics"></div>
    <canvas id="monteCarloCanvas" width="600" height="200"></canvas>
`;

describe('Analysis Lab Revival (WO-7 & WO-9)', () => {
    let mockCtx;

    beforeEach(() => {
        document.body.innerHTML = domSetup;
        mockCtx = {
            clearRect: jest.fn(),
            fillRect: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fill: jest.fn(),
            closePath: jest.fn(),
            arc: jest.fn(),
            fillText: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            setLineDash: jest.fn(),
        };
        HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCtx);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
    });

    describe('Cross-Asset Covariance & Portfolio Kelly (WO-9)', () => {
        it('calibrates pairwise correlations across tech and market assets', async () => {
            const { getAssetPairCorrelation } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;

            expect(getAssetPairCorrelation('ANET', 'ANET')).toBe(1.0);
            expect(getAssetPairCorrelation('ANET', 'GOOG')).toBe(0.6);
            expect(getAssetPairCorrelation('GOOG', 'ANET')).toBe(0.6); // symmetric
            expect(getAssetPairCorrelation('ANET', 'VT')).toBe(0.65);
            expect(getAssetPairCorrelation('PDD', 'ANET')).toBe(0.25);
            expect(getAssetPairCorrelation('UNKNOWN', 'OTHER')).toBe(0.0);
        });

        it('computes covariance volatility higher than zero-correlation assumption for correlated holdings', async () => {
            const { computePortfolioCovarianceVolatility } = (
                await import('@pages/analysis/lab.js')
            ).__analysisLabTesting;

            const configs = [
                {
                    symbol: 'ANET',
                    weight: 0.5,
                    risk: { volatility: 0.5 },
                },
                {
                    symbol: 'GOOG',
                    weight: 0.5,
                    risk: { volatility: 0.4 },
                },
            ];

            const result = computePortfolioCovarianceVolatility(configs);

            // Zero correlation: sqrt(0.5^2 * 0.5^2 + 0.5^2 * 0.4^2) = sqrt(0.0625 + 0.04) = sqrt(0.1025) ≈ 0.32015
            // Covariance (rho = 0.6): 0.1025 + 2 * (0.5 * 0.5 * 0.5 * 0.4 * 0.6) = 0.1025 + 0.06 = 0.1625 -> sqrt(0.1625) ≈ 0.4031
            expect(result.volatility).toBeGreaterThan(result.volatilityZeroCorr);
            expect(result.volatilityZeroCorr).toBeCloseTo(Math.sqrt(0.1025), 4);
            expect(result.volatility).toBeCloseTo(Math.sqrt(0.1625), 4);
            expect(result.covarianceRatio).toBeGreaterThan(1.2);
        });

        it('incorporates covariance matrix into buildPortfolioConfig', async () => {
            const { buildPortfolioConfig } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;

            const configs = [
                {
                    symbol: 'ANET',
                    name: 'Arista Networks',
                    marketValue: 5000,
                    weight: 0.5,
                    scenarios: [],
                    model: {
                        preferences: {
                            benchmark: { value: 0.065 },
                            kellyScale: 0.5,
                            targetCagr: 0.12,
                        },
                    },
                    risk: { volatility: 0.5 },
                    market: { price: 200, eps: 3.5 },
                    position: { shares: 25 },
                    metrics: {
                        outcomes: [
                            {
                                id: 'base',
                                name: 'Base',
                                prob: 0.5,
                                earningsCagr: 0.18,
                                multiple: 2.0,
                            },
                        ],
                    },
                },
                {
                    symbol: 'GOOG',
                    name: 'Alphabet',
                    marketValue: 5000,
                    weight: 0.5,
                    scenarios: [],
                    model: {
                        preferences: {
                            benchmark: { value: 0.065 },
                            kellyScale: 0.5,
                            targetCagr: 0.12,
                        },
                    },
                    risk: { volatility: 0.4 },
                    market: { price: 180, eps: 7.5 },
                    position: { shares: 27.7 },
                    metrics: {
                        outcomes: [
                            {
                                id: 'base',
                                name: 'Base',
                                prob: 0.5,
                                earningsCagr: 0.15,
                                multiple: 1.8,
                            },
                        ],
                    },
                },
            ];

            const portfolio = buildPortfolioConfig(configs);
            expect(portfolio).not.toBeNull();
            expect(portfolio.symbol).toBe('PORT');
            expect(portfolio.risk.estimateSource).toBe('covariance-matrix');
            expect(portfolio.risk.correlations).toBe('calibrated-cross-asset');
            expect(portfolio.risk.volatility).toBeGreaterThan(portfolio.risk.volatilityZeroCorr);
            expect(portfolio.metrics.covarianceRatio).toBeGreaterThan(1.0);
        });
    });

    describe('Kelly Curve Rendering (WO-7 Item 6)', () => {
        it('renders growth curve, reference points and badges without errors', async () => {
            const { renderKellyCurve } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;

            const config = {
                symbol: 'ANET',
                weight: 0.05,
                position: { currentWeight: 0.05 },
                metrics: {
                    edge: 0.08,
                    volatility: 0.4,
                    fullKelly: 0.5,
                    scaledKelly: 0.25,
                    kellyScale: 0.5,
                    benchmark: 0.065,
                },
            };

            renderKellyCurve(config);

            expect(mockCtx.clearRect).toHaveBeenCalled();
            expect(mockCtx.beginPath).toHaveBeenCalled();
            expect(mockCtx.stroke).toHaveBeenCalled();

            const kellyMetrics = document.getElementById('kellyMetrics');
            expect(kellyMetrics.textContent).toContain('Full Kelly');
            expect(kellyMetrics.textContent).toContain('Scaled (½K)');
            expect(kellyMetrics.textContent).toContain('Current Weight');
        });
    });

    describe('Belief State Rendering (WO-7 Item 3)', () => {
        it('renders confidence, evidence for/against, and open questions', async () => {
            const { renderBeliefState } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;

            const config = {
                symbol: 'ANET',
                industry_thesis: 'docs/thesis/industry/ai-networking.md',
                belief_state: {
                    probability: 0.45,
                    confidence: 0.8,
                    as_of: '2026-09-30T10:00:00Z',
                    evidence_for: ['AI Ethernet leadership in 800G'],
                    evidence_against: ['Customer concentration with top 2 hyperscalers at 42%'],
                    open_questions: ['Will 1.6T LPO displace traditional DSP optics?'],
                },
            };

            renderBeliefState(config);

            const card = document.getElementById('beliefStateCard');
            expect(card.textContent).toContain('Current Belief: 45.0%');
            expect(card.textContent).toContain('Confidence: 80%');
            expect(card.textContent).toContain('AI Ethernet leadership');
            expect(card.textContent).toContain('Customer concentration');
            expect(card.textContent).toContain('Will 1.6T LPO displace');
            expect(card.innerHTML).toContain('ai-networking.md');
        });
    });

    describe('Evidence Timeline & Replay (WO-7 Item 2)', () => {
        it('loads evidence jsonl, replays Bayesian updates, and renders timeline entries', async () => {
            const module = await import('@pages/analysis/lab.js');
            const { renderEvidenceTimeline, state } = module.__analysisLabTesting;

            const fakeJsonl = `
                {"date": "2026-05-01", "claim": "AI cluster deployment surges", "direction": "bullish", "strength": 0.7, "source_url": "https://example.com/sec"}
                {"date": "2026-08-15", "claim": "Hyperscaler capex pause rumor", "direction": "bearish", "strength": 0.5, "source_url": "https://example.com/news"}
            `;

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                text: async () => fakeJsonl,
            });

            state.evidenceCache.clear();

            const config = {
                symbol: 'ANET',
                scenarios: [
                    { id: 'bull', name: 'Bull Case', prob: 0.35 },
                    { id: 'base', name: 'Base Case', prob: 0.45 },
                    { id: 'bear', name: 'Bear Case', prob: 0.2 },
                ],
            };

            await renderEvidenceTimeline(config);

            const timeline = document.getElementById('evidenceTimeline');
            expect(timeline.textContent).toContain('AI cluster deployment surges');
            expect(timeline.textContent).toContain('Hyperscaler capex pause rumor');
            expect(timeline.textContent).toContain('BULLISH');
            expect(timeline.textContent).toContain('BEARISH');
            expect(timeline.innerHTML).toContain('href="https://example.com/sec"');
        });
    });

    describe('Falsifiable Predictions & Self-Scoring (WO-7 Item 4)', () => {
        it('renders predictions list and computes Brier score for resolved predictions', async () => {
            const { renderPredictions } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;

            const config = {
                predictions: [
                    {
                        id: 'p1',
                        claim: 'FY2026 AI Revenue >= $1.5B',
                        target_date: '2026-11-15',
                        probability: 0.8,
                        resolved: true,
                        outcome: 1, // (0.8 - 1)^2 = 0.04
                    },
                    {
                        id: 'p2',
                        claim: 'Customer concentration drops below 35%',
                        target_date: '2026-12-31',
                        probability: 0.4,
                        resolved: false,
                        outcome: null,
                    },
                ],
            };

            renderPredictions(config);

            const card = document.getElementById('predictionsCard');
            expect(card.textContent).toContain('Falsifiable Predictions');
            expect(card.textContent).toContain('Brier: 0.04');
            expect(card.textContent).toContain('FY2026 AI Revenue >= $1.5B');
            expect(card.textContent).toContain('True');
            expect(card.textContent).toContain('Pending (40%)');
        });

        it('renders stale-prediction badge when predictions are overdue and hides when zero stale', async () => {
            const { renderPredictions, computeStalePredictions } = (
                await import('@pages/analysis/lab.js')
            ).__analysisLabTesting;

            const testList = [
                { id: 'stale1', target_date: '2025-01-01', resolved: false },
                { id: 'stale2', target_date: '2025-02-01', resolved: false },
                { id: 'resolved', target_date: '2025-01-01', resolved: true },
                { id: 'future', target_date: '2030-01-01', resolved: false },
            ];
            const stale = computeStalePredictions(testList, '2026-01-01');
            expect(stale.map((p) => p.id)).toEqual(['stale1', 'stale2']);
            expect(computeStalePredictions(null)).toEqual([]);

            const configWithStale = {
                predictions: [
                    {
                        id: 'p-overdue',
                        claim: 'Overdue milestone',
                        target_date: '2020-01-01',
                        probability: 0.7,
                        resolved: false,
                    },
                ],
            };
            renderPredictions(configWithStale);
            const card = document.getElementById('predictionsCard');
            const badge = card.querySelector('.prediction-stale-badge');
            expect(badge).not.toBeNull();
            expect(badge.textContent).toBe('1 Overdue');

            const configNoStale = {
                predictions: [
                    {
                        id: 'p-future',
                        claim: 'Future milestone',
                        target_date: '2099-01-01',
                        probability: 0.5,
                        resolved: false,
                    },
                ],
            };
            renderPredictions(configNoStale);
            expect(card.querySelector('.prediction-stale-badge')).toBeNull();
        });
    });

    describe('Decision Journal (WO-7 Item 7)', () => {
        it('renders latest logged action, situation, and alternatives rejected', async () => {
            const { renderDecisionJournal } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;

            const config = {
                decision_journal: [
                    {
                        date: '2026-09-29',
                        action: 'HOLD',
                        situation: 'ANET trading at high trailing multiple amid strong backlog.',
                        alternatives_rejected: [
                            'Trim to under 2% (rejected: backlog visibility intact)',
                        ],
                        review_date: '2026-12-15',
                    },
                ],
            };

            renderDecisionJournal(config);

            const card = document.getElementById('decisionJournalCard');
            expect(card.textContent).toContain('Decision Journal');
            expect(card.textContent).toContain('HOLD');
            expect(card.textContent).toContain('high trailing multiple');
            expect(card.textContent).toContain('Trim to under 2%');
            expect(card.textContent).toContain('2026-12-15');
        });
    });

    describe('Monte Carlo Risk Visualization Upgrades (WO-7 Item 5)', () => {
        it('renders fan chart percentiles, 20% VaR tail, and metadata', async () => {
            const { renderMonteCarloResults } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;

            const mockResult = {
                mean: 250,
                median: 240,
                VaR_95: 120,
                CVaR_95: 100,
                VaR_80: 170, // 20% tail per doc §3.2
                CVaR_80: 145,
                runCount: 10000,
                asOf: '2026-09-30T10:00:00Z',
                initialPrice: 200,
                fanChart: [
                    { t: 0, median: 200, p5: 200, p25: 200, p75: 200, p95: 200 },
                    { t: 5, median: 240, p5: 120, p25: 180, p75: 310, p95: 420 },
                ],
                histogram: { counts: [10, 25, 40, 15] },
            };

            renderMonteCarloResults(mockResult);

            const metrics = document.getElementById('riskMetrics');
            expect(metrics.textContent).toContain('Median Price');
            expect(metrics.textContent).toContain('Mean Terminal Price');
            expect(metrics.textContent).toContain('VaR (20% Tail)$170.00');
            expect(metrics.textContent).toContain('CVaR (20% Tail)$145.00');
            expect(metrics.textContent).toContain('VaR (95%)$120.00');

            expect(mockCtx.clearRect).toHaveBeenCalled();
            expect(mockCtx.fillRect).toHaveBeenCalledTimes(4); // histogram bars
            expect(mockCtx.beginPath).toHaveBeenCalled(); // fan chart bands
        });
    });
});
