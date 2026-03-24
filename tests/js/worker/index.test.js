/**
 * @jest-environment node
 */

/**
 * Tests for worker/src/index.js
 *
 * Covers:
 *  - Yahoo fallback extended-hours price selection (post/pre vs regular)
 *  - Alpaca uses feed=overnight during overnight window, no feed param otherwise
 *  - KV cache hit / miss
 *  - Error handling
 */

import worker from '../../../worker/src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHED_CRUMB = JSON.stringify({ crumb: 'test-crumb', cookie: 'A=B' });

function makeEnv({ cacheGet = null } = {}) {
    return {
        ALPACA_API_KEY: 'test-key',
        ALPACA_API_SECRET: 'test-secret',
        PRICE_CACHE: {
            get: jest.fn().mockImplementation((key) => {
                // Return a pre-seeded crumb so Yahoo Finance tests don't need to mock
                // the fc.yahoo.com + getcrumb round-trip.
                if (key === 'yahoo:crumb:v1') {
                    return Promise.resolve(CACHED_CRUMB);
                }
                return Promise.resolve(cacheGet);
            }),
            put: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
        },
    };
}

const makeCtx = () => ({ waitUntil: jest.fn() });

const makeReq = (symbols = 'VT', origin = 'https://fund.lyeutsaon.com') =>
    new Request(`https://api.lyeutsaon.com/prices?symbols=${symbols}`, {
        headers: { Origin: origin },
    });

const alpacaOk = (prices) => ({
    ok: true,
    json: async () => ({
        snapshots: Object.fromEntries(
            Object.entries(prices).map(([sym, p]) => [sym, { latestTrade: { p } }])
        ),
    }),
});

const alpacaFail = (status = 403) => ({ ok: false, status, statusText: 'Error' });

const yahooOk = (quotes) => ({
    ok: true,
    json: async () => ({ quoteResponse: { result: quotes } }),
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockFetch;
beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    jest.restoreAllMocks();
    // Default to regular market hours so tests are not sensitive to when they run.
    // Individual tests that check time-dependent behaviour override this spy.
    jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('3/23/2026, 2:00:00 PM');
});

// ---------------------------------------------------------------------------
// Yahoo Finance — extended-hours price selection
// ---------------------------------------------------------------------------

describe('Yahoo Finance extended-hours price selection', () => {
    // Alpaca always fails in these tests so Yahoo is used as the fallback
    async function priceViaYahoo(quote) {
        mockFetch.mockResolvedValueOnce(alpacaFail()).mockResolvedValueOnce(yahooOk([quote]));
        const res = await worker.fetch(makeReq('VT'), makeEnv(), makeCtx());
        return (await res.json()).VT;
    }

    it('uses postMarketPrice when newer than regularMarketTime', async () => {
        const price = await priceViaYahoo({
            symbol: 'VT',
            regularMarketPrice: 100.0,
            regularMarketTime: 1000,
            postMarketPrice: 105.5,
            postMarketTime: 2000, // newer
        });
        expect(price).toBe(105.5);
    });

    it('uses preMarketPrice when newer than regularMarketTime', async () => {
        const price = await priceViaYahoo({
            symbol: 'VT',
            regularMarketPrice: 100.0,
            regularMarketTime: 1000,
            preMarketPrice: 98.0,
            preMarketTime: 2000, // newer
            postMarketPrice: 97.0,
            postMarketTime: 500, // older — ignored
        });
        expect(price).toBe(98.0);
    });

    it('uses regularMarketPrice when no extended-hours data is fresher', async () => {
        const price = await priceViaYahoo({
            symbol: 'VT',
            regularMarketPrice: 100.0,
            regularMarketTime: 3000,
            postMarketPrice: 102.0,
            postMarketTime: 1000,
            preMarketPrice: 99.0,
            preMarketTime: 500,
        });
        expect(price).toBe(100.0);
    });

    it('uses regularMarketPrice when extended-hours fields are absent', async () => {
        const price = await priceViaYahoo({
            symbol: 'VT',
            regularMarketPrice: 100.0,
            regularMarketTime: 1000,
        });
        expect(price).toBe(100.0);
    });

    it('does not prefer postMarketPrice when timestamp equals regularMarketTime', async () => {
        const price = await priceViaYahoo({
            symbol: 'VT',
            regularMarketPrice: 100.0,
            regularMarketTime: 1000,
            postMarketPrice: 105.0,
            postMarketTime: 1000, // equal — not strictly newer
        });
        expect(price).toBe(100.0);
    });
});

// ---------------------------------------------------------------------------
// Alpaca — feed parameter
// ---------------------------------------------------------------------------

describe('Alpaca feed parameter', () => {
    it('adds feed=overnight during overnight hours (20:00–04:00 ET)', async () => {
        jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('3/23/2026, 10:00:00 PM');
        mockFetch.mockResolvedValueOnce(alpacaOk({ VT: 139.49 }));

        await worker.fetch(makeReq('VT'), makeEnv(), makeCtx());

        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('feed=overnight');
    });

    it('omits feed param during regular market hours', async () => {
        jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('3/23/2026, 2:00:00 PM');
        mockFetch.mockResolvedValueOnce(alpacaOk({ VT: 139.49 }));

        await worker.fetch(makeReq('VT'), makeEnv(), makeCtx());

        const url = mockFetch.mock.calls[0][0];
        expect(url).not.toContain('feed=');
    });

    it('skips Alpaca entirely during pre-market (07:00 ET) and calls Yahoo Finance', async () => {
        jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('3/23/2026, 7:00:00 AM');
        // Only one fetch call expected — Yahoo Finance, not Alpaca
        mockFetch.mockResolvedValueOnce(
            yahooOk([
                {
                    symbol: 'VT',
                    regularMarketPrice: 139.49,
                    regularMarketTime: 1000,
                    preMarketPrice: 140.0,
                    preMarketTime: 2000,
                },
            ])
        );

        const res = await worker.fetch(makeReq('VT'), makeEnv(), makeCtx());

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('yahoo.com');
        expect(url).toContain('crumb=');
        expect((await res.json()).VT).toBe(140.0); // fresh pre-market price
    });

    it('skips Alpaca entirely during post-market (17:00 ET) and calls Yahoo Finance', async () => {
        jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('3/23/2026, 5:00:00 PM');
        mockFetch.mockResolvedValueOnce(
            yahooOk([
                {
                    symbol: 'VT',
                    regularMarketPrice: 139.49,
                    regularMarketTime: 1000,
                    postMarketPrice: 141.0,
                    postMarketTime: 2000,
                },
            ])
        );

        const res = await worker.fetch(makeReq('VT'), makeEnv(), makeCtx());

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('yahoo.com');
        expect(url).toContain('crumb=');
        expect((await res.json()).VT).toBe(141.0); // fresh post-market price
    });

    it('uses latestTrade.p as the price from Alpaca', async () => {
        mockFetch.mockResolvedValueOnce(alpacaOk({ VT: 139.49 }));

        const res = await worker.fetch(makeReq('VT'), makeEnv(), makeCtx());
        expect((await res.json()).VT).toBe(139.49);
    });

    it('authenticates with APCA header auth, not Basic auth', async () => {
        mockFetch.mockResolvedValueOnce(alpacaOk({ VT: 139.49 }));

        await worker.fetch(makeReq('VT'), makeEnv(), makeCtx());

        const [, options] = mockFetch.mock.calls[0];
        expect(options.headers['APCA-API-KEY-ID']).toBe('test-key');
        expect(options.headers['APCA-API-SECRET-KEY']).toBe('test-secret');
        expect(options.headers['Authorization']).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// KV cache
// ---------------------------------------------------------------------------

describe('KV cache', () => {
    it('returns cached price and skips fetch on cache hit', async () => {
        const cached = { VT: 139.49 };
        const res = await worker.fetch(makeReq('VT'), makeEnv({ cacheGet: cached }), makeCtx());

        expect(mockFetch).not.toHaveBeenCalled();
        expect(await res.json()).toEqual(cached);
        expect(res.headers.get('X-Cache')).toBe('HIT');
    });

    it('calls Alpaca and writes KV on cache miss', async () => {
        mockFetch.mockResolvedValueOnce(alpacaOk({ VT: 139.49 }));
        const ctx = makeCtx();

        const res = await worker.fetch(makeReq('VT'), makeEnv(), ctx);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(res.headers.get('X-Cache')).toBe('MISS');
        expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
    it('returns 502 when both Alpaca and Yahoo fail and no stale cache', async () => {
        mockFetch
            .mockResolvedValueOnce(alpacaFail())
            .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' });

        const res = await worker.fetch(makeReq('VT'), makeEnv(), makeCtx());
        expect(res.status).toBe(502);
    });

    it('returns 400 when symbols param is missing', async () => {
        const req = new Request('https://api.lyeutsaon.com/prices');
        const res = await worker.fetch(req, makeEnv(), makeCtx());
        expect(res.status).toBe(400);
    });

    it('returns 404 for unknown path', async () => {
        const req = new Request('https://api.lyeutsaon.com/unknown');
        const res = await worker.fetch(req, makeEnv(), makeCtx());
        expect(res.status).toBe(404);
    });
});
