import {
    computeAppreciationSeries,
    buildFilteredBalanceSeries,
    buildContributionSeriesFromTransactions,
    _getFromBalanceCache,
    _setInBalanceCache,
    _prepareSplitsByDate,
    _prepareTransactionsByDate,
    _processDailySplits,
    _processDailyTransactions,
    _calculateDailyValue,
    _adjustSyntheticStartForBalance
} from '../../../../../js/transactions/chart/data/contribution.js';
import * as helpers from '../../../../../js/transactions/chart/helpers.js';

describe('Contribution Data Helpers', () => {
    describe('buildFilteredBalanceSeries', () => {
        it('returns an identical cached series when inputs are the same objects', () => {
            const transactions = [
                {
                    tradeDate: '2024-01-01',
                    orderType: 'Buy',
                    security: 'AAPL',
                    quantity: '10',
                    price: '100',
                    netAmount: '1000',
                },
            ];
            const historicalPrices = {
                AAPL: { '2024-01-01': 100 },
            };
            const splitHistory = [];

            const first = buildFilteredBalanceSeries(transactions, historicalPrices, splitHistory);
            const second = buildFilteredBalanceSeries(transactions, historicalPrices, splitHistory);

            expect(second).toBe(first);
            expect(first.length).toBeGreaterThan(0);
        });

        it('recomputes when the transactions array identity changes', () => {
            const transactions = [
                {
                    tradeDate: '2024-01-01',
                    orderType: 'Buy',
                    security: 'AAPL',
                    quantity: '10',
                    price: '100',
                    netAmount: '1000',
                },
            ];
            const historicalPrices = {
                AAPL: { '2024-01-01': 100 },
            };
            const splitHistory = [];

            const first = buildFilteredBalanceSeries(transactions, historicalPrices, splitHistory);
            const second = buildFilteredBalanceSeries(
                [...transactions],
                historicalPrices,
                splitHistory
            );

            expect(second).not.toBe(first);
            expect(second.length).toBe(first.length);
        });
    });

    describe('computeAppreciationSeries', () => {
        it('should calculate appreciation correctly when lengths match', () => {
            const balanceData = [
                { date: new Date('2024-01-01'), value: 100 },
                { date: new Date('2024-01-02'), value: 120 },
                { date: new Date('2024-01-03'), value: 150 }
            ];
            const contributionData = [
                { date: new Date('2024-01-01'), amount: 100 },
                { date: new Date('2024-01-02'), amount: 110 },
                { date: new Date('2024-01-03'), amount: 130 }
            ];

            const result = computeAppreciationSeries(balanceData, contributionData);

            expect(result.length).toBe(3);
            expect(result[0].value).toBe(0); // 100 - 100
            expect(result[1].value).toBe(10); // 120 - 110
            expect(result[2].value).toBe(20); // 150 - 130
            expect(result[0].date).toBe(balanceData[0].date);
        });

        it('should handle empty arrays', () => {
            expect(computeAppreciationSeries([], [])).toEqual([]);
            expect(computeAppreciationSeries(null, null)).toEqual([]);
        });

        it('should align data by date if lengths do not match using interpolation', () => {
            const balanceData = [
                { date: new Date('2024-01-01'), value: 100 },
                { date: new Date('2024-01-02'), value: 120 },
                { date: new Date('2024-01-04'), value: 150 }
            ];
            const contributionData = [
                { date: new Date('2024-01-01'), amount: 100 },
                { date: new Date('2024-01-03'), amount: 110 },
                { date: new Date('2024-01-04'), amount: 130 }
            ];

            const result = computeAppreciationSeries(balanceData, contributionData);

            expect(result.length).toBe(3); // Result should map to balanceData
            // 2024-01-01
            expect(result[0].value).toBe(0); // 100 - 100
            // 2024-01-02 interpolation: time is between Jan 1 (100) and Jan 3 (110)
            // Midpoint value should be 105. 120 - 105 = 15
            expect(result[1].value).toBe(15);
            // 2024-01-04
            expect(result[2].value).toBe(20); // 150 - 130
        });

        it('should handle target time before first contribution', () => {
            const balanceData = [
                { date: new Date('2023-12-31'), value: 100 },
            ];
            const contributionData = [
                { date: new Date('2024-01-01'), amount: 100 },
            ];
            const result = computeAppreciationSeries(balanceData, contributionData);
            expect(result.length).toBe(1);
            expect(result[0].value).toBe(0); // 100 - 100 (first contrib value)
        });

        it('should handle a single contribution point with gap days', () => {
            const balanceData = [
                { date: new Date('2024-01-01'), value: 100 },
                { date: new Date('2024-01-04'), value: 150 },
            ];
            const contributionData = [
                { date: new Date('2024-01-01'), amount: 100 },
            ];
            const result = computeAppreciationSeries(balanceData, contributionData);
            expect(result.length).toBe(2);
            expect(result[0].value).toBe(0); // 100 - 100
            expect(result[1].value).toBe(50); // 150 - 100 (clamped to last)
        });

        it('should interpolate across a multi-day gap', () => {
            const balanceData = [
                { date: new Date('2024-01-01'), value: 100 },
                { date: new Date('2024-01-03'), value: 130 },
                { date: new Date('2024-01-05'), value: 150 },
            ];
            const contributionData = [
                { date: new Date('2024-01-01'), amount: 100 },
                { date: new Date('2024-01-05'), amount: 140 },
            ];
            const result = computeAppreciationSeries(balanceData, contributionData);
            expect(result.length).toBe(3);
            expect(result[0].value).toBe(0); // 100 - 100
            expect(result[1].value).toBe(10); // 130 - 120 (midpoint)
            expect(result[2].value).toBe(10); // 150 - 140
        });
    });

    describe('buildContributionSeriesFromTransactions', () => {
        let originalDateNow;
        let mockDate;

        beforeAll(() => {
            originalDateNow = global.Date;
            mockDate = new Date('2024-01-01T12:00:00Z');
            global.Date = class extends originalDateNow {
                constructor(...args) {
                    if (args.length === 0) {
                        return new originalDateNow(mockDate);
                    }
                    return new originalDateNow(...args);
                }
            };
            global.Date.now = () => mockDate.getTime();
        });

        afterAll(() => {
            global.Date = originalDateNow;
        });

        it('returns empty array when transactions is empty or invalid', () => {
            expect(buildContributionSeriesFromTransactions([])).toEqual([]);
            expect(buildContributionSeriesFromTransactions(null)).toEqual([]);
        });

        it('handles basic single transaction', () => {
            const transactions = [{
                tradeDate: '2024-01-01',
                orderType: 'buy',
                netAmount: 1000
            }];
            const result = buildContributionSeriesFromTransactions(transactions);
            expect(result.length).toBe(1);
            expect(result[0].tradeDate).toBe('2024-01-01');
            expect(result[0].amount).toBe(1000);
            expect(result[0].orderType).toBe('buy');
        });

        it('consolidates transactions on the same day', () => {
            const transactions = [
                { tradeDate: '2024-01-01', orderType: 'Buy', netAmount: 1000 },
                { tradeDate: '2024-01-01', orderType: 'Buy', netAmount: 500 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions);
            expect(result.length).toBe(1);
            expect(result[0].amount).toBe(1500);
        });

        it('handles gap padding between days', () => {
            const transactions = [
                { tradeDate: '2024-01-01', orderType: 'Buy', netAmount: 1000 },
                { tradeDate: '2024-01-03', orderType: 'Buy', netAmount: 500 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions);
            expect(result.length).toBe(3);
            expect(result[1].orderType).toBe('padding');
            expect(result[1].tradeDate).toBe('2024-01-02');
            expect(result[1].amount).toBe(1000);
            expect(result[2].tradeDate).toBe('2024-01-03');
            expect(result[2].amount).toBe(1500);
        });

        it('handles padding to a specific date', () => {
            // Need to make sure today logic works so restoring global.Date temporarily
            global.Date = originalDateNow;
            const transactions = [
                { tradeDate: '2024-01-01', orderType: 'Buy', netAmount: 1000 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions, {
                padToDate: new Date('2024-01-03T12:00:00Z')
            });
            expect(result.length).toBe(2);
            expect(result[1].orderType).toBe('padding');
            expect(result[1].tradeDate).toBe('2024-01-03');

            const mockDateObj = new originalDateNow('2024-01-01T12:00:00Z');
            global.Date = class extends originalDateNow {
                constructor(...args) {
                    if (args.length === 0) {
                        return new originalDateNow(mockDateObj);
                    }
                    return new originalDateNow(...args);
                }
            };
            global.Date.now = () => mockDateObj.getTime();
        });

        it('adds synthetic start if requested', () => {
            const transactions = [
                { tradeDate: '2024-01-02', orderType: 'Buy', netAmount: 1000 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions, {
                includeSyntheticStart: true
            });
            expect(result.length).toBe(2);
            expect(result[0].synthetic).toBe(true);
            expect(result[0].tradeDate).toBe('2024-01-01');
            expect(result[0].amount).toBe(0);
        });

        it('determines mixed order type correctly', () => {
            const transactions = [
                { tradeDate: '2024-01-01', orderType: 'Buy', netAmount: 1000 },
                { tradeDate: '2024-01-01', orderType: 'Sell', netAmount: -500 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions);
            expect(result.length).toBe(1);
            expect(result[0].orderType).toBe('mixed');
        });

        it('handles currency conversion', () => {
            const transactions = [
                { tradeDate: '2024-01-01', orderType: 'Buy', netAmount: 1000 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions, {
                currency: 'EUR'
            });
            expect(result.length).toBe(1);
        });

        it('handles determination with mixed combinations', () => {
            const transactions = [
                { tradeDate: '2024-01-01', orderType: 'Buy', netAmount: 1000 },
                { tradeDate: '2024-01-01', orderType: 'Other', netAmount: -500 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions);
            expect(result.length).toBe(1);
            expect(result[0].orderType).toBe('mixed');
        });

        it('handles determination all buys', () => {
            const transactions = [
                { tradeDate: '2024-01-01', orderType: 'buy', netAmount: 1000 },
                { tradeDate: '2024-01-01', orderType: 'Buy', netAmount: -500 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions);
            expect(result.length).toBe(1);
            expect(result[0].orderType).toBe('buy');
        });

        it('handles determination all sells', () => {
            const transactions = [
                { tradeDate: '2024-01-01', orderType: 'Sell', netAmount: 1000 },
                { tradeDate: '2024-01-01', orderType: 'sell', netAmount: -500 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions);
            expect(result.length).toBe(1);
            expect(result[0].orderType).toBe('sell');
        });

        it('tests _insertPaddingIfNeeded for non-padding scenarios', () => {
            const transactions = [
                { tradeDate: '2024-01-01', orderType: 'Buy', netAmount: 1000 },
                { tradeDate: '2024-01-02', orderType: 'Buy', netAmount: 500 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions);
            expect(result.length).toBe(2);
            expect(result[0].tradeDate).toBe('2024-01-01');
            expect(result[1].tradeDate).toBe('2024-01-02');
        });

        it('tests empty uniqueDates array gracefully', () => {
            const result = buildContributionSeriesFromTransactions([]);
            expect(result).toEqual([]);
        });

        it('handles padding to a specific date when padToDate is not provided (defaults to today)', () => {
            // Need to make sure today logic works so restoring global.Date temporarily
            global.Date = originalDateNow;
            const transactions = [
                { tradeDate: '2024-01-01', orderType: 'Buy', netAmount: 1000 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions);
            expect(result.length).toBeGreaterThan(1);
            expect(result[1].orderType).toBe('padding');

            const mockDateObj = new originalDateNow('2024-01-01T12:00:00Z');
            global.Date = class extends originalDateNow {
                constructor(...args) {
                    if (args.length === 0) {
                        return new originalDateNow(mockDateObj);
                    }
                    return new originalDateNow(...args);
                }
            };
            global.Date.now = () => mockDateObj.getTime();
        });

        it('does not add synthetic start if not required', () => {
            const transactions = [
                { tradeDate: '2024-01-02', orderType: 'Buy', netAmount: 1000 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions, {
                includeSyntheticStart: false
            });
            expect(result.length).toBe(1);
        });

        it('does not add synthetic start if first actual amount is zero', () => {
            const transactions = [
                { tradeDate: '2024-01-02', orderType: 'Buy', netAmount: 0 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions, {
                includeSyntheticStart: true
            });
            expect(result.length).toBe(1);
        });

        it('does not add synthetic start if existing padding exists', () => {
            const transactions = [
                { tradeDate: '2024-01-02', orderType: 'Buy', netAmount: 1000 }
            ];
            // if we manually add padding to simulate the behavior:
            transactions.unshift({ tradeDate: '2024-01-01', orderType: 'padding', netAmount: 0 });
            const result = buildContributionSeriesFromTransactions(transactions, {
                includeSyntheticStart: true
            });
            expect(result.length).toBe(2);
            // It just shouldn't throw or add another one at the same date.
            expect(result[0].tradeDate).toBe('2024-01-01');
        });

        it('tests padding condition when no prev gap exists', () => {
            const transactions = [
                { tradeDate: '2024-01-01', orderType: 'Buy', netAmount: 1000 },
                { tradeDate: '2024-01-02', orderType: 'Buy', netAmount: 500 }
            ];
            const result = buildContributionSeriesFromTransactions(transactions);
            expect(result.length).toBe(2);
        });
    });

    describe('_shouldAddSyntheticStart coverage details', () => {
        it('returns null if firstActual is null', () => {
            const transactions = [];
            const result = buildContributionSeriesFromTransactions(transactions, {
                includeSyntheticStart: true
            });
            expect(result).toEqual([]);
        });

        it('returns null if firstDate is invalid', () => {
            const transactions = [
                { tradeDate: 'invalid-date', orderType: 'Buy', netAmount: 1000 }
            ];
            // By spying or mocking we can ensure _shouldAddSyntheticStart returns null
            jest.spyOn(helpers, 'parseLocalDate').mockReturnValueOnce(null);

            const result = buildContributionSeriesFromTransactions(transactions, {
                includeSyntheticStart: true
            });
            // We just ensure it doesn't crash or add synthetic date
            expect(result.length).toBe(1);

            jest.restoreAllMocks();
        });
    });

    describe('_applyCurrencyConversion coverage details', () => {
        it('tests fallback when buyVolume and sellVolume are zero', () => {
            // Because padToDate defaults to today, the length is > 1.
            // We just ensure the calculation works without errors.
            const transactions = [{
                tradeDate: '2024-01-01',
                orderType: 'Buy',
                netAmount: 1000
            }];
            const result = buildContributionSeriesFromTransactions(transactions, {
                currency: 'CAD',
                padToDate: new Date('2024-01-01T12:00:00Z')
            });
            expect(result.length).toBe(1);
        });
    });
});

describe('Helper functions for buildFilteredBalanceSeries', () => {
    describe('_getFromBalanceCache / _setInBalanceCache', () => {
        it('should correctly set and retrieve cache', () => {
            const cache = new Map();
            const txns = [{ id: 1 }];
            const prices = {};
            const splits = [];
            const series = [{ date: '2023-01-01', value: 100 }];

            _setInBalanceCache(cache, txns, prices, splits, series);
            const retrieved = _getFromBalanceCache(cache, txns, prices, splits);

            expect(retrieved).toBe(series);
        });

        it('should return null if not cached', () => {
            const cache = new Map();
            const retrieved = _getFromBalanceCache(cache, [], {}, []);
            expect(retrieved).toBeNull();
        });
    });

    describe('_prepareSplitsByDate', () => {
        it('should structure splits by date correctly', () => {
            const splits = [{ splitDate: '2023-01-01', splitMultiplier: 2, symbol: 'AAPL' }];
            const parseLocalDate = jest.fn(d => new Date(d));
            const toLocalISODate = jest.fn(d => d.toISOString().split('T')[0]);
            const normalizeSymbolForPricing = jest.fn(s => s.toUpperCase());

            const result = _prepareSplitsByDate(splits, parseLocalDate, toLocalISODate, normalizeSymbolForPricing);

            expect(result.get('2023-01-01')).toEqual([{ symbol: 'AAPL', multiplier: 2 }]);
        });
    });

    describe('_prepareTransactionsByDate', () => {
        it('should group transactions by date', () => {
            const txns = [
                { tradeDate: '2023-01-01', security: 'AAPL', quantity: '10', price: '150', orderType: 'buy' }
            ];
            const parseLocalDate = jest.fn(d => new Date(d));
            const toLocalISODate = jest.fn(d => d.toISOString().split('T')[0]);

            const result = _prepareTransactionsByDate(txns, parseLocalDate, toLocalISODate);

            expect(result.get('2023-01-01')).toEqual([txns[0]]);
        });
    });

    describe('_processDailySplits', () => {
        it('should update holdings and lastKnownPrices for valid splits', () => {
            const holdings = new Map([['AAPL', 10]]);
            const lastKnownPrices = new Map([['AAPL', 150]]);
            const splitsToday = [{ symbol: 'AAPL', multiplier: 2 }];

            _processDailySplits(splitsToday, holdings, lastKnownPrices);

            expect(holdings.get('AAPL')).toBe(20);
            expect(lastKnownPrices.get('AAPL')).toBe(75);
        });

        it('should ignore invalid splits', () => {
            const holdings = new Map([['AAPL', 10]]);
            const lastKnownPrices = new Map([['AAPL', 150]]);
            const splitsToday = [{ symbol: 'AAPL', multiplier: -1 }, { symbol: 'AAPL', multiplier: NaN }];

            _processDailySplits(splitsToday, holdings, lastKnownPrices);

            expect(holdings.get('AAPL')).toBe(10);
            expect(lastKnownPrices.get('AAPL')).toBe(150);
        });
    });

    describe('_processDailyTransactions', () => {
        it('should properly apply buy/sell transactions to holdings', () => {
            const holdings = new Map([['AAPL', 10]]);
            const lastKnownPrices = new Map();
            const txns = [
                { security: 'AAPL', quantity: '5', price: '160', orderType: 'buy' },
                { security: 'MSFT', quantity: '10', price: '300', orderType: 'buy' },
                { security: 'AAPL', quantity: '15', price: '165', orderType: 'sell' }
            ];
            const normalize = jest.fn(s => s);

            _processDailyTransactions(txns, holdings, lastKnownPrices, normalize);

            expect(holdings.has('AAPL')).toBe(false); // 10 + 5 - 15 = 0
            expect(holdings.get('MSFT')).toBe(10);
            expect(lastKnownPrices.get('AAPL')).toBe(165); // Last txn price
            expect(lastKnownPrices.get('MSFT')).toBe(300);
        });
    });

    describe('_calculateDailyValue', () => {
        it('should correctly calculate total daily value', () => {
            const holdings = new Map([['AAPL', 10], ['MSFT', 5]]);
            const lastKnownPrices = new Map();

            const getPrice = jest.fn((hist, sym) => {
                if (sym === 'AAPL') {return 150;}
                return null;
            });
            const getSplit = jest.fn(() => 1);

            lastKnownPrices.set('MSFT', 300); // AAPL from hist, MSFT from last known

            const total = _calculateDailyValue(holdings, {}, [], '2023-01-01', lastKnownPrices, getPrice, getSplit);

            expect(total).toBe(10 * 150 + 5 * 300); // 1500 + 1500 = 3000
        });
    });

    describe('_adjustSyntheticStartForBalance', () => {
        it('should mark first point as synthetic if followed by zero value', () => {
            const series = [{ value: 0 }, { value: 100 }];
            _adjustSyntheticStartForBalance(series);
            expect(series[0].synthetic).toBe(true);
        });

        it('should remove first point if value is 0 and keepSyntheticStart is false', () => {
            const series = [{ value: 0 }, { value: 0 }];
            _adjustSyntheticStartForBalance(series);
            expect(series.length).toBe(1);
        });
    });
});
