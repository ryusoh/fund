import { formatCurrency } from '../../utils.js';
import { transactionState } from '../../state.js';
import { renderAsciiTable } from './formatting.js';

let statsDataCache = null;

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

    return `
${table}
`;
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
            return `
${table}
`;
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
