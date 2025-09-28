import { parseCSVLine } from './utils.js';

export function getSplitAdjustment(splitHistory, symbol, transactionDate) {
    return splitHistory
        .filter(
            (split) =>
                split.symbol === symbol && new Date(split.splitDate) > new Date(transactionDate)
        )
        .reduce((cumulative, split) => cumulative * split.splitMultiplier, 1.0);
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
    let portfolioRunningCost = 0;

    const chronologicalTransactions = [...transactions].sort(
        (a, b) => new Date(a.tradeDate) - new Date(b.tradeDate) || a.transactionId - b.transactionId
    );

    chronologicalTransactions.forEach((transaction) => {
        const security = transaction.security;
        const currentState = securityStates.get(security) || { lots: [], totalRealizedGain: 0 };
        const oldCostBasis = currentState.lots.reduce((sum, lot) => sum + lot.qty * lot.price, 0);

        const { lots: newLots, realizedGainDelta } = applyTransactionFIFO(
            currentState.lots,
            transaction,
            splitHistory
        );

        const newCostBasis = newLots.reduce((sum, lot) => sum + lot.qty * lot.price, 0);
        const costBasisDelta = newCostBasis - oldCostBasis;

        portfolioRunningCost += costBasisDelta;

        const newState = {
            lots: newLots,
            totalRealizedGain: currentState.totalRealizedGain + realizedGainDelta,
        };
        securityStates.set(security, newState);

        const totalShares = newState.lots.reduce((sum, lot) => sum + lot.qty, 0);

        runningTotalsById.set(transaction.transactionId, {
            shares: totalShares,
            amount: portfolioRunningCost,
            portfolio: portfolioRunningCost,
        });
    });

    const totalRealizedGain = Array.from(securityStates.values()).reduce(
        (sum, s) => sum + s.totalRealizedGain,
        0
    );
    runningTotalsById.totalRealizedGain = totalRealizedGain;

    return runningTotalsById;
}

export function calculateStats(transactions, splitHistory) {
    const runningTotals = computeRunningTotals(transactions, splitHistory);
    const totalBuyAmount = transactions
        .filter((t) => t.orderType.toLowerCase() === 'buy')
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.netAmount) || 0), 0);
    const totalSellAmount = transactions
        .filter((t) => t.orderType.toLowerCase() === 'sell')
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.netAmount) || 0), 0);
    return {
        totalTransactions: transactions.length,
        totalBuys: transactions.filter((t) => t.orderType.toLowerCase() === 'buy').length,
        totalSells: transactions.filter((t) => t.orderType.toLowerCase() === 'sell').length,
        totalBuyAmount,
        totalSellAmount,
        netAmount: totalBuyAmount - totalSellAmount,
        realizedGain: runningTotals.totalRealizedGain || 0,
    };
}

export function calculateHoldings(transactions, splitHistory) {
    const securityStates = new Map();
    [...transactions]
        .sort(
            (a, b) =>
                new Date(a.tradeDate) - new Date(b.tradeDate) || a.transactionId - b.transactionId
        )
        .forEach((t) => {
            const currentState = securityStates.get(t.security) || { lots: [] };
            const { lots: newLots } = applyTransactionFIFO(currentState.lots, t, splitHistory);
            securityStates.set(t.security, { lots: newLots });
        });

    const holdings = {};
    for (const [security, data] of securityStates.entries()) {
        const totalShares = data.lots.reduce((sum, lot) => sum + lot.qty, 0);
        const totalCost = data.lots.reduce((sum, lot) => sum + lot.qty * lot.price, 0);
        if (totalShares > 1e-8) {
            holdings[security] = {
                shares: totalShares,
                totalCost,
                avgPrice: totalCost / totalShares,
            };
        }
    }
    return holdings;
}

export function buildRunningAmountSeries(transactions, splitHistory) {
    const runningTotals = computeRunningTotals(transactions, splitHistory);
    return [...transactions]
        .sort(
            (a, b) =>
                new Date(a.tradeDate) - new Date(b.tradeDate) || a.transactionId - b.transactionId
        )
        .map((t) => {
            const totals = runningTotals.get(t.transactionId);
            return {
                tradeDate: t.tradeDate,
                amount: totals ? totals.portfolio : 0,
                orderType: t.orderType,
                netAmount: parseFloat(t.netAmount) || 0,
            };
        });
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
