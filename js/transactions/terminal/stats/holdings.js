import { formatCurrency } from '../../utils.js';
import {
    renderAsciiTable,
    formatTicker,
    formatShareValue,
    formatResidualValue,
} from './formatting.js';
import { buildLotSnapshots } from './analysis.js';

let holdingsDataCache = null;

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
            return `
${table}
`;
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

    return `
${table}

${note}`;
}
