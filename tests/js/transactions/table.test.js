import { jest } from '@jest/globals';

jest.mock('@js/transactions/layout.js', () => ({
    adjustMobilePanels: jest.fn(),
}));

describe('transactions table sorting', () => {
    let initTable;
    let setAllTransactions;
    let transactionState;

    beforeEach(() => {
        jest.resetModules();
        global.requestAnimationFrame = (cb) => cb();
        document.body.innerHTML = `
            <table>
                <tbody id="transactionBody"></tbody>
            </table>
        `;

        jest.isolateModules(() => {
            ({ initTable } = require('@js/transactions/table.js'));
            ({ setAllTransactions, transactionState } = require('@js/transactions/state.js'));
        });
    });

    it('sorts newest transactions first and prioritises higher totals within the same date', () => {
        expect(transactionState.sortState.order).toBe('desc');

        const sampleTransactions = [
            {
                transactionId: 1,
                tradeDate: '2025-01-04',
                orderType: 'Buy',
                security: 'CCC',
                quantity: '1',
                price: '50',
                netAmount: '50',
            },
            {
                transactionId: 2,
                tradeDate: '2025-01-05',
                orderType: 'Buy',
                security: 'AAA',
                quantity: '1',
                price: '100',
                netAmount: '100',
            },
            {
                transactionId: 3,
                tradeDate: '2025-01-05',
                orderType: 'Buy',
                security: 'BBB',
                quantity: '1',
                price: '200',
                netAmount: '200',
            },
        ];

        setAllTransactions(sampleTransactions);

        const controller = initTable();
        controller.filterAndSort('');

        const rows = Array.from(document.querySelectorAll('#transactionBody tr'));
        const securities = rows.map((row) => row.querySelectorAll('td')[2].textContent.trim());
        expect(securities).toEqual(['BBB', 'AAA', 'CCC']);
    });
});
