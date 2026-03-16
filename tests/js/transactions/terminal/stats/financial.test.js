import { jest } from '@jest/globals';

// Mock the formatters to pass through predictability
jest.mock('@js/transactions/terminal/stats/formatting.js', () => ({
    renderAsciiTable: jest.fn(({ rows }) => rows.map((r) => r.join(',')).join('\n')), // Return a string representation
    formatNumeric: jest.fn((val) => `NUM_${val}`),
    formatNumericPair: jest.fn((val1, val2) => `PAIR_${val1}_${val2}`),
    formatMarketCap: jest.fn((val, currency) => `MCAP_${val}_${currency}`),
    formatPercentageValue: jest.fn((val) => `PCT_${val}`),
}));

describe('getFinancialStatsText', () => {
    let globalFetchSpy;

    beforeEach(() => {
        jest.resetModules();
        global.fetch = jest.fn();
        globalFetchSpy = global.fetch;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('returns error message if analysis index fetch fails', async () => {
        const financialModule = require('@js/transactions/terminal/stats/financial.js');

        // Arrange
        globalFetchSpy.mockResolvedValueOnce({ ok: false }); // Fails index load

        // Act
        const result = await financialModule.getFinancialStatsText();

        // Assert
        expect(result).toBe('Error loading financial analysis data.');
    });

    test('returns "No financial data available" if index has no tickers', async () => {
        const financialModule = require('@js/transactions/terminal/stats/financial.js');

        // Arrange
        globalFetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ tickers: [] }),
        });

        globalFetchSpy.mockResolvedValueOnce({ // pe_ratio load (could succeed or fail)
            ok: true,
            json: async () => ({})
        });

        // Act
        const result = await financialModule.getFinancialStatsText();

        // Assert
        expect(result).toBe('No financial data available for holdings.');
    });

    test('resolves and formats financial data for valid tickers', async () => {
        const financialModule = require('@js/transactions/terminal/stats/financial.js');

        // Arrange
        globalFetchSpy.mockImplementation((url) => {
            if (url.includes('analysis/index.json')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        tickers: [
                            { symbol: 'AAPL', path: '../data/aapl.json' },
                            { symbol: 'MSFT', path: '../data/msft.json' }
                        ]
                    })
                });
            }
            if (url.includes('pe_ratio.json')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        forward_pe: {
                            ticker_forward_pe: { AAPL: [10, 15] } // Test getFallbackValue logic
                        }
                    })
                });
            }
            if (url.includes('aapl.json')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        symbol: 'AAPL',
                        market: {
                            eps: 5, forwardEps: 6,
                            pe: 20, forwardPe: undefined, // Will use fallback when mapped to NaN by Number()
                            pegRatio: 1.5,
                            evToEbitda: 15.5, // Direct value present
                            enterpriseValue: 3000,
                            ebitda: 200,
                            dividendYield: 0.05,
                            marketCap: 2800,
                            currency: 'USD'
                        }
                    })
                });
            }
            if (url.includes('msft.json')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        symbol: 'MSFT',
                        market: {
                            eps: 8, forwardEps: 9,
                            pe: 30, forwardPe: 28,
                            pegRatio: 2.0,
                            // No direct evToEbitda, should calculate from EV and EBITDA
                            enterpriseValue: 4000,
                            ebitda: 400,
                            dividendYield: 0.08,
                            marketCap: 3800,
                            currency: 'eur ' // tests currency trim and uppercase
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) }); // Mock unknown requests to prevent breaking
        });

        // Act
        const result = await financialModule.getFinancialStatsText();

        // Assert
        expect(typeof result).toBe('string');

        expect(result).toContain('AAPL');
        expect(result).toContain('PAIR_5_6');
        expect(result).toContain('PAIR_20_15'); // 15 came from the global fallback
        expect(result).toContain('NUM_1.5');
        expect(result).toContain('NUM_15.5'); // used direct evToEbitda
        expect(result).toContain('MCAP_3000_USD');
        expect(result).toContain('MCAP_200_USD');
        expect(result).toContain('PCT_0.05');
        expect(result).toContain('MCAP_2800_USD');

        // MSFT assertions
        expect(result).toContain('MSFT');
        expect(result).toContain('PAIR_8_9');
        expect(result).toContain('PAIR_30_28');
        expect(result).toContain('NUM_2');
        expect(result).toContain('NUM_10'); // Calculated 4000 / 400
        expect(result).toContain('MCAP_4000_EUR');
        expect(result).toContain('MCAP_400_EUR');
        expect(result).toContain('PCT_0.08');
        expect(result).toContain('MCAP_3800_EUR');
    });

    test('handles missing market data gracefully', async () => {
        const financialModule = require('@js/transactions/terminal/stats/financial.js');

        // Arrange
        globalFetchSpy.mockImplementation((url) => {
            if (url.includes('index.json')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ tickers: [{ symbol: 'BAD', path: 'bad.json' }] })
                });
            }
            if (url.includes('pe_ratio.json')) {
                return Promise.resolve({ ok: false });
            }
            if (url.includes('bad.json')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ symbol: 'BAD' }) // missing market object
                });
            }
            return Promise.reject(new Error(`Unhandled request: ${url}`));
        });

        // Act
        const result = await financialModule.getFinancialStatsText();

        // Assert
        expect(result).toBe('No financial data available for holdings.');
    });
});
