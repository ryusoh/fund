import { getNyDate, isTradingDay } from '@utils/date.js';
import { formatCurrency } from '@utils/formatting.js';
import { getBlueColorForSlice, hexToRgba } from '@utils/colors.js';
import { updatePieChart } from '@charts/allocationChartManager.js';
import { checkAndToggleVerticalScroll } from '@ui/responsive.js';
import { isLocalhost } from '@utils/host.js';
import {
    HOLDINGS_DETAILS_URL,
    FUND_DATA_URL,
    PREV_CLOSE_URL,
    CF_WORKER_URL,
    COLORS,
    CHART_DEFAULTS,
    PIE_CHART_GLASS_EFFECT,
    TICKER_TO_LOGO_MAP,
    BASE_URL,
} from '@js/config.js';
import { logger } from '@utils/logger.js';

const FORWARD_PE_URL = '../data/output/figures/forward_pe.json';
const ANALYSIS_INDEX_URL = '../data/analysis/index.json';
const TICKER_METADATA_URL = '../data/ticker_metadata.json';
let analysisTickerPathCache = null;
let tickerMetadataCache = null;
let peRatioDataCache = null;
// Per-ticker analysis details are static fundamentals (EPS/PE), refreshed daily
// by the pipeline — within a page session they never change, so currency
// switches and price refreshes must not refetch them.
const analysisDetailCache = new Map();
// Last resolved ratios, so re-renders (currency switch) can paint the PER
// column immediately instead of flashing '—' until the fetch resolves.
let lastMarketRatiosByTicker = null;

// --- Private Functions ---

async function fetchJSON(url, { cacheBust = false } = {}) {
    const finalUrl = cacheBust
        ? `${url}${url.includes('?') ? '&' : '?'}t=${new Date().getTime()}`
        : url;
    const response = await fetch(finalUrl, { cache: 'no-cache' });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

export async function fetchPortfolioData() {
    const holdingsDetails = await fetchJSON(HOLDINGS_DETAILS_URL);
    const symbols = holdingsDetails ? Object.keys(holdingsDetails).join(',') : '';

    const isLocal = typeof window === 'undefined' || isLocalhost(window.location.hostname);
    let prices;
    if (!isLocal) {
        // Production: try Cloudflare Worker first, fall back to static file
        try {
            prices = await fetchJSON(
                `${CF_WORKER_URL}/prices?symbols=${encodeURIComponent(symbols)}`,
                { cacheBust: true }
            );
            // The Worker can answer HTTP 200 with a partial price map (an
            // upstream source failed for some symbols only). Backfill gaps
            // from the static snapshot so a held ticker never renders as 0.
            const gaps = Object.keys(holdingsDetails || {}).filter((t) => !(prices[t] > 0));
            if (gaps.length > 0) {
                const staticPrices = await fetchJSON(FUND_DATA_URL);
                for (const t of gaps) {
                    if (staticPrices[t] > 0) {
                        prices[t] = staticPrices[t];
                    }
                }
            }
        } catch (err) {
            logger.warn(
                'Cloudflare Worker unavailable, falling back to static fund_data.json',
                err
            );
            prices = await fetchJSON(FUND_DATA_URL);
        }
    } else {
        prices = await fetchJSON(FUND_DATA_URL);
    }
    // Fetched last and fail-open: without the sidecar the intraday day-change
    // is simply hidden. (Keeping this fetch last preserves the call order that
    // tests/js/transactions/dataLoader.test.js documents.)
    const prevClose = await fetchJSON(PREV_CLOSE_URL).catch((err) => {
        logger.warn('Prev-close sidecar unavailable; intraday day-change hidden:', err);
        return null;
    });
    return { holdingsDetails, prices, prevClose };
}

function normalizeTickerSymbol(value) {
    return typeof value === 'string' ? value.trim().toUpperCase() : null;
}

async function loadAnalysisTickerPaths() {
    if (analysisTickerPathCache) {
        return analysisTickerPathCache;
    }
    const indexPayload = await fetchJSON(ANALYSIS_INDEX_URL);
    const entries = Array.isArray(indexPayload?.tickers) ? indexPayload.tickers : [];
    const tickerPathMap = new Map();
    entries.forEach((entry) => {
        const normalized = normalizeTickerSymbol(entry?.symbol);
        if (normalized && typeof entry?.path === 'string' && entry.path.trim().length > 0) {
            tickerPathMap.set(normalized, entry.path);
        }
    });
    analysisTickerPathCache = tickerPathMap;
    return analysisTickerPathCache;
}

async function loadTickerMetadata() {
    if (tickerMetadataCache) {
        return tickerMetadataCache;
    }
    try {
        const payload = await fetchJSON(TICKER_METADATA_URL);
        tickerMetadataCache = payload || {};
    } catch (error) {
        logger.warn('Failed to load ticker metadata:', error);
        tickerMetadataCache = {};
    }
    return tickerMetadataCache;
}

function isEtfFromMetadata(symbol, metadata) {
    const record = metadata?.[symbol];
    if (!record) {
        return false;
    }
    const quoteType = typeof record.quoteType === 'string' ? record.quoteType.toUpperCase() : '';
    return quoteType === 'ETF' || quoteType === 'MUTUALFUND';
}

export async function fetchMarketRatiosForTickers(tickers = []) {
    if (!Array.isArray(tickers) || tickers.length === 0) {
        return new Map();
    }
    try {
        const uniqueSymbols = [
            ...new Set(
                tickers
                    .map((ticker) => normalizeTickerSymbol(ticker))
                    .filter((symbol) => Boolean(symbol))
            ),
        ];
        if (uniqueSymbols.length === 0) {
            return new Map();
        }

        const [tickerPaths, tickerMetadata] = await Promise.all([
            loadAnalysisTickerPaths(),
            loadTickerMetadata(),
        ]);
        const ratiosByTicker = new Map();

        // Load global PE ratio data as fallback for forward PE
        let globalForwardPeMap = {};
        let msciPeRatio = null;
        try {
            if (!peRatioDataCache) {
                peRatioDataCache = await fetchJSON(FORWARD_PE_URL);
            }
            const peData = peRatioDataCache;
            globalForwardPeMap = peData?.ticker_forward_pe || {};
            msciPeRatio = peData?.msci_pe_ratio || null;
        } catch (error) {
            logger.warn('Failed to load forward PE sidecar for fallback:', error);
        }

        const getFallbackValue = (val) => {
            if (Number.isFinite(val)) {
                return Number(val);
            }
            if (Array.isArray(val) && val.length > 0) {
                for (let i = val.length - 1; i >= 0; i--) {
                    if (Number.isFinite(val[i])) {
                        return Number(val[i]);
                    }
                }
            }
            return null;
        };

        const setFallbackRatio = (symbol, globalFwdPe) => {
            const fallback = getFallbackValue(globalFwdPe);
            if (fallback !== null) {
                ratiosByTicker.set(symbol, {
                    pe: null,
                    forwardPe: fallback,
                });
            }
        };

        const _getMarketFallback = (forwardPe, globalFwdPe) => {
            if (!Number.isFinite(forwardPe)) {
                const fallback = getFallbackValue(globalFwdPe);
                return fallback !== null ? fallback : forwardPe;
            }
            return forwardPe;
        };

        const processTickerRatio = async (symbol) => {
            const globalFwdPe = globalForwardPeMap[symbol];
            const analysisPath = tickerPaths.get(symbol);

            if (!analysisPath) {
                setFallbackRatio(symbol, globalFwdPe);
                return;
            }
            try {
                let detail = analysisDetailCache.get(analysisPath);
                if (!detail) {
                    detail = await fetchJSON(analysisPath);
                    analysisDetailCache.set(analysisPath, detail);
                }
                const market = detail?.market || {};
                const trailingPe = Number(market.pe);
                let forwardPe = Number(market.forwardPe);

                forwardPe = _getMarketFallback(forwardPe, globalFwdPe);

                // For VT: derive forward PE from trailing PE using MSCI ratio
                if (
                    symbol === 'VT' &&
                    !Number.isFinite(forwardPe) &&
                    Number.isFinite(trailingPe) &&
                    trailingPe > 0 &&
                    msciPeRatio?.ratio > 0
                ) {
                    forwardPe = trailingPe / msciPeRatio.ratio;
                }

                const eps = Number(market.eps);
                const forwardEps = Number(market.forwardEps);

                const snapshot = {
                    pe: Number.isFinite(trailingPe) ? trailingPe : null,
                    forwardPe: Number.isFinite(forwardPe) ? forwardPe : null,
                    eps: Number.isFinite(eps) ? eps : null,
                    forwardEps: Number.isFinite(forwardEps) ? forwardEps : null,
                    isEtf: isEtfFromMetadata(symbol, tickerMetadata),
                };

                // Attach MSCI ratio for VT so _calculateDynamicPeValues can use it
                if (symbol === 'VT' && msciPeRatio?.ratio > 0) {
                    snapshot.msciPeRatio = msciPeRatio.ratio;
                }

                ratiosByTicker.set(symbol, snapshot);
            } catch (error) {
                logger.warn(`Failed to load analysis market data for ${symbol}:`, error);
                setFallbackRatio(symbol, globalFwdPe);
            }
        };

        await Promise.all(uniqueSymbols.map(processTickerRatio));

        return ratiosByTicker;
    } catch (error) {
        logger.warn('Unable to load analysis index for PER column:', error);
        return new Map();
    }
}

function processAndEnrichHoldings(holdingsDetails, prices, prevCloseMap = null) {
    let totalPortfolioValue = 0;
    let totalPnl = 0;
    let totalDayChange = null;
    const enrichedHoldings = Object.entries(holdingsDetails).map(([ticker, details]) => {
        const shares = parseFloat(details.shares) || 0;
        const cost = parseFloat(details.average_price) || 0;
        const currentPrice = parseFloat(prices[ticker]) || 0;
        const name = details.name || ticker;

        let currentValue = 0;
        let pnlValue = 0;
        let pnlPercentage = 0;

        currentValue = shares * currentPrice;
        if (cost !== 0) {
            pnlValue = (currentPrice - cost) * shares;
            const initialCostValue = cost * shares;
            if (initialCostValue !== 0) {
                pnlPercentage = (pnlValue / initialCostValue) * 100;
            } else {
                pnlPercentage = 0;
            }
        }

        // Intraday change vs the previous close sidecar. Sub-cent deltas are
        // price-precision residue (2-decimal live quotes vs full-precision
        // closes), not real PnL — snap to flat, same as calculateRealtimePnl.
        let dayChangePrice = null;
        let dayChangeValue = null;
        let dayChangePercentage = null;
        const prevCloseEntry = prevCloseMap ? prevCloseMap[ticker] : null;
        const prevClosePrice =
            prevCloseEntry && Number.isFinite(prevCloseEntry.close) && prevCloseEntry.close > 0
                ? prevCloseEntry.close
                : null;
        if (prevClosePrice !== null && currentPrice > 0) {
            dayChangePrice = currentPrice - prevClosePrice;
            dayChangeValue = dayChangePrice * shares;
            dayChangePercentage = (dayChangePrice / prevClosePrice) * 100;
            if (Math.abs(dayChangeValue) < 0.01) {
                dayChangePrice = 0;
                dayChangeValue = 0;
                dayChangePercentage = 0;
            }
            totalDayChange = (totalDayChange || 0) + dayChangeValue;
        }

        totalPortfolioValue += currentValue;
        totalPnl += pnlValue;

        return {
            ticker,
            name,
            shares,
            cost,
            currentPrice,
            currentValue,
            pnlValue,
            pnlPercentage,
            dayChangePrice,
            dayChangeValue,
            dayChangePercentage,
        };
    });

    const sortedHoldings = enrichedHoldings.sort((a, b) => b.currentValue - a.currentValue);

    return { sortedHoldings, totalPortfolioValue, totalPnl, totalDayChange };
}

export function _calculateDynamicPeValues(ratioSnapshot, currentPrice) {
    let trailingValue = ratioSnapshot.pe;
    let forwardValue = ratioSnapshot.forwardPe;

    if (Number.isFinite(currentPrice) && currentPrice > 0) {
        // For ETFs, market.pe is the fund's portfolio-weighted trailing P/E.
        // market.eps is the fund's own EPS (net income / shares), which is NOT
        // the weighted EPS of the underlying holdings, so price/eps is wrong.
        if (!ratioSnapshot.isEtf && Number.isFinite(ratioSnapshot.eps) && ratioSnapshot.eps > 0) {
            trailingValue = currentPrice / ratioSnapshot.eps;
        }
        if (Number.isFinite(ratioSnapshot.forwardEps) && ratioSnapshot.forwardEps > 0) {
            forwardValue = currentPrice / ratioSnapshot.forwardEps;
        }
    }

    // For VT: derive forward PE from trailing PE using MSCI ratio
    // This provides a daily-updated forward PE when forwardEps is unavailable
    if (
        ratioSnapshot.msciPeRatio > 0 &&
        Number.isFinite(trailingValue) &&
        trailingValue > 0 &&
        !Number.isFinite(ratioSnapshot.forwardEps)
    ) {
        forwardValue = trailingValue / ratioSnapshot.msciPeRatio;
    }

    return { trailingValue, forwardValue };
}

function _formatPeString(trailingValue, forwardValue) {
    const formatValue = (value) => (Number.isFinite(value) ? Number(value).toFixed(2) : '—');
    const trailing = formatValue(trailingValue);
    const forward = formatValue(forwardValue);
    const hasTrailing = trailing !== '—';
    const hasForward = forward !== '—';

    if (hasTrailing && hasForward) {
        return `${trailing}/${forward}`;
    }
    if (hasTrailing) {
        return trailing;
    }
    if (hasForward) {
        return forward;
    }
    return '—';
}

function formatPerDisplayForTicker(ticker, marketRatiosByTicker = new Map(), currentPrice = null) {
    const normalizedTicker = normalizeTickerSymbol(ticker);
    if (!normalizedTicker || !(marketRatiosByTicker instanceof Map)) {
        return '—';
    }
    const ratioSnapshot = marketRatiosByTicker.get(normalizedTicker);
    if (!ratioSnapshot) {
        return '—';
    }

    const { trailingValue, forwardValue } = _calculateDynamicPeValues(ratioSnapshot, currentPrice);

    return _formatPeString(trailingValue, forwardValue);
}

function createHoldingRow(
    holding,
    totalPortfolioValueUSD,
    currentCurrency,
    exchangeRates,
    currencySymbols,
    marketRatiosByTicker = new Map()
) {
    const row = document.createElement('tr');
    row.dataset.ticker = holding.ticker;

    const allocationPercentage =
        totalPortfolioValueUSD > 0 ? (holding.currentValue / totalPortfolioValueUSD) * 100 : 0;
    const perDisplayValue = formatPerDisplayForTicker(
        holding.ticker,
        marketRatiosByTicker,
        holding.currentPrice
    );

    const columns = [
        { text: holding.name },
        { class: 'allocation', text: `${allocationPercentage.toFixed(2)}%` },
        {
            class: 'price',
            text: formatCurrency(
                holding.currentPrice,
                currentCurrency,
                exchangeRates,
                currencySymbols
            ),
        },
        { class: 'per', text: perDisplayValue },
        {
            class: 'cost',
            text: formatCurrency(holding.cost, currentCurrency, exchangeRates, currencySymbols),
        },
        { class: 'shares', text: holding.shares.toFixed(2) },
        {
            class: 'value',
            text: formatCurrency(
                holding.currentValue,
                currentCurrency,
                exchangeRates,
                currencySymbols
            ),
        },
        { class: 'pnl', text: '' },
        { class: 'pnl-percentage', text: '' },
    ];

    columns.forEach((col) => {
        const td = document.createElement('td');
        if (col.class) {
            td.className = col.class;
        }
        td.textContent = col.text;
        row.appendChild(td);
    });

    const pnlCell = row.querySelector('td.pnl');
    const pnlPercentageCell = row.querySelector('td.pnl-percentage');

    // Day change renders as a half-size two-line stack (pct over $) trailing
    // the main figure — same idiom in the price cell, value cell, and footer.
    // Price cell shows the per-share change; value cell the position's total.
    const makeDayChangeStack = (pctText, absText, color) => {
        const stack = document.createElement('span');
        stack.className = 'day-change-stack';
        const pct = document.createElement('span');
        pct.className = 'day-change-pct';
        pct.textContent = pctText;
        const abs = document.createElement('span');
        abs.className = 'day-change-abs';
        abs.textContent = absText;
        if (color) {
            pct.style.color = color;
            abs.style.color = color;
        }
        stack.appendChild(pct);
        stack.appendChild(abs);
        return stack;
    };

    if (Number.isFinite(holding.dayChangePercentage)) {
        const dayColor =
            holding.dayChangeValue > 0
                ? COLORS.POSITIVE_PNL
                : holding.dayChangeValue < 0
                  ? COLORS.NEGATIVE_PNL
                  : null;
        const pctText = `${holding.dayChangePercentage > 0 ? '+' : ''}${holding.dayChangePercentage.toFixed(2)}%`;

        const priceCell = row.querySelector('td.price');
        if (priceCell && Number.isFinite(holding.dayChangePrice)) {
            const priceAbsText = `${holding.dayChangePrice >= 0 ? '+' : '-'}${formatCurrency(
                Math.abs(holding.dayChangePrice),
                currentCurrency,
                exchangeRates,
                currencySymbols
            )}`;
            priceCell.appendChild(makeDayChangeStack(pctText, priceAbsText, dayColor));
        }

        const valueCell = row.querySelector('td.value');
        if (valueCell) {
            const valueAbsText = `${holding.dayChangeValue >= 0 ? '+' : '-'}${formatCurrency(
                Math.abs(holding.dayChangeValue),
                currentCurrency,
                exchangeRates,
                currencySymbols
            )}`;
            valueCell.appendChild(makeDayChangeStack(pctText, valueAbsText, dayColor));
        }
    }

    if (pnlCell && pnlPercentageCell) {
        const formattedAbsolutePnlValueWithSymbol = formatCurrency(
            holding.pnlValue,
            currentCurrency,
            exchangeRates,
            currencySymbols
        );
        let displayPnlValue;
        if (holding.pnlValue >= 0) {
            displayPnlValue = `+${formattedAbsolutePnlValueWithSymbol}`;
        } else {
            displayPnlValue = `-${formattedAbsolutePnlValueWithSymbol}`;
        }
        pnlCell.textContent = displayPnlValue;

        const pnlPercentagePrefix = holding.pnlPercentage >= 0 ? '+' : '';
        const formattedPnlPercentage = holding.pnlPercentage.toFixed(2);
        pnlPercentageCell.textContent = `${pnlPercentagePrefix}${formattedPnlPercentage}%`;

        if (holding.pnlValue > 0) {
            pnlCell.style.color = COLORS.POSITIVE_PNL;
            pnlPercentageCell.style.color = COLORS.POSITIVE_PNL;
        } else if (holding.pnlValue < 0) {
            pnlCell.style.color = COLORS.NEGATIVE_PNL;
            pnlPercentageCell.style.color = COLORS.NEGATIVE_PNL;
        } else {
            pnlCell.style.color = '';
            pnlPercentageCell.style.color = '';
        }
    }
    return row;
}

// Equalize the day-change stack widths within each column so the main
// figure's right edge stays aligned across rows, whatever the currency —
// fixed ch widths break for JPY/KRW amounts, so measure the widest stack.
function alignDayChangeStacks() {
    ['td.price', 'td.value'].forEach((cellSelector) => {
        const stacks = document.querySelectorAll(`${cellSelector} .day-change-stack`);
        if (stacks.length < 2) {
            return;
        }
        let maxWidth = 0;
        stacks.forEach((stack) => {
            stack.style.width = '';
            maxWidth = Math.max(maxWidth, stack.scrollWidth);
        });
        // The first render happens while the table is still display:none (it
        // is revealed by the donut-center toggle), so every stack measures 0.
        // Baking 0px in would make the right-aligned stack text overflow
        // leftward over the main figure — skip instead; the ResizeObserver
        // below re-aligns once the table is actually visible.
        if (maxWidth === 0) {
            return;
        }
        stacks.forEach((stack) => {
            stack.style.width = `${maxWidth}px`;
        });
    });
}

// Re-align when the table transitions from hidden to visible (tbody goes
// from 0-size to laid out). Currency switches re-render and re-measure on
// their own; this covers the initial reveal and window resizes.
let dayStackObserver = null;
function observeTableForStackAlignment(tbody) {
    if (dayStackObserver || typeof ResizeObserver === 'undefined') {
        return;
    }
    // eslint-disable-next-line no-undef
    dayStackObserver = new ResizeObserver(() => alignDayChangeStacks());
    dayStackObserver.observe(tbody);
}

function updateTableAndPrepareChartData(
    sortedHoldings,
    totalPortfolioValueUSD,
    currentCurrency,
    exchangeRates,
    currencySymbols,
    marketRatiosByTicker = new Map()
) {
    const tbody = document.querySelector('table tbody');
    tbody.replaceChildren();

    const chartData = {
        labels: [],
        datasets: [
            {
                data: [],
                backgroundColor: [],
                borderColor: 'transparent',
                borderWidth: 0,
                hoverBorderWidth: 0,
                borderAlign: 'inner',
                images: [],
            },
        ],
    };

    // Use DocumentFragment to batch DOM insertions for better performance
    const fragment = document.createDocumentFragment();

    sortedHoldings.forEach((holding, index) => {
        const row = createHoldingRow(
            holding,
            totalPortfolioValueUSD,
            currentCurrency,
            exchangeRates,
            currencySymbols,
            marketRatiosByTicker
        );
        fragment.appendChild(row);

        const allocationPercentage =
            totalPortfolioValueUSD > 0 ? (holding.currentValue / totalPortfolioValueUSD) * 100 : 0;
        chartData.labels.push(holding.ticker);
        chartData.datasets[0].data.push(allocationPercentage);
        const baseColor = getBlueColorForSlice(index, sortedHoldings.length);
        const sliceAlpha =
            typeof window !== 'undefined' &&
            window.pieChartGlassEffect &&
            typeof window.pieChartGlassEffect.opacity === 'number'
                ? window.pieChartGlassEffect.opacity
                : (PIE_CHART_GLASS_EFFECT.opacity ?? CHART_DEFAULTS.BACKGROUND_ALPHA);
        chartData.datasets[0].backgroundColor.push(hexToRgba(baseColor, sliceAlpha));

        const originalLogoInfo = TICKER_TO_LOGO_MAP[holding.ticker] || {
            src: '/assets/logos/vt.png',
            scale: 1.0,
        };
        const resolvedSrc =
            typeof originalLogoInfo.src === 'string' && originalLogoInfo.src.startsWith('http')
                ? originalLogoInfo.src
                : BASE_URL + originalLogoInfo.src;
        const logoInfo = { ...originalLogoInfo, src: resolvedSrc };
        chartData.datasets[0].images.push(logoInfo);
    });

    // Append all rows at once
    tbody.appendChild(fragment);
    alignDayChangeStacks();
    observeTableForStackAlignment(tbody);

    return chartData;
}

async function fetchData(paths) {
    const [historical, fx, { holdingsDetails, prices }] = await Promise.all([
        d3.csv(paths.historical, { cache: 'no-cache' }),
        d3.json(paths.fx, { cache: 'no-cache' }),
        fetchPortfolioData(),
    ]);
    return { historical, fx, holdings: holdingsDetails, fund: prices };
}

function processHistoricalData(rawData) {
    if (!rawData || rawData.length === 0) {
        return [];
    }

    const toNumber = (value) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const calculatePnlPercentage = (change, previous) => {
        if (!Number.isFinite(change) || !Number.isFinite(previous) || previous === 0) {
            return 0;
        }
        return change / previous;
    };

    const processed = rawData
        .map((d, i) => {
            // Extract all currency values from the CSV
            const currentValueUSD = toNumber(d.value_usd);
            const currentValueCNY = toNumber(d.value_cny);
            const currentValueJPY = toNumber(d.value_jpy);
            const currentValueKRW = toNumber(d.value_krw);

            // Calculate daily changes for each currency (using USD as reference for PnL percentage)
            let dailyChangeUSD = 0;
            let dailyChangeCNY = 0;
            let dailyChangeJPY = 0;
            let dailyChangeKRW = 0;
            let pnlUSD = 0;
            let pnlCNY = 0;
            let pnlJPY = 0;
            let pnlKRW = 0;

            if (i > 0) {
                const previousValueUSD = toNumber(rawData[i - 1].value_usd);
                const previousValueCNY = toNumber(rawData[i - 1].value_cny);
                const previousValueJPY = toNumber(rawData[i - 1].value_jpy);
                const previousValueKRW = toNumber(rawData[i - 1].value_krw);

                dailyChangeUSD = currentValueUSD - previousValueUSD;
                dailyChangeCNY = currentValueCNY - previousValueCNY;
                dailyChangeJPY = currentValueJPY - previousValueJPY;
                dailyChangeKRW = currentValueKRW - previousValueKRW;

                pnlUSD = calculatePnlPercentage(dailyChangeUSD, previousValueUSD);
                pnlCNY = calculatePnlPercentage(dailyChangeCNY, previousValueCNY);
                pnlJPY = calculatePnlPercentage(dailyChangeJPY, previousValueJPY);
                pnlKRW = calculatePnlPercentage(dailyChangeKRW, previousValueKRW);
            }

            return {
                date: d.date,
                value: pnlUSD,
                valueUSD: pnlUSD,
                valueCNY: pnlCNY,
                valueJPY: pnlJPY,
                valueKRW: pnlKRW,
                // Store all currency totals and daily changes
                total: currentValueUSD, // Keep USD as default for backwards compatibility
                totalUSD: currentValueUSD,
                totalCNY: currentValueCNY,
                totalJPY: currentValueJPY,
                totalKRW: currentValueKRW,
                dailyChange: dailyChangeUSD, // Keep USD as default for backwards compatibility
                dailyChangeUSD: dailyChangeUSD,
                dailyChangeCNY: dailyChangeCNY,
                dailyChangeJPY: dailyChangeJPY,
                dailyChangeKRW: dailyChangeKRW,
                isInitialDataPoint: i === 0,
            };
        })
        .filter((d) => d.date);
    if (processed.length > 0) {
        processed[0].isInitialDataPoint = true;
    }
    return processed;
}

function _calculateCurrentTotalUSD(holdingsData, fundData) {
    let currentTotalValueUSD = 0;
    for (const ticker in holdingsData) {
        if (fundData[ticker]) {
            currentTotalValueUSD +=
                parseFloat(holdingsData[ticker].shares) * parseFloat(fundData[ticker]);
        }
    }
    return currentTotalValueUSD;
}

function _getValidBaselineValue(baselineEntry, key, fallbackKey = null) {
    if (!baselineEntry) {
        return 0;
    }
    if (Number.isFinite(baselineEntry[key])) {
        return baselineEntry[key];
    }
    if (fallbackKey && Number.isFinite(baselineEntry[fallbackKey])) {
        return baselineEntry[fallbackKey];
    }
    return 0;
}

function _extractBaselineTotals(baselineEntry) {
    return {
        totalUSD: _getValidBaselineValue(baselineEntry, 'totalUSD', 'total') || 0,
        totalCNY: _getValidBaselineValue(baselineEntry, 'totalCNY') || 0,
        totalJPY: _getValidBaselineValue(baselineEntry, 'totalJPY') || 0,
        totalKRW: _getValidBaselineValue(baselineEntry, 'totalKRW') || 0,
    };
}

function calculateRealtimePnl(holdingsData, fundData, baselineEntry, rates = {}) {
    if (!holdingsData || !fundData) {
        return null;
    }

    const today = getNyDate();

    if (!isTradingDay(today)) {
        return null;
    }

    const currentTotalValueUSD = _calculateCurrentTotalUSD(holdingsData, fundData);
    const baselineTotals = _extractBaselineTotals(baselineEntry);

    // Convert to other currencies using current exchange rates for real-time data
    const currentTotalValueCNY = currentTotalValueUSD * (rates.CNY || 1);
    const currentTotalValueJPY = currentTotalValueUSD * (rates.JPY || 1);
    const currentTotalValueKRW = currentTotalValueUSD * (rates.KRW || 1);

    // Calculate daily changes (using USD as baseline for percentage)
    let dailyChangeUSD = currentTotalValueUSD - baselineTotals.totalUSD;
    let dailyChangeCNY = currentTotalValueCNY - baselineTotals.totalCNY;
    let dailyChangeJPY = currentTotalValueJPY - baselineTotals.totalJPY;
    let dailyChangeKRW = currentTotalValueKRW - baselineTotals.totalKRW;

    // Sub-cent realtime deltas are price-precision residue (2-decimal live
    // quotes vs the pipeline's full-precision closes), not real PnL — snap to
    // flat. Threshold is on USD; the other currencies are the same noise
    // scaled by FX rates. isFlat lets the calendar distinguish a flat day
    // (render a zero label) from missing data (render nothing).
    const isFlat = Math.abs(dailyChangeUSD) < 0.01;
    if (isFlat) {
        dailyChangeUSD = 0;
        dailyChangeCNY = 0;
        dailyChangeJPY = 0;
        dailyChangeKRW = 0;
    }

    const calculatePnlPercentage = (change, previous) => {
        if (!Number.isFinite(change) || !Number.isFinite(previous) || previous === 0) {
            return 0;
        }
        return change / previous;
    };

    const pnlUSD = calculatePnlPercentage(dailyChangeUSD, baselineTotals.totalUSD);
    const pnlCNY = calculatePnlPercentage(dailyChangeCNY, baselineTotals.totalCNY);
    const pnlJPY = calculatePnlPercentage(dailyChangeJPY, baselineTotals.totalJPY);
    const pnlKRW = calculatePnlPercentage(dailyChangeKRW, baselineTotals.totalKRW);

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return {
        date: todayStr,
        value: pnlUSD,
        valueUSD: pnlUSD,
        valueCNY: pnlCNY,
        valueJPY: pnlJPY,
        valueKRW: pnlKRW,
        // Backwards compatibility
        total: currentTotalValueUSD,
        dailyChange: dailyChangeUSD,
        // Multi-currency support
        totalUSD: currentTotalValueUSD,
        totalCNY: currentTotalValueCNY,
        totalJPY: currentTotalValueJPY,
        totalKRW: currentTotalValueKRW,
        dailyChangeUSD: dailyChangeUSD,
        dailyChangeCNY: dailyChangeCNY,
        dailyChangeJPY: dailyChangeJPY,
        dailyChangeKRW: dailyChangeKRW,
        isFlat: isFlat,
    };
}

function combineData(historicalData, realtimeData) {
    if (!realtimeData) {
        return historicalData;
    }

    const combinedData = [...historicalData];
    const lastHistoricalData = combinedData[combinedData.length - 1];

    if (lastHistoricalData.date !== realtimeData.date) {
        combinedData.push(realtimeData);
    } else {
        combinedData[combinedData.length - 1] = realtimeData;
    }
    return combinedData;
}

/* istanbul ignore next: defensive utility function for previous month calculation */
function getPreviousMonthKey(monthKey) {
    /* istanbul ignore next: defensive programming for invalid input */
    const [yearStr, monthStr] = monthKey.split('-');
    /* istanbul ignore next: defensive programming for invalid input */
    const year = Number(yearStr);
    /* istanbul ignore next: defensive programming for invalid input */
    const month = Number(monthStr);
    /* istanbul ignore next: defensive programming for invalid input */
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
        /* istanbul ignore next: defensive programming for invalid input */
        return null;
    }
    /* istanbul ignore next: defensive programming for invalid input */
    let prevYear = year;
    /* istanbul ignore next: defensive programming for invalid input */
    let prevMonth = month - 1;
    /* istanbul ignore next: defensive programming for invalid input */
    if (prevMonth < 1) {
        /* istanbul ignore next: defensive programming for invalid input */
        prevMonth = 12;
        /* istanbul ignore next: defensive programming for invalid input */
        prevYear -= 1;
    }
    /* istanbul ignore next: defensive programming for invalid input */
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

/* istanbul ignore next: defensive monthly PnL computation function */
function _findEarliestValidEntry(processedData) {
    /* istanbul ignore next: defensive programming for locating earliest valid entry */
    let earliest = null;
    for (const entry of processedData) {
        /* istanbul ignore next: defensive programming for locating earliest valid entry */
        if (!entry || typeof entry.date !== 'string') {
            continue;
        }
        /* istanbul ignore next: defensive programming for locating earliest valid entry */
        const baselineTotal =
            Number.isFinite(entry.total) || typeof entry.total === 'number'
                ? Number(entry.total)
                : Number(entry.totalUSD);
        /* istanbul ignore next: defensive programming for locating earliest valid entry */
        if (!Number.isFinite(baselineTotal)) {
            continue;
        }
        /* istanbul ignore next: defensive programming for locating earliest valid entry */
        if (!earliest || entry.date.localeCompare(earliest.date) < 0) {
            earliest = entry;
        }
    }
    return earliest;
}

/* istanbul ignore next: defensive grouping data function */
function _groupDataByMonth(processedData) {
    const buckets = new Map();
    for (const entry of processedData) {
        /* istanbul ignore next: defensive programming for malformed entries */
        if (!entry || typeof entry.date !== 'string') {
            continue;
        }
        const monthKey = entry.date.slice(0, 7);
        /* istanbul ignore next: defensive programming for malformed entries */
        if (!buckets.has(monthKey)) {
            buckets.set(monthKey, []);
        }
        buckets.get(monthKey).push(entry);
    }
    return buckets;
}

/* istanbul ignore next: defensive calculate currency function */
function _calculatePercentChange(change, base) {
    if (base === 0) {
        return change === 0 ? 0 : null;
    }
    return change / base;
}

function _calculateCurrencyChanges(baseEntry, lastEntry) {
    /* istanbul ignore next: defensive programming for invalid totals */
    const baseTotal = Number(baseEntry?.total);
    /* istanbul ignore next: defensive programming for invalid totals */
    const lastTotal = Number(lastEntry?.total);

    /* istanbul ignore next: defensive programming for invalid totals */
    if (!Number.isFinite(baseTotal) || !Number.isFinite(lastTotal)) {
        return null;
    }

    const getSafeVal = (entry, key) => (entry && entry[key]) || 0;

    const absoluteChangeUSD = lastTotal - baseTotal;
    const absoluteChangeCNY = getSafeVal(lastEntry, 'totalCNY') - getSafeVal(baseEntry, 'totalCNY');
    const absoluteChangeJPY = getSafeVal(lastEntry, 'totalJPY') - getSafeVal(baseEntry, 'totalJPY');
    const absoluteChangeKRW = getSafeVal(lastEntry, 'totalKRW') - getSafeVal(baseEntry, 'totalKRW');

    return {
        absoluteChangeUSD,
        absoluteChangeCNY,
        absoluteChangeJPY,
        absoluteChangeKRW,
        percentChange: _calculatePercentChange(absoluteChangeUSD, baseTotal),
        percentChangeUSD: _calculatePercentChange(absoluteChangeUSD, baseTotal),
        percentChangeCNY: _calculatePercentChange(
            absoluteChangeCNY,
            getSafeVal(baseEntry, 'totalCNY')
        ),
        percentChangeJPY: _calculatePercentChange(
            absoluteChangeJPY,
            getSafeVal(baseEntry, 'totalJPY')
        ),
        percentChangeKRW: _calculatePercentChange(
            absoluteChangeKRW,
            getSafeVal(baseEntry, 'totalKRW')
        ),
    };
}

/* istanbul ignore next: defensive monthly PnL computation function */
/* istanbul ignore next: defensive helper for finding previous month entry */
function _findPrevMonthLastEntry(buckets, sortedMonthKeys, idx, monthKey) {
    const prevMonthKey = getPreviousMonthKey(monthKey);
    const prevEntries = prevMonthKey ? buckets.get(prevMonthKey) : null;
    let prevMonthLastEntry =
        prevEntries && prevEntries.length > 0 ? prevEntries[prevEntries.length - 1] : null;

    if (!prevMonthLastEntry && idx > 0) {
        const fallbackKey = sortedMonthKeys[idx - 1];
        const fallbackEntries = buckets.get(fallbackKey);
        if (fallbackEntries && fallbackEntries.length > 0) {
            prevMonthLastEntry = fallbackEntries[fallbackEntries.length - 1];
        }
    }
    return prevMonthLastEntry;
}

function computeMonthlyPnl(processedData) {
    /* istanbul ignore next: defensive programming for empty data */
    if (!Array.isArray(processedData) || processedData.length === 0) {
        return new Map();
    }

    const earliestValidEntry = _findEarliestValidEntry(processedData);
    const buckets = _groupDataByMonth(processedData);
    const sortedMonthKeys = Array.from(buckets.keys()).sort();
    const monthlyPnl = new Map();

    const processMonthBucket = (monthKey, idx) => {
        const entries = buckets.get(monthKey);
        if (!entries || entries.length === 0) {
            return;
        }

        entries.sort((a, b) => a.date.localeCompare(b.date));
        const firstEntry = entries[0];
        const lastEntry = entries[entries.length - 1];

        if (!firstEntry || !lastEntry) {
            return;
        }

        const prevMonthLastEntry = _findPrevMonthLastEntry(buckets, sortedMonthKeys, idx, monthKey);

        let baseEntry = prevMonthLastEntry || firstEntry;
        if (!prevMonthLastEntry && idx === 0 && earliestValidEntry) {
            baseEntry = earliestValidEntry;
        }

        const changes = _calculateCurrencyChanges(baseEntry, lastEntry);
        if (changes) {
            monthlyPnl.set(monthKey, changes);
        }
    };

    /* istanbul ignore next: defensive programming for malformed entries */
    for (let idx = 0; idx < sortedMonthKeys.length; idx++) {
        processMonthBucket(sortedMonthKeys[idx], idx);
    }

    return monthlyPnl;
}

export const __testables = {
    _calculateCurrencyChanges,
    computeMonthlyPnl,
    fetchJSON,
    resetAnalysisTickerCache: () => {
        analysisTickerPathCache = null;
    },
    resetTickerMetadataCache: () => {
        tickerMetadataCache = null;
    },
    resetPeRatioDataCache: () => {
        peRatioDataCache = null;
    },
    resetAnalysisDetailCache: () => {
        analysisDetailCache.clear();
    },
    resetLastMarketRatios: () => {
        lastMarketRatiosByTicker = null;
    },
};

function _renderPnlSummary(
    totalPnlUSD,
    totalPortfolioValueUSD,
    currentCurrency,
    exchangeRates,
    currencySymbols,
    totalDayChangeUSD = null
) {
    const totalPortfolioCostUSD = totalPortfolioValueUSD - totalPnlUSD;
    const totalPnlPercentage =
        totalPortfolioCostUSD !== 0 ? (totalPnlUSD / totalPortfolioCostUSD) * 100 : 0;

    const pnlContainer = document.getElementById('table-footer-summary');
    const pnlElement = pnlContainer.querySelector('.total-pnl');

    const formattedPnl = formatCurrency(
        Math.abs(totalPnlUSD),
        currentCurrency,
        exchangeRates,
        currencySymbols
    );
    const pnlSign = totalPnlUSD >= 0 ? '+' : '-';
    const pnlPercentageSign = totalPnlPercentage >= 0 ? '+' : '';

    pnlElement.replaceChildren();

    const openBracket = document.createElement('span');
    openBracket.className = 'pnl-bracket';
    openBracket.textContent = ' (';

    const pnlAmount = document.createElement('span');
    pnlAmount.className = 'pnl-amount';
    pnlAmount.textContent = `${pnlSign}${formattedPnl}`;

    const separator = document.createElement('span');
    separator.className = 'pnl-separator';
    separator.textContent = ', ';

    const pnlPercent = document.createElement('span');
    pnlPercent.className = 'pnl-percent';
    pnlPercent.textContent = `${pnlPercentageSign}${totalPnlPercentage.toFixed(2)}%`;

    const closeBracket = document.createElement('span');
    closeBracket.className = 'pnl-bracket';
    closeBracket.textContent = ')';

    const pnlColor = totalPnlUSD >= 0 ? COLORS.POSITIVE_PNL : COLORS.NEGATIVE_PNL;
    pnlAmount.style.color = pnlColor;
    pnlPercent.style.color = pnlColor;

    const footerTextColor = window.getComputedStyle(pnlContainer).color;
    openBracket.style.color = footerTextColor;
    separator.style.color = footerTextColor;
    closeBracket.style.color = footerTextColor;

    // The all-time bracket gets its own wrapper so the mobile footer toggle
    // can hide just it while the day-change stack stays visible by default.
    const allTimeGroup = document.createElement('span');
    allTimeGroup.className = 'pnl-all-time';
    allTimeGroup.appendChild(openBracket);
    allTimeGroup.appendChild(pnlAmount);
    allTimeGroup.appendChild(separator);
    allTimeGroup.appendChild(pnlPercent);
    allTimeGroup.appendChild(closeBracket);
    pnlElement.appendChild(allTimeGroup);

    // Intraday change as a half-size two-line stack (pct over $) trailing the
    // all-time bracket — same idiom as the day-change tags in the table cells,
    // and small enough that the footer stays one line tall.
    if (Number.isFinite(totalDayChangeUSD)) {
        const previousTotalUSD = totalPortfolioValueUSD - totalDayChangeUSD;
        const dayChangePct =
            previousTotalUSD !== 0 ? (totalDayChangeUSD / previousTotalUSD) * 100 : 0;
        const dayColor =
            totalDayChangeUSD > 0
                ? COLORS.POSITIVE_PNL
                : totalDayChangeUSD < 0
                  ? COLORS.NEGATIVE_PNL
                  : footerTextColor;

        const dayStack = document.createElement('span');
        dayStack.className = 'day-pnl-stack';

        const dayPercent = document.createElement('span');
        dayPercent.className = 'day-pnl-percent';
        dayPercent.textContent = `${dayChangePct >= 0 ? '+' : ''}${dayChangePct.toFixed(2)}%`;
        dayPercent.style.color = dayColor;

        const dayAmount = document.createElement('span');
        dayAmount.className = 'day-pnl-amount';
        dayAmount.textContent = `${totalDayChangeUSD >= 0 ? '+' : '-'}${formatCurrency(
            Math.abs(totalDayChangeUSD),
            currentCurrency,
            exchangeRates,
            currencySymbols
        )}`;
        dayAmount.style.color = dayColor;

        dayStack.appendChild(dayPercent);
        dayStack.appendChild(dayAmount);
        pnlElement.appendChild(dayStack);
    }
}

function _updatePerColumn(marketRatiosByTicker, sortedHoldings) {
    if (!marketRatiosByTicker || !(marketRatiosByTicker instanceof Map)) {
        return;
    }
    const rows = document.querySelectorAll('table tbody tr');
    const holdingByTicker = new Map(sortedHoldings.map((h) => [h.ticker, h]));
    rows.forEach((row) => {
        const ticker = row.dataset.ticker;
        if (!ticker) {
            return;
        }
        const perCell = row.querySelector('td.per');
        if (perCell) {
            const holding = holdingByTicker.get(ticker);
            const currentPrice = holding ? holding.currentPrice : null;
            perCell.textContent = formatPerDisplayForTicker(
                ticker,
                marketRatiosByTicker,
                currentPrice
            );
        }
    });
}

export async function loadAndDisplayPortfolioData(currentCurrency, exchangeRates, currencySymbols) {
    try {
        const { holdingsDetails, prices, prevClose } = await fetchPortfolioData();

        if (!holdingsDetails || !prices) {
            logger.error(
                'Essential holding or price data missing, cannot update portfolio display.'
            );
            return;
        }
        if (!exchangeRates || !currencySymbols) {
            logger.error(
                'Exchange rates or currency symbols missing, cannot update portfolio display correctly.'
            );
            return;
        }

        // Intraday day-change is only meaningful while the market trades; on
        // weekends/holidays the live quote just restates the previous close.
        const showIntraday =
            isTradingDay(getNyDate()) && prevClose && typeof prevClose === 'object'
                ? prevClose
                : null;

        const {
            sortedHoldings,
            totalPortfolioValue: totalPortfolioValueUSD,
            totalPnl: totalPnlUSD,
            totalDayChange: totalDayChangeUSD,
        } = processAndEnrichHoldings(holdingsDetails, prices, showIntraday);
        const tickerSymbols = sortedHoldings.map((holding) => holding.ticker);
        const chartData = updateTableAndPrepareChartData(
            sortedHoldings,
            totalPortfolioValueUSD,
            currentCurrency,
            exchangeRates,
            currencySymbols,
            lastMarketRatiosByTicker ?? new Map()
        );

        document.getElementById('total-portfolio-value-in-table').textContent = formatCurrency(
            totalPortfolioValueUSD,
            currentCurrency,
            exchangeRates,
            currencySymbols
        );

        _renderPnlSummary(
            totalPnlUSD,
            totalPortfolioValueUSD,
            currentCurrency,
            exchangeRates,
            currencySymbols,
            totalDayChangeUSD
        );

        updatePieChart(chartData);
        checkAndToggleVerticalScroll();

        const marketRatiosByTicker = await fetchMarketRatiosForTickers(tickerSymbols);
        lastMarketRatiosByTicker = marketRatiosByTicker;
        _updatePerColumn(marketRatiosByTicker, sortedHoldings);
    } catch (error) {
        logger.error('Error fetching or processing fund data:', error);
    }
}

export async function getCalendarData(dataPaths) {
    const allData = await fetchData(dataPaths);
    const rates = allData.fx.rates;

    const historicalData = processHistoricalData(allData.historical);
    if (historicalData.length === 0) {
        throw new Error('No historical data available.');
    }

    const today = getNyDate();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const lastHistoricalData = historicalData[historicalData.length - 1];
    const baselineEntry =
        lastHistoricalData.date === todayStr && historicalData.length > 1
            ? historicalData[historicalData.length - 2]
            : lastHistoricalData;

    const realtimeData = calculateRealtimePnl(allData.holdings, allData.fund, baselineEntry, rates);

    const processedData = combineData(historicalData, realtimeData);
    const byDate = new Map(processedData.map((d) => [d.date, d]));
    const monthlyPnl = computeMonthlyPnl(processedData);

    return { processedData, byDate, rates, monthlyPnl };
}
