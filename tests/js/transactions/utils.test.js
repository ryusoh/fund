import { formatCurrencyCompact } from '@js/transactions/utils.js';

describe('formatCurrencyCompact', () => {
    test('uses B suffix for KRW when value exceeds one billion', () => {
        expect(formatCurrencyCompact(1_786_120_000, { currency: 'KRW' })).toBe('₩1.79B');
    });

    test('handles negative billions with USD', () => {
        expect(formatCurrencyCompact(-2_300_000_000, { currency: 'USD' })).toBe('-$2.30B');
    });

    test('formats integer thousands without decimals in USD', () => {
        expect(formatCurrencyCompact(50_000, { currency: 'USD' })).toBe('$50k');
        expect(formatCurrencyCompact(40_000, { currency: 'USD' })).toBe('$40k');
        expect(formatCurrencyCompact(100_000, { currency: 'USD' })).toBe('$100k');
        expect(formatCurrencyCompact(-50_000, { currency: 'USD' })).toBe('-$50k');
    });

    test('maintains decimals for non-integer thousands in USD', () => {
        expect(formatCurrencyCompact(10_500, { currency: 'USD' })).toBe('$10.5k');
        expect(formatCurrencyCompact(50_100, { currency: 'USD' })).toBe('$50.1k');
    });

    test('formats integer millions without decimals in USD', () => {
        expect(formatCurrencyCompact(1_000_000, { currency: 'USD' })).toBe('$1M');
        expect(formatCurrencyCompact(20_000_000, { currency: 'USD' })).toBe('$20M');
    });

    test('maintains decimals for non-integer millions in USD', () => {
        expect(formatCurrencyCompact(1_250_000, { currency: 'USD' })).toBe('$1.25M');
        expect(formatCurrencyCompact(1_500_000, { currency: 'USD' })).toBe('$1.50M');
    });

    test('formats integer billions without decimals in USD', () => {
        expect(formatCurrencyCompact(1_000_000_000, { currency: 'USD' })).toBe('$1B');
    });

    test('formats zero as integer in USD', () => {
        expect(formatCurrencyCompact(0, { currency: 'USD' })).toBe('$0');
        expect(formatCurrencyCompact(0.004, { currency: 'USD' })).toBe('$0');
    });
});
