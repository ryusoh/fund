import { jest } from '@jest/globals';

describe('Geography Summary Handler', () => {
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

    describe('getGeographySummaryText', () => {
        test('returns formatted text on successful fetch', async () => {
            const { getGeographySummaryText } =
                await import('@js/transactions/terminal/handlers/geographySummary.js');

            globalFetchSpy.mockResolvedValueOnce({
                ok: true,
                text: async () => 'North America: 60%\nEurope: 30%\nAsia: 10%',
            });

            const result = await getGeographySummaryText();

            expect(globalFetchSpy).toHaveBeenCalledWith(
                '/data/output/figures/geography_summary.txt'
            );
            expect(result).toBe('North America: 60%\nEurope: 30%\nAsia: 10%');
        });

        test('returns an error message when response is not OK', async () => {
            const { getGeographySummaryText } =
                await import('@js/transactions/terminal/handlers/geographySummary.js');

            globalFetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

            const result = await getGeographySummaryText();

            expect(globalFetchSpy).toHaveBeenCalledWith(
                '/data/output/figures/geography_summary.txt'
            );
            expect(result).toBe(
                'Error: Unable to load geography summary. Run data generation first.'
            );
        });

        test('returns an error message when fetch throws an exception', async () => {
            const { getGeographySummaryText } =
                await import('@js/transactions/terminal/handlers/geographySummary.js');

            globalFetchSpy.mockRejectedValueOnce(new Error('Network error'));

            const result = await getGeographySummaryText();

            expect(globalFetchSpy).toHaveBeenCalledWith(
                '/data/output/figures/geography_summary.txt'
            );
            expect(result).toBe(
                'Error: Unable to load geography summary. Run data generation first.'
            );
        });
    });
});
