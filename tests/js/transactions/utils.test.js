import { formatCurrencyCompact } from '@js/transactions/utils.js';

describe('formatCurrencyCompact', () => {
    test('uses B suffix for KRW when value exceeds one billion', () => {
        expect(formatCurrencyCompact(1_786_120_000, { currency: 'KRW' })).toBe('₩1.79B');
    });

    test('handles negative billions with USD', () => {
        expect(formatCurrencyCompact(-2_300_000_000, { currency: 'USD' })).toBe('-$2.30B');
    });
});
