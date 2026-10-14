describe('analysis lab pane rendering', () => {
    let originalFetch, originalGetContext;

    beforeAll(() => {
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
        global.fetch = originalFetch;
        HTMLCanvasElement.prototype.getContext = originalGetContext;
        delete global.Worker;
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        jest.resetModules();
    });

    async function setupPane(fetchMock, { autoLoad = true } = {}) {
        global.fetch = fetchMock;
        const lab = await import('@pages/analysis/lab.js');
        const container = document.createElement('div');
        document.body.appendChild(container);
        await lab.initAnalysisPane(container, { autoLoad });
        return { lab, container };
    }

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

        const fetchMock = jest.fn((url) => {
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

        const { lab } = await setupPane(fetchMock);

        const contextStrip = document.getElementById('paneContext');
        expect(contextStrip.children.length).toBeGreaterThan(0);

        const contextSymbols = document.querySelectorAll('.context-symbol');
        expect(contextSymbols.length).toBeGreaterThan(1);
        // The strip is read-only — no buttons inside the pane.
        expect(contextStrip.querySelectorAll('button').length).toBe(0);

        lab.setActiveAnalysisSymbol('PORT');
        let summaryStats = document.getElementById('summaryStats');
        expect(summaryStats.textContent).toContain('Price');
        expect(summaryStats.textContent).toContain('Geo CAGR');

        lab.setActiveAnalysisSymbol('AAPL');
        summaryStats = document.getElementById('summaryStats');
        expect(summaryStats.textContent).toContain('Price');
        expect(summaryStats.textContent).toContain('Geo CAGR');

        // Test the empty configs scenario by clearing state and re-rendering
        lab.__analysisLabTesting.state.configs = [];
        lab.__analysisLabTesting.renderContextStrip();
        expect(document.getElementById('paneContext').textContent).toContain('No tickers loaded');
    });

    it('handles empty configs and shows the context-strip warning', async () => {
        const mockIndex = {
            tickers: [],
        };
        const mockHoldings = {};

        const fetchMock = jest.fn((url) => {
            const u = url.toString();
            if (u.includes('index.json')) {
                return Promise.resolve({ ok: true, json: async () => mockIndex });
            }
            if (u.includes('holdings_details.json')) {
                return Promise.resolve({ ok: true, json: async () => mockHoldings });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        await setupPane(fetchMock);

        expect(document.getElementById('paneContext').textContent).toContain('No tickers loaded');
    });

    it('renders evidence timeline marking superseded entries and displaying valid/superseded count', async () => {
        const { lab } = await setupPane(jest.fn(), { autoLoad: false });
        const { renderEvidenceTimeline, state } = lab.__analysisLabTesting;

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
