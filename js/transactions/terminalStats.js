import { formatCurrency } from './utils.js';

let statsDataCache = null;
let holdingsDataCache = null;

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
