import {
    applyDateRangeFilter,
    applySecurityFilter,
    applyValueFilters,
    applyTextFilter,
} from '../../../../js/transactions/table/filter.js';

describe('Table filter logic', () => {
    describe('applyDateRangeFilter', () => {
        const transactions = [
            { id: 1, tradeDate: '2023-01-01' },
            { id: 2, tradeDate: '2023-06-15' },
            { id: 3, tradeDate: '2023-12-31' },
            { id: 4, tradeDate: 'invalid-date' },
        ];

        it('returns all transactions if rangeStart and rangeEnd are null', () => {
            expect(applyDateRangeFilter(transactions, null, null)).toEqual(transactions);
        });

        it('filters out transactions before rangeStart', () => {
            const start = Date.parse('2023-06-01');
            const filtered = applyDateRangeFilter(transactions, start, null);
            expect(filtered.map((t) => t.id)).toEqual([2, 3]);
        });

        it('filters out transactions after rangeEnd', () => {
            const end = Date.parse('2023-06-30');
            const filtered = applyDateRangeFilter(transactions, null, end);
            expect(filtered.map((t) => t.id)).toEqual([1, 2]);
        });

        it('filters within a date range', () => {
            const start = Date.parse('2023-06-01');
            const end = Date.parse('2023-06-30');
            const filtered = applyDateRangeFilter(transactions, start, end);
            expect(filtered.map((t) => t.id)).toEqual([2]);
        });

        it('filters out transactions with invalid dates', () => {
            const start = Date.parse('2022-01-01');
            const filtered = applyDateRangeFilter(transactions, start, null);
            expect(filtered.map((t) => t.id)).toEqual([1, 2, 3]);
        });
    });

    describe('applySecurityFilter', () => {
        const transactions = [
            { id: 1, security: 'AAPL' },
            { id: 2, security: 'MSFT' },
            { id: 3, security: 'GOOGL' },
        ];

        it('returns all transactions if no upcaseSecurity and multiTickerSet is null', () => {
            const commands = {};
            expect(applySecurityFilter(transactions, commands, null)).toEqual(transactions);
        });

        it('returns all transactions if commands is missing security and multiTickerSet is null', () => {
            const commands = { type: 'buy' };
            expect(applySecurityFilter(transactions, commands, null)).toEqual(transactions);
        });

        it('filters by single security', () => {
            const commands = { security: 'AAPL' };
            const filtered = applySecurityFilter(transactions, commands, null);
            expect(filtered.map((t) => t.id)).toEqual([1]);
        });

        it('normalizes single security input (lowercase)', () => {
            const commands = { security: 'msft' };
            const filtered = applySecurityFilter(transactions, commands, null);
            expect(filtered.map((t) => t.id)).toEqual([2]);
        });

        it('filters by multiTickerSet', () => {
            const commands = {};
            const multiTickerSet = new Set(['AAPL', 'GOOGL']);
            const filtered = applySecurityFilter(transactions, commands, multiTickerSet);
            expect(filtered.map((t) => t.id)).toEqual([1, 3]);
        });

        it('filters by single security AND multiTickerSet', () => {
            const commands = { security: 'MSFT' };
            const multiTickerSet = new Set(['AAPL']);
            const filtered = applySecurityFilter(transactions, commands, multiTickerSet);
            expect(filtered.map((t) => t.id)).toEqual([1, 2]);
        });

        it('returns empty if no match', () => {
            const commands = { security: 'TSLA' };
            const filtered = applySecurityFilter(transactions, commands, null);
            expect(filtered).toEqual([]);
        });

        it('handles empty security correctly in applySecurityFilter', () => {
            const transactions = [
                { id: 1, security: 'AAPL' },
                { id: 2, security: '!!!' },
            ];
            const commands = { security: 'AAPL' };
            const filtered = applySecurityFilter(transactions, commands, null);
            expect(filtered.map((t) => t.id)).toEqual([1]);
        });

        it('falls back to uppercase if normalizeTickerToken returns null in applySecurityFilter for command', () => {
            const transactions = [{ id: 1, security: '!!!' }];
            const commands = { security: '!!!' };
            const filtered = applySecurityFilter(transactions, commands, null);
            expect(filtered.map((t) => t.id)).toEqual([1]);
        });
    });

    describe('applyTextFilter', () => {
        const transactions = [
            { id: 1, security: 'AAPL', orderType: 'Buy', tradeDate: '2023-01-01' },
            { id: 2, security: 'MSFT', orderType: 'Sell', tradeDate: '2023-06-15' },
            { id: 3, security: 'GOOGL', orderType: 'Dividend', tradeDate: '2023-12-31' },
        ];

        it('returns all transactions if term is falsy', () => {
            expect(applyTextFilter(transactions, '')).toEqual(transactions);
            expect(applyTextFilter(transactions, null)).toEqual(transactions);
        });

        it('filters by security name (case-insensitive)', () => {
            expect(applyTextFilter(transactions, 'aap').map((t) => t.id)).toEqual([1]);
            expect(applyTextFilter(transactions, 'msft').map((t) => t.id)).toEqual([2]);
        });

        it('filters by order type (case-insensitive)', () => {
            expect(applyTextFilter(transactions, 'buy').map((t) => t.id)).toEqual([1]);
            expect(applyTextFilter(transactions, 'divi').map((t) => t.id)).toEqual([3]);
        });

        it('filters by trade date', () => {
            expect(applyTextFilter(transactions, '2023-06').map((t) => t.id)).toEqual([2]);
        });

        it('returns empty if no match', () => {
            expect(applyTextFilter(transactions, 'tesla')).toEqual([]);
        });
    });

    describe('applyValueFilters', () => {
        const transactions = [
            { id: 1, orderType: 'Buy', netAmount: 100, tradeDate: '2023-01-01', security: 'AAPL' },
            { id: 2, orderType: 'Sell', netAmount: -50, tradeDate: '2023-06-15', security: 'MSFT' },
            {
                id: 3,
                orderType: 'Dividend',
                netAmount: 200,
                tradeDate: '2023-12-31',
                security: 'VTI',
            },
        ];

        it('returns all if no commands', () => {
            const commands = { type: null, min: null, max: null, assetClass: null };
            expect(applyValueFilters(transactions, commands, 'USD')).toEqual(transactions);
        });

        it('filters by order type', () => {
            const commands = { type: 'buy', min: null, max: null, assetClass: null };
            const filtered = applyValueFilters(transactions, commands, 'USD');
            expect(filtered.map((t) => t.id)).toEqual([1]);
        });

        it('filters by min value (absolute)', () => {
            const commands = { type: null, min: 100, max: null, assetClass: null };
            const filtered = applyValueFilters(transactions, commands, 'USD');
            expect(filtered.map((t) => t.id)).toEqual([1, 3]);
        });

        it('filters by max value (absolute)', () => {
            const commands = { type: null, min: null, max: 100, assetClass: null };
            const filtered = applyValueFilters(transactions, commands, 'USD');
            expect(filtered.map((t) => t.id)).toEqual([1, 2]);
        });

        it('filters by asset class (stock)', () => {
            const commands = { type: null, min: null, max: null, assetClass: 'stock' };
            const filtered = applyValueFilters(transactions, commands, 'USD');
            expect(filtered.map((t) => t.id)).toEqual([1, 2]);
        });

        it('filters by asset class (etf)', () => {
            const commands = { type: null, min: null, max: null, assetClass: 'etf' };
            const filtered = applyValueFilters(transactions, commands, 'USD');
            expect(filtered.map((t) => t.id)).toEqual([3]);
        });
    });
});
