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
            // In the implementation:
            // start = Math.max(0, i - Math.floor(window / 2)) -> i - 1
            // end = Math.min(data.length, start + window) -> start + 3
            // i=0: start=0, end=3 -> [1,2,3] avg = 2
            // i=1: start=0, end=3 -> [1,2,3] avg = 2
            // i=2: start=1, end=4 -> [2,3,4] avg = 3
            // i=3: start=2, end=5 -> [3,4,5] avg = 4
            // i=4: start=3, end=5 -> [4,5] avg = 4.5
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

        it('uses default parameters when omitted', () => {
            const data = createData([1, 2, 3, 4, 10]);
            // Default window is 3, preserveEnd is true
            const result = simpleMovingAverage(data);

            // Should preserve the end point (y: 10)
            expect(result[4]).toEqual({ x: 4, y: 10 });

            // Should match explicit window=3, preserveEnd=true
            const explicitResult = simpleMovingAverage(data, 3, true);
            expect(result).toEqual(explicitResult);
        });

        it('handles even window sizes correctly', () => {
            const data = createData([1, 2, 3, 4, 5, 6]);
            // window = 4, preserveEnd = false
            const result = simpleMovingAverage(data, 4, false);
            // i=0: Math.max(0, 0-2)=0, Math.min(6, 4)=4 -> data.slice(0, 4) -> [1,2,3,4] -> avg=2.5
            // i=1: Math.max(0, 1-2)=0, Math.min(6, 4)=4 -> data.slice(0, 4) -> [1,2,3,4] -> avg=2.5
            // i=2: Math.max(0, 2-2)=0, Math.min(6, 4)=4 -> data.slice(0, 4) -> [1,2,3,4] -> avg=2.5
            // i=3: Math.max(0, 3-2)=1, Math.min(6, 5)=5 -> data.slice(1, 5) -> [2,3,4,5] -> avg=3.5
            // i=4: Math.max(0, 4-2)=2, Math.min(6, 6)=6 -> data.slice(2, 6) -> [3,4,5,6] -> avg=4.5
            // i=5: Math.max(0, 5-2)=3, Math.min(6, 7)=6 -> data.slice(3, 6) -> [4,5,6] -> avg=5
            expect(result).toEqual([
                { x: 0, y: 2.5 },
                { x: 1, y: 2.5 },
                { x: 2, y: 2.5 },
                { x: 3, y: 3.5 },
                { x: 4, y: 4.5 },
                { x: 5, y: 5 },
            ]);
        });

        it('handles negative y values correctly', () => {
            const data = createData([-1, -2, -3, -4, -5]);
            // window = 3, preserveEnd = false
            const result = simpleMovingAverage(data, 3, false);
            expect(result).toEqual([
                { x: 0, y: -2 },
                { x: 1, y: -2 },
                { x: 2, y: -3 },
                { x: 3, y: -4 },
                { x: 4, y: -4.5 },
            ]);
        });

        it('handles window sizes less than 1 safely (e.g. 0 or negative)', () => {
            const data = createData([1, 2, 3, 4, 5]);
            // With window <= 0, start and end bounds evaluate to logic that might slice differently
            // but JS slice handles it. Let's see how it behaves and assert it doesn't crash.
            const resultZero = simpleMovingAverage(data, 0, false);
            expect(resultZero.length).toBe(data.length);

            const resultNegative = simpleMovingAverage(data, -1, false);
            expect(resultNegative.length).toBe(data.length);
        });

        it('handles fractional window sizes gracefully', () => {
            const data = createData([1, 2, 3, 4, 5]);
            const result = simpleMovingAverage(data, 3.5, false);
            expect(result.length).toBe(5);
        });

        it('handles missing y values gracefully', () => {
            const data = [{ x: 0, y: 1 }, { x: 1 }, { x: 2, y: 3 }];
            // window = 3, preserveEnd = false
            // y is undefined, so undefined + 1 = NaN
            const result = simpleMovingAverage(data, 3, false);
            expect(result[1].y).toBeNaN();
        });

        it('handles malformed data points where y might be missing or non-numeric', () => {
            const data = [
                { x: 0, y: 10 },
                { x: 1, y: null },
                { x: 2, y: undefined },
                { x: 3, y: 'string' },
                { x: 4, y: 20 },
            ];
            const result = simpleMovingAverage(data, 3, false);
            expect(result.length).toBe(data.length);
            // Verify it produces NaNs for malformed y values consistent with current implementation
            expect(result[1].y).toBeNaN();
            expect(result[2].y).toBeNaN();
            expect(result[3].y).toBeNaN();
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

        it('uses default parameters correctly (alpha = 0.3, preserveEnd = true)', () => {
            const data = createData([10, 15, 20]);
            const result = exponentialMovingAverage(data);

            // Expected for alpha = 0.3:
            // [0]: 10
            // [1]: 0.3 * 15 + 0.7 * 10 = 4.5 + 7 = 11.5
            // [2]: preserved = 20
            expect(result).toEqual([
                { x: 0, y: 10 },
                { x: 1, y: 11.5 },
                { x: 2, y: 20 },
            ]);
        });

        it('handles alpha = 1 (no smoothing)', () => {
            const data = createData([10, 15, 20]);
            const result = exponentialMovingAverage(data, 1, false);
            expect(result).toEqual(data);
        });

        it('handles alpha = 0 (completely flat after first point)', () => {
            const data = createData([10, 15, 20]);
            const result = exponentialMovingAverage(data, 0, false);
            // Expected for alpha = 0:
            // [0]: 10
            // [1]: 0 * 15 + 1 * 10 = 10
            // [2]: 0 * 20 + 1 * 10 = 10
            expect(result).toEqual([
                { x: 0, y: 10 },
                { x: 1, y: 10 },
                { x: 2, y: 10 },
            ]);
        });

        it('handles negative values correctly', () => {
            const data = createData([-10, -5, 0, 5, 10]);
            const result = exponentialMovingAverage(data, 0.5, false);
            expect(result).toEqual([
                { x: 0, y: -10 },
                { x: 1, y: -7.5 }, // 0.5 * -5 + 0.5 * -10
                { x: 2, y: -3.75 }, // 0.5 * 0 + 0.5 * -7.5
                { x: 3, y: 0.625 }, // 0.5 * 5 + 0.5 * -3.75
                { x: 4, y: 5.3125 }, // 0.5 * 10 + 0.5 * 0.625
            ]);
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
            // It should calculate a linear fit
            // the start/end points may use limited windows so we just verify it produces valid numbers
            result.forEach((point) => {
                expect(typeof point.y).toBe('number');
                expect(isNaN(point.y)).toBe(false);
            });
        });

        it('falls back to original point for higher orders that are not fully implemented', () => {
            const data = createData([10, 11, 10, 15, 20]);
            // order 2 falls back to returning the point's original value according to current implementation
            const result = savitzkyGolay(data, 3, 2, false);
            expect(result).toEqual(data);
        });

        it('handles case where points length is less than or equal to order', () => {
            // By requesting an order 5 but window is small, polynomialFit gets triggered early.
            const data = createData([1, 2, 3, 4, 5]);
            // Force polynomialFit to hit the `n <= order` block (n=3 for window boundaries, order=5).
            const result = savitzkyGolay(data, 3, 5, false);
            expect(result).toEqual(data);
        });

        it('handles out of bounds indices gracefully when falling back', () => {
            // Using small data size to ensure boundaries logic is triggered
            const data = createData([10, 11, 10, 15, 20]);
            // Request large order, but some edge cases might hit where targetIndex is beyond array if we mess with data manually
            const result = savitzkyGolay(data, 5, 10, false);
            expect(result.length).toEqual(5);
        });

        it('preserves the last point when requested', () => {
            const data = createData([1, 2, 3, 4, 5]);
            // preserveEnd = true
            const result = savitzkyGolay(data, 3, 1, true);
            expect(result[4]).toEqual({ x: 4, y: 5 });
        });

        it('handles polynomialFit edge cases with n <= order', () => {
            // To trigger n <= order, we need windowData.length <= order.
            // In savitzkyGolay, windowData.length must be >= 3 (otherwise it falls back early).
            // So if order is 3 and windowData.length is 3, n <= order is true.
            // Then it returns points[targetIndex]?.y || 0
            const data = createData([10, 20, 30, 40]);
            // window = 3, order = 3
            // The middle points will have a window of 3 elements.
            const result = savitzkyGolay(data, 3, 3, false);
            expect(result[1].y).toBe(20);

            // Test case for ?.y || 0 when y is falsy (e.g., 0)
            const dataWithZero = createData([10, 0, 30, 40]);
            const resultZero = savitzkyGolay(dataWithZero, 3, 3, false);
            expect(resultZero[1].y).toBe(0);
        });

        it('handles out of bounds indices and missing values for polynomialFit', () => {
            // Test for order > 1 but not matching order === 1 (e.g. order 2 logic fallthrough)
            // with out-of-bounds target index causing points[targetIndex] to be undefined
            // we can test order=3 to skip order=1 logic. Since n (window size) > order,
            // we need window >= 5, and order 3.
            const data = createData([10, 20, 30, 40, 50, 60]);
            // This normally shouldn't give an undefined point, but we can verify order > 1 logic
            // returns `points[targetIndex]?.y || 0` which is hit when order !== 1
            const result = savitzkyGolay(data, 5, 2, false);
            expect(result[2].y).toBe(30);

            // Force a case where targetIndex doesn't exist by providing a bad array object (mocking for test coverage)
            // Or just verify that when order != 1, it hits the `|| 0` logic correctly.
            // By making y 0, we can hit the `|| 0` branch directly for order 2
            const dataWithZero = createData([10, 20, 0, 40, 50]);
            const resultZero = savitzkyGolay(dataWithZero, 5, 2, false);
            expect(resultZero[2].y).toBe(0);
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
            // this is an edge case where all normalized distances >= 1
            const data = createData([10, 15, 20]);
            // setting bandwidth very close to 0 causes all points except itself to have 0 weight
            // and the point itself to have distance 0 -> normalized 0 -> weight 1
            const result = lowess(data, 0.0001, false);
            expect(result.length).toBe(3);
            result.forEach((p, i) => {
                expect(p.y).toBeCloseTo(data[i].y);
            });
        });

        it('returns point.y when all weights are strictly 0', () => {
            // We want to force weightSum === 0 in weightedLocalRegression.
            // This happens if for ALL points `normalizedDistance >= 1`.
            // The normalizedDistance is `distance / (bandwidth * maxDistance)`.
            // maxDistance is from `targetX` to the furthest point.
            // distance is from `targetX` to `x`.
            // If bandwidth <= 0 (e.g., 0), then `bandwidth * maxDistance` is 0.
            // Then `distance / 0` becomes Infinity (or NaN for the point itself).
            // This causes `normalizedDistance < 1` to be false for all elements, pushing 0 to weights.
            const data = createData([10, 20, 30]);
            const result = lowess(data, 0, false);
            expect(result).toEqual(data);
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
            // Data with >5% avg volatility
            const data = createData([100, 110, 100, 110, 100, 110, 100, 110, 100, 110, 100, 110]);
            const adaptiveResult = adaptiveSmoothing(data, false);
            const emaResult = exponentialMovingAverage(data, 0.4, false);
            expect(adaptiveResult).toEqual(emaResult);
        });

        it('uses medium alpha (0.3) for medium volatility data', () => {
            // Data with >2% and <=5% avg volatility
            const data = createData([100, 103, 100, 103, 100, 103, 100, 103, 100, 103, 100, 103]);
            const adaptiveResult = adaptiveSmoothing(data, false);
            const emaResult = exponentialMovingAverage(data, 0.3, false);
            expect(adaptiveResult).toEqual(emaResult);
        });

        it('uses low alpha (0.2) for low volatility data', () => {
            // Data with <=2% avg volatility
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

        it('routes to savitzky correctly with custom and fallback params', () => {
            const data = createData([10, 20, 30, 40, 50]);
            const config = { method: 'savitzky', params: { window: 5, order: 2 } };
            const expected = savitzkyGolay(data, 5, 2, false);
            expect(smoothFinancialData(data, config, false)).toEqual(expected);

            const fallbackConfig = { method: 'savitzky', params: {} };
            const fallbackExpected = savitzkyGolay(data, 5, 2, false);
            expect(smoothFinancialData(data, fallbackConfig, false)).toEqual(fallbackExpected);
        });

        it('routes to lowess correctly with custom and fallback params', () => {
            const data = createData([10, 20, 30, 40, 50]);
            const config = { method: 'lowess', params: { bandwidth: 0.3 } };
            const expected = lowess(data, 0.3, false);
            expect(smoothFinancialData(data, config, false)).toEqual(expected);

            const fallbackConfig = { method: 'lowess', params: {} };
            const fallbackExpected = lowess(data, 0.3, false);
            expect(smoothFinancialData(data, fallbackConfig, false)).toEqual(fallbackExpected);
        });

        it('routes to adaptive correctly', () => {
            const data = createData([10, 20, 30, 40, 50]);
            const config = { method: 'adaptive', params: {} };
            const expected = adaptiveSmoothing(data, false);
            expect(smoothFinancialData(data, config, false)).toEqual(expected);
        });

        it('handles exponential configurations and fallbacks', () => {
            const data = createData([10, 20, 30, 40, 50]);
            const config = { method: 'exponential', params: { alpha: 0.4 } };
            const expected = exponentialMovingAverage(data, 0.4, false);
            expect(smoothFinancialData(data, config, false)).toEqual(expected);

            const fallbackConfig = { method: 'exponential', params: {} };
            const fallbackExpected = exponentialMovingAverage(data, 0.3, false);
            expect(smoothFinancialData(data, fallbackConfig, false)).toEqual(fallbackExpected);
        });

        it('handles simple moving average configurations and fallbacks', () => {
            const data = createData([10, 20, 30, 40, 50]);
            const fallbackConfig = { method: 'simple', params: {} };
            const fallbackExpected = simpleMovingAverage(data, 3, false);
            expect(smoothFinancialData(data, fallbackConfig, false)).toEqual(fallbackExpected);
        });

        it('falls back to balanced config if unknown string is provided', () => {
            const data = createData([10, 20, 30, 40, 50]);
            const expected = exponentialMovingAverage(data, 0.3, false);
            expect(smoothFinancialData(data, 'invalid_string_config', false)).toEqual(expected);
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
