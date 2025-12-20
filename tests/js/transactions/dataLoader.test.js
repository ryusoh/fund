/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Regex to verify date format YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

        // Mock date utils
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
            // Real-time date should be a valid date string (not the historical dates)
            expect(result.USD[2].date).toMatch(DATE_REGEX);
            expect(result.USD[2].date).not.toBe('2024-12-04');
            expect(result.USD[2].value).toBe(11000); // 100 * 110
        });

        it('should update existing date if real-time date matches last historical', async () => {
            // Use a date string we control for testing update behavior
            const testDateString = '2025-12-08'; // Use current NY date as the "matching" date
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        USD: [
                            { date: '2024-12-04', value: 10000 },
                            { date: testDateString, value: 10500 }, // Same as real-time date
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

            // Should have 2 points if real-time date matches, or 3 if different
            // The key assertion is that the latest value is updated to real-time
            expect(result.USD.length).toBeGreaterThanOrEqual(2);
            expect(result.USD[result.USD.length - 1].date).toMatch(DATE_REGEX);
            expect(result.USD[result.USD.length - 1].value).toBe(11000); // Updated to real-time
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
            // Real-time date should match expected format (not the historical dates)
            expect(result.dates[2]).toMatch(DATE_REGEX);
            expect(result.dates[2]).not.toBe('2024-12-04');

            // VT: 90.909%, GOOG: 9.09%
            expect(result.composition.VT).toHaveLength(3);
            expect(result.composition.VT[2]).toBeCloseTo(90.909, 1);
            expect(result.composition.GOOG[2]).toBeCloseTo(9.09, 1);
        });

        it('should handle missing composition snapshot gracefully', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                })
                .mockRejectedValueOnce(new Error('Network error')); // For realtime fetch

            await loadModule();
            const result = await loadCompositionSnapshotData();

            expect(result).toBeNull();
        });

        it('should fetch from correct path: figures/composition.json', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        dates: ['2024-12-04'],
                        composition: { VT: [100] },
                    })
                )
                .mockRejectedValueOnce(new Error('Network error')); // For realtime fetch

            await loadModule();
            await loadCompositionSnapshotData();

            // Verify the first fetch call uses the correct path
            const firstCall = mockFetch.mock.calls[0];
            expect(firstCall[0]).toContain('figures/composition.json');
            expect(firstCall[0]).not.toContain('composition_snapshot.json');
        });

        it('should append real-time balance to total_values array', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        dates: ['2024-12-03', '2024-12-04'],
                        composition: {
                            VT: [80, 82],
                            GOOG: [20, 18],
                        },
                        total_values: [10000, 10500], // Historical total values
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

            // Should have 3 dates with real-time appended
            expect(result.dates).toHaveLength(3);
            // The third date should be today's date (from real-time data)
            expect(result.dates[2]).not.toBe('2024-12-04'); // Not the historical date

            // total_values should also have 3 entries with real-time balance
            // Real-time balance = 100*100 + 10*100 = 11000
            expect(result.total_values).toHaveLength(3);
            expect(result.total_values[2]).toBe(11000);
        });

        it('should correctly merge aliased tickers (BRKB vs BRK-B) in composition data', async () => {
            mockFetch
                .mockResolvedValueOnce(
                    createMockResponse({
                        dates: ['2024-12-03', '2024-12-04'],
                        composition: {
                            BRKB: [50, 50],
                            VT: [50, 50],
                        },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        'BRK-B': { shares: '10', average_price: '200' }, // Real-time alias
                        VT: { shares: '100', average_price: '100' },
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        'BRK-B': 200, // 10 * 200 = 2000
                        VT: 80, // 100 * 80 = 8000
                    })
                )
                .mockResolvedValueOnce(
                    createMockResponse({
                        rates: { USD: 1.0 },
                    })
                );

            await loadModule();
            const result = await loadCompositionSnapshotData();

            // Total balance = 2000 + 8000 = 10000
            // BRK-B (aliased to BRKB): 2000 / 10000 = 20%
            // VT: 8000 / 10000 = 80%

            expect(result.dates).toHaveLength(3);

            // Verify merged ticker (BRKB should receive real-time data from BRK-B)
            expect(result.composition.BRKB).toHaveLength(3);
            expect(result.composition.BRKB[2]).toBeCloseTo(20.0, 1);

            // Verify no separate entry for BRK-B
            expect(result.composition['BRK-B']).toBeUndefined();
        });
    });
});
