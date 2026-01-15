import { jest } from '@jest/globals';

describe('composition ticker filtering helper', () => {
    let buildCompositionDisplayOrder;

    beforeEach(() => {
        jest.resetModules();
        jest.isolateModules(() => {
            const chartModule = require('@js/transactions/chart.js');
            ({ buildCompositionDisplayOrder } = chartModule.__chartTestables);
        });
    });

    it('falls back to base order when no filters are supplied', () => {
        const chartData = { ANET: [50], GOOG: [30], Others: [20] };
        const baseOrder = ['ANET', 'GOOG', 'Others'];
        const result = buildCompositionDisplayOrder(baseOrder, chartData, [], 1);
        expect(result.order).toEqual(baseOrder);
        expect(result.filteredOthers).toBeNull();
    });

    it('aggregates remainder into Others when only subset is requested', () => {
        const chartData = {
            ANET: [60, 55],
            GOOG: [30, 25],
            Others: [10, 20],
        };
        const baseOrder = ['ANET', 'GOOG', 'Others'];
        const result = buildCompositionDisplayOrder(baseOrder, chartData, ['ANET'], 2);
        expect(result.order).toEqual(['ANET', 'Others']);
        expect(result.filteredOthers).toEqual([40, 45]);
    });
});

describe('Minimum Tick Count Verification', () => {
    let generateConcreteTicks;
    let computePercentTickInfo;

    beforeEach(() => {
        jest.resetModules();
        jest.isolateModules(() => {
            const chartModule = require('@js/transactions/chart.js');
            ({ generateConcreteTicks, computePercentTickInfo } = chartModule.__chartTestables);
        });
    });

    test('generateConcreteTicks should return at least 5 ticks for small ranges', () => {
        const ticks = generateConcreteTicks(100, 101, false, 'USD');
        expect(ticks.length).toBeGreaterThanOrEqual(5);
    });

    test('generateConcreteTicks should return at least 5 ticks for flat line (zero range)', () => {
        const ticks = generateConcreteTicks(100, 100, false, 'USD');
        expect(ticks.length).toBeGreaterThanOrEqual(5);
        // Should span around 100
        expect(ticks).toContain(100);
    });

    test('computePercentTickInfo should return at least 5 ticks for small percentage range', () => {
        const info = computePercentTickInfo(0, 2); // 0% to 2%
        // Filter logic mimics buildFilteredBalanceSeries or chart rendering uses
        const margin = info.tickSpacing * 0.25;
        const visibleTicks = info.ticks.filter((t) => t >= 0 - margin && t <= 2 + margin);

        expect(visibleTicks.length).toBeGreaterThanOrEqual(5);
    });

    test('computePercentTickInfo should return at least 5 ticks for flat percentage', () => {
        const info = computePercentTickInfo(10, 10); // 10% flat
        // In flat case, min/max are artificially expanded
        // We just check if the raw ticks count is sufficient and covers the value
        expect(info.ticks.length).toBeGreaterThanOrEqual(5);
    });
});

describe('Filtered Balance Series Fallback Price Mechanism', () => {
    let buildFilteredBalanceSeries;

    beforeEach(() => {
        jest.resetModules();
        jest.isolateModules(() => {
            const chartModule = require('@js/transactions/chart.js');
            ({ buildFilteredBalanceSeries } = chartModule.__chartTestables);
        });
    });

    test('should use transaction price as fallback when historical prices unavailable', () => {
        const transactions = [
            {
                tradeDate: '2024-01-15',
                security: 'ANET',
                quantity: 10,
                price: 100,
                orderType: 'buy',
                transactionId: 1,
            },
        ];
        const historicalPrices = {}; // No historical prices available
        const splitHistory = [];

        const series = buildFilteredBalanceSeries(transactions, historicalPrices, splitHistory);

        // Should have balance values using the transaction price as fallback
        expect(series.length).toBeGreaterThan(0);

        // Find non-zero values - they should exist because of fallback
        const nonZeroPoints = series.filter((p) => p.value > 0);
        expect(nonZeroPoints.length).toBeGreaterThan(0);

        // Value should be approximately 10 shares * $100 = $1000
        const lastPoint = series[series.length - 1];
        expect(lastPoint.value).toBeCloseTo(1000, 0);
    });

    test('should prefer historical prices over transaction prices when available', () => {
        const transactions = [
            {
                tradeDate: '2024-01-15',
                security: 'ANET',
                quantity: 10,
                price: 100,
                orderType: 'buy',
                transactionId: 1,
            },
        ];
        const historicalPrices = {
            ANET: {
                '2024-01-15': 150, // Historical price is different from transaction price
                '2024-01-16': 155,
            },
        };
        const splitHistory = [];

        const series = buildFilteredBalanceSeries(transactions, historicalPrices, splitHistory);

        // Find the point for 2024-01-16
        const jan16Point = series.find((p) => p.date === '2024-01-16');
        expect(jan16Point).toBeDefined();
        // Should use historical price: 10 * 155 = 1550
        expect(jan16Point.value).toBeCloseTo(1550, 0);
    });

    test('should handle multiple transactions and use latest price as fallback', () => {
        const transactions = [
            {
                tradeDate: '2024-01-10',
                security: 'GOOG',
                quantity: 5,
                price: 200,
                orderType: 'buy',
                transactionId: 1,
            },
            {
                tradeDate: '2024-01-20',
                security: 'GOOG',
                quantity: 3,
                price: 220,
                orderType: 'buy',
                transactionId: 2,
            },
        ];
        const historicalPrices = {}; // No historical prices
        const splitHistory = [];

        const series = buildFilteredBalanceSeries(transactions, historicalPrices, splitHistory);

        // After first buy: 5 shares at $200 fallback = $1000
        // After second buy: 8 shares, fallback price updated to $220 = $1760
        const lastPoint = series[series.length - 1];
        expect(lastPoint.value).toBeCloseTo(1760, 0);
    });

    test('should return empty array when no transactions provided', () => {
        const series = buildFilteredBalanceSeries([], {}, []);
        expect(series).toEqual([]);
    });
});

describe('buildContributionSeriesFromTransactions Currency Handling', () => {
    let buildContributionSeriesFromTransactions;
    let mockConvertValueToCurrency;
    let transactionState;

    beforeEach(() => {
        jest.resetModules();

        // Setup mocks for this suite
        mockConvertValueToCurrency = jest.fn((val, date, currency) => {
            // Simple mock logic: if currency is 'CNY', multiply by 7
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
        }));

        transactionState = { selectedCurrency: 'USD', splitHistory: [] };
        jest.doMock('@js/transactions/state.js', () => ({
            transactionState,
            setChartVisibility: jest.fn(),
            setHistoricalPrices: jest.fn(),
            setRunningAmountSeries: jest.fn(),
            getShowChartLabels: jest.fn(),
            getCompositionFilterTickers: jest.fn(),
            getCompositionAssetClassFilter: jest.fn(),
        }));

        jest.doMock('@js/config.js', () => ({
            ANIMATED_LINE_SETTINGS: {},
            CHART_SMOOTHING: {},
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
            smoothFinancialData: jest.fn(),
        }));

        // Load module
        const chartModule = require('@js/transactions/chart.js');
        buildContributionSeriesFromTransactions =
            chartModule.buildContributionSeriesFromTransactions;
    });

    it('should use transactionState.selectedCurrency by default', () => {
        transactionState.selectedCurrency = 'CNY';
        const transactions = [{ tradeDate: '2023-01-01', netAmount: 100, orderType: 'buy' }];

        const series = buildContributionSeriesFromTransactions(transactions);

        expect(series[0].amount).toBe(700);
        expect(mockConvertValueToCurrency).toHaveBeenCalledWith(100, expect.anything(), 'CNY');
    });

    it('should use provided currency option over transactionState.selectedCurrency', () => {
        transactionState.selectedCurrency = 'CNY'; // Global is CNY
        const transactions = [{ tradeDate: '2023-01-01', netAmount: 100, orderType: 'buy' }];

        // Request USD explicitly
        const series = buildContributionSeriesFromTransactions(transactions, { currency: 'USD' });

        // Should be 100 (USD) because convertValueToCurrency mock returns val if not CNY
        // In the function: if (selectedCurrency === 'USD') return series; (skips conversion)

        expect(series[0].amount).toBe(100);
    });

    it('should correctly convert if currency option is provided as non-USD', () => {
        transactionState.selectedCurrency = 'USD'; // Global is USD
        const transactions = [{ tradeDate: '2023-01-01', netAmount: 100, orderType: 'buy' }];

        // Request CNY explicitly
        const series = buildContributionSeriesFromTransactions(transactions, { currency: 'CNY' });

        expect(series[0].amount).toBe(700);
        expect(mockConvertValueToCurrency).toHaveBeenCalledWith(100, expect.anything(), 'CNY');
    });
});
