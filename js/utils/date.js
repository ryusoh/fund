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
function isMarketHoliday(date) {
    const month = date.getMonth(); // 0-indexed
    const day = date.getDate();
    const dayOfWeek = date.getDay();

    // Helper: nth day of week in month (e.g., 3rd Monday)
    const isNthDayOfWeek = (n, targetDayOfWeek) => {
        return dayOfWeek === targetDayOfWeek && Math.ceil(day / 7) === n;
    };

    // Helper: Last day of week in month
    const isLastDayOfWeek = (targetDayOfWeek) => {
        const d = new Date(date.getTime());
        d.setDate(d.getDate() + 7);
        return dayOfWeek === targetDayOfWeek && d.getMonth() !== month;
    };

    // Static dates (or observed on nearest weekday)
    const checkStaticHoliday = (targetMonth, targetDay) => {
        if (month === targetMonth) {
            if (day === targetDay) {
                return true;
            } // on the day
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
    };

    return (
        checkStaticHolidays(month, day, dayOfWeek, checkStaticHoliday) ||
        checkNthDayHolidays(month, isNthDayOfWeek, isLastDayOfWeek) ||
        checkGoodFridayHoliday(date, month, day)
    );
}

function checkStaticHolidays(month, day, dayOfWeek, checkStaticHoliday) {
    // 1. New Year's Day (Jan 1)
    if (checkStaticHoliday(0, 1)) {
        return true;
    }
    // New Year's Day observed on Friday, Dec 31 of previous year if Jan 1 is Saturday
    if (month === 11 && day === 31 && dayOfWeek === 5) {
        return true;
    }
    // 6. Juneteenth National Independence Day (June 19)
    if (checkStaticHoliday(5, 19)) {
        return true;
    }
    // 7. Independence Day (July 4)
    if (checkStaticHoliday(6, 4)) {
        return true;
    }
    // 10. Christmas Day (Dec 25)
    if (checkStaticHoliday(11, 25)) {
        return true;
    }
    return false;
}

function checkNthDayHolidays(month, isNthDayOfWeek, isLastDayOfWeek) {
    if (month === 0) {
        // 2. Martin Luther King Jr. Day (3rd Monday in Jan)
        return isNthDayOfWeek(3, 1);
    }
    if (month === 1) {
        // 3. Washington's Birthday (Presidents' Day) (3rd Monday in Feb)
        return isNthDayOfWeek(3, 1);
    }
    if (month === 4) {
        // 5. Memorial Day (Last Monday in May)
        return isLastDayOfWeek(1);
    }
    if (month === 8) {
        // 8. Labor Day (1st Monday in Sept)
        return isNthDayOfWeek(1, 1);
    }
    if (month === 10) {
        // 9. Thanksgiving Day (4th Thursday in Nov)
        return isNthDayOfWeek(4, 4);
    }
    return false;
}

function checkGoodFridayHoliday(date, month, day) {
    // 4. Good Friday (computus calculation)
    const getEaster = (y) => {
        const a = y % 19;
        const b = Math.floor(y / 100);
        const c = y % 100;
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
        return new Date(y, n - 1, p + 1);
    };

    const easter = getEaster(date.getFullYear());
    const goodFriday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);
    if (month === goodFriday.getMonth() && day === goodFriday.getDate()) {
        return true;
    }
    return false;
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
