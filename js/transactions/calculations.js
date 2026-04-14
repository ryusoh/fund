import { parseCSVLine } from './utils.js';

// Cache for split adjustments to avoid O(N×M) Date object creation
const splitAdjustmentCache = new Map();

export function getSplitAdjustment(splitHistory, symbol, transactionDate) {
    const cacheKey = `${symbol}|${transactionDate}`;
    if (splitAdjustmentCache.has(cacheKey)) {
        return splitAdjustmentCache.get(cacheKey);
    }

    // Normalize transactionDate to YYYY-MM-DD without timezone shifts
    let txYYYYMMDD;
    if (transactionDate.includes('/')) {
        // MM/DD/YYYY format
        const parts = transactionDate.split('/');
        txYYYYMMDD = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    } else {
        // Assume YYYY-MM-DD format
        txYYYYMMDD = transactionDate;
    }

    let result = 1.0;

    for (let i = 0; i < splitHistory.length; i++) {
        const split = splitHistory[i];
        if (split.symbol === symbol && split.splitDate > txYYYYMMDD) {
            result *= split.splitMultiplier;
        }
    }

    splitAdjustmentCache.set(cacheKey, result);
    return result;
}

export function clearSplitAdjustmentCache() {
    splitAdjustmentCache.clear();
}

export function applyTransactionFIFO(lots, transaction, splitHistory) {
    const newLots = lots.map((l) => ({ ...l }));
    let realizedGainDelta = 0;

    const quantity = parseFloat(transaction.quantity);
    const price = parseFloat(transaction.price);
    if (!Number.isFinite(quantity) || !Number.isFinite(price) || quantity <= 0) {
        return { lots: newLots, realizedGainDelta: 0 };
    }

    const isBuy = transaction.orderType.toLowerCase() === 'buy';
    const adjustment = getSplitAdjustment(
        splitHistory,
        transaction.security,
        transaction.tradeDate
    );

    if (isBuy) {
        const adjustedQuantity = quantity * adjustment;
        const adjustedPrice = price / adjustment;
        newLots.push({ qty: adjustedQuantity, price: adjustedPrice });
    } else {
        const adjustedSellQuantity = quantity * adjustment;
        let sellQty = adjustedSellQuantity;
        let costOfSoldShares = 0;

        while (sellQty > 0 && newLots.length > 0) {
            const lot = newLots[0];
            const qtyFromLot = Math.min(sellQty, lot.qty);

            costOfSoldShares += qtyFromLot * lot.price;
            lot.qty -= qtyFromLot;
            sellQty -= qtyFromLot;

            if (lot.qty < 1e-8) {
                newLots.shift();
            }
        }
        const proceeds = quantity * price;
        realizedGainDelta = proceeds - costOfSoldShares;
    }

    return { lots: newLots, realizedGainDelta };
}

export function computeRunningTotals(transactions, splitHistory) {
    const securityStates = new Map();
    const runningTotalsById = new Map();
    let cumulativeNetAmount = 0;

    // Bolt: Cache parsed timestamps in a Map to avoid O(N log N) Date instantiations
    // and prevent mutating the original transaction objects
    const tsCache = new Map();
    const getTs = (t) => {
        let ts = tsCache.get(t);
        if (ts === undefined) {
            ts = new Date(t.tradeDate).getTime();
            tsCache.set(t, ts);
        }
        return ts;
    };

    const chronologicalTransactions = [...transactions].sort(
        (a, b) => getTs(a) - getTs(b) || a.transactionId - b.transactionId
    );

    chronologicalTransactions.forEach((transaction) => {
        const security = transaction.security;
        const currentState = securityStates.get(security) || { lots: [], totalRealizedGain: 0 };

        const { lots: newLots, realizedGainDelta } = applyTransactionFIFO(
            currentState.lots,
            transaction,
            splitHistory
        );

        const newState = {
            lots: newLots,
            totalRealizedGain: currentState.totalRealizedGain + realizedGainDelta,
        };
        securityStates.set(security, newState);

        const totalShares = newState.lots.reduce((sum, lot) => sum + lot.qty, 0);
        const netAmount = Number.parseFloat(transaction.netAmount);
        const normalizedNetAmount = Number.isFinite(netAmount) ? netAmount : 0;
        cumulativeNetAmount += normalizedNetAmount;

        runningTotalsById.set(transaction.transactionId, {
            shares: totalShares,
            amount: cumulativeNetAmount,
            portfolio: cumulativeNetAmount,
        });
    });

    // Bolt: Use direct for...of loop over Map.values() instead of Array.from().reduce()
    // to avoid intermediate array allocation and reduce garbage collection overhead
    let totalRealizedGain = 0;
    for (const s of securityStates.values()) {
        totalRealizedGain += s.totalRealizedGain;
    }
    runningTotalsById.totalRealizedGain = totalRealizedGain;

    return runningTotalsById;
}

export function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const transactions = [];
    for (let i = 1; i < lines.length; i += 1) {
        const values = parseCSVLine(lines[i]);
        if (values.length >= 5) {
            const quantity = parseFloat(values[3]) || 0;
            const price = parseFloat(values[4]) || 0;
            transactions.push({
                tradeDate: values[0],
                orderType: values[1],
                security: values[2],
                quantity: values[3],
                price: values[4],
                netAmount: (
                    quantity *
                    price *
                    (values[1].toLowerCase() === 'sell' ? -1 : 1)
                ).toString(),
                transactionId: i - 1,
            });
        }
    }
    return transactions;
}
