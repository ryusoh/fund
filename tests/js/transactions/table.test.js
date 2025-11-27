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

describe('transaction date filtering visibility guard', () => {
    let initTable;
    let setAllTransactions;
    let transactionState;

    const sampleTransactions = [
        {
            transactionId: 1,
            tradeDate: '2024-01-04',
            orderType: 'Buy',
            security: 'AAA',
            quantity: '1',
            price: '50',
            netAmount: '50',
        },
        {
            transactionId: 2,
            tradeDate: '2025-03-10',
            orderType: 'Buy',
            security: 'BBB',
            quantity: '1',
            price: '100',
            netAmount: '100',
        },
    ];

    function setupTableDom(hidden = true) {
        document.body.innerHTML = `
            <div class="table-responsive-container${hidden ? ' is-hidden' : ''}">
                <table>
                    <tbody id="transactionBody"></tbody>
                </table>
            </div>
        `;
    }

    beforeEach(() => {
        jest.resetModules();
        global.requestAnimationFrame = (cb) => cb();

        jest.isolateModules(() => {
            ({ initTable } = require('@js/transactions/table.js'));
            ({ setAllTransactions, transactionState } = require('@js/transactions/state.js'));
        });

        setAllTransactions(sampleTransactions);
        transactionState.chartDateRange = { from: '2025-01-01', to: '2025-12-31' };
    });

    it('ignores chart date range when table is hidden', () => {
        setupTableDom(true);
        const controller = initTable();
        controller.filterAndSort('');

        const rows = document.querySelectorAll('#transactionBody tr');
        expect(rows).toHaveLength(sampleTransactions.length);
    });

    it('applies chart date range when table is visible', () => {
        setupTableDom(false);
        const controller = initTable();
        controller.filterAndSort('');

        const rows = Array.from(document.querySelectorAll('#transactionBody tr'));
        expect(rows).toHaveLength(1);
        const securityCell = rows[0].querySelectorAll('td')[2];
        expect(securityCell.textContent.trim()).toBe('BBB');
    });
});
