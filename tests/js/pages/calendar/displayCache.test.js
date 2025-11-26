jest.mock('@utils/formatting.js', () => ({
    formatNumber: jest.fn(),
}));

import { ensureEntryDisplay } from '@pages/calendar/displayCache.js';
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
});
