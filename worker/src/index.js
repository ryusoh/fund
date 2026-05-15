const ALPACA_SNAPSHOTS_URL = 'https://data.alpaca.markets/v2/stocks/snapshots';
const ALLOWED_ORIGIN = 'https://fund.lyeutsaon.com';

function scrubSecrets(text, secrets) {
    let scrubbed = String(text);
    for (const secret of secrets) {
        if (secret) {
            scrubbed = scrubbed.split(secret).join('***');
            scrubbed = scrubbed.split(encodeURIComponent(secret)).join('***');
            // Also scrub form-encoded variants (spaces as +)
            const formEncoded = encodeURIComponent(secret).replace(/%20/g, '+');
            scrubbed = scrubbed.split(formEncoded).join('***');
        }
    }
    return scrubbed;
}

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
    let isSubdomain = false;
    try {
        if (origin) {
            const url = new URL(origin);
            isSubdomain = url.protocol === 'https:' && url.hostname.endsWith('.lyeutsaon.com');
        }
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Invalid URL:', origin, err);
    }

    const allowed =
        origin === ALLOWED_ORIGIN ||
        isSubdomain ||
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
            'X-Content-Type-Options': 'nosniff',
            ...corsHeaders(origin),
            ...extraHeaders,
        },
    });
}

function isOvernightET() {
    const etString = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const h = new Date(etString).getHours();
    return h >= 20 || h < 4; // 20:00–04:00 ET
}

function _isValidAlpacaTradeDate(snapshot, todayUTC) {
    if (!isOvernightET()) {
        return true;
    }
    const tradeDate = snapshot?.latestTrade?.t
        ? new Date(snapshot.latestTrade.t).toISOString().slice(0, 10)
        : null;
    return tradeDate && tradeDate >= todayUTC;
}

function _processAlpacaSnapshots(snapshots) {
    const todayUTC = new Date().toISOString().slice(0, 10);
    const prices = {};
    for (const [ticker, snapshot] of Object.entries(snapshots)) {
        const price = snapshot?.latestTrade?.p ?? null;
        if (price !== null && _isValidAlpacaTradeDate(snapshot, todayUTC)) {
            prices[ticker] = price;
        }
    }
    return prices;
}

async function fetchFromAlpaca(symbols, env) {
    // During pre/post-market extended hours (04:00–09:30 and 16:00–20:00 ET),
    // the Alpaca free-tier IEX feed only carries regular-session trades.
    // latestTrade.p would be the stale last-close — skip Alpaca so Yahoo Finance
    // can serve fresh preMarketPrice / postMarketPrice instead.
    if (getTradingSession() === 'extended') {
        throw new Error('Alpaca skipped: extended-hours session, using Yahoo Finance');
    }
    const feed = isOvernightET() ? 'overnight' : '';
    const feedParam = feed ? `&feed=${feed}` : '';
    const url = `${ALPACA_SNAPSHOTS_URL}?symbols=${encodeURIComponent(symbols.join(','))}${feedParam}`;
    const response = await fetch(url, {
        headers: {
            'APCA-API-KEY-ID': env.ALPACA_API_KEY,
            'APCA-API-SECRET-KEY': env.ALPACA_API_SECRET,
            Accept: 'application/json',
        },
    });
    if (!response.ok) {
        throw new Error(`Alpaca API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    // Transform { snapshots: { VT: { latestTrade: { p: 139.49, t: '...', ... }, ... }, ... } }
    // into { VT: 139.49, ... }
    // During overnight, skip tickers whose last trade predates today (UTC) — they didn't
    // trade in this overnight session and the caller will fill the gap via Yahoo Finance.
    const snapshots = data.snapshots ?? data; // API may return object directly
    return _processAlpacaSnapshots(snapshots);
}

const YAHOO_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const YAHOO_CRUMB_KV_KEY = 'yahoo:crumb:v1';

// Fetches a Yahoo Finance session cookie + crumb, caching both in KV for 1 hour.
async function getYahooCrumb(env) {
    const cached = await env.PRICE_CACHE.get(YAHOO_CRUMB_KV_KEY);
    if (cached) {
        return JSON.parse(cached);
    }

    // Step 1 — obtain session cookies from the consent/identity endpoint
    const cookieRes = await fetch('https://fc.yahoo.com', {
        headers: { 'User-Agent': YAHOO_UA },
        redirect: 'follow',
    });
    const rawCookie = cookieRes.headers.get('set-cookie') ?? '';
    // Keep only name=value pairs (strip attributes like Path, Domain, …)
    const cookie = rawCookie
        .split(',')
        .map((c) => c.split(';')[0].trim())
        .filter(Boolean)
        .join('; ');

    // Step 2 — exchange the cookie for a crumb
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': YAHOO_UA, Cookie: cookie },
    });
    if (!crumbRes.ok) {
        throw new Error(`Yahoo crumb fetch failed: ${crumbRes.status}`);
    }
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes('<')) {
        throw new Error('Yahoo crumb fetch returned HTML (blocked)');
    }

    const result = { crumb, cookie };
    // Cache for 55 minutes — crumbs are valid for ~1 hour
    await env.PRICE_CACHE.put(YAHOO_CRUMB_KV_KEY, JSON.stringify(result), {
        expirationTtl: 3300,
    });
    return result;
}

function _resolveYahooPrice(quote) {
    if (!quote) {
        return null;
    }

    const regular = quote.regularMarketPrice ?? null;
    const regularTime = quote.regularMarketTime ?? 0;

    if ((quote.postMarketTime ?? 0) > regularTime && quote.postMarketPrice != null) {
        return quote.postMarketPrice;
    }
    if ((quote.preMarketTime ?? 0) > regularTime && quote.preMarketPrice != null) {
        return quote.preMarketPrice;
    }

    return regular;
}

function _parseYahooPrices(results) {
    const prices = {};
    for (const quote of results) {
        const price = _resolveYahooPrice(quote);
        if (quote?.symbol && price !== null) {
            prices[quote.symbol] = price;
        }
    }
    return prices;
}

async function fetchFromYahoo(symbols, env) {
    const { crumb, cookie } = await getYahooCrumb(env);
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&crumb=${encodeURIComponent(crumb)}`;
    const response = await fetch(url, {
        headers: { 'User-Agent': YAHOO_UA, Cookie: cookie, Accept: 'application/json' },
    });
    if (!response.ok) {
        // Crumb may have expired mid-session — evict cache so next request re-fetches
        if (response.status === 401) {
            await env.PRICE_CACHE.delete(YAHOO_CRUMB_KV_KEY);
        }
        throw new Error(`Yahoo Finance API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const results = data?.quoteResponse?.result ?? [];
    if (results.length === 0) {
        throw new Error('Yahoo Finance returned no results');
    }
    return _parseYahooPrices(results);
}

async function _resolvePricesFallback(env, missingFromAlpaca, prices) {
    if (missingFromAlpaca.length > 0) {
        try {
            const yahooPrices = await fetchFromYahoo(missingFromAlpaca, env);
            Object.assign(prices, yahooPrices);
        } catch (yahooErr) {
            const safeYahooMsg = scrubSecrets(yahooErr.message || String(yahooErr), [
                env.ALPACA_API_KEY,
                env.ALPACA_API_SECRET,
            ]);
            // eslint-disable-next-line no-console
            console.error('Error fetching from Yahoo:', safeYahooMsg);
            if (Object.keys(prices).length === 0) {
                return { error: 'Failed to fetch prices', detail: safeYahooMsg };
            }
            // Partial: Alpaca got some tickers, Yahoo failed for the rest — serve what we have
        }
    }
    return prices;
}

function _parseSymbols(symbolsParam) {
    return [
        ...new Set(
            symbolsParam
                .split(',')
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean)
        ),
    ];
}

async function _fetchPricesWithFallback(symbols, env) {
    let prices = {};
    try {
        prices = await fetchFromAlpaca(symbols, env);
    } catch (err) {
        const safeMsg = scrubSecrets(err.message || String(err), [
            env.ALPACA_API_KEY,
            env.ALPACA_API_SECRET,
        ]);
        // eslint-disable-next-line no-console
        console.error('Error fetching from Alpaca:', safeMsg);
        // Alpaca failed or was skipped (extended session) — Yahoo handles everything
    }

    const missingFromAlpaca = symbols.filter((s) => !(s in prices));
    return _resolvePricesFallback(env, missingFromAlpaca, prices);
}

function _validateRequest(request, origin, url) {
    if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }
    if (url.pathname !== '/prices') {
        return jsonResponse({ error: 'Not found' }, 404, origin);
    }
    const symbolsParam = url.searchParams.get('symbols');
    if (!symbolsParam) {
        return jsonResponse({ error: 'Missing required query param: symbols' }, 400, origin);
    }
    return null; // Valid
}

export default {
    async fetch(request, env, ctx) {
        const origin = request.headers.get('Origin') ?? '';

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: { ...corsHeaders(origin), 'X-Content-Type-Options': 'nosniff' },
            });
        }

        const url = new URL(request.url);
        const validationResponse = _validateRequest(request, origin, url);
        if (validationResponse) {
            return validationResponse;
        }

        const symbolsParam = url.searchParams.get('symbols');
        // Normalise and deduplicate symbols
        const symbols = _parseSymbols(symbolsParam);
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

        // 2. Fetch prices: Alpaca first, Yahoo Finance for any gaps
        const resolvedResult = await _fetchPricesWithFallback(symbols, env);

        if (resolvedResult && resolvedResult.error) {
            const stale = await env.PRICE_CACHE.get(`${cacheKey}:lkg`, { type: 'json' });
            if (stale) {
                return jsonResponse(stale, 200, origin, { 'X-Cache': 'STALE' });
            }
            return jsonResponse(resolvedResult, 502, origin);
        }

        const prices = resolvedResult;

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
