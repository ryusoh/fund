import { transactionState, setFilteredTransactions } from './state.js';
import { computeRunningTotals } from './calculations.js';
import { formatDate, formatCurrency } from './utils.js';
import { adjustMobilePanels } from './layout.js';

function parseCommandPalette(value) {
    const tokens = value.split(/\s+/).filter(Boolean);
    const textTokens = [];
    const commands = { type: null, security: null, min: null, max: null };

    tokens.forEach((token) => {
        const [key, ...valParts] = token.split(':');
        const val = valParts.join(':');
        if (!val) {
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
            default:
                textTokens.push(token);
                break;
        }
    });

    return { text: textTokens.join(' '), commands };
}

function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionBody');
    if (!tbody) {
        return;
    }
    tbody.innerHTML = '';
    const runningTotalsMap = computeRunningTotals(transactions, transactionState.splitHistory);

    transactions.forEach((transaction) => {
        const row = document.createElement('tr');
        const orderTypeClass = transaction.orderType.toLowerCase();
        const runningTotals = runningTotalsMap.get(transaction.transactionId) || {};
        row.innerHTML = `
            <td class="date">${formatDate(transaction.tradeDate)}</td>
            <td class="${orderTypeClass}">${transaction.orderType}</td>
            <td>${transaction.security}</td>
            <td>${parseFloat(transaction.quantity).toLocaleString()}</td>
            <td>$${parseFloat(transaction.price).toFixed(2)}</td>
            <td class="amount">${formatCurrency(transaction.netAmount)}</td>
            <td class="amount">${formatCurrency(runningTotals.portfolio)}</td>
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
    let filtered = [...transactionState.allTransactions];

    if (searchTerm) {
        const { text, commands } = parseCommandPalette(searchTerm);
        const term = text.toLowerCase();

        if (commands.security) {
            filtered = filtered.filter(
                (t) => t.security.toLowerCase() === commands.security.toLowerCase()
            );
        }
        if (commands.type) {
            filtered = filtered.filter(
                (t) => t.orderType.toLowerCase() === commands.type.toLowerCase()
            );
        }
        if (commands.min !== null && !Number.isNaN(commands.min)) {
            filtered = filtered.filter(
                (t) => Math.abs(parseFloat(t.netAmount) || 0) >= commands.min
            );
        }
        if (commands.max !== null && !Number.isNaN(commands.max)) {
            filtered = filtered.filter(
                (t) => Math.abs(parseFloat(t.netAmount) || 0) <= commands.max
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
    }

    filtered.sort((a, b) => {
        let valA;
        let valB;
        switch (transactionState.sortState.column) {
            case 'security':
                valA = a.security;
                valB = b.security;
                break;
            case 'netAmount':
                valA = Math.abs(parseFloat(a.netAmount) || 0);
                valB = Math.abs(parseFloat(b.netAmount) || 0);
                break;
            default:
                valA = new Date(a.tradeDate);
                valB = new Date(b.tradeDate);
                break;
        }
        if (valA < valB) {
            return transactionState.sortState.order === 'asc' ? -1 : 1;
        }
        if (valA > valB) {
            return transactionState.sortState.order === 'asc' ? 1 : -1;
        }
        return new Date(b.tradeDate) - new Date(a.tradeDate);
    });

    displayTransactions(filtered);
    setFilteredTransactions(filtered);
    if (typeof filterChangeListener === 'function') {
        filterChangeListener(filtered);
    }
    const filterResultEvent = new CustomEvent('transactionFilterResult', {
        detail: {
            count: filtered.length,
            searchTerm,
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
