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
            if (u.includes('AAPL.evidence.jsonl')) {
                return Promise.resolve({
                    ok: true,
                    text: async () =>
                        '{"date": "2026-01-15", "claim": "FY print", "metric": "epsCagr", "observed": 0.2, "noise": 0.05}',
                });
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

        // Evidence posterior applied at load: prior epsCagr 0 with fallback
        // sigma 0.175 (default vol 0.35 x 0.5), observation 0.2 +/- 0.05.
        // postVar = 1/(1/0.030625 + 1/0.0025) = 0.002311 -> mean 0.1849
        const aaplConfig = lab.__analysisLabTesting.state.configs.find(
            (cfg) => cfg.symbol === 'AAPL'
        );
        expect(aaplConfig.scenarios[0].growth.epsCagr).toBeCloseTo(0.1849, 3);

        // Test the empty configs scenario by clearing state and re-rendering
        lab.__analysisLabTesting.state.configs = [];
        lab.__analysisLabTesting.renderContextStrip();
        expect(document.getElementById('paneContext').textContent).toContain('No tickers loaded');
    });

    it('marks the active symbol and shows the function/as-of meta in the strip', async () => {
        const mockIndex = { tickers: [{ symbol: 'AAPL', path: 'aapl.json' }] };
        const mockHoldings = { AAPL: { shares: 10 } };
        const mockAapl = {
            symbol: 'AAPL',
            name: 'Apple',
            market: { price: 150 },
            meta: { asOf: '2026-10-01T00:00:00Z' },
            scenarios: [{ id: 'base', prob: 1, multiple: 2 }],
        };
        const fetchMock = jest.fn((url) => {
            const u = url.toString();
            if (u.includes('index.json')) {
                return Promise.resolve({ ok: true, json: async () => mockIndex });
            }
            if (u.includes('holdings_details.json')) {
                return Promise.resolve({ ok: true, json: async () => mockHoldings });
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

        const active = document.querySelector('.context-symbol.active');
        expect(active).not.toBeNull();
        expect(active.getAttribute('aria-current')).toBe('true');
        expect(document.querySelectorAll('.context-symbol[aria-current="true"]').length).toBe(1);

        lab.setActiveAnalysisSymbol('AAPL');
        const meta = document.getElementById('contextMeta');
        expect(meta.textContent).toContain('OVERVIEW');
        expect(meta.textContent).toContain('2026-10-01');

        lab.showAnalysisSection('kelly');
        expect(meta.textContent).toContain('KELLY');
    });

    it('restores the overview landing screen with scenario rows and value bands', async () => {
        const mockIndex = { tickers: [{ symbol: 'AAPL', path: 'aapl.json' }] };
        const mockHoldings = { AAPL: { shares: 10 } };
        const mockAapl = {
            symbol: 'AAPL',
            name: 'Apple',
            market: { price: 150 },
            scenarios: [
                { id: 'bear', name: 'Bear Case', prob: 0.2, multiple: 0.6 },
                { id: 'bull', name: 'Bull Case', prob: 0.55, multiple: 2.1 },
                { id: 'base', name: 'Base Case', prob: 0.35, multiple: 1.2 },
            ],
        };
        const fetchMock = jest.fn((url) => {
            const u = url.toString();
            if (u.includes('index.json')) {
                return Promise.resolve({ ok: true, json: async () => mockIndex });
            }
            if (u.includes('holdings_details.json')) {
                return Promise.resolve({ ok: true, json: async () => mockHoldings });
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
        lab.setActiveAnalysisSymbol('AAPL');

        const rows = document.querySelectorAll('#overviewScenarios .overview-scenario-row');
        expect(rows.length).toBe(3);
        // Rows are ordered by probability desc: bull 55, base 35, bear 20.
        expect(rows[0].querySelector('.overview-scenario-name').textContent).toBe('Bull Case');
        expect(rows[2].querySelector('.overview-scenario-name').textContent).toBe('Bear Case');

        const vals = rows[0].querySelectorAll('.overview-scenario-vals span');
        expect(vals.length).toBe(3);
        expect(vals[0].textContent).toBe('55.0%');
        expect(vals[1].textContent).toBe('2.10x');

        expect(document.querySelectorAll('#overviewValueBands dt').length).toBe(4);
        expect(document.querySelectorAll('#overviewValueBands dd').length).toBe(4);
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

        // Superseded entries carry a text tag, not just a style (G14)
        const tag = entries[1].querySelector('.timeline-superseded-tag');
        expect(tag).not.toBeNull();
        expect(tag.textContent).toBe('SUPERSEDED');
        expect(entries[0].querySelector('.timeline-superseded-tag')).toBeNull();

        // Header count badge is class-driven (G12)
        expect(header.querySelector('.timeline-count-badge')).not.toBeNull();
    });

    it('renders a distinct error state when the evidence fetch fails', async () => {
        const fetchMock = jest.fn(() => Promise.resolve({ ok: false }));
        const { lab } = await setupPane(fetchMock, { autoLoad: false });
        const { renderEvidenceTimeline, state } = lab.__analysisLabTesting;

        state.evidenceCache.delete('ANET');
        const config = { symbol: 'ANET', scenarios: [{ id: 'bull', name: 'Bull', prob: 1 }] };

        await renderEvidenceTimeline(config);

        const timeline = document.getElementById('evidenceTimeline');
        const errorEl = timeline.querySelector('.pane-empty--error');
        expect(errorEl).not.toBeNull();
        expect(errorEl.textContent).toContain('Evidence log unavailable (fetch failed).');
    });

    it('renders a class-based error state when pane init fails', async () => {
        const fetchMock = jest.fn(() => Promise.reject(new Error('network down')));
        await setupPane(fetchMock);

        const errEl = document.querySelector('#summaryStats .pane-empty--error');
        expect(errEl).not.toBeNull();
        expect(errEl.textContent).toContain('Error: network down');
    });
});
