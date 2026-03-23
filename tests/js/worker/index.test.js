import worker, { getTradingSession } from '../../../worker/src/index.js';

global.fetch = jest.fn();
global.btoa = global.btoa ?? ((s) => Buffer.from(s).toString('base64'));

// Minimal Request/Response polyfills for the Worker test environment
class MockHeaders {
    constructor(init = {}) {
        this._map = {};
        for (const [k, v] of Object.entries(init)) {
            this._map[k.toLowerCase()] = v;
        }
    }
    get(name) {
        return this._map[name.toLowerCase()] ?? null;
    }
    set(name, value) {
        this._map[name.toLowerCase()] = value;
    }
    entries() {
        return Object.entries(this._map);
    }
}

if (!global.Request) {
    global.Request = class Request {
        constructor(url, init = {}) {
            this.url = url;
            this.method = (init.method ?? 'GET').toUpperCase();
            this.headers = new MockHeaders(init.headers ?? {});
        }
    };
}

if (!global.Response) {
    global.Response = class Response {
        constructor(body, init = {}) {
            this._body = body;
            this.status = init.status ?? 200;
            this.headers = new MockHeaders(init.headers ?? {});
        }
        async json() {
            return JSON.parse(this._body);
        }
        async text() {
            return this._body;
        }
    };
}

function makeRequest(
    path = '/prices',
    params = {},
    method = 'GET',
    origin = 'https://fund.lyeutsaon.com'
) {
    const url = new URL(`https://api.lyeutsaon.com${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    return new Request(url.toString(), {
        method,
        headers: { Origin: origin },
    });
}

function makeEnv({ cached = null, lkg = null } = {}) {
    return {
        ALPACA_API_KEY: 'test-key',
        ALPACA_API_SECRET: 'test-secret',
        PRICE_CACHE: {
            get: jest.fn(async (key) => {
                if (key.endsWith(':lkg')) {
                    return lkg;
                }
                return cached;
            }),
            put: jest.fn(async () => {}),
        },
    };
}

function alpacaResponse(prices) {
    const snapshots = {};
    for (const [ticker, price] of Object.entries(prices)) {
        snapshots[ticker] = { latestTrade: { p: price } };
    }
    return { ok: true, json: async () => ({ snapshots }) };
}

function yahooResponse(prices) {
    const result = Object.entries(prices).map(([symbol, regularMarketPrice]) => ({
        symbol,
        regularMarketPrice,
    }));
    return { ok: true, json: async () => ({ quoteResponse: { result } }) };
}

describe('Cloudflare Worker — /prices', () => {
    beforeEach(() => {
        fetch.mockReset();
    });

    it('returns 404 for unknown paths', async () => {
        const res = await worker.fetch(makeRequest('/unknown'), makeEnv());
        expect(res.status).toBe(404);
    });

    it('returns 405 for non-GET methods', async () => {
        const res = await worker.fetch(makeRequest('/prices', {}, 'POST'), makeEnv());
        expect(res.status).toBe(405);
    });

    it('returns 400 when symbols param is missing', async () => {
        const res = await worker.fetch(makeRequest('/prices'), makeEnv());
        expect(res.status).toBe(400);
    });

    it('handles CORS preflight', async () => {
        const req = new Request('https://api.lyeutsaon.com/prices', {
            method: 'OPTIONS',
            headers: { Origin: 'https://fund.lyeutsaon.com' },
        });
        const res = await worker.fetch(req, makeEnv());
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://fund.lyeutsaon.com');
    });

    it('returns cached result on KV hit', async () => {
        const cached = { VT: 139.49 };
        const res = await worker.fetch(
            makeRequest('/prices', { symbols: 'VT' }),
            makeEnv({ cached })
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('X-Cache')).toBe('HIT');
        expect(await res.json()).toEqual(cached);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('fetches from Alpaca on KV miss and caches result', async () => {
        const prices = { VT: 139.49, ANET: 136.99 };
        fetch.mockResolvedValueOnce(alpacaResponse(prices));

        const env = makeEnv();
        const res = await worker.fetch(makeRequest('/prices', { symbols: 'VT,ANET' }), env);

        expect(res.status).toBe(200);
        expect(res.headers.get('X-Cache')).toBe('MISS');
        expect(await res.json()).toEqual(prices);
        expect(env.PRICE_CACHE.put).toHaveBeenCalled();
    });

    it('falls back to Yahoo Finance when Alpaca fails', async () => {
        const prices = { VT: 138.0 };
        fetch
            .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
            .mockResolvedValueOnce(yahooResponse(prices));

        const res = await worker.fetch(makeRequest('/prices', { symbols: 'VT' }), makeEnv());

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(prices);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('serves stale KV when both Alpaca and Yahoo fail', async () => {
        const stale = { VT: 135.0 };
        fetch
            .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Down' })
            .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Down' });

        const res = await worker.fetch(
            makeRequest('/prices', { symbols: 'VT' }),
            makeEnv({ lkg: stale })
        );

        expect(res.status).toBe(200);
        expect(res.headers.get('X-Cache')).toBe('STALE');
        expect(await res.json()).toEqual(stale);
    });

    it('returns 502 when all sources fail and no stale cache exists', async () => {
        fetch
            .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Down' })
            .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Down' });

        const res = await worker.fetch(makeRequest('/prices', { symbols: 'VT' }), makeEnv());

        expect(res.status).toBe(502);
    });

    it('normalises and deduplicates symbols', async () => {
        const prices = { VT: 139.49 };
        fetch.mockResolvedValueOnce(alpacaResponse(prices));

        await worker.fetch(makeRequest('/prices', { symbols: 'vt, VT , vt' }), makeEnv());

        const alpacaUrl = fetch.mock.calls[0][0];
        const params = new URL(alpacaUrl).searchParams.get('symbols');
        expect(params.split(',').filter((s) => s === 'VT').length).toBe(1);
    });
});

describe('getTradingSession', () => {
    // All dates use January (UTC-5, no DST) so ET = UTC - 5h
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const setET = (isoUTC) => jest.setSystemTime(new Date(isoUTC));

    it('returns "regular" during market hours on a weekday', () => {
        setET('2025-01-06T15:00:00Z'); // Monday 10:00 ET
        expect(getTradingSession()).toBe('regular');
    });

    it('returns "extended" during pre-market on a weekday', () => {
        setET('2025-01-06T12:00:00Z'); // Monday 07:00 ET
        expect(getTradingSession()).toBe('extended');
    });

    it('returns "extended" during after-hours on a weekday', () => {
        setET('2025-01-06T22:00:00Z'); // Monday 17:00 ET
        expect(getTradingSession()).toBe('extended');
    });

    it('returns "closed" overnight on a weekday', () => {
        setET('2025-01-06T07:00:00Z'); // Monday 02:00 ET
        expect(getTradingSession()).toBe('closed');
    });

    it('returns "closed" on Saturday', () => {
        setET('2025-01-11T17:00:00Z'); // Saturday 12:00 ET
        expect(getTradingSession()).toBe('closed');
    });

    it('returns "closed" on Sunday before 20:00 ET', () => {
        setET('2025-01-05T17:00:00Z'); // Sunday 12:00 ET
        expect(getTradingSession()).toBe('closed');
    });

    it('returns "extended" on Sunday at 20:00 ET (Alpaca overnight session start)', () => {
        setET('2025-01-06T01:00:00Z'); // Sunday 20:00 ET
        expect(getTradingSession()).toBe('extended');
    });

    it('returns "extended" on Sunday at 23:00 ET', () => {
        setET('2025-01-06T04:00:00Z'); // Sunday 23:00 ET
        expect(getTradingSession()).toBe('extended');
    });
});
