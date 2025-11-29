import {
    transactionState,
    setFilteredTransactions,
    setActiveFilterTerm,
    getActiveFilterTerm,
    setCompositionFilterTickers,
    setCompositionAssetClassFilter,
} from './state.js';
import { computeRunningTotals } from './calculations.js';
import { formatDate, formatCurrency, convertValueToCurrency } from './utils.js';
import { normalizeDateOnly } from '@utils/date.js';
import { adjustMobilePanels } from './layout.js';
import { getHoldingAssetClass } from '@js/config.js';

function isTransactionTableVisible() {
    if (typeof document === 'undefined') {
        return true;
    }
    const tableContainer = document.querySelector('.table-responsive-container');
    return Boolean(tableContainer && !tableContainer.classList.contains('is-hidden'));
}

function parseCommandPalette(value) {
    const tokens = value.split(/\s+/).filter(Boolean);
    const textTokens = [];
    const commands = {
        type: null,
        security: null,
        min: null,
        max: null,
        assetClass: null,
        tickers: [],
    };

    tokens.forEach((token) => {
        const [key, ...valParts] = token.split(':');
        const val = valParts.join(':');
        if (!val) {
            const normalizedKey = key.toLowerCase();
            if (normalizedKey === 'etf' || normalizedKey === 'stock') {
                commands.assetClass = normalizedKey;
                return;
            }
            const normalizedTicker = normalizeTickerToken(key);
            if (normalizedTicker) {
                commands.tickers.push(normalizedTicker);
                return;
            }
            textTokens.push(key);
            return;
        }
        switch (key.toLowerCase()) {
            case 'type':
                commands.type =
                    val.toLowerCase() === 'buy' || val.toLowerCase() === 'sell' ? val : null;
                break;
            case 'security':
            case 's':
                commands.security = val.toUpperCase();
                break;
            case 'min':
                commands.min = parseFloat(val);
                break;
            case 'max':
                commands.max = parseFloat(val);
                break;
            case 'asset':
            case 'class':
                commands.assetClass = val.toLowerCase();
                break;
            default: {
                const normalizedTicker = normalizeTickerToken(token);
                if (normalizedTicker) {
                    commands.tickers.push(normalizedTicker);
                } else {
                    textTokens.push(token);
                }
                break;
            }
        }
    });

    return { text: textTokens.join(' '), commands };
}

const TICKER_ALIAS_MAP = {
    BRK: 'BRKB',
    'BRK-B': 'BRKB',
    BRKB: 'BRKB',
};

function normalizeTickerToken(token) {
    if (typeof token !== 'string') {
        return null;
    }
    const cleaned = token.replace(/[^0-9a-zA-Z-]/g, '').toUpperCase();
    if (!cleaned || !/[A-Z]/.test(cleaned)) {
        return null;
    }
    if (TICKER_ALIAS_MAP[cleaned]) {
        return TICKER_ALIAS_MAP[cleaned];
    }
    return cleaned;
}

function deriveCompositionTickerFilters(textPart, commands) {
    const results = [];
    const seen = new Set();
    const addTicker = (ticker) => {
        const normalized = normalizeTickerToken(ticker);
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            results.push(normalized);
        }
    };
    if (commands?.security) {
        addTicker(commands.security);
    }
    if (typeof textPart === 'string' && textPart.trim()) {
        textPart.split(/\s+/).filter(Boolean).forEach(addTicker);
    }
    return results;
}

function matchesAssetClass(security, desiredClass) {
    if (!desiredClass || typeof security !== 'string') {
        return true;
    }
    const normalized = desiredClass.toLowerCase();
    const holdingClass = getHoldingAssetClass(security);
    if (normalized === 'etf') {
        return holdingClass === 'etf';
    }
    if (normalized === 'stock') {
        return holdingClass !== 'etf';
    }
    return true;
}

function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionBody');
    if (!tbody) {
        return;
    }
    tbody.innerHTML = '';
    const runningTotalsMap = computeRunningTotals(transactions, transactionState.splitHistory);

    const currentCurrency = transactionState.selectedCurrency;

    transactions.forEach((transaction) => {
        const row = document.createElement('tr');
        const orderTypeClass = transaction.orderType.toLowerCase();
        const runningTotals = runningTotalsMap.get(transaction.transactionId) || {};
        const tradeDate = transaction.tradeDate;
        const convertedPrice = convertValueToCurrency(
            transaction.price,
            tradeDate,
            currentCurrency
        );
        const convertedNetAmount = convertValueToCurrency(
            transaction.netAmount,
            tradeDate,
            currentCurrency
        );
        const convertedPortfolio = convertValueToCurrency(
            runningTotals.portfolio,
            tradeDate,
            currentCurrency
        );
        // Format the currency values with two decimal places for better precision
        const formattedNetAmount = formatCurrency(convertedNetAmount, {
            currency: currentCurrency,
        });
        const formattedPortfolio = formatCurrency(convertedPortfolio, {
            currency: currentCurrency,
        });

        row.innerHTML = `
            <td class="date">${formatDate(transaction.tradeDate)}</td>
            <td class="${orderTypeClass}">${transaction.orderType}</td>
            <td>${transaction.security}</td>
            <td>${parseFloat(transaction.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${formatCurrency(convertedPrice)}</td>
            <td class="amount">${formattedNetAmount}</td>
            <td class="amount">${formattedPortfolio}</td>
        `;
        tbody.appendChild(row);
    });

    requestAnimationFrame(adjustMobilePanels);
}

function updateSortIndicators() {
    document.querySelectorAll('th.sortable').forEach((th) => th.removeAttribute('data-sort'));
    const activeSorter = document.getElementById(`header-${transactionState.sortState.column}`);
    if (activeSorter) {
        activeSorter.setAttribute('data-sort', transactionState.sortState.order);
    }
}

function closeAllFilterDropdowns() {
    document.querySelectorAll('.filter-dropdown').forEach((d) => d.remove());
    document
        .querySelectorAll('.table-responsive-container thead th.filter-active')
        .forEach((th) => th.classList.remove('filter-active'));
}

function filterAndSort(searchTerm = '') {
    const normalizedSearchTerm =
        typeof searchTerm === 'string' ? searchTerm.trim() : getActiveFilterTerm();
    setActiveFilterTerm(normalizedSearchTerm);

    let filtered = [...transactionState.allTransactions];
    const currentCurrency = transactionState.selectedCurrency;
    const range = transactionState.chartDateRange || { from: null, to: null };
    const rangeStart = range.from ? Date.parse(range.from) : null;
    const rangeEnd = range.to ? Date.parse(range.to) : null;
    const shouldApplyDateRange = isTransactionTableVisible();
    if (shouldApplyDateRange && (rangeStart !== null || rangeEnd !== null)) {
        filtered = filtered.filter((transaction) => {
            const normalized = normalizeDateOnly(transaction.tradeDate);
            const tradeTime = Date.parse(normalized || transaction.tradeDate);
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

    let parsedCommands = { assetClass: null };

    if (normalizedSearchTerm) {
        const parsed = parseCommandPalette(normalizedSearchTerm);
        parsedCommands = parsed.commands;
        const compositionFilters = parsed.commands.tickers.length
            ? parsed.commands.tickers
            : deriveCompositionTickerFilters(parsed.text, parsed.commands);
        setCompositionFilterTickers(compositionFilters);
        const term = parsed.text.toLowerCase();

        const upcaseSecurity = parsed.commands.security
            ? parsed.commands.security.toUpperCase()
            : null;
        const multiTickerSet =
            parsed.commands.tickers.length > 0 ? new Set(parsed.commands.tickers) : null;

        if (upcaseSecurity || multiTickerSet) {
            filtered = filtered.filter((t) => {
                const ticker = t.security.toUpperCase();
                if (upcaseSecurity && ticker === upcaseSecurity) {
                    return true;
                }
                if (multiTickerSet && multiTickerSet.has(ticker)) {
                    return true;
                }
                return false;
            });
        }
        if (parsed.commands.type) {
            filtered = filtered.filter(
                (t) => t.orderType.toLowerCase() === parsed.commands.type.toLowerCase()
            );
        }
        if (parsed.commands.min !== null && !Number.isNaN(parsed.commands.min)) {
            filtered = filtered.filter(
                (t) =>
                    Math.abs(convertValueToCurrency(t.netAmount, t.tradeDate, currentCurrency)) >=
                    parsed.commands.min
            );
        }
        if (parsed.commands.max !== null && !Number.isNaN(parsed.commands.max)) {
            filtered = filtered.filter(
                (t) =>
                    Math.abs(convertValueToCurrency(t.netAmount, t.tradeDate, currentCurrency)) <=
                    parsed.commands.max
            );
        }
        if (parsed.commands.assetClass) {
            filtered = filtered.filter((t) =>
                matchesAssetClass(t.security, parsed.commands.assetClass)
            );
        }
        if (term) {
            filtered = filtered.filter(
                (t) =>
                    t.security.toLowerCase().includes(term) ||
                    t.orderType.toLowerCase().includes(term) ||
                    t.tradeDate.includes(term)
            );
        }
    } else {
        setCompositionFilterTickers([]);
        setCompositionAssetClassFilter(null);
    }

    setCompositionAssetClassFilter(parsedCommands.assetClass || null);

    const runningTotalsMap = computeRunningTotals(filtered, transactionState.splitHistory);
    const compareValues = (valueA, valueB, order) => {
        if (valueA < valueB) {
            return order === 'asc' ? -1 : 1;
        }
        if (valueA > valueB) {
            return order === 'asc' ? 1 : -1;
        }
        return 0;
    };

    filtered.sort((a, b) => {
        const { column, order } = transactionState.sortState;
        switch (column) {
            case 'security': {
                const result = compareValues(
                    a.security.toLowerCase(),
                    b.security.toLowerCase(),
                    order
                );
                if (result !== 0) {
                    return result;
                }
                return compareValues(
                    new Date(a.tradeDate).getTime(),
                    new Date(b.tradeDate).getTime(),
                    'desc'
                );
            }
            case 'netAmount': {
                const amountA = Math.abs(
                    convertValueToCurrency(a.netAmount, a.tradeDate, currentCurrency)
                );
                const amountB = Math.abs(
                    convertValueToCurrency(b.netAmount, b.tradeDate, currentCurrency)
                );
                const result = compareValues(amountA, amountB, order);
                if (result !== 0) {
                    return result;
                }
                return compareValues(
                    new Date(a.tradeDate).getTime(),
                    new Date(b.tradeDate).getTime(),
                    'desc'
                );
            }
            case 'tradeDate':
            default: {
                const dateA = new Date(a.tradeDate).getTime();
                const dateB = new Date(b.tradeDate).getTime();
                const dateComparison = compareValues(dateA, dateB, order);
                if (dateComparison !== 0) {
                    return dateComparison;
                }
                const totalA =
                    runningTotalsMap.get(a.transactionId)?.portfolio ??
                    runningTotalsMap.get(a.transactionId)?.amount ??
                    0;
                const totalB =
                    runningTotalsMap.get(b.transactionId)?.portfolio ??
                    runningTotalsMap.get(b.transactionId)?.amount ??
                    0;
                const convertedTotalA = convertValueToCurrency(
                    totalA,
                    a.tradeDate,
                    currentCurrency
                );
                const convertedTotalB = convertValueToCurrency(
                    totalB,
                    b.tradeDate,
                    currentCurrency
                );
                const totalComparison = compareValues(convertedTotalA, convertedTotalB, 'desc');
                if (totalComparison !== 0) {
                    return totalComparison;
                }
                return compareValues(a.transactionId, b.transactionId, 'desc');
            }
        }
    });

    displayTransactions(filtered);
    setFilteredTransactions(filtered);
    if (typeof filterChangeListener === 'function') {
        filterChangeListener(filtered);
    }
    const filterResultEvent = new CustomEvent('transactionFilterResult', {
        detail: {
            count: filtered.length,
            searchTerm: normalizedSearchTerm,
        },
    });
    document.dispatchEvent(filterResultEvent);
    updateSortIndicators();
}

function handleSort(column) {
    const sortState = transactionState.sortState;
    sortState.order = sortState.column === column && sortState.order === 'asc' ? 'desc' : 'asc';
    sortState.column = column;
    const terminalInput = document.getElementById('terminalInput');
    const searchTerm = terminalInput ? terminalInput.value : '';
    filterAndSort(searchTerm);
}

function createFilterDropdown(column) {
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown';
    const options =
        column === 'orderType'
            ? ['All', 'Buy', 'Sell']
            : ['All', ...new Set(transactionState.allTransactions.map((t) => t.security))].sort();

    options.forEach((option) => {
        const div = document.createElement('div');
        div.textContent = option;
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            const command =
                option === 'All' ? '' : `${column === 'orderType' ? 'type' : 'security'}:${option}`;
            const terminalInput = document.getElementById('terminalInput');
            if (terminalInput) {
                terminalInput.value = command;
            }
            filterAndSort(command);
            closeAllFilterDropdowns();
        });
        dropdown.appendChild(div);
    });

    return dropdown;
}

function handleFilter(column, target) {
    closeAllFilterDropdowns();
    target.classList.add('filter-active');
    const dropdown = createFilterDropdown(column);
    target.appendChild(dropdown);
    dropdown.style.display = 'block';

    setTimeout(() => {
        document.addEventListener('click', function closeListener(e) {
            if (!target.contains(e.target)) {
                dropdown.remove();
                target.classList.remove('filter-active');
                document.removeEventListener('click', closeListener);
            }
        });
    }, 0);
}

function setupTableControls() {
    const tradeDateHeader = document.getElementById('header-tradeDate');
    if (tradeDateHeader) {
        tradeDateHeader.addEventListener('click', () => handleSort('tradeDate'));
    }
    const securityHeader = document.getElementById('header-security');
    if (securityHeader) {
        securityHeader.addEventListener('click', (e) => {
            if (e.target.closest('.filter-indicator')) {
                handleFilter('security', e.currentTarget);
            } else {
                handleSort('security');
            }
        });
    }
    const netAmountHeader = document.getElementById('header-netAmount');
    if (netAmountHeader) {
        netAmountHeader.addEventListener('click', () => handleSort('netAmount'));
    }
    const orderTypeHeader = document.getElementById('header-orderType');
    if (orderTypeHeader) {
        orderTypeHeader.addEventListener('click', (e) =>
            handleFilter('orderType', e.currentTarget)
        );
    }
}

let filterChangeListener = null;

export function initTable({ onFilterChange } = {}) {
    filterChangeListener = typeof onFilterChange === 'function' ? onFilterChange : null;
    setupTableControls();
    return {
        filterAndSort,
        closeAllFilterDropdowns,
    };
}
