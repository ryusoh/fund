import { getGeographySummaryText } from '@js/transactions/terminal/handlers/geographySummary.js';
import { logger } from '@js/utils/logger.js';

jest.mock('@js/utils/logger.js', () => ({
    logger: { warn: jest.fn() },
}));

describe('geographySummary handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns summary text on success', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                text: () => Promise.resolve('Geography Summary'),
            })
        );
        const result = await getGeographySummaryText();
        expect(result).toBe('Geography Summary');
    });

    it('returns error text on fetch failure', async () => {
        global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404 }));
        const result = await getGeographySummaryText();
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(logger.warn).toHaveBeenCalled();
    });

    it('returns error text on exception', async () => {
        global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
        const result = await getGeographySummaryText();
        expect(result).toBe('Error: Unable to load geography summary. Run data generation first.');
        expect(logger.warn).toHaveBeenCalled();
    });
});
