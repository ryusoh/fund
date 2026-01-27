import { logger } from './logger.js';

/**
 * Formats a numeric value as a currency string in the target currency.
 * @param {number} valueInUSD - The value in USD.
 * @param {string} targetCurrency - The target currency code (e.g., 'USD', 'CNY', 'JPY').
 * @param {Object} exchangeRates - An object with currency codes as keys and rates against USD as values.
 * @param {Object} currencySymbols - An object mapping currency codes to their symbols.
 * @returns {string} The formatted currency string.
 */
export function formatCurrency(valueInUSD, targetCurrency, exchangeRates, currencySymbols) {
    const numValueInUSD = parseFloat(valueInUSD);
    if (isNaN(numValueInUSD)) {
        return typeof valueInUSD === 'string'
            ? valueInUSD
            : `${currencySymbols[targetCurrency] || '$'}0.00`;
    }

    const rate = exchangeRates[targetCurrency];
    if (typeof rate !== 'number') {
        logger.warn(`Exchange rate for ${targetCurrency} not found. Displaying in USD.`);
        return `${currencySymbols['USD'] || '$'}${numValueInUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Work with the absolute value for conversion and formatting
    const absoluteConvertedValue = Math.abs(numValueInUSD * rate);
    const symbol = currencySymbols[targetCurrency] || targetCurrency; // Fallback to code if symbol missing

    // Format the number with locale-specific thousand separators and 2 decimal places.
    const formattedNumber = absoluteConvertedValue.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

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
 * @param {object} entry The data entry containing currency values.
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
        !isNaN(entry[currencyKey])
    ) {
        return entry[currencyKey];
    }

    // Fallback to default field with rate conversion (backwards compatibility)
    const baseValue = entry[valueType] || 0;
    return baseValue; // Return as-is since this is already in base currency
}

/**
 * Formats a number into a compact representation (e.g., 1.2m, 500k).
 * For historical data, uses actual historical currency values when available.
 * @param {number} num The number to format.
 * @param {object} currencySymbols The currency symbols object.
 * @param {boolean} withSign Whether to include a sign (+/-).
 * @param {string} currency The currency to use for formatting.
 * @param {object} rates The exchange rates (used only for non-historical data).
 * @param {object} entry Optional: historical data entry to extract currency values from.
 * @param {string} valueType Either 'total' or 'dailyChange' (used with entry).
 * @returns {string} The formatted number string.
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
    if (num === null || num === undefined || isNaN(num)) {
        return '';
    }

    let convertedNum;

    // If we have historical data entry, use actual historical currency values
    if (entry && (valueType === 'total' || valueType === 'dailyChange')) {
        convertedNum = getHistoricalCurrencyValue(entry, currency, valueType);
    } else {
        // Fallback to rate conversion for real-time or non-historical data
        convertedNum = num * (rates[currency] || 1);
    }

    const sign = convertedNum > 0 ? '+' : convertedNum < 0 ? '-' : '';
    const absNum = Math.abs(convertedNum);
    let formattedNum;

    const symbol = currencySymbols[currency] || '';

    if (withSign) {
        let val;
        let suffix = '';
        if (absNum >= 1e9) {
            val = absNum / 1e9;
            suffix = 'b';
        } else if (absNum >= 1e6) {
            val = absNum / 1e6;
            suffix = 'm';
        } else if (absNum >= 1e3) {
            val = absNum / 1e3;
            suffix = 'k';
        } else {
            val = absNum;
        }

        let formattedVal;
        if (val >= 100) {
            formattedVal = val.toFixed(0);
        } else if (val >= 10) {
            formattedVal = val.toFixed(1);
        } else if (val >= 1) {
            formattedVal = val.toFixed(2);
        } else {
            formattedVal = val.toPrecision(3);
        }

        formattedNum = symbol + formattedVal + suffix;
        return sign + formattedNum;
    }
    let val;
    let suffix = '';
    if (currency === 'KRW' && absNum >= 1e6 && absNum < 1e9) {
        val = absNum / 1e6;
        suffix = 'm';
        let precision = 3 - Math.floor(Math.log10(val)) - 1;
        if (precision < 0) {
            precision = 0;
        }
        formattedNum = symbol + val.toFixed(precision) + suffix;
    } else {
        if (absNum >= 1e9) {
            val = absNum / 1e9;
            suffix = 'b';
        } else if (absNum >= 1e6) {
            val = absNum / 1e6;
            suffix = 'm';
        } else if (absNum >= 1e3) {
            val = absNum / 1e3;
            suffix = 'k';
        } else {
            val = absNum;
        }

        let precision = 0;
        if (val > 0) {
            if (suffix === '' && val % 1 === 0) {
                precision = 0;
            } else {
                precision = 4 - Math.floor(Math.log10(val)) - 1;
                if (precision < 0) {
                    precision = 0;
                }
                if (suffix === 'k' && precision > 2) {
                    precision = 2;
                }
            }
        }
        formattedNum = symbol + val.toFixed(precision) + suffix;
    }
    return formattedNum;
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
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
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

function defaultCurrencyFormatter(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return '$0.00';
    }
    const sign = numeric < 0 ? '-' : '';
    const formatted = Math.abs(numeric).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${sign}$${formatted}`;
}

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

export function formatSummaryDateSuffix(actualDate, targetDateStr) {
    if (!(actualDate instanceof Date)) {
        return '';
    }
    const actual = actualDate.toISOString().split('T')[0];
    if (!targetDateStr || actual === targetDateStr) {
        return '';
    }
    return ` (${actual})`;
}

export function formatSummaryBlock(label, summary, dateRange, { formatValue } = {}) {
    if (!summary || !summary.hasData) {
        return `  ${label}\n    (no data for selected range)`;
    }
    const formatValueFn =
        typeof formatValue === 'function' ? formatValue : defaultCurrencyFormatter;
    const startSuffix = formatSummaryDateSuffix(summary.startDate, dateRange?.from);
    const endSuffix = formatSummaryDateSuffix(summary.endDate, dateRange?.to);
    const startText = formatValueFn(summary.startValue);
    const endText = formatValueFn(summary.endValue);
    const changeText = formatCurrencyChange(summary.netChange, formatValueFn);

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
        `    End: ${endText}${endSuffix}`,
        `    Change: ${changeText}${percentageText}`,
    ].join('\n');
}

export function formatAppreciationBlock(balanceSummary, contributionSummary, { formatValue } = {}) {
    if (
        !balanceSummary ||
        !contributionSummary ||
        !balanceSummary.hasData ||
        !contributionSummary.hasData
    ) {
        return '';
    }
    const formatValueFn =
        typeof formatValue === 'function' ? formatValue : defaultCurrencyFormatter;
    const deltaContribution = contributionSummary.netChange;
    const deltaBalance = balanceSummary.netChange;
    const valueAdded = deltaBalance - deltaContribution;
    if (!Number.isFinite(valueAdded)) {
        return '';
    }
    const changeText = formatCurrencyChange(valueAdded, formatValueFn);

    // Calculate appreciation percentage relative to contribution end value
    const contributionEndValue = contributionSummary.endValue;
    let percentageText = '';
    if (Number.isFinite(contributionEndValue) && contributionEndValue !== 0) {
        const percentage = (valueAdded / contributionEndValue) * 100;
        const sign = percentage > 0 ? '+' : '';
        percentageText = ` (${sign}${percentage.toFixed(2)}%)`;
    }

    return [
        '  Appreciation',
        `    Value: ${changeText}${percentageText}`,
        '    (balance change minus contribution change)',
    ].join('\n');
}

/**
 * Formats a number to a percentage string.
 * @param {number} num The number to format.
 * @returns {string} The formatted percentage string.
 */
export function formatAsPercentage(num) {
    return `${(num * 100).toFixed(2)}%`;
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

/**
 * Formats a number to a currency string with a specified currency symbol.
 * @param {number} num The number to format.
 * @param {string} symbol The currency symbol.
 * @returns {string} The formatted currency string.
 */
export function formatWithCurrencySymbol(num, symbol) {
    return `${symbol}${num.toFixed(2)}`;
}

/**
 * Formats a number to a string with a specified precision.
 * @param {number} num The number to format.
 * @param {number} precision The precision.
 * @returns {string} The formatted number string.
 */
export function formatWithPrecision(num, precision) {
    return num.toPrecision(precision);
}

/**
 * Formats a number to an exponential string.
 * @param {number} num The number to format.
 * @param {number} fractionDigits The number of fraction digits.
 * @returns {string} The formatted exponential string.
 */
export function formatExponential(num, fractionDigits) {
    return num.toExponential(fractionDigits);
}

/**
 * Formats a number to a locale-specific string.
 * @param {number} num The number to format.
 * @param {string} locales The locales.
 * @param {object} options The options.
 * @returns {string} The formatted locale-specific string.
 */
export function formatToLocaleString(num, locales, options) {
    return num.toLocaleString(locales, options);
}

/**
 * Formats a number to a string with a specified radix.
 * @param {number} num The number to format.
 * @param {number} radix The radix.
 * @returns {string} The formatted number string.
 */
export function formatToString(num, radix) {
    return num.toString(radix);
}

/**
 * Formats a number to a string with a specified number of significant digits.
 * @param {number} num The number to format.
 * @param {number} significantDigits The number of significant digits.
 * @returns {string} The formatted number string.
 */
export function formatToPrecision(num, significantDigits) {
    return num.toPrecision(significantDigits);
}

/**
 * Formats a number to a string with a specified number of fraction digits.
 * @param {number} num The number to format.
 * @param {number} fractionDigits The number of fraction digits.
 * @returns {string} The formatted number string.
 */
export function formatToFixed(num, fractionDigits) {
    return num.toFixed(fractionDigits);
}

/**
 * Formats a number to a string in exponential notation.
 * @param {number} num The number to format.
 * @param {number} fractionDigits The number of fraction digits.
 * @returns {string} The formatted number string.
 */
export function formatToExponential(num, fractionDigits) {
    return num.toExponential(fractionDigits);
}

/**
 * Formats a number to a string in the specified locale.
 * @param {number} num The number to format.
 * @param {string} locale The locale.
 * @returns {string} The formatted number string.
 */
export function formatToLocale(num, locale) {
    return num.toLocaleString(locale);
}

/**
 * Formats a number to a string with a specified number of leading zeros.
 * @param {number} num The number to format.
 * @param {number} length The desired length of the string.
 * @returns {string} The formatted number string.
 */
export function padWithLeadingZeros(num, length) {
    return num.toString().padStart(length, '0');
}

/**
 * Formats a number to a string with a specified number of trailing zeros.
 * @param {number} num The number to format.
 * @param {number} length The desired length of the string.
 * @returns {string} The formatted number string.
 */
export function padWithTrailingZeros(num, length) {
    let str = num.toString();
    if (str.indexOf('.') === -1) {
        str += '.';
    }
    return str.padEnd(length, '0');
}

/**
 * Formats a number to a string with a specified number of spaces.
 * @param {number} num The number to format.
 * @param {number} length The desired length of the string.
 * @returns {string} The formatted number string.
 */
export function padWithSpaces(num, length) {
    return num.toString().padStart(length, ' ');
}

/**
 * Formats a number to a string with a specified character.
 * @param {number} num The number to format.
 * @param {number} length The desired length of the string.
 * @param {string} char The character to use for padding.
 * @returns {string} The formatted number string.
 */
export function padWithChar(num, length, char) {
    return num.toString().padStart(length, char);
}

/**
 * Formats a number to a string with a specified prefix.
 * @param {number} num The number to format.
 * @param {string} prefix The prefix.
 * @returns {string} The formatted number string.
 */
export function addPrefix(num, prefix) {
    return prefix + num.toString();
}

/**
 * Formats a number to a string with a specified suffix.
 * @param {number} num The number to format.
 * @param {string} suffix The suffix.
 * @returns {string} The formatted number string.
 */
export function addSuffix(num, suffix) {
    return num.toString() + suffix;
}

/**
 * Formats a number to a string with a specified separator.
 * @param {number} num The number to format.
 * @param {string} separator The separator.
 * @returns {string} The formatted number string.
 */
export function addSeparator(num, separator) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Formats a number to a string with a specified decimal separator.
 * @param {number} num The number to format.
 * @param {string} separator The decimal separator.
 * @returns {string} The formatted number string.
 */
export function changeDecimalSeparator(num, separator) {
    return num.toString().replace('.', separator);
}

/**
 * Formats a number to a string with a specified thousand separator.
 * @param {number} num The number to format.
 * @param {string} separator The thousand separator.
 * @returns {string} The formatted number string.
 */
export function changeThousandSeparator(num, separator) {
    return num.toString().replace(/,/g, separator);
}

/**
 * Formats a number to a string with a specified currency symbol position.
 * @param {number} num The number to format.
 * @param {string} symbol The currency symbol.
 * @param {string} position The position of the currency symbol ('before' or 'after').
 * @returns {string} The formatted number string.
 */
export function changeCurrencySymbolPosition(num, symbol, position) {
    if (position === 'after') {
        return num.toString() + symbol;
    }
    return symbol + num.toString();
}

/**
 * Formats a number to a string with a specified sign position.
 * @param {number} num The number to format.
 * @param {string} position The position of the sign ('before' or 'after').
 * @returns {string} The formatted number string.
 */
export function changeSignPosition(num, position) {
    const sign = num > 0 ? '+' : '-';
    const absNum = Math.abs(num);
    if (position === 'after') {
        return absNum.toString() + sign;
    }
    return sign + absNum.toString();
}

/**
 * Formats a number to a string with a specified number of digits.
 * @param {number} num The number to format.
 * @param {number} digits The number of digits.
 * @returns {string} The formatted number string.
 */
export function toDigits(num, digits) {
    return num.toExponential(digits - 1);
}

/**
 * Formats a number to a string with a specified number of integer digits.
 * @param {number} num The number to format.
 * @param {number} digits The number of integer digits.
 * @returns {string} The formatted number string.
 */
export function toIntegerDigits(num, digits) {
    const parts = num.toString().split('.');
    return parts[0].padStart(digits, '0') + (parts[1] ? '.' + parts[1] : '');
}
