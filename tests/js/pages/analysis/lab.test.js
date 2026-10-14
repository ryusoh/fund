describe('analysis lab data loading', () => {
    const ORIGINAL_FETCH = global.fetch;

    beforeEach(() => {
        jest.resetModules();
        global.fetch = ORIGINAL_FETCH;
        global.Worker = class {
            constructor(stringUrl) {
                this.url = stringUrl;
                this.onmessage = () => {};
            }
            postMessage() {}
            terminate() {}
        };
        document.body.innerHTML = '';
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
        global.fetch = ORIGINAL_FETCH;
        delete global.Worker;
        document.body.innerHTML = '';
    });

    async function setupPane(autoLoad = false) {
        const module = await import('@pages/analysis/lab.js');
        const container = document.createElement('div');
        document.body.appendChild(container);
        await module.initAnalysisPane(container, { autoLoad });
        return { module, container };
    }

    it('adds a cache-busting query param and disables caching for data fetches', async () => {
        const cacheBustValue = '1731900000000';
        jest.spyOn(Date, 'now').mockReturnValue(Number(cacheBustValue));
        const json = jest.fn().mockResolvedValue({ ok: true });
        const fetchMock = jest.fn().mockResolvedValue({ ok: true, json });
        global.fetch = fetchMock;

        const { fetchJson } = await import('@pages/analysis/lab.js');
        await fetchJson('../data/analysis/ANET.json');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [requestedUrl, options] = fetchMock.mock.calls[0];
        expect(requestedUrl).toContain(`?v=${cacheBustValue}`);
        expect(options).toEqual({ cache: 'no-store' });
        expect(json).toHaveBeenCalled();
    });

    it('prefers precomputed earnings CAGR data for aggregated scenarios', async () => {
        const module = await import('@pages/analysis/lab.js');
        const { computeScenarioOutcome } = module.__analysisLabTesting;
        const scenario = {
            id: 'base',
            name: 'Base',
            prob: 0.5,
            precomputedMultiple: 1.5,
            precomputedCagr: 0.12,
            precomputedEarningsCagr: 0.18,
            precomputedTerminalEps: 8,
        };
        const result = computeScenarioOutcome(scenario, { price: 100, eps: 5, horizon: 5 });
        expect(result.priceCagr).toBeCloseTo(0.12);
        expect(result.earningsCagr).toBeCloseTo(0.18);
    });

    it('aggregates portfolio earnings CAGR as a weighted average', async () => {
        const module = await import('@pages/analysis/lab.js');
        const { aggregateScenarios } = module.__analysisLabTesting;
        const configs = [
            {
                weight: 0.6,
                metrics: {
                    outcomes: [
                        { id: 'base', name: 'Base', multiple: 1.4, prob: 0.4, earningsCagr: 0.1 },
                    ],
                },
            },
            {
                weight: 0.4,
                metrics: {
                    outcomes: [
                        { id: 'base', name: 'Base', multiple: 2.0, prob: 0.3, earningsCagr: 0.25 },
                    ],
                },
            },
        ];
        const scenarios = aggregateScenarios(configs, 4);
        const baseScenario = scenarios.find((scenario) => scenario.id === 'base');
        expect(baseScenario).toBeDefined();
        expect(baseScenario.precomputedEarningsCagr).toBeCloseTo(0.6 * 0.1 + 0.4 * 0.25, 5);
    });

    describe('Kelly criterion math (Tier-A fixes)', () => {
        function kellyConfig(overrides = {}) {
            return {
                market: { price: 100, eps: 10 },
                model: {
                    preferences: {
                        horizon: 1,
                        benchmark: 0.065,
                        kellyScale: 0.5,
                        riskFreeRate: 0,
                    },
                },
                scenarios: [
                    { id: 'bull', prob: 0.5, precomputedMultiple: 1.2 },
                    { id: 'bear', prob: 0.5, precomputedMultiple: 0.9 },
                ],
                ...overrides,
            };
        }

        it('solves exact discrete Kelly instead of the edge/variance approximation', async () => {
            const { computeMetrics } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;
            const metrics = computeMetrics(kellyConfig());
            // G(f) = 0.5·ln(1+0.2f) + 0.5·ln(1−0.1f) → FOC gives f* = 2.5
            expect(metrics.fullKelly).toBeCloseTo(2.5, 3);
            expect(metrics.scaledKelly).toBeCloseTo(1.25, 3);
            expect(metrics.kellyMaxFraction).toBeCloseTo(10, 5);
        });

        it('reports geometric CAGR alongside the arithmetic expected CAGR', async () => {
            const { computeMetrics } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;
            const metrics = computeMetrics(
                kellyConfig({
                    scenarios: [
                        { id: 'bull', prob: 0.5, precomputedMultiple: 2 },
                        { id: 'bear', prob: 0.5, precomputedMultiple: 0.5 },
                    ],
                })
            );
            expect(metrics.expectedCagr).toBeCloseTo(0.25, 6);
            expect(metrics.geometricCagr).toBeCloseTo(Math.sqrt(2 * 0.5) - 1, 6);
        });

        it('returns zero Kelly when the risk-free rate beats the expected return', async () => {
            const { computeMetrics } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;
            const metrics = computeMetrics(
                kellyConfig({
                    model: { preferences: { horizon: 1, kellyScale: 0.5, riskFreeRate: 0.06 } },
                })
            );
            // E[r] = 0.05 < rf = 0.06 → no position
            expect(metrics.fullKelly).toBe(0);
            expect(metrics.scaledKelly).toBe(0);
            expect(metrics.zeroGrowthFraction).toBeNull();
        });

        it('defaults the risk-free rate to 4% and sizes against it', async () => {
            const { computeMetrics } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;
            const config = kellyConfig();
            delete config.model.preferences.riskFreeRate;
            const metrics = computeMetrics(config);
            expect(metrics.riskFreeRate).toBeCloseTo(0.04, 10);
            // FOC: 0.08(1.04−0.14f) = 0.07(1.04+0.16f) → f* ≈ 0.4643
            expect(metrics.fullKelly).toBeCloseTo(0.4643, 3);
        });

        it('computes the scenario-implied volatility as a consistency check', async () => {
            const { computeMetrics } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;
            const metrics = computeMetrics(kellyConfig());
            // mean 0.05; var = 0.5·0.15² + 0.5·0.15² = 0.0225
            expect(metrics.scenarioVolatility).toBeCloseTo(0.15, 6);
        });

        it('finds the zero-growth fraction where the exact curve returns to the risk-free rate', async () => {
            const { computeMetrics } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;
            const metrics = computeMetrics(kellyConfig());
            // (1+0.2f)(1−0.1f) = 1 → f = 5
            expect(metrics.zeroGrowthFraction).toBeCloseTo(5, 3);
        });

        it('caps the Kelly fraction when no scenario loses to the risk-free rate', async () => {
            const { computeMetrics } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;
            const metrics = computeMetrics(
                kellyConfig({
                    scenarios: [
                        { id: 'bull', prob: 0.5, precomputedMultiple: 1.2 },
                        { id: 'base', prob: 0.5, precomputedMultiple: 1.1 },
                    ],
                })
            );
            expect(metrics.kellyMaxFraction).toBe(Infinity);
            expect(metrics.fullKelly).toBe(10);
            expect(metrics.zeroGrowthFraction).toBeNull();
        });

        it('returns zero Kelly and null metrics when there are no scenarios', async () => {
            const { computeMetrics } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;
            const metrics = computeMetrics(kellyConfig({ scenarios: [] }));
            expect(metrics.fullKelly).toBe(0);
            expect(metrics.geometricCagr).toBeNull();
            expect(metrics.scenarioVolatility).toBeNull();
            expect(metrics.kellyReturns).toEqual([]);
        });

        it('handles ruin scenarios without leaving the feasible region', async () => {
            const {
                computeGeometricCagr,
                solveKellyFraction,
                kellyLogGrowth,
                kellyGrowthDerivative,
            } = (await import('@pages/analysis/lab.js')).__analysisLabTesting;
            expect(computeGeometricCagr([{ prob: 1, ret: -1 }])).toBe(-1);
            const returns = [
                { prob: 0.6, ret: 0.4 },
                { prob: 0.4, ret: -0.5 },
            ];
            // FOC: 0.24(1−0.5f) = 0.2(1+0.4f) → f* = 0.2
            expect(solveKellyFraction(returns, 0)).toBeCloseTo(0.2, 3);
            expect(kellyLogGrowth(2, returns, 0)).toBe(-Infinity);
            expect(kellyGrowthDerivative(2, returns, 0)).toBe(-Infinity);
        });

        it('reports scaled-growth retention, half-edge Kelly, and implied belief', async () => {
            const { computeMetrics } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;
            const metrics = computeMetrics(kellyConfig({ position: { currentWeight: 1.25 } }));
            // G(1.25)/G(2.5) in log units ≈ 0.764 (half-Kelly keeps ~3/4 of growth)
            expect(metrics.scaledGrowthRetention).toBeCloseTo(0.764, 2);
            // mean haircut 0.025 → returns 0.175/-0.125 → f* = 0.05/0.04375
            expect(metrics.kellyAtHalfEdge).toBeCloseTo(1.1429, 3);
            // haircut δ with f*(δ) = 1.25 is 0.02288 → belief = 1 - δ/0.05 ≈ 0.542
            expect(metrics.impliedEdgeBelief).toBeCloseTo(0.542, 2);
        });

        it('returns null robustness readouts when there is no edge or no position', async () => {
            const { computeMetrics } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;
            const metrics = computeMetrics(
                kellyConfig({
                    model: { preferences: { horizon: 1, kellyScale: 0.5, riskFreeRate: 0.06 } },
                })
            );
            expect(metrics.scaledGrowthRetention).toBeNull();
            expect(metrics.kellyAtHalfEdge).toBeNull();
            expect(metrics.impliedEdgeBelief).toBeNull();
        });

        it('normalizes riskFreeRate with a 4% default and preserves explicit values', async () => {
            const { normalizeConfig } = (await import('@pages/analysis/lab.js'))
                .__analysisLabTesting;
            const defaulted = normalizeConfig({
                symbol: 'X',
                scenarios: [],
                model: { preferences: {} },
            });
            expect(defaulted.model.preferences.riskFreeRate).toBe(0.04);
            const explicit = normalizeConfig({
                symbol: 'X',
                scenarios: [],
                model: { preferences: { riskFreeRate: 0.03 } },
            });
            expect(explicit.model.preferences.riskFreeRate).toBe(0.03);
        });
    });

    describe('fetchText', () => {
        it('fetches text successfully', async () => {
            // Arrange
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('markdown content'),
            });
            const module = await import('@pages/analysis/lab.js');
            const { fetchText } = module.__analysisLabTesting;

            // Act
            const text = await fetchText('../docs/thesis/TEST.md');

            // Assert
            expect(text).toBe('markdown content');
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/docs/thesis/TEST.md'),
                { cache: 'no-store' }
            );
        });

        it('throws error when fetch fails', async () => {
            // Arrange
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
            });
            const module = await import('@pages/analysis/lab.js');
            const { fetchText } = module.__analysisLabTesting;

            // Act & Assert
            await expect(fetchText('../docs/thesis/TEST.md')).rejects.toThrow(
                'Failed to load ../docs/thesis/TEST.md'
            );
        });
    });

    describe('extractScenarioTitles and stripWrappingQuotes', () => {
        let extractScenarioTitles;

        beforeEach(async () => {
            const module = await import('@pages/analysis/lab.js');
            extractScenarioTitles = module.__analysisLabTesting.extractScenarioTitles;
        });

        it('extracts scenario titles from thesis markdown headings', () => {
            const markdown = `
### 4.2 Bull Case – “Hypergrowth Bonus”
### 4.3 Base Case – 'Steady State'
### 4.4 Bear Case – Collapse
`;
            const titles = extractScenarioTitles(markdown);
            expect(titles).toEqual({
                bull: 'Hypergrowth Bonus',
                base: 'Steady State',
                bear: 'Collapse',
            });
        });

        it('strips standard and smart quotes correctly', () => {
            const markdown = `
### Bull Case - "Double Quotes"
### Base Case - 'Single Quotes'
### Bear Case - “Smart Double Quotes”
`;
            const titles = extractScenarioTitles(markdown);
            expect(titles).toEqual({
                bull: 'Double Quotes',
                base: 'Single Quotes',
                bear: 'Smart Double Quotes',
            });
        });

        it('strips smart single quotes correctly', () => {
            const markdown = '### Bull Case - ‘Smart Single Quotes’';
            const titles = extractScenarioTitles(markdown);
            expect(titles).toEqual({ bull: 'Smart Single Quotes' });
        });

        it('leaves mismatched or missing quotes untouched', () => {
            const markdown = `
### Bull Case - "Mismatched'
### Base Case - No Quotes
### Bear Case - "
`;
            const titles = extractScenarioTitles(markdown);
            expect(titles).toEqual({
                bull: '"Mismatched\'',
                base: 'No Quotes',
                bear: '"',
            });
        });

        it('returns null for empty, missing, or malformed strings', () => {
            expect(extractScenarioTitles('')).toBeNull();
            expect(extractScenarioTitles(null)).toBeNull();
            expect(extractScenarioTitles('### Just Some Heading')).toBeNull();
        });
    });

    describe('renderBayesOutput security', () => {
        it('safely renders scenario names without executing HTML (DOM XSS prevention)', async () => {
            const { module } = await setupPane();
            const { renderBayesOutput, state } = module.__analysisLabTesting;

            // Mock bayesEngine with malicious data
            state.bayesEngine = {
                priors: [
                    {
                        name: '<img src=x onerror=alert(1)> Malicious Name',
                        prob: 0.5,
                    },
                ],
            };

            const bayesOutput = document.getElementById('bayesOutput');
            bayesOutput.innerHTML = ''; // Ensure clear

            // Render
            renderBayesOutput();

            // Verify
            // The HTML string representation of the output should escape or encode the tags,
            // or the DOM should not contain actual <img> elements.
            const imgElements = bayesOutput.querySelectorAll('img');
            expect(imgElements.length).toBe(0);
            expect(bayesOutput.textContent).toContain(
                '<img src=x onerror=alert(1)> Malicious Name'
            );
        });
    });

    describe('normalizeConfig', () => {
        it('normalizes a basic raw config correctly', async () => {
            const module = await import('@pages/analysis/lab.js');
            const { normalizeConfig } = module.__analysisLabTesting;
            const raw = {
                symbol: 'TEST',
                market: { price: '100', eps: '5' },
                scenarios: [],
            };
            const result = normalizeConfig(raw);
            expect(result.symbol).toBe('TEST');
            expect(result.market.price).toBe(100);
            expect(result.market.eps).toBe(5);
            expect(result.marketValue).toBe(0);
        });

        it('uses holdingDetails for fallback and calculates marketValue', async () => {
            const module = await import('@pages/analysis/lab.js');
            const { normalizeConfig } = module.__analysisLabTesting;
            const raw = {
                symbol: 'TEST',
                market: { price: 50 },
                scenarios: [],
            };
            const holdingDetails = { shares: 10 };
            const result = normalizeConfig(raw, holdingDetails);
            expect(result.position.shares).toBe(10);
            expect(result.marketValue).toBe(500);
        });
    });

    describe('buildPortfolioConfig', () => {
        it('returns null for empty configs or zero total value', async () => {
            const module = await import('@pages/analysis/lab.js');
            const { buildPortfolioConfig } = module.__analysisLabTesting;
            expect(buildPortfolioConfig([])).toBeNull();

            const zeroValueConfig = { marketValue: 0, weight: 0, scenarios: [] };
            expect(buildPortfolioConfig([zeroValueConfig])).toBeNull();
        });

        it('builds portfolio config correctly for valid inputs', async () => {
            const module = await import('@pages/analysis/lab.js');
            const { buildPortfolioConfig } = module.__analysisLabTesting;

            const cfg1 = {
                marketValue: 1000,
                weight: 0.5,
                scenarios: [],
                model: {
                    preferences: { targetCagr: 0.1, kellyScale: 0.5, benchmark: { value: 100 } },
                },
                risk: { volatility: 0.2 },
                market: { price: 100 },
                position: { shares: 10 },
                metrics: { outcomes: [{ id: 'base', name: 'Base', prob: 0.5, earningsCagr: 0.1 }] },
            };

            const cfg2 = {
                marketValue: 1000,
                weight: 0.5,
                scenarios: [],
                model: {
                    preferences: { targetCagr: 0.15, kellyScale: 1.0, benchmark: { value: 150 } },
                },
                risk: { volatility: 0.4 },
                market: { price: 50 },
                position: { shares: 20 },
                metrics: { outcomes: [{ id: 'base', name: 'Base', prob: 0.5, earningsCagr: 0.2 }] },
            };

            const portfolio = buildPortfolioConfig([cfg1, cfg2]);
            expect(portfolio.symbol).toBe('PORT');
            expect(portfolio.marketValue).toBe(2000);
            expect(portfolio.model.preferences.targetCagr).toBeCloseTo(0.125);
            expect(portfolio.model.preferences.kellyScale).toBeCloseTo(0.75);
        });
    });

    describe('applyThesisScenarioTitles and config logic', () => {
        it('tests getSharesOutstanding branches', async () => {
            const module = await import('@pages/analysis/lab.js');
            const { getSharesOutstanding } = module.__analysisLabTesting;

            expect(getSharesOutstanding({ market: { basicShares: 100 } })).toBe(100);
            expect(getSharesOutstanding({ market: { marketCap: 1000, price: 10 } })).toBe(100);
            expect(getSharesOutstanding({ market: { marketCap: -1000, price: 10 } })).toBeNull();
            expect(getSharesOutstanding({})).toBeNull();
        });
    });

    describe('initAnalysisPane', () => {
        it('renders pane-local error text when initialization fails', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));

            const { container } = await setupPane(true);

            expect(container.textContent).toContain('Network failure');
        });

        it('renders the empty state when no tickers are available', async () => {
            global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

            const { container } = await setupPane(true);

            expect(container.textContent).toContain('No tickers loaded');
        });

        it('does not construct the Monte Carlo worker at init time', async () => {
            let workerConstructed = false;
            global.Worker = class {
                constructor() {
                    workerConstructed = true;
                }
                postMessage() {}
            };

            const { module } = await setupPane();

            expect(workerConstructed).toBe(false);
            expect(module.__analysisLabTesting.state.monteCarloWorker).toBeNull();
        });
    });

    describe('normalizeConfig internal functions edge cases', () => {
        it('normalizes legacy manual overrides', async () => {
            const module = await import('@pages/analysis/lab.js');
            const { normalizeConfig } = module.__analysisLabTesting;

            const raw = {
                symbol: 'TEST',
                market: { price: 100 },
                scenarios: [],
                manual: {
                    horizon: 10,
                    kellyScale: 0.2,
                    targetCagr: 0.15,
                    benchmark: 5,
                    price: 150,
                    eps: 10,
                    volatility: 'invalid',
                    shares: 'invalid',
                },
                position: { shares: 50 },
                model: {
                    version: '2.0.0',
                    engine: { type: 'fermat-pascal-kelly' },
                    preferences: {
                        overrides: {
                            price: undefined,
                            eps: 20,
                        },
                    },
                },
            };

            const result = normalizeConfig(raw);
            expect(result.model.preferences.horizon).toBe(10);
            expect(result.model.preferences.kellyScale).toBe(0.2);
            expect(result.model.preferences.targetCagr).toBe(0.15);
            expect(result.model.preferences.overrides.price).toBe(150);
            expect(result.model.preferences.overrides.eps).toBe(20);
            expect(result.model.preferences.overrides.volatility).toBeUndefined();
            expect(result.position.shares).toBe(50);
        });

        it('falls back to raw shares if holding details and legacy manual shares are missing', async () => {
            const module = await import('@pages/analysis/lab.js');
            const { normalizeConfig } = module.__analysisLabTesting;

            const raw = {
                symbol: 'TEST',
                shares: 100,
                scenarios: [],
                position: {},
            };

            const result = normalizeConfig(raw);
            expect(result.position.shares).toBe(100);
        });

        it('handles null models in normalizeConfig', async () => {
            const module = await import('@pages/analysis/lab.js');
            const { normalizeConfig } = module.__analysisLabTesting;

            const raw = {
                symbol: 'TEST',
                model: null,
                scenarios: [],
            };

            const result = normalizeConfig(raw);
            expect(result.model.version).toBe('1.0.0');
            expect(result.model.preferences.horizon).toBe(5);
        });
    });
});
