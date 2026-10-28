import { convertValueToCurrency } from '../utils.js';
import { normalizeDateOnly } from '@utils/date.js';
import { normalizeTickerToken, matchesAssetClass } from './parser.js';

export function applyDateRangeFilter(transactions, rangeStart, rangeEnd) {
    if (rangeStart === null && rangeEnd === null) {
        return transactions;
    }
    return transactions.filter((transaction) => {
        const normalized = normalizeDateOnly(transaction.tradeDate);
        const tradeTime =
            normalized instanceof Date ? normalized.getTime() : Date.parse(transaction.tradeDate);
        if (!Number.isFinite(tradeTime)) {
            return false;
        }
        if (rangeStart !== null && tradeTime < rangeStart) {
            return false;
        }
        if (rangeEnd !== null && tradeTime > rangeEnd) {
            return false;
        }
        return true;
    });
}

export function applySecurityFilter(transactions, commands, multiTickerSet) {
    const upcaseSecurity = commands.security
        ? normalizeTickerToken(commands.security) || commands.security.toUpperCase()
        : null;

    if (!upcaseSecurity && !multiTickerSet) {
        return transactions;
    }

    return transactions.filter((t) => {
        const normalizedParams = normalizeTickerToken(t.security);
        const ticker = normalizedParams || t.security.toUpperCase();

        if (upcaseSecurity && ticker === upcaseSecurity) {
            return true;
        }
        if (multiTickerSet && multiTickerSet.has(ticker)) {
            return true;
        }
        return false;
    });
}

export function applyValueFilters(transactions, commands, currentCurrency) {
    let filtered = transactions;

    if (commands.type) {
        filtered = filtered.filter(
            (t) => t.orderType.toLowerCase() === commands.type.toLowerCase()
        );
    }
    if (commands.min !== null && !Number.isNaN(commands.min)) {
        filtered = filtered.filter(
            (t) =>
                Math.abs(convertValueToCurrency(t.netAmount, t.tradeDate, currentCurrency)) >=
                commands.min
        );
    }
    if (commands.max !== null && !Number.isNaN(commands.max)) {
        filtered = filtered.filter(
            (t) =>
                Math.abs(convertValueToCurrency(t.netAmount, t.tradeDate, currentCurrency)) <=
                commands.max
        );
    }
    if (commands.assetClass) {
        filtered = filtered.filter((t) => matchesAssetClass(t.security, commands.assetClass));
    }
    return filtered;
}

function matchesText(transaction, term) {
    return (
        transaction.security.toLowerCase().includes(term) ||
        transaction.orderType.toLowerCase().includes(term) ||
        transaction.tradeDate.includes(term)
    );
}

export function applyTextFilter(transactions, term, excludedTerms = []) {
    if (!term && excludedTerms.length === 0) {
        return transactions;
    }

    return transactions.filter((transaction) => {
        if (term && !matchesText(transaction, term)) {
            return false;
        }
        return !excludedTerms.some((excludedTerm) => matchesText(transaction, excludedTerm));
    });
}
