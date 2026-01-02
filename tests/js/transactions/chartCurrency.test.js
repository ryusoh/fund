import { jest } from '@jest/globals';

describe('Regression: Currency Double Conversion in Balance Chart', () => {
    let createChartManager;
    let transactionState;
    let mockConvertValueToCurrency;

    beforeEach(() => {
        jest.resetModules();

        // 1. Mock dependencies
        mockConvertValueToCurrency = jest.fn((val, date, currency) => {
            if (currency === 'CNY') {
                return Number(val) * 7;
            }
            return Number(val);
        });

        jest.doMock('@js/transactions/utils.js', () => ({
            convertValueToCurrency: mockConvertValueToCurrency,
            formatCurrencyCompact: jest.fn(),
            formatCurrencyInlineValue: jest.fn(),
            formatCurrencyInline: jest.fn(),
            convertBetweenCurrencies: jest.fn(),
            parseLocalDate: (val) => new Date(val),
        }));

        transactionState = {
            activeChart: 'contribution',
            selectedCurrency: 'CNY',
            chartVisibility: { contribution: true, balance: true },
            chartDateRange: { from: null, to: null },
            runningAmountSeries: [], // Not focus of this test
            portfolioSeries: [], // Will be populated in test
            filteredTransactions: [],
            allTransactions: [
                // Need non-empty array for filter logic
                {
                    tradeDate: '2024-01-01',
                    security: 'AAPL',
                    quantity: 1,
                    price: 100,
                    orderType: 'buy',
                },
                {
                    tradeDate: '2024-01-01',
                    security: 'MSFT',
                    quantity: 1,
                    price: 200,
                    orderType: 'buy',
                },
            ],
            activeFilterTerm: '',
            runningAmountSeriesByCurrency: {},
            portfolioSeriesByCurrency: {},
            historicalPrices: {},
            splitHistory: [],
        };

        jest.doMock('@js/transactions/state.js', () => ({
            transactionState,
            setChartVisibility: jest.fn(),
            setHistoricalPrices: jest.fn(),
            setRunningAmountSeries: jest.fn(),
            getShowChartLabels: jest.fn(),
            getCompositionFilterTickers: jest.fn(),
            getCompositionAssetClassFilter: jest.fn(),
            hasActiveTransactionFilters: jest.fn(() => {
                return !!(
                    transactionState.activeFilterTerm &&
                    transactionState.activeFilterTerm.trim().length > 0
                );
            }),
        }));

        jest.doMock('@js/config.js', () => ({
            ANIMATED_LINE_SETTINGS: {},
            CHART_SMOOTHING: { enabled: false }, // Disable smoothing to simplify data flow
            CHART_MARKERS: {},
            CONTRIBUTION_CHART_SETTINGS: {},
            mountainFill: {},
            COLOR_PALETTES: {},
            CROSSHAIR_SETTINGS: {},
            CHART_LINE_WIDTHS: {},
            getHoldingAssetClass: jest.fn(),
        }));

        jest.doMock('@js/plugins/glowTrailAnimator.js', () => ({
            createGlowTrailAnimator: jest.fn(() => ({
                isEnabledFor: jest.fn(),
                stop: jest.fn(),
                schedule: jest.fn(),
                advance: jest.fn(),
                drawSeriesGlow: jest.fn(),
            })),
        }));

        jest.doMock('@js/utils/smoothing.js', () => ({
            smoothFinancialData: jest.fn((data) => data.map((p) => ({ x: p.x, y: p.y }))), // Identity pass-through
        }));

        // Mock document/canvas for chartManager
        global.document.getElementById = jest.fn((id) => {
            if (id === 'runningAmountCanvas') {
                const ctx = {
                    setTransform: jest.fn(),
                    scale: jest.fn(),
                    clearRect: jest.fn(),
                    beginPath: jest.fn(),
                    moveTo: jest.fn(),
                    lineTo: jest.fn(),
                    stroke: jest.fn(),
                    fill: jest.fn(),
                    closePath: jest.fn(),
                    rect: jest.fn(),
                    clip: jest.fn(),
                    arc: jest.fn(),
                    save: jest.fn(),
                    restore: jest.fn(),
                    measureText: jest.fn(() => ({ width: 10 })),
                    fillText: jest.fn(),
                    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
                    canvas: { offsetWidth: 100, offsetHeight: 100 },
                };
                return {
                    getContext: () => ctx,
                    offsetWidth: 100,
                    offsetHeight: 100,
                    addEventListener: jest.fn(),
                    closest: jest.fn(() => null),
                };
            }
            return null;
        });
        global.window.devicePixelRatio = 1;
        global.requestAnimationFrame = (cb) => {
            cb(Date.now());
            return 1;
        };

        // Load the module under test
        const chartModule = require('@js/transactions/chart.js');
        createChartManager = chartModule.createChartManager;
    });

    test('should NOT convert balance series again if filters are inactive (already converted source)', async () => {
        // Setup state:
        // 1. No filters active
        transactionState.activeFilterTerm = '';
        transactionState.filteredTransactions = [];

        // 2. Selected currency is CNY
        transactionState.selectedCurrency = 'CNY';

        // 3. Portfolio series (balance source) already has data (simulating it was loaded/cached in CNY or pre-converted)
        // In the real app, setPortfolioSeries updates this.
        // chart.js reads transactionState.portfolioSeries when filters are inactive.
        // Let's assume this data is already "correct" for the view (e.g. if it was loaded from CNY endpoint or converted once globally).
        // The regression was that chart.js would take this AND convert it AGAIN based on selectedCurrency.

        const balanceData = [
            { date: '2024-01-01', value: 7000 }, // Already 1000 USD * 7
            { date: '2024-01-02', value: 7070 }, // Already 1010 USD * 7
        ];
        transactionState.portfolioSeries = balanceData;

        // We also need runningAmountSeries to avoid empty state return
        transactionState.runningAmountSeries = [
            { tradeDate: '2024-01-01', amount: 7000, netAmount: 0 },
        ];

        const chartManager = createChartManager();

        // Trigger draw
        await chartManager.update();

        // Assertions
        // convertValueToCurrency should NOT be called for the balance values (7000, 7070)
        // It might be called for runningAmountSeries if that logic path is taken, but we care about balanceSource

        const calls = mockConvertValueToCurrency.mock.calls;
        const balanceCalls = calls.filter((call) => call[0] === 7000 || call[0] === 7070);

        // Before the fix, this would be > 0 (converting 7000 -> 49000)
        expect(balanceCalls.length).toBe(0);
    });

    test('should convert balance series if filters ARE active (raw calculated source)', async () => {
        // Setup state:
        // 1. Filters active
        transactionState.activeFilterTerm = 'AAPL';
        transactionState.filteredTransactions = [
            {
                tradeDate: '2024-01-01',
                security: 'AAPL',
                quantity: 1,
                price: 100,
                orderType: 'buy',
            },
        ];

        // 2. Selected currency is CNY
        transactionState.selectedCurrency = 'CNY';

        // 3. Mock buildFilteredBalanceSeries (exported in __chartTestables, but used internally in drawContributionChart)
        // Since we can't easily mock internal function usage without rewiring, we rely on the fact that
        // chart.js calls buildFilteredBalanceSeries which returns raw USD/base values.
        // We need to intercept that.
        // Actually, we can rely on the fact that `buildFilteredBalanceSeries` is imported from `./chart.js` inside `chart.js`?
        // No, it's defined in the same file.

        // However, `buildFilteredBalanceSeries` uses `historicalPrices`.
        // Let's rely on the fact that the internal logic calculates a raw balance.
        // If we provide transactions and prices, `buildFilteredBalanceSeries` will generate data.

        transactionState.historicalPrices = {
            AAPL: { '2024-01-01': 150 }, // Price in USD
        };
        transactionState.splitHistory = [];

        // We mock the internal buildFilteredBalanceSeries? No, it's hard.
        // But the test environment loads the real chart.js, so it uses the real buildFilteredBalanceSeries.
        // That function returns values in base currency (USD usually, or whatever prices are in).
        // Let's assume prices are in USD.
        // calculated value = 1 * 150 = 150 (USD).

        const chartManager = createChartManager();

        await chartManager.update();

        // Assertions
        // convertValueToCurrency SHOULD be called to convert 150 USD -> CNY
        // Because filters are active, we calculate raw balance (150) and then MUST convert it.

        const calls = mockConvertValueToCurrency.mock.calls;
        // The raw value calculated inside chart.js would be 150.
        const conversionCalls = calls.filter((call) => call[0] === 150 && call[2] === 'CNY');

        expect(conversionCalls.length).toBeGreaterThan(0);
    });
});
