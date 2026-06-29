import { transactionState, getSelectedCurrency } from './state.js';
import { CURRENCY_SYMBOLS } from '@js/config.js';

export function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getSymbolForCurrency(currency) {
    const normalized = typeof currency === 'string' ? currency.toUpperCase() : null;
    if (normalized && CURRENCY_SYMBOLS[normalized]) {
        return CURRENCY_SYMBOLS[normalized];
    }
    const selected = transactionState.selectedCurrency;
    if (selected && CURRENCY_SYMBOLS[selected]) {
        return CURRENCY_SYMBOLS[selected];
    }
    return transactionState.currencySymbol || '$';
}

function getFxEntry(currency) {
    return transactionState.fxRatesByCurrency?.[currency] || null;
}

// Cache for FX rates to avoid repeated binary searches
const fxRateCache = new Map(); // currency -> Map<dateString, rate>

function _setCachedFxRate(currency, dateString, rate) {
    let currencyCache = fxRateCache.get(currency);
    if (!currencyCache) {
        currencyCache = new Map();
        fxRateCache.set(currency, currencyCache);
    }
    currencyCache.set(dateString, rate);
    return rate;
}

function _findClosestDateRate(fxEntry, timestamp) {
    let left = 0;
    let right = fxEntry.sorted.length - 1;
    let candidateIndex = 0;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const midValue = fxEntry.sorted[mid].ts;
        if (midValue === timestamp) {
            candidateIndex = mid;
            break;
        }
        if (midValue < timestamp) {
            candidateIndex = mid;
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    const candidateDate = fxEntry.sorted[candidateIndex]?.date;
    return (candidateDate && fxEntry.map.get(candidateDate)) || 1;
}

function _computeFxRate(fxEntry, dateString) {
    if (fxEntry.map.has(dateString)) {
        return fxEntry.map.get(dateString) || 1;
    }
    const timestamp = Date.parse(dateString);
    if (!Number.isFinite(timestamp)) {
        const firstKey = fxEntry.sorted[0]?.date;
        return (firstKey && fxEntry.map.get(firstKey)) || 1;
    }
    return _findClosestDateRate(fxEntry, timestamp);
}

function findFxRate(dateString, currency) {
    if (!currency || currency === 'USD') {
        return 1;
    }

    // Check cache first
    const currencyCache = fxRateCache.get(currency);
    if (currencyCache?.has(dateString)) {
        return currencyCache.get(dateString);
    }

    const fxEntry = getFxEntry(currency);
    if (!fxEntry || !fxEntry.map || !fxEntry.sorted?.length) {
        return 1;
    }

    const rate = _computeFxRate(fxEntry, dateString);
    return _setCachedFxRate(currency, dateString, rate);
}

export function clearFxRateCache() {
    fxRateCache.clear();
}

export function convertValueToCurrency(value, dateString, currency = getSelectedCurrency()) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return 0;
    }
    let normalizedDate = dateString;
    if (normalizedDate instanceof Date) {
        normalizedDate = normalizedDate.toISOString().split('T')[0];
    }
    if (!currency || currency === 'USD') {
        return amount;
    }
    const rate = findFxRate(normalizedDate, currency);
    return amount * rate;
}

function _normalizeCurrency(currency) {
    return typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'USD';
}

function _convertToUSD(amount, normalizedDate, source) {
    if (source === 'USD') {
        return amount;
    }
    const fromRate = findFxRate(normalizedDate, source);
    if (!Number.isFinite(fromRate) || fromRate === 0) {
        return null;
    }
    return amount / fromRate;
}

function _convertFromUSD(usdAmount, normalizedDate, target) {
    if (target === 'USD') {
        return usdAmount;
    }
    const targetRate = findFxRate(normalizedDate, target);
    if (!Number.isFinite(targetRate) || targetRate === 0) {
        return usdAmount;
    }
    return usdAmount * targetRate;
}

export function convertBetweenCurrencies(
    value,
    fromCurrency,
    dateString,
    toCurrency = getSelectedCurrency()
) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return 0;
    }
    const normalizedDate =
        dateString instanceof Date ? dateString.toISOString().split('T')[0] : dateString;

    const source = _normalizeCurrency(fromCurrency);
    const target = _normalizeCurrency(toCurrency);

    if (source === target) {
        return amount;
    }

    const usdAmount = _convertToUSD(amount, normalizedDate, source);
    if (usdAmount === null) {
        return amount;
    }

    return _convertFromUSD(usdAmount, normalizedDate, target);
}

// Bolt: Cache Intl.NumberFormat instances to prevent expensive recreation and speed up formatCurrency
const numberFormatCache = new Map();
function getNumberFormatter(locale = 'en-US', minFrac = 2, maxFrac = 2) {
    const key = `${locale}-${minFrac}-${maxFrac}`;
    let formatter = numberFormatCache.get(key);
    if (!formatter) {
        formatter = new Intl.NumberFormat(locale, {
            minimumFractionDigits: minFrac,
            maximumFractionDigits: maxFrac,
        });
        numberFormatCache.set(key, formatter);
    }
    return formatter;
}

export function formatCurrency(value, { currency } = {}) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const absolute = Math.abs(amount);
    const formatter = getNumberFormatter('en-US', 2, 2);
    const formatted = formatter.format(absolute);
    const sign = amount < 0 ? '-' : '';
    const symbol = getSymbolForCurrency(currency || transactionState.selectedCurrency);
    return `${sign}${symbol}${formatted}`;
}

export function formatCurrencyInlineValue(value, { digits = 0, currency } = {}) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const absolute = Math.abs(amount);
    const formatter = getNumberFormatter('en-US', digits, digits);
    const formatted = formatter.format(absolute);
    const sign = amount < 0 ? '-' : '';
    const symbol = getSymbolForCurrency(currency || transactionState.selectedCurrency);
    return `${sign}${symbol}${formatted}`;
}

export function formatCurrencyInline(value) {
    if (!Number.isFinite(value)) {
        return formatCurrencyInlineValue(0);
    }
    const absolute = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    const symbol = getSymbolForCurrency(transactionState.selectedCurrency);
    if (absolute >= 1_000_000_000) {
        return `${sign}${symbol}${(absolute / 1_000_000_000).toFixed(2)}B`;
    }
    if (absolute >= 1_000_000) {
        return `${sign}${symbol}${(absolute / 1_000_000).toFixed(2)}M`;
    }
    if (absolute >= 1_000) {
        return `${sign}${symbol}${(absolute / 1_000).toFixed(1)}k`;
    }
    if (absolute >= 1) {
        return `${sign}${symbol}${absolute.toFixed(0)}`;
    }
    return `${sign}${symbol}${absolute.toFixed(2)}`;
}

function _formatCompactTrillions(absolute, sign, symbol, isCJKCurrency) {
    const trillions = absolute / 1_000_000_000_000;
    if (isCJKCurrency) {
        if (trillions >= 100) {
            return `${sign}${symbol}${trillions.toFixed(0)}T`;
        }
        if (trillions >= 10) {
            return `${sign}${symbol}${trillions.toFixed(1)}T`;
        }
        return `${sign}${symbol}${trillions.toFixed(2)}T`;
    }

    const rounded = Math.round(trillions);
    if (Math.abs(trillions - rounded) < 0.1) {
        return `${sign}${symbol}${rounded}T`;
    }

    if (trillions >= 100) {
        return `${sign}${symbol}${trillions.toFixed(0)}T`;
    }
    if (trillions >= 10) {
        return `${sign}${symbol}${trillions.toFixed(1)}T`;
    }
    return `${sign}${symbol}${trillions.toFixed(2)}T`;
}

function _formatCompactBillions(absolute, sign, symbol, isCJKCurrency) {
    const billions = absolute / 1_000_000_000;
    if (isCJKCurrency) {
        if (billions >= 100) {
            return `${sign}${symbol}${billions.toFixed(0)}B`;
        }
        if (billions >= 10) {
            return `${sign}${symbol}${billions.toFixed(1)}B`;
        }
        return `${sign}${symbol}${billions.toFixed(2)}B`;
    }

    // Non-CJK: check if it's effectively an integer
    const rounded = Math.round(billions);
    if (Math.abs(billions - rounded) < 0.1) {
        return `${sign}${symbol}${rounded}B`;
    }

    if (billions >= 100) {
        return `${sign}${symbol}${billions.toFixed(0)}B`;
    }
    if (billions >= 10) {
        return `${sign}${symbol}${billions.toFixed(1)}B`;
    }
    return `${sign}${symbol}${billions.toFixed(2)}B`;
}

function _formatCompactMillions(absolute, sign, symbol, isCJKCurrency) {
    const millions = absolute / 1_000_000;
    const rounded = Math.round(millions);

    if (isCJKCurrency) {
        if (Math.abs(millions - rounded) > 0.1) {
            return `${sign}${symbol}${millions.toFixed(1)}M`;
        }
        return `${sign}${symbol}${rounded}M`;
    }

    // Non-CJK: check if it's effectively an integer
    if (Math.abs(millions - rounded) < 0.1) {
        return `${sign}${symbol}${rounded}M`;
    }

    if (millions >= 100) {
        return `${sign}${symbol}${millions.toFixed(0)}M`;
    }
    if (millions >= 10) {
        return `${sign}${symbol}${millions.toFixed(1)}M`;
    }
    return `${sign}${symbol}${millions.toFixed(2)}M`;
}

function _formatCompactThousands(absolute, sign, symbol, isCJKCurrency) {
    const thousands = absolute / 1_000;
    const rounded = Math.round(thousands);

    if (isCJKCurrency) {
        if (Math.abs(thousands - rounded) > 0.1) {
            return `${sign}${symbol}${thousands.toFixed(1)}k`;
        }
        return `${sign}${symbol}${Math.max(1, rounded)}k`;
    }

    // Non-CJK: check if it's effectively an integer
    if (Math.abs(thousands - rounded) < 0.05) {
        // tighter tolerance for k
        return `${sign}${symbol}${rounded}k`;
    }

    if (thousands >= 100) {
        return `${sign}${symbol}${thousands.toFixed(0)}k`;
    }
    if (thousands >= 10) {
        return `${sign}${symbol}${thousands.toFixed(1)}k`;
    }
    return `${sign}${symbol}${thousands.toFixed(2)}k`;
}

function _formatCompactSmallUnits(absolute, sign, symbol, isCJKCurrency) {
    if (absolute >= 1) {
        if (isCJKCurrency) {
            return `${sign}${symbol}${Math.round(absolute)}`;
        }
        // Check for integer
        if (Math.abs(absolute - Math.round(absolute)) < 0.01) {
            return `${sign}${symbol}${Math.round(absolute)}`;
        }
        return `${sign}${symbol}${absolute.toFixed(0)}`;
    }

    if (isCJKCurrency) {
        return `${sign}${symbol}${Math.round(absolute)}`;
    }

    if (absolute < 0.005) {
        return `${sign}${symbol}0`;
    }

    return `${sign}${symbol}${absolute.toFixed(2)}`;
}

function _getResolvedCurrencyInfo(currencyParam) {
    const defaultCurrency = 'USD';
    let resolved = defaultCurrency;

    if (currencyParam) {
        resolved = currencyParam;
    } else {
        const selected = getSelectedCurrency();
        if (selected) {
            resolved = selected;
        }
    }

    resolved = resolved.toUpperCase();
    const isCJK = resolved === 'CNY' || resolved === 'JPY' || resolved === 'KRW';

    return {
        currency: resolved,
        symbol: getSymbolForCurrency(resolved),
        isCJK: isCJK,
    };
}

export function formatCurrencyCompact(value, { currency } = {}) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const absolute = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';

    const info = _getResolvedCurrencyInfo(currency);
    const symbol = info.symbol;
    const isCJKCurrency = info.isCJK;

    if (absolute >= 1_000_000_000_000) {
        return _formatCompactTrillions(absolute, sign, symbol, isCJKCurrency);
    }

    if (absolute >= 1_000_000_000) {
        return _formatCompactBillions(absolute, sign, symbol, isCJKCurrency);
    }

    if (absolute >= 1_000_000) {
        return _formatCompactMillions(absolute, sign, symbol, isCJKCurrency);
    }

    if (absolute >= 1_000) {
        return _formatCompactThousands(absolute, sign, symbol, isCJKCurrency);
    }

    return _formatCompactSmallUnits(absolute, sign, symbol, isCJKCurrency);
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
