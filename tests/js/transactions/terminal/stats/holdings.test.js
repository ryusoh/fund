import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('@js/transactions/utils.js', () => ({
    formatCurrency: jest.fn((val, opts) => `FCURR_${val}_${opts.currency}`),
}));

jest.mock('@js/transactions/terminal/stats/formatting.js', () => ({
    renderAsciiTable: jest.fn(({ rows }) => rows), // Simplified mapping to string later
    formatTicker: jest.fn(val => `TICKER_${val}`),
    formatShareValue: jest.fn(val => `SHARE_${val}`),
    formatResidualValue: jest.fn(val => `RESID_${val}`),
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

        buildLotSnapshotsMock = require('@js/transactions/terminal/stats/analysis.js').buildLotSnapshots;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('getHoldingsText', () => {
        test('fetches and formats JSON holding data correctly for USD', async () => {
            // Arrange
            let moduleLocal;
            jest.isolateModules(() => {
                moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            });
            globalFetchSpy.mockImplementation((url) => {
                if (url.includes('holdings.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            USD: [
                                { security: 'AAPL', shares: 10, average_price: 150, total_cost: 1500 },
                                { security: 'MSFT', shares: 5, average_price: 200, total_cost: 1000 }
                            ]
                        })
                    });
                }
                return Promise.reject(new Error(`Unhandled: ${url}`));
            });

            // Act
            const result = await moduleLocal.getHoldingsText('USD');

            // Assert
            // The mocked `renderAsciiTable` returns the rows array directly, so it interpolates into \nArray,Array\n
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
            let moduleLocal;
            jest.isolateModules(() => {
                moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            });
            globalFetchSpy.mockImplementation((url) => {
                if (url.includes('holdings.json')) {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({ USD: [] }) // Empty holdings
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
            let moduleLocal;
            jest.isolateModules(() => {
                moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            });
            globalFetchSpy.mockImplementation((url) => {
                if (url.includes('holdings.json')) {
                    return Promise.resolve({ ok: false }); // Fails JSON load
                }
                if (url.includes('holdings.txt')) {
                    return Promise.resolve({
                        ok: true,
                        text: async () => 'LEGACY TEXT HOLDINGS'
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
            let moduleLocal;
            jest.isolateModules(() => {
                moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            });
            globalFetchSpy.mockImplementation((url) => {
                return Promise.resolve({ ok: false });
            });

            // Act
            const result = await moduleLocal.getHoldingsText();

            // Assert
            expect(result).toBe('Error loading holdings data.');
        });
    });

    describe('getHoldingsDebugText', () => {
        test('returns error string if lotsByTicker is null or empty', async () => {
            // Arrange
            let moduleLocal;
            jest.isolateModules(() => {
                moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            });
            buildLotSnapshotsMock.mockReturnValue({ lotsByTicker: new Map() });

            // Act
            const result = await moduleLocal.getHoldingsDebugText();

            // Assert
            expect(result).toBe('Transaction ledger not loaded or no active holdings to debug.');
        });

        test('ignores zero-balance shares correctly', async () => {
            // Arrange
            let moduleLocal;
            jest.isolateModules(() => {
                moduleLocal = require('@js/transactions/terminal/stats/holdings.js');
            });

            const lotsByTicker = new Map([
                ['EMPTY_CORP', [{ qty: 10 }, { qty: -10 }]], // nets to 0
                ['REAL_CORP', [{ qty: 15.5 }]]
            ]);
            buildLotSnapshotsMock.mockReturnValue({ lotsByTicker });

            // Act
            const result = await moduleLocal.getHoldingsDebugText();

            // Assert
            // Our mock renderAsciiTable returns rows as an array, interpolating to string
            expect(result).toContain('TICKER_REAL_CORP');
            expect(result).toContain('SHARE_15.5');
            expect(result).toContain('15.50'); // Rounded
            expect(result).toContain('RESID_0');
            expect(result).not.toContain('EMPTY_CORP'); // should be ignored due to near-zero logic
        });
    });
});
