import { jest } from '@jest/globals';

jest.mock('@js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
    },
}));

describe('static stats fetching', () => {
    let getCagrText, getAnnualReturnText, getRatioText;
    let originalFetch;
    let loggerWarnMock;

    beforeEach(async () => {
        jest.clearAllMocks();
        originalFetch = global.fetch;
        const module = await import('@js/utils/logger.js');
        loggerWarnMock = module.logger.warn;

        const staticModule = await import('@js/transactions/terminal/stats/static.js');
        getCagrText = staticModule.getCagrText;
        getAnnualReturnText = staticModule.getAnnualReturnText;
        getRatioText = staticModule.getRatioText;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe('getCagrText', () => {
        test('returns text on success', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve('CAGR Data'),
                })
            );
            const result = await getCagrText();
            expect(result).toBe('CAGR Data');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/cagr.txt');
        });

        test('returns error on non-ok response', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: false,
                })
            );
            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
        });

        test('returns error on exception', async () => {
            const error = new Error('Network error');
            global.fetch = jest.fn(() => Promise.reject(error));
            const result = await getCagrText();
            expect(result).toBe('Error loading CAGR data.');
            expect(loggerWarnMock).toHaveBeenCalledWith('Caught exception:', error);
        });
    });

    describe('getAnnualReturnText', () => {
        test('returns text on success', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve('Annual Return Data'),
                })
            );
            const result = await getAnnualReturnText();
            expect(result).toBe('Annual Return Data');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/annual_returns.txt');
        });

        test('returns error on non-ok response', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: false,
                })
            );
            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
        });

        test('returns error on exception', async () => {
            const error = new Error('Network error');
            global.fetch = jest.fn(() => Promise.reject(error));
            const result = await getAnnualReturnText();
            expect(result).toBe('Error loading annual returns.');
            expect(loggerWarnMock).toHaveBeenCalledWith('Caught exception:', error);
        });
    });

    describe('getRatioText', () => {
        test('returns text on success', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve('Ratio Data'),
                })
            );
            const result = await getRatioText();
            expect(result).toBe('Ratio Data');
            expect(global.fetch).toHaveBeenCalledWith('../data/output/ratios.txt');
        });

        test('returns error on non-ok response', async () => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: false,
                })
            );
            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });

        test('returns error on exception', async () => {
            const error = new Error('Network error');
            global.fetch = jest.fn(() => Promise.reject(error));
            const result = await getRatioText();
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
            expect(loggerWarnMock).toHaveBeenCalledWith('Caught exception:', error);
        });
    });
});
