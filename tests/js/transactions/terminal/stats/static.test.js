import { getCagrText, getAnnualReturnText, getRatioText } from '../../../../../js/transactions/terminal/stats/static.js';
import { logger } from '../../../../../js/utils/logger.js';

jest.mock('../../../../../js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn()
    }
}));

describe('static stats fetchers', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        jest.clearAllMocks();
    });

    describe('getCagrText', () => {
        it('returns text on successful fetch', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: async () => 'Mock CAGR data'
            });

            const result = await getCagrText();
            expect(result).toBe('Mock CAGR data');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/cagr.txt');
        });

        it('returns error message on non-ok fetch', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false });
            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
        });

        it('catches exceptions and logs warning', async () => {
            const error = new Error('Network error');
            global.fetch.mockRejectedValueOnce(error);
            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', error);
        });
    });

    describe('getAnnualReturnText', () => {
        it('returns text on successful fetch', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: async () => 'Mock Annual Return data'
            });

            const result = await getAnnualReturnText();
            expect(result).toBe('Mock Annual Return data');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/annual_returns.txt');
        });

        it('returns error message on non-ok fetch', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false });
            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
        });

        it('catches exceptions and logs warning', async () => {
            const error = new Error('Network error');
            global.fetch.mockRejectedValueOnce(error);
            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', error);
        });
    });

    describe('getRatioText', () => {
        it('returns text on successful fetch', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: async () => 'Mock Ratio data'
            });

            const result = await getRatioText();
            expect(result).toBe('Mock Ratio data');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/ratios.txt');
        });

        it('returns error message on non-ok fetch', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false });
            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });

        it('catches exceptions and logs warning', async () => {
            const error = new Error('Network error');
            global.fetch.mockRejectedValueOnce(error);
            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', error);
        });
    });
});
