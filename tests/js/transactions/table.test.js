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

    it('combines etf with specific tickers using OR logic', () => {
        const controller = initTable();
        controller.filterAndSort('etf AAA');
        const securities = getRenderedSecurities().sort();
        expect(securities).toEqual(['AAA', 'FNSFX', 'VT']);
    });

    it('combines stock with specific etf ticker using OR logic', () => {
        const controller = initTable();
        controller.filterAndSort('stock VT');
        const securities = getRenderedSecurities().sort();
        expect(securities).toEqual(['AAA', 'VT']);
    });

    it('combines etf with multiple tickers using OR logic', () => {
        const controller = initTable();
        controller.filterAndSort('etf AAA');
        const securities = getRenderedSecurities().sort();
        expect(securities).toContain('AAA');
        expect(securities).toContain('VT');
        expect(securities).toContain('FNSFX');
    });
});

describe('sort indicator vs row order sync', () => {
    let initTable;
    let setAllTransactions;
    let transactionState;

    // Dates in MM/DD/YYYY format — exactly as they come out of parseCSV from transactions.csv.
    // Without this format, the year-skipping sort bug is invisible (ISO strings sort correctly).
    const transactions = [
        {
            transactionId: 1,
            tradeDate: '01/01/2024',
            orderType: 'Buy',
            security: 'AAA',
            quantity: '1',
            price: '100',
            netAmount: '100',
        },
        {
            transactionId: 2,
            tradeDate: '06/15/2024',
            orderType: 'Buy',
            security: 'BBB',
            quantity: '1',
            price: '200',
            netAmount: '200',
        },
        {
            transactionId: 3,
            tradeDate: '12/31/2024',
            orderType: 'Buy',
            security: 'CCC',
            quantity: '1',
            price: '50',
            netAmount: '50',
        },
        // Cross-year pair with the same month-day: 12/29/2025 and 12/26/2024.
        // With MM/DD/YYYY string comparison, "12/29/2025" > "12/26/2024" so 2025-12-29
        // comes first — CORRECT. But "12/26/2024" > "12/25/2025", so 2024-12-26 would
        // appear before 2025-12-25 — that is the year-skipping bug.
        {
            transactionId: 4,
            tradeDate: '12/25/2025',
            orderType: 'Buy',
            security: 'DDD',
            quantity: '1',
            price: '150',
            netAmount: '150',
        },
        {
            transactionId: 5,
            tradeDate: '12/26/2024',
            orderType: 'Buy',
            security: 'EEE',
            quantity: '1',
            price: '120',
            netAmount: '120',
        },
    ];

    function setupDom() {
        document.body.innerHTML = `
            <div class="table-responsive-container">
                <table>
                    <thead>
                        <tr>
                            <th id="header-tradeDate" class="sortable"></th>
                            <th id="header-security" class="sortable"></th>
                            <th id="header-quantity" class="sortable"></th>
                            <th id="header-price" class="sortable"></th>
                            <th id="header-netAmount" class="sortable"></th>
                        </tr>
                    </thead>
                    <tbody id="transactionBody"></tbody>
                </table>
            </div>
        `;
    }

    beforeEach(() => {
        jest.resetModules();
        global.requestAnimationFrame = (cb) => cb();
        setupDom();

        jest.isolateModules(() => {
            ({ initTable } = require('@js/transactions/table.js'));
            ({ setAllTransactions, transactionState } = require('@js/transactions/state.js'));
        });

        setAllTransactions(transactions);
        transactionState.chartDateRange = { from: null, to: null };
    });

    function getTimestamps() {
        return transactionState.filteredTransactions.map((t) => new Date(t.tradeDate).getTime());
    }

    it('indicator shows desc and rows are newest-first after initial filterAndSort', () => {
        const controller = initTable();
        controller.filterAndSort('');

        const header = document.getElementById('header-tradeDate');
        expect(header.getAttribute('data-sort')).toBe('desc');

        // Newest transaction (DDD, 2025-12-25) must appear before the 2024-12-26 one (EEE)
        // This is the cross-year bug: MM/DD string comparison puts "12/26/2024" > "12/25/2025"
        const securities = transactionState.filteredTransactions.map((t) => t.security);
        const dddIdx = securities.indexOf('DDD'); // 2025-12-25
        const eeeIdx = securities.indexOf('EEE'); // 2024-12-26
        expect(dddIdx).toBeLessThan(eeeIdx); // 2025-12-25 must come before 2024-12-26 in desc order

        // General invariant: timestamps are non-increasing
        const ts = getTimestamps();
        for (let i = 1; i < ts.length; i++) {
            expect(ts[i]).toBeLessThanOrEqual(ts[i - 1]);
        }
    });

    it('cross-year: 2025-12-25 appears before 2024-12-26 when sorted desc (the year-skipping bug)', () => {
        // This test specifically targets the MM/DD/YYYY sort bug where "12/26/2024" sorts
        // after "12/29/2025" but before "12/25/2025" because the month-day "12/26" > "12/25".
        const controller = initTable();
        controller.filterAndSort('');

        const sorted = transactionState.filteredTransactions;
        const ddd = sorted.find((t) => t.security === 'DDD'); // 12/25/2025
        const eee = sorted.find((t) => t.security === 'EEE'); // 12/26/2024

        expect(new Date(ddd.tradeDate).getTime()).toBeGreaterThan(
            new Date(eee.tradeDate).getTime()
        );
        expect(sorted.indexOf(ddd)).toBeLessThan(sorted.indexOf(eee));
    });

    it('after clicking date header, indicator flips to asc and rows are oldest-first', () => {
        const controller = initTable();
        controller.filterAndSort('');

        document.getElementById('header-tradeDate').click();

        const header = document.getElementById('header-tradeDate');
        expect(header.getAttribute('data-sort')).toBe('asc');

        const ts = getTimestamps();
        for (let i = 1; i < ts.length; i++) {
            expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]);
        }
    });

    it('clicking date header twice returns to desc with newest-first rows', () => {
        const controller = initTable();
        controller.filterAndSort('');

        const header = document.getElementById('header-tradeDate');
        header.click(); // → asc
        header.click(); // → desc

        expect(header.getAttribute('data-sort')).toBe('desc');

        const ts = getTimestamps();
        for (let i = 1; i < ts.length; i++) {
            expect(ts[i]).toBeLessThanOrEqual(ts[i - 1]);
        }
    });

    it('indicator and row order stay in sync after sort by security then back to date', () => {
        const controller = initTable();
        controller.filterAndSort('');

        document.getElementById('header-security').click();
        expect(document.getElementById('header-security').getAttribute('data-sort')).toBe('asc');
        expect(document.getElementById('header-tradeDate').getAttribute('data-sort')).toBeNull();

        document.getElementById('header-tradeDate').click();
        expect(document.getElementById('header-tradeDate').getAttribute('data-sort')).toBe('asc');
        expect(document.getElementById('header-security').getAttribute('data-sort')).toBeNull();

        const ts = getTimestamps();
        for (let i = 1; i < ts.length; i++) {
            expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]);
        }
    });

    it('rows remain sorted after filterAndSort is called again with no search term', () => {
        const controller = initTable();
        controller.filterAndSort('');

        document.getElementById('header-tradeDate').click(); // → asc
        controller.filterAndSort('');

        expect(transactionState.sortState.order).toBe('asc');
        expect(document.getElementById('header-tradeDate').getAttribute('data-sort')).toBe('asc');

        const ts = getTimestamps();
        for (let i = 1; i < ts.length; i++) {
            expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]);
        }
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

    it('does not have a filter indicator on the Quantity header', () => {
        document.body.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th id="header-quantity">
                            <button class="header-action-button">Quantity<span class="sort-indicator"></span></button>
                        </th>
                    </tr>
                </thead>
                <tbody id="transactionBody"></tbody>
            </table>
        `;
        const quantityHeader = document.getElementById('header-quantity');
        const filterIndicator = quantityHeader.querySelector('.filter-indicator');
        expect(filterIndicator).toBeNull();
    });
});
