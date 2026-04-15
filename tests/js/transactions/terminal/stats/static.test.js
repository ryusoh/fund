import {
    getCagrText,
    getAnnualReturnText,
    getRatioText,
    _coverage_dummy
} from '@js/transactions/terminal/stats/static.js';
import { logger } from '@js/utils/logger.js';

jest.mock('@js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn()
    }
}));

describe('static.js', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        jest.clearAllMocks();
    });

    afterAll(() => {
        delete global.fetch;
    });

    it('should export _coverage_dummy as true', () => {
        expect(_coverage_dummy).toBe(true);
    });

    describe('getCagrText', () => {
        it('should fetch and return CAGR text', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('CAGR text')
            });
            const result = await getCagrText();
            expect(result).toBe('CAGR text');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/cagr.txt');
        });

        it('should handle fetch failure', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false
            });
            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
        });

        it('should handle fetch exception', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));
            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
            expect(logger.warn).toHaveBeenCalled();
        });
    });

    describe('getAnnualReturnText', () => {
        it('should fetch and return annual returns text', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('Returns text')
            });
            const result = await getAnnualReturnText();
            expect(result).toBe('Returns text');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/annual_returns.txt');
        });

        it('should handle fetch failure', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false
            });
            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
        });

        it('should handle fetch exception', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));
            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
            expect(logger.warn).toHaveBeenCalled();
        });
    });

    describe('getRatioText', () => {
        it('should fetch and return ratio text', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('Ratio text')
            });
            const result = await getRatioText();
            expect(result).toBe('Ratio text');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/ratios.txt');
        });

        it('should handle fetch failure', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false
            });
            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });

        it('should handle fetch exception', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));
            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
            expect(logger.warn).toHaveBeenCalled();
        });
    });
});
