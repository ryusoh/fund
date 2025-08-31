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
        expect(formatting.formatNumber(0.123, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe(
            '+$0.123'
        );
        expect(formatting.formatNumber(0.000123, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe(
            '+$0.000123'
        );
        expect(formatting.formatNumber(0.0123, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe(
            '+$0.0123'
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
        expect(formatting.formatNumber(0.123, CURRENCY_SYMBOLS, false, 'USD', rates)).toBe(
            '$0.1230'
        );
        expect(formatting.formatNumber(-0.5, CURRENCY_SYMBOLS, true, 'USD', rates)).toBe('-$0.500');
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
