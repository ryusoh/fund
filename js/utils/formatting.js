import { logger } from './logger.js';
import { toLocalIsoDate } from './date.js';

// Bolt: Cache Intl.NumberFormat instances to prevent expensive recreation and speed up formatCurrency
const numberFormatCache = new Map();
export function getNumberFormatter(
    locale = undefined,
    minFrac = 2,
    maxFrac = 2,
    extraOptionsOrCurrency = {}
) {
    let extraOptions = {};
    if (typeof extraOptionsOrCurrency === 'string') {
        extraOptions = { style: 'currency', currency: extraOptionsOrCurrency };
    } else if (extraOptionsOrCurrency && typeof extraOptionsOrCurrency === 'object') {
        extraOptions = extraOptionsOrCurrency;
    }

    const extraKey = Object.keys(extraOptions).length ? JSON.stringify(extraOptions) : '';
    const key = `${locale}-${minFrac}-${maxFrac}-${extraKey}`;

    let formatter = numberFormatCache.get(key);
    if (!formatter) {
        const options = {
            minimumFractionDigits: minFrac,
            maximumFractionDigits: maxFrac,
            ...extraOptions,
        };
        formatter = new Intl.NumberFormat(locale, options);
        numberFormatCache.set(key, formatter);
    }
    return formatter;
}

/**
 * Formats a numeric value as a currency string in the target currency.
 * @param {number|string} valueInUSD - The value in USD.
 * @param {string} targetCurrency - The target currency code (e.g., 'USD', 'CNY', 'JPY').
 * @param {Record<string, number>} exchangeRates - An object with currency codes as keys and rates against USD as values.
 * @param {Record<string, string>} currencySymbols - An object mapping currency codes to their symbols.
 * @returns {string} The formatted currency string.
 */
export function formatCurrency(valueInUSD, targetCurrency, exchangeRates, currencySymbols) {
    const numValueInUSD = parseFloat(String(valueInUSD));
    if (isNaN(numValueInUSD)) {
        return typeof valueInUSD === 'string'
            ? valueInUSD
            : `${currencySymbols[targetCurrency] || '$'}0.00`;
    }

    const rate = exchangeRates[targetCurrency];
    const formatter = getNumberFormatter();

    if (typeof rate !== 'number') {
        logger.warn(`Exchange rate for ${targetCurrency} not found. Displaying in USD.`);
        return `${currencySymbols['USD'] || '$'}${formatter.format(numValueInUSD)}`;
    }

    // Work with the absolute value for conversion and formatting
    const absoluteConvertedValue = Math.abs(numValueInUSD * rate);
    const symbol = currencySymbols[targetCurrency] || targetCurrency; // Fallback to code if symbol missing

    // Format the number with locale-specific thousand separators and 2 decimal places.
    const formattedNumber = formatter.format(absoluteConvertedValue);

    return `${symbol}${formattedNumber}`;
}

/**
 * Formats a number into a compact, human-readable string with metric prefixes (k, M, B).
 * @param {number} num - The number to format.
 * @returns {string} The compacted number string (e.g., "1.23M", "25.5k").
 */
export function compactNumber(num) {
    if (typeof num !== 'number' || isNaN(num)) {
        return '0';
    }

    const absNum = Math.abs(num);

    if (absNum < 1000) {
        return num.toString();
    }

    const units = ['k', 'M', 'B', 'T'];
    const unitIndex = Math.floor(Math.log10(absNum) / 3) - 1;
    const unit = units[unitIndex];

    if (!unit) {
        return num.toExponential(2);
    }

    const value = absNum / Math.pow(1000, unitIndex + 1);

    let formattedValue;
    if (value >= 100) {
        formattedValue = value.toFixed(0);
    } else if (value >= 10) {
        formattedValue = value.toFixed(1);
    } else {
        formattedValue = value.toFixed(2);
    }

    return `${num < 0 ? '-' : ''}${formattedValue}${unit}`;
}

/**
 * Formats a percentage value with a sign and two decimal places.
 * @param {number} value - The percentage value (e.g., 0.05 for 5%).
 * @returns {string} The formatted percentage string (e.g., "+5.00%").
 */
export function formatPercentage(value) {
    if (typeof value !== 'number' || isNaN(value)) {
        return '0.00%';
    }
    const sign = value > 0 ? '+' : '';
    return `${sign}${(value * 100).toFixed(2)}%`;
}

/**
 * Gets the historical currency value from a data entry based on the selected currency.
 * @param {Record<string, unknown>} entry The data entry containing currency values.
 * @param {string} currency The target currency ('USD', 'CNY', 'JPY', 'KRW').
 * @param {string} valueType Either 'total' or 'dailyChange'.
 * @returns {number} The value in the specified currency.
 */
export function getHistoricalCurrencyValue(entry, currency, valueType = 'total') {
    if (!entry) {
        return 0;
    }

    const currencyKey = `${valueType}${currency}`;

    // Check if historical currency data exists
    if (
        entry[currencyKey] !== undefined &&
        entry[currencyKey] !== null &&
        !isNaN(Number(entry[currencyKey]))
    ) {
        return Number(entry[currencyKey]);
    }

    // Fallback to default field with rate conversion (backwards compatibility)
    const baseValue = Number(entry[valueType]) || 0;
    return baseValue; // Return as-is since this is already in base currency
}

/**
 * Resolves the numeric value to use: the historical currency value when an
 * entry is provided, otherwise the number converted at the current rate.
 * @param {number} num The number to convert.
 * @param {string} currency The currency to convert to.
 * @param {Record<string, number>} rates The exchange rates (used for non-historical data).
 * @param {Record<string, any> | null} [entry] Optional: historical data entry to extract currency values from.
 * @param {string} [valueType] Either 'total' or 'dailyChange' (used with entry).
 * @returns {number} The converted numeric value.
 */
function getConvertedNum(num, currency, rates, entry, valueType) {
    if (entry && (valueType === 'total' || valueType === 'dailyChange')) {
        return getHistoricalCurrencyValue(entry, currency, valueType);
    }
    return num * (rates[currency] || 1);
}

/**
 * @param {number} num
 * @returns {string}
 */
function getNumberSign(num) {
    if (num > 0) {
        return '+';
    }
    if (num < 0) {
        return '-';
    }
    return '';
}

/**
 * @param {unknown} num
 * @returns {boolean}
 */
function isValidNumber(num) {
    return num !== null && num !== undefined && !Number.isNaN(Number(num));
}

/**
 * @param {unknown} num
 * @param {Record<string, string>} currencySymbols
 * @param {boolean} [withSign]
 * @param {string} [currency]
 * @param {Record<string, number>} [rates]
 * @param {Record<string, any> | null} [entry]
 * @param {string} [valueType]
 * @returns {string}
 */
export function formatNumber(
    num,
    currencySymbols,
    withSign = false,
    currency = 'USD',
    rates = {},
    entry = null,
    valueType = 'total'
) {
    if (!isValidNumber(num)) {
        return '';
    }

    const convertedNum = getConvertedNum(Number(num), currency, rates, entry, valueType);
    const sign = getNumberSign(convertedNum);
    const absNum = Math.abs(convertedNum);
    const symbol = currencySymbols[currency] || '';

    if (withSign) {
        return sign + formatNumberWithSign(absNum, symbol);
    }
    return formatNumberWithoutSign(absNum, currency, symbol);
}

/**
 * @param {number} absNum
 * @returns {{ val: number, suffix: string }}
 */
function getMagnitude(absNum) {
    if (absNum >= 1e9) {
        return { val: absNum / 1e9, suffix: 'b' };
    }
    if (absNum >= 1e6) {
        return { val: absNum / 1e6, suffix: 'm' };
    }
    if (absNum >= 1e3) {
        return { val: absNum / 1e3, suffix: 'k' };
    }
    return { val: absNum, suffix: '' };
}

/**
 * @param {number} absNum
 * @param {string} symbol
 * @returns {string}
 */
function formatNumberWithSign(absNum, symbol) {
    const { val, suffix } = getMagnitude(absNum);
    let formattedVal;
    if (val >= 100) {
        formattedVal = val.toFixed(0);
    } else if (val >= 10) {
        formattedVal = val.toFixed(1);
    } else if (val >= 0.01) {
        formattedVal = val.toFixed(2);
    } else if (val === 0) {
        formattedVal = '0';
    } else {
        formattedVal = val.toPrecision(3);
    }
    return symbol + formattedVal + suffix;
}

/**
 * @param {number} val
 * @param {string} suffix
 * @returns {number}
 */
function calculatePrecision(val, suffix) {
    let precision = 0;
    if (val > 0) {
        if (suffix === '' && val % 1 === 0) {
            precision = 0;
        } else {
            precision = 4 - Math.floor(Math.log10(val)) - 1;
            if (precision < 0) {
                precision = 0;
            }
            if (suffix === '' && val >= 0.01) {
                precision = Math.min(precision, 2);
            }
            if (suffix === 'k' && precision > 2) {
                precision = 2;
            }
        }
    }
    return precision;
}

/**
 * @param {number} absNum
 * @param {string} currency
 * @param {string} symbol
 * @returns {string}
 */
function formatNumberWithoutSign(absNum, currency, symbol) {
    if (currency === 'KRW' && absNum >= 1e6 && absNum < 1e9) {
        const val = absNum / 1e6;
        let precision = 3 - Math.floor(Math.log10(val)) - 1;
        if (precision < 0) {
            precision = 0;
        }
        return symbol + val.toFixed(precision) + 'm';
    }
    const { val, suffix } = getMagnitude(absNum);
    const precision = calculatePrecision(val, suffix);
    return symbol + val.toFixed(precision) + suffix;
}

/**
 * Formats a number to a string with a specified number of decimal places.
 * @param {number} num The number to format.
 * @param {number} decimalPlaces The number of decimal places.
 * @returns {string} The formatted number string.
 */
export function toFixed(num, decimalPlaces) {
    if (isNaN(num) || num === null) {
        return '';
    }
    return num.toFixed(decimalPlaces);
}

/**
 * Formats a number as a currency string.
 * @param {number} amount The amount to format.
 * @param {string} currency The currency code.
 * @returns {string} The formatted currency string.
 */
export function formatAsCurrency(amount, currency) {
    const formatter = getNumberFormatter(undefined, 2, 2, currency);
    return formatter.format(amount);
}

/**
 * Formats a number by adding commas as thousand separators.
 * @param {number} num The number to format.
 * @returns {string} The formatted number string.
 */
export function addCommas(num) {
    if (num === null || num === undefined) {
        return '';
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats a date object or string into "YYYY-MM-DD" format.
 * @param {Date|string} date The date to format.
 * @returns {string} The formatted date string.
 */
export function formatDate(date) {
    if (!date) {
        return '';
    }
    const d = new Date(date);
    const year = d.getFullYear();
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
}

/**
 * Formats a number to a string with a sign (+ or -).
 * @param {number} num The number to format.
 * @returns {string} The formatted number string with a sign.
 */
export function formatWithSign(num) {
    if (num > 0) {
        return '+' + num;
    }
    return num.toString();
}

/**
 * Formats a number to two decimal places.
 * @param {number} num The number to format.
 * @returns {string} The formatted number string.
 */
export function formatToTwoDecimals(num) {
    return num.toFixed(2);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function defaultCurrencyFormatter(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return '$0.00';
    }
    const sign = numeric < 0 ? '-' : '';
    const formatter = getNumberFormatter();
    const formatted = formatter.format(Math.abs(numeric));
    return `${sign}$${formatted}`;
}

/**
 * @param {unknown} value
 * @param {(value: any) => string} [formatter]
 * @returns {string}
 */
export function formatCurrencyChange(value, formatter = defaultCurrencyFormatter) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 'n/a';
    }
    const formatFn = typeof formatter === 'function' ? formatter : defaultCurrencyFormatter;
    const formatted = formatFn(numeric);
    if (numeric > 0) {
        return formatted?.startsWith('+') ? formatted : `+${formatted}`;
    }
    return formatted;
}

/**
 * @param {Date | null} actualDate
 * @param {string} [targetDateStr]
 * @returns {string}
 */
export function formatSummaryDateSuffix(actualDate, targetDateStr) {
    if (!(actualDate instanceof Date)) {
        return '';
    }
    // Summary dates are local-midnight (normalizeDateOnly); toISOString()
    // would display the previous day in UTC+ timezones.
    const actual = toLocalIsoDate(actualDate);
    if (!targetDateStr || actual === targetDateStr) {
        return '';
    }
    return ` (${actual})`;
}

/**
 * @param {string} label
 * @param {any} summary
 * @param {any} dateRange
 * @param {any} [options]
 * @returns {string}
 */
export function formatSummaryBlock(
    label,
    summary,
    dateRange,
    { formatValue } = /** @type {{ formatValue?: (value: any) => string }} */ ({})
) {
    if (!summary || !summary.hasData) {
        return `  ${label}\n    (no data for selected range)`;
    }
    const formatValueFn =
        typeof formatValue === 'function' ? formatValue : defaultCurrencyFormatter;
    const startSuffix = formatSummaryDateSuffix(summary.startDate, dateRange?.from);
    const startText = formatValueFn(summary.startValue);
    const endText = formatValueFn(summary.endValue);
    const changeText = formatCurrencyChange(summary.netChange, formatValueFn);

    // Always show end date for consistency with start date
    let endDateText = '';
    if (summary.endDate instanceof Date) {
        endDateText = ` (${toLocalIsoDate(summary.endDate)})`;
    }

    // Calculate change percentage relative to start value
    let percentageText = '';
    if (Number.isFinite(summary.startValue) && summary.startValue !== 0) {
        const percentage = (summary.netChange / summary.startValue) * 100;
        const sign = percentage > 0 ? '+' : '';
        percentageText = ` (${sign}${percentage.toFixed(2)}%)`;
    }

    return [
        `  ${label}`,
        `    Start: ${startText}${startSuffix}`,
        `    End: ${endText}${endDateText}`,
        `    Change: ${changeText}${percentageText}`,
    ].join('\n');
}

/**
 * @param {any} balanceSummary
 * @param {any} contributionSummary
 * @param {any} [options]
 * @returns {string}
 */
export function formatAppreciationBlock(
    balanceSummary,
    contributionSummary,
    { formatValue } = /** @type {{ formatValue?: (value: any) => string }} */ ({})
) {
    if (!balanceSummary?.hasData || !contributionSummary?.hasData) {
        return '';
    }
    const formatValueFn =
        typeof formatValue === 'function' ? formatValue : defaultCurrencyFormatter;
    const valueAdded = balanceSummary.netChange - contributionSummary.netChange;
    if (!Number.isFinite(valueAdded)) {
        return '';
    }
    const changeText = formatCurrencyChange(valueAdded, formatValueFn);
    const percentageText = calculateAppreciationPercentage(
        valueAdded,
        contributionSummary.endValue
    );

    return [
        '  Appreciation',
        `    Value: ${changeText}${percentageText}`,
        '    (balance change minus contribution change)',
    ].join('\n');
}

/**
 * @param {number} valueAdded
 * @param {number} endValue
 * @returns {string}
 */
function calculateAppreciationPercentage(valueAdded, endValue) {
    if (Number.isFinite(endValue) && endValue !== 0) {
        const percentage = (valueAdded / endValue) * 100;
        const sign = percentage > 0 ? '+' : '';
        return ` (${sign}${percentage.toFixed(2)}%)`;
    }
    return '';
}

/**
 * Formats a number to a compact string with a suffix (k, m, b).
 * @param {number} num The number to format.
 * @returns {string} The formatted compact number string.
 */
export function formatCompact(num) {
    if (num >= 1e9) {
        return (num / 1e9).toFixed(1) + 'b';
    }
    if (num >= 1e6) {
        return (num / 1e6).toFixed(1) + 'm';
    }
    if (num >= 1e3) {
        return (num / 1e3).toFixed(1) + 'k';
    }
    return num.toString();
}
