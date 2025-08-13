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
        return typeof valueInUSD === 'string' ? valueInUSD : `${currencySymbols[targetCurrency] || '$'}0.00`;
    }

    const rate = exchangeRates[targetCurrency];
    if (typeof rate !== 'number') {
        console.warn(`Exchange rate for ${targetCurrency} not found. Displaying in USD.`);
        return `${currencySymbols['USD'] || '$'}${numValueInUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Work with the absolute value for conversion and formatting
    const absoluteConvertedValue = Math.abs(numValueInUSD * rate);
    const symbol = currencySymbols[targetCurrency] || targetCurrency; // Fallback to code if symbol missing

    // Format the number with locale-specific thousand separators and 2 decimal places.
    const formattedNumber = absoluteConvertedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
 * Formats a number into a compact representation (e.g., 1.2m, 500k).
 * @param {number} num The number to format.
 * @param {object} currencySymbols The currency symbols object.
 * @param {boolean} withSign Whether to include a sign (+/-).
 * @param {string} currency The currency to use for formatting.
 * @param {object} rates The exchange rates.
 * @returns {string} The formatted number string.
 */
export function formatNumber(num, currencySymbols, withSign = false, currency = 'USD', rates = {}) {
    if (num === null || num === undefined || isNaN(num)) {
        return '';
    }

    const convertedNum = num * (rates[currency] || 1);
    const sign = convertedNum > 0 ? '+' : (convertedNum < 0 ? '-' : '');
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
    } else {
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
                precision = 4 - Math.floor(Math.log10(val)) - 1;
                if (precision < 0) {
                    precision = 0;
                }
                if (suffix === 'k' && precision > 2) {
                    precision = 2;
                }
            }
            formattedNum = symbol + val.toFixed(precision) + suffix;
        }
        return formattedNum;
    }
}