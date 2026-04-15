import { sortTransactions } from '@js/transactions/table/sort.js';
import * as utils from '@js/transactions/utils.js';

jest.mock('@js/transactions/utils.js');

describe('sortTransactions', () => {
    let transactions;

    beforeEach(() => {
        jest.resetAllMocks();
        utils.convertValueToCurrency.mockImplementation((val) => val);

        transactions = [
            {
                transactionId: '1',
                security: 'AAPL',
                quantity: '10',
                price: 150,
                netAmount: -1500,
                tradeDate: '2023-01-01',
            },
            {
                transactionId: '2',
                security: 'MSFT',
                quantity: '5',
                price: 250,
                netAmount: -1250,
                tradeDate: '2023-01-02',
            },
            {
                transactionId: '3',
                security: 'GOOGL',
                quantity: '20',
                price: 100,
                netAmount: -2000,
                tradeDate: '2023-01-03',
            },
            {
                transactionId: '4',
                security: 'AAPL',
                quantity: '15',
                price: 155,
                netAmount: -2325,
                tradeDate: '2023-01-04',
            },
            {
                transactionId: '5',
                security: 'TSLA',
                quantity: '10',
                price: 200,
                netAmount: -2000,
                tradeDate: '2023-01-03',
            },
        ];
    });

    it('sorts by security asc', () => {
        sortTransactions(transactions, { column: 'security', order: 'asc' }, 'USD');
        expect(transactions.map((t) => t.transactionId)).toEqual(['4', '1', '3', '2', '5']);
    });

    it('sorts by security desc', () => {
        sortTransactions(transactions, { column: 'security', order: 'desc' }, 'USD');
        expect(transactions.map((t) => t.transactionId)).toEqual(['5', '2', '3', '4', '1']);
    });

    it('sorts by quantity asc', () => {
        sortTransactions(transactions, { column: 'quantity', order: 'asc' }, 'USD');
        expect(transactions.map((t) => t.transactionId)).toEqual(['2', '5', '1', '4', '3']);
    });

    it('sorts by quantity desc', () => {
        sortTransactions(transactions, { column: 'quantity', order: 'desc' }, 'USD');
        expect(transactions.map((t) => t.transactionId)).toEqual(['3', '4', '5', '1', '2']);
    });

    it('sorts by price asc', () => {
        sortTransactions(transactions, { column: 'price', order: 'asc' }, 'USD');
        expect(transactions.map((t) => t.transactionId)).toEqual(['3', '1', '4', '5', '2']);
    });

    it('sorts by price desc', () => {
        sortTransactions(transactions, { column: 'price', order: 'desc' }, 'USD');
        expect(transactions.map((t) => t.transactionId)).toEqual(['2', '5', '4', '1', '3']);
    });

    it('sorts by netAmount (absolute) asc', () => {
        sortTransactions(transactions, { column: 'netAmount', order: 'asc' }, 'USD');
        // JS sort is stable in modern environments, so 3 and 5 will preserve relative order when ties are perfectly 0.
        // Let's assume order is 3, 5 for the tie
        expect(transactions.map((t) => t.transactionId)).toEqual(['2', '1', '3', '5', '4']);
    });

    it('sorts by netAmount desc', () => {
        sortTransactions(transactions, { column: 'netAmount', order: 'desc' }, 'USD');
        expect(transactions.map((t) => t.transactionId)).toEqual(['4', '3', '5', '1', '2']);
    });

    it('sorts by tradeDate asc', () => {
        sortTransactions(transactions, { column: 'tradeDate', order: 'asc' }, 'USD');
        // tradeDate tiebreaker goes to transactionId asc
        // 3 and 5 have the same trade date.
        // transactionId order asc means '3' < '5', so 3 comes first.
        expect(transactions.map((t) => t.transactionId)).toEqual(['1', '2', '3', '5', '4']);
    });

    it('sorts by tradeDate desc', () => {
        sortTransactions(transactions, { column: 'tradeDate', order: 'desc' }, 'USD');
        // tradeDate tiebreaker goes to transactionId desc (when tradeDate is order=desc, idOrder=desc)
        // 3 and 5 have same trade date. desc means '5' > '3' so 5 comes before 3.
        expect(transactions.map((t) => t.transactionId)).toEqual(['4', '5', '3', '2', '1']);
    });

    it('uses tradeDate as default column', () => {
        sortTransactions(transactions, { column: 'unknown', order: 'asc' }, 'USD');
        expect(transactions.map((t) => t.transactionId)).toEqual(['1', '2', '3', '5', '4']);
    });
});
