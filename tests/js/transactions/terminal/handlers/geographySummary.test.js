import { jest } from '@jest/globals';
import { getGeographySummaryText } from '../../../../../js/transactions/terminal/handlers/geographySummary.js';
import { logger } from '../../../../../js/utils/logger.js';

jest.mock('../../../../../js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
    },
}));

describe('getGeographySummaryText', () => {
    let globalFetchSpy;

    beforeEach(() => {
        global.fetch = jest.fn();
        globalFetchSpy = global.fetch;
        jest.clearAllMocks();
    });

    afterEach(() => {
        delete global.fetch;
    });

    it('returns text on successful fetch', async () => {
        globalFetchSpy.mockResolvedValueOnce({
            ok: true,
            text: async () => 'Geography Summary Text',
        });

        const result = await getGeographySummaryText();

        expect(globalFetchSpy).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
        expect(result).toBe('Geography Summary Text');
    });

    it('throws and catches error on failed fetch (not ok)', async () => {
        globalFetchSpy.mockResolvedValueOnce({
            ok: false,
            status: 404,
        });

        const result = await getGeographySummaryText();

        expect(logger.warn).toHaveBeenCalledWith(
            'Caught exception:',
            expect.any(Error)
        );
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
    });

    it('catches network errors', async () => {
        const error = new Error('Network error');
        globalFetchSpy.mockRejectedValueOnce(error);

        const result = await getGeographySummaryText();

        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', error);
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
    });
});
