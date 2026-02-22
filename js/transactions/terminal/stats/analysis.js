import { transactionState } from '../../state.js';
import { getSplitAdjustment } from '../../calculations.js';
import { loadCompositionSnapshotData } from '../../dataLoader.js';
import {
    renderAsciiTable,
    formatDurationLabel,
    formatYearsValue,
    formatShareValueShort,
    formatPercent,
    formatTicker,
} from './formatting.js';
import { logger } from '@utils/logger.js';

const MS_IN_DAY = 24 * 60 * 60 * 1000;

function parseDateStrict(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTickerKey(ticker) {
    if (typeof ticker !== 'string') {
        return '';
    }
    return ticker.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
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

/**
 * ETF internal HHI values loaded from data/etf_hhi.json.
 * Populated asynchronously when the module loads.
 */
let ETF_INTERNAL_HHI = {};

/**
 * Load ETF HHI data from JSON file.
 * This data is calculated from sector/country/marketcap allocations.
 */
async function loadETFHHIData() {
    if (Object.keys(ETF_INTERNAL_HHI).length > 0) {
        return ETF_INTERNAL_HHI; // Already loaded
    }

    try {
        const response = await fetch('../data/etf_hhi.json');
        if (!response.ok) {
            logger.warn('ETF HHI data not found, using fallback values');
            // Fallback to minimal set
            ETF_INTERNAL_HHI = {
                VT: 4019,
                VOO: 6488,
                QQQ: 7398,
                SPY: 1733,
                VTI: 4050,
            };
            return ETF_INTERNAL_HHI;
        }

        const data = await response.json();
        // Filter to just the numeric HHI values (exclude metadata keys)
        ETF_INTERNAL_HHI = Object.fromEntries(
            Object.entries(data).filter(
                ([key, value]) => !key.startsWith('_') && typeof value === 'number'
            )
        );

        return ETF_INTERNAL_HHI;
    } catch (error) {
        logger.warn('Failed to load ETF HHI data:', error);
        // Fallback to minimal set
        ETF_INTERNAL_HHI = {
            VT: 4019,
            VOO: 6488,
            QQQ: 7398,
            SPY: 1733,
            VTI: 4050,
        };
        return ETF_INTERNAL_HHI;
    }
}

/**
 * Calculate adjusted HHI contribution for a holding.
 * For ETFs, we adjust by their internal diversification.
 * For individual stocks, HHI contribution = weight².
 * For ETFs, HHI contribution = weight² × (ETF_HHI / 10000).
 */
function calculateAdjustedHhiContribution(ticker, normalizedWeight) {
    const etfHhi = ETF_INTERNAL_HHI[ticker];
    if (etfHhi) {
        // ETF: adjust by internal HHI
        return normalizedWeight * normalizedWeight * (etfHhi / 10000);
    }
    // Individual stock: full weight squared
    return normalizedWeight * normalizedWeight;
}

export function buildLotSnapshots() {
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
                ? `${Math.round(weightedAvgDays).toLocaleString()} days (${formatDurationLabel(weightedAvgDays)})`
                : 'N/A',
        ]);
        summaryRows.push([
            'Weighted Median Age (Open)',
            Number.isFinite(medianDays)
                ? `${Math.round(medianDays).toLocaleString()} days (${formatDurationLabel(medianDays)})`
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
    // Ensure ETF HHI data is loaded
    await loadETFHHIData();

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

    // Calculate adjusted HHI using ETF internal diversification
    const hhi = normalized.reduce(
        (sum, item) => sum + calculateAdjustedHhiContribution(item.ticker, item.normalizedWeight),
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

    const detailRows = normalized.slice(0, Math.min(normalized.length, 10)).map((item) => {
        const adjustedContribution = calculateAdjustedHhiContribution(
            item.ticker,
            item.normalizedWeight
        );
        const etfHhi = ETF_INTERNAL_HHI[item.ticker];

        // For ETFs, mark with footnote
        if (etfHhi) {
            return [
                `${item.ticker}¹`,
                formatPercent(item.normalizedWeight),
                `${(adjustedContribution * 100).toFixed(2)}`,
            ];
        }

        return [
            item.ticker,
            formatPercent(item.normalizedWeight),
            `${(adjustedContribution * 100).toFixed(2)}`,
        ];
    });

    const detailTable = renderAsciiTable({
        title: 'HHI CONTRIBUTION (TOP 10)',
        headers: ['Ticker', 'Weight', 'Adj. w² (pts)'],
        rows: detailRows,
        alignments: ['left', 'right', 'right'],
    });

    // Build footnote with only ETFs in top 10
    const etfsInTop10 = normalized
        .slice(0, 10)
        .filter((item) => ETF_INTERNAL_HHI[item.ticker])
        .map((item) => `${item.ticker}=${ETF_INTERNAL_HHI[item.ticker]}`);

    const etfFootnote =
        etfsInTop10.length > 0
            ? `¹ ETF-adjusted: ${etfsInTop10.join(', ')}. Values reflect ETF's internal diversification.\n`
            : '';

    const note = [
        etfFootnote,
        'Method: HHI = Σ wᵢ² (with ETF adjustment). For ETFs: wᵢ² × (ETF_HHI/10000). Equivalent holdings = 1 / HHI.',
    ]
        .filter(Boolean)
        .join('\n');

    return `\n${summaryTable}\n\n${detailTable}\n\n${note}`;
}
