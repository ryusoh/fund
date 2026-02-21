import { buildDrawdownSeries } from '../../../js/transactions/chart.js';

describe('buildDrawdownSeries', () => {
    test('returns empty array for invalid input', () => {
        expect(buildDrawdownSeries([])).toEqual([]);
        expect(buildDrawdownSeries(null)).toEqual([]);
    });

    test('calculates drawdown for monotonically increasing series', () => {
        const series = [
            { date: '2023-01-01', value: 100 },
            { date: '2023-01-02', value: 105 },
            { date: '2023-01-03', value: 110 },
        ];
        const result = buildDrawdownSeries(series);
        expect(result).toHaveLength(3);
        expect(result[0].value).toBeCloseTo(0);
        expect(result[1].value).toBeCloseTo(0);
        expect(result[2].value).toBeCloseTo(0);
        expect(result[0].rawPoint).toBeUndefined(); // Assuming verified object structure
    });

    test('calculates drawdown correctly for a drop', () => {
        const series = [
            { date: '2023-01-01', value: 100 },
            { date: '2023-01-02', value: 90 }, // 10% drop
            { date: '2023-01-03', value: 80 }, // 20% drop from peak (100)
        ];
        const result = buildDrawdownSeries(series);
        expect(result[0].value).toBeCloseTo(0);
        expect(result[1].value).toBeCloseTo(((90 - 100) / 100) * 100); // -10
        expect(result[2].value).toBeCloseTo(((80 - 100) / 100) * 100); // -20
    });

    test('handles recovery and new peak', () => {
        const series = [
            { date: '2023-01-01', value: 100 }, // Peak
            { date: '2023-01-02', value: 80 }, // -20%
            { date: '2023-01-03', value: 90 }, // -10% from peak
            { date: '2023-01-04', value: 110 }, // New Peak
            { date: '2023-01-05', value: 99 }, // -10% from new peak (110)
        ];
        const result = buildDrawdownSeries(series);
        expect(result[0].value).toBeCloseTo(0);
        expect(result[1].value).toBeCloseTo(-20);
        expect(result[2].value).toBeCloseTo(-10);
        expect(result[3].value).toBeCloseTo(0);
        // (99 - 110) / 110 = -11 / 110 = -0.1 = -10%
        expect(result[4].value).toBeCloseTo(-10);
    });

    test('handles unordered input', () => {
        const series = [
            { date: '2023-01-02', value: 90 },
            { date: '2023-01-01', value: 100 },
        ];
        const result = buildDrawdownSeries(series);
        expect(result[0].date).toEqual(new Date(2023, 0, 1));
        expect(result[0].value).toBeCloseTo(0);
        expect(result[1].date).toEqual(new Date(2023, 0, 2));
        expect(result[1].value).toBeCloseTo(-10);
    });

    test('handles zero values correctly', () => {
        // If value drops to 0? HWM=100. (0-100)/100 = -100%.
        const series = [
            { date: '2023-01-01', value: 100 },
            { date: '2023-01-02', value: 0 },
        ];
        const result = buildDrawdownSeries(series);
        expect(result[1].value).toBeCloseTo(-100);
    });
});
