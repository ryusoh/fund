import { getGeographySummaryText } from '@js/transactions/terminal/handlers/geographySummary.js';
import { logger } from '@js/utils/logger.js';

jest.mock('@js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
    },
}));

describe('getGeographySummaryText', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should fetch and return geography summary text on success', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                text: () => Promise.resolve('Mocked geography summary'),
            })
        );

        const result = await getGeographySummaryText();
        expect(result).toBe('Mocked geography summary');
        expect(global.fetch).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
    });

    it('should handle non-ok response', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: false,
                status: 404,
            })
        );

        const result = await getGeographySummaryText();
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', expect.any(Error));
    });

    it('should handle fetch exception', async () => {
        const error = new Error('Network error');
        global.fetch = jest.fn(() => Promise.reject(error));

        const result = await getGeographySummaryText();
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', error);
    });
});
