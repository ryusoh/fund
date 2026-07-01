import {
    niceNumber,
    parseLocalDate,
    clampTime,
    clamp01,
    parseColorToRgb,
    colorWithAlpha,
    lightenColor,
    darkenColor,
    createTimeInterpolator,
    injectSyntheticStartPoint,
    injectCarryForwardStartPoint,
    formatPercentInline,
    getMonoFontFamily,
    formatFxValue,
    formatCrosshairDateLabel,
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
            expect(date.getFullYear()).toBe(2023);
            expect(date.getMonth()).toBe(9); // 0-indexed
            expect(date.getDate()).toBe(25);
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

    describe('createTimeInterpolator', () => {
        it('should return null for non-finite time', () => {
            const interpolator = createTimeInterpolator([{ time: 10, value: 5 }]);
            expect(interpolator(NaN)).toBeNull();
            expect(interpolator(Infinity)).toBeNull();
        });

        it('should return a function that returns null for empty or invalid array', () => {
            let interpolator = createTimeInterpolator([]);
            expect(interpolator(10)).toBeNull();

            interpolator = createTimeInterpolator(null);
            expect(interpolator(10)).toBeNull();
        });

        it('should clamp time to array bounds', () => {
            const points = [
                { time: 10, value: 100 },
                { time: 20, value: 200 },
            ];
            const interpolator = createTimeInterpolator(points);
            expect(interpolator(5)).toBe(100);
            expect(interpolator(25)).toBe(200);
        });

        it('should return exact value if time matches exactly', () => {
            const points = [
                { time: 10, value: 100 },
                { time: 20, value: 200 },
            ];
            const interpolator = createTimeInterpolator(points);
            expect(interpolator(10)).toBe(100);
            expect(interpolator(20)).toBe(200);
        });

        it('should interpolate values between points', () => {
            const points = [
                { time: 10, value: 100 },
                { time: 20, value: 200 },
            ];
            const interpolator = createTimeInterpolator(points);
            expect(interpolator(15)).toBe(150);
            expect(interpolator(12)).toBe(120);
            expect(interpolator(18)).toBe(180);
        });

        it('should handle identical times (vertical line)', () => {
            const points = [
                { time: 10, value: 100 },
                { time: 10, value: 200 },
            ];
            const interpolator = createTimeInterpolator(points);
            expect(interpolator(10)).toBe(100); // returns first value
        });

        it('should handle single point', () => {
            const points = [{ time: 10, value: 100 }];
            const interpolator = createTimeInterpolator(points);
            expect(interpolator(10)).toBe(100);
        });
    });

    describe('injectSyntheticStartPoint', () => {
        const fullSeries = [
            { date: new Date('2023-01-01'), value: 100, synthetic: true },
            { date: new Date('2023-01-02'), value: 110 },
            { date: new Date('2023-01-03'), value: 120 },
        ];

        it('should return original data if inputs are invalid', () => {
            expect(injectSyntheticStartPoint(null, fullSeries)).toBeNull();
            expect(injectSyntheticStartPoint([], fullSeries)).toEqual([]);
            expect(injectSyntheticStartPoint([{ date: new Date() }], null)).toEqual([
                { date: expect.any(Date) },
            ]);
            expect(injectSyntheticStartPoint([{ date: new Date() }], [])).toEqual([
                { date: expect.any(Date) },
            ]);
        });

        it('should return original data if no matching full series date', () => {
            const filtered = [{ date: new Date('2024-01-01'), value: 200 }];
            expect(injectSyntheticStartPoint(filtered, fullSeries)).toBe(filtered);
        });

        it('should return original data if previous point is not synthetic', () => {
            const series = [
                { date: new Date('2023-01-01'), value: 100 }, // Not synthetic
                { date: new Date('2023-01-02'), value: 110 },
            ];
            const filtered = [series[1]];
            expect(injectSyntheticStartPoint(filtered, series)).toBe(filtered);
        });

        it('should return original data if previous point is not 0 (or close to 0)', () => {
            const series = [
                { date: new Date('2023-01-01'), value: 50, synthetic: true },
                { date: new Date('2023-01-02'), value: 110 },
            ];
            const filtered = [series[1]];
            expect(injectSyntheticStartPoint(filtered, series)).toBe(filtered);
        });

        it('should inject synthetic start point', () => {
            const series = [
                { date: new Date('2023-01-01'), value: 0, synthetic: true },
                { date: new Date('2023-01-02'), value: 110 },
            ];
            const filtered = [series[1]];

            const result = injectSyntheticStartPoint(filtered, series);
            expect(result).toHaveLength(2);
            expect(result[0].synthetic).toBe(true);
            expect(result[0].value).toBe(0);
            expect(result[0].date).toEqual(new Date('2023-01-01'));
        });

        it('should clamp injected point to filterFrom date', () => {
            const series = [
                { date: new Date('2023-01-01'), value: 0, synthetic: true },
                { date: new Date('2023-01-05'), value: 110 },
            ];
            const filtered = [series[1]];
            const filterFrom = new Date('2023-01-03');

            const result = injectSyntheticStartPoint(filtered, series, filterFrom);
            expect(result).toHaveLength(2);
            expect(result[0].synthetic).toBe(true);
            expect(result[0].value).toBe(0); // From the previousPoint
            expect(result[0].date).toEqual(filterFrom);
        });

        it('should avoid duplicate points at filterFrom', () => {
            const series = [
                { date: new Date('2023-01-01'), value: 0, synthetic: true },
                { date: new Date('2023-01-03'), value: 110 },
            ];
            const filtered = [series[1]]; // Starts at 2023-01-03
            const filterFrom = new Date('2023-01-03');

            // The synthetic point would be at 2023-01-03, but we already have a point there
            const result = injectSyntheticStartPoint(filtered, series, filterFrom);
            expect(result).toBe(filtered); // No new point added
        });

        it('should handle invalid date objects gracefully', () => {
            const invalidDateFiltered = [{ date: new Date('invalid'), value: 10 }];
            expect(injectSyntheticStartPoint(invalidDateFiltered, fullSeries)).toBe(
                invalidDateFiltered
            );

            const validFiltered = [{ date: new Date('2023-01-02'), value: 110 }];
            const invalidSeries = [
                { date: new Date('invalid'), value: 0, synthetic: true },
                { date: new Date('2023-01-02'), value: 110 },
            ];
            expect(injectSyntheticStartPoint(validFiltered, invalidSeries)).toBe(validFiltered);
        });
    });

    describe('injectCarryForwardStartPoint', () => {
        const fullSeries = [
            { date: new Date('2023-01-01'), value: 100 },
            { date: new Date('2023-01-02'), value: 110 },
            { date: new Date('2023-01-05'), value: 120 },
        ];

        it('should return original data if inputs are invalid', () => {
            const filtered = [{ date: new Date('2023-01-05'), value: 120 }];
            expect(injectCarryForwardStartPoint(filtered, fullSeries, null)).toBe(filtered);
            expect(injectCarryForwardStartPoint(null, fullSeries, new Date())).toBeNull();
            expect(injectCarryForwardStartPoint(filtered, null, new Date())).toBe(filtered);
            expect(injectCarryForwardStartPoint(filtered, [], new Date())).toBe(filtered);
        });

        it('should return original data if no point exists before filterFrom', () => {
            const filtered = [{ date: new Date('2023-01-01'), value: 100 }];
            const filterFrom = new Date('2022-12-31');
            expect(injectCarryForwardStartPoint(filtered, fullSeries, filterFrom)).toBe(filtered);
        });

        it('should return original data if first filtered point is before or at filterFrom', () => {
            const filtered = [{ date: new Date('2023-01-02'), value: 110 }];
            const filterFrom = new Date('2023-01-02'); // Same date
            expect(injectCarryForwardStartPoint(filtered, fullSeries, filterFrom)).toBe(filtered);

            const filterFromAfter = new Date('2023-01-03'); // Filter starts after first point
            expect(injectCarryForwardStartPoint(filtered, fullSeries, filterFromAfter)).toBe(
                filtered
            );
        });

        it('should inject carry forward point with previous value', () => {
            const filtered = [{ date: new Date('2023-01-05'), value: 120 }];
            const filterFrom = new Date('2023-01-03');

            const result = injectCarryForwardStartPoint(filtered, fullSeries, filterFrom);
            expect(result).toHaveLength(2);
            expect(result[0].date).toEqual(filterFrom);
            expect(result[0].value).toBe(110); // Carried forward from 2023-01-02
            expect(result[0].synthetic).toBe(true);
            expect(result[0].carryForward).toBe(true);
        });

        it('should use custom valueKey', () => {
            const customSeries = [
                { date: new Date('2023-01-01'), customVal: 100 },
                { date: new Date('2023-01-02'), customVal: 110 },
            ];
            const filtered = [];
            const filterFrom = new Date('2023-01-03');

            const result = injectCarryForwardStartPoint(
                filtered,
                customSeries,
                filterFrom,
                'customVal'
            );
            expect(result).toHaveLength(1);
            expect(result[0].customVal).toBe(110);
            expect(result[0].synthetic).toBe(true);
        });

        it('should handle invalid dates in series', () => {
            const seriesWithInvalid = [
                { date: new Date('invalid'), value: 100 },
                { date: new Date('2023-01-02'), value: 110 },
            ];
            const filtered = [];
            const filterFrom = new Date('2023-01-03');

            const result = injectCarryForwardStartPoint(filtered, seriesWithInvalid, filterFrom);
            expect(result).toHaveLength(1);
            expect(result[0].value).toBe(110);
        });

        it('should skip null items in series', () => {
            const seriesWithNull = [
                { date: new Date('2023-01-01'), value: 100 },
                null,
                { date: new Date('2023-01-05'), value: 120 },
            ];
            const filtered = [{ date: new Date('2023-01-05'), value: 120 }];
            const filterFrom = new Date('2023-01-03');

            const result = injectCarryForwardStartPoint(filtered, seriesWithNull, filterFrom);
            expect(result).toHaveLength(2);
            expect(result[0].value).toBe(100);
        });

        it('should skip if carried value is not finite', () => {
            const seriesWithNaN = [{ date: new Date('2023-01-01'), value: NaN }];
            const filtered = [];
            const filterFrom = new Date('2023-01-03');

            expect(injectCarryForwardStartPoint(filtered, seriesWithNaN, filterFrom)).toBe(
                filtered
            );
        });

        it('should handle invalid filterFrom', () => {
            const filtered = [{ date: new Date('2023-01-05'), value: 120 }];
            const invalidFilterFrom = new Date('invalid');
            expect(injectCarryForwardStartPoint(filtered, fullSeries, invalidFilterFrom)).toBe(
                filtered
            );
        });
    });
});

describe('formatPercentInline', () => {
    it('returns 0% for non-finite values', () => {
        expect(formatPercentInline(NaN)).toBe('0%');
    });

    it('handles positive values', () => {
        expect(formatPercentInline(5.123)).toBe('+5.12%');
    });

    it('handles negative values', () => {
        expect(formatPercentInline(-5.123)).toBe('−5.12%');
    });

    it('handles zero', () => {
        expect(formatPercentInline(0)).toBe('0.00%');
    });
});

describe('getMonoFontFamily', () => {
    let originalGetComputedStyle;

    beforeEach(() => {
        originalGetComputedStyle = window.getComputedStyle;
    });

    afterEach(() => {
        window.getComputedStyle = originalGetComputedStyle;
    });

    it('returns custom font if defined in CSS variables', () => {
        window.getComputedStyle = () => ({
            getPropertyValue: (prop) => {
                if (prop === '--font-family-mono') {
                    return 'CustomMono';
                }
                return '';
            },
        });
        expect(getMonoFontFamily()).toBe('CustomMono');
    });

    it('returns default font if custom font is missing', () => {
        window.getComputedStyle = () => ({
            getPropertyValue: () => '',
        });
        expect(typeof getMonoFontFamily()).toBe('string');
    });

    it('returns default font if getComputedStyle is undefined', () => {
        const originalGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = undefined;
        expect(typeof getMonoFontFamily()).toBe('string');
        window.getComputedStyle = originalGetComputedStyle;
    });
});

describe('formatFxValue', () => {
    it('returns "–" for non-finite values', () => {
        expect(formatFxValue(NaN)).toBe('–');
    });

    it('formats values >= 100 with 1 decimal', () => {
        expect(formatFxValue(123.456)).toBe('123.5');
    });

    it('formats values >= 10 with 2 decimals', () => {
        expect(formatFxValue(12.3456)).toBe('12.35');
    });

    it('formats values >= 1 with 3 decimals', () => {
        expect(formatFxValue(1.23456)).toBe('1.235');
    });

    it('formats values < 1 with 4 decimals', () => {
        expect(formatFxValue(0.123456)).toBe('0.1235');
    });
});

describe('formatCrosshairDateLabel', () => {
    it('returns empty string for non-finite values', () => {
        expect(formatCrosshairDateLabel(NaN)).toBe('');
    });

    it('returns empty string for invalid date', () => {
        expect(formatCrosshairDateLabel('invalid time')).toBe('');
    });

    it('formats valid date using formatter', () => {
        const result = formatCrosshairDateLabel(1672531200000);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });
});
