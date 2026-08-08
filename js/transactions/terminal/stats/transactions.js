import { getNumberFormatter } from '../../../utils/formatting.js';
import { formatCurrency } from '../../utils.js';
import { transactionState } from '../../state.js';
import { renderAsciiTable } from './formatting.js';
import { logger } from '../../../utils/logger.js';

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
        ['Transactions', getNumberFormatter(undefined, 0, 0).format(count)],
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

function _buildStatsRows(counts, values, selectedCurrency) {
    return [
        [
            'Total Transactions',
            getNumberFormatter(undefined, 0, 0).format(Number(counts.total_transactions || 0)),
        ],
        ['Buy Orders', getNumberFormatter(undefined, 0, 0).format(Number(counts.buy_orders || 0))],
        [
            'Sell Orders',
            getNumberFormatter(undefined, 0, 0).format(Number(counts.sell_orders || 0)),
        ],
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
}

async function _fetchStatsData() {
    if (!statsDataCache) {
        const response = await fetch('../data/output/transaction_stats.json');
        if (response.ok) {
            statsDataCache = await response.json();
        }
    }
    return statsDataCache;
}

function _renderStatsTable(data, normalizedCurrency) {
    const availableCurrencies = data.currency_values || {};
    const selectedCurrency = availableCurrencies[normalizedCurrency] ? normalizedCurrency : 'USD';
    const counts = data.counts || {};
    const values = availableCurrencies[selectedCurrency] || {};
    const rows = _buildStatsRows(counts, values, selectedCurrency);
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

async function _fetchLegacyStats() {
    const response = await fetch('../data/output/transaction_stats.txt');
    if (!response.ok) {
        return 'Error loading transaction stats.';
    }
    return await response.text();
}

export async function getStatsText(currency = 'USD') {
    const normalizedCurrency =
        typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'USD';
    try {
        const statsData = await _fetchStatsData();
        if (statsData) {
            return _renderStatsTable(statsData, normalizedCurrency);
        }
    } catch (error) {
        logger.warn('Transactions stats processing failed:', error);
        // Fall through to legacy text fallback
    }

    try {
        return await _fetchLegacyStats();
    } catch (error) {
        logger.warn('Transactions stats processing failed:', error);
        return 'Error loading transaction stats.';
    }
}
