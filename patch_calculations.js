const fs = require('fs');

const path = 'tests/js/transactions/calculations.test.js';
let content = fs.readFileSync(path, 'utf8');

const newTests = `
    test('parseCSV handles quantity and price formatting gracefully', () => {
        const csvText = \`Trade Date,Order Type,Security,Quantity,Price
2021-01-01,Buy,AAPL,,
2021-02-01,Buy,AAPL,invalid,invalid\`;

        const result = parseCSV(csvText);
        expect(result).toHaveLength(2);
        expect(result[0].quantity).toBe('0');
        expect(result[0].price).toBe('0');
        expect(result[0].netAmount).toBe('0');

        expect(result[1].quantity).toBe('0');
        expect(result[1].price).toBe('0');
        expect(result[1].netAmount).toBe('0');
    });
`;

content = content.replace("    test('parseCSV parses simple CSV text', () => {", newTests + "\n    test('parseCSV parses simple CSV text', () => {");

fs.writeFileSync(path, content);
