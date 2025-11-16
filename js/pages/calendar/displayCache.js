import { formatNumber } from '@utils/formatting.js';

function computeEntryDisplay(entry, currency, rates, currencySymbols) {
    if (!entry || typeof entry !== 'object') {
        return { changeText: '', totalText: '', showDetails: false };
    }

    const dailyChange = Number(entry.dailyChange);
    if (!Number.isFinite(dailyChange) || dailyChange === 0) {
        return { changeText: '', totalText: '', showDetails: false };
    }

    const changeText = formatNumber(
        dailyChange,
        currencySymbols,
        true,
        currency,
        rates,
        entry,
        'dailyChange'
    );
    const totalText = formatNumber(
        entry.total,
        currencySymbols,
        false,
        currency,
        rates,
        entry,
        'total'
    );
    return { changeText, totalText, showDetails: true };
}

export function ensureEntryDisplay(entry, currency, rates, currencySymbols) {
    if (!entry) {
        return { changeText: '', totalText: '', showDetails: false };
    }
    if (!entry.__displayCache) {
        entry.__displayCache = {};
    }
    if (!entry.__displayCache[currency]) {
        entry.__displayCache[currency] = computeEntryDisplay(
            entry,
            currency,
            rates,
            currencySymbols
        );
    }
    return entry.__displayCache[currency];
}

export function precomputeDisplayCaches(entries, currencySymbols, rates) {
    if (!entries) {
        return;
    }
    const currencies = Object.keys(currencySymbols || { USD: '$' });
    if (!currencies.length) {
        return;
    }
    const hydrate = (entry) => {
        if (!entry) {
            return;
        }
        entry.__displayCache = entry.__displayCache || {};
        currencies.forEach((currency) => {
            entry.__displayCache[currency] = computeEntryDisplay(
                entry,
                currency,
                rates,
                currencySymbols
            );
        });
    };

    if (entries instanceof Map) {
        entries.forEach((entry) => hydrate(entry));
    } else if (Array.isArray(entries)) {
        entries.forEach((entry) => hydrate(entry));
    }
}
