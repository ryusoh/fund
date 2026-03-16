import {
    resolveQuarterRange,
    getDefaultYear,
    getEarliestDataYear,
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
});
