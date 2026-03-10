import { exponentialMovingAverage } from '../../../js/utils/smoothing.js';

describe('exponentialMovingAverage', () => {
    it('returns the same array if it is empty', () => {
        expect(exponentialMovingAverage([])).toEqual([]);
    });

    it('returns the data back if data is invalid', () => {
        expect(exponentialMovingAverage(null)).toBeNull();
        expect(exponentialMovingAverage(undefined)).toBeUndefined();
    });

    it('returns the same array if it has only one element', () => {
        const data = [{ x: 1, y: 10 }];
        expect(exponentialMovingAverage(data)).toEqual(data);
    });

    it('calculates the EMA correctly for a simple sequence', () => {
        const data = [
            { x: 1, y: 10 },
            { x: 2, y: 20 },
            { x: 3, y: 30 },
            { x: 4, y: 40 },
        ];

        // alpha = 0.5
        // EMA_0 = 10
        // EMA_1 = 0.5 * 20 + 0.5 * 10 = 15
        // EMA_2 = 0.5 * 30 + 0.5 * 15 = 22.5
        // EMA_3 = 0.5 * 40 + 0.5 * 22.5 = 31.25

        const result = exponentialMovingAverage(data, 0.5, false);

        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({ x: 1, y: 10 });
        expect(result[1]).toEqual({ x: 2, y: 15 });
        expect(result[2]).toEqual({ x: 3, y: 22.5 });
        expect(result[3]).toEqual({ x: 4, y: 31.25 });
    });

    it('preserves the last point when preserveEnd is true', () => {
        const data = [
            { x: 1, y: 10 },
            { x: 2, y: 20 },
            { x: 3, y: 30 },
            { x: 4, y: 40 },
        ];

        const result = exponentialMovingAverage(data, 0.5, true);

        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({ x: 1, y: 10 });
        expect(result[1]).toEqual({ x: 2, y: 15 });
        expect(result[2]).toEqual({ x: 3, y: 22.5 });
        expect(result[3]).toEqual({ x: 4, y: 40 }); // Last point preserved exactly
    });

    it('applies alpha correctly', () => {
        const data = [
            { x: 1, y: 100 },
            { x: 2, y: 50 },
        ];

        // high alpha = more weight to recent value
        const highAlphaResult = exponentialMovingAverage(data, 0.9, false);
        // EMA_1 = 0.9 * 50 + 0.1 * 100 = 45 + 10 = 55
        expect(highAlphaResult[1].y).toBeCloseTo(55);

        // low alpha = more weight to previous smoothed value
        const lowAlphaResult = exponentialMovingAverage(data, 0.1, false);
        // EMA_1 = 0.1 * 50 + 0.9 * 100 = 5 + 90 = 95
        expect(lowAlphaResult[1].y).toBeCloseTo(95);
    });
});
