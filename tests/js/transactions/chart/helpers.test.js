import { niceNumber, parseLocalDate, clampTime, clamp01, colorWithAlpha, parseColorToRgb } from '../../../../js/transactions/chart/helpers.js';

describe('Chart Helpers', () => {
    describe('niceNumber', () => {
        it('should handle zero or non-finite range', () => {
            expect(niceNumber(0, true)).toBe(1);
            expect(niceNumber(NaN, false)).toBe(1);
            expect(niceNumber(Infinity, true)).toBe(1);
        });

        it('should return nice fractions when rounding', () => {
            expect(niceNumber(1.2, true)).toBe(1);
            expect(niceNumber(2.5, true)).toBe(2);
            expect(niceNumber(6.5, true)).toBe(5);
            expect(niceNumber(8.5, true)).toBe(10);
        });

        it('should return nice fractions without rounding', () => {
             expect(niceNumber(0.8, false)).toBe(1);
             expect(niceNumber(1.5, false)).toBe(2);
             expect(niceNumber(3.5, false)).toBe(5);
             expect(niceNumber(8.5, false)).toBe(10);
        });
    });

    describe('parseLocalDate', () => {
        it('should parse YYYY-MM-DD string to timestamp', () => {
            const timestamp = parseLocalDate('2023-10-25');
            const date = new Date(timestamp);
            expect(date.getUTCFullYear()).toBe(2023);
            expect(date.getUTCMonth()).toBe(9); // 0-indexed
            expect(date.getUTCDate()).toBe(25);
        });

        it('should fallback to JS Date parse for other formats', () => {
            const timestamp = parseLocalDate('2023/10/25');
            expect(timestamp).not.toBeNaN();
        });
    });

    describe('clampTime', () => {
        it('should clamp value within bounds', () => {
            expect(clampTime(50, 0, 100)).toBe(50);
            expect(clampTime(-10, 0, 100)).toBe(0);
            expect(clampTime(150, 0, 100)).toBe(100);
        });
    });

    describe('clamp01', () => {
        it('should clamp value between 0 and 1', () => {
            expect(clamp01(0.5)).toBe(0.5);
            expect(clamp01(-0.5)).toBe(0);
            expect(clamp01(1.5)).toBe(1);
        });
    });
});
