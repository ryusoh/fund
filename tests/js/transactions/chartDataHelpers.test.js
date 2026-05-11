import { jest } from '@jest/globals';

describe('Chart data helpers', () => {
    describe('injectCarryForwardStartPoint', () => {
        let injectCarryForwardStartPoint;

        beforeEach(async () => {
            jest.resetModules();
            const helpers = await import('@js/transactions/chart/helpers.js');
            injectCarryForwardStartPoint = helpers.injectCarryForwardStartPoint;
        });

        test('injects carry-forward value at filter start when data exists before filter', () => {
            // Full series with data before and after filter start
            const fullSeries = [
                { date: '2025-12-01', value: 500000 },
                { date: '2025-12-15', value: 700000 },
                { date: '2025-12-31', value: 764000 }, // Last point before filter
                { date: '2026-01-04', value: 780000 }, // First point in filter range
                { date: '2026-01-10', value: 800000 },
            ];

            // Filtered data only contains points from 2026
            const filteredData = [
                { date: new Date('2026-01-04'), value: 780000 },
                { date: new Date('2026-01-10'), value: 800000 },
            ];

            const filterFrom = new Date('2026-01-01');

            const result = injectCarryForwardStartPoint(
                filteredData,
                fullSeries,
                filterFrom,
                'value'
            );

            // Should inject a synthetic point at filterFrom with the last value before filter
            expect(result.length).toBe(3);
            expect(result[0].date.getTime()).toBe(filterFrom.getTime());
            expect(result[0].value).toBe(764000);
            expect(result[0].synthetic).toBe(true);
            expect(result[0].carryForward).toBe(true);
        });

        test('does not inject when no data exists before filter start', () => {
            const fullSeries = [
                { date: '2026-01-04', value: 780000 },
                { date: '2026-01-10', value: 800000 },
            ];

            const filteredData = [
                { date: new Date('2026-01-04'), value: 780000 },
                { date: new Date('2026-01-10'), value: 800000 },
            ];

            const filterFrom = new Date('2026-01-01');

            const result = injectCarryForwardStartPoint(
                filteredData,
                fullSeries,
                filterFrom,
                'value'
            );

            // Should not inject since no data before filter
            expect(result.length).toBe(2);
            expect(result[0].value).toBe(780000);
        });

        test('does not inject when first filtered point is at filter start', () => {
            const fullSeries = [
                { date: '2025-12-31', value: 764000 },
                { date: '2026-01-01', value: 770000 }, // Point exactly at filter start
            ];

            const filteredData = [{ date: new Date('2026-01-01'), value: 770000 }];

            const filterFrom = new Date('2026-01-01');

            const result = injectCarryForwardStartPoint(
                filteredData,
                fullSeries,
                filterFrom,
                'value'
            );

            // Should not inject since data already starts at filter start
            expect(result.length).toBe(1);
            expect(result[0].value).toBe(770000);
        });

        test('injects carry-forward value even if filteredData is empty', () => {
            const fullSeries = [
                { date: '2025-12-01', value: 500000 },
                { date: '2025-12-15', value: 700000 },
                { date: '2025-12-31', value: 764000 }, // Last point before filter
            ];

            const filteredData = [];
            const filterFrom = new Date('2026-01-01');

            const result = injectCarryForwardStartPoint(
                filteredData,
                fullSeries,
                filterFrom,
                'value'
            );

            // Should inject a synthetic point at filterFrom with the last value before filter
            expect(result.length).toBe(1);
            expect(result[0].date.getTime()).toBe(filterFrom.getTime());
            expect(result[0].value).toBe(764000);
            expect(result[0].synthetic).toBe(true);
            expect(result[0].carryForward).toBe(true);
        });

        test('buildContributionSeriesFromTransactions handles inconsistent date formats and non-USD currency correctly', async () => {
            // This test checks if mixed date formats (YYYY-MM-DD vs YYYY/MM/DD)
            // or different capitalizations could cause issues in cumulative calculation.

            jest.resetModules();
            const state = await import('@js/transactions/state.js');
            const contribution = await import('@js/transactions/chart/data/contribution.js');
            const utils = await import('@js/transactions/utils.js');

            // Mock selected currency to EUR
            state.transactionState.selectedCurrency = 'EUR';

            const transactions = [
                { tradeDate: '2024-01-01', netAmount: '100.00', orderType: 'Buy' },
                { tradeDate: '2024-01-02', netAmount: '50.00', orderType: 'Buy' },
                { tradeDate: '2024-01-03', netAmount: '20.00', orderType: 'Buy' },
            ];

            // Mock FX rate to always return 0.9 (except for specific date if we want to test failures)
            jest.spyOn(utils, 'convertValueToCurrency').mockImplementation(
                (val) => Number(val) * 0.9
            );

            const series = contribution.buildContributionSeriesFromTransactions(transactions, {
                currency: 'EUR',
            });

            // Day 1: 100 * 0.9 = 90
            // Day 2: (100+50) * 0.9 = 135
            // Day 3: (100+50+20) * 0.9 = 153
            expect(series[0].amount).toBe(90);
            expect(series[1].amount).toBe(135);
            expect(series[2].amount).toBe(153);

            // Now try inconsistent formats which might mess up sorting if not normalized
            const txMixed = [
                { tradeDate: '2024-01-01', netAmount: '100.00', orderType: 'Buy' },
                { tradeDate: '2024/01/02', netAmount: '50.00', orderType: 'Buy' }, // mixed format
                { tradeDate: '2024-01-03', netAmount: '20.00', orderType: 'Buy' },
            ];

            const seriesMixed = contribution.buildContributionSeriesFromTransactions(txMixed, {
                currency: 'EUR',
            });

            seriesMixed.forEach((p, i) => {
                expect(p.amount).toBeGreaterThan(0);
                if (i > 0) {
                    expect(p.amount).toBeGreaterThanOrEqual(seriesMixed[i - 1].amount);
                }
            });
        });

        test('buildContributionSeriesFromTransactions handles duplicate or messy dates without resetting to zero', async () => {
            jest.resetModules();
            const state = await import('@js/transactions/state.js');
            const contribution = await import('@js/transactions/chart/data/contribution.js');

            // USD mode
            state.transactionState.selectedCurrency = 'USD';

            const transactions = [
                { tradeDate: '2024-01-01', netAmount: '100.00', orderType: 'Buy' },
                { tradeDate: '2024-01-01 ', netAmount: '50.00', orderType: 'Buy' }, // Duplicate with space
                { tradeDate: '2024-01-02', netAmount: '20.00', orderType: 'Buy' },
            ];

            const series = contribution.buildContributionSeriesFromTransactions(transactions);

            // Should have Day 1 (150) and Day 2 (170)
            series.forEach((p) => {
                expect(p.amount).toBeGreaterThan(0);
            });
        });

        test('buildContributionSeriesFromTransactions maintains cumulative sum and correct keys for non-USD', async () => {
            jest.resetModules();
            const state = await import('@js/transactions/state.js');
            const contribution = await import('@js/transactions/chart/data/contribution.js');
            const utils = await import('@js/transactions/utils.js');

            state.transactionState.selectedCurrency = 'GBP';
            jest.spyOn(utils, 'convertValueToCurrency').mockImplementation(
                (val) => Number(val) * 0.8
            );

            const transactions = [
                { tradeDate: '2024-01-01', netAmount: '100.00', orderType: 'Buy' },
                { tradeDate: '2024-01-10', netAmount: '100.00', orderType: 'Buy' },
            ];

            const series = contribution.buildContributionSeriesFromTransactions(transactions, {
                currency: 'GBP',
            });

            // Should have:
            // 0: Day 1 (Tx) -> amount: 80
            // 1: Day 9 (Padding) -> amount: 80
            // 2: Day 10 (Tx) -> amount: 160

            expect(series.length).toBeGreaterThanOrEqual(3);
            expect(series[0].amount).toBe(80);
            expect(series[series.length - 1].amount).toBe(160);

            // Check that NONE of the points have amount: 0 (after Day 1)
            series.forEach((p, i) => {
                if (i > 0 && !p.synthetic) {
                    expect(p.amount).toBeGreaterThan(0);
                    expect(p.netAmount).toBeDefined();
                }
            });
        });

        test('buildContributionSeriesFromTransactions sorts mixed date formats correctly (not alphabetically)', async () => {
            jest.resetModules();
            const contribution = await import('@js/transactions/chart/data/contribution.js');

            const transactions = [
                { tradeDate: '2025-01-01', netAmount: '100.00', orderType: 'Buy' },
                { tradeDate: '12/31/2024', netAmount: '50.00', orderType: 'Buy' }, // MM/DD/YYYY
                { tradeDate: '2025-01-02', netAmount: '20.00', orderType: 'Buy' },
            ];

            const series = contribution.buildContributionSeriesFromTransactions(transactions);

            // We expect chronological: 2024-12-31, 2025-01-01, 2025-01-02
            expect(series[0].tradeDate).toBe('2024-12-31');
            expect(series[0].amount).toBe(50);
            expect(series[1].tradeDate).toBe('2025-01-01');
            expect(series[1].amount).toBe(150);
            expect(series[2].tradeDate).toBe('2025-01-02');
            expect(series[2].amount).toBe(170);
        });
    });

    describe('applyDrawdownToSeries with historical peak', () => {
        let applyDrawdownToSeries;

        beforeEach(async () => {
            jest.resetModules();
            const contribution = await import('@js/transactions/chart/data/contribution.js');
            applyDrawdownToSeries = contribution.applyDrawdownToSeries;
        });

        test('uses historical peak when provided', () => {
            const data = [
                { date: '2026-01-01', value: 800000 },
                { date: '2026-01-05', value: 850000 },
                { date: '2026-01-10', value: 820000 },
            ];

            // Historical peak from 2025 was 900000
            const historicalPeak = 900000;

            const result = applyDrawdownToSeries(data, 'value', historicalPeak);

            // First point: 800000 - 900000 = -100000
            expect(result[0].value).toBe(-100000);
            // Second point: 850000 - 900000 = -50000
            expect(result[1].value).toBe(-50000);
            // Third point: 820000 - 900000 = -80000
            expect(result[2].value).toBe(-80000);
        });

        test('starts at 0 when no historical peak (first value is ATH)', () => {
            const data = [
                { date: '2020-01-01', value: 100000 },
                { date: '2020-01-05', value: 150000 },
                { date: '2020-01-10', value: 120000 },
            ];

            // No historical data, so first value becomes peak
            const result = applyDrawdownToSeries(data, 'value', -Infinity);

            // First point: 100000 is the new peak, drawdown = 0
            expect(result[0].value).toBe(0);
            // Second point: 150000 is new peak, drawdown = 0
            expect(result[1].value).toBe(0);
            // Third point: 120000 - 150000 = -30000
            expect(result[2].value).toBe(-30000);
        });

        test('correctly calculates drawdown when filtered data exceeds historical peak', () => {
            const data = [
                { date: '2026-01-01', value: 900000 },
                { date: '2026-01-05', value: 950000 }, // Exceeds historical peak
                { date: '2026-01-10', value: 920000 },
            ];

            // Historical peak was 920000
            const historicalPeak = 920000;

            const result = applyDrawdownToSeries(data, 'value', historicalPeak);

            // First point: 900000 - 920000 = -20000
            expect(result[0].value).toBe(-20000);
            // Second point: 950000 becomes new peak, drawdown = 0
            expect(result[1].value).toBe(0);
            // Third point: 920000 - 950000 = -30000
            expect(result[2].value).toBe(-30000);
        });
    });

    describe('parseLocalDate timezone handling', () => {
        let parseLocalDate;

        beforeEach(async () => {
            jest.resetModules();
            const helpers = await import('@js/transactions/chart/helpers.js');
            parseLocalDate = helpers.parseLocalDate;
        });

        test('parses YYYY-MM-DD string as local date, not UTC', () => {
            // This is the critical test that would have caught the timezone bug
            // When using new Date('2024-01-01'), JavaScript parses it as UTC midnight
            // which in PST (UTC-8) becomes Dec 31, 2023 at 4:00 PM local time
            const result = parseLocalDate('2024-01-01');

            expect(result).toBeInstanceOf(Date);
            // Should be January 1st, 2024 in LOCAL time
            expect(result.getFullYear()).toBe(2024);
            expect(result.getMonth()).toBe(0); // January = 0
            expect(result.getDate()).toBe(1);
        });

        test('parses start-of-year filter correctly for x-axis labels', () => {
            // Simulates the default filter f:2024 which sets from: '2024-01-01'
            const filterDate = parseLocalDate('2024-01-01');

            // The month should be January (0), not December (11)
            // This is what caused the "Dec" label to appear on charts
            expect(filterDate.getMonth()).not.toBe(11); // NOT December
            expect(filterDate.getMonth()).toBe(0); // January

            // Verify the year is correct
            expect(filterDate.getFullYear()).toBe(2024);
        });

        test('handles Date object input correctly', () => {
            const inputDate = new Date(2024, 5, 15); // June 15, 2024 local time
            const result = parseLocalDate(inputDate);

            expect(result.getFullYear()).toBe(2024);
            expect(result.getMonth()).toBe(5); // June
            expect(result.getDate()).toBe(15);
        });

        test('handles timestamp input correctly', () => {
            const timestamp = new Date(2024, 2, 20).getTime(); // March 20, 2024 local time
            const result = parseLocalDate(timestamp);

            expect(result.getFullYear()).toBe(2024);
            expect(result.getMonth()).toBe(2); // March
            expect(result.getDate()).toBe(20);
        });

        test('returns null for invalid input', () => {
            expect(parseLocalDate(null)).toBeNull();
            expect(parseLocalDate(undefined)).toBeNull();
            expect(parseLocalDate('invalid')).toBeNull();
        });

        test('filter date comparison works correctly with data dates', () => {
            // This simulates the chart filtering logic
            const filterFrom = parseLocalDate('2024-01-01');
            const dataPointDate = new Date('2023-12-31T23:00:00Z'); // Dec 31, 2023 in UTC

            // The filter should correctly identify this as being BEFORE Jan 1, 2024 local time
            // This test ensures the filter logic works correctly with local dates
            // In most timezones, Dec 31 2023 23:00 UTC would be before Jan 1 2024 00:00 local
            expect(dataPointDate.getTime()).toBeLessThan(filterFrom.getTime());

            // The key point is that parseLocalDate creates a LOCAL midnight timestamp
            expect(filterFrom.getHours()).toBe(0);
            expect(filterFrom.getMinutes()).toBe(0);
            expect(filterFrom.getSeconds()).toBe(0);
        });
    });

    describe('injectSyntheticStartPoint', () => {
        let helpers;
        beforeEach(async () => {
            jest.resetModules();
            helpers = await import('@js/transactions/chart/helpers.js');
        });

        test('returns filteredData when no filterFrom provided', () => {
            const filtered = [{ date: new Date('2024-01-02'), value: 100 }];
            expect(helpers.injectSyntheticStartPoint(filtered, [])).toEqual(filtered);
        });

        test('returns filteredData when filteredData is empty or not an array', () => {
            expect(helpers.injectSyntheticStartPoint([], [], new Date())).toEqual([]);
            expect(helpers.injectSyntheticStartPoint(null, [], new Date())).toBeNull();
        });

        test('returns filteredData when fullSeries is empty or not an array', () => {
            const filtered = [{ date: new Date('2024-01-02'), value: 100 }];
            expect(helpers.injectSyntheticStartPoint(filtered, [], new Date())).toEqual(filtered);
            expect(helpers.injectSyntheticStartPoint(filtered, null, new Date())).toEqual(filtered);
        });

        test('returns filteredData if firstFiltered time is invalid', () => {
            const filtered = [{ date: 'invalid-date', value: 100 }];
            expect(helpers.injectSyntheticStartPoint(filtered, [], new Date())).toEqual(filtered);
        });

        test('injects point at filterFrom if synthetic point exists before filter', () => {
            const filterFrom = new Date('2024-01-01');
            const fullSeries = [
                { date: new Date('2023-12-31'), value: 50, synthetic: true },
                { date: new Date('2024-01-02'), value: 100 }
            ];
            const filteredData = [ fullSeries[1] ];
            const result = helpers.injectSyntheticStartPoint(filteredData, fullSeries, filterFrom);
            expect(result.length).toBe(2);
            expect(result[0].synthetic).toBe(true);
            expect(result[0].date.getTime()).toBe(filterFrom.getTime());
            expect(result[0].value).toBe(50);
        });

        test('does not inject if point at filterFrom already exists', () => {
            const filterFrom = new Date('2024-01-01');
            const fullSeries = [
                { date: new Date('2023-12-31'), value: 50, synthetic: true },
                { date: new Date('2024-01-01'), value: 100 }
            ];
            const filteredData = [ fullSeries[1] ];
            const result = helpers.injectSyntheticStartPoint(filteredData, fullSeries, filterFrom);
            expect(result.length).toBe(1);
        });

        test('injects synthetic point using previous value', () => {
            const filterFrom = new Date('2024-01-01');
            const fullSeries = [
                { date: new Date('2023-12-30'), value: 0 },
                { date: new Date('2023-12-31'), value: 0, synthetic: true },
                { date: new Date('2024-01-02'), value: 100 }
            ];
            const filteredData = [ fullSeries[2] ];
            const result = helpers.injectSyntheticStartPoint(filteredData, fullSeries, filterFrom);
            expect(result.length).toBe(2);
            expect(result[0].synthetic).toBe(true);
            expect(result[0].date.getTime()).toBe(filterFrom.getTime());
            expect(result[0].value).toBe(0);
        });
    });

    describe('injectCarryForwardStartPoint', () => {
        let helpers;
        beforeEach(async () => {
            jest.resetModules();
            helpers = await import('@js/transactions/chart/helpers.js');
        });

        test('returns filteredData when inputs are invalid', () => {
            const filtered = [{ date: new Date('2024-01-02'), value: 100 }];
            expect(helpers.injectCarryForwardStartPoint(filtered, [], null)).toEqual(filtered);
            expect(helpers.injectCarryForwardStartPoint(null, [], new Date())).toBeNull();
            expect(helpers.injectCarryForwardStartPoint(filtered, null, new Date())).toEqual(filtered);
            expect(helpers.injectCarryForwardStartPoint(filtered, [], new Date('invalid'))).toEqual(filtered);
        });

        test('injects carry-forward point at filterFrom with last available value', () => {
            const filterFrom = new Date('2024-01-01');
            const fullSeries = [
                { date: new Date('2023-12-15'), value: 200 },
                { date: new Date('2024-01-05'), value: 300 }
            ];
            const filteredData = [ fullSeries[1] ];
            const result = helpers.injectCarryForwardStartPoint(filteredData, fullSeries, filterFrom);
            expect(result.length).toBe(2);
            expect(result[0].carryForward).toBe(true);
            expect(result[0].synthetic).toBe(true);
            expect(result[0].date.getTime()).toBe(filterFrom.getTime());
            expect(result[0].value).toBe(200);
        });

        test('does not inject if first filtered point is at or before filterFrom', () => {
            const filterFrom = new Date('2024-01-01');
            const fullSeries = [
                { date: new Date('2023-12-15'), value: 200 },
                { date: new Date('2024-01-01'), value: 300 }
            ];
            const filteredData = [ fullSeries[1] ];
            const result = helpers.injectCarryForwardStartPoint(filteredData, fullSeries, filterFrom);
            expect(result.length).toBe(1);
            expect(result).toEqual(filteredData);
        });

        test('returns filteredData if no points before filterFrom', () => {
            const filterFrom = new Date('2024-01-01');
            const fullSeries = [
                { date: new Date('2024-01-05'), value: 300 }
            ];
            const filteredData = [ fullSeries[0] ];
            const result = helpers.injectCarryForwardStartPoint(filteredData, fullSeries, filterFrom);
            expect(result).toEqual(filteredData);
        });
    });
});
