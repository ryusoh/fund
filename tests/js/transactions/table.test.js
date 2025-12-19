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

    it('shows running totals that reflect each transaction net amount', () => {
        const sampleTransactions = [
            {
                transactionId: 1,
                tradeDate: '2024-01-01',
                orderType: 'Buy',
                security: 'AAA',
                quantity: '1',
                price: '100',
                netAmount: '100',
            },
            {
                transactionId: 2,
                tradeDate: '2024-01-02',
                orderType: 'Buy',
                security: 'BBB',
                quantity: '1',
                price: '200',
                netAmount: '200',
            },
            {
                transactionId: 3,
                tradeDate: '2024-01-03',
                orderType: 'Sell',
                security: 'CCC',
                quantity: '1',
                price: '50',
                netAmount: '-50',
            },
        ];

        setAllTransactions(sampleTransactions);

        const controller = initTable();
        controller.filterAndSort('');

        const totals = Array.from(document.querySelectorAll('#transactionBody tr')).map((row) =>
            row.querySelectorAll('td')[6].textContent.trim()
        );
        expect(totals).toEqual(['$250.00', '$300.00', '$100.00']);
    });

    it('keeps same-day sells ordered by recency so totals match their net amounts', () => {
        const sampleTransactions = [
            {
                transactionId: 10,
                tradeDate: '2024-01-02',
                orderType: 'Sell',
                security: 'AAA',
                quantity: '1',
                price: '100',
                netAmount: '-100',
            },
            {
                transactionId: 11,
                tradeDate: '2024-01-02',
                orderType: 'Sell',
                security: 'BBB',
                quantity: '1',
                price: '200',
                netAmount: '-200',
            },
        ];

        setAllTransactions(sampleTransactions);

        const controller = initTable();
        controller.filterAndSort('');

        const parseCurrencyText = (value) => Number(value.replace(/[^0-9.-]/g, ''));
        const rows = Array.from(document.querySelectorAll('#transactionBody tr'));
        const securities = rows.map((row) => row.querySelectorAll('td')[2].textContent.trim());
        expect(securities).toEqual(['BBB', 'AAA']);

        const totals = rows.map((row) =>
            parseCurrencyText(row.querySelectorAll('td')[6].textContent.trim())
        );
        const netValues = rows.map((row) =>
            parseCurrencyText(row.querySelectorAll('td')[5].textContent.trim())
        );

        expect(totals[0]).toBeCloseTo(-300, 5);
        expect(totals[1]).toBeCloseTo(-100, 5);
        expect(netValues[0]).toBeCloseTo(-200, 5);
        expect(totals[0] - totals[1]).toBeCloseTo(netValues[0], 5);
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

describe('composition ticker filters derived from table search', () => {
    let initTable;
    let setAllTransactions;
    let transactionState;

    beforeEach(() => {
        jest.resetModules();
        global.requestAnimationFrame = (cb) => cb();
        document.body.innerHTML = `
            <div class="table-responsive-container">
                <table>
                    <tbody id="transactionBody"></tbody>
                </table>
            </div>
        `;

        jest.isolateModules(() => {
            ({ initTable } = require('@js/transactions/table.js'));
            ({ setAllTransactions, transactionState } = require('@js/transactions/state.js'));
        });

        setAllTransactions([
            {
                transactionId: 1,
                tradeDate: '2024-01-04',
                orderType: 'Buy',
                security: 'AAA',
                quantity: '1',
                price: '50',
                netAmount: '50',
            },
        ]);
    });

    it('captures plain-text ticker filters', () => {
        const controller = initTable();
        controller.filterAndSort('anet goog');
        expect(transactionState.compositionFilterTickers).toEqual(['ANET', 'GOOG']);
    });

    it('captures explicit security filters', () => {
        const controller = initTable();
        controller.filterAndSort('security:brk-b');
        expect(transactionState.compositionFilterTickers).toEqual(['BRKB']);
    });

    it('maps BRK aliases to BRKB', () => {
        const controller = initTable();
        controller.filterAndSort('brk');
        expect(transactionState.compositionFilterTickers).toEqual(['BRKB']);
        controller.filterAndSort('brk.b');
        expect(transactionState.compositionFilterTickers).toEqual(['BRKB']);
    });

    it('clears ticker filters when search empties', () => {
        const controller = initTable();
        controller.filterAndSort('anet');
        expect(transactionState.compositionFilterTickers).toEqual(['ANET']);
        controller.filterAndSort('');
        expect(transactionState.compositionFilterTickers).toEqual([]);
    });
});

describe('asset class filters', () => {
    let initTable;
    let setAllTransactions;
    let transactionState;

    const sampleTransactions = [
        {
            transactionId: 1,
            tradeDate: '2024-01-04',
            orderType: 'Buy',
            security: 'VT',
            quantity: '1',
            price: '100',
            netAmount: '100',
        },
        {
            transactionId: 2,
            tradeDate: '2024-01-05',
            orderType: 'Buy',
            security: 'AAA',
            quantity: '1',
            price: '50',
            netAmount: '50',
        },
        {
            transactionId: 3,
            tradeDate: '2024-01-06',
            orderType: 'Buy',
            security: 'FNSFX',
            quantity: '10',
            price: '12',
            netAmount: '120',
        },
    ];

    beforeEach(() => {
        jest.resetModules();
        global.requestAnimationFrame = (cb) => cb();
        document.body.innerHTML = `
            <div class="table-responsive-container">
                <table>
                    <tbody id="transactionBody"></tbody>
                </table>
            </div>
        `;

        jest.isolateModules(() => {
            ({ initTable } = require('@js/transactions/table.js'));
            ({ setAllTransactions, transactionState } = require('@js/transactions/state.js'));
        });

        setAllTransactions(sampleTransactions);
        transactionState.chartDateRange = { from: null, to: null };
    });

    function getRenderedSecurities() {
        return Array.from(document.querySelectorAll('#transactionBody tr')).map((row) =>
            row.querySelectorAll('td')[2].textContent.trim()
        );
    }

    it('filters ETFs when using bare etf command', () => {
        const controller = initTable();
        controller.filterAndSort('etf');
        expect(getRenderedSecurities().sort()).toEqual(['FNSFX', 'VT']);
        expect(transactionState.compositionAssetClassFilter).toBe('etf');
    });

    it('filters stocks when using bare stock command', () => {
        const controller = initTable();
        controller.filterAndSort('stock');
        expect(getRenderedSecurities()).toEqual(['AAA']);
        expect(transactionState.compositionAssetClassFilter).toBe('stock');
    });

    it('supports explicit class:etf syntax', () => {
        const controller = initTable();
        controller.filterAndSort('class:etf');
        expect(getRenderedSecurities().sort()).toEqual(['FNSFX', 'VT']);
        expect(transactionState.compositionAssetClassFilter).toBe('etf');
    });
});

describe('ticker alias filtering', () => {
    let initTable;
    let setAllTransactions;
    let transactionState;

    beforeEach(() => {
        jest.resetModules();
        global.requestAnimationFrame = (cb) => cb();
        document.body.innerHTML = `
            <div class="table-responsive-container">
                <table>
                    <tbody id="transactionBody"></tbody>
                </table>
            </div>
        `;

        jest.isolateModules(() => {
            ({ initTable } = require('@js/transactions/table.js'));
            ({ setAllTransactions, transactionState } = require('@js/transactions/state.js'));
        });
    });

    it('matches BRK-B transactions when filtering by "brk"', () => {
        const brkTransaction = {
            transactionId: 1,
            tradeDate: '2024-01-04',
            orderType: 'Buy',
            security: 'BRK-B',
            quantity: '10',
            price: '300',
            netAmount: '3000',
        };
        const otherTransaction = {
            transactionId: 2,
            tradeDate: '2024-01-05',
            orderType: 'Buy',
            security: 'AAPL',
            quantity: '1',
            price: '150',
            netAmount: '150',
        };

        setAllTransactions([brkTransaction, otherTransaction]);

        const controller = initTable();
        controller.filterAndSort('brk');

        expect(transactionState.filteredTransactions).toHaveLength(1);
        expect(transactionState.filteredTransactions[0].security).toBe('BRK-B');
    });
});
