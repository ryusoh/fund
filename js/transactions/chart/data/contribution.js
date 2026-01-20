import { transactionState } from '../../state.js';
import { convertValueToCurrency } from '../../utils.js';
import { getSplitAdjustment } from '../../calculations.js';

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

    const sortedTransactions = [...transactions].sort(
        (a, b) =>
            new Date(a.tradeDate) - new Date(b.tradeDate) ||
            (a.transactionId ?? 0) - (b.transactionId ?? 0)
    );

    // Consolidate transactions by date
    const dailyMap = new Map();
    sortedTransactions.forEach((t) => {
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
    });

    const uniqueDates = Array.from(dailyMap.keys()).sort((a, b) => new Date(a) - new Date(b));
    const series = [];
    let cumulativeAmount = 0;

    uniqueDates.forEach((dateStr, index) => {
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
            const types = Array.from(entry.orderTypes).map((t) => String(t).toLowerCase());
            if (types.every((t) => t === 'buy')) {
                orderType = 'buy';
            } else if (types.every((t) => t === 'sell')) {
                orderType = 'sell';
            }
        }

        series.push({
            tradeDate: dateStr,
            amount: cumulativeAmount,
            orderType: orderType,
            netAmount: netDelta,
            buyVolume: entry.buyVolume,
            sellVolume: entry.sellVolume,
        });
    });

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

    const sortedTransactions = [...transactions].sort(
        (a, b) =>
            new Date(a.tradeDate) - new Date(b.tradeDate) ||
            (a.transactionId ?? 0) - (b.transactionId ?? 0)
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
    (Array.isArray(splitHistory) ? splitHistory : []).forEach((split) => {
        if (!split || !split.splitDate || !split.symbol) {
            return;
        }
        const dateKey = new Date(split.splitDate).toISOString().split('T')[0];
        const multiplier = Number(split.splitMultiplier) || Number(split.split_multiplier) || 1;
        const symbolKey = normalizeSymbolForPricing(split.symbol);
        if (!splitsByDate.has(dateKey)) {
            splitsByDate.set(dateKey, []);
        }
        splitsByDate.get(dateKey).push({ symbol: symbolKey, multiplier });
    });

    const transactionsByDate = new Map();
    sortedTransactions.forEach((txn) => {
        const dateStr = new Date(txn.tradeDate).toISOString().split('T')[0];
        if (!transactionsByDate.has(dateStr)) {
            transactionsByDate.set(dateStr, []);
        }
        transactionsByDate.get(dateStr).push(txn);
    });

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
            splitsToday.forEach(({ symbol, multiplier }) => {
                if (!Number.isFinite(multiplier) || multiplier <= 0) {
                    return;
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
            });
        }

        const todaysTransactions = transactionsByDate.get(dateStr) || [];
        todaysTransactions.forEach((txn) => {
            const normalizedSymbol = normalizeSymbolForPricing(txn.security);
            const quantity = parseFloat(txn.quantity) || 0;
            const txnPrice = parseFloat(txn.price);
            if (!Number.isFinite(quantity) || quantity === 0) {
                return;
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
        });

        let totalValue = 0;
        holdings.forEach((qty, symbol) => {
            if (!Number.isFinite(qty) || Math.abs(qty) < 1e-8) {
                return;
            }
            let price = getPriceFromHistoricalData(historicalPrices, symbol, dateStr);
            // Fallback to last known transaction price if historical price unavailable
            if (price === null) {
                price = lastKnownPrices.get(symbol) ?? null;
            }
            if (price === null) {
                return;
            }
            const adjustment = getSplitAdjustment(splitHistory, symbol, dateStr);
            totalValue += qty * price * adjustment;
        });

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
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    let runningPeak = initialPeak;
    return sorted.map((p) => {
        const val = p[valueKey];
        if (val > runningPeak) {
            runningPeak = val;
        }
        return {
            ...p,
            [valueKey]: val - runningPeak, // <= 0
        };
    });
}
