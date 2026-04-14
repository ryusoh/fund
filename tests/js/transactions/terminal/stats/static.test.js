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

describe('static.js stats functions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getCagrText', () => {
        it('should return text on ok response', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve('CAGR Data'),
                })
            );
            const result = await getCagrText();
            expect(result).toBe('CAGR Data');
        });

        it('should handle non-ok response', async () => {
            global.fetch = jest.fn(() => Promise.resolve({ ok: false }));
            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
        });

        it('should handle exception', async () => {
            const error = new Error('error');
            global.fetch = jest.fn(() => Promise.reject(error));
            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
            expect(logger.warn).toHaveBeenCalled();
        });
    });

    describe('getAnnualReturnText', () => {
        it('should return text on ok response', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve('Annual Return Data'),
                })
            );
            const result = await getAnnualReturnText();
            expect(result).toBe('Annual Return Data');
        });

        it('should handle non-ok response', async () => {
            global.fetch = jest.fn(() => Promise.resolve({ ok: false }));
            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
        });

        it('should handle exception', async () => {
            const error = new Error('error');
            global.fetch = jest.fn(() => Promise.reject(error));
            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
            expect(logger.warn).toHaveBeenCalled();
        });
    });

    describe('getRatioText', () => {
        it('should return text on ok response', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve('Ratio Data'),
                })
            );
            const result = await getRatioText();
            expect(result).toBe('Ratio Data');
        });

        it('should handle non-ok response', async () => {
            global.fetch = jest.fn(() => Promise.resolve({ ok: false }));
            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });

        it('should handle exception', async () => {
            const error = new Error('error');
            global.fetch = jest.fn(() => Promise.reject(error));
            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
            expect(logger.warn).toHaveBeenCalled();
        });
    });
});
