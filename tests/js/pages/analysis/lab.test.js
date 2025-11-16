describe('analysis lab data loading', () => {
    const ORIGINAL_FETCH = global.fetch;
    const FLAG = '__SKIP_ANALYSIS_AUTO_INIT__';

    beforeEach(() => {
        jest.resetModules();
        delete global[FLAG];
        global.fetch = ORIGINAL_FETCH;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
        delete global[FLAG];
        global.fetch = ORIGINAL_FETCH;
    });

    it('adds a cache-busting query param and disables caching for data fetches', async () => {
        const cacheBustValue = '1731900000000';
        jest.spyOn(Date, 'now').mockReturnValue(Number(cacheBustValue));
        const json = jest.fn().mockResolvedValue({ ok: true });
        const fetchMock = jest.fn().mockResolvedValue({ ok: true, json });
        global.fetch = fetchMock;
        global[FLAG] = true;

        const { fetchJson } = await import('@pages/analysis/lab.js');
        await fetchJson('../data/analysis/ANET.json');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [requestedUrl, options] = fetchMock.mock.calls[0];
        expect(requestedUrl).toContain(`?v=${cacheBustValue}`);
        expect(options).toEqual({ cache: 'no-store' });
        expect(json).toHaveBeenCalled();
    });

    it('prefers precomputed earnings CAGR data for aggregated scenarios', async () => {
        global[FLAG] = true;
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
        global[FLAG] = true;
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
});
