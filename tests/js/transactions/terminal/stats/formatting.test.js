import {
    renderAsciiTable,
    formatNumeric,
    formatPercentageValue,
    formatNumericPair,
    formatPrice,
    formatMarketCap,
    formatVolume,
    format52WeekRange,
    formatPercent,
    formatShareValue,
    formatShareValueShort,
    formatResidualValue,
    formatTicker,
    formatDurationLabel,
    formatYearsValue,
} from '../../../../../js/transactions/terminal/stats/formatting.js';

describe('terminal stats formatting', () => {
    describe('formatVolume', () => {
        it('formats billions', () => {
            expect(formatVolume(1500000000)).toBe('1.50B');
        });
        it('formats millions', () => {
            expect(formatVolume(2500000)).toBe('2.50M');
        });
        it('formats thousands', () => {
            expect(formatVolume(3500)).toBe('3.50K');
        });
        it('returns exact for 500', () => {
            expect(formatVolume(500)).toBe('500');
        });
        it('handles non-finite or negative numbers', () => {
            expect(formatVolume(-100)).toBe('–');
            expect(formatVolume(NaN)).toBe('–');
            expect(formatVolume(0)).toBe('–');
        });
    });

    describe('formatMarketCap', () => {
        it('formats valid numbers with default currency', () => {
            expect(formatMarketCap(1500000000)).toBe('$1.50B');
        });
        it('formats valid numbers with specific currency', () => {
            expect(formatMarketCap(2500000, 'EUR')).toContain('2.50M');
        });
        it('handles non-finite numbers', () => {
            expect(formatMarketCap(NaN)).toBe('–');
            expect(formatMarketCap(Infinity)).toBe('–');
        });
    });

    describe('format52WeekRange', () => {
        it('formats with both low and high', () => {
            expect(format52WeekRange(10, 20)).toBe('$10.00 – $20.00');
        });
        it('formats with only low', () => {
            expect(format52WeekRange(10, NaN)).toBe('$10.00');
        });
        it('formats with only high', () => {
            expect(format52WeekRange(NaN, 20)).toBe('$20.00');
        });
        it('returns placeholder when both are missing', () => {
            expect(format52WeekRange(NaN, NaN)).toBe('–');
        });
    });

    describe('formatDurationLabel', () => {
        it('formats years correctly', () => {
            expect(formatDurationLabel(730)).toBe('2.0 yrs');
            expect(formatDurationLabel(365)).toBe('1.00 yrs');
        });
        it('formats months correctly', () => {
            expect(formatDurationLabel(60)).toBe('2.0 mos');
        });
        it('formats days correctly', () => {
            expect(formatDurationLabel(30)).toBe('30 days');
        });
        it('handles non-finite or negative numbers', () => {
            expect(formatDurationLabel(-10)).toBe('N/A');
            expect(formatDurationLabel(NaN)).toBe('N/A');
        });
    });

    describe('formatPercent', () => {
        it('formats regular values', () => {
            expect(formatPercent(0.1234)).toBe('12.34%');
        });
        it('handles negative or zero values', () => {
            expect(formatPercent(0)).toBe('0.00%');
            expect(formatPercent(-0.5)).toBe('0.00%');
        });
        it('handles non-finite values', () => {
            expect(formatPercent(NaN)).toBe('0.00%');
        });
    });

    describe('renderAsciiTable', () => {
        it('renders empty table', () => {
            expect(renderAsciiTable({})).toBe('');
        });
        it('renders table with title and no rows', () => {
            expect(renderAsciiTable({ title: 'TITLE' })).toBe('TITLE');
        });
        it('renders normal table with alignments', () => {
            const table = renderAsciiTable({
                title: 'MY TABLE',
                headers: ['Col 1', 'Col 2'],
                rows: [
                    ['a', 'b'],
                    ['c', 'd'],
                ],
                alignments: ['left', 'right'],
            });
            expect(table).toContain('MY TABLE');
            expect(table).toContain('Col 1');
            expect(table).toContain('Col 2');
        });
        it('renders center alignment', () => {
            const table = renderAsciiTable({
                headers: ['Col 1'],
                rows: [['a']],
                alignments: ['center'],
            });
            expect(table).toContain(' a ');
        });
        it('renders right alignment', () => {
            const table = renderAsciiTable({
                headers: ['Col 1'],
                rows: [['a']],
                alignments: ['right'],
            });
            expect(table).toContain('    a ');
        });
        it('renders with default alignment when absent', () => {
            const table = renderAsciiTable({
                headers: ['Col 1'],
                rows: [['a']],
                alignments: [],
            });
            expect(table).toContain(' a ');
        });
        it('handles null values in rows', () => {
            const table = renderAsciiTable({
                headers: ['Col 1'],
                rows: [[null]],
                alignments: ['left'],
            });
            expect(table).toContain('   ');
        });
        it('renders with long title', () => {
            const table = renderAsciiTable({
                title: 'A VERY LONG TITLE THAT EXCEEDS',
                headers: ['A'],
                rows: [['B']],
                alignments: ['left'],
            });
            expect(table).toContain('A VERY LONG TITLE');
        });
        it('handles empty strings in cells', () => {
            const table = renderAsciiTable({
                headers: [''],
                rows: [['']],
                alignments: ['left'],
            });
            expect(table).toContain('|  |');
        });
        it('handles missing rows entirely', () => {
            const table = renderAsciiTable({
                headers: ['A'],
                alignments: ['left'],
            });
            expect(table).toContain('A');
        });
        it('covers missing title padding branch', () => {
            const table = renderAsciiTable({
                title: 'T',
                headers: ['A'],
                alignments: ['left'],
            });
            expect(table).toContain('T');
        });
    });

    describe('formatNumericPair', () => {
        it('formats valid pair', () => {
            expect(formatNumericPair(1.23, 4.56)).toBe('1.23 / 4.56');
        });
        it('handles single valid value', () => {
            expect(formatNumericPair(1.23, NaN)).toBe('1.23');
            expect(formatNumericPair(NaN, 4.56)).toBe('4.56');
        });
        it('handles both invalid values', () => {
            expect(formatNumericPair(NaN, NaN)).toBe('–');
        });
        it('returns primary when forward is missing', () => {
            expect(formatNumericPair(1.23, NaN)).toBe('1.23');
        });
        it('returns forward when primary is missing', () => {
            expect(formatNumericPair(NaN, 4.56)).toBe('4.56');
        });
    });

    describe('formatPercentageValue', () => {
        it('formats auto mode correctly', () => {
            expect(formatPercentageValue(0.15, { digits: 2, mode: 'auto' })).toBe('15.00%');
            expect(formatPercentageValue(15, { digits: 2, mode: 'auto' })).toBe('15.00%');
        });
        it('formats percent mode correctly', () => {
            expect(formatPercentageValue(15, { digits: 2, mode: 'percent' })).toBe('15.00%');
        });
        it('formats fraction mode correctly', () => {
            expect(formatPercentageValue(0.15, { digits: 2, mode: 'fraction' })).toBe('15.00%');
        });
        it('handles non-finite values', () => {
            expect(formatPercentageValue(NaN)).toBe('–');
        });
        it('handles negative fractions', () => {
            expect(formatPercentageValue(-0.15, { digits: 2, mode: 'auto' })).toBe('-15.00%');
        });
        it('handles large percent values in auto mode', () => {
            expect(formatPercentageValue(-15, { digits: 2, mode: 'auto' })).toBe('-15.00%');
        });
        it('handles fraction mode with value > 1', () => {
            expect(formatPercentageValue(1.5, { digits: 2, mode: 'fraction' })).toBe('1.50%');
        });
        it('handles negative fractions mode', () => {
            expect(formatPercentageValue(-1.5, { digits: 2, mode: 'fraction' })).toBe('-1.50%');
        });
        it('handles values in other modes', () => {
            expect(formatPercentageValue(1, { digits: 2, mode: 'other' })).toBe('100.00%');
            expect(formatPercentageValue(2, { digits: 2, mode: 'other' })).toBe('2.00%');
            expect(formatPercentageValue(-1, { digits: 2, mode: 'other' })).toBe('-100.00%');
            expect(formatPercentageValue(-2, { digits: 2, mode: 'other' })).toBe('-2.00%');
        });
    });

    describe('formatTicker', () => {
        it('formats BRKB correctly', () => {
            expect(formatTicker('BRKB')).toBe('BRK-B');
        });
        it('returns ticker if available', () => {
            expect(formatTicker('AAPL')).toBe('AAPL');
        });
        it('returns N/A if missing', () => {
            expect(formatTicker(null)).toBe('N/A');
        });
    });

    describe('formatYearsValue', () => {
        it('formats years correctly', () => {
            expect(formatYearsValue(365)).toBe('1.00y');
            expect(formatYearsValue(730)).toBe('2.00y');
        });
        it('handles non-finite or negative values', () => {
            expect(formatYearsValue(-10)).toBe('N/A');
            expect(formatYearsValue(NaN)).toBe('N/A');
        });
    });

    describe('formatNumeric', () => {
        it('formats finite numbers', () => {
            expect(formatNumeric(1.234, 2)).toBe('1.23');
        });
        it('handles non-finite numbers', () => {
            expect(formatNumeric(NaN, 2)).toBe('–');
        });
    });

    describe('formatPrice', () => {
        it('formats finite numbers', () => {
            expect(formatPrice(100.5)).toBe('$100.50');
        });
        it('handles non-finite numbers', () => {
            expect(formatPrice(NaN)).toBe('–');
        });
    });

    describe('formatShareValue', () => {
        it('formats regular shares', () => {
            expect(formatShareValue(1.2345678)).toBe('1.234568');
        });
        it('handles non-finite numbers', () => {
            expect(formatShareValue(NaN)).toBe('0.000000');
        });
    });

    describe('formatShareValueShort', () => {
        it('formats short shares', () => {
            expect(formatShareValueShort(1.2345678)).toBe('1.23');
        });
        it('handles non-finite numbers', () => {
            expect(formatShareValueShort(NaN)).toBe('0.00');
        });
    });

    describe('formatResidualValue', () => {
        it('formats tiny values to 0', () => {
            expect(formatResidualValue(1e-10)).toBe('0');
        });
        it('formats larger values normally', () => {
            expect(formatResidualValue(1.5)).toBe('1.500000');
        });
        it('handles non-finite numbers', () => {
            expect(formatResidualValue(NaN)).toBe('N/A');
        });
    });
});
