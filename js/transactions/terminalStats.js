import { formatCurrency, formatCurrencyCompact } from './utils.js';
import { transactionState } from './state.js';
import { getSplitAdjustment } from './calculations.js';
import { loadCompositionSnapshotData } from './dataLoader.js';

let statsDataCache = null;
let holdingsDataCache = null;
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

const MS_IN_DAY = 24 * 60 * 60 * 1000;

export function renderAsciiTable({ title = null, headers = [], rows = [], alignments = [] }) {
    const columnCount = headers.length || (rows[0]?.length ?? 0);
    if (columnCount === 0) {
        return title ? `${title}` : '';
    }

    const normalizedAlignments = Array.from({ length: columnCount }, (_, index) => {
        return alignments[index] || 'left';
    });

    const widths = new Array(columnCount).fill(0);
    headers.forEach((header, index) => {
        widths[index] = Math.max(widths[index], String(header).length);
    });
    rows.forEach((row) => {
        row.forEach((cell, index) => {
            widths[index] = Math.max(widths[index], String(cell ?? '').length);
        });
    });

    const totalWidth = widths.reduce((sum, width) => sum + width + 2, 0) + columnCount + 1;

    const makeBorder = (char = '-') =>
        '+' + widths.map((width) => char.repeat(width + 2)).join('+') + '+';

    const formatRow = (cells) => {
        const formatted = cells.map((cell, index) => {
            const text = String(cell ?? '');
            const width = widths[index];
            const alignment = normalizedAlignments[index];
            if (alignment === 'right') {
                return ` ${text.padStart(width)} `;
            }
            if (alignment === 'center') {
                const leftPadding = Math.floor((width - text.length) / 2);
                const rightPadding = width - text.length - leftPadding;
                return ` ${' '.repeat(leftPadding)}${text}${' '.repeat(rightPadding)} `;
            }
            return ` ${text.padEnd(width)} `;
        });
        return `|${formatted.join('|')}|`;
    };

    const lines = [];
    lines.push(makeBorder('-'));

    if (title) {
        const text = String(title);
        const padding = Math.max(totalWidth - 2 - text.length, 0);
        const leftPadding = Math.floor(padding / 2);
        const rightPadding = padding - leftPadding;
        const titleLine = `|${' '.repeat(leftPadding)}${text}${' '.repeat(rightPadding)}|`;
        lines.push(titleLine);
        lines.push(makeBorder('-'));
    }

    if (headers.length) {
        lines.push(formatRow(headers));
        lines.push(makeBorder('='));
    }

    rows.forEach((row) => {
        lines.push(formatRow(row));
    });

    lines.push(makeBorder('-'));

    return lines.join('\n');
}

export async function getDynamicStatsText(currency = 'USD') {
    const transactions = transactionState.filteredTransactions || [];
    if (transactions.length === 0) {
        return '';
    }

    const normalizedCurrency =
        typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'USD';

    let totalBuy = 0;
    let totalSell = 0;
    let count = 0;

    for (const t of transactions) {
        count++;
        // Use netAmount if available (parsed from CSV)
        const rawAmt = parseFloat(t.netAmount);
        if (Number.isFinite(rawAmt)) {
            if (t.orderType && t.orderType.toLowerCase() === 'sell') {
                totalSell += Math.abs(rawAmt);
            } else {
                totalBuy += Math.abs(rawAmt);
            }
        }
    }

    const netInvested = totalBuy - totalSell; // Cost - Proceeds. Positive = Net Invested (Cash Out). Negative = Net Divested (Cash In).

    const rows = [
        ['Transactions', count.toLocaleString()],
        ['Total Buy', formatCurrency(totalBuy, { currency: normalizedCurrency })],
        ['Total Sell', formatCurrency(totalSell, { currency: normalizedCurrency })],
        ['Net Invested', formatCurrency(netInvested, { currency: normalizedCurrency })],
    ];

    const table = renderAsciiTable({
        title: 'FILTERED STATS',
        headers: [],
        rows,
        alignments: ['left', 'right'],
    });

    return `\n${table}\n`;
}

export async function getStatsText(currency = 'USD') {
    const normalizedCurrency =
        typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'USD';
    try {
        if (!statsDataCache) {
            const response = await fetch('../data/output/transaction_stats.json');
            if (response.ok) {
                statsDataCache = await response.json();
            }
        }
        if (statsDataCache) {
            const availableCurrencies = statsDataCache.currency_values || {};
            const selectedCurrency = availableCurrencies[normalizedCurrency]
                ? normalizedCurrency
                : 'USD';
            const counts = statsDataCache.counts || {};
            const values = availableCurrencies[selectedCurrency] || {};
            const rows = [
                ['Total Transactions', Number(counts.total_transactions || 0).toLocaleString()],
                ['Buy Orders', Number(counts.buy_orders || 0).toLocaleString()],
                ['Sell Orders', Number(counts.sell_orders || 0).toLocaleString()],
                [
                    'Total Buy Amount',
                    formatCurrency(values.total_buy_amount || 0, { currency: selectedCurrency }),
                ],
                [
                    'Total Sell Amount',
                    formatCurrency(values.total_sell_amount || 0, { currency: selectedCurrency }),
                ],
                [
                    'Net Contributions',
                    formatCurrency(values.net_contributions || 0, { currency: selectedCurrency }),
                ],
                [
                    'Realized Gain',
                    formatCurrency(values.realized_gain || 0, { currency: selectedCurrency }),
                ],
            ];
            const table = renderAsciiTable({
                title: 'TRANSACTION STATS',
                headers: ['Metric', 'Value'],
                rows,
                alignments: ['left', 'right'],
            });
            return `\n${table}\n`;
        }
    } catch {
        // Fall through to legacy text fallback
    }

    try {
        const response = await fetch('../data/output/transaction_stats.txt');
        if (!response.ok) {
            return 'Error loading transaction stats.';
        }
        return await response.text();
    } catch {
        return 'Error loading transaction stats.';
    }
}

export async function getHoldingsText(currency = 'USD') {
    const normalizedCurrency =
        typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'USD';
    try {
        if (!holdingsDataCache) {
            const response = await fetch('../data/output/holdings.json');
            if (response.ok) {
                holdingsDataCache = await response.json();
            }
        }
        if (holdingsDataCache) {
            const currencyData = holdingsDataCache[normalizedCurrency]
                ? holdingsDataCache[normalizedCurrency]
                : holdingsDataCache.USD;
            if (!Array.isArray(currencyData) || currencyData.length === 0) {
                return 'No current holdings.';
            }
            const rows = currencyData.map((item) => {
                const shares = Number(item.shares || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                });
                const avgPrice =
                    item.average_price !== null && item.average_price !== undefined
                        ? formatCurrency(item.average_price, { currency: normalizedCurrency })
                        : 'N/A';
                const totalCost =
                    item.total_cost !== null && item.total_cost !== undefined
                        ? formatCurrency(item.total_cost, { currency: normalizedCurrency })
                        : 'N/A';
                return [item.security, shares, avgPrice, totalCost];
            });
            const table = renderAsciiTable({
                title: 'HOLDINGS',
                headers: ['Security', 'Shares', 'Avg Price', 'Total Cost'],
                rows,
                alignments: ['left', 'right', 'right', 'right'],
            });
            return `\n${table}\n`;
        }
    } catch {
        // fallback to legacy text
    }

    try {
        const response = await fetch('../data/output/holdings.txt');
        if (!response.ok) {
            return 'Error loading holdings data.';
        }
        return await response.text();
    } catch {
        return 'Error loading holdings data.';
    }
}

function formatNumeric(value, digits = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return '–';
    }
    return number.toFixed(digits);
}

function formatPercentageValue(value, { digits = 2, mode = 'auto' } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return '–';
    }
    let percentage;
    if (mode === 'percent') {
        percentage = number;
    } else if (mode === 'fraction') {
        percentage = Math.abs(number) > 1 ? number : number * 100;
    } else {
        percentage = Math.abs(number) <= 1 ? number * 100 : number;
    }
    return `${percentage.toFixed(digits)}%`;
}

function formatNumericPair(primaryValue, forwardValue, digits = 2) {
    const primary = formatNumeric(primaryValue, digits);
    const forward = formatNumeric(forwardValue, digits);
    if (primary === '–' && forward === '–') {
        return '–';
    }
    if (forward === '–') {
        return primary;
    }
    if (primary === '–') {
        return forward;
    }
    return `${primary} / ${forward}`;
}

function formatPrice(value, currency = 'USD') {
    const numericPrice = Number(value);
    if (!Number.isFinite(numericPrice)) {
        return '–';
    }
    return formatCurrency(numericPrice, { currency });
}

function formatMarketCap(value, currency = 'USD') {
    const cap = Number(value);
    if (!Number.isFinite(cap)) {
        return '–';
    }
    return formatCurrencyCompact(cap, { currency });
}

function formatVolume(value) {
    const vol = Number(value);
    if (!Number.isFinite(vol) || vol <= 0) {
        return '–';
    }
    const abs = Math.abs(vol);
    if (abs >= 1_000_000_000) {
        return `${(vol / 1_000_000_000).toFixed(2)}B`;
    }
    if (abs >= 1_000_000) {
        return `${(vol / 1_000_000).toFixed(2)}M`;
    }
    if (abs >= 1_000) {
        return `${(vol / 1_000).toFixed(2)}K`;
    }
    return vol.toFixed(0);
}

function format52WeekRange(low, high, currency = 'USD') {
    const lowValue = Number(low);
    const highValue = Number(high);
    const hasLow = Number.isFinite(lowValue);
    const hasHigh = Number.isFinite(highValue);
    if (!hasLow && !hasHigh) {
        return '–';
    }
    if (hasLow && hasHigh) {
        return `${formatCurrency(lowValue, { currency })} – ${formatCurrency(highValue, { currency })}`;
    }
    if (hasLow) {
        return formatCurrency(lowValue, { currency });
    }
    return formatCurrency(highValue, { currency });
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

        return `\n${table}\n`;
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

        return `\n${table}\n`;
    } catch {
        return 'Error loading technical analysis data.';
    }
}

export async function getHoldingsDebugText() {
    const { lotsByTicker } = buildLotSnapshots();
    if (!lotsByTicker || lotsByTicker.size === 0) {
        return 'Transaction ledger not loaded or no active holdings to debug.';
    }

    const entries = [];
    lotsByTicker.forEach((lots, tickerKey) => {
        const totalShares = lots.reduce((sum, lot) => sum + lot.qty, 0);
        if (!Number.isFinite(totalShares)) {
            return;
        }
        if (Math.abs(totalShares) < 1e-15) {
            return;
        }
        const roundedTwo = Math.round(totalShares * 100) / 100;
        entries.push({
            ticker: tickerKey,
            displayTicker: formatTicker(tickerKey),
            shares: totalShares,
            roundedTwo,
            residual: totalShares - roundedTwo,
            absShares: Math.abs(totalShares),
        });
    });

    if (entries.length === 0) {
        return 'No non-zero share balances derived from transactions.';
    }

    entries.sort((a, b) => b.absShares - a.absShares);

    const rows = entries.map((entry) => [
        entry.displayTicker,
        formatShareValue(entry.shares),
        entry.roundedTwo.toFixed(2),
        formatResidualValue(entry.residual),
    ]);

    const table = renderAsciiTable({
        title: 'HOLDINGS DEBUG (RAW SHARES)',
        headers: ['Ticker', 'Shares (raw)', 'Rounded (2dp)', 'Residual'],
        rows,
        alignments: ['left', 'right', 'right', 'right'],
    });

    const note =
        'Computed directly from data/transactions.csv with split adjustments. Residual = raw shares − rounded(2 decimals).';

    return `\n${table}\n\n${note}`;
}

export async function getCagrText() {
    try {
        const response = await fetch('../data/output/cagr.txt');
        if (!response.ok) {
            return 'Error loading CAGR data.';
        }
        return await response.text();
    } catch {
        return 'Error loading CAGR data.';
    }
}

export async function getAnnualReturnText() {
    try {
        const response = await fetch('../data/output/annual_returns.txt');
        if (!response.ok) {
            return 'Error loading annual returns.';
        }
        return await response.text();
    } catch {
        return 'Error loading annual returns.';
    }
}

export async function getRatioText() {
    try {
        const response = await fetch('../data/output/ratios.txt');
        if (!response.ok) {
            return 'Error loading Sharpe and Sortino ratios.';
        }
        return await response.text();
    } catch {
        return 'Error loading Sharpe and Sortino ratios.';
    }
}

export async function getDurationStatsText() {
    const snapshot = await getLatestCompositionSnapshot();
    if (!snapshot) {
        return 'Composition snapshot unavailable. Run `plot composition` first to generate this data.';
    }

    const { lotsByTicker, closedSales } = buildLotSnapshots();
    const hasOpenData = lotsByTicker instanceof Map;
    const hasClosedData = Array.isArray(closedSales) && closedSales.length > 0;
    if (!hasOpenData && !hasClosedData) {
        return 'Transaction history not loaded yet, unable to compute holding durations.';
    }

    const normalizedLots = hasOpenData ? lotsByTicker : new Map();
    const baselineDate = parseDateStrict(snapshot.dateLabel) || new Date();
    const entries = snapshot.holdings
        .map((holding) => {
            const normalizedTicker = normalizeTickerKey(holding.ticker);
            const lots = normalizedLots.get(normalizedTicker);
            if (!lots || lots.length === 0) {
                return null;
            }
            const totalQty = lots.reduce((sum, lot) => sum + lot.qty, 0);
            if (totalQty <= 0) {
                return null;
            }
            const avgAgeDays =
                lots.reduce((sum, lot) => {
                    const diffMs = Math.max(0, baselineDate - lot.date);
                    return sum + lot.qty * (diffMs / MS_IN_DAY);
                }, 0) / totalQty;
            return {
                ticker: formatTicker(holding.ticker),
                weight: holding.weight,
                percent: holding.percent,
                avgAgeDays,
                openShares: totalQty,
            };
        })
        .filter(Boolean);

    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    const weightedAvgDays =
        totalWeight > 0
            ? entries.reduce((sum, entry) => sum + entry.weight * entry.avgAgeDays, 0) / totalWeight
            : null;
    const medianDays = computeWeightedMedian(
        entries,
        (entry) => entry.weight,
        (entry) => entry.avgAgeDays
    );

    const summaryRows = [['Snapshot Date', snapshot.dateLabel || 'Latest']];
    if (entries.length) {
        summaryRows.push([
            'Weighted Avg Age (Open)',
            Number.isFinite(weightedAvgDays)
                ? `${Math.round(weightedAvgDays).toLocaleString()} days (${formatDurationLabel(
                      weightedAvgDays
                  )})`
                : 'N/A',
        ]);
        summaryRows.push([
            'Weighted Median Age (Open)',
            Number.isFinite(medianDays)
                ? `${Math.round(medianDays).toLocaleString()} days (${formatDurationLabel(
                      medianDays
                  )})`
                : 'N/A',
        ]);
    }

    const totalClosedQty = hasClosedData
        ? closedSales.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
        : 0;
    const weightedClosedAvgDays =
        totalClosedQty > 0
            ? closedSales.reduce(
                  (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.days) || 0),
                  0
              ) / totalClosedQty
            : null;
    if (Number.isFinite(weightedClosedAvgDays)) {
        summaryRows.push([
            'Weighted Avg Age (Closed)',
            `${Math.round(weightedClosedAvgDays).toLocaleString()} days (${formatDurationLabel(
                weightedClosedAvgDays
            )})`,
        ]);
    }

    const totalOpenShareWeight = entries.reduce((sum, entry) => sum + entry.openShares, 0);
    const openShareWeightedSum = entries.reduce(
        (sum, entry) => sum + entry.openShares * entry.avgAgeDays,
        0
    );
    const allDenominator = totalOpenShareWeight + totalClosedQty;
    const weightedAvgAll =
        allDenominator > 0
            ? (openShareWeightedSum + (weightedClosedAvgDays || 0) * totalClosedQty) /
              allDenominator
            : null;
    if (Number.isFinite(weightedAvgAll)) {
        summaryRows.push([
            'Weighted Avg Age (All)',
            `${Math.round(weightedAvgAll).toLocaleString()} days (${formatDurationLabel(
                weightedAvgAll
            )})`,
        ]);
    }

    const summaryTable = renderAsciiTable({
        title: 'HOLDING DURATION',
        headers: [],
        rows: summaryRows,
        alignments: ['left', 'right'],
    });

    const detailRows = entries
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .slice(0, Math.min(entries.length, 8))
        .map((entry) => [
            entry.ticker,
            `${entry.percent.toFixed(2)}%`,
            Math.round(entry.avgAgeDays).toLocaleString(),
            formatYearsValue(entry.avgAgeDays),
        ]);

    const detailTable = detailRows.length
        ? renderAsciiTable({
              title: 'WEIGHTED HOLDING AGES (TOP POSITIONS)',
              headers: ['Ticker', 'Weight', 'Avg Days', 'Avg Years'],
              rows: detailRows,
              alignments: ['left', 'right', 'right', 'right'],
          })
        : '';

    const note =
        'Method: FIFO lot ages (split-adjusted) derived from the transaction ledger, weighted by the latest portfolio composition.';

    return detailTable
        ? `
${summaryTable}

${detailTable}

${note}`
        : `
${summaryTable}

${note}`;
}

export async function getLifespanStatsText() {
    const snapshot = await getLatestCompositionSnapshot();
    if (!snapshot) {
        return 'Composition snapshot unavailable. Run `plot composition` first to generate this data.';
    }
    const { lotsByTicker, currentPeriodStart, closedPeriods } = buildLotSnapshots();
    const hasOpenData = currentPeriodStart instanceof Map ? currentPeriodStart.size > 0 : false;
    const hasClosedData = Array.isArray(closedPeriods) && closedPeriods.length > 0;
    if (!hasOpenData && !hasClosedData) {
        return 'Transaction history not loaded yet, unable to compute holding lifespans.';
    }

    const baselineDate = parseDateStrict(snapshot.dateLabel) || new Date();
    const openEntries = snapshot.holdings
        .map((holding) => {
            const normalizedTicker = normalizeTickerKey(holding.ticker);
            const startDate = currentPeriodStart?.get(normalizedTicker);
            if (!(startDate instanceof Date)) {
                return null;
            }
            const lots = lotsByTicker?.get(normalizedTicker) || [];
            const openShares = lots.reduce((sum, lot) => sum + lot.qty, 0);
            if (!Number.isFinite(openShares) || openShares <= 0) {
                return null;
            }
            const spanDays = Math.max(0, (baselineDate - startDate) / MS_IN_DAY);
            return {
                ticker: formatTicker(holding.ticker),
                spanDays,
                openShares,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.spanDays - a.spanDays);

    const openRows = openEntries
        .slice(0, Math.min(openEntries.length, 8))
        .map((entry) => [
            entry.ticker,
            formatShareValueShort(entry.openShares),
            Math.round(entry.spanDays).toLocaleString(),
            formatYearsValue(entry.spanDays),
        ]);

    const openTable = openRows.length
        ? renderAsciiTable({
              title: 'POSITION LIFESPAN (OPEN TICKERS)',
              headers: ['Ticker', 'Open Shares', 'Span Days', 'Span Years'],
              rows: openRows,
              alignments: ['left', 'right', 'right', 'right'],
          })
        : '';

    const openTickerSet = new Set(
        snapshot.holdings.map((holding) => normalizeTickerKey(holding.ticker))
    );
    const closedEntries = (Array.isArray(closedPeriods) ? closedPeriods : [])
        .filter((period) => !openTickerSet.has(normalizeTickerKey(period.ticker || '')))
        .map((period) => ({
            ticker: formatTicker(period.ticker),
            shares: Number(period.shares) || 0,
            spanDays:
                period.start instanceof Date && period.end instanceof Date
                    ? Math.max(0, (period.end - period.start) / MS_IN_DAY)
                    : null,
        }))
        .filter((entry) => Number.isFinite(entry.spanDays) && entry.spanDays !== null)
        .sort((a, b) => b.spanDays - a.spanDays);

    const closedRows = closedEntries
        .slice(0, Math.min(closedEntries.length, 8))
        .map((entry) => [
            entry.ticker,
            formatShareValueShort(entry.shares),
            Math.round(entry.spanDays).toLocaleString(),
            formatYearsValue(entry.spanDays),
        ]);

    const closedTable = closedRows.length
        ? renderAsciiTable({
              title: 'POSITION LIFESPAN (CLOSED TICKERS)',
              headers: ['Ticker', 'Closed Shares', 'Span Days', 'Span Years'],
              rows: closedRows,
              alignments: ['left', 'right', 'right', 'right'],
          })
        : '';

    const summaryRows = [['Snapshot Date', snapshot.dateLabel || 'Latest']];
    const openShareSum = openEntries.reduce((sum, entry) => sum + entry.openShares, 0);
    const openWeightedSpanSum = openEntries.reduce(
        (sum, entry) => sum + entry.spanDays * entry.openShares,
        0
    );
    const weightedAvgOpen = openShareSum > 0 ? openWeightedSpanSum / openShareSum : null;
    const closedShareSum = closedEntries.reduce((sum, entry) => sum + entry.shares, 0);
    const closedWeightedSpanSum = closedEntries.reduce(
        (sum, entry) => sum + entry.spanDays * entry.shares,
        0
    );
    const weightedAvgClosed = closedShareSum > 0 ? closedWeightedSpanSum / closedShareSum : null;
    const combinedDenominator = openShareSum + closedShareSum;
    const weightedAvgAll =
        combinedDenominator > 0
            ? (openWeightedSpanSum + closedWeightedSpanSum) / combinedDenominator
            : null;

    if (Number.isFinite(weightedAvgOpen)) {
        summaryRows.push([
            'Weighted Avg (Open)',
            `${Math.round(weightedAvgOpen).toLocaleString()} days (${formatDurationLabel(
                weightedAvgOpen
            )})`,
        ]);
    }
    if (Number.isFinite(weightedAvgClosed)) {
        summaryRows.push([
            'Weighted Avg (Closed)',
            `${Math.round(weightedAvgClosed).toLocaleString()} days (${formatDurationLabel(
                weightedAvgClosed
            )})`,
        ]);
    }
    if (Number.isFinite(weightedAvgAll)) {
        summaryRows.push([
            'Weighted Avg (All)',
            `${Math.round(weightedAvgAll).toLocaleString()} days (${formatDurationLabel(
                weightedAvgAll
            )})`,
        ]);
    }
    if (openEntries.length) {
        summaryRows.push([
            'Longest Open Position',
            `${openEntries[0].ticker} · ${Math.round(openEntries[0].spanDays).toLocaleString()} days`,
        ]);
    }
    if (closedEntries.length) {
        summaryRows.push([
            'Longest Closed Position',
            `${closedEntries[0].ticker} · ${Math.round(closedEntries[0].spanDays).toLocaleString()} days`,
        ]);
    }
    if (!openEntries.length && !closedEntries.length) {
        summaryRows.push(['Positions', 'No lifespan data available']);
    }

    const summaryTable = renderAsciiTable({
        title: 'HOLDING LIFESPAN',
        headers: [],
        rows: summaryRows,
        alignments: ['left', 'right'],
    });

    const sections = [`\n${summaryTable}`];
    if (openTable) {
        sections.push(openTable);
    }
    if (closedTable) {
        sections.push(closedTable);
    }

    const note =
        'Method: measures the span between the first recorded buy and the latest snapshot (for open tickers) or final sell (for closed tickers).';

    return sections.length > 1
        ? `${sections.join('\n\n')}\n\n${note}`
        : `${sections[0]}\n\n${note}`;
}

export async function getConcentrationText() {
    const snapshot = await getLatestCompositionSnapshot();
    if (!snapshot) {
        return 'Composition snapshot unavailable. Run `plot composition` first to generate this data.';
    }

    const holdings = snapshot.holdings.filter(
        (item) => Number.isFinite(item.weight) && item.weight > 0
    );
    if (holdings.length === 0) {
        return 'No positive weights in composition data.';
    }

    const totalWeight = holdings.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
        return 'No positive weights in composition data.';
    }

    const normalized = holdings
        .map((item) => ({
            ...item,
            ticker: formatTicker(item.ticker),
            normalizedWeight: item.weight / totalWeight,
        }))
        .sort((a, b) => b.normalizedWeight - a.normalizedWeight);

    const hhi = normalized.reduce(
        (sum, item) => sum + item.normalizedWeight * item.normalizedWeight,
        0
    );
    const effectiveHoldings = hhi > 0 ? 1 / hhi : null;
    const top3Weight = normalized.slice(0, 3).reduce((sum, item) => sum + item.normalizedWeight, 0);
    const top5Weight = normalized.slice(0, 5).reduce((sum, item) => sum + item.normalizedWeight, 0);
    const topHolding = normalized[0];

    const summaryRows = [
        ['Snapshot Date', snapshot.dateLabel || 'Latest'],
        [
            'Equivalent Holdings',
            Number.isFinite(effectiveHoldings) ? effectiveHoldings.toFixed(2) : 'N/A',
        ],
        ['HHI (0-1)', Number.isFinite(hhi) ? hhi.toFixed(3) : 'N/A'],
        [
            'Top Holding',
            topHolding
                ? `${topHolding.ticker} · ${formatPercent(topHolding.normalizedWeight)}`
                : 'N/A',
        ],
        ['Top 3 Weight', formatPercent(top3Weight)],
        ['Top 5 Weight', formatPercent(top5Weight)],
    ];

    const summaryTable = renderAsciiTable({
        title: 'PORTFOLIO CONCENTRATION',
        headers: [],
        rows: summaryRows,
        alignments: ['left', 'right'],
    });

    const detailRows = normalized
        .slice(0, Math.min(normalized.length, 10))
        .map((item) => [
            item.ticker,
            formatPercent(item.normalizedWeight),
            `${(item.normalizedWeight * item.normalizedWeight * 100).toFixed(2)} pts`,
        ]);

    const detailTable = renderAsciiTable({
        title: 'HHI CONTRIBUTION (TOP 10)',
        headers: ['Ticker', 'Weight', 'w² (pts)'],
        rows: detailRows,
        alignments: ['left', 'right', 'right'],
    });

    const note =
        'Method: Herfindahl-Hirschman Index (HHI = Σ wᵢ²) computed with normalized portfolio weights. Equivalent holdings = 1 / HHI.';

    return `\n${summaryTable}\n\n${detailTable}\n\n${note}`;
}

function formatPercent(value) {
    if (!Number.isFinite(value) || value <= 0) {
        return '0.00%';
    }
    return `${(value * 100).toFixed(2)}%`;
}

function formatShareValue(value) {
    if (!Number.isFinite(value)) {
        return '0.000000';
    }
    return value.toFixed(6);
}

function formatShareValueShort(value) {
    if (!Number.isFinite(value)) {
        return '0.00';
    }
    return value.toFixed(2);
}

function formatResidualValue(value) {
    if (!Number.isFinite(value)) {
        return 'N/A';
    }
    if (Math.abs(value) < 1e-9) {
        return '0';
    }
    return value.toFixed(6);
}

function normalizeTickerKey(ticker) {
    if (typeof ticker !== 'string') {
        return '';
    }
    return ticker.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function formatTicker(ticker) {
    if (ticker === 'BRKB') {
        return 'BRK-B';
    }
    return ticker || 'N/A';
}

function parseDateStrict(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDurationLabel(days) {
    if (!Number.isFinite(days) || days < 0) {
        return 'N/A';
    }
    if (days >= 730) {
        return `${(days / 365).toFixed(1)} yrs`;
    }
    if (days >= 365) {
        return `${(days / 365).toFixed(2)} yrs`;
    }
    if (days >= 60) {
        return `${(days / 30).toFixed(1)} mos`;
    }
    return `${Math.round(days)} days`;
}

function formatYearsValue(days) {
    if (!Number.isFinite(days) || days < 0) {
        return 'N/A';
    }
    return `${(days / 365).toFixed(2)}y`;
}

function computeWeightedMedian(entries, weightGetter, valueGetter) {
    const normalized = entries
        .map((entry) => {
            const weight = weightGetter(entry);
            const value = valueGetter(entry);
            if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(value)) {
                return null;
            }
            return { weight, value };
        })
        .filter(Boolean)
        .sort((a, b) => a.value - b.value);

    const totalWeight = normalized.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
        return null;
    }
    let cumulative = 0;
    for (let i = 0; i < normalized.length; i += 1) {
        cumulative += normalized[i].weight;
        if (cumulative >= totalWeight / 2) {
            return normalized[i].value;
        }
    }
    return normalized.length ? normalized[normalized.length - 1].value : null;
}

async function getLatestCompositionSnapshot() {
    const data = await loadCompositionSnapshotData();
    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray(data.dates) ||
        data.dates.length === 0
    ) {
        return null;
    }
    const compositionSeries = data.composition || data.series;
    if (!compositionSeries || typeof compositionSeries !== 'object') {
        return null;
    }

    let targetIndex = data.dates.length - 1;
    const hasValuesAtIndex = (index) => {
        return Object.values(compositionSeries).some((values) => {
            const seriesValues = Array.isArray(values) ? values : [];
            const percent = Number(seriesValues[index] ?? 0);
            return Number.isFinite(percent) && percent > 0;
        });
    };

    while (targetIndex >= 0 && !hasValuesAtIndex(targetIndex)) {
        targetIndex -= 1;
    }

    if (targetIndex < 0) {
        return null;
    }

    const holdings = [];
    Object.entries(compositionSeries).forEach(([ticker, values]) => {
        const seriesValues = Array.isArray(values) ? values : [];
        const percent = Number(seriesValues[targetIndex] ?? 0);
        if (!Number.isFinite(percent) || percent <= 0) {
            return;
        }
        holdings.push({
            ticker,
            percent,
            weight: percent / 100,
        });
    });

    holdings.sort((a, b) => b.weight - a.weight);

    return {
        dateLabel: data.dates[targetIndex],
        holdings,
    };
}

function buildLotSnapshots() {
    const transactions = Array.isArray(transactionState.allTransactions)
        ? [...transactionState.allTransactions]
        : [];
    if (!transactions.length) {
        return {
            lotsByTicker: null,
            closedSales: [],
            currentPeriodStart: new Map(),
            closedPeriods: [],
        };
    }
    const rawTransactions = transactions;
    const splitHistory = Array.isArray(transactionState.splitHistory)
        ? transactionState.splitHistory
        : [];
    const sorted = rawTransactions.sort((a, b) => {
        const timeA = parseDateStrict(a.tradeDate)?.getTime() ?? 0;
        const timeB = parseDateStrict(b.tradeDate)?.getTime() ?? 0;
        if (timeA !== timeB) {
            return timeA - timeB;
        }
        const idA = Number(a.transactionId) || 0;
        const idB = Number(b.transactionId) || 0;
        return idA - idB;
    });

    const lotsByTicker = new Map();
    const closedSales = [];
    const currentPeriodStart = new Map();
    const currentPeriodShares = new Map();
    const closedPeriods = [];

    sorted.forEach((transaction) => {
        const rawSymbol = typeof transaction.security === 'string' ? transaction.security : '';
        const orderType = typeof transaction.orderType === 'string' ? transaction.orderType : '';
        const normalizedTicker = normalizeTickerKey(rawSymbol);
        if (!rawSymbol || !normalizedTicker) {
            return;
        }
        const tradeDate = parseDateStrict(transaction.tradeDate);
        if (!tradeDate) {
            return;
        }
        const quantity = parseFloat(transaction.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            return;
        }
        const adjustment = getSplitAdjustment(splitHistory, rawSymbol, transaction.tradeDate);
        const adjustedQty = quantity * (Number.isFinite(adjustment) ? adjustment : 1);
        if (!Number.isFinite(adjustedQty) || adjustedQty <= 0) {
            return;
        }

        const lots = lotsByTicker.get(normalizedTicker) || [];
        const normalizedOrderType = orderType.toLowerCase();
        if (normalizedOrderType === 'buy') {
            lots.push({ qty: adjustedQty, date: tradeDate });
            lotsByTicker.set(normalizedTicker, lots);
            if (!currentPeriodStart.has(normalizedTicker)) {
                currentPeriodStart.set(normalizedTicker, tradeDate);
                currentPeriodShares.set(normalizedTicker, 0);
            }
            const periodTotal = currentPeriodShares.get(normalizedTicker) || 0;
            currentPeriodShares.set(normalizedTicker, periodTotal + adjustedQty);
        } else if (normalizedOrderType === 'sell') {
            let remaining = adjustedQty;
            while (remaining > 0 && lots.length > 0) {
                const lot = lots[0];
                const used = Math.min(remaining, lot.qty);
                const holdingDays =
                    lot.date && tradeDate ? Math.max(0, (tradeDate - lot.date) / MS_IN_DAY) : null;
                if (Number.isFinite(holdingDays) && used > 0) {
                    closedSales.push({
                        ticker: normalizedTicker,
                        qty: used,
                        days: holdingDays,
                        opened: lot.date,
                        closed: tradeDate,
                    });
                }
                lot.qty -= used;
                remaining -= used;
                if (lot.qty <= 1e-8) {
                    lots.shift();
                }
            }
            if (lots.length > 0) {
                lotsByTicker.set(normalizedTicker, lots);
            } else {
                lotsByTicker.delete(normalizedTicker);
                const periodStart = currentPeriodStart.get(normalizedTicker);
                if (periodStart instanceof Date) {
                    const totalShares = currentPeriodShares.get(normalizedTicker) || 0;
                    closedPeriods.push({
                        ticker: normalizedTicker,
                        start: periodStart,
                        end: tradeDate,
                        shares: totalShares,
                    });
                }
                currentPeriodStart.delete(normalizedTicker);
                currentPeriodShares.delete(normalizedTicker);
            }
        }
    });

    return {
        lotsByTicker,
        closedSales,
        currentPeriodStart,
        closedPeriods,
    };
}
