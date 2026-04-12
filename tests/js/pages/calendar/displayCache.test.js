jest.mock('@utils/formatting.js', () => ({
    formatNumber: jest.fn(),
}));

import {
    ensureEntryDisplay,
    precomputeDisplayCaches,
    computeEntryDisplay,
} from '@pages/calendar/displayCache.js';
import { formatNumber } from '@utils/formatting.js';

describe('calendar displayCache', () => {
    const currencySymbols = { USD: '$' };
    const rates = { USD: 1 };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('hides details for zero-change entries that are not the initial data point', () => {
        const entry = { dailyChange: 0, total: 1000 };
        const result = ensureEntryDisplay(entry, 'USD', rates, currencySymbols);
        expect(result.showDetails).toBe(false);
        expect(result.changeText).toBe('');
        expect(result.totalText).toBe('');
        expect(formatNumber).not.toHaveBeenCalled();
    });

    it('shows details for the first data point even when the change is zero', () => {
        formatNumber
            .mockImplementationOnce(() => 'Δ$0.00')
            .mockImplementationOnce(() => '$1,000.00');
        const entry = { dailyChange: 0, total: 1000, isInitialDataPoint: true };
        const result = ensureEntryDisplay(entry, 'USD', rates, currencySymbols);
        expect(result.showDetails).toBe(true);
        expect(result.changeText).toBe('Δ$0.00');
        expect(result.totalText).toBe('$1,000.00');
        expect(formatNumber).toHaveBeenCalledTimes(2);
        expect(formatNumber).toHaveBeenNthCalledWith(
            1,
            0,
            currencySymbols,
            true,
            'USD',
            rates,
            entry,
            'dailyChange'
        );
        expect(formatNumber).toHaveBeenNthCalledWith(
            2,
            1000,
            currencySymbols,
            false,
            'USD',
            rates,
            entry,
            'total'
        );
    });

    it('returns empty for null entry in ensureEntryDisplay', () => {
        expect(ensureEntryDisplay(null, 'USD', rates, currencySymbols)).toEqual({
            changeText: '',
            totalText: '',
            showDetails: false,
        });
    });

    it('returns empty for non-object entry in ensureEntryDisplay', () => {
        const result = ensureEntryDisplay('not object', 'USD', rates, currencySymbols);
        // ensureEntryDisplay returns object itself so we check if __displayCache is populated
        expect(result).toEqual({ changeText: '', totalText: '', showDetails: false });
    });

    it('uses existing cache if available', () => {
        const entry = {
            dailyChange: 100,
            total: 1000,
            __displayCache: { USD: { changeText: 'cached', totalText: 'cached' } },
        };
        const result = ensureEntryDisplay(entry, 'USD', rates, currencySymbols);
        expect(result.changeText).toBe('cached');
        expect(formatNumber).not.toHaveBeenCalled();
    });

    it('precomputes display caches for array', () => {
        formatNumber.mockReturnValue('fmt');
        const entries = [{ dailyChange: 100, total: 1000 }];
        precomputeDisplayCaches(entries, currencySymbols, rates);
        expect(entries[0].__displayCache['USD']).toBeDefined();
        expect(entries[0].__displayCache['USD'].changeText).toBe('fmt');
    });

    it('precomputes display caches for map', () => {
        formatNumber.mockReturnValue('fmt');
        const entries = new Map();
        entries.set('a', { dailyChange: 100, total: 1000 });
        precomputeDisplayCaches(entries, currencySymbols, rates);
        expect(entries.get('a').__displayCache['USD']).toBeDefined();
    });

    it('does nothing if entries is null in precompute', () => {
        expect(precomputeDisplayCaches(null, currencySymbols, rates)).toBeUndefined();
    });

    it('does nothing if currencySymbols has no keys', () => {
        const entries = [{ dailyChange: 100, total: 1000 }];
        precomputeDisplayCaches(entries, {}, rates);
        expect(entries[0].__displayCache).toBeUndefined();
    });

    it('does nothing for null entries in array', () => {
        const entries = [null];
        precomputeDisplayCaches(entries, currencySymbols, rates);
        expect(entries[0]).toBeNull();
    });

    it('handles infinite dailyChange in computeEntryDisplay', () => {
        const entry = { dailyChange: Infinity, total: 1000 };
        const result = ensureEntryDisplay(entry, 'USD', rates, currencySymbols);
        expect(result.showDetails).toBe(false);
    });

    it('handles non-object in precomputeDisplayCaches gracefully', () => {
        const entries = ['test'];
        precomputeDisplayCaches(entries, currencySymbols, rates);
        expect(entries[0]).toBe('test');
    });

    it('returns empty when currencySymbols is undefined', () => {
        const entries = [{ dailyChange: 100, total: 1000 }];
        precomputeDisplayCaches(entries, undefined, rates);
        expect(entries[0].__displayCache['USD']).toBeDefined();
    });

    it('works with entries that are not Map or Array in precomputeDisplayCaches', () => {
        const entries = 'a simple string as entries';
        // This won't throw, but it won't do anything because neither Map nor Array.
        expect(precomputeDisplayCaches(entries, currencySymbols, rates)).toBeUndefined();
    });

    it('returns empty for non-object entry directly passed to computeEntryDisplay', () => {
        expect(computeEntryDisplay(null, 'USD', rates, currencySymbols)).toEqual({
            changeText: '',
            totalText: '',
            showDetails: false,
        });
        expect(computeEntryDisplay('not object', 'USD', rates, currencySymbols)).toEqual({
            changeText: '',
            totalText: '',
            showDetails: false,
        });
    });
});
