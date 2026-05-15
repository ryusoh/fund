import { getCagrText, getAnnualReturnText, getRatioText } from '../../../../../js/transactions/terminal/stats/static.js';
import { logger } from '../../../../../js/utils/logger.js';

jest.mock('../../../../../js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn()
    }
}));

describe('static stats commands', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        global.fetch = jest.fn();
        jest.clearAllMocks();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe('getCagrText', () => {
        it('returns text on successful fetch', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('cagr data')
            });

            const result = await getCagrText();
            expect(global.fetch).toHaveBeenCalledWith('../data/output/cagr.txt');
            expect(result).toBe('cagr data');
        });

        it('returns error message on non-ok response', async () => {
            global.fetch.mockResolvedValue({
                ok: false
            });

            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
        });

        it('returns error message on exception', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'));

            const result = await getCagrText();
            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', expect.any(Error));
            expect(result).toBe('Error loading CAGR data.');
        });
    });

    describe('getAnnualReturnText', () => {
        it('returns text on successful fetch', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('return data')
            });

            const result = await getAnnualReturnText();
            expect(global.fetch).toHaveBeenCalledWith('../data/output/annual_returns.txt');
            expect(result).toBe('return data');
        });

        it('returns error message on non-ok response', async () => {
            global.fetch.mockResolvedValue({
                ok: false
            });

            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
        });

        it('returns error message on exception', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'));

            const result = await getAnnualReturnText();
            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', expect.any(Error));
            expect(result).toBe('Error loading annual returns.');
        });
    });

    describe('getRatioText', () => {
        it('returns text on successful fetch', async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('ratio data')
            });

            const result = await getRatioText();
            expect(global.fetch).toHaveBeenCalledWith('../data/output/ratios.txt');
            expect(result).toBe('ratio data');
        });

        it('returns error message on non-ok response', async () => {
            global.fetch.mockResolvedValue({
                ok: false
            });

            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });

        it('returns error message on exception', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'));

            const result = await getRatioText();
            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', expect.any(Error));
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });
    });
});
