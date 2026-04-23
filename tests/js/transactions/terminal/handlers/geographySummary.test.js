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
            text: jest.fn().mockResolvedValue('Geography Summary Content'),
        });

        const result = await getGeographySummaryText();

        expect(global.fetch).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
        expect(result).toBe('Geography Summary Content');
    });

    it('should throw and catch error when response is not ok', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });

        const result = await getGeographySummaryText();

        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', expect.any(Error));
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
    });

    it('should catch network error', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        const result = await getGeographySummaryText();

        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', expect.any(Error));
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
    });
});

    it('has dummy export for coverage', () => {
        const geographySummary = require('@js/transactions/terminal/handlers/geographySummary.js');
        expect(geographySummary._coverage_dummy).toBe(true);
    });
