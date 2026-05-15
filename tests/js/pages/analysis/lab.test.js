describe('analysis lab data loading', () => {
    const ORIGINAL_FETCH = global.fetch;
    const FLAG = '__SKIP_ANALYSIS_AUTO_INIT__';

    beforeEach(() => {
        jest.resetModules();
        delete global[FLAG];
        global.fetch = ORIGINAL_FETCH;
        global.Worker = class {
            constructor(stringUrl) {
                this.url = stringUrl;
                this.onmessage = () => {};
            }
            postMessage() {}
            terminate() {}
        };

        // Mock DOM elements required by lab.js
        document.body.innerHTML = `
            <div id="tickerList"></div>
            <div id="summaryStats"></div>
            <div id="scenarioResults"></div>
            <div id="valueBands"></div>
            <button id="btnBayesBull"></button>
            <button id="btnBayesBear"></button>
            <button id="btnBayesReset"></button>
            <div id="bayesOutput"></div>
            <button id="btnRunMonteCarlo"></button>
            <canvas id="monteCarloCanvas"></canvas>
            <div id="riskMetrics"></div>
        `;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
        delete global[FLAG];
        global.fetch = ORIGINAL_FETCH;
        delete global.Worker;
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

    describe('extractScenarioTitles and stripWrappingQuotes', () => {
        let extractScenarioTitles;

        beforeEach(async () => {
            global[FLAG] = true;
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
            global[FLAG] = true;
            const module = await import('@pages/analysis/lab.js');
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
});
