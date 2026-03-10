import { simpleMovingAverage, exponentialMovingAverage } from '../../../js/utils/smoothing.js';

describe('smoothing utilities', () => {
    describe('simpleMovingAverage', () => {
        it('returns input for non-arrays', () => {
            expect(simpleMovingAverage(null)).toBeNull();
            expect(simpleMovingAverage(undefined)).toBeUndefined();
            expect(simpleMovingAverage(123)).toBe(123);
            expect(simpleMovingAverage('string')).toBe('string');
            expect(simpleMovingAverage({})).toEqual({});
        });

        it('returns input for empty arrays', () => {
            const empty = [];
            expect(simpleMovingAverage(empty)).toBe(empty); // Reference equality
        });

        it('returns input when data length is less than window', () => {
            const data = [
                { x: 1, y: 10 },
                { x: 2, y: 20 },
            ];
            expect(simpleMovingAverage(data, 3)).toBe(data); // Reference equality
        });

        it('calculates SMA with default parameters (window=3, preserveEnd=true)', () => {
            const data = [
                { x: 1, y: 10 },
                { x: 2, y: 20 },
                { x: 3, y: 30 },
                { x: 4, y: 40 },
                { x: 5, y: 50 },
            ];

            const result = simpleMovingAverage(data);

            // Index 0: window [10, 20, 30] (avg = 20) -> Math.floor(3/2) = 1. start = max(0, -1)=0. end = min(5, 3)=3. slice(0, 3) = [10, 20, 30] (avg = 20)
            // Index 1: window [10, 20, 30] (avg = 20) -> start = max(0, 0)=0. end = min(5, 3)=3. slice(0, 3) = [10, 20, 30] (avg = 20)
            // Index 2: window [20, 30, 40] (avg = 30) -> start = max(0, 1)=1. end = min(5, 4)=4. slice(1, 4) = [20, 30, 40] (avg = 30)
            // Index 3: window [30, 40, 50] (avg = 40) -> start = max(0, 2)=2. end = min(5, 5)=5. slice(2, 5) = [30, 40, 50] (avg = 40)
            // Index 4: preserved (y = 50)
            expect(result).toEqual([
                { x: 1, y: 20 },
                { x: 2, y: 20 },
                { x: 3, y: 30 },
                { x: 4, y: 40 },
                { x: 5, y: 50 },
            ]);
        });

        it('calculates SMA with preserveEnd=false', () => {
            const data = [
                { x: 1, y: 10 },
                { x: 2, y: 20 },
                { x: 3, y: 30 },
                { x: 4, y: 40 },
                { x: 5, y: 50 },
            ];

            const result = simpleMovingAverage(data, 3, false);

            // Index 4: window [30, 40, 50] (avg = 40) -> start = max(0, 3)=3. end = min(5, 6)=5. slice(3, 5) = [40, 50] (avg = 45)
            expect(result).toEqual([
                { x: 1, y: 20 },
                { x: 2, y: 20 },
                { x: 3, y: 30 },
                { x: 4, y: 40 },
                { x: 5, y: 45 },
            ]);
        });

        it('calculates SMA with custom window size', () => {
            const data = [
                { x: 1, y: 10 },
                { x: 2, y: 20 },
                { x: 3, y: 30 },
                { x: 4, y: 40 },
                { x: 5, y: 50 },
            ];

            const result = simpleMovingAverage(data, 5, true);

            // Index 0: window [10, 20, 30, 40, 50] (avg = 30) -> Math.floor(5/2) = 2. start = max(0, -2)=0. end = min(5, 5)=5. slice(0, 5) = [10, 20, 30, 40, 50] (avg = 30)
            // Index 1: window [10, 20, 30, 40, 50] (avg = 30) -> start = max(0, -1)=0. end = min(5, 5)=5. slice(0, 5) = [10, 20, 30, 40, 50] (avg = 30)
            // Index 2: window [10, 20, 30, 40, 50] (avg = 30) -> start = max(0, 0)=0. end = min(5, 5)=5. slice(0, 5) = [10, 20, 30, 40, 50] (avg = 30)
            // Index 3: window [20, 30, 40, 50] (avg = 35) -> start = max(0, 1)=1. end = min(5, 6)=5. slice(1, 5) = [20, 30, 40, 50] (avg = 35)
            // Index 4: preserved (y = 50)
            expect(result).toEqual([
                { x: 1, y: 30 },
                { x: 2, y: 30 },
                { x: 3, y: 30 },
                { x: 4, y: 35 },
                { x: 5, y: 50 },
            ]);
        });
    });

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
});
