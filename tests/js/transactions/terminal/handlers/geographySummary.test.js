import { getGeographySummaryText } from '../../../../../js/transactions/terminal/handlers/geographySummary.js';
import { logger } from '../../../../../js/utils/logger.js';

jest.mock('../../../../../js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
    },
}));

describe('geographySummary handler', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        global.fetch = jest.fn();
        jest.clearAllMocks();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('returns text when fetch is successful', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValue('Mocked Geography Summary'),
        });

        const result = await getGeographySummaryText();

        expect(global.fetch).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
        expect(result).toBe('Mocked Geography Summary');
    });

    it('throws error and returns error message when fetch is not ok', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
        });

        const result = await getGeographySummaryText();

        expect(global.fetch).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', expect.any(Error));
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
    });

    it('throws error and returns error message when fetch throws an exception', async () => {
        const error = new Error('Network error');
        global.fetch.mockRejectedValueOnce(error);

        const result = await getGeographySummaryText();

        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', error);
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
    });
});
