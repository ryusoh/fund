import { convertValueToCurrency } from '../utils.js';

function compareValues(valueA, valueB, order) {
    if (valueA < valueB) {
        return order === 'asc' ? -1 : 1;
    }
    if (valueA > valueB) {
        return order === 'asc' ? 1 : -1;
    }
    return 0;
}

function compareSecurity(a, b, order) {
    const result = compareValues(a.security.toLowerCase(), b.security.toLowerCase(), order);
    if (result !== 0) {
        return result;
    }
    return compareValues(a.tradeDate, b.tradeDate, 'desc');
}

function compareQuantity(a, b, order) {
    const result = compareValues(parseFloat(a.quantity), parseFloat(b.quantity), order);
    if (result !== 0) {
        return result;
    }
    return compareValues(a.tradeDate, b.tradeDate, 'desc');
}

function comparePrice(a, b, order, currentCurrency) {
    const priceA = convertValueToCurrency(a.price, a.tradeDate, currentCurrency);
    const priceB = convertValueToCurrency(b.price, b.tradeDate, currentCurrency);
    const result = compareValues(priceA, priceB, order);
    if (result !== 0) {
        return result;
    }
    return compareValues(a.tradeDate, b.tradeDate, 'desc');
}

function compareNetAmount(a, b, order, currentCurrency) {
    const amountA = Math.abs(convertValueToCurrency(a.netAmount, a.tradeDate, currentCurrency));
    const amountB = Math.abs(convertValueToCurrency(b.netAmount, b.tradeDate, currentCurrency));
    const result = compareValues(amountA, amountB, order);
    if (result !== 0) {
        return result;
    }
    return compareValues(a.tradeDate, b.tradeDate, 'desc');
}

function compareTradeDate(a, b, order) {
    const dateComparison = compareValues(Date.parse(a.tradeDate), Date.parse(b.tradeDate), order);
    if (dateComparison !== 0) {
        return dateComparison;
    }
    const idOrder = order === 'asc' ? 'asc' : 'desc';
    return compareValues(a.transactionId, b.transactionId, idOrder);
}

export function sortTransactions(transactions, sortState, currentCurrency) {
    transactions.sort((a, b) => {
        const { column, order } = sortState;
        switch (column) {
            case 'security':
                return compareSecurity(a, b, order);
            case 'quantity':
                return compareQuantity(a, b, order);
            case 'price':
                return comparePrice(a, b, order, currentCurrency);
            case 'netAmount':
                return compareNetAmount(a, b, order, currentCurrency);
            case 'tradeDate':
            default:
                return compareTradeDate(a, b, order);
        }
    });
}
