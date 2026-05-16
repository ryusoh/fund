import { getGeographySummaryText } from '../../../../../js/transactions/terminal/handlers/geographySummary.js';
import { logger } from '../../../../../js/utils/logger.js';

jest.mock('../../../../../js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn()
    }
}));

describe('getGeographySummaryText', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        global.fetch = jest.fn();
        jest.clearAllMocks();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('returns text on successful fetch', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue('geography data')
        });

        const result = await getGeographySummaryText();
        expect(global.fetch).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
        expect(result).toBe('geography data');
    });

    it('returns error message on non-ok response', async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            status: 404
        });

        const result = await getGeographySummaryText();
        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', expect.any(Error));
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
    });

    it('returns error message on network failure', async () => {
        global.fetch.mockRejectedValue(new Error('Network error'));

        const result = await getGeographySummaryText();
        expect(logger.warn).toHaveBeenCalledWith('Caught exception:', expect.any(Error));
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
    });
});
