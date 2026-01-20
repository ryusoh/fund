import { transactionState } from '../state.js';
import {
    parseYearFromDate,
    parseQuarterToken,
    resolveQuarterRange as computeQuarterRange,
} from '@utils/date.js';

let lastContextYear = null;
const noopDebug = () => {};
const debugContext = noopDebug;

export function updateContextYearFromRange(range) {
    if (!range) {
        return;
    }
    const year = parseYearFromDate(range.from) ?? parseYearFromDate(range.to);
    if (Number.isFinite(year)) {
        lastContextYear = year;
    }
}

export function getActiveRangeYear() {
    const { chartDateRange } = transactionState;
    if (!chartDateRange) {
        return null;
    }
    const fromYear = parseYearFromDate(chartDateRange.from);
    if (Number.isFinite(fromYear)) {
        return fromYear;
    }
    const toYear = parseYearFromDate(chartDateRange.to);
    return Number.isFinite(toYear) ? toYear : null;
}

export function getEarliestDataYear() {
    const transactions = transactionState.allTransactions || [];
    let minYear = Infinity;

    transactions.forEach((txn) => {
        const year = parseYearFromDate(txn.tradeDate || txn.date);
        if (Number.isFinite(year)) {
            minYear = Math.min(minYear, year);
        }
    });

    if (minYear === Infinity) {
        return new Date().getFullYear();
    }

    return minYear;
}

export function getDefaultYear() {
    const rangeYear = getActiveRangeYear();
    if (Number.isFinite(rangeYear)) {
        lastContextYear = rangeYear;
        return rangeYear;
    }
    if (Number.isFinite(lastContextYear)) {
        return lastContextYear;
    }
    const fallback = getEarliestDataYear();
    lastContextYear = fallback;
    return fallback;
}

export function resolveQuarterRange(year, quarter, mode = 'full') {
    if (Number.isFinite(year)) {
        lastContextYear = year;
    }
    return computeQuarterRange(year, quarter, mode);
}

export function parseDateRange(args) {
    const currentYear = new Date().getFullYear();
    const defaultYear = getDefaultYear();
    let from = null;
    let to = null;

    if (args.length === 1) {
        const arg = args[0];

        // Check for quarter format (e.g., 2023q1, 2024q2)
        const quarterToken = parseQuarterToken(arg, defaultYear);
        if (quarterToken) {
            const resolved = resolveQuarterRange(quarterToken.year, quarterToken.quarter, 'full');
            debugContext('parseDateRange:single-quarter', { arg, defaultYear, resolved });
            return resolved;
        }

        // Check for year format
        const year = parseInt(arg, 10);
        if (!isNaN(year) && year >= 1900 && year <= currentYear + 5) {
            lastContextYear = year;
            from = `${year}-01-01`;
            to = `${year}-12-31`;
            debugContext('parseDateRange:single-year', { arg, year });
        }
    } else if (args.length === 2 && args[0].toLowerCase() === 'from') {
        const arg = args[1];

        // Check for quarter format (e.g., from 2023q1)
        const quarterToken = parseQuarterToken(arg, defaultYear);
        if (quarterToken) {
            const resolved = resolveQuarterRange(quarterToken.year, quarterToken.quarter, 'start');
            debugContext('parseDateRange:from-quarter', { arg, defaultYear, resolved });
            return resolved;
        }

        // Check for year format
        const year = parseInt(arg, 10);
        if (!isNaN(year) && year >= 1900 && year <= currentYear + 5) {
            lastContextYear = year;
            from = `${year}-01-01`;
            to = null; // To current date
            debugContext('parseDateRange:from-year', { arg, year });
        }
    } else if (args.length === 3 && args[1].toLowerCase() === 'to') {
        const arg1 = args[0];
        const arg2 = args[2];

        // Parse first argument (could be year or quarter)
        let year1, year2;
        let fromDate, toDate;

        // Parse first date
        const quarterTokenStart = parseQuarterToken(arg1, defaultYear);
        if (quarterTokenStart) {
            const resolvedStart = resolveQuarterRange(
                quarterTokenStart.year,
                quarterTokenStart.quarter,
                'full'
            );
            fromDate = resolvedStart.from;
            lastContextYear = quarterTokenStart.year;
            debugContext('parseDateRange:range-start-quarter', {
                arg1,
                defaultYear,
                resolvedStart,
            });
        } else {
            year1 = parseInt(arg1, 10);
            if (!isNaN(year1) && year1 >= 1900 && year1 <= currentYear + 5) {
                fromDate = `${year1}-01-01`;
                lastContextYear = year1;
                debugContext('parseDateRange:range-start-year', { arg1, year1 });
            }
        }

        // Parse second date
        const quarterTokenEnd = parseQuarterToken(arg2, defaultYear);
        if (quarterTokenEnd) {
            const resolvedEnd = resolveQuarterRange(
                quarterTokenEnd.year,
                quarterTokenEnd.quarter,
                'full'
            );
            toDate = resolvedEnd.to;
            debugContext('parseDateRange:range-end-quarter', {
                arg2,
                defaultYear,
                resolvedEnd,
            });
        } else {
            year2 = parseInt(arg2, 10);
            if (!isNaN(year2) && year2 >= 1900 && year2 <= currentYear + 5) {
                toDate = `${year2}-12-31`;
                if (!Number.isFinite(lastContextYear)) {
                    lastContextYear = year2;
                }
                debugContext('parseDateRange:range-end-year', { arg2, year2 });
            }
        }

        // Validate and set dates
        if (fromDate && toDate) {
            const date1 = new Date(fromDate);
            const date2 = new Date(toDate);
            if (date1 <= date2) {
                from = fromDate;
                to = toDate;
            }
        }
    }

    return { from, to };
}

export function formatDateRange(range) {
    if (range.from && range.to) {
        // Check if it's a quarter range
        const fromParts = range.from.split('-');
        const toParts = range.to.split('-');

        if (fromParts.length === 3 && toParts.length === 3 && fromParts[0] === toParts[0]) {
            const year = fromParts[0];
            const startMonth = parseInt(fromParts[1], 10);
            const endMonth = parseInt(toParts[1], 10);
            const endDay = parseInt(toParts[2], 10);

            // Q1: 01-01 to 03-31
            // Q2: 04-01 to 06-30
            // Q3: 07-01 to 09-30
            // Q4: 10-01 to 12-31

            const getQuarter = (m, d) => {
                if (m === 1 && d === 1) {
                    return 1;
                } // start of Q1
                if (m === 3 && d === 31) {
                    return 1;
                } // end of Q1
                if (m === 4 && d === 1) {
                    return 2;
                } // start of Q2
                if (m === 6 && d === 30) {
                    return 2;
                } // end of Q2
                if (m === 7 && d === 1) {
                    return 3;
                } // start of Q3
                if (m === 9 && d === 30) {
                    return 3;
                } // end of Q3
                if (m === 10 && d === 1) {
                    return 4;
                } // start of Q4
                if (m === 12 && d === 31) {
                    return 4;
                } // end of Q4
                return null;
            };

            const startQ = getQuarter(startMonth, parseInt(fromParts[2], 10));
            const endQ = getQuarter(endMonth, endDay);

            if (startQ && endQ && startQ === endQ) {
                return `Q${startQ} ${year}`;
            }

            // Check if full year
            if (range.from === `${year}-01-01` && range.to === `${year}-12-31`) {
                return year;
            }
        }

        return `${range.from} to ${range.to}`;
    }
    if (range.from) {
        return `from ${range.from}`;
    }
    if (range.to) {
        return `to ${range.to}`;
    }
    return 'all time';
}

export function parseSimplifiedDateRange(command) {
    const defaultYear = getDefaultYear();
    const parts = command.toLowerCase().split(':');
    if (parts.length === 1) {
        const quarterToken = parseQuarterToken(parts[0], defaultYear);
        if (quarterToken) {
            return resolveQuarterRange(quarterToken.year, quarterToken.quarter, 'full');
        }

        // Then check for year format (e.g., 2023)
        const year = parseInt(parts[0], 10);
        if (!isNaN(year)) {
            lastContextYear = year;
            return { from: `${year}-01-01`, to: `${year}-12-31` };
        }
    } else if (parts.length === 2) {
        const type = parts[0];
        const value = parts[1];
        if (type === 'from' || type === 'f') {
            const quarterToken = parseQuarterToken(value, defaultYear);
            if (quarterToken) {
                return resolveQuarterRange(quarterToken.year, quarterToken.quarter, 'start');
            }

            // Then check for year format (e.g., f:2023)
            const year = parseInt(value, 10);
            if (!isNaN(year)) {
                lastContextYear = year;
                return { from: `${year}-01-01`, to: null };
            }
        } else if (type === 'to') {
            const quarterToken = parseQuarterToken(value, defaultYear);
            if (quarterToken) {
                return resolveQuarterRange(quarterToken.year, quarterToken.quarter, 'end');
            }

            // Then check for year format (e.g., to:2023)
            const year = parseInt(value, 10);
            if (!isNaN(year)) {
                lastContextYear = year;
                return { from: null, to: `${year}-12-31` };
            }
        } else {
            // Check for year range format (e.g., 2020:2023)
            // Also check for quarter range format (e.g., 2020q1:2023q2)
            const quarterTokenStart = parseQuarterToken(type, defaultYear);
            const quarterTokenEnd = parseQuarterToken(value, defaultYear);
            if (quarterTokenStart && quarterTokenEnd) {
                const startDate = resolveQuarterRange(
                    quarterTokenStart.year,
                    quarterTokenStart.quarter,
                    'full'
                );
                const endDate = resolveQuarterRange(
                    quarterTokenEnd.year,
                    quarterTokenEnd.quarter,
                    'full'
                );
                const start = new Date(startDate.from);
                const end = new Date(endDate.to || endDate.from);
                if (
                    !Number.isNaN(start.getTime()) &&
                    !Number.isNaN(end.getTime()) &&
                    start <= end
                ) {
                    lastContextYear = quarterTokenStart.year;
                    return { from: startDate.from, to: endDate.to };
                }
            }

            const year1 = parseInt(type, 10);
            const year2 = parseInt(value, 10);
            if (!isNaN(year1) && !isNaN(year2) && year1 <= year2) {
                lastContextYear = year1;
                return { from: `${year1}-01-01`, to: `${year2}-12-31` };
            }
        }
    }
    return { from: null, to: null };
}
