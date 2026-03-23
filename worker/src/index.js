const ALPACA_SNAPSHOTS_URL = 'https://data.alpaca.markets/v2/stocks/snapshots';
const ALLOWED_ORIGIN = 'https://fund.lyeutsaon.com';

// TTL in seconds per trading session
const TTL = {
    regular: 60, // 09:30–16:00 ET Mon–Fri
    extended: 300, // 04:00–09:30 and 16:00–20:00 ET Mon–Fri
    closed: 3600, // overnight and weekends
};

// Returns 'regular', 'extended', or 'closed'
function getTradingSession() {
    const now = new Date();
    const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    const day = et.getDay(); // 0=Sun, 6=Sat
    const t = et.getHours() * 60 + et.getMinutes();
    if (day === 6) {
        return 'closed';
    }
    // Sunday: Alpaca overnight session starts at 20:00 ET (beginning of Monday's week)
    if (day === 0) {
        return t >= 20 * 60 ? 'extended' : 'closed';
    }
    if (t >= 9 * 60 + 30 && t < 16 * 60) {
        return 'regular';
    }
    if (t >= 4 * 60 && t < 20 * 60) {
        return 'extended';
    }
    return 'closed';
}

export { getTradingSession };

function corsHeaders(origin) {
    const allowed =
        origin === ALLOWED_ORIGIN ||
        (origin && origin.endsWith('.lyeutsaon.com')) ||
        origin === 'https://fund.zhuangliulz.workers.dev';
    return {
        'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
    };
}

function jsonResponse(data, status, origin, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
            ...extraHeaders,
        },
    });
}

async function fetchFromAlpaca(symbols, env) {
    const url = `${ALPACA_SNAPSHOTS_URL}?symbols=${encodeURIComponent(symbols.join(','))}`;
    const credentials = btoa(`${env.ALPACA_API_KEY}:${env.ALPACA_API_SECRET}`);
    const response = await fetch(url, {
        headers: {
            Authorization: `Basic ${credentials}`,
            Accept: 'application/json',
        },
    });
    if (!response.ok) {
        throw new Error(`Alpaca API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    // Transform { snapshots: { VT: { latestTrade: { p: 139.49, ... }, ... }, ... } }
    // into { VT: 139.49, ... }
    const snapshots = data.snapshots ?? data; // API may return object directly
    const prices = {};
    for (const [ticker, snapshot] of Object.entries(snapshots)) {
        const price = snapshot?.latestTrade?.p ?? snapshot?.minuteBar?.c ?? null;
        if (price !== null) {
            prices[ticker] = price;
        }
    }
    return prices;
}

async function fetchFromYahoo(symbols) {
    // Yahoo Finance v7 quote endpoint — same source yfinance uses
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            Accept: 'application/json',
        },
    });
    if (!response.ok) {
        throw new Error(`Yahoo Finance API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const results = data?.quoteResponse?.result ?? [];
    if (results.length === 0) {
        throw new Error('Yahoo Finance returned no results');
    }
    const prices = {};
    for (const quote of results) {
        const price = quote?.regularMarketPrice ?? null;
        if (quote?.symbol && price !== null) {
            prices[quote.symbol] = price;
        }
    }
    return prices;
}

export default {
    async fetch(request, env, ctx) {
        const origin = request.headers.get('Origin') ?? '';

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        if (request.method !== 'GET') {
            return jsonResponse({ error: 'Method not allowed' }, 405, origin);
        }

        const url = new URL(request.url);
        if (url.pathname !== '/prices') {
            return jsonResponse({ error: 'Not found' }, 404, origin);
        }

        const symbolsParam = url.searchParams.get('symbols');
        if (!symbolsParam) {
            return jsonResponse({ error: 'Missing required query param: symbols' }, 400, origin);
        }

        // Normalise and deduplicate symbols
        const symbols = [
            ...new Set(
                symbolsParam
                    .split(',')
                    .map((s) => s.trim().toUpperCase())
                    .filter(Boolean)
            ),
        ];
        if (symbols.length === 0) {
            return jsonResponse({ error: 'No valid symbols provided' }, 400, origin);
        }

        const cacheKey = `prices:${symbols.sort().join(',')}`;
        const ttl = TTL[getTradingSession()];

        // 1. Try KV cache
        const cached = await env.PRICE_CACHE.get(cacheKey, { type: 'json' });
        if (cached) {
            return jsonResponse(cached, 200, origin, { 'X-Cache': 'HIT' });
        }

        // 2. Fetch from Alpaca, fall back to Yahoo Finance
        let prices;
        try {
            prices = await fetchFromAlpaca(symbols, env);
        } catch {
            try {
                prices = await fetchFromYahoo(symbols);
            } catch (yahooErr) {
                // 3. Both sources failed — serve last-known-good value (stale-on-error)
                const stale = await env.PRICE_CACHE.get(`${cacheKey}:lkg`, { type: 'json' });
                if (stale) {
                    return jsonResponse(stale, 200, origin, { 'X-Cache': 'STALE' });
                }
                return jsonResponse(
                    { error: 'Failed to fetch prices', detail: yahooErr.message },
                    502,
                    origin
                );
            }
        }

        // 4. Write to KV after response is sent
        const pricesJson = JSON.stringify(prices);
        const lkgKey = `${cacheKey}:lkg`;
        ctx.waitUntil(
            Promise.all([
                // Short-lived cache entry (respects market-hours TTL)
                env.PRICE_CACHE.put(cacheKey, pricesJson, { expirationTtl: ttl }),
                // Last-known-good: only write when expired (1h TTL) — at most 24 writes/key/day
                env.PRICE_CACHE.get(lkgKey).then((existing) => {
                    if (!existing) {
                        return env.PRICE_CACHE.put(lkgKey, pricesJson, { expirationTtl: 3600 });
                    }
                }),
            ])
        );

        return jsonResponse(prices, 200, origin, { 'X-Cache': 'MISS' });
    },
};
