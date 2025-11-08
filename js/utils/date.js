/**
 * Gets the current date in the America/New_York timezone.
 * @returns {Date} The current date in New York.
 */
export function getNyDate() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

/**
 * Checks if a given date (in NY timezone) is a trading day.
 * Trading days are Monday-Friday, excluding major US holidays.
 * @param {Date} date The date to check (should be in NY timezone).
 * @returns {boolean} True if it's a trading day.
 */
export function isTradingDay(date) {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

    // Check if it's a weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return false; // Sunday or Saturday
    }

    // TODO: Add major holiday checks here if needed
    // For now, we'll just check weekends

    return true; // Monday through Friday
}

/**
 * Gets the current NY date only if it's a trading day, otherwise returns null.
 * @param {Date} [dateOverride] - Optional date to check instead of current NY date
 * @returns {Date|null} The current date in New York if it's a trading day, null otherwise.
 */
export function getTradingDayDate(dateOverride = null) {
    const nyDate = dateOverride || getNyDate();
    return isTradingDay(nyDate) ? nyDate : null;
}

export function toIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
    }
    return date.toISOString().split('T')[0];
}

export function parseYearFromDate(value) {
    if (!value || (typeof value !== 'string' && !(value instanceof Date))) {
        return null;
    }
    if (value instanceof Date) {
        return value.getUTCFullYear();
    }
    const match = String(value).match(/^\s*(\d{4})/);
    if (!match) {
        return null;
    }
    const year = Number.parseInt(match[1], 10);
    return Number.isFinite(year) ? year : null;
}

export function parseQuarterToken(token, fallbackYear) {
    if (typeof token !== 'string') {
        return null;
    }
    const explicit = token.match(/^\s*(\d{4})q([1-4])\s*$/i);
    if (explicit) {
        return {
            year: Number.parseInt(explicit[1], 10),
            quarter: Number.parseInt(explicit[2], 10),
        };
    }
    const simple = token.match(/^\s*q([1-4])\s*$/i);
    if (simple && Number.isFinite(fallbackYear)) {
        return {
            year: fallbackYear,
            quarter: Number.parseInt(simple[1], 10),
        };
    }
    return null;
}

export function resolveQuarterRange(year, quarter, mode = 'full') {
    if (!Number.isFinite(year) || !Number.isFinite(quarter)) {
        return { from: null, to: null };
    }
    const startDate = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
    const nextQuarter = new Date(Date.UTC(year, quarter * 3, 1));
    const endDate = new Date(nextQuarter.getTime() - 24 * 60 * 60 * 1000);

    const from = toIsoDate(startDate);
    const to = toIsoDate(endDate);

    if (mode === 'start') {
        return { from, to: null };
    }
    if (mode === 'end') {
        return { from: null, to };
    }
    return { from, to };
}

export function normalizeDateOnly(input) {
    if (!input) {
        return null;
    }
    const date = input instanceof Date ? new Date(input) : new Date(input);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
}
