import {
    renderAsciiTable,
    formatNumeric,
    formatNumericPair,
    formatMarketCap,
    formatPercentageValue,
    formatPrice,
    format52WeekRange,
    formatVolume,
} from './formatting.js';

let analysisIndexCache = null;
const analysisDetailCache = new Map();
const ANALYSIS_FETCH_BUSTER = Date.now();

function withCacheBust(url) {
    if (!url) {
        return url;
    }
    return url.includes('?')
        ? `${url}&t=${ANALYSIS_FETCH_BUSTER}`
        : `${url}?t=${ANALYSIS_FETCH_BUSTER}`;
}

function resolveEvToEbitda(market = {}) {
    const directValue = Number(market.evToEbitda);
    if (Number.isFinite(directValue)) {
        return formatNumeric(directValue, 2);
    }
    const enterpriseValue = Number(market.enterpriseValue);
    const ebitda = Number(market.ebitda);
    if (Number.isFinite(enterpriseValue) && Number.isFinite(ebitda) && ebitda !== 0) {
        return formatNumeric(enterpriseValue / ebitda, 2);
    }
    return '–';
}

async function loadAnalysisIndex() {
    if (analysisIndexCache) {
        return analysisIndexCache;
    }
    const response = await fetch(withCacheBust('../data/analysis/index.json'));
    if (!response.ok) {
        throw new Error('Failed to load analysis index');
    }
    analysisIndexCache = await response.json();
    return analysisIndexCache;
}

async function loadAnalysisDetails(path) {
    if (!path) {
        return null;
    }
    if (analysisDetailCache.has(path)) {
        return analysisDetailCache.get(path);
    }
    const response = await fetch(withCacheBust(path));
    if (!response.ok) {
        throw new Error(`Failed to load analysis details for ${path}`);
    }
    const payload = await response.json();
    analysisDetailCache.set(path, payload);
    return payload;
}

export async function getFinancialStatsText() {
    try {
        const indexData = await loadAnalysisIndex();
        const tickers = Array.isArray(indexData?.tickers) ? indexData.tickers : [];
        if (!tickers.length) {
            return 'No financial data available for holdings.';
        }

        const rows = await Promise.all(
            tickers.map(async (entry) => {
                try {
                    const { symbol: entrySymbol, path } = entry || {};
                    const detail = await loadAnalysisDetails(path);
                    if (!detail || !detail.market) {
                        return null;
                    }
                    const market = detail.market;
                    const currency =
                        typeof market.currency === 'string' && market.currency.trim()
                            ? market.currency.trim().toUpperCase()
                            : 'USD';

                    return [
                        detail.symbol || entrySymbol || '—',
                        formatNumericPair(market.eps, market.forwardEps, 2),
                        formatNumericPair(market.pe, market.forwardPe, 2),
                        formatNumeric(market.pegRatio, 2),
                        resolveEvToEbitda(market),
                        formatMarketCap(market.enterpriseValue, currency),
                        formatMarketCap(market.ebitda, currency),
                        formatPercentageValue(market.dividendYield, { digits: 2, mode: 'percent' }),
                        formatMarketCap(market.marketCap, currency),
                    ];
                } catch {
                    return null;
                }
            })
        );

        const normalizedRows = rows.filter((row) => Array.isArray(row));
        if (!normalizedRows.length) {
            return 'No financial data available for holdings.';
        }

        const table = renderAsciiTable({
            title: 'FINANCIAL SNAPSHOT',
            headers: [
                'Ticker',
                'EPS (Fwd)',
                'P/E (Fwd)',
                'PEG',
                'EV/EBITDA',
                'EV',
                'EBITDA',
                'Div%',
                'Market Cap',
            ],
            rows: normalizedRows,
            alignments: [
                'left',
                'right',
                'right',
                'right',
                'right',
                'right',
                'right',
                'right',
                'right',
            ],
        });

        return `
${table}
`;
    } catch {
        return 'Error loading financial analysis data.';
    }
}

export async function getTechnicalStatsText() {
    try {
        const indexData = await loadAnalysisIndex();
        const tickers = Array.isArray(indexData?.tickers) ? indexData.tickers : [];
        if (!tickers.length) {
            return 'No technical data available for holdings.';
        }

        const rows = await Promise.all(
            tickers.map(async (entry) => {
                try {
                    const { symbol: entrySymbol, path } = entry || {};
                    const detail = await loadAnalysisDetails(path);
                    if (!detail || !detail.market) {
                        return null;
                    }
                    const market = detail.market;
                    const currency =
                        typeof market.currency === 'string' && market.currency.trim()
                            ? market.currency.trim().toUpperCase()
                            : 'USD';

                    return [
                        detail.symbol || entrySymbol || '—',
                        formatPrice(market.price, currency),
                        format52WeekRange(
                            market.fiftyTwoWeekLow,
                            market.fiftyTwoWeekHigh,
                            currency
                        ),
                        formatPrice(market.fiftyDayAverage, currency),
                        formatPrice(market.twoHundredDayAverage, currency),
                        formatVolume(market.averageVolume),
                        formatVolume(market.averageDailyVolume10Day),
                        formatNumeric(market.beta, 2),
                        formatPercentageValue(market.volatility, { digits: 2, mode: 'fraction' }),
                    ];
                } catch {
                    return null;
                }
            })
        );

        const normalizedRows = rows.filter((row) => Array.isArray(row));
        if (!normalizedRows.length) {
            return 'No technical data available for holdings.';
        }

        const table = renderAsciiTable({
            title: 'TECHNICAL SNAPSHOT',
            headers: [
                'Ticker',
                'Price',
                '52W Range',
                '50D Avg',
                '200D Avg',
                'Avg Vol',
                '10D Vol',
                'Beta',
                'Vol%',
            ],
            rows: normalizedRows,
            alignments: [
                'left',
                'right',
                'right',
                'right',
                'right',
                'right',
                'right',
                'right',
                'right',
            ],
        });

        return `
${table}
`;
    } catch {
        return 'Error loading technical analysis data.';
    }
}
