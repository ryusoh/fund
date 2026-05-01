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
import { adjustMobilePanels } from './layout.js';
import {
    parseCommandPalette,
    deriveCompositionTickerFilters,
    normalizeTickerToken,
    matchesAssetClass,
} from './table/parser.js';
import {
    applyDateRangeFilter,
    applySecurityFilter,
    applyValueFilters,
    applyTextFilter,
} from './table/filter.js';
import { sortTransactions } from './table/sort.js';

function isTransactionTableVisible() {
    if (typeof document === 'undefined') {
        return true;
    }
    const tableContainer = document.querySelector('.table-responsive-container');
    return Boolean(tableContainer && !tableContainer.classList.contains('is-hidden'));
}

function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionBody');
    if (!tbody) {
        return;
    }
    tbody.replaceChildren();
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

        const tdDate = document.createElement('td');
        tdDate.className = 'date';
        tdDate.textContent = formatDate(transaction.tradeDate);
        row.appendChild(tdDate);

        const tdOrderType = document.createElement('td');
        tdOrderType.className = orderTypeClass;
        tdOrderType.textContent = transaction.orderType;
        row.appendChild(tdOrderType);

        const tdSecurity = document.createElement('td');
        tdSecurity.textContent = transaction.security;
        row.appendChild(tdSecurity);

        const tdQuantity = document.createElement('td');
        tdQuantity.textContent = parseFloat(transaction.quantity).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        row.appendChild(tdQuantity);

        const tdPrice = document.createElement('td');
        tdPrice.textContent = formatCurrency(convertedPrice);
        row.appendChild(tdPrice);

        const tdAmount = document.createElement('td');
        tdAmount.className = 'amount';
        tdAmount.textContent = formattedNetAmount;
        row.appendChild(tdAmount);

        const tdPortfolio = document.createElement('td');
        tdPortfolio.className = 'amount';
        tdPortfolio.textContent = formattedPortfolio;
        row.appendChild(tdPortfolio);

        tbody.appendChild(row);
    });

    requestAnimationFrame(adjustMobilePanels);
}

function updateSortIndicators() {
    document.querySelectorAll('th.sortable').forEach((th) => {
        th.removeAttribute('data-sort');
        th.setAttribute('aria-sort', 'none');
    });
    const activeSorter = document.getElementById(`header-${transactionState.sortState.column}`);
    if (activeSorter) {
        activeSorter.setAttribute('data-sort', transactionState.sortState.order);
        activeSorter.setAttribute(
            'aria-sort',
            transactionState.sortState.order === 'asc' ? 'ascending' : 'descending'
        );
    }
}

function closeAllFilterDropdowns() {
    document.querySelectorAll('.filter-dropdown').forEach((d) => d.remove());
    document
        .querySelectorAll('.table-responsive-container thead th.filter-active')
        .forEach((th) => th.classList.remove('filter-active'));
}

function applyFilters(transactions, parsedCommands, term, currentCurrency) {
    let filtered = transactions;
    const multiTickerSet =
        parsedCommands.tickers.length > 0 ? new Set(parsedCommands.tickers) : null;

    // When both tickers and assetClass are specified, use OR logic:
    // include transactions matching any ticker OR matching the asset class
    if (multiTickerSet && parsedCommands.assetClass) {
        filtered = filtered.filter((t) => {
            const ticker = normalizeTickerToken(t.security) || t.security.toUpperCase();
            if (multiTickerSet.has(ticker)) {
                return true;
            }
            return matchesAssetClass(t.security, parsedCommands.assetClass);
        });
        // Apply remaining value filters without assetClass (already handled above)
        const commandsWithoutClass = { ...parsedCommands, assetClass: null };
        filtered = applyValueFilters(filtered, commandsWithoutClass, currentCurrency);
    } else {
        filtered = applySecurityFilter(filtered, parsedCommands, multiTickerSet);
        filtered = applyValueFilters(filtered, parsedCommands, currentCurrency);
    }
    filtered = applyTextFilter(filtered, term);

    return filtered;
}

function processSearchTerm(normalizedSearchTerm, transactions, currentCurrency) {
    if (!normalizedSearchTerm) {
        setCompositionFilterTickers([]);
        setCompositionAssetClassFilter(null);
        return { filtered: transactions, assetClass: null };
    }

    const parsed = parseCommandPalette(normalizedSearchTerm);
    const parsedCommands = parsed.commands;
    const compositionFilters = parsedCommands.tickers.length
        ? parsedCommands.tickers
        : deriveCompositionTickerFilters(parsed.text, parsedCommands);

    setCompositionFilterTickers(compositionFilters);
    const filtered = applyFilters(
        transactions,
        parsedCommands,
        parsed.text.toLowerCase(),
        currentCurrency
    );

    return { filtered, assetClass: parsedCommands.assetClass || null };
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

    if (isTransactionTableVisible()) {
        filtered = applyDateRangeFilter(filtered, rangeStart, rangeEnd);
    }

    const searchResult = processSearchTerm(normalizedSearchTerm, filtered, currentCurrency);
    filtered = searchResult.filtered;
    setCompositionAssetClassFilter(searchResult.assetClass);

    sortTransactions(filtered, transactionState.sortState, currentCurrency);

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
    const values = new Set();
    const sortedOptions = [];

    transactionState.allTransactions.forEach((t) => {
        if (t[column]) {
            values.add(t[column]);
        }
    });
    sortedOptions.push('All');
    sortedOptions.push(...Array.from(values).sort());

    sortedOptions.forEach((option) => {
        const div = document.createElement('div');
        div.className = 'filter-option';
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
    const quantityHeader = document.getElementById('header-quantity');
    if (quantityHeader) {
        quantityHeader.addEventListener('click', () => handleSort('quantity'));
    }
    const priceHeader = document.getElementById('header-price');
    if (priceHeader) {
        priceHeader.addEventListener('click', () => handleSort('price'));
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
