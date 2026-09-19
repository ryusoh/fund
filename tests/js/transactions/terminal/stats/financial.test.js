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

    test('fetches analysis data without timestamp cache-bust', async () => {
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
                    currency: 'USD',
                },
            },
        };

        global.fetch = jest.fn((url) => {
            expect(url).not.toMatch(/[?&]t=\d+/);
            const normalized = url.split('?')[0];
            const payload = fixtures[normalized];
            if (!payload) {
                return Promise.resolve({ ok: false, json: async () => ({}) });
            }
            return mockFetchResponse(payload);
        });

        const { getFinancialStatsText } =
            await import('../../../../../js/transactions/terminal/stats/financial.js');
        const snapshot = await getFinancialStatsText();

        expect(snapshot).toContain('FINANCIAL SNAPSHOT');
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
                    pegRatio: 1.25,
                    evToEbitda: 39.219,
                    enterpriseValue: 210000000000.0,
                    ebitda: 5000000000.0,
                    marketCap: 154086129664.0,
                    dividendYield: 1.25,
                    beta: 1.11,
                    volatility: 0.34,
                    fiftyDayAverage: 118.5,
                    twoHundredDayAverage: 102.25,
                    averageVolume: 1250000,
                    averageDailyVolume10Day: 950000,
                    fiftyTwoWeekHigh: 164.94,
                    fiftyTwoWeekLow: 59.43,
                    marketDataUpdatedAt: '2025-12-18T07:50:20.219405+00:00',
                    currency: 'USD',
                },
            },
        };

        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            const payload = fixtures[normalized];
            if (!payload) {
                return Promise.resolve({ ok: false, json: async () => ({}) });
            }
            return mockFetchResponse(payload);
        });

        const { getFinancialStatsText } =
            await import('../../../../../js/transactions/terminal/stats/financial.js');
        const snapshot = await getFinancialStatsText();

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('../data/analysis/index.json'),
            expect.anything()
        );
        expect(snapshot).toContain('FINANCIAL SNAPSHOT');
        expect(snapshot).toContain('ANET');
        expect(snapshot).toContain('2.63 / 3.36');
        expect(snapshot).toContain('1.25');
        expect(snapshot).toContain('1.25%');
    });

    test('falls back to pe_ratio.json for missing forwardPe (like VT)', async () => {
        const fixtures = {
            '../data/analysis/index.json': {
                tickers: [
                    {
                        symbol: 'VT',
                        name: 'Vanguard Total World Stock ETF',
                        path: '../data/analysis/VT.json',
                    },
                ],
            },
            '../data/analysis/VT.json': {
                symbol: 'VT',
                market: {
                    pe: 18.5,
                    currency: 'USD',
                },
            },
            '../data/output/figures/pe_ratio.json': {
                forward_pe: {
                    ticker_forward_pe: {
                        VT: [16.5, 17.2],
                    },
                },
            },
        };

        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            const payload = fixtures[normalized];
            if (!payload) {
                return Promise.resolve({ ok: false, json: async () => ({}) });
            }
            return mockFetchResponse(payload);
        });

        const { getFinancialStatsText } =
            await import('../../../../../js/transactions/terminal/stats/financial.js');
        const snapshot = await getFinancialStatsText();

        expect(snapshot).toContain('18.50 / 17.20');
    });

    test('renders technical snapshot table from analysis data', async () => {
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
                    beta: 1.11,
                    volatility: 0.34,
                    fiftyTwoWeekHigh: 164.94,
                    fiftyTwoWeekLow: 59.43,
                    fiftyDayAverage: 118.5,
                    twoHundredDayAverage: 102.25,
                    averageVolume: 1250000,
                    averageDailyVolume10Day: 950000,
                    currency: 'USD',
                },
            },
        };

        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            const payload = fixtures[normalized];
            if (!payload) {
                return Promise.resolve({ ok: false, json: async () => ({}) });
            }
            return mockFetchResponse(payload);
        });

        const { getTechnicalStatsText } =
            await import('../../../../../js/transactions/terminal/stats/financial.js');
        const snapshot = await getTechnicalStatsText();

        expect(snapshot).toContain('TECHNICAL SNAPSHOT');
        expect(snapshot).toContain('ANET');
        expect(snapshot).toContain('50D Avg');
        expect(snapshot).toContain('1.11');
    });

    test('handles fetch failures gracefully', async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: false,
                json: async () => ({}),
            })
        );

        const { getFinancialStatsText } =
            await import('../../../../../js/transactions/terminal/stats/financial.js');
        const snapshot = await getFinancialStatsText();

        expect(snapshot).toBe('Error loading financial analysis data.');
    });

    test('handles corrupt detail fetch with empty market payload', async () => {
        const fixtures = {
            '../data/analysis/index.json': {
                tickers: [{ symbol: 'BAD', path: '../data/analysis/BAD.json' }],
            },
            '../data/analysis/BAD.json': {
                symbol: 'BAD',
                market: null, // trigger condition: !detail || !detail.market
            },
        };

        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return mockFetchResponse(fixtures[normalized] || {});
        });

        const { getFinancialStatsText } =
            await import('../../../../../js/transactions/terminal/stats/financial.js');
        const snapshot = await getFinancialStatsText();

        expect(snapshot).toBe('No financial data available for holdings.');
    });

    test('handles corrupted market objects in details returning no financial rows', async () => {
        const fixtures = {
            '../data/analysis/index.json': {
                tickers: [{ symbol: 'ERR', path: '../data/analysis/ERR.json' }],
            },
        };
        // Intentionally throw inside loadAnalysisDetails handling to hit the catch block and return null
        global.fetch = jest.fn((url) => {
            if (url.includes('ERR.json')) {
                return Promise.reject(new Error('Network failure'));
            }
            const normalized = url.split('?')[0];
            return mockFetchResponse(fixtures[normalized] || {});
        });

        const { getFinancialStatsText } =
            await import('../../../../../js/transactions/terminal/stats/financial.js');
        const snapshot = await getFinancialStatsText();

        expect(snapshot).toBe('No financial data available for holdings.');
    });
});


describe('Additional branch coverage and error paths', () => {
    afterEach(() => {
        delete global.fetch;
        jest.resetModules();
    });

    test('getTechnicalStatsText empty tickers (line 199)', async () => {
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ tickers: [] }) }));
        const { getTechnicalStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getTechnicalStatsText();
        expect(res).toBe('No technical data available for holdings.');
    });

    test('getTechnicalStatsText corrupted market object (line 208 and 237)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'ERR', path: '../data/analysis/ERR.json' }] },
            '../data/analysis/ERR.json': { symbol: 'ERR' }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getTechnicalStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getTechnicalStatsText();
        expect(res).toBe('No technical data available for holdings.');
    });

    test('getTechnicalStatsText handles individual row rejection (line 229-230)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'THROW', path: '../data/analysis/THROW.json' }] }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            if (normalized === '../data/analysis/THROW.json') {
                return Promise.reject(new Error('Row error'));
            }
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getTechnicalStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getTechnicalStatsText();
        expect(res).toBe('No technical data available for holdings.');
    });

    test('getTechnicalStatsText handles overall index rejection (line 271-272)', async () => {
        global.fetch = jest.fn(() => Promise.reject(new Error('Global error')));
        const { getTechnicalStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getTechnicalStatsText();
        expect(res).toBe('Error loading technical analysis data.');
    });

    test('getFallbackValue finite check (line 105)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'TEST', path: '../data/analysis/TEST.json' }] },
            '../data/analysis/TEST.json': { market: { currency: 'USD', price: 100 } },
            '../data/output/figures/pe_ratio.json': { forward_pe: { ticker_forward_pe: { TEST: 15.5 } } }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getFinancialStatsText();
        expect(res).toContain('15.50');
    });

    test('resolveEvToEbitda fallback to enterpriseValue / ebitda (line 41)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'TEST', path: '../data/analysis/TEST.json' }] },
            '../data/analysis/TEST.json': {
                symbol: 'TEST',
                market: {
                    currency: 'USD',
                    enterpriseValue: 1000,
                    ebitda: 100,
                    pe: 10
                }
            }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getFinancialStatsText();
        expect(res).toContain('10.00');
    });

    test('loadAnalysisDetails with empty path (line 60)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'NOPATH', path: '' }] }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getFinancialStatsText();
        expect(res).toBe('No financial data available for holdings.');
    });

    test('getFinancialStatsText empty tickers (line 97)', async () => {
        global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ tickers: [] }) }));
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getFinancialStatsText();
        expect(res).toBe('No financial data available for holdings.');
    });

    test('resolveCurrency fallback (line 33) and getFallbackValue internal loop fallback (109-120)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'TEST', path: '../data/analysis/TEST.json' }] },
            '../data/analysis/TEST.json': {
                symbol: 'TEST',
                market: { price: 100 }
            },
            '../data/output/figures/pe_ratio.json': {
                forward_pe: {
                    ticker_forward_pe: {
                        TEST: [null, undefined, 'abc', 42.5]
                    }
                }
            }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getFinancialStatsText();
        expect(res).toContain('42.50');
    });

    test('getFinancialStatsText handling null ticker array and null symbol (lines 95, 129, 136)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: 'not an array' }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getFinancialStatsText();
        expect(res).toBe('No financial data available for holdings.');
    });

    test('getFinancialStatsText handling detail symbol fallback', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'ENTRYSYM', path: '../data/analysis/TEST.json' }] },
            '../data/analysis/TEST.json': { market: { price: 100 } }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getFinancialStatsText();
        expect(res).toContain('ENTRYSYM');
    });

    test('getTechnicalStatsText handling null ticker array and null symbol (lines 197, 205, 214)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: 'not an array' }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getTechnicalStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getTechnicalStatsText();
        expect(res).toBe('No technical data available for holdings.');
    });

    test('getTechnicalStatsText handling detail symbol fallback (line 214)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'TECHSYM', path: '../data/analysis/TEST.json' }] },
            '../data/analysis/TEST.json': { market: { price: 100 } }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getTechnicalStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getTechnicalStatsText();
        expect(res).toContain('TECHSYM');
    });

    test('handling empty ticker entries map', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [null, undefined] }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });

        const { getFinancialStatsText, getTechnicalStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const resFin = await getFinancialStatsText();
        const resTech = await getTechnicalStatsText();
        expect(resFin).toBe('No financial data available for holdings.');
        expect(resTech).toBe('No technical data available for holdings.');
    });

    test('resolveCurrency with empty string (line 33)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'TEST', path: '../data/analysis/TEST.json' }] },
            '../data/analysis/TEST.json': { symbol: 'TEST', market: { currency: '   ', price: 100 } }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getFinancialStatsText();
        expect(res).toContain('FINANCIAL');
    });

    test('getFallbackValue loop condition with non-finite values (line 109)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'TEST', path: '../data/analysis/TEST.json' }] },
            '../data/analysis/TEST.json': { symbol: 'TEST', market: { currency: 'USD', price: 100 } },
            '../data/output/figures/pe_ratio.json': { forward_pe: { ticker_forward_pe: { TEST: ['a', 'b'] } } }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getFinancialStatsText();
        expect(res).toContain('FINANCIAL');
    });

    test('symbol fallback to em dash (lines 136 and 214)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ path: '../data/analysis/TEST.json' }] },
            '../data/analysis/TEST.json': { market: { price: 100 } }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getFinancialStatsText, getTechnicalStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const resFin = await getFinancialStatsText();
        const resTech = await getTechnicalStatsText();
        expect(resFin).toContain('—');
        expect(resTech).toContain('—');
    });

    test('cache usage (lines 48, 63, 78)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'TEST', path: '../data/analysis/TEST.json' }] },
            '../data/analysis/TEST.json': { symbol: 'TEST', market: { currency: 'USD', price: 100 } },
            '../data/output/figures/pe_ratio.json': { forward_pe: { ticker_forward_pe: { TEST: 15.5 } } }
        };
        let fetchCount = 0;
        global.fetch = jest.fn((url) => {
            fetchCount++;
            const normalized = url.split('?')[0];
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');

        // First call populates caches
        await getFinancialStatsText();
        const fetchCountAfterFirstCall = fetchCount;

        // Second call should hit caches
        await getFinancialStatsText();

        // The caches are module level singletons so no new fetch should happen
        expect(fetchCount).toBe(fetchCountAfterFirstCall);
    });

    test('handles exception loading PE ratio data (line 87)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'TEST', path: '../data/analysis/TEST.json' }] },
            '../data/analysis/TEST.json': { symbol: 'TEST', market: { price: 100 } }
        };
        // Reset modules so peRatioCache is null initially
        jest.resetModules();
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            if (normalized === '../data/output/figures/pe_ratio.json') {
                return Promise.reject(new Error('Network error'));
            }
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] });
        });
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getFinancialStatsText();
        expect(res).toContain('FINANCIAL SNAPSHOT');
    });

    test('throws on details fetch failure (line 67)', async () => {
        const fixtures = {
            '../data/analysis/index.json': { tickers: [{ symbol: 'FAIL', path: '../data/analysis/FAIL.json' }] }
        };
        global.fetch = jest.fn((url) => {
            const normalized = url.split('?')[0];
            if (normalized === '../data/analysis/FAIL.json') {
                return Promise.resolve({ ok: false });
            }
            return Promise.resolve({ ok: true, json: async () => fixtures[normalized] || {} });
        });
        const { getFinancialStatsText } = await import('../../../../../js/transactions/terminal/stats/financial.js');
        const res = await getFinancialStatsText();
        expect(res).toBe('No financial data available for holdings.');
    });
});
