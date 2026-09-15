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
});
