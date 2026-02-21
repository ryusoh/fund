import { getYieldSnapshotLine } from '@js/transactions/terminal/snapshots.js';
import { transactionState } from '@js/transactions/state.js';
import { loadYieldData } from '@js/transactions/chart/renderers/yield.js';

jest.mock('@js/transactions/chart/renderers/yield.js', () => ({
    loadYieldData: jest.fn(),
}));

jest.mock('@js/transactions/chart/helpers.js', () => ({
    parseLocalDate: jest.fn((dateStr) => new Date(dateStr)),
}));

jest.mock('@js/transactions/utils.js', () => ({
    formatCurrency: jest.fn((val, { currency }) => `${val} ${currency} formatted`),
    convertValueToCurrency: jest.fn((val, date, currency) => {
        if (currency === 'EUR') {
            return val * 2;
        }
        return val;
    }),
}));

describe('snapshots.js', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        transactionState.chartDateRange = { from: null, to: null };
        transactionState.selectedCurrency = 'USD';
    });

    describe('getYieldSnapshotLine', () => {
        const EXPECTED_NOTE =
            '\nNote: Early period yields may appear inflated due to the smaller portfolio base and TTM dividend proxy.';

        it('returns proper text with USD currency', async () => {
            loadYieldData.mockResolvedValue([
                { date: '2024-01-01', forward_yield: 2.5, ttm_income: 1000 },
                { date: '2024-02-01', forward_yield: 3.0, ttm_income: 1500 },
            ]);

            const result = await getYieldSnapshotLine();
            expect(result).toBe(
                'Forward Yield: 3.00% (Range: 2.50% - 3.00%)\nTTM Dividend Income: 1500 USD formatted' +
                    EXPECTED_NOTE
            );
        });

        it('returns proper text with converted EUR currency', async () => {
            transactionState.selectedCurrency = 'EUR';

            loadYieldData.mockResolvedValue([
                { date: '2024-01-01', forward_yield: 2.5, ttm_income: 1000 },
                { date: '2024-02-01', forward_yield: 3.0, ttm_income: 1500 },
            ]);

            const result = await getYieldSnapshotLine();
            // 1500 * 2 = 3000 because of the mock converter
            expect(result).toBe(
                'Forward Yield: 3.00% (Range: 2.50% - 3.00%)\nTTM Dividend Income: 3000 EUR formatted' +
                    EXPECTED_NOTE
            );
        });

        it('filters data by date range', async () => {
            transactionState.chartDateRange = { from: '2024-02-01', to: '2024-03-01' };

            loadYieldData.mockResolvedValue([
                { date: '2024-01-01', forward_yield: 2.5, ttm_income: 1000 },
                { date: '2024-02-15', forward_yield: 3.0, ttm_income: 1500 },
                { date: '2024-04-01', forward_yield: 4.0, ttm_income: 2000 },
            ]);

            const result = await getYieldSnapshotLine();
            // Only the second item is in range
            expect(result).toBe(
                'Forward Yield: 3.00% (Range: 3.00% - 3.00%)\nTTM Dividend Income: 1500 USD formatted' +
                    EXPECTED_NOTE
            );
        });

        it('returns text when no data in range', async () => {
            transactionState.chartDateRange = { from: '2025-01-01', to: '2025-02-01' };
            loadYieldData.mockResolvedValue([
                { date: '2024-01-01', forward_yield: 2.5, ttm_income: 1000 },
            ]);

            const result = await getYieldSnapshotLine();
            expect(result).toBe('No dividend data in range');
        });
    });
});
