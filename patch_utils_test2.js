const fs = require('fs');

const path = 'tests/js/transactions/utils.test.js';
let content = fs.readFileSync(path, 'utf8');

// I will append the tests to the file directly
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
        expect(convertBetweenCurrencies(100, 'USD', '2024-01-01', 'EUR')).toBe(90);
    });

    test('converts from another currency to USD', () => {
        expect(convertBetweenCurrencies(90, 'EUR', '2024-01-01', 'USD')).toBe(100);
    });

    test('converts between two non-USD currencies', () => {
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

describe('convertValueToCurrency', () => {
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
        expect(convertValueToCurrency(NaN, '2024-01-01', 'EUR')).toBe(0);
    });

    test('returns original value if currency is USD', () => {
        expect(convertValueToCurrency(100, '2024-01-01', 'USD')).toBe(100);
    });

    test('returns original value if currency is omitted and selectedCurrency is USD', () => {
        expect(convertValueToCurrency(100, '2024-01-01')).toBe(100);
    });

    test('converts value to specified currency', () => {
        expect(convertValueToCurrency(100, '2024-01-01', 'EUR')).toBe(90);
    });

    test('handles Date objects for date parameter', () => {
        expect(convertValueToCurrency(100, new Date('2024-01-02'), 'EUR')).toBe(85);
    });
});
`;

content = content.replace("import { formatCurrencyCompact }", `import {
    formatCurrencyCompact,
    parseCSVLine,
    convertBetweenCurrencies,
    convertValueToCurrency,
    clearFxRateCache
} from '@js/transactions/utils.js';
import { transactionState } from '@js/transactions/state.js';`);

fs.writeFileSync(path, content + newTests);
