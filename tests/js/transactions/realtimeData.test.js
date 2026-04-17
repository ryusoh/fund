/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Regex to verify date format YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Module-level variable captured by the jest.mock factory below.
// Reassigned in beforeEach so each test gets a fresh jest.fn().
let mockFetchPortfolioData;

jest.mock('@services/dataService.js', () => ({
    fetchPortfolioData: (...args) => mockFetchPortfolioData(...args),
}));

jest.mock('@utils/logger.js', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() },
}));

jest.mock('@utils/date.js', () => ({
    getNyDate: jest.fn(() => new Date()),
    isTradingDay: jest.fn(() => true),
}));

describe('realtimeData', () => {
    let fetchRealTimeData;
    let mockFetch;

    beforeEach(() => {
        jest.resetModules();

        mockFetchPortfolioData = jest.fn();
        mockFetch = jest.fn();
        global.fetch = mockFetch;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    async function loadModule() {
        const mod = await import('../../../js/transactions/realtimeData.js');
        fetchRealTimeData = mod.fetchRealTimeData;
    }

    // fx is still fetched directly via fetch()
    function mockFx(rates = { USD: 1.0 }) {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ rates }),
        });
    }

    describe('fetchRealTimeData', () => {
        it('should calculate total balance from holdings and prices', async () => {
            mockFetchPortfolioData.mockResolvedValueOnce({
                holdingsDetails: {
                    VT: { shares: '100', average_price: '100' },
                    GOOG: { shares: '10', average_price: '150' },
                },
                prices: { VT: 110, GOOG: 180 },
            });
            mockFx({ USD: 1.0, CNY: 7.2 });

            await loadModule();
            const result = await fetchRealTimeData();

            expect(result).not.toBeNull();
            // VT: 100 * 110 = 11000, GOOG: 10 * 180 = 1800 → total = 12800
            expect(result.balance).toBe(12800);
            expect(result.date).toMatch(DATE_REGEX);
        });

        it('should calculate composition percentages', async () => {
            mockFetchPortfolioData.mockResolvedValueOnce({
                holdingsDetails: {
                    VT: { shares: '100', average_price: '100' },
                    GOOG: { shares: '10', average_price: '150' },
                },
                prices: { VT: 100, GOOG: 100 },
            });
            mockFx({ USD: 1.0 });

            await loadModule();
            const result = await fetchRealTimeData();

            expect(result.composition).toHaveLength(2);
            // VT: 10000 / 11000 = 90.909%, GOOG: 1000 / 11000 = 9.09%
            const vt = result.composition.find((c) => c.ticker === 'VT');
            const goog = result.composition.find((c) => c.ticker === 'GOOG');
            expect(vt.percent).toBeCloseTo(90.909, 1);
            expect(goog.percent).toBeCloseTo(9.09, 1);
        });

        it('should return null if fetchPortfolioData fails', async () => {
            mockFetchPortfolioData.mockRejectedValueOnce(new Error('Network error'));

            await loadModule();
            const result = await fetchRealTimeData();

            expect(result).toBeNull();
        });

        it('should handle fetchJSON throwing error due to !response.ok', async () => {
            mockFetchPortfolioData.mockResolvedValueOnce({
                holdingsDetails: { VT: { shares: '100', average_price: '100' } },
                prices: { VT: 100 },
            });
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            await loadModule();
            const result = await fetchRealTimeData();

            expect(result).toBeNull();
        });

        it('should handle weekend case logic correctly', async () => {
            const { isTradingDay } = require('@utils/date.js');
            isTradingDay.mockReturnValueOnce(false);

            mockFetchPortfolioData.mockResolvedValueOnce({
                holdingsDetails: {
                    VT: { shares: '100', average_price: '100' },
                },
                prices: { VT: 110 },
            });
            mockFx({ USD: 1.0 });

            await loadModule();
            const result = await fetchRealTimeData();

            expect(result).not.toBeNull();
            expect(result.balance).toBe(11000);
        });

        it('should handle prices or shares being 0', async () => {
            mockFetchPortfolioData.mockResolvedValueOnce({
                holdingsDetails: {
                    VT: { shares: '100', average_price: '100' },
                    GOOG: { shares: '0', average_price: '150' },
                    AAPL: { shares: '10', average_price: '100' },
                },
                prices: { VT: 0, GOOG: 100, AAPL: -10 },
            });
            mockFx({ USD: 1.0 });

            await loadModule();
            const result = await fetchRealTimeData();

            expect(result).not.toBeNull();
            expect(result.balance).toBe(0);
        });

        it('should return null if holdings data is missing', async () => {
            mockFetchPortfolioData.mockResolvedValueOnce({
                holdingsDetails: null,
                prices: { VT: 100 },
            });
            mockFx({});

            await loadModule();
            const result = await fetchRealTimeData();

            expect(result).toBeNull();
        });
    });
});
