import { getGeographySummaryText } from '../../../../../js/transactions/terminal/handlers/geographySummary.js';
import { logger } from '../../../../../js/utils/logger.js';

jest.mock('../../../../../js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn()
    }
}));

describe('getGeographySummaryText', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        jest.clearAllMocks();
    });

    it('returns text on successful fetch', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            text: async () => 'Mock Geography Summary'
        });

        const result = await getGeographySummaryText();

        expect(result).toBe('Mock Geography Summary');
        expect(global.fetch).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('throws error and returns fallback on non-ok fetch', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404
        });

        const result = await getGeographySummaryText();

        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', expect.any(Error));
        expect(logger.warn.mock.calls[0][1].message).toBe('Failed to fetch geography summary: 404');
    });

    it('catches network exceptions and returns fallback', async () => {
        const error = new Error('Network failure');
        global.fetch.mockRejectedValueOnce(error);

        const result = await getGeographySummaryText();

        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', error);
    });
});
