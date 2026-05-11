const fs = require('fs');

const path = 'tests/js/transactions/utils.test.js';
let content = fs.readFileSync(path, 'utf8');

const newTests = `

describe('formatCurrency', () => {
    beforeEach(() => {
        transactionState.selectedCurrency = 'USD';
        transactionState.currencySymbol = '$';
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
        expect(formatCurrency(100, { currency: 'CNY' })).toBe('¥100.00');
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
        expect(formatCurrencyInlineValue(100, { currency: 'CNY' })).toBe('¥100');
    });
});

describe('formatCurrencyInline', () => {
    beforeEach(() => {
        transactionState.selectedCurrency = 'USD';
        transactionState.currencySymbol = '$';
    });

    test('handles non-finite values', () => {
        expect(formatCurrencyInline(NaN)).toBe('$0');
    });

    test('formats billions', () => {
        expect(formatCurrencyInline(1_200_000_000)).toBe('$1.20B');
    });

    test('formats millions', () => {
        expect(formatCurrencyInline(1_500_000)).toBe('$1.50M');
    });

    test('formats thousands', () => {
        expect(formatCurrencyInline(1_500)).toBe('$1.5k');
    });

    test('formats small values', () => {
        expect(formatCurrencyInline(5)).toBe('$5');
        expect(formatCurrencyInline(0.5)).toBe('$0.50');
    });

    test('formats negative values', () => {
        expect(formatCurrencyInline(-1_500)).toBe('-$1.5k');
    });
});
`;

content = content.replace("import { \n    formatCurrencyCompact", `import { \n    formatCurrency,\n    formatCurrencyInlineValue,\n    formatCurrencyInline,\n    formatCurrencyCompact`);

content = content + newTests;
fs.writeFileSync(path, content);
