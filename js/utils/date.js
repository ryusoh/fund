/**
 * Gets the current date in the America/New_York timezone.
 * @returns {Date} The current date in New York.
 */
export function getNyDate() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

/**
 * Checks if a given date is a US market holiday.
 * Uses simplified rules for core US market holidays.
 * @param {Date} date The date to check.
 * @returns {boolean} True if it is a holiday.
 */
// Helper: nth day of week in month (e.g., 3rd Monday)
function isNthDayOfWeek(date, n, targetDayOfWeek) {
    return date.getDay() === targetDayOfWeek && Math.ceil(date.getDate() / 7) === n;
}

// Helper: Last day of week in month
function isLastDayOfWeek(date, targetDayOfWeek) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + 7);
    return date.getDay() === targetDayOfWeek && d.getMonth() !== date.getMonth();
}

// Static dates (or observed on nearest weekday)
function checkStaticHoliday(date, targetMonth, targetDay) {
    const month = date.getMonth();
    const day = date.getDate();
    const dayOfWeek = date.getDay();

    if (month === targetMonth) {
        if (day === targetDay) {
            return true;
        }
        // Observed on Friday if holiday falls on Saturday
        if (day === targetDay - 1 && dayOfWeek === 5) {
            return true;
        }
        // Observed on Monday if holiday falls on Sunday
        if (day === targetDay + 1 && dayOfWeek === 1) {
            return true;
        }
    }
    return false;
}

function getGoodFriday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = Math.floor((h + l - 7 * m + 114) / 31);
    const p = (h + l - 7 * m + 114) % 31;
    const easter = new Date(year, n - 1, p + 1);
    return new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);
}

function isNthDayHoliday(month, date) {
    if (month === 0 && isNthDayOfWeek(date, 3, 1)) {
        return true;
    }
    if (month === 1 && isNthDayOfWeek(date, 3, 1)) {
        return true;
    }
    if (month === 8 && isNthDayOfWeek(date, 1, 1)) {
        return true;
    }
    if (month === 10 && isNthDayOfWeek(date, 4, 4)) {
        return true;
    }
    return false;
}

function isDynamicHoliday(date) {
    const month = date.getMonth();
    if (isNthDayHoliday(month, date)) {
        return true;
    }
    if (month === 4 && isLastDayOfWeek(date, 1)) {
        return true;
    }
    return false;
}

/**
 * Checks if a given date is a US market holiday.
 * Uses simplified rules for core US market holidays.
 * @param {Date} date The date to check.
 * @returns {boolean} True if it is a holiday.
 */
function isMarketHoliday(date) {
    const month = date.getMonth();
    const day = date.getDate();
    const dayOfWeek = date.getDay();

    if (checkStaticHoliday(date, 0, 1) || (month === 11 && day === 31 && dayOfWeek === 5)) {
        return true;
    }
    if (checkStaticHoliday(date, 5, 19)) {
        return true;
    }
    if (checkStaticHoliday(date, 6, 4)) {
        return true;
    }
    if (checkStaticHoliday(date, 11, 25)) {
        return true;
    }

    const goodFriday = getGoodFriday(date.getFullYear());
    if (month === goodFriday.getMonth() && day === goodFriday.getDate()) {
        return true;
    }

    return isDynamicHoliday(date);
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

    if (isMarketHoliday(date)) {
        return false;
    }

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
