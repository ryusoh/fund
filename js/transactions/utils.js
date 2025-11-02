export function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatCurrency(value) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const absolute = Math.abs(amount);
    const formatted = absolute.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const sign = amount < 0 ? '-' : '';
    return `${sign}$${formatted}`;
}

export function formatCurrencyCompact(value) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const absolute = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';

    if (absolute >= 1_000_000) {
        const millions = absolute / 1_000_000;
        if (millions >= 1 && millions < 10) {
            return `${sign}$${millions.toFixed(2)}M`;
        }
        return `${sign}$${Math.round(millions)}M`;
    }

    if (absolute >= 1_000) {
        const thousands = absolute / 1_000;
        if (thousands >= 100) {
            return `${sign}$${Math.round(thousands)}k`;
        }
        if (thousands >= 10) {
            return `${sign}$${thousands.toFixed(0)}k`;
        }
        return `${sign}$${thousands.toFixed(1)}k`;
    }

    return `${sign}$${absolute.toFixed(0)}`;
}

export function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"' && i < line.length - 1 && line[i + 1] === '"') {
            current += '"';
            i += 1;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current.trim());
    return values;
}
