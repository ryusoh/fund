import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('@js/transactions/utils.js', () => ({
    formatCurrency: jest.fn((val, opts) => `FCURR_${val}_${opts.currency}`),
}));

jest.mock('@js/transactions/terminal/stats/formatting.js', () => ({
    renderAsciiTable: jest.fn(({ rows }) => rows.map((r) => r.join(',')).join('\n')),
    formatTicker: jest.fn((val) => `TICKER_${val}`),
    formatShareValue: jest.fn((val) => `SHARE_${val}`),
    formatResidualValue: jest.fn((val) => `RESID_${val}`),
}));

jest.mock('@js/transactions/terminal/stats/analysis.js', () => ({
    buildLotSnapshots: jest.fn(),
}));

describe('Holdings Stats Module', () => {
    let globalFetchSpy;
    let buildLotSnapshotsMock;

    beforeEach(() => {
        jest.resetModules();
        global.fetch = jest.fn();
        globalFetchSpy = global.fetch;

        buildLotSnapshotsMock =
            require('@js/transactions/terminal/stats/analysis.js').buildLotSnapshots;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('getHoldingsText', () => {
        beforeEach(() => {
            // reset cache
            require('@js/transactions/terminal/stats/holdings.js').__holdingsDataCache = null;
        });

        test('handles invalid currency and empty average_price/total_cost', async () => {
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            globalFetchSpy.mockImplementation((url) => {
                if (url.includes('holdings.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            USD: [
                                {
                                    security: 'MISSING',
                                    shares: null,
                                    average_price: null,
                                    total_cost: undefined,
                                },
                            ],
                        }),
                    });
                }
            });
            const result = await moduleLocal.getHoldingsText('   '); // Will trim and fallback to USD
            expect(result).toContain('MISSING');
            expect(result).toContain('0.00'); // shares fallbacks to 0
            expect(result).toContain('N/A'); // avgPrice
            expect(result).toContain('N/A'); // totalCost
        });

        test('uses cache if already loaded and falls back to USD if currency not found', async () => {
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            // First call to populate cache
            globalFetchSpy.mockImplementationOnce(() => {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        USD: [{ security: 'CASH', shares: 100, average_price: 1, total_cost: 100 }],
                    }),
                });
            });
            await moduleLocal.getHoldingsText('USD');

            // Second call with unknown currency GBP (falls back to USD)
            globalFetchSpy.mockClear();
            const result = await moduleLocal.getHoldingsText('GBP');
            expect(globalFetchSpy).not.toHaveBeenCalled();
            expect(result).toContain('CASH');
        });

        test('catches exception on json fetch and logs warning', async () => {
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            globalFetchSpy.mockImplementation((url) => {
                if (url.includes('holdings.json')) {
                    return Promise.reject(new Error('JSON FETCH ERROR'));
                }
                if (url.includes('holdings.txt')) {
                    return Promise.resolve({ ok: true, text: async () => 'TEXT FALLBACK' });
                }
            });
            const result = await moduleLocal.getHoldingsText();
            expect(result).toBe('TEXT FALLBACK');
        });

        test('catches exception on text fetch and returns error string', async () => {
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            globalFetchSpy.mockImplementation((url) => {
                if (url.includes('holdings.json')) {
                    return Promise.resolve({ ok: false });
                }
                if (url.includes('holdings.txt')) {
                    return Promise.reject(new Error('TEXT FETCH ERROR'));
                }
            });
            const result = await moduleLocal.getHoldingsText();
            expect(result).toBe('Error loading holdings data.');
        });

        test('fetches and formats JSON holding data correctly for USD', async () => {
            // Arrange
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');

            globalFetchSpy.mockImplementation((url) => {
                if (url.includes('holdings.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            USD: [
                                {
                                    security: 'AAPL',
                                    shares: 10,
                                    average_price: 150,
                                    total_cost: 1500,
                                },
                                {
                                    security: 'MSFT',
                                    shares: 5,
                                    average_price: 200,
                                    total_cost: 1000,
                                },
                            ],
                        }),
                    });
                }
                return Promise.reject(new Error(`Unhandled: ${url}`));
            });

            // Act
            const result = await moduleLocal.getHoldingsText('USD');

            // Assert
            expect(typeof result).toBe('string');
            expect(result).toContain('AAPL');
            expect(result).toContain('10.00');
            expect(result).toContain('FCURR_150_USD');
            expect(result).toContain('FCURR_1500_USD');
            expect(result).toContain('MSFT');
            expect(result).toContain('5.00');
            expect(result).toContain('FCURR_200_USD');
            expect(result).toContain('FCURR_1000_USD');
        });

        test('returns "No current holdings." when data is empty', async () => {
            // Arrange
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');

            globalFetchSpy.mockImplementation((url) => {
                if (url.includes('holdings.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({ USD: [] }), // Empty holdings
                    });
                }
                return Promise.reject();
            });

            // Act
            const result = await moduleLocal.getHoldingsText();

            // Assert
            expect(result).toBe('No current holdings.');
        });

        test('falls back to text file on JSON failure', async () => {
            // Arrange
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');

            globalFetchSpy.mockImplementation((url) => {
                if (url.includes('holdings.json')) {
                    return Promise.resolve({ ok: false }); // Fails JSON load
                }
                if (url.includes('holdings.txt')) {
                    return Promise.resolve({
                        ok: true,
                        text: async () => 'LEGACY TEXT HOLDINGS',
                    });
                }
                return Promise.reject();
            });

            // Act
            const result = await moduleLocal.getHoldingsText();

            // Assert
            expect(result).toBe('LEGACY TEXT HOLDINGS');
        });

        test('returns error string when both json and txt endpoints fail', async () => {
            // Arrange
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');

            globalFetchSpy.mockImplementation(() => {
                return Promise.resolve({ ok: false });
            });

            // Act
            const result = await moduleLocal.getHoldingsText();

            // Assert
            expect(result).toBe('Error loading holdings data.');
        });
    });

    describe('getHoldingsDebugText', () => {
        test('skips tickers with infinite shares', async () => {
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            const lotsByTicker = new Map([
                ['INF_CORP', [{ qty: Infinity }]],
                ['GOOD_CORP', [{ qty: 10 }]],
            ]);
            buildLotSnapshotsMock.mockReturnValue({ lotsByTicker });

            const result = await moduleLocal.getHoldingsDebugText();
            expect(result).not.toContain('INF_CORP');
            expect(result).toContain('GOOD_CORP');
        });

        test('returns "No non-zero share balances" when all are zero', async () => {
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            const lotsByTicker = new Map([['ZERO_CORP', [{ qty: 0 }]]]);
            buildLotSnapshotsMock.mockReturnValue({ lotsByTicker });

            const result = await moduleLocal.getHoldingsDebugText();
            expect(result).toBe('No non-zero share balances derived from transactions.');
        });

        test('returns error string if lotsByTicker is null or empty', async () => {
            // Arrange
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');

            buildLotSnapshotsMock.mockReturnValue({ lotsByTicker: new Map() });

            // Act
            const result = await moduleLocal.getHoldingsDebugText();

            // Assert
            expect(result).toBe('Transaction ledger not loaded or no active holdings to debug.');
        });

        test('ignores zero-balance shares correctly', async () => {
            // Arrange
            const moduleLocal = require('@js/transactions/terminal/stats/holdings.js');

            const lotsByTicker = new Map([
                ['EMPTY_CORP', [{ qty: 10 }, { qty: -10 }]], // nets to 0
                ['REAL_CORP', [{ qty: 15.5 }]],
            ]);
            buildLotSnapshotsMock.mockReturnValue({ lotsByTicker });

            // Act
            const result = await moduleLocal.getHoldingsDebugText();

            // Assert
            expect(result).toContain('TICKER_REAL_CORP');
            expect(result).toContain('SHARE_15.5');
            expect(result).toContain('15.50'); // the explicit rounded value in output string
            expect(result).toContain('RESID_0');
            expect(result).not.toContain('EMPTY_CORP'); // should be ignored due to near-zero logic
        });
    });
});
