/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Helper to get today's date in YYYY-MM-DD format (matching realtimeData.js logic)
function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

describe('realtimeData', () => {
    let fetchRealTimeData;
    let mockFetch;

    beforeEach(() => {
        jest.resetModules();

        // Mock fetch
        mockFetch = jest.fn();
        global.fetch = mockFetch;

        // Mock logger
        jest.unstable_mockModule('@utils/logger.js', () => ({
            logger: {
                warn: jest.fn(),
                error: jest.fn(),
                log: jest.fn(),
            },
        }));

        // Mock date utils - use real date to match production behavior
        jest.unstable_mockModule('@utils/date.js', () => ({
            getNyDate: jest.fn(() => new Date()),
            isTradingDay: jest.fn(() => true),
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    async function loadModule() {
        const mod = await import('../../../js/transactions/realtimeData.js');
        fetchRealTimeData = mod.fetchRealTimeData;
    }

    describe('fetchRealTimeData', () => {
        it('should calculate total balance from holdings and prices', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            VT: { shares: '100', average_price: '100' },
                            GOOG: { shares: '10', average_price: '150' },
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            VT: 110, // Current price
                            GOOG: 180, // Current price
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ rates: { USD: 1.0, CNY: 7.2 } }),
                });

            await loadModule();
            const result = await fetchRealTimeData();

            expect(result).not.toBeNull();
            // VT: 100 shares * 110 = 11000
            // GOOG: 10 shares * 180 = 1800
            // Total = 12800
            expect(result.balance).toBe(12800);
            expect(result.date).toBe(getTodayDateString());
        });

        it('should calculate composition percentages', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            VT: { shares: '100', average_price: '100' },
                            GOOG: { shares: '10', average_price: '150' },
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            VT: 100, // 100 * 100 = 10000
                            GOOG: 100, // 10 * 100 = 1000
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ rates: { USD: 1.0 } }),
                });

            await loadModule();
            const result = await fetchRealTimeData();

            expect(result.composition).toHaveLength(2);
            // VT: 10000 / 11000 = 90.909%
            // GOOG: 1000 / 11000 = 9.090%
            const vt = result.composition.find((c) => c.ticker === 'VT');
            const goog = result.composition.find((c) => c.ticker === 'GOOG');
            expect(vt.percent).toBeCloseTo(90.909, 1);
            expect(goog.percent).toBeCloseTo(9.09, 1);
        });

        it('should return null if fetch fails', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            await loadModule();
            const result = await fetchRealTimeData();

            expect(result).toBeNull();
        });

        it('should return null if holdings data is missing', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ VT: 100 }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ rates: {} }),
                });

            await loadModule();
            const result = await fetchRealTimeData();

            expect(result).toBeNull();
        });
    });
});
