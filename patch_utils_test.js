const fs = require('fs');

const path = 'tests/js/transactions/utils.test.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    "import { formatCurrencyCompact } from '@js/transactions/utils.js';",
    `import {
    formatCurrencyCompact,
    parseCSVLine,
    convertBetweenCurrencies,
    clearFxRateCache,
    formatCurrency,
    formatCurrencyInlineValue
} from '@js/transactions/utils.js';
import { transactionState } from '@js/transactions/state.js';`
);

const newTests = `

describe('parseCSVLine', () => {
    test('parses simple comma separated values', () => {
        expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    test('handles values with spaces', () => {
        expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });

    test('handles quoted values with commas', () => {
        expect(parseCSVLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    });

    test('handles escaped quotes inside quoted values', () => {
        expect(parseCSVLine('a,"b,""c""",d')).toEqual(['a', 'b,"c"', 'd']);
    });

    test('handles empty values', () => {
        expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    });
});

describe('convertBetweenCurrencies', () => {
    beforeEach(() => {
        transactionState.fxRatesByCurrency = {
            EUR: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() },
                    { date: '2024-01-02', ts: new Date('2024-01-02').getTime() },
                ],
                map: new Map([
                    ['2024-01-01', 0.9],
                    ['2024-01-02', 0.85]
                ])
            },
            JPY: {
                sorted: [
                    { date: '2024-01-01', ts: new Date('2024-01-01').getTime() }
                ],
                map: new Map([
                    ['2024-01-01', 150]
                ])
            }
        };
        transactionState.selectedCurrency = 'USD';
        clearFxRateCache();
    });

    afterEach(() => {
        transactionState.fxRatesByCurrency = {};
        clearFxRateCache();
    });

    test('returns 0 for invalid value', () => {
        expect(convertBetweenCurrencies(NaN, 'USD', '2024-01-01', 'EUR')).toBe(0);
    });

    test('returns original value if source and target currencies are the same', () => {
        expect(convertBetweenCurrencies(100, 'EUR', '2024-01-01', 'EUR')).toBe(100);
    });

    test('converts from USD to another currency', () => {
        // 100 USD * 0.9 EUR/USD = 90 EUR
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01', 'EUR')).toBe(90);
    });

    test('converts from another currency to USD', () => {
        // 90 EUR / 0.9 EUR/USD = 100 USD
        expect(convertBetweenCurrencies(90, 'EUR', '2024-01-01', 'USD')).toBe(100);
    });

    test('converts between two non-USD currencies', () => {
        // 90 EUR -> 100 USD -> 15000 JPY
        expect(convertBetweenCurrencies(90, 'EUR', '2024-01-01', 'JPY')).toBe(15000);
    });

    test('handles missing fx rates by falling back to amount or USD amount', () => {
        expect(convertBetweenCurrencies(100, 'GBP', '2024-01-01', 'USD')).toBe(100);
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01', 'GBP')).toBe(100);
    });

    test('uses selected currency if toCurrency is omitted', () => {
        transactionState.selectedCurrency = 'EUR';
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01')).toBe(90);
    });
});

describe('formatCurrency', () => {
    beforeEach(() => {
        transactionState.selectedCurrency = 'USD';
    });

    test('formats valid numbers properly with default currency', () => {
        expect(formatCurrency(1234.56)).toBe('$1,234.56');
        expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
        expect(formatCurrency(0)).toBe('$0.00');
    });

    test('handles non-finite values by returning zero formatted', () => {
        expect(formatCurrency(NaN)).toBe('$0.00');
    });

    test('uses specific currency if provided', () => {
        expect(formatCurrency(100, { currency: 'EUR' })).toBe('€100.00');
    });
});

describe('formatCurrencyInlineValue', () => {
    test('formats valid numbers with default zero digits', () => {
        expect(formatCurrencyInlineValue(1234.56)).toBe('$1,235');
    });

    test('respects specified digits', () => {
        expect(formatCurrencyInlineValue(1234.56, { digits: 1 })).toBe('$1,234.6');
    });

    test('uses specific currency if provided', () => {
        expect(formatCurrencyInlineValue(100, { currency: 'EUR' })).toBe('€100');
    });
});
`;

fs.writeFileSync(path, content + newTests);
