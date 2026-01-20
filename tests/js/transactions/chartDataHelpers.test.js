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
});
