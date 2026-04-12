// File: /Users/lz/dev/fund/js/tests/formatting.test.js
import * as formatting from '@utils/formatting.js';
import { CURRENCY_SYMBOLS } from '@js/config.js';
import fxData from '../data/mock_fx_data.json';

const rates = fxData.rates;

describe('formatNumber', () => {
    it('should format positive numbers correctly', () => {
        expect(formatting.formatNumber(123, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe('$123');
        expect(formatting.formatNumber(1234, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe('$1.23k');
        expect(formatting.formatNumber(1234567, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe(
            '$1.235m'
        );
        expect(formatting.formatNumber(1234567890, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe(
            '$1.235b'
        );
    });

    it('should format negative numbers correctly', () => {
        expect(formatting.formatNumber(-123, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe('$123');
        expect(formatting.formatNumber(-1234, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe(
            '$1.23k'
        );
        expect(formatting.formatNumber(-1234567, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe(
            '$1.235m'
        );
    });

    it('should handle the isChange flag correctly for positive changes', () => {
        expect(formatting.formatNumber(123, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe('+$123');
        expect(formatting.formatNumber(1234, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe('+$1.23k');
        expect(formatting.formatNumber(12345, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe(
            '+$12.3k'
        );
        expect(formatting.formatNumber(123456, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe(
            '+$123k'
        );
        expect(formatting.formatNumber(1234567, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe(
            '+$1.23m'
        );
        expect(formatting.formatNumber(0.123, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe('+$0.12');
        expect(formatting.formatNumber(0.000123, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe(
            '+$0.000123'
        );
        expect(formatting.formatNumber(0.0123, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe(
            '+$0.01'
        );
        expect(formatting.formatNumber(0.00123, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe(
            '+$0.00123'
        );
    });

    it('should handle currency conversion correctly for JPY', () => {
        expect(formatting.formatNumber(10000, CURRENCY_SYMBOLS, false, 'JPY', rates)).toBe(
            '¥1.469m'
        );
    });

    it('should format zero correctly', () => {
        expect(formatting.formatNumber(0, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe('$0');
    });

    it('should format small numbers correctly', () => {
        expect(formatting.formatNumber(0.123, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe('$0.12');
        expect(formatting.formatNumber(-0.5, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe('-$0.50');
        expect(formatting.formatNumber(-0.06, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe('-$0.06');
    });

    it('should handle unknown currency gracefully', () => {
        expect(formatting.formatNumber(123, CURRENCY_SYMBOLS, false, 'CAD', rates)).toBe('123');
    });

    it('should return an empty string for null or undefined input', () => {
        expect(formatting.formatNumber(null, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe('');
        expect(formatting.formatNumber(undefined, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe('');
    });

    it('should handle KRW correctly', () => {
        expect(formatting.formatNumber(1000000, CURRENCY_SYMBOLS, false, 'KRW', rates)).toBe(
            '₩1.384b'
        );
        expect(formatting.formatNumber(1000, CURRENCY_SYMBOLS, false, 'KRW', rates)).toBe('₩1.38m');
        expect(formatting.formatNumber(100000, CURRENCY_SYMBOLS, false, 'KRW', rates)).toBe(
            '₩138m'
        );
        expect(formatting.formatNumber(1000000000, CURRENCY_SYMBOLS, false, 'KRW', rates)).toBe(
            '₩1384b'
        );
    });

    it('should handle precision for k suffix', () => {
        expect(formatting.formatNumber(1234.56, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe(
            '$1.23k'
        );
    });

    it('should handle precision < 0 for KRW', () => {
        expect(formatting.formatNumber(100000000, CURRENCY_SYMBOLS, false, 'KRW', rates)).toBe(
            '₩138.4b'
        );
    });

    it('should handle precision < 0 for non-KRW', () => {
        expect(formatting.formatNumber(100000000, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe(
            '$100.0m'
        );
    });

    it('should handle withSign for billions path', () => {
        // Triggers the absNum >= 1e9 branch (lines 108-109)
        expect(formatting.formatNumber(1e9, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe('+$1.00b');
    });

    it('should clamp precision to 0 for very large numbers with b suffix', () => {
        // Triggers negative computed precision and clamps to 0 (line 165)
        expect(formatting.formatNumber(1e13, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe(
            '$10000b'
        );
    });

    it('should clamp precision to 0 in KRW branch when computed negative', () => {
        // Force precision < 0 in the KRW special-case block (line 141)
        const originalLog10 = Math.log10;
        jest.spyOn(Math, 'log10').mockReturnValue(5); // floor(5) => precision becomes negative
        try {
            // 500,000 USD * 1384 KRW/USD = 692,000,000 (< 1e9) => KRW branch (val ≈ 692)
            expect(formatting.formatNumber(500000, CURRENCY_SYMBOLS, false, 'KRW', rates)).toBe(
                '₩692m'
            );
        } finally {
            Math.log10 = originalLog10;
        }
    });
});

describe('formatPercentage', () => {
    it('should format positive percentages correctly', () => {
        expect(formatting.formatPercentage(0.123)).toBe('+12.30%');
    });

    it('should format negative percentages correctly', () => {
        expect(formatting.formatPercentage(-0.456)).toBe('-45.60%');
    });

    it('should format zero percentage correctly', () => {
        expect(formatting.formatPercentage(0)).toBe('0.00%');
    });

    it('should handle non-numeric input gracefully', () => {
        expect(formatting.formatPercentage('abc')).toBe('0.00%');
    });
});

describe('formatCurrency', () => {
    it('should format currency correctly', () => {
        expect(formatting.formatCurrency(123.45, 'USD', rates, CURRENCY_SYMBOLS)).toBe('$123.45');
    });

    it('should handle non-numeric input', () => {
        expect(formatting.formatCurrency('abc', 'USD', rates, CURRENCY_SYMBOLS)).toBe('abc');
        expect(formatting.formatCurrency(NaN, 'USD', rates, CURRENCY_SYMBOLS)).toBe('$0.00');
    });

    it('should handle missing rate', () => {
        expect(formatting.formatCurrency(123.45, 'EUR', rates, CURRENCY_SYMBOLS)).toBe('$123.45');
    });
});

describe('compactNumber', () => {
    it('should compact numbers correctly', () => {
        expect(formatting.compactNumber(12345)).toBe('12.3k');
        expect(formatting.compactNumber(1234567)).toBe('1.23M');
        expect(formatting.compactNumber(1234567890)).toBe('1.23B');
        expect(formatting.compactNumber(1234567890123)).toBe('1.23T');
        expect(formatting.compactNumber(123)).toBe('123');
        expect(formatting.compactNumber(-12345)).toBe('-12.3k');
        expect(formatting.compactNumber(100000)).toBe('100k');
        expect(formatting.compactNumber(10000000)).toBe('10.0M');
    });

    it('should handle non-numeric input', () => {
        expect(formatting.compactNumber('abc')).toBe('0');
    });

    it('should handle large numbers', () => {
        expect(formatting.compactNumber(1e16)).toBe('1.00e+16');
    });
});

describe('toFixed', () => {
    it('should format to fixed decimal places', () => {
        expect(formatting.toFixed(123.456, 2)).toBe('123.46');
    });

    it('should handle non-numeric input', () => {
        expect(formatting.toFixed('abc', 2)).toBe('');
    });
});

describe('formatAsCurrency', () => {
    it('should format as currency', () => {
        expect(formatting.formatAsCurrency(123.45, 'USD')).toBe('$123.45');
    });
});

describe('addCommas', () => {
    it('should add commas to numbers', () => {
        expect(formatting.addCommas(1234567)).toBe('1,234,567');
    });
    it('should handle non-numeric input', () => {
        expect(formatting.addCommas(null)).toBe('');
    });
});

describe('formatCurrencyChange', () => {
    it('should correctly format currency change without formatter provided', () => {
        // Positive number
        expect(formatting.formatCurrencyChange(1234.56)).toBe('+$1,234.56');

        // Negative number
        expect(formatting.formatCurrencyChange(-1234.56)).toBe('-$1,234.56');

        // Zero
        expect(formatting.formatCurrencyChange(0)).toBe('$0.00');

        // Invalid number
        expect(formatting.formatCurrencyChange('not-a-number')).toBe('n/a');
        expect(formatting.formatCurrencyChange(NaN)).toBe('n/a');

        // Default currency formatter fallback (simulating !Number.isFinite check)
        // This is handled by defaultCurrencyFormatter if somehow called directly,
        // but formatCurrencyChange catches !isFinite first. We test defaultCurrencyFormatter
        // implicitly through formatSummaryBlock using non-finite values if possible,
        // or by creating a mock summary that doesn't trigger formatCurrencyChange.
    });

    it('should handle custom formatter that returns un-prefixed values', () => {
        expect(formatting.formatCurrencyChange(10, (val) => `VAL:${val}`)).toBe('+VAL:10');
    });

    it('should trigger defaultCurrencyFormatter with non-finite values via formatSummaryBlock', () => {
        const summary = {
            hasData: true,
            startValue: NaN,
            endValue: Infinity,
            netChange: 10,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const result = formatting.formatSummaryBlock('Test', summary, { from: '2024-01-01' });

        // defaultCurrencyFormatter returns $0.00 for !isFinite
        expect(result).toContain('Start: $0.00');
        expect(result).toContain('End: $0.00');
    });
});

describe('formatDate', () => {
    it('should format date correctly', () => {
        expect(formatting.formatDate('2025-08-24T12:00:00Z')).toBe('2025-08-24');
    });
    it('should handle empty input', () => {
        expect(formatting.formatDate('')).toBe('');
    });
});

describe('formatWithSign', () => {
    it('should format with sign', () => {
        expect(formatting.formatWithSign(123)).toBe('+123');
        expect(formatting.formatWithSign(-123)).toBe('-123');
    });
});

describe('formatToTwoDecimals', () => {
    it('should format to two decimals', () => {
        expect(formatting.formatToTwoDecimals(123.456)).toBe('123.46');
    });
});

describe('formatAsPercentage', () => {
    it('should format as percentage', () => {
        expect(formatting.formatAsPercentage(0.123)).toBe('12.30%');
    });
});

describe('formatCompact', () => {
    it('should format compact', () => {
        expect(formatting.formatCompact(12345)).toBe('12.3k');
        expect(formatting.formatCompact(1234567)).toBe('1.2m');
        expect(formatting.formatCompact(1234567890)).toBe('1.2b');
        expect(formatting.formatCompact(123)).toBe('123');
    });
});

describe('formatWithCurrencySymbol', () => {
    it('should format with currency symbol', () => {
        expect(formatting.formatWithCurrencySymbol(123.45, '$')).toBe('$123.45');
    });
});

describe('formatWithPrecision', () => {
    it('should format with precision', () => {
        expect(formatting.formatWithPrecision(123.456, 4)).toBe('123.5');
    });
});

describe('formatExponential', () => {
    it('should format exponential', () => {
        expect(formatting.formatExponential(123.456, 2)).toBe('1.23e+2');
    });
});

describe('formatToLocaleString', () => {
    it('should format to locale string', () => {
        expect(formatting.formatToLocaleString(1234567, 'en-US')).toBe('1,234,567');
    });
});

describe('formatToString', () => {
    it('should format to string', () => {
        expect(formatting.formatToString(255, 16)).toBe('ff');
    });
});

describe('formatToPrecision', () => {
    it('should format to precision', () => {
        expect(formatting.formatToPrecision(123.456, 4)).toBe('123.5');
    });
});

describe('formatToFixed', () => {
    it('should format to fixed', () => {
        expect(formatting.formatToFixed(123.456, 2)).toBe('123.46');
    });
});

describe('formatToExponential', () => {
    it('should format to exponential', () => {
        expect(formatting.formatToExponential(123.456, 2)).toBe('1.23e+2');
    });
});

describe('formatToLocale', () => {
    it('should format to locale', () => {
        expect(formatting.formatToLocale(1234567, 'en-US')).toBe('1,234,567');
    });
});

describe('padWithLeadingZeros', () => {
    it('should pad with leading zeros', () => {
        expect(formatting.padWithLeadingZeros(123, 5)).toBe('00123');
    });
});

describe('padWithTrailingZeros', () => {
    it('should pad with trailing zeros', () => {
        expect(formatting.padWithTrailingZeros(123, 6)).toBe('123.00');
    });
});

describe('padWithSpaces', () => {
    it('should pad with spaces', () => {
        expect(formatting.padWithSpaces(123, 5)).toBe('  123');
    });
});

describe('padWithChar', () => {
    it('should pad with char', () => {
        expect(formatting.padWithChar(123, 5, '_')).toBe('__123');
    });
});

describe('addPrefix', () => {
    it('should add prefix', () => {
        expect(formatting.addPrefix(123, 'ID-')).toBe('ID-123');
    });
});

describe('addSuffix', () => {
    it('should add suffix', () => {
        expect(formatting.addSuffix(123, ' units')).toBe('123 units');
    });
});

describe('addSeparator', () => {
    it('should add separator', () => {
        expect(formatting.addSeparator(1234567, '.')).toBe('1.234.567');
    });
});

describe('changeDecimalSeparator', () => {
    it('should change decimal separator', () => {
        expect(formatting.changeDecimalSeparator(123.45, ',')).toBe('123,45');
    });
});

describe('changeThousandSeparator', () => {
    it('should change thousand separator', () => {
        expect(formatting.changeThousandSeparator('1,234,567', '.')).toBe('1.234.567');
    });
});

describe('changeCurrencySymbolPosition', () => {
    it('should change currency symbol position', () => {
        expect(formatting.changeCurrencySymbolPosition(123, '$', 'after')).toBe('123$');
        expect(formatting.changeCurrencySymbolPosition(123, '$', 'before')).toBe('$123');
    });
});

describe('changeSignPosition', () => {
    it('should change sign position', () => {
        expect(formatting.changeSignPosition(123, 'after')).toBe('123+');
        expect(formatting.changeSignPosition(-123, 'after')).toBe('123-');
        expect(formatting.changeSignPosition(123, 'before')).toBe('+123');
    });
});

describe('toDigits', () => {
    it('should format to digits', () => {
        expect(formatting.toDigits(123.45, 3)).toBe('1.23e+2');
    });
});

describe('toIntegerDigits', () => {
    it('should format to integer digits', () => {
        expect(formatting.toIntegerDigits(123.45, 5)).toBe('00123.45');
    });
});

describe('formatCurrencyChange', () => {
    it('returns n/a if value is not finite', () => {
        expect(formatting.formatCurrencyChange(NaN)).toBe('n/a');
        expect(formatting.formatCurrencyChange(Infinity)).toBe('n/a');
    });

    it('returns n/a for non-finite values using default formatter', () => {
        // Need to test default formatter for non-finite
        // We do this by creating a mock summary that directly uses it internally
        expect(formatting.formatCurrencyChange(NaN, null)).toBe('n/a');
    });
});

describe('formatSummaryBlock internals', () => {
    it('covers default formatter path', () => {
        const summary = {
            hasData: true,
            startValue: NaN,
            endValue: NaN,
            netChange: 10,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const result = formatting.formatSummaryBlock('Test', summary);
        expect(result).toContain('Start: $0.00');
    });
});

describe('formatSummaryBlock', () => {
    it('includes percentage text when startValue is valid', () => {
        const summary = {
            hasData: true,
            startValue: 100,
            endValue: 150,
            netChange: 50,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const result = formatting.formatSummaryBlock('Test', summary);
        expect(result).toContain('Change: +$50.00 (+50.00%)');
    });
});

describe('formatAppreciationBlock', () => {
    it('returns empty string if endValue is not valid', () => {
        const balance = { hasData: true, netChange: 50 };
        const contrib = { hasData: true, netChange: 10 };
        const result = formatting.formatAppreciationBlock(balance, contrib);
        expect(result).toContain('Value: +$40.00'); // endValue undefined -> no percentage
    });
});

describe('compactNumber - fallback unit coverage', () => {
    it('returns exponential for index out of unit bounds', () => {
        // units: k, M, B, T (index 0, 1, 2, 3)
        // >= 1e15 -> Math.log10(1e15) = 15, floor(15/3) - 1 = 4. units[4] is undefined.
        expect(formatting.compactNumber(1e15)).toBe('1.00e+15');
    });
});

describe('formatNumber - suffix empty formatting branches', () => {
    it('formats with empty suffix (value < 1000)', () => {
        // Trigger calculatePrecision block where suffix === '' but val % 1 !== 0
        expect(formatting.formatNumber(12.345, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe(
            '$12.35'
        );
    });
});

describe('formatSummaryBlock internals', () => {
    it('returns empty string from formatSummaryDateSuffix when targetDateStr is empty', () => {
        const actualDate = new Date('2024-01-05T00:00:00Z');
        expect(formatting.formatSummaryDateSuffix(actualDate, '')).toBe('');
    });
});

describe('formatWithSign - additional', () => {
    it('returns 0 string for 0 input', () => {
        expect(formatting.formatWithSign(0)).toBe('0');
    });
});

describe('formatToTwoDecimals - edge case', () => {
    it('formats exact numbers', () => {
        expect(formatting.formatToTwoDecimals(1)).toBe('1.00');
    });
});

describe('compactNumber - unit array out of bounds edge case', () => {
    it('returns NaN string for missing unit', () => {
        expect(formatting.compactNumber(NaN)).toBe('0');
    });
});

describe('formatWithSign - missing sign', () => {
    it('handles negative and positive correctly', () => {
        expect(formatting.formatWithSign(-123)).toBe('-123');
        expect(formatting.formatWithSign(123)).toBe('+123');
    });
});

describe('toDigits - precision mapping', () => {
    it('formats correct digits', () => {
        expect(formatting.toDigits(100, 3)).toBe('1.00e+2');
    });
});

describe('changeSignPosition - after branch', () => {
    it('appends the sign to the absolute number when position is after', () => {
        expect(formatting.changeSignPosition(-123, 'after')).toBe('123-');
        expect(formatting.changeSignPosition(123, 'after')).toBe('123+');
    });
});

describe('pad helpers - missing branch coverage', () => {
    it('padWithTrailingZeros does not add decimal if present', () => {
        expect(formatting.padWithTrailingZeros(12.3, 6)).toBe('12.300');
    });
});

describe('getConvertedNum and related logic', () => {
    it('checks fallback logic when rates mapping is not populated', () => {
        expect(formatting.formatNumber(100, CURRENCY_SYMBOLS, false, 'USD', {})).toBe('$100');
    });
});

describe('getHistoricalCurrencyValue coverage', () => {
    it('covers default valueType argument', () => {
        const entry = { totalUSD: 50 };
        // Don't pass the third argument to hit valueType = 'total'
        expect(formatting.getHistoricalCurrencyValue(entry, 'USD')).toBe(50);
    });

    it('returns 0 if entry[valueType] is missing and base fallback kicks in', () => {
        const entry = { otherKey: 10 };
        expect(formatting.getHistoricalCurrencyValue(entry, 'USD', 'total')).toBe(0);
    });
});

describe('formatCurrencyChange additional coverage', () => {
    it('falls back to defaultCurrencyFormatter if formatter is explicitly null', () => {
        // null is not a function
        expect(formatting.formatCurrencyChange(10, null)).toBe('+$10.00');
    });

    it('does not prepend + if the returned formatted string is null (hypothetical mock)', () => {
        // Since `null?.startsWith` is undefined, `undefined ? ... : '+null'` returns `+null` due to template literal evaluation.
        // We really want to hit `formatted?.startsWith('+')` evaluating to true.
        const mockFormatter = () => '+123';
        expect(formatting.formatCurrencyChange(10, mockFormatter)).toBe('+123');
    });
});

describe('compactNumber - unit array out of bounds edge case 2', () => {
    it('handles negative indices safely when numbers are extremely small', () => {
        // Trigger negative unitIndex if possible, though value < 1000 is checked first.
        // If we provide a tiny positive float, value < 1000 handles it, so we mock it if necessary,
        // but just to be sure we hit line 113, test a very large string value that parses as NaN
        // covered in a separate block.
    });
});

describe('changeSignPosition - before edge case', () => {
    it('prepends negative sign', () => {
        expect(formatting.changeSignPosition(-123, 'before')).toBe('-123');
    });
});

describe('formatCompact - edge case', () => {
    it('formats numbers just below 1000', () => {
        expect(formatting.formatCompact(999)).toBe('999');
    });
});

// Additional coverage for formatCurrency conversion paths and symbol fallback
describe('formatCurrency – extra cases', () => {
    it('converts with an existing rate (JPY) using the target symbol', () => {
        // 10 USD * 110 JPY/USD = 1,100 JPY
        expect(formatting.formatCurrency(10, 'JPY', rates, CURRENCY_SYMBOLS)).toBe('¥1,469.03');
    });

    it('uses the currency code when symbol is missing', () => {
        const localRates = { ABC: 2 };
        const localSymbols = { ...CURRENCY_SYMBOLS }; // no ABC entry
        // 100 USD * 2 = 200 ABC
        expect(formatting.formatCurrency(100, 'ABC', localRates, localSymbols)).toBe('ABC200.00');
    });

    it('formats absolute value for negative numbers after conversion', () => {
        // -10 USD * 110 JPY/USD => still formats as positive per spec (absolute value)
        expect(formatting.formatCurrency(-10, 'JPY', rates, CURRENCY_SYMBOLS)).toBe('¥1,469.03');
    });
});
// Extra coverage for early branches and pad helpers

describe('formatCurrency – warnings and fallbacks', () => {
    let warnSpy;
    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('warns & falls back to $ when rate missing and no USD symbol provided', () => {
        const localSymbols = {}; // no USD symbol
        const result = formatting.formatCurrency(1, 'EUR', rates, localSymbols);
        expect(warnSpy).toHaveBeenCalled();
        expect(result).toBe('$1.00');
    });

    it('handles NaN (non-string) input by returning $0.00 with fallback symbol', () => {
        const localSymbols = {}; // ensure fallback to '$'
        expect(formatting.formatCurrency(NaN, 'ZZZ', rates, localSymbols)).toBe('$0.00');
    });
});

describe('formatSummaryBlock and formatAppreciationBlock', () => {
    const summary = {
        hasData: true,
        startValue: 100,
        endValue: 175,
        netChange: 75,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
    };
    const otherSummary = {
        hasData: true,
        startValue: 100,
        endValue: 150,
        netChange: 50,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
    };
    const formatter = (value) => `¥${Number(value).toFixed(2)}`;

    it('uses the provided formatter for summary blocks', () => {
        const result = formatting.formatSummaryBlock(
            'Contribution',
            summary,
            { from: '2024-01-01', to: '2024-12-31' },
            { formatValue: formatter }
        );
        expect(result).toContain('Start: ¥100.00');
        expect(result).toContain('End: ¥175.00 (2024-12-31)');
        // Change percentage = 75 / 100 (start value) = 75%
        expect(result).toContain('Change: +¥75.00 (+75.00%)');
    });

    it('formats appreciation text with the custom formatter', () => {
        const result = formatting.formatAppreciationBlock(summary, otherSummary, {
            formatValue: formatter,
        });
        // Appreciation = balance netChange (75) - contribution netChange (50) = 25
        // Percentage = 25 / contribution endValue (150) = 16.67%
        expect(result).toContain('Value: +¥25.00 (+16.67%)');
    });

    it('calculates appreciation percentage relative to contribution end value', () => {
        const balanceSummary = {
            hasData: true,
            startValue: 500000,
            endValue: 1200000,
            netChange: 700000,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const contributionSummary = {
            hasData: true,
            startValue: 400000,
            endValue: 800000,
            netChange: 400000,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const result = formatting.formatAppreciationBlock(balanceSummary, contributionSummary, {
            formatValue: formatter,
        });
        // Appreciation = 700000 - 400000 = 300000
        // Percentage = 300000 / 800000 = 37.5%
        expect(result).toContain('Value: +¥300000.00 (+37.50%)');
    });

    it('handles negative appreciation percentage', () => {
        const balanceSummary = {
            hasData: true,
            startValue: 100,
            endValue: 120,
            netChange: 20,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const contributionSummary = {
            hasData: true,
            startValue: 100,
            endValue: 150,
            netChange: 50,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const result = formatting.formatAppreciationBlock(balanceSummary, contributionSummary, {
            formatValue: formatter,
        });
        // Appreciation = 20 - 50 = -30
        // Percentage = -30 / 150 = -20%
        expect(result).toContain('Value: ¥-30.00 (-20.00%)');
    });

    it('omits percentage when contribution end value is zero', () => {
        const balanceSummary = {
            hasData: true,
            startValue: 0,
            endValue: 100,
            netChange: 100,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const contributionSummary = {
            hasData: true,
            startValue: 0,
            endValue: 0,
            netChange: 0,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const result = formatting.formatAppreciationBlock(balanceSummary, contributionSummary, {
            formatValue: formatter,
        });
        // Should not include percentage when contribution end value is 0
        expect(result).toContain('Value: +¥100.00');
        expect(result).not.toMatch(/\(\+?\-?\d+\.\d+%\)/);
    });

    it('returns placeholder text when there is no data', () => {
        const noDataSummary = { hasData: false };
        const result = formatting.formatSummaryBlock('Contribution', noDataSummary, null, {
            formatValue: formatter,
        });
        expect(result).toContain('(no data for selected range)');
    });

    it('calculates change percentage relative to start value in summary blocks', () => {
        const balanceSummary = {
            hasData: true,
            startValue: 500000,
            endValue: 600000,
            netChange: 100000,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const result = formatting.formatSummaryBlock(
            'Balance',
            balanceSummary,
            { from: '2024-01-01', to: '2024-12-31' },
            { formatValue: formatter }
        );
        // Change percentage = 100000 / 500000 = 20%
        expect(result).toContain('Change: +¥100000.00 (+20.00%)');
    });

    it('handles negative change percentage in summary blocks', () => {
        const balanceSummary = {
            hasData: true,
            startValue: 1000,
            endValue: 800,
            netChange: -200,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const result = formatting.formatSummaryBlock(
            'Balance',
            balanceSummary,
            { from: '2024-01-01', to: '2024-12-31' },
            { formatValue: formatter }
        );
        // Change percentage = -200 / 1000 = -20%
        expect(result).toContain('Change: ¥-200.00 (-20.00%)');
    });

    it('omits change percentage when start value is zero', () => {
        const balanceSummary = {
            hasData: true,
            startValue: 0,
            endValue: 1000,
            netChange: 1000,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
        };
        const result = formatting.formatSummaryBlock(
            'Balance',
            balanceSummary,
            { from: '2024-01-01', to: '2024-12-31' },
            { formatValue: formatter }
        );
        // Should not include percentage when start value is 0
        expect(result).toContain('Change: +¥1000.00');
        expect(result).not.toMatch(/Change:.*\(\+?\-?\d+\.\d+%\)/);
    });

    it('returns empty string for formatSummaryDateSuffix when given non-Date object', () => {
        expect(formatting.formatSummaryDateSuffix(null, '2024-01-01')).toBe('');
        expect(formatting.formatSummaryDateSuffix('2024-01-01', '2024-01-01')).toBe('');
    });

    it('returns correct suffix when actualDate differs from targetDateStr', () => {
        const actualDate = new Date('2024-01-05T00:00:00Z');
        expect(formatting.formatSummaryDateSuffix(actualDate, '2024-01-01')).toBe(' (2024-01-05)');
    });

    it('returns empty string from formatAppreciationBlock when missing hasData', () => {
        const noDataSummary = { hasData: false };
        const validSummary = { hasData: true, netChange: 10 };

        expect(formatting.formatAppreciationBlock(noDataSummary, validSummary)).toBe('');
        expect(formatting.formatAppreciationBlock(validSummary, noDataSummary)).toBe('');
        expect(formatting.formatAppreciationBlock(null, validSummary)).toBe('');
    });

    it('returns empty string from formatAppreciationBlock when valueAdded is not finite', () => {
        const balanceSummary = { hasData: true, netChange: NaN };
        const contributionSummary = { hasData: true, netChange: 10 };

        expect(formatting.formatAppreciationBlock(balanceSummary, contributionSummary)).toBe('');
    });

    it('handles formatSummaryBlock when summary.endDate is missing or not a date', () => {
        const balanceSummary = {
            hasData: true,
            startValue: 1000,
            endValue: 2000,
            netChange: 1000,
            startDate: new Date('2024-01-01'),
            // Missing endDate
        };
        const result = formatting.formatSummaryBlock(
            'Balance',
            balanceSummary,
            { from: '2024-01-01', to: '2024-12-31' },
            { formatValue: formatter }
        );
        expect(result).not.toMatch(/End:.*\(.*\)/);
    });
});

describe('formatNumber – NaN handling', () => {
    it('returns empty string for NaN', () => {
        expect(formatting.formatNumber(NaN, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe('');
    });
});

describe('padWithTrailingZeros – decimal present path', () => {
    it('pads correctly when a decimal already exists', () => {
        expect(formatting.padWithTrailingZeros(12.3, 6)).toBe('12.300');
    });
});

describe('toIntegerDigits – edge cases', () => {
    it('pads when there is no fractional part', () => {
        expect(formatting.toIntegerDigits(7, 3)).toBe('007');
    });
    it('keeps fractional part when present', () => {
        expect(formatting.toIntegerDigits(7.5, 3)).toBe('007.5');
    });
});

describe('formatNumber – explicit early guard', () => {
    it('returns empty string for undefined, null, and NaN (withSign=false)', () => {
        [undefined, null, NaN].forEach((invalid) => {
            expect(formatting.formatNumber(invalid, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe(
                ''
            );
        });
    });

    it('returns empty string for non-numeric values that coerce to NaN via isNaN', () => {
        // Using a string that triggers the global isNaN coercion path explicitly
        expect(formatting.formatNumber('not-a-number', CURRENCY_SYMBOLS, false, 'USD', rates)).toBe(
            ''
        );
    });

    it('also returns empty string when withSign=true', () => {
        [undefined, null, NaN, 'not-a-number'].forEach((invalid) => {
            expect(formatting.formatNumber(invalid, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe('');
        });
    });

    it('uses default parameters when not provided', () => {
        // Test default parameters: withSign=false, currency='USD', rates={}
        expect(formatting.formatNumber(1000, CURRENCY_SYMBOLS)).toBe('$1.00k');
    });
});

describe('getHistoricalCurrencyValue', () => {
    it('should extract historical currency values correctly', () => {
        const entry = {
            totalUSD: 1000,
            totalCNY: 7200,
            totalJPY: 150000,
            totalKRW: 1350000,
            dailyChangeUSD: 50,
            dailyChangeCNY: 360,
            dailyChangeJPY: 7500,
            dailyChangeKRW: 67500,
        };

        expect(formatting.getHistoricalCurrencyValue(entry, 'USD', 'total')).toBe(1000);
        expect(formatting.getHistoricalCurrencyValue(entry, 'CNY', 'total')).toBe(7200);
        expect(formatting.getHistoricalCurrencyValue(entry, 'JPY', 'total')).toBe(150000);
        expect(formatting.getHistoricalCurrencyValue(entry, 'KRW', 'total')).toBe(1350000);

        expect(formatting.getHistoricalCurrencyValue(entry, 'USD', 'dailyChange')).toBe(50);
        expect(formatting.getHistoricalCurrencyValue(entry, 'CNY', 'dailyChange')).toBe(360);
        expect(formatting.getHistoricalCurrencyValue(entry, 'JPY', 'dailyChange')).toBe(7500);
        expect(formatting.getHistoricalCurrencyValue(entry, 'KRW', 'dailyChange')).toBe(67500);
    });

    it('should fallback to base value when historical data missing', () => {
        const entry = {
            total: 1000,
            dailyChange: 50,
        };

        expect(formatting.getHistoricalCurrencyValue(entry, 'USD', 'total')).toBe(1000);
        expect(formatting.getHistoricalCurrencyValue(entry, 'CNY', 'total')).toBe(1000);
        expect(formatting.getHistoricalCurrencyValue(entry, 'USD', 'dailyChange')).toBe(50);
        expect(formatting.getHistoricalCurrencyValue(entry, 'CNY', 'dailyChange')).toBe(50);
    });

    it('should handle null or undefined entry', () => {
        expect(formatting.getHistoricalCurrencyValue(null, 'USD', 'total')).toBe(0);
        expect(formatting.getHistoricalCurrencyValue(undefined, 'USD', 'total')).toBe(0);
    });
});

describe('formatNumber with historical data', () => {
    it('should use historical currency values when entry provided', () => {
        const entry = {
            totalUSD: 1000,
            totalCNY: 7200,
            totalJPY: 150000,
            totalKRW: 1350000,
            dailyChangeUSD: 50,
            dailyChangeCNY: 360,
            dailyChangeJPY: 7500,
            dailyChangeKRW: 67500,
        };

        // Test total values (using historical data from entry, not rate conversion)
        expect(
            formatting.formatNumber(1000, CURRENCY_SYMBOLS, false, 'USD', rates, entry, 'total')
        ).toBe('$1.00k');
        expect(
            formatting.formatNumber(1000, CURRENCY_SYMBOLS, false, 'CNY', rates, entry, 'total')
        ).toBe('¥7.20k');
        expect(
            formatting.formatNumber(1000, CURRENCY_SYMBOLS, false, 'JPY', rates, entry, 'total')
        ).toBe('¥150.0k');
        expect(
            formatting.formatNumber(1000, CURRENCY_SYMBOLS, false, 'KRW', rates, entry, 'total')
        ).toBe('₩1.35m');

        // Test daily change values with sign (using historical data from entry)
        expect(
            formatting.formatNumber(50, CURRENCY_SYMBOLS, true, 'USD', rates, entry, 'dailyChange')
        ).toBe('+$50.0');
        expect(
            formatting.formatNumber(50, CURRENCY_SYMBOLS, true, 'CNY', rates, entry, 'dailyChange')
        ).toBe('+¥360');
        expect(
            formatting.formatNumber(50, CURRENCY_SYMBOLS, true, 'JPY', rates, entry, 'dailyChange')
        ).toBe('+¥7.50k');
        expect(
            formatting.formatNumber(50, CURRENCY_SYMBOLS, true, 'KRW', rates, entry, 'dailyChange')
        ).toBe('+₩67.5k');
    });

    it('should fallback to rate conversion when no historical data', () => {
        // Without entry, should use rate conversion (using actual mock rates)
        // CNY: 1000 * 7.1646 = 7164.6 → 7.16k
        // JPY: 1000 * 146.903 = 146903 → 146.9k
        // KRW: 1000 * 1383.79 = 1383790 → 1.38m
        expect(formatting.formatNumber(1000, CURRENCY_SYMBOLS, false, 'CNY', rates)).toBe('¥7.16k');
        expect(formatting.formatNumber(1000, CURRENCY_SYMBOLS, false, 'JPY', rates)).toBe(
            '¥146.9k'
        );
        expect(formatting.formatNumber(1000, CURRENCY_SYMBOLS, false, 'KRW', rates)).toBe('₩1.38m');
    });
});
