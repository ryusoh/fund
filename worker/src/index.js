const ALPACA_SNAPSHOTS_URL = 'https://data.alpaca.markets/v2/stocks/snapshots';
const ALLOWED_ORIGIN = 'https://fund.lyeutsaon.com';

// Market hours in ET: 09:30–16:00 Mon–Fri
// TTL in seconds during / outside market hours
const MARKET_HOURS_TTL = 60;
const OFF_HOURS_TTL = 3600;

function isMarketHours() {
    const now = new Date();
    // Convert UTC to US/Eastern (UTC-5 standard, UTC-4 daylight)
    // Use a fixed-format locale string trick that works in Workers
    const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etString);
    const day = et.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) {
        return false;
    }
    const hours = et.getHours();
    const minutes = et.getMinutes();
    const timeInMinutes = hours * 60 + minutes;
    return timeInMinutes >= 9 * 60 + 30 && timeInMinutes < 16 * 60;
}

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
    async fetch(request, env) {
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
        const ttl = isMarketHours() ? MARKET_HOURS_TTL : OFF_HOURS_TTL;

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

        // 4. Write to KV (fire-and-forget, don't block response)
        // Short-lived cache entry (respects market-hours TTL)
        env.PRICE_CACHE.put(cacheKey, JSON.stringify(prices), { expirationTtl: ttl });
        // Persistent last-known-good entry (no TTL) for stale-on-error fallback
        env.PRICE_CACHE.put(`${cacheKey}:lkg`, JSON.stringify(prices));

        return jsonResponse(prices, 200, origin, { 'X-Cache': 'MISS' });
    },
};
