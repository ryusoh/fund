const fs = require('fs');
const path = 'tests/js/transactions/utils.test.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/describe\('formatCurrency', \(\) => \{[\s\S]*?describe\('formatCurrencyInlineValue'/g, `describe('formatCurrency', () => {
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

describe('formatCurrencyInlineValue'`);

content = content.replace(/uses specific currency if provided', \(\) => \{[\s\S]*?\}\);/g, `uses specific currency if provided', () => {
        expect(formatCurrencyInlineValue(100, { currency: 'CNY' })).toBe('¥100');
    });`);

content = content.replace(/expect\(formatCurrency\(100, \{ currency: 'CNY' \}\)\)\.toBe\('¥100\.00'\);\n    \}\);/g, `expect(formatCurrency(100, { currency: 'CNY' })).toBe('¥100.00');
    });`);


fs.writeFileSync(path, content);
