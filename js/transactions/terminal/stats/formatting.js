import { formatCurrency, formatCurrencyCompact } from '../../utils.js';

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

export function formatNumeric(value, digits = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return '–';
    }
    return number.toFixed(digits);
}

export function formatPercentageValue(value, { digits = 2, mode = 'auto' } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return '–';
    }
    let percentage;
    if (mode === 'percent') {
        percentage = number;
    } else if (mode === 'fraction') {
        percentage = Math.abs(number) > 1 ? number : number * 100;
    } else {
        percentage = Math.abs(number) <= 1 ? number * 100 : number;
    }
    return `${percentage.toFixed(digits)}%`;
}

export function formatNumericPair(primaryValue, forwardValue, digits = 2) {
    const primary = formatNumeric(primaryValue, digits);
    const forward = formatNumeric(forwardValue, digits);
    if (primary === '–' && forward === '–') {
        return '–';
    }
    if (forward === '–') {
        return primary;
    }
    if (primary === '–') {
        return forward;
    }
    return `${primary} / ${forward}`;
}

export function formatPrice(value, currency = 'USD') {
    const numericPrice = Number(value);
    if (!Number.isFinite(numericPrice)) {
        return '–';
    }
    return formatCurrency(numericPrice, { currency });
}

export function formatMarketCap(value, currency = 'USD') {
    const cap = Number(value);
    if (!Number.isFinite(cap)) {
        return '–';
    }
    return formatCurrencyCompact(cap, { currency });
}

export function formatVolume(value) {
    const vol = Number(value);
    if (!Number.isFinite(vol) || vol <= 0) {
        return '–';
    }
    const abs = Math.abs(vol);
    if (abs >= 1_000_000_000) {
        return `${(vol / 1_000_000_000).toFixed(2)}B`;
    }
    if (abs >= 1_000_000) {
        return `${(vol / 1_000_000).toFixed(2)}M`;
    }
    if (abs >= 1_000) {
        return `${(vol / 1_000).toFixed(2)}K`;
    }
    return vol.toFixed(0);
}

export function format52WeekRange(low, high, currency = 'USD') {
    const lowValue = Number(low);
    const highValue = Number(high);
    const hasLow = Number.isFinite(lowValue);
    const hasHigh = Number.isFinite(highValue);
    if (!hasLow && !hasHigh) {
        return '–';
    }
    if (hasLow && hasHigh) {
        return `${formatCurrency(lowValue, { currency })} – ${formatCurrency(highValue, { currency })}`;
    }
    if (hasLow) {
        return formatCurrency(lowValue, { currency });
    }
    return formatCurrency(highValue, { currency });
}

export function formatPercent(value) {
    if (!Number.isFinite(value) || value <= 0) {
        return '0.00%';
    }
    return `${(value * 100).toFixed(2)}%`;
}

export function formatShareValue(value) {
    if (!Number.isFinite(value)) {
        return '0.000000';
    }
    return value.toFixed(6);
}

export function formatShareValueShort(value) {
    if (!Number.isFinite(value)) {
        return '0.00';
    }
    return value.toFixed(2);
}

export function formatResidualValue(value) {
    if (!Number.isFinite(value)) {
        return 'N/A';
    }
    if (Math.abs(value) < 1e-9) {
        return '0';
    }
    return value.toFixed(6);
}

export function formatTicker(ticker) {
    if (ticker === 'BRKB') {
        return 'BRK-B';
    }
    return ticker || 'N/A';
}

export function formatDurationLabel(days) {
    if (!Number.isFinite(days) || days < 0) {
        return 'N/A';
    }
    if (days >= 730) {
        return `${(days / 365).toFixed(1)} yrs`;
    }
    if (days >= 365) {
        return `${(days / 365).toFixed(2)} yrs`;
    }
    if (days >= 60) {
        return `${(days / 30).toFixed(1)} mos`;
    }
    return `${Math.round(days)} days`;
}

export function formatYearsValue(days) {
    if (!Number.isFinite(days) || days < 0) {
        return 'N/A';
    }
    return `${(days / 365).toFixed(2)}y`;
}
