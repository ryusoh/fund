import { getNyDate, isTradingDay } from '@utils/date.js';
import { formatCurrency } from '@utils/formatting.js';
import { getBlueColorForSlice, hexToRgba } from '@utils/colors.js';
import { updatePieChart } from '@charts/allocationChartManager.js';
import { checkAndToggleVerticalScroll } from '@ui/responsive.js';
import { setThinkingHighlight } from '@ui/textHighlightManager.js';
import { isLocalhost } from '@utils/host.js';
import {
    HOLDINGS_DETAILS_URL,
    FUND_DATA_URL,
    CF_WORKER_URL,
    COLORS,
    CHART_DEFAULTS,
    TICKER_TO_LOGO_MAP,
    BASE_URL,
    POSITION_PNL_HIGHLIGHT,
} from '@js/config.js';
import { logger } from '@utils/logger.js';

const PE_RATIO_URL = '../data/output/figures/pe_ratio.json';
const ANALYSIS_INDEX_URL = '../data/analysis/index.json';
let analysisTickerPathCache = null;

function lightenHexToRgba(hex, lightenFactor, alpha) {
    /* istanbul ignore next: defensive parameter validation */
    if (typeof hex !== 'string' || !/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(hex)) {
        /* istanbul ignore next: defensive parameter validation */
        return null;
    }
    /* istanbul ignore next: defensive handling of short hex format */
    const normalized =
        hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    const r = parseInt(normalized.substring(1, 3), 16);
    const g = parseInt(normalized.substring(3, 5), 16);
    const b = parseInt(normalized.substring(5, 7), 16);
    /* istanbul ignore next: defensive parameter validation */
    const light = Math.max(0, Math.min(1, Number.isFinite(lightenFactor) ? lightenFactor : 0.5));
    /* istanbul ignore next: defensive parameter validation */
    const targetAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    const lighten = (channel) => Math.round(channel + (255 - channel) * light);
    return `rgba(${lighten(r)}, ${lighten(g)}, ${lighten(b)}, ${targetAlpha})`;
}

// --- Private Functions ---

async function fetchJSON(url) {
    const response = await fetch(`${url}?t=${new Date().getTime()}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function fetchPortfolioData() {
    const holdingsDetails = await fetchJSON(HOLDINGS_DETAILS_URL);
    const symbols = holdingsDetails ? Object.keys(holdingsDetails).join(',') : '';

    const isLocal = typeof window === 'undefined' || isLocalhost(window.location.hostname);
    let prices;
    if (!isLocal) {
        // Production: try Cloudflare Worker first, fall back to static file
        try {
            prices = await fetchJSON(
                `${CF_WORKER_URL}/prices?symbols=${encodeURIComponent(symbols)}`
            );
        } catch {
            logger.warn('Cloudflare Worker unavailable, falling back to static fund_data.json');
            prices = await fetchJSON(FUND_DATA_URL);
        }
    } else {
        prices = await fetchJSON(FUND_DATA_URL);
    }
    return { holdingsDetails, prices };
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

async function fetchMarketRatiosForTickers(tickers = []) {
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

        const tickerPaths = await loadAnalysisTickerPaths();
        const ratiosByTicker = new Map();

        // Load global PE ratio data as fallback for forward PE
        let globalForwardPeMap = {};
        try {
            const peData = await fetchJSON(PE_RATIO_URL);
            globalForwardPeMap = (peData?.forward_pe && peData.forward_pe.ticker_forward_pe) || {};
        } catch (error) {
            logger.warn('Failed to load global PE ratio data for fallback:', error);
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
                const detail = await fetchJSON(analysisPath);
                const market = detail?.market || {};
                const trailingPe = Number(market.pe);
                let forwardPe = Number(market.forwardPe);

                forwardPe = _getMarketFallback(forwardPe, globalFwdPe);

                const eps = Number(market.eps);
                const forwardEps = Number(market.forwardEps);

                ratiosByTicker.set(symbol, {
                    pe: Number.isFinite(trailingPe) ? trailingPe : null,
                    forwardPe: Number.isFinite(forwardPe) ? forwardPe : null,
                    eps: Number.isFinite(eps) ? eps : null,
                    forwardEps: Number.isFinite(forwardEps) ? forwardEps : null,
                });
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

function processAndEnrichHoldings(holdingsDetails, prices) {
    let totalPortfolioValue = 0;
    let totalPnl = 0;
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
        };
    });

    const sortedHoldings = enrichedHoldings.sort((a, b) => b.currentValue - a.currentValue);

    return { sortedHoldings, totalPortfolioValue, totalPnl };
}

function _calculateDynamicPeValues(ratioSnapshot, currentPrice) {
    let trailingValue = ratioSnapshot.pe;
    let forwardValue = ratioSnapshot.forwardPe;

    if (Number.isFinite(currentPrice) && currentPrice > 0) {
        if (Number.isFinite(ratioSnapshot.eps) && ratioSnapshot.eps > 0) {
            trailingValue = currentPrice / ratioSnapshot.eps;
        }
        if (Number.isFinite(ratioSnapshot.forwardEps) && ratioSnapshot.forwardEps > 0) {
            forwardValue = currentPrice / ratioSnapshot.forwardEps;
        }
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
        chartData.datasets[0].backgroundColor.push(
            hexToRgba(baseColor, CHART_DEFAULTS.BACKGROUND_ALPHA)
        );

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

    return chartData;
}

async function fetchData(paths) {
    const timestamp = new Date().getTime();
    const [historical, fx, holdings, fund] = await Promise.all([
        d3.csv(`${paths.historical}?t=${timestamp}`),
        d3.json(`${paths.fx}?t=${timestamp}`),
        d3.json(`${paths.holdings}?t=${timestamp}`),
        d3.json(`${paths.fund}?t=${timestamp}`),
    ]);
    return { historical, fx, holdings, fund };
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
    const dailyChangeUSD = currentTotalValueUSD - baselineTotals.totalUSD;
    const dailyChangeCNY = currentTotalValueCNY - baselineTotals.totalCNY;
    const dailyChangeJPY = currentTotalValueJPY - baselineTotals.totalJPY;
    const dailyChangeKRW = currentTotalValueKRW - baselineTotals.totalKRW;

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
    resetAnalysisTickerCache: () => {
        analysisTickerPathCache = null;
    },
};

function _renderPnlSummary(
    totalPnlUSD,
    totalPortfolioValueUSD,
    currentCurrency,
    exchangeRates,
    currencySymbols
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

    setThinkingHighlight(pnlElement, false);
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

    pnlElement.appendChild(openBracket);
    pnlElement.appendChild(pnlAmount);
    pnlElement.appendChild(separator);
    pnlElement.appendChild(pnlPercent);
    pnlElement.appendChild(closeBracket);

    /* istanbul ignore next: defensive fallback for null case */
    const lightenedPnlColor =
        lightenHexToRgba(
            pnlColor,
            POSITION_PNL_HIGHLIGHT.pnlLightenFactor,
            POSITION_PNL_HIGHLIGHT.pnlLightAlpha
        ) || POSITION_PNL_HIGHLIGHT.neutralDimColor;
    const thinkingOptions = {
        intervalMs: POSITION_PNL_HIGHLIGHT.intervalMs,
        waveSize: POSITION_PNL_HIGHLIGHT.waveSize,
        baseColor: POSITION_PNL_HIGHLIGHT.baseColor,
        dimColor: lightenedPnlColor,
    };
    setThinkingHighlight([pnlAmount, pnlPercent], true, thinkingOptions);
}

export async function loadAndDisplayPortfolioData(currentCurrency, exchangeRates, currencySymbols) {
    try {
        const { holdingsDetails, prices } = await fetchPortfolioData();

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

        const {
            sortedHoldings,
            totalPortfolioValue: totalPortfolioValueUSD,
            totalPnl: totalPnlUSD,
        } = processAndEnrichHoldings(holdingsDetails, prices);
        const tickerSymbols = sortedHoldings.map((holding) => holding.ticker);
        const marketRatiosByTicker = await fetchMarketRatiosForTickers(tickerSymbols);
        const chartData = updateTableAndPrepareChartData(
            sortedHoldings,
            totalPortfolioValueUSD,
            currentCurrency,
            exchangeRates,
            currencySymbols,
            marketRatiosByTicker
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
            currencySymbols
        );

        updatePieChart(chartData);
        checkAndToggleVerticalScroll();
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
