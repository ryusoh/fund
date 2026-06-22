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

describe('static stats commands', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        jest.clearAllMocks();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe('getCagrText', () => {
        it('returns text on successful fetch', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('CAGR data content'),
            });

            const result = await getCagrText();
            expect(result).toBe('CAGR data content');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/cagr.txt');
        });

        it('returns error message on non-ok response', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 404,
            });

            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
        });

        it('returns error message and logs warning on fetch error', async () => {
            const error = new Error('Network error');
            global.fetch = jest.fn().mockRejectedValue(error);

            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
            expect(logger.warn).toHaveBeenCalledWith('Terminal stats processing failed:', error);
        });
    });

    describe('getAnnualReturnText', () => {
        it('returns text on successful fetch', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('Annual return data content'),
            });

            const result = await getAnnualReturnText();
            expect(result).toBe('Annual return data content');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/annual_returns.txt');
        });

        it('returns error message on non-ok response', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 500,
            });

            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
        });

        it('returns error message and logs warning on fetch error', async () => {
            const error = new Error('Network timeout');
            global.fetch = jest.fn().mockRejectedValue(error);

            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
            expect(logger.warn).toHaveBeenCalledWith('Terminal stats processing failed:', error);
        });
    });

    describe('getRatioText', () => {
        it('returns text on successful fetch', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('Ratio data content'),
            });

            const result = await getRatioText();
            expect(result).toBe('Ratio data content');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/ratios.txt');
        });

        it('returns error message on non-ok response', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 403,
            });

            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });

        it('returns error message and logs warning on fetch error', async () => {
            const error = new TypeError('Failed to fetch');
            global.fetch = jest.fn().mockRejectedValue(error);

            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
            expect(logger.warn).toHaveBeenCalledWith('Terminal stats processing failed:', error);
        });
    });
});
