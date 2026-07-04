global.Worker = class {
    constructor(stringUrl) {
        this.url = stringUrl;
        this.onmessage = () => {};
    }
    postMessage(msg) {
        this.onmessage(msg);
    }
};

const FLAG = '__SKIP_ANALYSIS_AUTO_INIT__';
global[FLAG] = true;

// Mock the DOM elements expected by lab.js
document.body.innerHTML = `
    <button id="btnBayesBull"></button>
    <button id="btnBayesNeutral"></button>
    <button id="btnBayesBear"></button>
    <button id="btnBayesReset"></button>
    <button id="btnRunMonteCarlo"></button>
`;

const { __analysisLabTesting } = require('../../../../js/pages/analysis/lab.js');

describe('lab.js specific coverage', () => {
    describe('normalizeConfig additional branch coverage', () => {
        it('normalizes risk volatility if not finite', () => {
            const raw = {
                symbol: 'TEST',
                risk: { volatility: 'invalid' },
                scenarios: [],
            };
            const result = __analysisLabTesting.normalizeConfig(raw);
            expect(result.risk.volatility).toBeUndefined();
        });

        it('normalizes number override values and skips invalid ones', () => {
            const raw = {
                symbol: 'TEST',
                scenarios: [],
                manual: { price: '100', eps: 'invalid', volatility: null },
            };
            const result = __analysisLabTesting.normalizeConfig(raw);
            expect(result.model.preferences.overrides.price).toBe(100);
            expect(result.model.preferences.overrides.eps).toBeUndefined();
            expect(result.model.preferences.overrides.volatility).toBeUndefined();
        });

        it('assigns overrides when legacy values are not defined', () => {
            const raw = {
                symbol: 'TEST',
                scenarios: [],
                model: {
                    preferences: {
                        overrides: { price: 200, eps: 10, volatility: 0.25 },
                    },
                },
            };
            const result = __analysisLabTesting.normalizeConfig(raw);
            expect(result.model.preferences.overrides.price).toBe(200);
            expect(result.model.preferences.overrides.eps).toBe(10);
            expect(result.model.preferences.overrides.volatility).toBe(0.25);
        });

        it('assigns overrides and skips if not finite', () => {
            const raw = {
                symbol: 'TEST',
                scenarios: [],
                model: {
                    preferences: {
                        overrides: { price: 'invalid', eps: 'foo' },
                    },
                },
            };
            const result = __analysisLabTesting.normalizeConfig(raw);
            expect(result.model.preferences.overrides.price).toBeUndefined();
            expect(result.model.preferences.overrides.eps).toBeUndefined();
        });
    });

    describe('buildPortfolioConfig additional branch coverage', () => {
        it('handles when Kelly scale is missing from preferences', () => {
            const cfg1 = {
                marketValue: 1000,
                weight: 1,
                scenarios: [],
                model: {
                    preferences: { targetCagr: 0.1, benchmark: { value: 100 } }, // No kellyScale
                },
                risk: { volatility: 0.2 },
                market: { price: 100 },
                position: { shares: 10 },
                metrics: { outcomes: [{ id: 'base', name: 'Base', prob: 0.5, earningsCagr: 0.1 }] },
            };

            const portfolio = __analysisLabTesting.buildPortfolioConfig([cfg1]);
            // It should fallback to 0.5 for missing kellyScale
            expect(portfolio.model.preferences.kellyScale).toBeCloseTo(0.5);
        });

        it('calculates total volatility properly for multiple configs', () => {
            const cfg1 = {
                marketValue: 1000,
                weight: 0.6,
                scenarios: [],
                model: { preferences: { benchmark: { value: 100 } } },
                risk: { volatility: 0.2 },
                market: { price: 100 },
                position: { shares: 10 },
                metrics: { outcomes: [] },
            };
            const cfg2 = {
                marketValue: 1000,
                weight: 0.4,
                scenarios: [],
                model: { preferences: { benchmark: { value: 100 } } },
                risk: { volatility: 0.4 },
                market: { price: 100 },
                position: { shares: 10 },
                metrics: { outcomes: [] },
            };

            const portfolio = __analysisLabTesting.buildPortfolioConfig([cfg1, cfg2]);
            // volSum = (0.6^2 * 0.2^2) + (0.4^2 * 0.4^2) = (0.36 * 0.04) + (0.16 * 0.16) = 0.0144 + 0.0256 = 0.04
            // sqrt(0.04) = 0.2
            expect(portfolio.risk.volatility).toBeCloseTo(0.2);
        });
    });
});

describe('aggregateScenarios additional branch coverage', () => {
    it('handles missing or zero holding weight', () => {
        const configs = [
            {
                weight: 0,
                metrics: {
                    outcomes: [
                        { id: 'base', name: 'Base', multiple: 1.4, prob: 0.4, earningsCagr: 0.1 },
                    ],
                },
            },
            {
                weight: 1,
                metrics: {
                    outcomes: [
                        { id: 'base', name: 'Base', multiple: 2.0, prob: 0.3, earningsCagr: 0.25 },
                    ],
                },
            },
        ];
        const scenarios = __analysisLabTesting.aggregateScenarios(configs, 4);
        const baseScenario = scenarios.find((scenario) => scenario.id === 'base');

        // Only the second config should be counted
        expect(baseScenario.precomputedMultiple).toBeCloseTo(2.0);
    });

    it('handles missing outcome IDs and computes price CAGR appropriately', () => {
        const configs = [
            {
                weight: 1,
                metrics: {
                    outcomes: [
                        { name: 'Unknown', multiple: 1.5, prob: 1.0 }, // No id, No earningsCagr
                    ],
                },
            },
        ];

        const scenarios = __analysisLabTesting.aggregateScenarios(configs, 2);
        expect(scenarios[0].id).toBe('Unknown');
        expect(scenarios[0].precomputedEarningsCagr).toBeNull();
        expect(scenarios[0].precomputedCagr).toBeCloseTo(Math.pow(1.5, 0.5) - 1);
    });

    it('handles zero horizon', () => {
        const configs = [
            {
                weight: 1,
                metrics: {
                    outcomes: [{ id: 'base', name: 'Base', multiple: 1.5, prob: 1.0 }],
                },
            },
        ];

        const scenarios = __analysisLabTesting.aggregateScenarios(configs, 0);
        expect(scenarios[0].precomputedCagr).toBe(0);
    });
});

describe('getSharesOutstanding additional coverage', () => {
    let getSharesOutstanding;
    beforeAll(async () => {
        global.FLAG = true;
        const module = await import('@pages/analysis/lab.js');
        getSharesOutstanding = module.__analysisLabTesting.getSharesOutstanding;
    });

    it('returns direct shares if provided', () => {
        const config = { market: { sharesOutstanding: 500 } };
        expect(getSharesOutstanding(config)).toBe(500);
    });

    it('derives from market cap if direct not provided', () => {
        const config = { market: { marketCap: 1000, price: 10 } };
        expect(getSharesOutstanding(config)).toBe(100);
    });
});
