const fs = require('fs');

const path = 'tests/js/transactions/state.test.js';
let content = fs.readFileSync(path, 'utf8');

// I need to test getSelectedCurrency when selectedCurrency is null/empty string.
// I also need to test setCompositionFilterTickers when tickers is empty/invalid arrays.

content = content.replace(
    "test('setSelectedCurrency and getSelectedCurrency', () => {",
    `test('setSelectedCurrency and getSelectedCurrency', () => {
        setSelectedCurrency(''); // Should ignore
        expect(getSelectedCurrency()).toBe('USD');`
);

content = content.replace(
    "setCompositionFilterTickers(null);",
    `setCompositionFilterTickers(null);
        expect(getCompositionFilterTickers()).toEqual([]);

        setCompositionFilterTickers([]);`
);

fs.writeFileSync(path, content);
