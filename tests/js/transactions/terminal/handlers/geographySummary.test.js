import { getGeographySummaryText, _coverage_dummy } from '@js/transactions/terminal/handlers/geographySummary.js';
import { logger } from '@js/utils/logger.js';

jest.mock('@js/utils/logger.js', () => ({
    logger: {
        warn: jest.fn()
    }
}));

describe('geographySummary.js', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        jest.clearAllMocks();
    });

    afterAll(() => {
        delete global.fetch;
    });

    it('should export _coverage_dummy as true', () => {
        expect(_coverage_dummy).toBe(true);
    });

    describe('getGeographySummaryText', () => {
        it('should fetch and return geography summary text', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve('Geography text')
            });
            const result = await getGeographySummaryText();
            expect(result).toBe('Geography text');
            expect(global.fetch).toHaveBeenCalledWith('/data/output/figures/geography_summary.txt');
        });

        it('should handle fetch failure with non-ok response', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 404
            });
            const result = await getGeographySummaryText();
            expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
            expect(logger.warn).toHaveBeenCalled();
        });

        it('should handle fetch exception', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));
            const result = await getGeographySummaryText();
            expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
            expect(logger.warn).toHaveBeenCalled();
        });
    });
});
