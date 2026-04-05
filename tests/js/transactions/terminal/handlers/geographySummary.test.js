import { jest } from '@jest/globals';
import { getGeographySummaryText } from '../../../../../js/transactions/terminal/handlers/geographySummary.js';
import { logger } from '../../../../../js/utils/logger.js';

jest.mock('../../../../../js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
    },
}));

describe('getGeographySummaryText', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        jest.clearAllMocks();
    });

    afterEach(() => {
        delete global.fetch;
    });

    it('should fetch and return text content successfully', async () => {
        const mockText = 'Europe: 40%\nNorth America: 60%';
        global.fetch.mockResolvedValueOnce({
            ok: true,
            text: async () => mockText,
        });

        const result = await getGeographySummaryText();

        expect(global.fetch).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
        expect(result).toBe(mockText);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should handle fetch errors (response not ok)', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
        });

        const result = await getGeographySummaryText();

        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(logger.warn).toHaveBeenCalledWith(
            'Caught exception:',
            expect.any(Error)
        );
        expect(logger.warn.mock.calls[0][1].message).toBe('Failed to fetch geography summary: 404');
    });

    it('should handle network errors', async () => {
        const networkError = new Error('Network error');
        global.fetch.mockRejectedValueOnce(networkError);

        const result = await getGeographySummaryText();

        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', networkError);
    });
});
