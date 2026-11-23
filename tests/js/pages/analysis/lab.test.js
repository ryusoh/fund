import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());

function loadAnalysisJson(fileName) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'analysis', fileName), 'utf-8'));
}

const mockCtx = {
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    closePath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    fillRect: jest.fn(),
    setLineDash: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn((t) => ({ width: String(t).length * 6 })),
};

describe('analysis lab 2-view controller (WO5)', () => {
    let lab;
    let mockFetchRealTimeData;
    let mockWhenReady;
    let mockSelectedCurrency;

    async function setupLab({ realTimeData = null, hostname = 'localhost' } = {}) {
        jest.resetModules();
        mockSelectedCurrency = 'USD';
        mockFetchRealTimeData = jest.fn(async () => realTimeData);
        mockWhenReady = jest.fn(async () => {});

        jest.doMock('../../../../js/transactions/realtimeData.js', () => ({
            fetchRealTimeData: mockFetchRealTimeData,
        }));
        jest.doMock('../../../../js/transactions/state.js', () => ({
            getSelectedCurrency: () => mockSelectedCurrency,
            whenTransactionDataReady: mockWhenReady,
        }));
        jest.doMock('../../../../js/transactions/utils.js', () => ({
            convertValueToCurrency: (v) => (mockSelectedCurrency === 'CNY' ? v * 7 : v),
            formatCurrency: (v) =>
                mockSelectedCurrency === 'CNY'
                    ? `¥${Number(v).toFixed(2)}`
                    : `$${Number(v).toFixed(2)}`,
            formatCurrencyCompact: (v) =>
                mockSelectedCurrency === 'CNY'
                    ? `¥${Math.round(v)}`
                    : v >= 1000
                      ? `$${(v / 1000).toFixed(1)}k`
                      : `$${Math.round(v)}`,
        }));
        jest.doMock('../../../../js/utils/host.js', () => ({
            isLocalhost: () => hostname === 'localhost' || hostname === '127.0.0.1',
        }));

        const indexPayload = loadAnalysisJson('index.json');
        const holdingsPayload = JSON.parse(
            fs.readFileSync(path.join(ROOT, 'data', 'holdings_details.json'), 'utf-8')
        );
        const flagsPayload = loadAnalysisJson('event_flags.json');

        global.fetch = jest.fn(async (urlStr) => {
            const url = String(urlStr);
            if (url.includes('index.json')) {
                return { ok: true, json: async () => indexPayload };
            }
            if (url.includes('holdings_details.json')) {
                return { ok: true, json: async () => holdingsPayload };
            }
            if (url.includes('event_flags.json')) {
                return { ok: true, json: async () => flagsPayload };
            }
            for (const entry of indexPayload.tickers) {
                const sym = entry.symbol;
                if (url.includes(`${sym}.history.json`)) {
                    return { ok: true, json: async () => loadAnalysisJson(`${sym}.history.json`) };
                }
                if (url.includes(`${sym}.json`)) {
                    return { ok: true, json: async () => loadAnalysisJson(`${sym}.json`) };
                }
            }
            return { ok: false, status: 404 };
        });

        HTMLCanvasElement.prototype.getContext = jest.fn(() => mockCtx);
        HTMLCanvasElement.prototype.getBoundingClientRect = jest.fn(() => ({
            left: 0,
            top: 0,
            width: 672,
            height: 192,
        }));

        document.body.innerHTML = '<section id="analysisSection" class="analysis-pane"></section>';
        lab = await import('../../../../js/pages/analysis/lab.js');
        const root = document.getElementById('analysisSection');
        await lab.initAnalysisPane(root, { autoLoad: true });
        return { lab, root };
    }

    afterEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    it('renders sorted 6-row Decision Board + residual target cash footer and returns null active config on board', async () => {
        const { root } = await setupLab();
        expect(lab.getActiveAnalysisConfig()).toBeNull();
        expect(lab.getAnalysisSymbols()).toEqual(['AEHR', 'ANET', 'CBRS', 'GOOG', 'PDD', 'VT']);

        const rows = Array.from(root.querySelectorAll('.decision-board .board-row')).slice(1);
        expect(rows).toHaveLength(6);
        const symbolsInOrder = rows.map((r) => r.querySelector('.board-ticker').textContent);
        expect(symbolsInOrder[0]).toBe('CBRS');

        const footerText = root.querySelector('#boardBudgetFooter').textContent;
        expect(footerText).toContain('Residual Target Cash');
        expect(footerText).toContain('not actual cash');
        expect(footerText).toContain('THESIS PROB UNMIGRATED');
        expect(footerText).toContain('FLAGS STALE');
    });

    it('switches to 3-layer ticker Decision Chart and supports 2y/full horizon switching', async () => {
        const { root } = await setupLab();
        const snap2y = lab.showTickerDecision('goog', { horizonMode: '2y' });
        expect(snap2y.symbol).toBe('GOOG');
        expect(snap2y.text).toContain('Mean ');
        expect(lab.getActiveAnalysisConfig().symbol).toBe('GOOG');

        const boardSection = root.querySelector('[data-analysis-section="board"]');
        const tickerSection = root.querySelector('[data-analysis-section="ticker"]');
        expect(boardSection.classList.contains('is-hidden')).toBe(true);
        expect(tickerSection.classList.contains('is-hidden')).toBe(false);

        expect(root.querySelector('#verdictStrip').textContent).toContain('GOOG · Alphabet');
        expect(root.querySelector('#sizingBullet').textContent).toContain('SIZE');
        expect(root.querySelector('#riskFooter').textContent).toContain('Rev 2026-11-30');
        expect(root.querySelector('#paneContext').textContent).toContain('2Y ·');

        lab.showTickerDecision('GOOG', { horizonMode: 'full' });
        expect(root.querySelector('#paneContext').textContent).toContain('FULL 10Y');

        expect(lab.showTickerDecision('UNKNOWN')).toBeNull();
        const boardSnap = lab.showDecisionBoard();
        expect(boardSnap.rows).toHaveLength(6);
        expect(lab.getActiveAnalysisConfig()).toBeNull();
    });

    it('uses normalized composition fractions and divides USD tickerWeights by balance instead of using raw USD values', async () => {
        await setupLab({
            hostname: 'fund.example.com',
            realTimeData: {
                date: '2026-11-23',
                balance: 1_000_000,
                composition: [{ ticker: 'GOOG', value: 250_000, percent: 25 }],
                // Deliberately omit ANET from composition to test tickerWeights / balance fallback
                tickerWeights: {
                    GOOG: 250_000,
                    ANET: 300_000,
                    PDD: 200_000,
                    VT: 250_000,
                },
                prices: {
                    GOOG: 280.0,
                    ANET: 175.0,
                    PDD: 88.0,
                    VT: 146.0,
                },
            },
        });

        const configs = lab.__analysisLabTesting.state.configs;
        const goog = configs.find((c) => c.symbol === 'GOOG');
        const anet = configs.find((c) => c.symbol === 'ANET');
        expect(goog.weight).toBeCloseTo(0.25, 6);
        // Must be 300_000 / 1_000_000 = 0.30, NEVER raw 300_000!
        expect(anet.weight).toBeCloseTo(0.3, 6);
        expect(anet.market.price).toBe(175.0);
        expect(anet.priceSource).toBe('realtime_feed');
    });

    it('falls back to holdings_details weights and distinguishes localhost static_fund_data', async () => {
        await setupLab({
            hostname: 'localhost',
            realTimeData: {
                date: '2026-11-23',
                balance: 1_000_000,
                composition: [],
                tickerWeights: {},
                prices: { GOOG: 270.0 },
            },
        });
        const goog = lab.__analysisLabTesting.state.configs.find((c) => c.symbol === 'GOOG');
        expect(goog.priceSource).toBe('static_fund_data');
        expect(goog.weight).toBeGreaterThan(0);
        expect(goog.weight).toBeLessThan(1);
    });

    it('gates currencyChangedGlobal re-rendering on whenTransactionDataReady and updates both views', async () => {
        const { root } = await setupLab();
        lab.showTickerDecision('GOOG');
        mockSelectedCurrency = 'CNY';

        document.dispatchEvent(
            new CustomEvent('currencyChangedGlobal', { detail: { currency: 'CNY' } })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(mockWhenReady).toHaveBeenCalled();
        expect(root.querySelector('#verdictStrip').textContent).toContain('¥');
    });

    it('guards normalizeConfig against null values and reports checkPaneViewportFit overflow', async () => {
        const { root } = await setupLab();
        const { normalizeConfig, checkPaneViewportFit, computeMetrics } = lab.__analysisLabTesting;

        const norm = normalizeConfig({
            symbol: 'X',
            market: { price: 100, eps: -2, pe: null, dividendYield: 1.5 },
            risk: { volatility: null },
            scenarios: [
                {
                    id: 'base',
                    name: 'Base',
                    prob: 1,
                    growth: { epsCagr: 0.1 },
                    valuation: { exitPe: 20 },
                },
            ],
        });
        expect(norm.market.pe).toBeNull();
        expect(norm.risk.volatility).toBeNull();
        expect(computeMetrics(norm).expectedMultiple).toBeNull();

        const stage = root.querySelector('.analysis-stage');
        Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 300 });
        Object.defineProperty(stage, 'scrollHeight', { configurable: true, value: 300 });
        expect(checkPaneViewportFit()).toEqual({ section: 'board', overflow: 0 });

        Object.defineProperty(stage, 'scrollHeight', { configurable: true, value: 340 });
        expect(checkPaneViewportFit()).toEqual({ section: 'board', overflow: 40 });
    });
});
