const domSetup = `
    <div id="tickerList"></div>
    <div id="summaryStats"></div>
    <div id="scenarioResults"></div>
    <div id="valueBands"></div>
    <div id="bayesOutput"></div>
    <button id="btnBayesBull"></button>
    <button id="btnBayesBear"></button>
    <button id="btnBayesReset"></button>
    <button id="btnRunMonteCarlo"></button>
    <div id="riskMetrics"></div>
    <canvas id="monteCarloCanvas"></canvas>
    <div class="block-header" id="evidenceTimelineHeader"><h4>Verified Evidence Log (.jsonl)</h4></div>
    <div id="evidenceTimeline"></div>
`;

describe('DOM render coverage explicitly testing internal render functions', () => {
    let originalSkip, originalWorker, originalFetch, originalGetContext;

    beforeAll(() => {
        originalSkip = global.__SKIP_ANALYSIS_AUTO_INIT__;
        originalWorker = global.Worker;
        originalFetch = global.fetch;
        originalGetContext = HTMLCanvasElement.prototype.getContext;

        global.Worker = class {
            constructor() {}
            postMessage() {}
        };
        const mockCtx = {
            clearRect: jest.fn(),
            fillRect: jest.fn(),
        };
        HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCtx);
    });

    afterAll(() => {
        global.__SKIP_ANALYSIS_AUTO_INIT__ = originalSkip;
        global.Worker = originalWorker;
        global.fetch = originalFetch;
        HTMLCanvasElement.prototype.getContext = originalGetContext;
    });

    beforeEach(() => {
        document.body.innerHTML = domSetup;
        delete global.__SKIP_ANALYSIS_AUTO_INIT__;
        jest.resetModules();
    });

    it('covers DOM rendering branches unconditionally and asserts UI states', async () => {
        const mockIndex = {
            tickers: [
                { symbol: 'PORT', path: 'port.json' },
                { symbol: 'AAPL', path: 'aapl.json' },
            ],
        };
        const mockHoldings = {
            AAPL: { shares: 10 },
        };
        const mockPort = {
            symbol: 'PORT',
            name: 'Portfolio',
            market: { price: 1000 },
            scenarios: [],
        };
        const mockAapl = {
            symbol: 'AAPL',
            name: 'Apple',
            market: { price: 150 },
            scenarios: [{ id: 'base', prob: 1, multiple: 2, earningsCagr: 0.1, priceCagr: 0.1 }],
        };

        global.fetch = jest.fn((url) => {
            const u = url.toString();
            if (u.includes('index.json')) {
                return Promise.resolve({ ok: true, json: async () => mockIndex });
            }
            if (u.includes('holdings_details.json')) {
                return Promise.resolve({ ok: true, json: async () => mockHoldings });
            }
            if (u.includes('port.json')) {
                return Promise.resolve({ ok: true, json: async () => mockPort });
            }
            if (u.includes('aapl.json')) {
                return Promise.resolve({ ok: true, json: async () => mockAapl });
            }
            if (u.includes('.md')) {
                return Promise.resolve({ ok: true, text: async () => '' });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        const lab = require('../../../../js/pages/analysis/lab.js');

        await new Promise(process.nextTick);
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        const tickerList = document.getElementById('tickerList');
        expect(tickerList.children.length).toBeGreaterThan(0);

        const tickerBtns = document.querySelectorAll('.ticker-btn');
        expect(tickerBtns.length).toBeGreaterThan(1);

        tickerBtns[0].click();
        let summaryStats = document.getElementById('summaryStats');
        expect(summaryStats.textContent).toContain('Price');

        tickerBtns[1].click();
        summaryStats = document.getElementById('summaryStats');
        expect(summaryStats.textContent).toContain('Price');

        // Test the empty configs scenario by clearing state and clicking
        lab.__analysisLabTesting.state.configs = [];
        tickerBtns[0].click();
        expect(document.getElementById('tickerList').textContent).toContain('No tickers loaded');
    });

    it('handles empty tickerList and state configs correctly and asserts warning message', async () => {
        const mockIndex = {
            tickers: [],
        };
        const mockHoldings = {};

        global.fetch = jest.fn((url) => {
            const u = url.toString();
            if (u.includes('index.json')) {
                return Promise.resolve({ ok: true, json: async () => mockIndex });
            }
            if (u.includes('holdings_details.json')) {
                return Promise.resolve({ ok: true, json: async () => mockHoldings });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        require('../../../../js/pages/analysis/lab.js');

        await new Promise(process.nextTick);
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        expect(document.getElementById('tickerList').textContent).toContain('No tickers loaded');
    });

    it('handles summaryStats fallback rendering when replaceChildren is missing', async () => {
        const summaryStatsEl = document.getElementById('summaryStats');
        summaryStatsEl.replaceChildren = undefined;
        summaryStatsEl.appendChild = jest.fn();

        const mockIndex = { tickers: [{ symbol: 'PORT', path: 'port.json' }] };
        const mockPort = {
            symbol: 'PORT',
            name: 'Portfolio',
            market: { price: 1000 },
            scenarios: [],
        };

        global.fetch = jest.fn((url) => {
            const u = url.toString();
            if (u.includes('index.json')) {
                return Promise.resolve({ ok: true, json: async () => mockIndex });
            }
            if (u.includes('port.json')) {
                return Promise.resolve({ ok: true, json: async () => mockPort });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        require('../../../../js/pages/analysis/lab.js');

        await new Promise(process.nextTick);
        await new Promise(process.nextTick);
        await new Promise(process.nextTick);

        expect(summaryStatsEl.appendChild).toHaveBeenCalled();
        // Since replaceChildren is missing, the init fallback clears textContent then calls appendChild.
        expect(summaryStatsEl.textContent).toBe('');
    });

    it('renders evidence timeline marking superseded entries and displaying valid/superseded count', async () => {
        const { renderEvidenceTimeline, state } =
            require('../../../../js/pages/analysis/lab.js').__analysisLabTesting;

        const fakeEvidence = [
            {
                date: '2026-02-15',
                claim: 'Active valid observation',
                direction: 'bullish',
                strength: 0.7,
                valid_to: null,
            },
            {
                date: '2026-05-10',
                claim: 'Superseded historical fact',
                direction: 'bearish',
                strength: 0.6,
                valid_to: '2026-08-01',
            },
        ];

        state.evidenceCache.set('ANET', fakeEvidence);

        const config = {
            symbol: 'ANET',
            scenarios: [
                { id: 'bull', name: 'Bull Case', prob: 0.5 },
                { id: 'base', name: 'Base Case', prob: 0.5 },
            ],
        };

        await renderEvidenceTimeline(config);

        const timeline = document.getElementById('evidenceTimeline');
        const header = document.getElementById('evidenceTimelineHeader');

        // Check header count badge
        expect(header.textContent).toContain('1 valid / 1 superseded');

        // Check timeline entry classes
        const entries = timeline.querySelectorAll('.timeline-entry');
        expect(entries.length).toBe(2);
        expect(entries[0].classList.contains('superseded')).toBe(false);
        expect(entries[1].classList.contains('superseded')).toBe(true);
    });
});
