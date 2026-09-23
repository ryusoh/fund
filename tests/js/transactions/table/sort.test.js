import { sortTransactions } from '../../../../js/transactions/table/sort.js';

describe('Table sort logic', () => {
    const transactions = [
        {
            transactionId: '1',
            security: 'MSFT',
            quantity: '5',
            price: 200,
            netAmount: -1000,
            tradeDate: '2023-01-05',
        },
        {
            transactionId: '2',
            security: 'AAPL',
            quantity: '10',
            price: 150,
            netAmount: -1500,
            tradeDate: '2023-01-01',
        },
        {
            transactionId: '3',
            security: 'AAPL',
            quantity: '2',
            price: 150,
            netAmount: -300,
            tradeDate: '2023-01-10',
        },
        {
            transactionId: '4',
            security: 'GOOGL',
            quantity: '1',
            price: 2500,
            netAmount: 2500,
            tradeDate: '2023-01-15',
        },
    ];

    // mock convertValueToCurrency, which is simple fallback when currency is the same (or we can just mock the module)

    beforeEach(() => {
        jest.resetModules();
    });

    it('sorts by security asc', () => {
        const list = [...transactions];
        sortTransactions(list, { column: 'security', order: 'asc' }, 'USD');
        expect(list.map((t) => t.transactionId)).toEqual(['3', '2', '4', '1']);
    });

    it('sorts by security desc', () => {
        const list = [...transactions];
        sortTransactions(list, { column: 'security', order: 'desc' }, 'USD');
        expect(list.map((t) => t.transactionId)).toEqual(['1', '4', '3', '2']);
    });

    it('sorts by quantity asc', () => {
        const list = [...transactions];
        sortTransactions(list, { column: 'quantity', order: 'asc' }, 'USD');
        expect(list.map((t) => t.transactionId)).toEqual(['4', '3', '1', '2']);
    });

    it('sorts by price asc (same price uses tradeDate desc as tiebreaker)', () => {
        const list = [...transactions];
        sortTransactions(list, { column: 'price', order: 'asc' }, 'USD');
        // AAPL is 150. tradeDate: '2023-01-10' (id 3) is > '2023-01-01' (id 2).
        // Because the tie breaker is compareValues(a.tradeDate, b.tradeDate, 'desc'),
        // '2023-01-10' is < '2023-01-01' when desc (returns -1), so id 3 comes before id 2.
        expect(list.map((t) => t.transactionId)).toEqual(['3', '2', '1', '4']);
    });

    it('sorts by netAmount desc (absolute value)', () => {
        const list = [...transactions];
        sortTransactions(list, { column: 'netAmount', order: 'desc' }, 'USD');
        // abs(netAmount): 2500(id 4), 1500(id 2), 1000(id 1), 300(id 3)
        expect(list.map((t) => t.transactionId)).toEqual(['4', '2', '1', '3']);
    });

    it('sorts by tradeDate asc (uses transactionId asc as tiebreaker)', () => {
        const list = [
            {
                transactionId: 'B',
                tradeDate: '2023-01-01',
                security: 'X',
                quantity: 1,
                price: 1,
                netAmount: 1,
            },
            {
                transactionId: 'A',
                tradeDate: '2023-01-01',
                security: 'Y',
                quantity: 1,
                price: 1,
                netAmount: 1,
            },
            {
                transactionId: 'C',
                tradeDate: '2023-01-02',
                security: 'Z',
                quantity: 1,
                price: 1,
                netAmount: 1,
            },
        ];
        sortTransactions(list, { column: 'tradeDate', order: 'asc' }, 'USD');
        expect(list.map((t) => t.transactionId)).toEqual(['A', 'B', 'C']);
    });

    it('sorts by tradeDate desc (uses transactionId desc as tiebreaker)', () => {
        const list = [
            {
                transactionId: 'A',
                tradeDate: '2023-01-01',
                security: 'X',
                quantity: 1,
                price: 1,
                netAmount: 1,
            },
            {
                transactionId: 'B',
                tradeDate: '2023-01-01',
                security: 'Y',
                quantity: 1,
                price: 1,
                netAmount: 1,
            },
            {
                transactionId: 'C',
                tradeDate: '2023-01-02',
                security: 'Z',
                quantity: 1,
                price: 1,
                netAmount: 1,
            },
        ];
        sortTransactions(list, { column: 'tradeDate', order: 'desc' }, 'USD');
        expect(list.map((t) => t.transactionId)).toEqual(['C', 'B', 'A']);
    });

    it('handles identical quantity values by using tradeDate desc', () => {
        const list = [
            {
                transactionId: '1',
                quantity: '5',
                tradeDate: '2023-01-01',
                security: 'X',
                price: 1,
                netAmount: 1,
            },
            {
                transactionId: '2',
                quantity: '5',
                tradeDate: '2023-01-10',
                security: 'Y',
                price: 1,
                netAmount: 1,
            },
        ];
        sortTransactions(list, { column: 'quantity', order: 'asc' }, 'USD');
        expect(list.map((t) => t.transactionId)).toEqual(['2', '1']);
    });

    it('handles identical netAmount values by using tradeDate desc', () => {
        const list = [
            {
                transactionId: '1',
                netAmount: -100,
                tradeDate: '2023-01-01',
                security: 'X',
                price: 1,
                quantity: 1,
            },
            {
                transactionId: '2',
                netAmount: 100,
                tradeDate: '2023-01-10',
                security: 'Y',
                price: 1,
                quantity: 1,
            },
        ];
        sortTransactions(list, { column: 'netAmount', order: 'asc' }, 'USD'); // abs(netAmount) are both 100
        expect(list.map((t) => t.transactionId)).toEqual(['2', '1']);
    });
});
