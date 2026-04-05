import { jest } from '@jest/globals';
import { getCagrText, getAnnualReturnText, getRatioText } from '../../../../../js/transactions/terminal/stats/static.js';
import { logger } from '../../../../../js/utils/logger.js';

jest.mock('../../../../../js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
    },
}));

describe('static stats handlers', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        jest.clearAllMocks();
    });

    afterEach(() => {
        delete global.fetch;
    });

    describe('getCagrText', () => {
        it('should fetch and return text content successfully', async () => {
            const mockText = 'CAGR: 10%';
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: async () => mockText,
            });

            const result = await getCagrText();

            expect(global.fetch).toHaveBeenCalledWith('../data/output/cagr.txt');
            expect(result).toBe(mockText);
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should handle fetch errors (response not ok)', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
            });

            const result = await getCagrText();

            expect(result).toBe('Error loading CAGR data.');
        });

        it('should handle network errors', async () => {
            const networkError = new Error('Network error');
            global.fetch.mockRejectedValueOnce(networkError);

            const result = await getCagrText();

            expect(result).toBe('Error loading CAGR data.');
            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', networkError);
        });
    });

    describe('getAnnualReturnText', () => {
        it('should fetch and return text content successfully', async () => {
            const mockText = 'Annual Return: 15%';
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: async () => mockText,
            });

            const result = await getAnnualReturnText();

            expect(global.fetch).toHaveBeenCalledWith('../data/output/annual_returns.txt');
            expect(result).toBe(mockText);
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should handle fetch errors (response not ok)', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
            });

            const result = await getAnnualReturnText();

            expect(result).toBe('Error loading annual returns.');
        });

        it('should handle network errors', async () => {
            const networkError = new Error('Network error');
            global.fetch.mockRejectedValueOnce(networkError);

            const result = await getAnnualReturnText();

            expect(result).toBe('Error loading annual returns.');
            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', networkError);
        });
    });

    describe('getRatioText', () => {
        it('should fetch and return text content successfully', async () => {
            const mockText = 'Sharpe: 1.5';
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: async () => mockText,
            });

            const result = await getRatioText();

            expect(global.fetch).toHaveBeenCalledWith('../data/output/ratios.txt');
            expect(result).toBe(mockText);
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should handle fetch errors (response not ok)', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
            });

            const result = await getRatioText();

            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });

        it('should handle network errors', async () => {
            const networkError = new Error('Network error');
            global.fetch.mockRejectedValueOnce(networkError);

            const result = await getRatioText();

            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
            expect(logger.warn).toHaveBeenCalledWith('Caught exception:', networkError);
        });
    });
});
