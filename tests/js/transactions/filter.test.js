import {
    applyDateRangeFilter,
    applySecurityFilter,
    applyValueFilters,
    applyTextFilter,
} from '@js/transactions/table/filter.js';
import * as utils from '@js/transactions/utils.js';
import * as parser from '@js/transactions/table/parser.js';
import * as dateUtils from '@utils/date.js';

jest.mock('@js/transactions/utils.js');
jest.mock('@js/transactions/table/parser.js');
jest.mock('@utils/date.js');

describe('applyDateRangeFilter', () => {
    const transactions = [
        { tradeDate: '2023-01-01' },
        { tradeDate: '2023-01-15' },
        { tradeDate: '2023-01-31' },
    ];

    beforeEach(() => {
        jest.resetAllMocks();
        dateUtils.normalizeDateOnly.mockImplementation((date) => date);
    });

    it('returns all transactions when range is null', () => {
        expect(applyDateRangeFilter(transactions, null, null)).toEqual(transactions);
    });

    it('filters transactions after start date', () => {
        const start = new Date('2023-01-10').getTime();
        expect(applyDateRangeFilter(transactions, start, null)).toEqual([
            { tradeDate: '2023-01-15' },
            { tradeDate: '2023-01-31' },
        ]);
    });

    it('filters transactions before end date', () => {
        const end = new Date('2023-01-20').getTime();
        expect(applyDateRangeFilter(transactions, null, end)).toEqual([
            { tradeDate: '2023-01-01' },
            { tradeDate: '2023-01-15' },
        ]);
    });

    it('filters transactions within range', () => {
        const start = new Date('2023-01-10').getTime();
        const end = new Date('2023-01-20').getTime();
        expect(applyDateRangeFilter(transactions, start, end)).toEqual([
            { tradeDate: '2023-01-15' },
        ]);
    });

    it('handles invalid dates by excluding them', () => {
        const badTransactions = [...transactions, { tradeDate: 'invalid' }];
        const start = new Date('2023-01-10').getTime();
        expect(applyDateRangeFilter(badTransactions, start, null)).toEqual([
            { tradeDate: '2023-01-15' },
            { tradeDate: '2023-01-31' },
        ]);
    });

    it('handles falsy normalized dates by falling back to transaction tradeDate', () => {
        dateUtils.normalizeDateOnly.mockReturnValue(null);
        const start = new Date('2023-01-10').getTime();
        expect(applyDateRangeFilter(transactions, start, null)).toEqual([
            { tradeDate: '2023-01-15' },
            { tradeDate: '2023-01-31' },
        ]);
    });
});

describe('applySecurityFilter', () => {
    const transactions = [{ security: 'AAPL' }, { security: 'MSFT' }, { security: 'GOOGL' }];

    beforeEach(() => {
        jest.resetAllMocks();
        parser.normalizeTickerToken.mockImplementation((t) => (t ? t.toUpperCase() : null));
    });

    it('returns all transactions when no security or multiTickerSet is provided', () => {
        expect(applySecurityFilter(transactions, {}, null)).toEqual(transactions);
    });

    it('filters by single security via normalized token', () => {
        expect(applySecurityFilter(transactions, { security: 'aapl' }, null)).toEqual([
            { security: 'AAPL' },
        ]);
    });

    it('filters by single security via fallback uppercase', () => {
        parser.normalizeTickerToken.mockReturnValue(null);
        expect(applySecurityFilter(transactions, { security: 'aapl' }, null)).toEqual([
            { security: 'AAPL' },
        ]);
    });

    it('filters by multiTickerSet via normalized token', () => {
        const set = new Set(['AAPL', 'MSFT']);
        expect(applySecurityFilter(transactions, {}, set)).toEqual([
            { security: 'AAPL' },
            { security: 'MSFT' },
        ]);
    });

    it('filters by multiTickerSet via fallback uppercase', () => {
        parser.normalizeTickerToken.mockReturnValue(null);
        const set = new Set(['AAPL', 'MSFT']);
        expect(applySecurityFilter(transactions, {}, set)).toEqual([
            { security: 'AAPL' },
            { security: 'MSFT' },
        ]);
    });

    it('filters by both single security and multiTickerSet', () => {
        const set = new Set(['AAPL', 'MSFT']);
        expect(applySecurityFilter(transactions, { security: 'AAPL' }, set)).toEqual([
            { security: 'AAPL' },
            { security: 'MSFT' },
        ]);
    });
});

describe('applyValueFilters', () => {
    const transactions = [
        { orderType: 'Buy', netAmount: 100, tradeDate: '2023-01-01', security: 'AAPL' },
        { orderType: 'Sell', netAmount: -50, tradeDate: '2023-01-02', security: 'MSFT' },
        { orderType: 'Buy', netAmount: 200, tradeDate: '2023-01-03', security: 'GOOGL' },
    ];

    beforeEach(() => {
        jest.resetAllMocks();
        utils.convertValueToCurrency.mockImplementation((val) => val);
        parser.matchesAssetClass.mockImplementation((sec, cls) => {
            if (cls === 'etf') {
                return sec === 'VOO';
            }
            if (cls === 'stock') {
                return sec !== 'VOO';
            }
            return true;
        });
    });

    it('returns all transactions when no filters are applied', () => {
        expect(applyValueFilters(transactions, { min: null, max: null }, 'USD')).toEqual(
            transactions
        );
    });

    it('filters by min net amount absolute value', () => {
        expect(applyValueFilters(transactions, { min: 75, max: null }, 'USD')).toEqual([
            { orderType: 'Buy', netAmount: 100, tradeDate: '2023-01-01', security: 'AAPL' },
            { orderType: 'Buy', netAmount: 200, tradeDate: '2023-01-03', security: 'GOOGL' },
        ]);
    });

    it('filters by max net amount absolute value', () => {
        expect(applyValueFilters(transactions, { min: null, max: 150 }, 'USD')).toEqual([
            { orderType: 'Buy', netAmount: 100, tradeDate: '2023-01-01', security: 'AAPL' },
            { orderType: 'Sell', netAmount: -50, tradeDate: '2023-01-02', security: 'MSFT' },
        ]);
    });

    it('filters by min and max net amount absolute value', () => {
        expect(applyValueFilters(transactions, { min: 75, max: 150 }, 'USD')).toEqual([
            { orderType: 'Buy', netAmount: 100, tradeDate: '2023-01-01', security: 'AAPL' },
        ]);
    });

    it('filters by order type ignoring case', () => {
        expect(
            applyValueFilters(transactions, { min: null, max: null, type: 'buy' }, 'USD')
        ).toEqual([
            { orderType: 'Buy', netAmount: 100, tradeDate: '2023-01-01', security: 'AAPL' },
            { orderType: 'Buy', netAmount: 200, tradeDate: '2023-01-03', security: 'GOOGL' },
        ]);
    });

    it('filters by asset class', () => {
        const txs = [
            ...transactions,
            { orderType: 'Buy', netAmount: 300, tradeDate: '2023-01-04', security: 'VOO' },
        ];
        expect(applyValueFilters(txs, { min: null, max: null, assetClass: 'etf' }, 'USD')).toEqual([
            { orderType: 'Buy', netAmount: 300, tradeDate: '2023-01-04', security: 'VOO' },
        ]);
    });

    it('ignores invalid min max', () => {
        expect(applyValueFilters(transactions, { min: NaN, max: NaN }, 'USD')).toEqual(
            transactions
        );
    });
});

describe('applyTextFilter', () => {
    const transactions = [
        { security: 'AAPL', orderType: 'Buy', tradeDate: '2023-01-01' },
        { security: 'MSFT', orderType: 'Sell', tradeDate: '2023-01-02' },
        { security: 'GOOGL', orderType: 'Buy', tradeDate: '2023-01-03' },
    ];

    it('returns all transactions when term is empty', () => {
        expect(applyTextFilter(transactions, '')).toEqual(transactions);
        expect(applyTextFilter(transactions, null)).toEqual(transactions);
    });

    it('filters by security', () => {
        expect(applyTextFilter(transactions, 'aap')).toEqual([
            { security: 'AAPL', orderType: 'Buy', tradeDate: '2023-01-01' },
        ]);
    });

    it('filters by order type', () => {
        expect(applyTextFilter(transactions, 'sell')).toEqual([
            { security: 'MSFT', orderType: 'Sell', tradeDate: '2023-01-02' },
        ]);
    });

    it('filters by trade date', () => {
        expect(applyTextFilter(transactions, '01-03')).toEqual([
            { security: 'GOOGL', orderType: 'Buy', tradeDate: '2023-01-03' },
        ]);
    });
});
