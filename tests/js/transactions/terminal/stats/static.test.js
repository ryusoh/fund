import { jest } from '@jest/globals';

describe('Static Stats Functions', () => {
    let globalFetchSpy;

    beforeEach(() => {
        jest.resetModules();
        global.fetch = jest.fn();
        globalFetchSpy = global.fetch;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete global.fetch;
    });

    describe('getCagrText', () => {
        test('returns the text from the CAGR file successfully', async () => {
            const { getCagrText } = await import('@js/transactions/terminal/stats/static.js');

            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                text: async () => 'CAGR: 15.5%',
            });

            const result = await getCagrText();

            expect(globalFetchSpy).toHaveBeenCalledWith('../data/output/cagr.txt');
            expect(result).toBe('CAGR: 15.5%');
        });

        test('returns an error message when the fetch is not OK', async () => {
            const { getCagrText } = await import('@js/transactions/terminal/stats/static.js');

            globalFetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

            const result = await getCagrText();

            expect(globalFetchSpy).toHaveBeenCalledWith('../data/output/cagr.txt');
            expect(result).toBe('Error loading CAGR data.');
        });

        test('returns an error message and logs when fetch throws an error', async () => {
            const { getCagrText } = await import('@js/transactions/terminal/stats/static.js');

            globalFetchSpy.mockRejectedValueOnce(new Error('Network error'));

            const result = await getCagrText();

            expect(globalFetchSpy).toHaveBeenCalledWith('../data/output/cagr.txt');
            expect(result).toBe('Error loading CAGR data.');
        });
    });

    describe('getAnnualReturnText', () => {
        test('returns the text from the annual returns file successfully', async () => {
            const { getAnnualReturnText } =
                await import('@js/transactions/terminal/stats/static.js');

            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                text: async () => '2023: +20.0%',
            });

            const result = await getAnnualReturnText();

            expect(globalFetchSpy).toHaveBeenCalledWith('../data/output/annual_returns.txt');
            expect(result).toBe('2023: +20.0%');
        });

        test('returns an error message when the fetch is not OK', async () => {
            const { getAnnualReturnText } =
                await import('@js/transactions/terminal/stats/static.js');

            globalFetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
            });

            const result = await getAnnualReturnText();

            expect(globalFetchSpy).toHaveBeenCalledWith('../data/output/annual_returns.txt');
            expect(result).toBe('Error loading annual returns.');
        });

        test('returns an error message when fetch throws an error', async () => {
            const { getAnnualReturnText } =
                await import('@js/transactions/terminal/stats/static.js');

            globalFetchSpy.mockRejectedValueOnce(new Error('Connection timed out'));

            const result = await getAnnualReturnText();

            expect(globalFetchSpy).toHaveBeenCalledWith('../data/output/annual_returns.txt');
            expect(result).toBe('Error loading annual returns.');
        });
    });

    describe('getRatioText', () => {
        test('returns the text from the ratios file successfully', async () => {
            const { getRatioText } = await import('@js/transactions/terminal/stats/static.js');

            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                text: async () => 'Sharpe: 1.2, Sortino: 1.5',
            });

            const result = await getRatioText();

            expect(globalFetchSpy).toHaveBeenCalledWith('../data/output/ratios.txt');
            expect(result).toBe('Sharpe: 1.2, Sortino: 1.5');
        });

        test('returns an error message when the fetch is not OK', async () => {
            const { getRatioText } = await import('@js/transactions/terminal/stats/static.js');

            globalFetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 403,
            });

            const result = await getRatioText();

            expect(globalFetchSpy).toHaveBeenCalledWith('../data/output/ratios.txt');
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });

        test('returns an error message when fetch throws an error', async () => {
            const { getRatioText } = await import('@js/transactions/terminal/stats/static.js');

            globalFetchSpy.mockRejectedValueOnce(new Error('Fetch failed'));

            const result = await getRatioText();

            expect(globalFetchSpy).toHaveBeenCalledWith('../data/output/ratios.txt');
            expect(result).toBe('Error loading Sharpe and Sortino ratios.');
        });
    });
});
