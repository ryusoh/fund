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
    if (transactions.length === 0) {
        return [];
    }

    const runningTotals = computeRunningTotals(transactions, splitHistory);
    const sortedTransactions = [...transactions].sort(
        (a, b) => new Date(a.tradeDate) - new Date(b.tradeDate) || a.transactionId - b.transactionId
    );

    const series = [];
    sortedTransactions.forEach((t, index) => {
        const totals = runningTotals.get(t.transactionId);
        const currentPoint = {
            tradeDate: t.tradeDate,
            amount: totals ? totals.portfolio : 0,
            orderType: t.orderType,
            netAmount: parseFloat(t.netAmount) || 0,
        };

        if (index > 0) {
            const prevTransaction = sortedTransactions[index - 1];
            const prevTotals = runningTotals.get(prevTransaction.transactionId);
            const prevAmount = prevTotals ? prevTotals.portfolio : 0;

            const prevDate = new Date(prevTransaction.tradeDate);
            const currentDate = new Date(t.tradeDate);

            if (prevDate.toISOString().split('T')[0] !== currentDate.toISOString().split('T')[0]) {
                const intermediateDate = new Date(currentDate);
                intermediateDate.setDate(intermediateDate.getDate() - 1);

                series.push({
                    tradeDate: intermediateDate.toISOString().split('T')[0],
                    amount: prevAmount,
                    orderType: 'padding',
                    netAmount: 0,
                });
            }
        }
        series.push(currentPoint);
    });

    // Extend the line to today
    const lastPoint = series[series.length - 1];
    if (lastPoint) {
        const today = new Date();
        const lastTransactionDate = new Date(lastPoint.tradeDate);

        if (today > lastTransactionDate) {
            series.push({
                tradeDate: today.toISOString().split('T')[0],
                amount: lastPoint.amount,
                orderType: 'padding', // Use a neutral type to avoid drawing a marker
                netAmount: 0,
            });
        }
    }

    return series;
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

export function buildPortfolioSeries(transactions, historicalPrices, splitHistory) {
    if (!transactions || transactions.length === 0 || !historicalPrices) {
        return [];
    }

    const sortedTransactions = [...transactions].sort(
        (a, b) => new Date(a.tradeDate) - new Date(b.tradeDate)
    );

    if (sortedTransactions.length === 0) {
        return [];
    }

    const splitsByDate = new Map();
    splitHistory.forEach((split) => {
        const dateStr = new Date(split.splitDate).toISOString().split('T')[0];
        if (!splitsByDate.has(dateStr)) {
            splitsByDate.set(dateStr, []);
        }
        splitsByDate.get(dateStr).push(split);
    });

    const firstTransactionDate = new Date(sortedTransactions[0].tradeDate);
    const lastTransactionDate = new Date(
        sortedTransactions[sortedTransactions.length - 1].tradeDate
    );
    const today = new Date();
    const lastDate = today > lastTransactionDate ? today : lastTransactionDate;

    const dailyHoldings = new Map();
    const holdings = new Map(); // symbol -> quantity
    let transactionIndex = 0;

    for (let d = new Date(firstTransactionDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
        const currentDateStr = d.toISOString().split('T')[0];

        // Apply splits that occur on the current date
        if (splitsByDate.has(currentDateStr)) {
            splitsByDate.get(currentDateStr).forEach((split) => {
                if (holdings.has(split.symbol)) {
                    const currentQuantity = holdings.get(split.symbol);
                    holdings.set(split.symbol, currentQuantity * split.splitMultiplier);
                }
            });
        }

        // Process transactions for the current day
        while (
            transactionIndex < sortedTransactions.length &&
            new Date(sortedTransactions[transactionIndex].tradeDate).toISOString().split('T')[0] ===
                currentDateStr
        ) {
            const t = sortedTransactions[transactionIndex];
            const quantity = parseFloat(t.quantity);
            const isBuy = t.orderType.toLowerCase() === 'buy';
            const currentQuantity = holdings.get(t.security) || 0;
            holdings.set(t.security, currentQuantity + (isBuy ? quantity : -quantity));
            transactionIndex++;
        }

        dailyHoldings.set(currentDateStr, new Map(holdings));
    }

    const portfolioSeries = [];
    for (let d = new Date(firstTransactionDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
        const currentDateStr = d.toISOString().split('T')[0];
        const todaysHoldings = dailyHoldings.get(currentDateStr);
        let totalValue = 0;

        if (todaysHoldings) {
            for (const [symbol, quantity] of todaysHoldings.entries()) {
                const price = getPrice(historicalPrices, symbol, currentDateStr);
                if (price !== null) {
                    // The historical price is adjusted for future splits. We need to "un-adjust" it
                    // to get the actual price on that day.
                    const priceAdjustment = getSplitAdjustment(
                        splitHistory,
                        symbol,
                        currentDateStr
                    );
                    const unadjustedPrice = price * priceAdjustment;
                    totalValue += quantity * unadjustedPrice;
                }
            }
        }
        portfolioSeries.push({ date: currentDateStr, value: totalValue });
    }

    return portfolioSeries;
}

function getPrice(historicalPrices, symbol, dateStr) {
    const prices = historicalPrices[symbol];
    if (!prices) {
        return null;
    }

    if (prices[dateStr]) {
        return prices[dateStr];
    }

    // If no price for today, find the most recent one
    const sortedDates = Object.keys(prices).sort((a, b) => new Date(b) - new Date(a));
    const priorDate = sortedDates.find((d) => d < dateStr);
    return priorDate ? prices[priorDate] : null;
}
