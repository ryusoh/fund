import { getGeographySummaryText } from '../../../../../js/transactions/terminal/handlers/geographySummary.js';
import { logger } from '../../../../../js/utils/logger.js';

jest.mock('../../../../../js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn(),
    },
}));

describe('getGeographySummaryText', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        jest.clearAllMocks();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('returns text on successful fetch', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue('Geography summary content'),
        });

        const result = await getGeographySummaryText();
        expect(result).toBe('Geography summary content');
        expect(global.fetch).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
    });

    it('returns error message and logs warning on non-ok response', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });

        const result = await getGeographySummaryText();
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(logger.warn).toHaveBeenCalledWith(
            'Geography summary processing failed:',
            expect.any(Error)
        );
    });

    it('returns error message and logs warning on fetch error', async () => {
        const error = new Error('Network timeout');
        global.fetch = jest.fn().mockRejectedValue(error);

        const result = await getGeographySummaryText();
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(logger.warn).toHaveBeenCalledWith('Geography summary processing failed:', error);
    });
});
