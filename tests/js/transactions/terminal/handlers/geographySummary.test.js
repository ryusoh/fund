import { getGeographySummaryText } from '@js/transactions/terminal/handlers/geographySummary.js';
import { logger } from '@js/utils/logger.js';

jest.mock('@js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
    },
}));

describe('getGeographySummaryText', () => {
    afterEach(() => {
        jest.clearAllMocks();
        global.fetch = undefined;
    });

    it('should return fetched text when response is ok', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue('Geography Content'),
        });

        const result = await getGeographySummaryText();

        expect(global.fetch).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
        expect(result).toBe('Geography Content');
    });

    it('should return error message when response is not ok', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });

        const result = await getGeographySummaryText();

        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', new Error('Failed to fetch geography summary: 404'));
    });

    it('should return error message and log when fetch throws', async () => {
        const error = new Error('Network error');
        global.fetch = jest.fn().mockRejectedValue(error);

        const result = await getGeographySummaryText();

        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', error);
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
    });
});
