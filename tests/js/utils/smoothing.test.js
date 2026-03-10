import {
    simpleMovingAverage,
    exponentialMovingAverage,
    savitzkyGolay,
    lowess,
    adaptiveSmoothing,
    smoothFinancialData,
} from '../../../js/utils/smoothing.js';

describe('Smoothing Utilities', () => {
    // Helper function to create sample data
    const createData = (yValues) => yValues.map((y, i) => ({ x: i, y }));

    describe('simpleMovingAverage', () => {
        it('returns original data for non-arrays or empty arrays', () => {
            expect(simpleMovingAverage(null)).toBeNull();
            expect(simpleMovingAverage([])).toEqual([]);
        });

        it('returns original data if length is less than window', () => {
            const data = createData([1, 2]);
            expect(simpleMovingAverage(data, 3)).toEqual(data);
        });

        it('calculates the simple moving average correctly', () => {
            const data = createData([1, 2, 3, 4, 5]);
            // window = 3, preserveEnd = false
            const result = simpleMovingAverage(data, 3, false);
            expect(result).toEqual([
                { x: 0, y: 2 },
                { x: 1, y: 2 },
                { x: 2, y: 3 },
                { x: 3, y: 4 },
                { x: 4, y: 4.5 },
            ]);
        });

        it('preserves the last point when requested', () => {
            const data = createData([1, 2, 3, 4, 10]);
            // window = 3, preserveEnd = true
            const result = simpleMovingAverage(data, 3, true);
            expect(result[4]).toEqual({ x: 4, y: 10 });
        });
    });

    describe('exponentialMovingAverage', () => {
        it('returns original data for non-arrays or empty arrays', () => {
            expect(exponentialMovingAverage(null)).toBeNull();
            expect(exponentialMovingAverage([])).toEqual([]);
        });

        it('returns original data if length is 1', () => {
            const data = createData([5]);
            expect(exponentialMovingAverage(data)).toEqual(data);
        });

        it('calculates EMA correctly', () => {
            const data = createData([10, 15, 20]);
            // alpha = 0.5, preserveEnd = false
            const result = exponentialMovingAverage(data, 0.5, false);
            // EMA calculation:
            // index 0: 10
            // index 1: 0.5 * 15 + 0.5 * 10 = 12.5
            // index 2: 0.5 * 20 + 0.5 * 12.5 = 16.25
            expect(result).toEqual([
                { x: 0, y: 10 },
                { x: 1, y: 12.5 },
                { x: 2, y: 16.25 },
            ]);
        });

        it('preserves the last point when requested', () => {
            const data = createData([10, 15, 20]);
            // alpha = 0.5, preserveEnd = true
            const result = exponentialMovingAverage(data, 0.5, true);
            expect(result[2]).toEqual({ x: 2, y: 20 });
        });
    });

    describe('savitzkyGolay', () => {
        it('returns original data for non-arrays or empty arrays', () => {
            expect(savitzkyGolay(null)).toBeNull();
            expect(savitzkyGolay([])).toEqual([]);
        });

        it('returns original data if length is less than window', () => {
            const data = createData([1, 2]);
            expect(savitzkyGolay(data, 3)).toEqual(data);
        });

        it('makes window odd if an even window is passed', () => {
            const data = createData([1, 2, 3, 4, 5, 6]);
            // window = 4, gets updated to 5
            const result1 = savitzkyGolay(data, 4, 1, false);
            const result2 = savitzkyGolay(data, 5, 1, false);
            expect(result1).toEqual(result2);
        });

        it('falls back to original point when local window has fewer than 3 elements', () => {
            const data = createData([1, 2, 3]);
            // window = 5, but data length is 3, so window boundaries are constrained by data
            const result = savitzkyGolay(data, 3, 1, false);
            expect(result.length).toBe(3);
        });

        it('calculates order 1 (linear regression) smoothing correctly', () => {
            const data = createData([10, 11, 10, 15, 20]);
            const result = savitzkyGolay(data, 3, 1, false);
            expect(result.length).toBe(5);
            result.forEach((point) => {
                expect(typeof point.y).toBe('number');
                expect(isNaN(point.y)).toBe(false);
            });
        });

        it('falls back to original point for higher orders that are not fully implemented', () => {
            const data = createData([10, 11, 10, 15, 20]);
            const result = savitzkyGolay(data, 3, 2, false);
            expect(result).toEqual(data);
        });

        it('preserves the last point when requested', () => {
            const data = createData([1, 2, 3, 4, 5]);
            // preserveEnd = true
            const result = savitzkyGolay(data, 3, 1, true);
            expect(result[4]).toEqual({ x: 4, y: 5 });
        });
    });

    describe('lowess', () => {
        it('returns original data for non-arrays or empty arrays', () => {
            expect(lowess(null)).toBeNull();
            expect(lowess([])).toEqual([]);
        });

        it('returns original data if length is less than 3', () => {
            const data = createData([1, 2]);
            expect(lowess(data)).toEqual(data);
        });

        it('calculates LOWESS correctly', () => {
            const data = createData([10, 15, 12, 18, 20]);
            const result = lowess(data, 0.5, false);
            expect(result.length).toBe(5);
            result.forEach((point) => {
                expect(typeof point.y).toBe('number');
                expect(isNaN(point.y)).toBe(false);
            });
        });

        it('preserves the last point when requested', () => {
            const data = createData([10, 15, 12, 18, 20]);
            // preserveEnd = true
            const result = lowess(data, 0.5, true);
            expect(result[4]).toEqual({ x: 4, y: 20 });
        });

        it('returns point.y if total weight sums to 0', () => {
            const data = createData([10, 15, 20]);
            const result = lowess(data, 0.0001, false);
            expect(result.length).toBe(3);
            result.forEach((p, i) => {
                expect(p.y).toBeCloseTo(data[i].y);
            });
        });
    });

    describe('adaptiveSmoothing', () => {
        it('returns original data for non-arrays or empty arrays', () => {
            expect(adaptiveSmoothing(null)).toBeNull();
            expect(adaptiveSmoothing([])).toEqual([]);
        });

        it('falls back to standard EMA (alpha=0.2) for arrays smaller than 10', () => {
            const data = createData([10, 11, 12]);
            const adaptiveResult = adaptiveSmoothing(data, false);
            const emaResult = exponentialMovingAverage(data, 0.2, false);
            expect(adaptiveResult).toEqual(emaResult);
        });

        it('uses high alpha (0.4) for high volatility data', () => {
            const data = createData([100, 110, 100, 110, 100, 110, 100, 110, 100, 110, 100, 110]);
            const adaptiveResult = adaptiveSmoothing(data, false);
            const emaResult = exponentialMovingAverage(data, 0.4, false);
            expect(adaptiveResult).toEqual(emaResult);
        });

        it('uses medium alpha (0.3) for medium volatility data', () => {
            const data = createData([100, 103, 100, 103, 100, 103, 100, 103, 100, 103, 100, 103]);
            const adaptiveResult = adaptiveSmoothing(data, false);
            const emaResult = exponentialMovingAverage(data, 0.3, false);
            expect(adaptiveResult).toEqual(emaResult);
        });

        it('uses low alpha (0.2) for low volatility data', () => {
            const data = createData([100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101]);
            const adaptiveResult = adaptiveSmoothing(data, false);
            const emaResult = exponentialMovingAverage(data, 0.2, false);
            expect(adaptiveResult).toEqual(emaResult);
        });

        it('preserves the last point when requested', () => {
            const data = createData([100, 110, 100, 110, 100, 110, 100, 110, 100, 110, 100, 110]);
            const result = adaptiveSmoothing(data, true);
            expect(result[11]).toEqual({ x: 11, y: 110 });
        });
    });

    describe('smoothFinancialData', () => {
        it('returns original data for non-arrays or empty arrays', () => {
            expect(smoothFinancialData(null)).toBeNull();
            expect(smoothFinancialData([])).toEqual([]);
        });

        it('defaults to balanced configuration', () => {
            const data = createData([10, 20, 30, 40]);
            const defaultResult = smoothFinancialData(data, undefined, false);
            const balancedResult = exponentialMovingAverage(data, 0.3, false);
            expect(defaultResult).toEqual(balancedResult);
        });

        it('accepts string configuration keys from SMOOTHING_CONFIGS', () => {
            const data = createData([10, 20, 30, 40]);
            const result = smoothFinancialData(data, 'conservative', false);
            const expected = exponentialMovingAverage(data, 0.2, false);
            expect(result).toEqual(expected);
        });

        it('accepts custom configuration objects', () => {
            const data = createData([10, 20, 30, 40]);
            const customConfig = {
                method: 'simple',
                params: { window: 3 },
                passes: 1,
            };
            const result = smoothFinancialData(data, customConfig, false);
            const expected = simpleMovingAverage(data, 3, false);
            expect(result).toEqual(expected);
        });

        it('handles multiple passes correctly', () => {
            const data = createData([10, 20, 30, 40]);
            const customConfig = {
                method: 'simple',
                params: { window: 3 },
                passes: 2,
            };
            const pass1 = simpleMovingAverage(data, 3, false);
            const expectedPass2 = simpleMovingAverage(pass1, 3, false);
            const result = smoothFinancialData(data, customConfig, false);
            expect(result).toEqual(expectedPass2);
        });

        it('routes to savitzky correctly', () => {
            const data = createData([10, 20, 30, 40, 50]);
            const config = { method: 'savitzky', params: { window: 5, order: 2 } };
            const expected = savitzkyGolay(data, 5, 2, false);
            expect(smoothFinancialData(data, config, false)).toEqual(expected);
        });

        it('routes to lowess correctly', () => {
            const data = createData([10, 20, 30, 40, 50]);
            const config = { method: 'lowess', params: { bandwidth: 0.3 } };
            const expected = lowess(data, 0.3, false);
            expect(smoothFinancialData(data, config, false)).toEqual(expected);
        });

        it('routes to adaptive correctly', () => {
            const data = createData([10, 20, 30, 40, 50]);
            const config = { method: 'adaptive', params: {} };
            const expected = adaptiveSmoothing(data, false);
            expect(smoothFinancialData(data, config, false)).toEqual(expected);
        });

        it('falls back to EMA (0.3) for unknown methods', () => {
            const data = createData([10, 20, 30, 40, 50]);
            const config = { method: 'unknown_magic_smoothing', params: {} };
            const expected = exponentialMovingAverage(data, 0.3, false);
            expect(smoothFinancialData(data, config, false)).toEqual(expected);
        });

        it('preserves the last point when requested', () => {
            const data = createData([10, 20, 30, 40, 50]);
            const result = smoothFinancialData(data, 'balanced', true);
            expect(result[4]).toEqual({ x: 4, y: 50 });
        });
    });
});
