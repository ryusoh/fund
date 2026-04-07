import { jest } from '@jest/globals';

jest.mock('@js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
    },
}));

describe('getGeographySummaryText', () => {
    let getGeographySummaryText;
    let originalFetch;
    let loggerWarnMock;

    beforeEach(async () => {
        jest.clearAllMocks();
        originalFetch = global.fetch;
        const module = await import('@js/utils/logger.js');
        loggerWarnMock = module.logger.warn;

        const geoModule = await import('@js/transactions/terminal/handlers/geographySummary.js');
        getGeographySummaryText = geoModule.getGeographySummaryText;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    test('returns text on success', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                text: () => Promise.resolve('Geography Summary Data'),
            })
        );
        const result = await getGeographySummaryText();
        expect(result).toBe('Geography Summary Data');
        expect(global.fetch).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
    });

    test('throws and returns error on non-ok response', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: false,
                status: 404,
            })
        );
        const result = await getGeographySummaryText();
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(loggerWarnMock).toHaveBeenCalled();
        expect(loggerWarnMock.mock.calls[0][0]).toBe('Caught exception:');
        expect(loggerWarnMock.mock.calls[0][1].message).toBe('Failed to fetch geography summary: 404');
    });

    test('returns error on exception', async () => {
        const error = new Error('Network error');
        global.fetch = jest.fn(() => Promise.reject(error));
        const result = await getGeographySummaryText();
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(loggerWarnMock).toHaveBeenCalledWith('Caught exception:', error);
    });
});
