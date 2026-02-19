import { jest } from '@jest/globals';

describe('Concentration chart helpers', () => {
    describe('buildConcentrationSeries', () => {
        let buildConcentrationSeries;

        beforeEach(async () => {
            jest.resetModules();
            const mod = await import('@js/transactions/chart/renderers/concentration.js');
            buildConcentrationSeries = mod.buildConcentrationSeries;
        });

        test('returns empty array for empty dates', () => {
            const result = buildConcentrationSeries([], {}, null, null);
            expect(result).toEqual([]);
        });

        test('returns empty array for null composition', () => {
            const result = buildConcentrationSeries(['2025-01-01'], null, null, null);
            expect(result).toEqual([]);
        });

        test('returns empty array when no tickers', () => {
            const result = buildConcentrationSeries(['2025-01-01'], {}, null, null);
            expect(result).toEqual([]);
        });

        test('computes HHI = 1.0 for single-ticker portfolio', () => {
            const dates = ['2025-01-01', '2025-01-02'];
            const composition = {
                AAPL: [100, 100],
            };

            const result = buildConcentrationSeries(dates, composition, null, null);

            expect(result).toHaveLength(2);
            expect(result[0].hhi).toBeCloseTo(1.0, 5);
            expect(result[0].effectiveHoldings).toBeCloseTo(1.0, 5);
            expect(result[1].hhi).toBeCloseTo(1.0, 5);
        });

        test('computes HHI = 0.25 for equal-weight 4-ticker portfolio', () => {
            const dates = ['2025-01-01'];
            const composition = {
                AAPL: [25],
                GOOG: [25],
                MSFT: [25],
                AMZN: [25],
            };

            const result = buildConcentrationSeries(dates, composition, null, null);

            expect(result).toHaveLength(1);
            // HHI = 4 × (0.25)² = 0.25
            expect(result[0].hhi).toBeCloseTo(0.25, 5);
            // Effective holdings = 1 / 0.25 = 4
            expect(result[0].effectiveHoldings).toBeCloseTo(4.0, 5);
        });

        test('computes correct HHI for unequal weights', () => {
            const dates = ['2025-06-15'];
            const composition = {
                AAPL: [60],
                GOOG: [30],
                MSFT: [10],
            };

            const result = buildConcentrationSeries(dates, composition, null, null);

            expect(result).toHaveLength(1);
            // HHI = (0.6)² + (0.3)² + (0.1)² = 0.36 + 0.09 + 0.01 = 0.46
            expect(result[0].hhi).toBeCloseTo(0.46, 5);
            expect(result[0].effectiveHoldings).toBeCloseTo(1 / 0.46, 3);
        });

        test('normalizes weights that do not sum to 100', () => {
            const dates = ['2025-01-01'];
            // Weights sum to 50 (not 100) — should normalize
            const composition = {
                AAPL: [30],
                GOOG: [20],
            };

            const result = buildConcentrationSeries(dates, composition, null, null);

            expect(result).toHaveLength(1);
            // Normalized: AAPL = 0.6, GOOG = 0.4
            // HHI = 0.36 + 0.16 = 0.52
            expect(result[0].hhi).toBeCloseTo(0.52, 5);
        });

        test('filters by date range (from)', () => {
            const dates = ['2025-01-01', '2025-06-01', '2025-12-01'];
            const composition = {
                AAPL: [50, 60, 70],
                GOOG: [50, 40, 30],
            };

            // new Date('2025-06-01') parses to UTC midnight, so filterFrom must
            // be at or before that value to include June.
            const filterFrom = new Date('2025-06-01');

            const result = buildConcentrationSeries(dates, composition, filterFrom, null);

            // Only June and December should be included
            expect(result).toHaveLength(2);
        });

        test('filters by date range (to)', () => {
            const dates = ['2025-01-01', '2025-06-01', '2025-12-01'];
            const composition = {
                AAPL: [50, 60, 70],
                GOOG: [50, 40, 30],
            };

            // new Date('2025-06-01') parses to UTC midnight
            const filterTo = new Date('2025-06-01');

            const result = buildConcentrationSeries(dates, composition, null, filterTo);

            // Only January and June should be included
            expect(result).toHaveLength(2);
        });

        test('skips days where all weights are zero', () => {
            const dates = ['2025-01-01', '2025-01-02', '2025-01-03'];
            const composition = {
                AAPL: [50, 0, 50],
                GOOG: [50, 0, 50],
            };

            const result = buildConcentrationSeries(dates, composition, null, null);

            // Day 2 has all zeros and should be skipped
            expect(result).toHaveLength(2);
        });

        test('handles multiple days with changing concentration', () => {
            const dates = ['2025-01-01', '2025-01-02', '2025-01-03'];
            const composition = {
                AAPL: [50, 70, 100],
                GOOG: [50, 30, 0],
            };

            const result = buildConcentrationSeries(dates, composition, null, null);

            // Day 1: equal weight → HHI = 0.5
            expect(result[0].hhi).toBeCloseTo(0.5, 5);

            // Day 2: AAPL 70%, GOOG 30% → HHI = 0.49 + 0.09 = 0.58
            expect(result[1].hhi).toBeCloseTo(0.58, 5);

            // Day 3: only AAPL → HHI = 1.0
            expect(result[2].hhi).toBeCloseTo(1.0, 5);
        });

        test('ignores negative weights', () => {
            const dates = ['2025-01-01'];
            const composition = {
                AAPL: [80],
                GOOG: [-10],
                MSFT: [30],
            };

            const result = buildConcentrationSeries(dates, composition, null, null);

            expect(result).toHaveLength(1);
            // Total positive weight = 80 + 30 = 110
            // Normalized: AAPL = 80/110, MSFT = 30/110
            const wA = 80 / 110;
            const wM = 30 / 110;
            const expectedHHI = wA * wA + wM * wM;
            expect(result[0].hhi).toBeCloseTo(expectedHHI, 5);
        });
    });
});
