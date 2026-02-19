import { jest } from '@jest/globals';

describe('PE chart helpers', () => {
    describe('buildPESeries', () => {
        let buildPESeries;

        beforeEach(async () => {
            jest.resetModules();
            const mod = await import('@js/transactions/chart/renderers/pe.js');
            buildPESeries = mod.buildPESeries;
        });

        test('returns empty array for empty dates', () => {
            const result = buildPESeries([], [], {}, null, null, null);
            expect(result).toEqual([]);
        });

        test('returns empty array for null portfolioPE', () => {
            const result = buildPESeries(['2025-01-01'], null, {}, null, null, null);
            expect(result).toEqual([]);
        });

        test('returns empty array for empty portfolioPE', () => {
            const result = buildPESeries(['2025-01-01'], [], {}, null, null, null);
            expect(result).toEqual([]);
        });

        test('builds series with valid PE values', () => {
            const dates = ['2025-01-01', '2025-01-02', '2025-01-03'];
            const portfolioPE = [22.1, 22.3, 22.5];
            const tickerPE = {
                GOOG: [24.5, 24.7, 24.9],
                ANET: [45.2, 45.0, 44.8],
            };

            const result = buildPESeries(dates, portfolioPE, tickerPE, null, null, null);

            expect(result).toHaveLength(3);
            expect(result[0].pe).toBeCloseTo(22.1, 5);
            expect(result[0].tickerPEs).toEqual({ GOOG: 24.5, ANET: 45.2 });
            expect(result[2].pe).toBeCloseTo(22.5, 5);
        });

        test('skips null PE values', () => {
            const dates = ['2025-01-01', '2025-01-02', '2025-01-03'];
            const portfolioPE = [22.1, null, 22.5];

            const result = buildPESeries(dates, portfolioPE, {}, null, null, null);

            expect(result).toHaveLength(2);
            expect(result[0].pe).toBeCloseTo(22.1, 5);
            expect(result[1].pe).toBeCloseTo(22.5, 5);
        });

        test('filters by date range (from)', () => {
            const dates = ['2025-01-01', '2025-06-01', '2025-12-01'];
            const portfolioPE = [20.0, 22.0, 24.0];

            const filterFrom = new Date('2025-06-01');
            const result = buildPESeries(dates, portfolioPE, {}, null, filterFrom, null);

            expect(result).toHaveLength(2);
            expect(result[0].pe).toBeCloseTo(22.0, 5);
        });

        test('filters by date range (to)', () => {
            const dates = ['2025-01-01', '2025-06-01', '2025-12-01'];
            const portfolioPE = [20.0, 22.0, 24.0];

            const filterTo = new Date('2025-06-01');
            const result = buildPESeries(dates, portfolioPE, {}, null, null, filterTo);

            expect(result).toHaveLength(2);
            expect(result[1].pe).toBeCloseTo(22.0, 5);
        });

        test('includes per-ticker PE in tickerPEs', () => {
            const dates = ['2025-01-01'];
            const portfolioPE = [25.0];
            const tickerPE = {
                GOOG: [30.0],
                ANET: [50.0],
                VT: [19.2],
            };

            const result = buildPESeries(dates, portfolioPE, tickerPE, null, null, null);

            expect(result).toHaveLength(1);
            expect(result[0].tickerPEs).toEqual({
                GOOG: 30.0,
                ANET: 50.0,
                VT: 19.2,
            });
        });

        test('excludes null ticker PE values from tickerPEs', () => {
            const dates = ['2025-01-01'];
            const portfolioPE = [25.0];
            const tickerPE = {
                GOOG: [30.0],
                ANET: [null],
                VT: [19.2],
            };

            const result = buildPESeries(dates, portfolioPE, tickerPE, null, null, null);

            expect(result).toHaveLength(1);
            expect(result[0].tickerPEs).toEqual({
                GOOG: 30.0,
                VT: 19.2,
            });
        });

        test('handles no ticker PE data', () => {
            const dates = ['2025-01-01', '2025-01-02'];
            const portfolioPE = [20.0, 21.0];

            const result = buildPESeries(dates, portfolioPE, null, null, null, null);

            expect(result).toHaveLength(2);
            expect(result[0].tickerPEs).toEqual({});
            expect(result[1].tickerPEs).toEqual({});
        });

        test('handles single data point', () => {
            const dates = ['2025-06-15'];
            const portfolioPE = [26.58];
            const tickerPE = { GOOG: [28.3] };

            const result = buildPESeries(dates, portfolioPE, tickerPE, null, null, null);

            expect(result).toHaveLength(1);
            expect(result[0].pe).toBeCloseTo(26.58, 5);
            expect(result[0].date).toEqual(new Date('2025-06-15'));
        });
    });
});
