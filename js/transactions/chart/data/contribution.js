import { transactionState } from '../../state.js';
import { convertValueToCurrency } from '../../utils.js';
import { getSplitAdjustment } from '../../calculations.js';
import { parseLocalDate } from '../helpers.js';

const contributionSeriesCache = new WeakMap();

export function getContributionSeriesForTransactions(
    transactions,
    { includeSyntheticStart = false, padToDate = null, currency = null } = {}
) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }
    const splitHistoryRef = transactionState.splitHistory;
    const cached = contributionSeriesCache.get(transactions);
    const targetCurrency = currency || transactionState.selectedCurrency || 'USD';
    if (
        cached &&
        cached.splitHistory === splitHistoryRef &&
        cached.includeSyntheticStart === includeSyntheticStart &&
        cached.padToDate === padToDate &&
        cached.currency === targetCurrency
    ) {
        return cached.series;
    }
    const series = buildContributionSeriesFromTransactions(transactions, {
        includeSyntheticStart,
        padToDate,
        currency: targetCurrency,
    });
    contributionSeriesCache.set(transactions, {
        splitHistory: splitHistoryRef,
        includeSyntheticStart,
        padToDate,
        currency: targetCurrency,
        series,
    });
    return series;
}

export function buildContributionSeriesFromTransactions(
    transactions,
    { includeSyntheticStart = false, padToDate = null, currency = null } = {}
) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }

    const normalizedTransactions = transactions.map((t) => {
        const d = parseLocalDate(t.tradeDate);
        const isoDate = d ? d.toISOString().split('T')[0] : (t.tradeDate || '').trim();
        return { ...t, tradeDate: isoDate };
    });

    const sortedTransactions = normalizedTransactions.sort(
        (a, b) =>
            (a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0) ||
            (a.transactionId ?? 0) - (b.transactionId ?? 0)
    );

    // Consolidate transactions by date
    const dailyMap = new Map();
    for (let i = 0; i < sortedTransactions.length; i++) {
        const t = sortedTransactions[i];
        const dateStr = t.tradeDate;
        if (!dailyMap.has(dateStr)) {
            dailyMap.set(dateStr, {
                netAmount: 0,
                orderTypes: new Set(),
                buyVolume: 0,
                sellVolume: 0,
            });
        }
        const entry = dailyMap.get(dateStr);
        const amount = Number.parseFloat(t.netAmount) || 0;
        entry.netAmount += amount;
        entry.orderTypes.add(t.orderType);

        const type = String(t.orderType).toLowerCase();
        if (type === 'buy') {
            entry.buyVolume += Math.abs(amount);
        } else if (type === 'sell') {
            entry.sellVolume += Math.abs(amount);
        }
    }

    // Bolt: Replaced Array.from(dailyMap.keys()).sort() with explicit pre-allocated array and manual iteration to reduce GC overhead
    const uniqueDates = new Array(dailyMap.size);
    let dateIdx = 0;
    for (const dateStr of dailyMap.keys()) {
        uniqueDates[dateIdx++] = dateStr;
    }
    uniqueDates.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const series = [];
    let cumulativeAmount = 0;

    for (let index = 0; index < uniqueDates.length; index++) {
        const dateStr = uniqueDates[index];
        const entry = dailyMap.get(dateStr);
        const netDelta = entry.netAmount;

        if (index > 0) {
            const prevDateStr = uniqueDates[index - 1];
            const prevDate = new Date(prevDateStr);
            const currentDate = new Date(dateStr);

            if (prevDate.toISOString().split('T')[0] !== currentDate.toISOString().split('T')[0]) {
                const intermediateDate = new Date(currentDate);
                intermediateDate.setDate(intermediateDate.getDate() - 1);

                // Only add padding if there is actually a gap > 1 day
                const prevPlusOne = new Date(prevDate);
                prevPlusOne.setDate(prevPlusOne.getDate() + 1);

                if (intermediateDate > prevDate) {
                    series.push({
                        tradeDate: intermediateDate.toISOString().split('T')[0],
                        amount: cumulativeAmount,
                        value: cumulativeAmount,
                        orderType: 'padding',
                        netAmount: 0,
                    });
                }
            }
        }

        cumulativeAmount += netDelta;

        // Determine a representative order type for the consolidated point
        let orderType = 'mixed';
        if (entry.orderTypes.size === 1) {
            orderType = entry.orderTypes.values().next().value;
        } else if (entry.orderTypes.size > 0) {
            let allBuy = true;
            let allSell = true;
            for (const t of entry.orderTypes) {
                const lowerT = String(t).toLowerCase();
                if (lowerT !== 'buy') {allBuy = false;}
                if (lowerT !== 'sell') {allSell = false;}
                if (!allBuy && !allSell) {break;}
            }
            if (allBuy) {
                orderType = 'buy';
            } else if (allSell) {
                orderType = 'sell';
            }
        }

        series.push({
            tradeDate: dateStr,
            amount: cumulativeAmount,
            value: cumulativeAmount,
            orderType: orderType,
            netAmount: netDelta,
            buyVolume: entry.buyVolume,
            sellVolume: entry.sellVolume,
        });
    }

    const lastPoint = series[series.length - 1];
    if (lastPoint) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDateRaw = padToDate ? new Date(padToDate) : today;
        const targetDate = Number.isNaN(targetDateRaw.getTime()) ? today : targetDateRaw;
        targetDate.setHours(0, 0, 0, 0);
        const clampedTarget = targetDate > today ? today : targetDate;
        const lastTransactionDate = new Date(lastPoint.tradeDate);

        if (clampedTarget > lastTransactionDate) {
            series.push({
                tradeDate: clampedTarget.toISOString().split('T')[0],
                amount: lastPoint.amount,
                value: lastPoint.amount,
                orderType: 'padding',
                netAmount: 0,
            });
        }
    }

    if (includeSyntheticStart && series.length > 0) {
        const epsilon = 1e-6;
        const firstActual =
            series.find((point) => (point.orderType || '').toLowerCase() !== 'padding') ||
            series[0];
        const firstValue = Number(firstActual?.amount) || 0;
        const firstDate = new Date(firstActual?.tradeDate || firstActual?.date);
        if (!Number.isNaN(firstDate.getTime()) && Math.abs(firstValue) > epsilon) {
            const syntheticDate = new Date(firstDate);
            syntheticDate.setDate(syntheticDate.getDate() - 1);
            const syntheticDateStr = syntheticDate.toISOString().split('T')[0];
            const existing = series.find((point) => point.tradeDate === syntheticDateStr);
            if (!existing) {
                series.unshift({
                    tradeDate: syntheticDateStr,
                    amount: 0,
                    value: 0,
                    orderType: 'padding',
                    netAmount: 0,
                    synthetic: true,
                });
            }
        }
    }

    const selectedCurrency = currency || transactionState.selectedCurrency || 'USD';
    if (selectedCurrency === 'USD') {
        return series;
    }

    let cumulative = 0;
    return series.map((point) => {
        const dateRef = point.tradeDate || point.date;
        const convertedNet = convertValueToCurrency(point.netAmount, dateRef, selectedCurrency);
        cumulative += convertedNet;
        return {
            ...point,
            netAmount: convertedNet,
            amount: cumulative,
            value: cumulative,
            buyVolume: point.buyVolume
                ? convertValueToCurrency(point.buyVolume, dateRef, selectedCurrency)
                : point.buyVolume,
            sellVolume: point.sellVolume
                ? convertValueToCurrency(point.sellVolume, dateRef, selectedCurrency)
                : point.sellVolume,
        };
    });
}

function normalizeSymbolForPricing(symbol) {
    if (typeof symbol !== 'string') {
        return symbol;
    }
    return symbol.replace(/-/g, '').toUpperCase();
}

function getPriceFromHistoricalData(historicalPrices, symbol, dateStr) {
    if (!historicalPrices || typeof historicalPrices !== 'object') {
        return null;
    }
    const normalized = normalizeSymbolForPricing(symbol);
    const priceSeries =
        historicalPrices[normalized] ||
        historicalPrices[symbol] ||
        historicalPrices[symbol?.toUpperCase?.()] ||
        null;
    if (!priceSeries) {
        return null;
    }
    if (priceSeries[dateStr] !== undefined) {
        return priceSeries[dateStr];
    }
    const fallbackDate = new Date(dateStr);
    if (Number.isNaN(fallbackDate.getTime())) {
        return null;
    }
    for (let i = 0; i < 10; i += 1) {
        fallbackDate.setDate(fallbackDate.getDate() - 1);
        const priorStr = fallbackDate.toISOString().split('T')[0];
        if (priceSeries[priorStr] !== undefined) {
            return priceSeries[priorStr];
        }
    }
    return null;
}

export function buildFilteredBalanceSeries(transactions, historicalPrices, splitHistory) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }

    const tsCache = new Map();
    const getTs = (t) => {
        let ts = tsCache.get(t);
        if (ts === undefined) {
            ts = new Date(t.tradeDate).getTime();
            tsCache.set(t, ts);
        }
        return ts;
    };
    const sortedTransactions = [...transactions].sort(
        (a, b) => getTs(a) - getTs(b) || (a.transactionId ?? 0) - (b.transactionId ?? 0)
    );

    const firstDate = new Date(sortedTransactions[0].tradeDate);
    const lastTransactionDate = new Date(
        sortedTransactions[sortedTransactions.length - 1].tradeDate
    );
    if (Number.isNaN(firstDate.getTime()) || Number.isNaN(lastTransactionDate.getTime())) {
        return [];
    }

    firstDate.setHours(0, 0, 0, 0);
    lastTransactionDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastDate = today > lastTransactionDate ? today : lastTransactionDate;

    const splitsByDate = new Map();
    const splitArr = Array.isArray(splitHistory) ? splitHistory : [];
    for (let i = 0; i < splitArr.length; i++) {
        const split = splitArr[i];
        if (!split || !split.splitDate || !split.symbol) {
            continue;
        }
        const dateKey = new Date(split.splitDate).toISOString().split('T')[0];
        const multiplier = Number(split.splitMultiplier) || Number(split.split_multiplier) || 1;
        const symbolKey = normalizeSymbolForPricing(split.symbol);
        if (!splitsByDate.has(dateKey)) {
            splitsByDate.set(dateKey, []);
        }
        splitsByDate.get(dateKey).push({ symbol: symbolKey, multiplier });
    }

    const transactionsByDate = new Map();
    for (let i = 0; i < sortedTransactions.length; i++) {
        const txn = sortedTransactions[i];
        const dateStr = new Date(txn.tradeDate).toISOString().split('T')[0];
        if (!transactionsByDate.has(dateStr)) {
            transactionsByDate.set(dateStr, []);
        }
        transactionsByDate.get(dateStr).push(txn);
    }

    const holdings = new Map();
    const lastKnownPrices = new Map(); // Track last known price from transactions
    const series = [];
    const iterationStart = new Date(firstDate);
    iterationStart.setDate(iterationStart.getDate() - 1);

    const iterDate = new Date(iterationStart);

    while (iterDate <= lastDate) {
        const dateStr = iterDate.toISOString().split('T')[0];

        const splitsToday = splitsByDate.get(dateStr);
        if (splitsToday) {
            for (let i = 0; i < splitsToday.length; i++) {
                const { symbol, multiplier } = splitsToday[i];
                if (!Number.isFinite(multiplier) || multiplier <= 0) {
                    continue;
                }
                const currentQty = holdings.get(symbol);
                if (currentQty !== undefined) {
                    holdings.set(symbol, currentQty * multiplier);
                }
                // Adjust last known price for split
                const lastPrice = lastKnownPrices.get(symbol);
                if (lastPrice !== undefined && multiplier > 0) {
                    lastKnownPrices.set(symbol, lastPrice / multiplier);
                }
            }
        }

        const todaysTransactions = transactionsByDate.get(dateStr) || [];
        for (let i = 0; i < todaysTransactions.length; i++) {
            const txn = todaysTransactions[i];
            const normalizedSymbol = normalizeSymbolForPricing(txn.security);
            const quantity = parseFloat(txn.quantity) || 0;
            const txnPrice = parseFloat(txn.price);
            if (!Number.isFinite(quantity) || quantity === 0) {
                continue;
            }
            // Update last known price from this transaction
            if (Number.isFinite(txnPrice) && txnPrice > 0) {
                lastKnownPrices.set(normalizedSymbol, txnPrice);
            }
            const isBuy = String(txn.orderType).toLowerCase() === 'buy';
            const currentQty = holdings.get(normalizedSymbol) || 0;
            const updatedQty = currentQty + (isBuy ? quantity : -quantity);
            if (Math.abs(updatedQty) < 1e-8) {
                holdings.delete(normalizedSymbol);
            } else {
                holdings.set(normalizedSymbol, updatedQty);
            }
        }

        let totalValue = 0;
        for (const [symbol, qty] of holdings.entries()) {
            if (!Number.isFinite(qty) || Math.abs(qty) < 1e-8) {
                continue;
            }
            let price = getPriceFromHistoricalData(historicalPrices, symbol, dateStr);
            // Fallback to last known transaction price if historical price unavailable
            if (price === null) {
                price = lastKnownPrices.get(symbol) ?? null;
            }
            if (price === null) {
                continue;
            }
            const adjustment = getSplitAdjustment(splitHistory, symbol, dateStr);
            totalValue += qty * price * adjustment;
        }

        series.push({ date: dateStr, value: totalValue });
        iterDate.setDate(iterDate.getDate() + 1);
    }

    const epsilon = 1e-6;
    let keepSyntheticStart = false;
    for (let i = 0; i < series.length; i += 1) {
        const point = series[i];
        if (!point || !Number.isFinite(point.value)) {
            continue;
        }
        if (Math.abs(point.value) > epsilon) {
            if (i > 0 && Math.abs(series[i - 1]?.value || 0) <= epsilon) {
                keepSyntheticStart = true;
            }
            break;
        }
    }

    if (keepSyntheticStart && series.length > 0) {
        series[0].synthetic = true;
    } else if (series.length > 0 && Math.abs(series[0].value || 0) <= epsilon) {
        series.shift();
    }

    return series;
}

export function applyDrawdownToSeries(data, valueKey, initialPeak = -Infinity) {
    if (!Array.isArray(data) || data.length === 0) {
        return [];
    }
    // Sort by date first
    const sorted = [...data].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let runningPeak = initialPeak;
    const len = sorted.length;
    // Bolt: Use pre-allocated Array and a standard loop instead of .map() to avoid closure allocations and eliminate array growth overhead.
    const result = new Array(len);
    for (let i = 0; i < len; i++) {
        const p = sorted[i];
        const val = p[valueKey];
        if (val > runningPeak) {
            runningPeak = val;
        }
        result[i] = {
            ...p,
            [valueKey]: val - runningPeak, // <= 0
        };
    }
    return result;
}

/**
 * Compute the appreciation series (balance − contribution) at aligned timestamps.
 * For each balance data point, the contribution value is matched exactly or
 * linearly interpolated from the contribution series.
 *
 * @param {Array<{date: Date, value: number}>} balanceData
 * @param {Array<{date: Date, amount: number}>} contributionData
 * @returns {Array<{date: Date, value: number}>}
 */
export function computeAppreciationSeries(balanceData, contributionData) {
    if (
        !Array.isArray(balanceData) ||
        balanceData.length === 0 ||
        !Array.isArray(contributionData) ||
        contributionData.length === 0
    ) {
        return [];
    }

    // Build exact-match map
    const contribByTime = new Map();
    for (let i = 0; i < contributionData.length; i++) {
        const item = contributionData[i];
        contribByTime.set(item.date.getTime(), item.amount);
    }

    // Sort contribution timestamps for interpolation
    const contribTimes = new Array(contributionData.length);
    for (let i = 0; i < contributionData.length; i++) {
        const item = contributionData[i];
        contribTimes[i] = { time: item.date.getTime(), value: item.amount };
    }
    contribTimes.sort((a, b) => a.time - b.time);

    const interpolateContrib = (targetTime) => {
        if (contribTimes.length === 0) {
            return null;
        }
        if (targetTime <= contribTimes[0].time) {
            return contribTimes[0].value;
        }
        if (targetTime >= contribTimes[contribTimes.length - 1].time) {
            return contribTimes[contribTimes.length - 1].value;
        }
        for (let i = 0; i < contribTimes.length - 1; i++) {
            if (targetTime >= contribTimes[i].time && targetTime <= contribTimes[i + 1].time) {
                const ratio =
                    (targetTime - contribTimes[i].time) /
                    (contribTimes[i + 1].time - contribTimes[i].time);
                return (
                    contribTimes[i].value +
                    ratio * (contribTimes[i + 1].value - contribTimes[i].value)
                );
            }
        }
        return contribTimes[contribTimes.length - 1].value;
    };

    const result = [];
    for (let i = 0; i < balanceData.length; i++) {
        const balItem = balanceData[i];
        const t = balItem.date.getTime();
        let contribValue = contribByTime.get(t);
        if (contribValue === undefined) {
            contribValue = interpolateContrib(t);
        }
        if (
            contribValue !== null &&
            Number.isFinite(balItem.value) &&
            Number.isFinite(contribValue)
        ) {
            result.push({
                date: balItem.date,
                value: balItem.value - contribValue,
            });
        }
    }

    return result;
}

/**
 * Merge daily dividend data into a contribution series.
 * Dividends reduce the cumulative contribution (cash returned to investor).
 *
 * @param {Array} contributionSeries - from buildContributionSeriesFromTransactions
 * @param {Array|null} yieldData - from yield_data.json [{date, daily_dividend, ...}]
 * @param {string} currency - target currency
 * @param {Array|null} filterTickers - optional array of ticker symbols to filter by
 * @returns {Array} merged series with dividends subtracted
 */
export function mergeDividendsIntoContribution(
    contributionSeries,
    yieldData,
    currency,
    filterTickers = null
) {
    if (!Array.isArray(yieldData) || yieldData.length === 0) {
        return contributionSeries;
    }

    // Build a Map of dateStr → daily_dividend from yieldData (only non-zero entries)
    const dividendMap = new Map();
    for (let i = 0; i < yieldData.length; i++) {
        const item = yieldData[i];
        let dividend = 0;

        if (filterTickers && filterTickers.length > 0) {
            // If filtering is active, only include dividends for the filtered tickers
            if (item.daily_dividends_by_ticker) {
                for (let j = 0; j < filterTickers.length; j++) {
                    const ticker = filterTickers[j];
                    if (item.daily_dividends_by_ticker[ticker]) {
                        dividend += item.daily_dividends_by_ticker[ticker];
                    }
                }
            }
            // If item.daily_dividends_by_ticker is missing, dividend remains 0. We DO NOT fall back!
        } else if (item.daily_dividend) {
            // No filtering active: use the aggregate daily_dividend
            dividend = item.daily_dividend;
        }

        const dividendNum = Number(dividend) || 0;
        if (dividendNum !== 0) {
            dividendMap.set(item.date, dividendNum);
        }
    }

    if (dividendMap.size === 0) {
        return contributionSeries;
    }

    // Clone the series so we don't mutate the original
    const merged = new Array(contributionSeries.length);
    for (let i = 0; i < contributionSeries.length; i++) {
        merged[i] = { ...contributionSeries[i] };
    }

    // Build a Map of dateStr → index from contributionSeries for quick lookup
    const seriesMap = new Map();
    for (let i = 0; i < merged.length; i++) {
        seriesMap.set(merged[i].tradeDate, i);
    }

    // Process each dividend entry
    for (const [dateStr, dividend] of dividendMap.entries()) {
        const convertedDividend =
            currency && currency !== 'USD'
                ? convertValueToCurrency(dividend, dateStr, currency)
                : dividend;

        if (seriesMap.has(dateStr)) {
            // Date already exists in contribution series: add sellVolume, mark dividend delta
            const idx = seriesMap.get(dateStr);
            merged[idx].sellVolume = (merged[idx].sellVolume || 0) + convertedDividend;
            merged[idx].netAmount = (merged[idx].netAmount || 0) - convertedDividend;
        } else {
            // Insert a new point for this dividend date
            merged.push({
                tradeDate: dateStr,
                amount: 0, // will be recalculated
                value: 0,
                orderType: 'sell',
                netAmount: -convertedDividend,
                buyVolume: 0,
                sellVolume: convertedDividend,
            });
        }
    }

    // Re-sort by date
    merged.sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0));

    // Recalculate cumulative amounts
    let cumulative = 0;
    for (let i = 0; i < merged.length; i++) {
        const point = merged[i];
        cumulative += point.netAmount;
        point.amount = cumulative;
        point.value = cumulative;
    }

    return merged;
}
