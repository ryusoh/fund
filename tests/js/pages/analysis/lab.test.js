const FIXTURE_INDEX = {
    tickers: [
        {
            symbol: 'AEHR',
            name: 'Aehr Test Systems',
            path: '../data/analysis/AEHR.json',
            historyPath: '../data/analysis/AEHR.history.json',
        },
        {
            symbol: 'ANET',
            name: 'Arista Networks',
            path: '../data/analysis/ANET.json',
            historyPath: '../data/analysis/ANET.history.json',
        },
        {
            symbol: 'CBRS',
            name: 'Cerebras Systems',
            path: '../data/analysis/CBRS.json',
            historyPath: '../data/analysis/CBRS.history.json',
        },
        {
            symbol: 'GOOG',
            name: 'Alphabet',
            path: '../data/analysis/GOOG.json',
            historyPath: '../data/analysis/GOOG.history.json',
        },
        {
            symbol: 'PDD',
            name: 'Pinduoduo',
            path: '../data/analysis/PDD.json',
            historyPath: '../data/analysis/PDD.history.json',
        },
        {
            symbol: 'VT',
            name: 'Vanguard Total World Index Fund',
            path: '../data/analysis/VT.json',
            historyPath: '../data/analysis/VT.history.json',
        },
    ],
};

const FIXTURE_HOLDINGS = {
    VT: { shares: '2601.000', average_price: '95.650000' },
    ANET: { shares: '2418.3604', average_price: '62.500000' },
    GOOG: { shares: '943.303', average_price: '197.850000' },
    PDD: { shares: '3138.4802', average_price: '106.477936' },
};

const FIXTURE_FLAGS = {
    generatedAt: '2026-11-24T19:00:00.000Z',
    flags: [],
};

function makeFixtureConfig({
    symbol,
    name,
    price,
    eps,
    dividendYield = 0,
    volatility,
    horizon = 5,
    benchmark = 0.065,
    targetCagr = 0.12,
    kellyScale = 0.5,
    overrides = {},
    shares = 0,
    maxWeight = 0.3,
    scenarios,
    thesisIntactProbability = 0.7,
}) {
    return {
        symbol,
        name,
        meta: {
            schemaVersion: '1.1.0',
            asOf: '2026-11-24T19:00:00.000Z',
            timezone: 'UTC',
            source: 'test-fixture',
        },
        model: {
            version: '1.0.0',
            engine: {
                type: 'fermat-pascal-kelly',
                useMonteCarlo: false,
                paths: 10000,
                useBayesianUpdate: false,
            },
            preferences: {
                horizon,
                benchmark: { type: 'annualReturn', value: benchmark, name: 'SP500' },
                kellyScale,
                targetCagr,
                overrides,
            },
        },
        market: {
            price,
            eps,
            dividendYield,
            currency: 'USD',
            marketDataUpdatedAt: '2026-11-24T19:00:00.000Z',
        },
        risk: {
            volatility,
            estimateSource: 'historical',
            correlations: null,
        },
        position: {
            shares,
            constraints: { minWeight: 0, maxWeight },
        },
        scenarios,
        belief_state: {
            probability: 0.5,
            confidence: 0.75,
            thesis_intact_probability: thesisIntactProbability,
        },
    };
}

const FIXTURE_CONFIGS = {
    AEHR: makeFixtureConfig({
        symbol: 'AEHR',
        name: 'Aehr Test Systems',
        price: 49.0,
        eps: -0.23,
        volatility: 1.33,
        overrides: { eps: 0.895 },
        shares: 0,
        maxWeight: 0.05,
        thesisIntactProbability: 0.6,
        scenarios: [
            {
                id: 'bull',
                name: 'Bull',
                prob: 0.25,
                growth: { epsCagr: 0.35 },
                valuation: { exitPe: 45 },
            },
            {
                id: 'base',
                name: 'Base',
                prob: 0.5,
                growth: { epsCagr: 0.2 },
                valuation: { exitPe: 30 },
            },
            {
                id: 'bear',
                name: 'Bear',
                prob: 0.25,
                growth: { epsCagr: 0.05 },
                valuation: { exitPe: 20 },
            },
        ],
    }),
    ANET: makeFixtureConfig({
        symbol: 'ANET',
        name: 'Arista Networks',
        price: 159.7373,
        eps: 3.73,
        volatility: 0.5907,
        shares: 2418.3604,
        maxWeight: 0.3,
        scenarios: [
            {
                id: 'bull',
                name: 'Bull',
                prob: 0.35,
                growth: { epsCagr: 0.28 },
                valuation: { exitPe: 38 },
            },
            {
                id: 'base',
                name: 'Base',
                prob: 0.5,
                growth: { epsCagr: 0.18 },
                valuation: { exitPe: 28 },
            },
            {
                id: 'bear',
                name: 'Bear',
                prob: 0.15,
                growth: { epsCagr: 0.08 },
                valuation: { exitPe: 20 },
            },
        ],
    }),
    CBRS: makeFixtureConfig({
        symbol: 'CBRS',
        name: 'Cerebras Systems',
        price: 87.43,
        eps: -5.17,
        volatility: 1.1602,
        shares: 0,
        maxWeight: 0.05,
        thesisIntactProbability: 0.05,
        scenarios: [
            {
                id: 'bull',
                name: 'RETIRED – Bull',
                prob: 0.25,
                growth: { epsCagr: 0.52 },
                valuation: { exitPe: 40 },
            },
            {
                id: 'base',
                name: 'RETIRED – Base',
                prob: 0.4,
                growth: { epsCagr: 0.27 },
                valuation: { exitPe: 30 },
            },
            {
                id: 'bear',
                name: 'RETIRED – Bear',
                prob: 0.35,
                growth: { epsCagr: 0.05 },
                valuation: { exitPe: 15 },
            },
        ],
    }),
    GOOG: makeFixtureConfig({
        symbol: 'GOOG',
        name: 'Alphabet',
        price: 268.15,
        eps: 19.15,
        dividendYield: 0.32,
        volatility: 0.3297,
        horizon: 10,
        shares: 943.303,
        maxWeight: 0.25,
        scenarios: [
            {
                id: 'bull',
                name: 'Bull',
                prob: 0.2,
                growth: { epsCagr: 0.14 },
                valuation: { exitPe: 25 },
            },
            {
                id: 'base',
                name: 'Base',
                prob: 0.6,
                growth: { epsCagr: 0.08 },
                valuation: { exitPe: 20 },
            },
            {
                id: 'bear',
                name: 'Bear',
                prob: 0.2,
                growth: { epsCagr: 0.02 },
                valuation: { exitPe: 15 },
            },
        ],
    }),
    PDD: makeFixtureConfig({
        symbol: 'PDD',
        name: 'Pinduoduo',
        price: 87.75,
        eps: 9.07,
        volatility: 0.3492,
        shares: 3138.4802,
        maxWeight: 0.25,
        scenarios: [
            {
                id: 'bull',
                name: 'Bull',
                prob: 0.15,
                growth: { epsCagr: 0.14 },
                valuation: { exitPe: 14 },
            },
            {
                id: 'base',
                name: 'Base',
                prob: 0.5,
                growth: { epsCagr: 0.07 },
                valuation: { exitPe: 10.5 },
            },
            {
                id: 'bear',
                name: 'Bear',
                prob: 0.35,
                growth: { epsCagr: -0.02 },
                valuation: { exitPe: 7 },
            },
        ],
    }),
    VT: makeFixtureConfig({
        symbol: 'VT',
        name: 'Vanguard Total World Index Fund',
        price: 146.635,
        eps: 8.0197,
        dividendYield: 1.56,
        volatility: 0.1587,
        horizon: 5,
        benchmark: 0.05,
        targetCagr: 0.08,
        shares: 2601.0,
        maxWeight: 0.3,
        scenarios: [
            {
                id: 'bull',
                name: 'Bull',
                prob: 0.2,
                growth: { epsCagr: 0.08 },
                valuation: { exitPe: 25 },
            },
            {
                id: 'base',
                name: 'Base',
                prob: 0.6,
                growth: { epsCagr: 0.05 },
                valuation: { exitPe: 20 },
            },
            {
                id: 'bear',
                name: 'Bear',
                prob: 0.2,
                growth: { epsCagr: 0.02 },
                valuation: { exitPe: 15 },
            },
        ],
    }),
};

function makeFixtureHistory(symbol, endPrice) {
    const dates = [
        '2025-12-01',
        '2026-02-02',
        '2026-04-06',
        '2026-06-01',
        '2026-08-03',
        '2026-10-05',
        '2026-11-23',
    ];
    return {
        symbol,
        asOf: '2026-11-24T19:00:00.000Z',
        priceBasis: 'rawClose',
        priceBasisVerified: true,
        epsPointInTimeCertified: false,
        prices: dates.map((d, i) => ({
            d,
            c: Number((endPrice * (0.85 + (0.15 * i) / (dates.length - 1))).toFixed(2)),
        })),
    };
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
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
    rect: jest.fn(),
    roundRect: jest.fn(),
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

        const indexPayload = cloneJson(FIXTURE_INDEX);
        const holdingsPayload = cloneJson(FIXTURE_HOLDINGS);
        const flagsPayload = cloneJson(FIXTURE_FLAGS);

        global.fetch = jest.fn(async (urlStr) => {
            const url = String(urlStr);
            if (url.includes('index.json')) {
                return { ok: true, json: async () => cloneJson(indexPayload) };
            }
            if (url.includes('holdings_details.json')) {
                return { ok: true, json: async () => cloneJson(holdingsPayload) };
            }
            if (url.includes('event_flags.json')) {
                return { ok: true, json: async () => cloneJson(flagsPayload) };
            }
            for (const entry of indexPayload.tickers) {
                const sym = entry.symbol;
                const cfg = FIXTURE_CONFIGS[sym];
                if (url.includes(`${sym}.history.json`)) {
                    return {
                        ok: true,
                        json: async () => makeFixtureHistory(sym, cfg.market.price),
                    };
                }
                if (url.includes(`${sym}.json`)) {
                    return { ok: true, json: async () => cloneJson(cfg) };
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
        const weightsInOrder = rows.map(
            (r) =>
                lab.__analysisLabTesting.state.configs.find(
                    (c) => c.symbol === r.querySelector('.board-ticker').textContent
                ).weight
        );
        for (let i = 1; i < weightsInOrder.length; i++) {
            expect(weightsInOrder[i]).toBeLessThanOrEqual(weightsInOrder[i - 1]);
        }

        const rowBySym = Object.fromEntries(
            rows.map((r) => [r.querySelector('.board-ticker').textContent, r])
        );
        const verdictBySym = Object.fromEntries(
            Object.entries(rowBySym).map(([sym, r]) => [
                sym,
                r.querySelector('.board-verdict').textContent,
            ])
        );
        expect(verdictBySym.CBRS).toBe('AVOID');
        expect(rowBySym.CBRS.querySelector('.val-spark-na').textContent).toBe('n/a');
        expect(verdictBySym.VT).toBe('HOLD');
        expect(verdictBySym.AEHR).toBe('WATCH');
        expect(verdictBySym.GOOG).toMatch(/^\+\d+\.\d%$/);
        expect(verdictBySym.ANET).toMatch(/^-\d+\.\d%$/);
        expect(verdictBySym.PDD).toMatch(/^-\d+\.\d%$/);

        const { formatBoardVerdict } = lab.__analysisLabTesting;
        expect(
            formatBoardVerdict({
                verdictCode: 'TRIM_RICH',
                currentWeight: 0.2,
                targetWeight: 0.25,
                richTargetWeight: 0.12,
            })
        ).toBe('-8.0%');
        expect(formatBoardVerdict({ verdictCode: 'BUY_INITIATE', weightDelta: 0.1 })).toBe(
            '+10.0%'
        );
        expect(formatBoardVerdict({ verdictCode: 'EXIT_BROKEN' })).toBe('EXIT');
        expect(formatBoardVerdict({ verdictCode: 'SELL_TRIM' })).toBe('SELL');
        expect(formatBoardVerdict({ verdictCode: 'PASS' })).toBe('PASS');

        expect(root.querySelector('#boardBudgetFooter')).toBeNull();
        expect(root.querySelector('.board-budget-footer')).toBeNull();
    });

    it('switches to 3-layer ticker Decision Chart and supports 2y/full horizon switching', async () => {
        const { root } = await setupLab();
        const snap2y = lab.showTickerDecision('goog', { horizonMode: '2y' });
        expect(snap2y.symbol).toBe('GOOG');
        expect(snap2y.text).toContain('Mean ');
        expect(snap2y.text).toContain('Scenarios');
        expect(snap2y.text).toContain('Sizing:');
        expect(lab.getActiveAnalysisConfig().symbol).toBe('GOOG');

        const boardSection = root.querySelector('[data-analysis-section="board"]');
        const tickerSection = root.querySelector('[data-analysis-section="ticker"]');
        expect(boardSection.classList.contains('is-hidden')).toBe(true);
        expect(tickerSection.classList.contains('is-hidden')).toBe(false);

        expect(root.querySelector('#paneContext')).toBeNull();
        expect(root.querySelector('.pane-context')).toBeNull();
        expect(root.querySelector('#verdictStrip')).toBeNull();
        expect(root.querySelector('#riskFooter')).toBeNull();
        expect(root.querySelector('#sizingBullet')).toBeNull();
        expect(mockCtx.fillText.mock.calls.map((c) => c[0])).toContain('+2Y');

        mockCtx.fillText.mockClear();
        lab.showTickerDecision('GOOG', { horizonMode: 'full' });
        expect(lab.__analysisLabTesting.state.horizonMode).toBe('full');
        expect(mockCtx.fillText.mock.calls.map((c) => c[0])).toContain('+10Y');

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
        await setupLab();
        lab.showTickerDecision('GOOG');
        mockSelectedCurrency = 'CNY';

        document.dispatchEvent(
            new CustomEvent('currencyChangedGlobal', { detail: { currency: 'CNY' } })
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(mockWhenReady).toHaveBeenCalled();
        expect(lab.showTickerDecision('GOOG').text).toContain('¥');
        expect(mockCtx.fillText.mock.calls.some((c) => String(c[0]).includes('¥'))).toBe(true);
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
