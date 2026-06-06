import {
    resolveQuarterRange,
    getDefaultYear,
    getEarliestDataYear,
    parseDateRange,
    formatDateRange,
    parseSimplifiedDateRange,
} from '../../../../js/transactions/terminal/dateUtils.js';
import { transactionState } from '../../../../js/transactions/state.js';

describe('terminal dateUtils', () => {
    beforeEach(() => {
        // Reset transactionState
        transactionState.chartDateRange = null;
        transactionState.allTransactions = [];
        // We cannot easily reset the module-level lastContextYear in dateUtils.js
        // because it is not exported. However, we can control its behavior
        // through transactionState.
    });

    describe('resolveQuarterRange', () => {
        it('should return correct date range and update lastContextYear', () => {
            const year = 2023;
            const quarter = 2;
            const result = resolveQuarterRange(year, quarter, 'full');

            expect(result).toEqual({
                from: '2023-04-01',
                to: '2023-06-30',
            });

            // Verify lastContextYear was updated by calling getDefaultYear
            // Since chartDateRange is null and allTransactions is empty,
            // getDefaultYear would normally return current year as fallback,
            // but since resolveQuarterRange updated lastContextYear, it should return 2023.
            expect(getDefaultYear()).toBe(2023);
        });

        it('should handle different modes', () => {
            const year = 2024;
            const quarter = 1;

            const full = resolveQuarterRange(year, quarter, 'full');
            expect(full).toEqual({ from: '2024-01-01', to: '2024-03-31' });

            const start = resolveQuarterRange(year, quarter, 'start');
            expect(start).toEqual({ from: '2024-01-01', to: null });

            const end = resolveQuarterRange(year, quarter, 'end');
            expect(end).toEqual({ from: null, to: '2024-03-31' });
        });

        it('should not update lastContextYear if year is not finite', () => {
            // First set a known lastContextYear
            resolveQuarterRange(2021, 1);
            expect(getDefaultYear()).toBe(2021);

            // Call with non-finite year
            resolveQuarterRange(null, 1);

            // lastContextYear should still be 2021
            expect(getDefaultYear()).toBe(2021);
        });

        it('should use underlying computeQuarterRange correctly', () => {
            // Testing various quarters to ensure coverage of the logic
            expect(resolveQuarterRange(2023, 1)).toEqual({ from: '2023-01-01', to: '2023-03-31' });
            expect(resolveQuarterRange(2023, 2)).toEqual({ from: '2023-04-01', to: '2023-06-30' });
            expect(resolveQuarterRange(2023, 3)).toEqual({ from: '2023-07-01', to: '2023-09-30' });
            expect(resolveQuarterRange(2023, 4)).toEqual({ from: '2023-10-01', to: '2023-12-31' });
        });
    });

    describe('getEarliestDataYear', () => {
        it('should return current year if no transactions exist', () => {
            transactionState.allTransactions = [];
            const currentYear = new Date().getFullYear();
            expect(getEarliestDataYear()).toBe(currentYear);
        });

        it('should return the earliest year from transactions', () => {
            transactionState.allTransactions = [
                { date: '2022-05-01' },
                { tradeDate: '2020-01-01' },
                { date: '2021-12-31' },
            ];
            expect(getEarliestDataYear()).toBe(2020);
        });

        it('should handle transactions with only date or tradeDate', () => {
            transactionState.allTransactions = [
                { date: '2022-05-01' },
                { tradeDate: '2023-01-01' },
            ];
            expect(getEarliestDataYear()).toBe(2022);
        });
    });

    describe('parseDateRange', () => {
        beforeEach(() => {
            const currentYear = new Date().getFullYear();
            transactionState.allTransactions = [{ tradeDate: `${currentYear}-01-01` }];
        });

        it('should parse a single year', () => {
            const currentYear = new Date().getFullYear();
            const result = parseDateRange([currentYear.toString()]);
            expect(result).toEqual({ from: `${currentYear}-01-01`, to: `${currentYear}-12-31` });
        });

        it('should return nulls for invalid single year', () => {
            const result = parseDateRange(['invalid']);
            expect(result).toEqual({ from: null, to: null });
        });

        it('should parse a single quarter', () => {
            const currentYear = new Date().getFullYear();
            const result = parseDateRange([`${currentYear}q1`]);
            expect(result).toEqual({ from: `${currentYear}-01-01`, to: `${currentYear}-03-31` });
        });

        it('should parse from a year', () => {
            const currentYear = new Date().getFullYear();
            const result = parseDateRange(['from', currentYear.toString()]);
            expect(result).toEqual({ from: `${currentYear}-01-01`, to: null });
        });

        it('should parse from a quarter', () => {
            const currentYear = new Date().getFullYear();
            const result = parseDateRange(['from', `${currentYear}q2`]);
            expect(result).toEqual({ from: `${currentYear}-04-01`, to: null });
        });

        it('should parse range between two years', () => {
            const result = parseDateRange(['2020', 'to', '2022']);
            expect(result).toEqual({ from: '2020-01-01', to: '2022-12-31' });
        });

        it('should parse range between two quarters', () => {
            const result = parseDateRange(['2021q1', 'to', '2021q3']);
            expect(result).toEqual({ from: '2021-01-01', to: '2021-09-30' });
        });

        it('should parse range between year and quarter', () => {
            const result = parseDateRange(['2021', 'to', '2022q1']);
            expect(result).toEqual({ from: '2021-01-01', to: '2022-03-31' });
        });

        it('should ignore invalid to ranges', () => {
            const result = parseDateRange(['2022', 'to', '2020']);
            expect(result).toEqual({ from: null, to: null });
        });
    });

    describe('formatDateRange', () => {
        it('should format full year range correctly', () => {
            expect(formatDateRange({ from: '2023-01-01', to: '2023-12-31' })).toBe('2023');
        });

        it('should format quarter range correctly', () => {
            expect(formatDateRange({ from: '2023-01-01', to: '2023-03-31' })).toBe('Q1 2023');
            expect(formatDateRange({ from: '2023-04-01', to: '2023-06-30' })).toBe('Q2 2023');
            expect(formatDateRange({ from: '2023-07-01', to: '2023-09-30' })).toBe('Q3 2023');
            expect(formatDateRange({ from: '2023-10-01', to: '2023-12-31' })).toBe('Q4 2023');
        });

        it('should return range as string for arbitrary dates', () => {
            expect(formatDateRange({ from: '2023-02-01', to: '2023-05-15' })).toBe(
                '2023-02-01 to 2023-05-15'
            );
        });

        it('should format open-ended start range', () => {
            expect(formatDateRange({ from: '2023-01-01', to: null })).toBe('from 2023-01-01');
        });

        it('should format open-ended end range', () => {
            expect(formatDateRange({ from: null, to: '2023-12-31' })).toBe('to 2023-12-31');
        });

        it('should return all time if no dates are provided', () => {
            expect(formatDateRange({ from: null, to: null })).toBe('all time');
        });
    });

    describe('parseSimplifiedDateRange', () => {
        beforeEach(() => {
            const currentYear = new Date().getFullYear();
            transactionState.allTransactions = [{ tradeDate: `${currentYear}-01-01` }];
        });

        it('should parse single quarter token', () => {
            const currentYear = new Date().getFullYear();
            const result = parseSimplifiedDateRange(`${currentYear}q1`);
            expect(result).toEqual({ from: `${currentYear}-01-01`, to: `${currentYear}-03-31` });
        });

        it('should parse single year token', () => {
            const currentYear = new Date().getFullYear();
            const result = parseSimplifiedDateRange(currentYear.toString());
            expect(result).toEqual({ from: `${currentYear}-01-01`, to: `${currentYear}-12-31` });
        });

        it('should parse from year', () => {
            const currentYear = new Date().getFullYear();
            const result = parseSimplifiedDateRange(`from:${currentYear}`);
            expect(result).toEqual({ from: `${currentYear}-01-01`, to: null });
        });

        it('should parse f year alias', () => {
            const currentYear = new Date().getFullYear();
            const result = parseSimplifiedDateRange(`f:${currentYear}`);
            expect(result).toEqual({ from: `${currentYear}-01-01`, to: null });
        });

        it('should parse from quarter', () => {
            const currentYear = new Date().getFullYear();
            const result = parseSimplifiedDateRange(`from:${currentYear}q1`);
            expect(result).toEqual({ from: `${currentYear}-01-01`, to: null });
        });

        it('should parse to year', () => {
            const currentYear = new Date().getFullYear();
            const result = parseSimplifiedDateRange(`to:${currentYear}`);
            expect(result).toEqual({ from: null, to: `${currentYear}-12-31` });
        });

        it('should parse to quarter', () => {
            const currentYear = new Date().getFullYear();
            const result = parseSimplifiedDateRange(`to:${currentYear}q3`);
            expect(result).toEqual({ from: null, to: `${currentYear}-09-30` });
        });

        it('should parse range between two years', () => {
            const result = parseSimplifiedDateRange('2020:2022');
            expect(result).toEqual({ from: '2020-01-01', to: '2022-12-31' });
        });

        it('should parse range between two quarters', () => {
            const result = parseSimplifiedDateRange('2021q1:2021q4');
            expect(result).toEqual({ from: '2021-01-01', to: '2021-12-31' });
        });

        it('should ignore invalid year range order', () => {
            const result = parseSimplifiedDateRange('2022:2020');
            expect(result).toEqual({ from: null, to: null });
        });

        it('should ignore completely invalid strings', () => {
            const result = parseSimplifiedDateRange('invalid:format');
            expect(result).toEqual({ from: null, to: null });
        });
    });
});
