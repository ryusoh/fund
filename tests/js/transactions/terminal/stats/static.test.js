import {
    getCagrText,
    getAnnualReturnText,
    getRatioText,
} from '../../../../../js/transactions/terminal/stats/static.js';
import { logger } from '../../../../../js/utils/logger.js';

jest.mock('../../../../../js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
    },
}));

describe('static stats', () => {
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
        it('returns text when fetch is successful', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: jest.fn().mockResolvedValue('CAGR: 10%'),
            });
            const result = await getCagrText();
            expect(global.fetch).toHaveBeenCalledWith('../data/output/cagr.txt');
            expect(result).toBe('CAGR: 10%');
        });

        it('returns error message when fetch is not ok', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false });
            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
        });

        it('returns error message on exception', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));
            const result = await getCagrText();
            expect(logger.warn).toHaveBeenCalled();
            expect(result).toBe('Error loading CAGR data.');
        });
    });

    describe('getAnnualReturnText', () => {
        it('returns text when fetch is successful', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: jest.fn().mockResolvedValue('Annual Return: 15%'),
            });
            const result = await getAnnualReturnText();
            expect(global.fetch).toHaveBeenCalledWith('../data/output/annual_returns.txt');
            expect(result).toBe('Annual Return: 15%');
        });

        it('returns error message when fetch is not ok', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false });
            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
        });

        it('returns error message on exception', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));
            const result = await getAnnualReturnText();
            expect(logger.warn).toHaveBeenCalled();
            expect(result).toBe('Error loading annual returns.');
        });
    });

    describe('getRatioText', () => {
        it('returns text when fetch is successful', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: jest.fn().mockResolvedValue('Sharpe: 1.5'),
            });
            const result = await getRatioText();
            expect(global.fetch).toHaveBeenCalledWith('../data/output/ratios.txt');
            expect(result).toBe('Sharpe: 1.5');
        });

        it('returns error message when fetch is not ok', async () => {
            global.fetch.mockResolvedValueOnce({ ok: false });
            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });

        it('returns error message on exception', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));
            const result = await getRatioText();
            expect(logger.warn).toHaveBeenCalled();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });
    });
});
