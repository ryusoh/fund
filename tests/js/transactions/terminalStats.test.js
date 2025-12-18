import { jest } from '@jest/globals';

function mockFetchResponse(payload) {
    return Promise.resolve({
        ok: true,
        json: async () => payload,
    });
}

describe('getFinancialStatsText', () => {
    afterEach(() => {
        delete global.fetch;
        jest.resetModules();
    });

    test('renders financial snapshot table from analysis data', async () => {
        const fixtures = {
            '../data/analysis/index.json': {
                tickers: [
                    {
                        symbol: 'ANET',
                        name: 'Arista Networks',
                        path: '../data/analysis/ANET.json',
                    },
                ],
            },
            '../data/analysis/ANET.json': {
                symbol: 'ANET',
                market: {
                    price: 122.36,
                    eps: 2.63,
                    forwardEps: 3.3607,
                    pe: 46.5247,
                    forwardPe: 36.4096,
                    evToEbitda: 39.219,
                    marketCap: 154086129664.0,
                    fiftyTwoWeekHigh: 164.94,
                    fiftyTwoWeekLow: 59.43,
                    marketDataUpdatedAt: '2025-12-18T07:50:20.219405+00:00',
                    currency: 'USD',
                },
            },
        };

        global.fetch = jest.fn((url) => {
            const payload = fixtures[url];
            if (!payload) {
                return Promise.resolve({ ok: false, json: async () => ({}) });
            }
            return mockFetchResponse(payload);
        });

        const { getFinancialStatsText } = await import('@js/transactions/terminalStats.js');
        const snapshot = await getFinancialStatsText();

        expect(global.fetch).toHaveBeenCalledWith('../data/analysis/index.json');
        expect(snapshot).toContain('FINANCIAL SNAPSHOT');
        expect(snapshot).toContain('ANET');
        expect(snapshot).toContain('2.63 / 3.36');
    });

    test('handles fetch failures gracefully', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: false,
                json: async () => ({}),
            })
        );

        const { getFinancialStatsText } = await import('@js/transactions/terminalStats.js');
        const snapshot = await getFinancialStatsText();

        expect(snapshot).toBe('Error loading financial analysis data.');
    });
});
