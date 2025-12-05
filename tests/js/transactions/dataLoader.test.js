/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Helper to get today's date in YYYY-MM-DD format
function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

describe('dataLoader real-time integration', () => {
    let loadPortfolioSeries;
    let loadCompositionSnapshotData;
    let mockFetch;

    beforeEach(() => {
        jest.resetModules();

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

        // Mock date utils - use real date
        jest.unstable_mockModule('@utils/date.js', () => ({
            getNyDate: jest.fn(() => new Date()),
            isTradingDay: jest.fn(() => true),
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    async function loadModule() {
        const mod = await import('../../../js/transactions/dataLoader.js');
        loadPortfolioSeries = mod.loadPortfolioSeries;
        loadCompositionSnapshotData = mod.loadCompositionSnapshotData;
    }

    function createMockResponse(data, ok = true) {
        return {
            ok,
            json: () => Promise.resolve(data),
        };
    }

    describe('loadPortfolioSeries with real-time data', () => {
        it('should append real-time balance to historical series', async () => {
            const today = getTodayDateString();
            // Mock responses in order:
            // 1. balance_series.json (historical)
            // 2. holdings_details.json (real-time)
            // 3. fund_data.json (real-time)
            // 4. fx_data.json (real-time)
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        USD: [
                            { date: '2024-12-03', value: 10000 },
                            { date: '2024-12-04', value: 10500 },
                        ],
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: { shares: '100', average_price: '100' },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: 110, // Current price
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        rates: { USD: 1.0, CNY: 7.2 },
                    })
                );

            await loadModule();
            const result = await loadPortfolioSeries();

            // Should have 3 points: 2 historical + 1 real-time
            expect(result.USD).toHaveLength(3);
            expect(result.USD[2].date).toBe(today);
            expect(result.USD[2].value).toBe(11000); // 100 * 110
        });

        it('should update existing date if real-time date matches last historical', async () => {
            const today = getTodayDateString();
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        USD: [
                            { date: '2024-12-04', value: 10000 },
                            { date: today, value: 10500 }, // Same as today
                        ],
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: { shares: '100', average_price: '100' },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: 110,
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        rates: { USD: 1.0 },
                    })
                );

            await loadModule();
            const result = await loadPortfolioSeries();

            // Should still have 2 points (updated, not appended)
            expect(result.USD).toHaveLength(2);
            expect(result.USD[1].date).toBe(today);
            expect(result.USD[1].value).toBe(11000); // Updated to real-time
        });

        it('should handle real-time fetch failure gracefully', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        USD: [{ date: '2024-12-04', value: 10000 }],
                    })
                )
                .mockRejectedValueOnce(new Error('Network error'));

            await loadModule();
            const result = await loadPortfolioSeries();

            // Should return historical data only
            expect(result.USD).toHaveLength(1);
            expect(result.USD[0].value).toBe(10000);
        });
    });

    describe('loadCompositionSnapshotData with real-time data', () => {
        it('should append real-time composition to historical snapshot', async () => {
            const today = getTodayDateString();
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        dates: ['2024-12-03', '2024-12-04'],
                        composition: {
                            VT: [80, 82],
                            GOOG: [20, 18],
                        },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: { shares: '100', average_price: '100' },
                        GOOG: { shares: '10', average_price: '150' },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        VT: 100, // 100 * 100 = 10000
                        GOOG: 100, // 10 * 100 = 1000
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        rates: { USD: 1.0 },
                    })
                );

            await loadModule();
            const result = await loadCompositionSnapshotData();

            // Should have 3 dates now
            expect(result.dates).toHaveLength(3);
            expect(result.dates[2]).toBe(today);

            // VT: 90.909%, GOOG: 9.09%
            expect(result.composition.VT).toHaveLength(3);
            expect(result.composition.VT[2]).toBeCloseTo(90.909, 1);
            expect(result.composition.GOOG[2]).toBeCloseTo(9.09, 1);
        });

        it('should handle missing composition snapshot gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

            await loadModule();
            const result = await loadCompositionSnapshotData();

            expect(result).toBeNull();
        });
    });
});
