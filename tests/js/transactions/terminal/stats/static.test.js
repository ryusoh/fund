import {
    getCagrText,
    getAnnualReturnText,
    getRatioText,
} from '@js/transactions/terminal/stats/static.js';
import { logger } from '@js/utils/logger.js';

jest.mock('@js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
    },
}));

describe('static stats text functions', () => {
    afterEach(() => {
        jest.clearAllMocks();
        global.fetch = undefined;
    });

    describe('getCagrText', () => {
        it('should return fetched text when response is ok', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('CAGR Content'),
            });

            const result = await getCagrText();

            expect(global.fetch).toHaveBeenCalledWith('../data/output/cagr.txt');
            expect(result).toBe('CAGR Content');
        });

        it('should return error message when response is not ok', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
            });

            const result = await getCagrText();

            expect(result).toBe('Error loading CAGR data.');
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should return error message and log when fetch throws', async () => {
            const error = new Error('Network error');
            global.fetch = jest.fn().mockRejectedValue(error);

            const result = await getCagrText();

            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', error);
            expect(result).toBe('Error loading CAGR data.');
        });
    });

    describe('getAnnualReturnText', () => {
        it('should return fetched text when response is ok', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('Annual Return Content'),
            });

            const result = await getAnnualReturnText();

            expect(global.fetch).toHaveBeenCalledWith('../data/output/annual_returns.txt');
            expect(result).toBe('Annual Return Content');
        });

        it('should return error message when response is not ok', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
            });

            const result = await getAnnualReturnText();

            expect(result).toBe('Error loading annual returns.');
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should return error message and log when fetch throws', async () => {
            const error = new Error('Network error');
            global.fetch = jest.fn().mockRejectedValue(error);

            const result = await getAnnualReturnText();

            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', error);
            expect(result).toBe('Error loading annual returns.');
        });
    });

    describe('getRatioText', () => {
        it('should return fetched text when response is ok', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('Ratio Content'),
            });

            const result = await getRatioText();

            expect(global.fetch).toHaveBeenCalledWith('../data/output/ratios.txt');
            expect(result).toBe('Ratio Content');
        });

        it('should return error message when response is not ok', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
            });

            const result = await getRatioText();

            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should return error message and log when fetch throws', async () => {
            const error = new Error('Network error');
            global.fetch = jest.fn().mockRejectedValue(error);

            const result = await getRatioText();

            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', error);
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });
    });
});
