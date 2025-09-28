import { logger } from '../../utils/logger.js';

let allTransactions = [];
let splitHistory = [];
let runningAmountSeries = [];
const sortState = { column: 'tradeDate', order: 'asc' };
const commandHistory = [];
let historyIndex = -1;

// --- UTILITY & FORMATTING ---

function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatCurrency(value) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const absolute = Math.abs(amount);
    const formatted = absolute.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const sign = amount < 0 ? '-' : '';
    return `${sign}$${formatted}`;
}

function formatCurrencyCompact(value) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    const absolute = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';

    if (absolute >= 1000000) {
        const millions = absolute / 1000000;
        if (millions >= 1 && millions < 10) {
            return `${sign}$${millions.toFixed(1)}M`;
        }
        return `${sign}$${Math.round(millions)}M`;
    }

    if (absolute >= 1000) {
        const thousands = absolute / 1000;
        if (thousands >= 100) {
            return `${sign}$${Math.round(thousands)}k`;
        }
        if (thousands >= 10) {
            return `${sign}$${thousands.toFixed(0)}k`;
        }
        return `${sign}$${thousands.toFixed(1)}k`;
    }

    return `${sign}$${absolute.toFixed(0)}`;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && i < line.length - 1 && line[i + 1] === '"') {
            current += '"';
            i++;
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

// --- DATA LOADING & PARSING ---

async function loadSplitHistory() {
    try {
        const response = await fetch('../data/split_history.csv');
        if (!response.ok) {
            logger.warn('Split history file not found, continuing without split adjustments');
            return [];
        }
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        const splits = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length >= 4) {
                splits.push({
                    symbol: values[0],
                    splitDate: values[1],
                    splitRatio: values[2],
                    splitMultiplier: parseFloat(values[3]) || 1.0,
                });
            }
        }
        return splits;
    } catch (error) {
        logger.error('Error loading split history:', error);
        return [];
    }
}

function getSplitAdjustment(symbol, transactionDate) {
    return splitHistory
        .filter(
            (split) =>
                split.symbol === symbol && new Date(split.splitDate) > new Date(transactionDate)
        )
        .reduce((cumulative, split) => cumulative * split.splitMultiplier, 1.0);
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const transactions = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length >= 5) {
            const quantity = parseFloat(values[3]) || 0;
            const price = parseFloat(values[4]) || 0;
            transactions.push({
                tradeDate: values[0],
                orderType: values[1],
                security: values[2],
                quantity: values[3],
                price: values[4],
                netAmount: (
                    quantity *
                    price *
                    (values[1].toLowerCase() === 'sell' ? -1 : 1)
                ).toString(),
                transactionId: i - 1,
            });
        }
    }
    return transactions;
}

// --- FIFO CALCULATION LOGIC ---

function applyTransactionFIFO(lots, transaction) {
    const newLots = lots.map((l) => ({ ...l }));
    let realizedGainDelta = 0;

    const quantity = parseFloat(transaction.quantity);
    const price = parseFloat(transaction.price);
    if (!Number.isFinite(quantity) || !Number.isFinite(price) || quantity <= 0) {
        return { lots: newLots, realizedGainDelta: 0 };
    }

    const isBuy = transaction.orderType.toLowerCase() === 'buy';
    const adjustment = getSplitAdjustment(transaction.security, transaction.tradeDate);

    if (isBuy) {
        const adjustedQuantity = quantity * adjustment;
        const adjustedPrice = price / adjustment;
        newLots.push({ qty: adjustedQuantity, price: adjustedPrice });
    } else {
        // Sell
        const adjustedSellQuantity = quantity * adjustment;
        let sellQty = adjustedSellQuantity;
        let costOfSoldShares = 0;

        while (sellQty > 0 && newLots.length > 0) {
            const lot = newLots[0];
            const qtyFromLot = Math.min(sellQty, lot.qty);

            costOfSoldShares += qtyFromLot * lot.price;
            lot.qty -= qtyFromLot;
            sellQty -= qtyFromLot;

            if (lot.qty < 1e-8) {
                newLots.shift();
            }
        }
        const proceeds = quantity * price; // Proceeds are always based on the actual transaction price
        realizedGainDelta = proceeds - costOfSoldShares;
    }

    return { lots: newLots, realizedGainDelta };
}

function computeRunningTotals(transactions) {
    const securityStates = new Map();
    const runningTotalsById = new Map();
    let portfolioRunningCost = 0;

    const chronologicalTransactions = [...transactions].sort(
        (a, b) => new Date(a.tradeDate) - new Date(b.tradeDate) || a.transactionId - b.transactionId
    );

    chronologicalTransactions.forEach((transaction) => {
        const security = transaction.security;
        const currentState = securityStates.get(security) || { lots: [], totalRealizedGain: 0 };
        const oldCostBasis = currentState.lots.reduce((sum, lot) => sum + lot.qty * lot.price, 0);

        const { lots: newLots, realizedGainDelta } = applyTransactionFIFO(
            currentState.lots,
            transaction
        );

        const newCostBasis = newLots.reduce((sum, lot) => sum + lot.qty * lot.price, 0);
        const costBasisDelta = newCostBasis - oldCostBasis;

        portfolioRunningCost += costBasisDelta;

        const newState = {
            lots: newLots,
            totalRealizedGain: currentState.totalRealizedGain + realizedGainDelta,
        };
        securityStates.set(security, newState);

        const totalShares = newState.lots.reduce((sum, lot) => sum + lot.qty, 0);

        runningTotalsById.set(transaction.transactionId, {
            shares: totalShares,
            amount: portfolioRunningCost,
            portfolio: portfolioRunningCost,
        });
    });

    const totalRealizedGain = Array.from(securityStates.values()).reduce(
        (sum, s) => sum + s.totalRealizedGain,
        0
    );
    runningTotalsById.totalRealizedGain = totalRealizedGain;

    return runningTotalsById;
}

function calculateStats(transactions) {
    const runningTotals = computeRunningTotals(transactions);
    const totalBuyAmount = transactions
        .filter((t) => t.orderType.toLowerCase() === 'buy')
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.netAmount) || 0), 0);
    const totalSellAmount = transactions
        .filter((t) => t.orderType.toLowerCase() === 'sell')
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.netAmount) || 0), 0);
    return {
        totalTransactions: transactions.length,
        totalBuys: transactions.filter((t) => t.orderType.toLowerCase() === 'buy').length,
        totalSells: transactions.filter((t) => t.orderType.toLowerCase() === 'sell').length,
        totalBuyAmount,
        totalSellAmount,
        netAmount: totalBuyAmount - totalSellAmount,
        realizedGain: runningTotals.totalRealizedGain || 0,
    };
}

function calculateHoldings(transactions) {
    const securityStates = new Map();
    [...transactions]
        .sort(
            (a, b) =>
                new Date(a.tradeDate) - new Date(b.tradeDate) || a.transactionId - b.transactionId
        )
        .forEach((t) => {
            const currentState = securityStates.get(t.security) || { lots: [] };
            const { lots: newLots } = applyTransactionFIFO(currentState.lots, t);
            securityStates.set(t.security, { lots: newLots });
        });

    const holdings = {};
    for (const [security, data] of securityStates.entries()) {
        const totalShares = data.lots.reduce((sum, lot) => sum + lot.qty, 0);
        const totalCost = data.lots.reduce((sum, lot) => sum + lot.qty * lot.price, 0);
        if (totalShares > 1e-8) {
            holdings[security] = {
                shares: totalShares,
                totalCost: totalCost,
                avgPrice: totalCost / totalShares,
            };
        }
    }
    return holdings;
}

function buildRunningAmountSeries(transactions) {
    const runningTotals = computeRunningTotals(transactions);
    return [...transactions]
        .sort(
            (a, b) =>
                new Date(a.tradeDate) - new Date(b.tradeDate) || a.transactionId - b.transactionId
        )
        .map((t) => {
            const totals = runningTotals.get(t.transactionId);
            return {
                tradeDate: t.tradeDate,
                amount: totals ? totals.portfolio : 0,
                orderType: t.orderType,
                netAmount: parseFloat(t.netAmount) || 0,
            };
        });
}

// --- TERMINAL & COMMANDS ---

function handleTerminalInput(e) {
    const input = e.target;
    switch (e.key) {
        case 'Enter':
            if (input.value.trim()) {
                const command = input.value.trim();
                commandHistory.unshift(command);
                historyIndex = -1;
                processCommand(command);
                input.value = '';
            }
            break;
        case 'ArrowUp':
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                input.value = commandHistory[historyIndex];
            }
            break;
        case 'ArrowDown':
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                input.value = commandHistory[historyIndex];
            } else {
                historyIndex = -1;
                input.value = '';
            }
            break;
    }
}

function processCommand(command) {
    const outputContainer = document.getElementById('terminalOutput');
    const prompt = `<div><span class="prompt-user">lz@fund:~$</span> ${command}</div>`;
    outputContainer.innerHTML += prompt;

    const [cmd] = command.toLowerCase().split(' ');
    let result = '';

    switch (cmd.toLowerCase()) {
        case 'h':
        case 'help':
            result =
                'Available commands:\n  stats              - Display summary statistics.\n  holdings           - Display current holdings.\n  table (t)          - Toggle the transaction table visibility.\n  plot (p)           - Toggle the running cost basis chart.\n  filter             - Show available filter commands.\n  clear              - Clear the terminal screen.\n  help (h)           - Show this help message.\n\nAny other input is treated as a filter for the transaction table.';
            break;
        case 'filter':
            result =
                'Usage: <filter>:<value>\n\nAvailable filters:\n  type     - Filter by order type (buy or sell).\n             Example: type:buy\n  security - Filter by security ticker.\n             Example: security:NVDA\n  min      - Show transactions with a net amount greater than value.\n             Example: min:1000\n  max      - Show transactions with a net amount less than value.\n             Example: max:5000\n\nAny text not part of a command is used for a general text search.';
            break;
        case 'clear':
            outputContainer.innerHTML = '';
            closeAllFilterDropdowns();
            sortState.column = 'tradeDate';
            sortState.order = 'asc';
            const terminalInput = document.getElementById('terminalInput');
            if (terminalInput) {
                terminalInput.value = '';
            }
            filterAndSort('');
            document
                .querySelectorAll('.table-responsive-container, #runningAmountSection')
                .forEach((el) => el.classList.add('is-hidden'));
            break;
        case 'stats':
            result = getStatsText();
            break;
        case 'holdings':
            result = getHoldingsText();
            break;
        case 't':
        case 'table':
            toggleTable();
            result = 'Toggled transaction table visibility.';
            break;
        case 'p':
        case 'plot':
            togglePlot();
            result = 'Toggled plot visibility.';
            break;
        default:
            filterAndSort(command);
            result = `Filtering transactions by: \"${command}\"...`;
            break;
    }

    if (result) {
        const pre = document.createElement('pre');
        pre.textContent = result;
        outputContainer.appendChild(pre);
    }
    outputContainer.scrollTop = outputContainer.scrollHeight;
}

function getStatsText() {
    const stats = calculateStats(allTransactions);
    return `\n-------------------- TRANSACTION STATS ---------------------\n  Total Transactions: ${stats.totalTransactions.toLocaleString()}\n  Buy Orders:         ${stats.totalBuys.toLocaleString()}\n  Sell Orders:        ${stats.totalSells.toLocaleString()}\n  Total Buy Amount:   ${formatCurrency(stats.totalBuyAmount)}\n  Total Sell Amount:  ${formatCurrency(stats.totalSellAmount)}\n  Net Amount:         ${formatCurrency(stats.netAmount)}\n  Realized Gain:      ${formatCurrency(stats.realizedGain)}\n`;
}

function getHoldingsText() {
    const holdings = calculateHoldings(allTransactions);
    const activeHoldings = Object.entries(holdings).filter(
        ([, data]) => Math.abs(data.shares) > 0.001
    );
    if (activeHoldings.length === 0) {
        return 'No current holdings.';
    }

    let table = '  Security        | Shares         | Avg Price      | Total Cost     \n';
    table += '  ----------------|----------------|----------------|----------------\n';
    activeHoldings
        .sort((a, b) => b[1].totalCost - a[1].totalCost)
        .forEach(([security, data]) => {
            const isNegative = data.shares < 0;
            const sec = `  ${security}${isNegative ? ' ⚠️' : ''}`.padEnd(17);
            const shares = data.shares
                .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                .padStart(14);
            const avgPrice = `$${data.avgPrice.toFixed(2)}`.padStart(14);
            const totalCost = formatCurrency(data.totalCost).padStart(14);
            table += `${sec} | ${shares} | ${avgPrice} | ${totalCost}\n`;
        });
    return table;
}

function toggleTable() {
    const tableContainer = document.querySelector('.table-responsive-container');
    const plotSection = document.getElementById('runningAmountSection');
    const isVisible = tableContainer && !tableContainer.classList.contains('is-hidden');

    if (tableContainer) {
        if (isVisible) {
            tableContainer.classList.add('is-hidden');
        } else {
            tableContainer.classList.remove('is-hidden');
            document.getElementById('transactionTable').style.display = 'table';
            if (plotSection) {
                plotSection.classList.add('is-hidden');
            }
        }
    }

    requestAnimationFrame(adjustMobilePanels);
}

function togglePlot() {
    const plotSection = document.getElementById('runningAmountSection');
    const tableContainer = document.querySelector('.table-responsive-container');
    const isVisible = plotSection && !plotSection.classList.contains('is-hidden');

    if (!plotSection) {
        return;
    }

    if (isVisible) {
        plotSection.classList.add('is-hidden');
    } else {
        plotSection.classList.remove('is-hidden');
        if (tableContainer) {
            tableContainer.classList.add('is-hidden');
        }
    }

    requestAnimationFrame(() => {
        adjustMobilePanels();
        if (!plotSection.classList.contains('is-hidden')) {
            updateRunningAmountChart(allTransactions);
        }
    });
}

// --- UI, TABLE, and CHART ---

function setupTableControls() {
    document
        .getElementById('header-tradeDate')
        .addEventListener('click', () => handleSort('tradeDate'));
    document.getElementById('header-security').addEventListener('click', (e) => {
        if (e.target.closest('.filter-indicator')) {
            handleFilter('security', e.currentTarget);
        } else {
            handleSort('security');
        }
    });
    document
        .getElementById('header-netAmount')
        .addEventListener('click', () => handleSort('netAmount'));
    document
        .getElementById('header-orderType')
        .addEventListener('click', (e) => handleFilter('orderType', e.currentTarget));
}

function handleSort(column) {
    sortState.order = sortState.column === column && sortState.order === 'asc' ? 'desc' : 'asc';
    sortState.column = column;
    filterAndSort(document.getElementById('terminalInput').value);
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

function createFilterDropdown(column) {
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown';
    const options =
        column === 'orderType'
            ? ['All', 'Buy', 'Sell']
            : ['All', ...new Set(allTransactions.map((t) => t.security))].sort();

    options.forEach((option) => {
        const div = document.createElement('div');
        div.textContent = option;
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            const command =
                option === 'All' ? '' : `${column === 'orderType' ? 'type' : 'security'}:${option}`;
            document.getElementById('terminalInput').value = command;
            filterAndSort(command);
            closeAllFilterDropdowns();
        });
        dropdown.appendChild(div);
    });

    return dropdown;
}

function closeAllFilterDropdowns() {
    document.querySelectorAll('.filter-dropdown').forEach((d) => d.remove());
    document
        .querySelectorAll('.table-responsive-container thead th.filter-active')
        .forEach((th) => th.classList.remove('filter-active'));
}

function updateSortIndicators() {
    document.querySelectorAll('th.sortable').forEach((th) => th.removeAttribute('data-sort'));
    const activeSorter = document.getElementById(`header-${sortState.column}`);
    if (activeSorter) {
        activeSorter.setAttribute('data-sort', sortState.order);
    }
}

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

function filterAndSort(searchTerm = '') {
    let filtered = [...allTransactions];

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
        if (commands.min !== null && !isNaN(commands.min)) {
            filtered = filtered.filter(
                (t) => Math.abs(parseFloat(t.netAmount) || 0) >= commands.min
            );
        }
        if (commands.max !== null && !isNaN(commands.max)) {
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
        let valA, valB;
        switch (sortState.column) {
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
            return sortState.order === 'asc' ? -1 : 1;
        }
        if (valA > valB) {
            return sortState.order === 'asc' ? 1 : -1;
        }
        return new Date(b.tradeDate) - new Date(a.tradeDate);
    });

    displayTransactions(filtered);
    updateSortIndicators();
}

function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionBody');
    tbody.innerHTML = '';
    const runningTotalsMap = computeRunningTotals(transactions);

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

function adjustMobilePanels() {
    const tableContainer = document.querySelector('.table-responsive-container');
    const plotSection = document.getElementById('runningAmountSection');
    const chartContainer = plotSection ? plotSection.querySelector('.chart-container') : null;
    const legend = plotSection ? plotSection.querySelector('.chart-legend') : null;

    if (window.innerWidth > 768) {
        if (tableContainer) {
            tableContainer.style.height = '';
        }
        if (plotSection) {
            plotSection.style.height = '';
        }
        if (chartContainer) {
            chartContainer.style.height = '';
        }
        return;
    }

    const viewportHeight = window.innerHeight;
    const bottomSpacing = 16;

    const setPanelHeight = (panel) => {
        if (!panel || panel.classList.contains('is-hidden')) {
            if (panel) {
                panel.style.height = '';
            }
            return null;
        }
        const rect = panel.getBoundingClientRect();
        const available = Math.max(200, viewportHeight - rect.top - bottomSpacing);
        panel.style.height = `${available}px`;
        return available;
    };

    setPanelHeight(tableContainer);

    if (plotSection && !plotSection.classList.contains('is-hidden')) {
        const cardHeight = setPanelHeight(plotSection);
        if (chartContainer && cardHeight !== null) {
            const cardStyles = window.getComputedStyle(plotSection);
            const paddingTop = parseFloat(cardStyles.paddingTop) || 0;
            const paddingBottom = parseFloat(cardStyles.paddingBottom) || 0;
            const legendHeight = legend ? legend.offsetHeight : 0;
            const legendMargin = legend
                ? parseFloat(window.getComputedStyle(legend).marginTop) || 0
                : 0;
            const innerAvailable = Math.max(
                160,
                cardHeight - paddingTop - paddingBottom - legendHeight - legendMargin - 8
            );
            chartContainer.style.height = `${innerAvailable}px`;
        }
    } else if (chartContainer) {
        chartContainer.style.height = '';
        if (plotSection) {
            plotSection.style.height = '';
        }
    }
}

function updateRunningAmountChart(transactions) {
    runningAmountSeries = buildRunningAmountSeries(transactions);
    const plotSection = document.getElementById('runningAmountSection');
    const isVisible = plotSection && !plotSection.classList.contains('is-hidden');
    if (isVisible) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                drawRunningAmountChart();
            });
        });
    }
}

function drawRunningAmountChart() {
    const canvas = document.getElementById('runningAmountCanvas');
    const emptyState = document.getElementById('runningAmountEmpty');
    if (!canvas || !emptyState) {
        return;
    }

    if (!runningAmountSeries || runningAmountSeries.length === 0) {
        emptyState.style.display = 'flex';
        return;
    }
    emptyState.style.display = 'none';

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvas.offsetWidth - padding.left - padding.right;
    const plotHeight = canvas.offsetHeight - padding.top - padding.bottom;

    const parsedSeries = runningAmountSeries
        .map((item) => ({ ...item, date: new Date(item.tradeDate) }))
        .filter((item) => !isNaN(item.date.getTime()));
    if (parsedSeries.length === 0) {
        return;
    }

    const maxAmount = Math.max(...parsedSeries.map((item) => item.amount), 0);
    const yMax = maxAmount <= 0 ? 1 : maxAmount * 1.15;

    const times = parsedSeries.map((item) => item.date.getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(new Date().setHours(0, 0, 0, 0), ...times);

    const xScale = (t) => {
        if (maxTime === minTime) {
            return padding.left + plotWidth / 2;
        }
        return padding.left + ((t - minTime) / (maxTime - minTime)) * plotWidth;
    };

    const yScale = (v) => padding.top + plotHeight - (v / yMax) * plotHeight;

    // --- Drawing Pass ---
    for (let i = 0; i <= 4; i++) {
        const value = (yMax / 4) * i;
        const y = yScale(value);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + plotWidth, y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#8b949e';
        ctx.font = '12px var(--font-family-mono)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatCurrencyCompact(value), padding.left - 10, y);
    }

    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + plotHeight);
    ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const tickCount = Math.min(6, Math.floor(plotWidth / 120));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= tickCount; i++) {
        const time = minTime + (i / tickCount) * (maxTime - minTime);
        const x = xScale(time);
        ctx.beginPath();
        ctx.moveTo(x, padding.top + plotHeight);
        ctx.lineTo(x, padding.top + plotHeight + 6);
        ctx.stroke();
        const labelDate = new Date(time);
        ctx.fillText(
            labelDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            x,
            padding.top + plotHeight + 10
        );
    }

    ctx.beginPath();
    parsedSeries.forEach((item, index) => {
        const x = xScale(item.date.getTime());
        const y = yScale(item.amount);
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    const rootStyles =
        typeof window !== 'undefined' && window.getComputedStyle
            ? window.getComputedStyle(document.documentElement)
            : null;
    const mutedStroke = rootStyles ? rootStyles.getPropertyValue('--muted-text').trim() : '';
    ctx.strokeStyle = mutedStroke || '#8b949e';
    ctx.lineWidth = 2;
    ctx.stroke();

    const drawMarker = (ctx, x, y, radius, isBuy) => {
        const clampedY = Math.max(
            padding.top + radius,
            Math.min(y, padding.top + plotHeight - radius)
        );
        ctx.beginPath();
        ctx.arc(x, clampedY, radius, 0, Math.PI * 2);
        ctx.fillStyle = isBuy ? 'rgba(48, 209, 88, 0.45)' : 'rgba(255, 69, 58, 0.45)';
        ctx.strokeStyle = isBuy ? 'rgba(48, 209, 88, 0.8)' : 'rgba(255, 69, 58, 0.8)';
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
    };

    const pointSeries = parsedSeries.filter(
        (item) => item.orderType.toLowerCase() === 'buy' || item.orderType.toLowerCase() === 'sell'
    );
    const grouped = new Map();
    if (pointSeries.length > 0) {
        pointSeries.forEach((item) => {
            const timestamp = item.date.getTime();
            if (!grouped.has(timestamp)) {
                grouped.set(timestamp, { buys: [], sells: [] });
            }
            const group = grouped.get(timestamp);
            const radius = Math.min(8, Math.max(2, Math.abs(item.netAmount) / 500));
            if (item.orderType.toLowerCase() === 'buy') {
                group.buys.push({ radius });
            } else {
                group.sells.push({ radius });
            }
        });
    }

    parsedSeries.forEach((item) => {
        const group = grouped.get(item.date.getTime());
        if (group && !group.drawn) {
            const x = xScale(item.date.getTime());
            const baseY = yScale(item.amount);
            let buyOffset = 8;
            group.buys.forEach((marker) => {
                const y = baseY - buyOffset - marker.radius;
                drawMarker(ctx, x, y, marker.radius, true);
                buyOffset += marker.radius * 2 + 8;
            });
            let sellOffset = 8;
            group.sells.forEach((marker) => {
                const y = baseY + sellOffset + marker.radius;
                drawMarker(ctx, x, y, marker.radius, false);
                sellOffset += marker.radius * 2 + 8;
            });
            group.drawn = true;
        }
    });
}

// --- APP INITIALIZATION ---
async function loadTransactions() {
    try {
        splitHistory = await loadSplitHistory();
        const response = await fetch('../data/transactions.csv');
        if (!response.ok) {
            throw new Error('Failed to load transactions.csv');
        }
        const csvText = await response.text();
        allTransactions = parseCSV(csvText);

        document.getElementById('transactionTable').style.display = 'table';

        setupTableControls();
        filterAndSort(); // Initial display
        adjustMobilePanels();
    } catch (error) {
        const errorDiv = document.getElementById('error');
        errorDiv.style.display = 'block';
        errorDiv.textContent = error.message;
        logger.error('Error loading transactions:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const terminalInput = document.getElementById('terminalInput');
    const terminal = document.getElementById('terminal');

    if (terminalInput) {
        terminalInput.focus();
        terminalInput.addEventListener('keydown', handleTerminalInput);
    }

    if (terminal) {
        terminal.addEventListener('click', (e) => {
            if (e.target !== terminalInput) {
                terminalInput.focus();
            }
        });
    }

    loadTransactions();
    adjustMobilePanels();
});

window.addEventListener('resize', () => {
    adjustMobilePanels();
});
