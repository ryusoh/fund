import {
    niceNumber,
    parseLocalDate,
    clampTime,
    clamp01,
    parseColorToRgb,
    colorWithAlpha,
    lightenColor,
    darkenColor,
} from '../../../../js/transactions/chart/helpers.js';

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
    describe('Color Utilities', () => {
        describe('parseColorToRgb', () => {
            it('should parse 6-character hex colors', () => {
                expect(parseColorToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
                expect(parseColorToRgb('#00FF00')).toEqual({ r: 0, g: 255, b: 0 });
                expect(parseColorToRgb('#0000FF')).toEqual({ r: 0, g: 0, b: 255 });
            });

            it('should parse 3-character hex colors', () => {
                expect(parseColorToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
                expect(parseColorToRgb('#0f0')).toEqual({ r: 0, g: 255, b: 0 });
                expect(parseColorToRgb('#00f')).toEqual({ r: 0, g: 0, b: 255 });
            });

            it('should parse rgb() strings with absolute values', () => {
                expect(parseColorToRgb('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0 });
                expect(parseColorToRgb('rgb( 0 , 255 , 0 )')).toEqual({ r: 0, g: 255, b: 0 });
                expect(parseColorToRgb('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 });
            });

            it('should parse rgba() strings', () => {
                expect(parseColorToRgb('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0 });
                expect(parseColorToRgb('rgba(10, 20, 30, 1)')).toEqual({ r: 10, g: 20, b: 30 });
            });

            it('should return null for invalid inputs', () => {
                expect(parseColorToRgb('')).toBeNull();
                expect(parseColorToRgb(null)).toBeNull();
                expect(parseColorToRgb(undefined)).toBeNull();
                expect(parseColorToRgb(123)).toBeNull();
            });
        });

        describe('colorWithAlpha', () => {
            it('should apply alpha to 6-character hex colors', () => {
                expect(colorWithAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
            });

            it('should apply alpha to 3-character hex colors', () => {
                expect(colorWithAlpha('#0f0', 0.8)).toBe('rgba(0, 255, 0, 0.8)');
            });

            it('should apply alpha to rgb() strings', () => {
                expect(colorWithAlpha('rgb(0, 0, 255)', 0.3)).toBe('rgba(0, 0, 255, 0.3)');
            });

            it('should apply alpha to rgba() strings', () => {
                expect(colorWithAlpha('rgba(10, 20, 30, 1)', 0.4)).toBe('rgba(10, 20, 30, 0.4)');
            });

            it('should handle zero or negative alpha', () => {
                expect(colorWithAlpha('#ff0000', 0)).toBe('rgba(0, 0, 0, 0)');
                expect(colorWithAlpha('#ff0000', -0.5)).toBe('rgba(0, 0, 0, 0)');
            });

            it('should clamp alpha above 1', () => {
                expect(colorWithAlpha('#ff0000', 1.5)).toBe('rgba(255, 0, 0, 1)');
            });

            it('should return original value for invalid inputs', () => {
                expect(colorWithAlpha('', 0.5)).toBe('');
                expect(colorWithAlpha(null, 0.5)).toBeNull();
            });
        });

        describe('lightenColor', () => {
            it('should lighten a hex color', () => {
                const result = lightenColor('#102030', 0.5);
                expect(result).toBe('rgb(136, 144, 152)');
            });

            it('should lighten an rgb string', () => {
                const result = lightenColor('rgb(100, 100, 100)', 0.2);
                expect(result).toBe('rgb(131, 131, 131)');
            });

            it('should return original value for invalid colors', () => {
                expect(lightenColor('', 0.5)).toBe('');
                expect(lightenColor('invalid-color', 0.5)).toBe('invalid-color');
            });
        });

        describe('darkenColor', () => {
            it('should darken a hex color', () => {
                const result = darkenColor('#e0e0e0', 0.5);
                expect(result).toBe('rgb(112, 112, 112)');
            });

            it('should darken an rgb string', () => {
                const result = darkenColor('rgb(100, 100, 100)', 0.2);
                expect(result).toBe('rgb(80, 80, 80)');
            });

            it('should return original value for invalid colors', () => {
                expect(darkenColor('', 0.5)).toBe('');
                expect(darkenColor('invalid-color', 0.5)).toBe('invalid-color');
            });
        });
    });
});
