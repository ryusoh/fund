import {
    transactionState,
    pushCommandHistory,
    resetHistoryIndex,
    setHistoryIndex,
    setChartDateRange,
    setActiveChart,
} from './state.js';
import { formatCurrency } from './utils.js';
import { calculateStats, calculateHoldings } from './calculations.js';

function getStatsText() {
    const stats = calculateStats(transactionState.allTransactions, transactionState.splitHistory);
    return `\n-------------------- TRANSACTION STATS ---------------------\n  Total Transactions: ${stats.totalTransactions.toLocaleString()}\n  Buy Orders:         ${stats.totalBuys.toLocaleString()}\n  Sell Orders:        ${stats.totalSells.toLocaleString()}\n  Total Buy Amount:   ${formatCurrency(stats.totalBuyAmount)}\n  Total Sell Amount:  ${formatCurrency(stats.totalSellAmount)}\n  Net Amount:         ${formatCurrency(stats.netAmount)}\n  Realized Gain:      ${formatCurrency(stats.realizedGain)}\n`;
}

function getHoldingsText() {
    const holdings = calculateHoldings(
        transactionState.allTransactions,
        transactionState.splitHistory
    );
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

function formatPercent(value) {
    if (!Number.isFinite(value)) {
        return 'N/A';
    }
    const percentage = value * 100;
    const sign = percentage >= 0 ? '' : '-';
    return `${sign}${Math.abs(percentage).toFixed(2)}%`;
}

function getCagrText() {
    const seriesMap =
        transactionState.performanceSeries && typeof transactionState.performanceSeries === 'object'
            ? transactionState.performanceSeries
            : {};

    const entries = Object.entries(seriesMap);
    if (entries.length === 0) {
        return 'CAGR unavailable: performance series not loaded yet.';
    }

    const baseEntry = selectBaseSeries(entries);
    const baseSeries = baseEntry[1];
    if (!Array.isArray(baseSeries) || baseSeries.length < 2) {
        return 'CAGR unavailable: insufficient portfolio observations.';
    }

    const sortedBase = [...baseSeries].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const baseFirst = sortedBase.find((point) => Number.isFinite(point.value) && point.value > 0);
    const baseLast = [...sortedBase]
        .reverse()
        .find((point) => Number.isFinite(point.value) && point.value > 0);

    if (!baseFirst || !baseLast) {
        return 'CAGR unavailable: portfolio series contains invalid values.';
    }

    const startDate = new Date(baseFirst.date);
    const endDate = new Date(baseLast.date);
    const durationMs = endDate.getTime() - startDate.getTime();
    const years = durationMs / (365.25 * 24 * 60 * 60 * 1000);

    if (!Number.isFinite(years) || years <= 0) {
        return 'CAGR unavailable: invalid measurement period.';
    }

    const startLabel = startDate.toISOString().slice(0, 10);
    const endLabel = endDate.toISOString().slice(0, 10);

    const metrics = entries
        .map(([name, points]) => ({
            name,
            ...computeSeriesMetrics(points, startDate, endDate, years),
        }))
        .filter((item) => item.cagr !== null);

    if (metrics.length === 0) {
        return 'CAGR unavailable: no comparable series with valid data.';
    }

    const header =
        '\n--------------------- PERFORMANCE CAGR --------------------\n' +
        `  Period:        ${startLabel} → ${endLabel}\n` +
        `  Years:         ${years.toFixed(2)}\n\n` +
        '  Series                         Total Return        CAGR\n' +
        '  ----------------------------   ------------   ---------\n';

    const lines = metrics
        .map((item) => {
            const name = `  ${item.name}`.padEnd(30);
            const total = formatPercent(item.totalReturn).padStart(12);
            const cagrValue = formatPercent(item.cagr).padStart(9);
            return `${name}   ${total}   ${cagrValue}`;
        })
        .join('\n');

    const skipped = entries.length - metrics.length;
    const footer = skipped
        ? `\n\n  Note: ${skipped} series omitted due to missing data in this window.`
        : '';

    return header + lines + footer + '\n';
}

function computeSeriesMetrics(points, startDate, endDate, years) {
    if (!Array.isArray(points) || points.length < 2) {
        return { totalReturn: null, cagr: null };
    }

    const filtered = points
        .map((point) => ({
            date: new Date(point.date),
            value: Number(point.value),
        }))
        .filter(
            (point) =>
                Number.isFinite(point.value) &&
                !Number.isNaN(point.date.getTime()) &&
                point.date >= startDate &&
                point.date <= endDate
        )
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (filtered.length < 2) {
        return { totalReturn: null, cagr: null };
    }

    const first = filtered.find((point) => point.value > 0);
    const last = [...filtered].reverse().find((point) => point.value > 0);

    if (!first || !last) {
        return { totalReturn: null, cagr: null };
    }

    const growthRatio = last.value / first.value;
    if (!Number.isFinite(growthRatio) || growthRatio <= 0) {
        return { totalReturn: null, cagr: null };
    }

    const totalReturn = growthRatio - 1;
    const cagr = Math.pow(growthRatio, 1 / years) - 1;
    return { totalReturn, cagr };
}

function computeAnnualReturns(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return {};
    }

    const grouped = new Map();

    points.forEach((point) => {
        const value = Number(point.value);
        const date = new Date(point.date);
        if (!Number.isFinite(value) || Number.isNaN(date.getTime()) || value <= 0) {
            return;
        }
        const year = date.getUTCFullYear();
        if (!grouped.has(year)) {
            grouped.set(year, []);
        }
        grouped.get(year).push({ date, value });
    });

    const result = {};
    grouped.forEach((entries, year) => {
        const sorted = entries.sort((a, b) => a.date.getTime() - b.date.getTime());
        if (sorted.length < 2) {
            return;
        }
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        if (first.value <= 0 || last.value <= 0) {
            return;
        }
        const growthRatio = last.value / first.value;
        if (!Number.isFinite(growthRatio) || growthRatio <= 0) {
            return;
        }
        result[year] = growthRatio - 1;
    });

    return result;
}

function selectBaseSeries(entries) {
    const preferences = ['lz', 'portfolio', 'twrr'];
    for (const preference of preferences) {
        const match = entries.find(([name]) => name.toLowerCase().includes(preference));
        if (match) {
            return match;
        }
    }
    return entries[0];
}

function getAnnualReturnText() {
    const seriesMap =
        transactionState.performanceSeries && typeof transactionState.performanceSeries === 'object'
            ? transactionState.performanceSeries
            : {};

    const entries = Object.entries(seriesMap);
    if (entries.length === 0) {
        return 'Return breakdown unavailable: performance series not loaded yet.';
    }

    const annualData = entries
        .map(([name, points]) => ({ name, returns: computeAnnualReturns(points) }))
        .filter((entry) => Object.keys(entry.returns).length > 0);

    if (annualData.length === 0) {
        return 'Return breakdown unavailable: no series contain annual data.';
    }

    const baseName = selectBaseSeries(entries)[0];
    const baseEntry = annualData.find((entry) => entry.name === baseName);
    const others = annualData
        .filter((entry) => entry.name !== baseName)
        .sort((a, b) => (a.name > b.name ? 1 : -1));
    const orderedSeries = baseEntry ? [baseEntry, ...others] : others;

    const yearSet = new Set();
    annualData.forEach((entry) => {
        Object.keys(entry.returns).forEach((year) => yearSet.add(Number(year)));
    });

    if (yearSet.size === 0) {
        return 'Return breakdown unavailable: unable to derive annual windows.';
    }

    const years = Array.from(yearSet).sort((a, b) => a - b);

    const header =
        '\n----------------------- ANNUAL RETURNS --------------------\n' +
        '  Year'.padEnd(8) +
        orderedSeries.map((entry) => entry.name.padStart(12)).join('') +
        '\n';

    const rows = years
        .map((year) => {
            const yearLabel = `  ${year}`.padEnd(8);
            const columns = orderedSeries
                .map((entry) => {
                    const value = entry.returns[year];
                    return formatPercent(Number.isFinite(value) ? value : NaN).padStart(12);
                })
                .join('');
            return yearLabel + columns;
        })
        .join('\n');

    return `${header}${rows}\n`;
}

function calculateSharpeRatio(returns, riskFreeRate = 0.053) {
    if (!Array.isArray(returns) || returns.length < 2) {
        return null;
    }

    const validReturns = returns.filter((r) => Number.isFinite(r));
    if (validReturns.length < 2) {
        return null;
    }

    const meanReturn = validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;
    const variance =
        validReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
        (validReturns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
        return null;
    }

    return (meanReturn - riskFreeRate / 252) / stdDev; // Daily risk-free rate
}

function calculateSortinoRatio(returns, riskFreeRate = 0.053) {
    if (!Array.isArray(returns) || returns.length < 2) {
        return null;
    }

    const validReturns = returns.filter((r) => Number.isFinite(r));
    if (validReturns.length < 2) {
        return null;
    }

    const meanReturn = validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;
    const negativeReturns = validReturns.filter((r) => r < 0);

    if (negativeReturns.length === 0) {
        return null; // No downside risk
    }

    const downsideVariance =
        negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / validReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);

    if (downsideDeviation === 0) {
        return null;
    }

    return (meanReturn - riskFreeRate / 252) / downsideDeviation; // Daily risk-free rate
}

function computeDailyReturns(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return [];
    }

    const sorted = points
        .map((point) => ({
            date: new Date(point.date),
            value: Number(point.value),
        }))
        .filter(
            (point) =>
                Number.isFinite(point.value) &&
                !Number.isNaN(point.date.getTime()) &&
                point.value > 0
        )
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (sorted.length < 2) {
        return [];
    }

    const returns = [];
    for (let i = 1; i < sorted.length; i++) {
        const prevValue = sorted[i - 1].value;
        const currValue = sorted[i].value;
        if (prevValue > 0) {
            const dailyReturn = (currValue - prevValue) / prevValue;
            if (Number.isFinite(dailyReturn)) {
                returns.push(dailyReturn);
            }
        }
    }

    return returns;
}

function getRatioText() {
    const seriesMap =
        transactionState.performanceSeries && typeof transactionState.performanceSeries === 'object'
            ? transactionState.performanceSeries
            : {};

    const entries = Object.entries(seriesMap);
    if (entries.length === 0) {
        return 'Risk ratios unavailable: performance series not loaded yet.';
    }

    const ratioData = entries
        .map(([name, points]) => {
            const dailyReturns = computeDailyReturns(points);
            const sharpe = calculateSharpeRatio(dailyReturns);
            const sortino = calculateSortinoRatio(dailyReturns);

            return {
                name,
                dailyReturns: dailyReturns.length,
                sharpe: sharpe !== null ? sharpe * Math.sqrt(252) : null, // Annualized
                sortino: sortino !== null ? sortino * Math.sqrt(252) : null, // Annualized
            };
        })
        .filter((item) => item.dailyReturns > 0);

    if (ratioData.length === 0) {
        return 'Risk ratios unavailable: no series contain sufficient data.';
    }

    // Sort by portfolio first, then alphabetically
    const portfolioEntry = ratioData.find(
        (item) =>
            item.name.toLowerCase().includes('portfolio') ||
            item.name.toLowerCase().includes('twrr') ||
            item.name.toLowerCase().includes('lz')
    );
    const others = ratioData
        .filter((item) => item !== portfolioEntry)
        .sort((a, b) => a.name.localeCompare(b.name));
    const orderedData = portfolioEntry ? [portfolioEntry, ...others] : others;

    const header =
        '\n  ------------------------- RISK RATIOS ---------------------\n' +
        '  Series                         Sharpe Ratio   Sortino Ratio\n' +
        '  ----------------------------   ------------   -------------\n';

    const lines = orderedData
        .map((item) => {
            const name = `  ${item.name}`.padEnd(30);
            const sharpe =
                item.sharpe !== null ? item.sharpe.toFixed(3).padStart(12) : 'N/A'.padStart(12);
            const sortino =
                item.sortino !== null ? item.sortino.toFixed(3).padStart(13) : 'N/A'.padStart(13);
            return `${name}   ${sharpe}   ${sortino}`;
        })
        .join('\n');

    const footer =
        '\n\n  Note: Ratios are annualized using 5.3% risk-free rate (3-month T-bill).\n' +
        '        Higher values indicate better risk-adjusted returns.\n' +
        '        Sharpe uses total volatility; Sortino uses only downside volatility.';

    return header + lines + footer + '\n';
}

let lastEmptyFilterTerm = null;
const COMMAND_ALIASES = [
    'help',
    'h',
    'filter',
    'reset',
    'clear',
    'stats',
    'holdings',
    'cagr',
    'return',
    'ratio',
    'table',
    't',
    'plot',
    'p',
    'performance',
    'from', // For simplified commands
    'to', // For simplified commands
];

const MIN_FADE_OPACITY = 0.1;

const autocompleteState = {
    prefix: '',
    matches: [],
    index: -1,
};

function resetAutocompleteState() {
    autocompleteState.prefix = '';
    autocompleteState.matches = [];
    autocompleteState.index = -1;
}

export function initTerminal({
    filterAndSort,
    toggleTable,
    closeAllFilterDropdowns,
    resetSortState,
    chartManager,
}) {
    const terminalInput = document.getElementById('terminalInput');
    const terminal = document.getElementById('terminal');
    const outputContainer = document.getElementById('terminalOutput');
    let fadeUpdateScheduled = false;

    function appendMessage(message) {
        if (!outputContainer) {
            return;
        }
        const pre = document.createElement('pre');
        pre.textContent = message;
        outputContainer.appendChild(pre);
        outputContainer.scrollTop = outputContainer.scrollHeight;
        requestFadeUpdate();
    }

    function updateOutputFade() {
        if (!outputContainer) {
            return;
        }

        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            Array.from(outputContainer.children).forEach((child) => {
                if (child && child.nodeType === 1) {
                    child.style.opacity = '1';
                }
            });
            return;
        }

        const viewHeight = outputContainer.clientHeight;
        if (viewHeight <= 0) {
            return;
        }

        const threshold = viewHeight * 0.25;
        const viewTop = outputContainer.scrollTop;

        Array.from(outputContainer.children).forEach((child) => {
            if (!child || child.nodeType !== 1) {
                return;
            }

            if (!child.style.transition) {
                child.style.transition = 'opacity 0.18s ease-out';
            }

            const relativeTop = child.offsetTop - viewTop;
            const relativeBottom = relativeTop + child.offsetHeight;

            if (relativeBottom <= 0) {
                child.style.opacity = '0';
                return;
            }

            if (relativeTop >= threshold) {
                child.style.opacity = '';
                return;
            }

            const center = Math.max(0, Math.min(relativeTop + child.offsetHeight / 2, threshold));
            const ratio = center / threshold;
            const opacity = MIN_FADE_OPACITY + (1 - MIN_FADE_OPACITY) * ratio;
            child.style.opacity = opacity.toFixed(2);
        });
    }

    function requestFadeUpdate() {
        if (fadeUpdateScheduled) {
            return;
        }
        fadeUpdateScheduled = true;
        requestAnimationFrame(() => {
            fadeUpdateScheduled = false;
            updateOutputFade();
        });
    }

    function autocompleteCommand(input) {
        if (!input) {
            return;
        }
        const rawValue = input.value;
        const trimmedValue = rawValue.trim();
        let searchPrefix = trimmedValue;

        if (autocompleteState.matches.length > 0) {
            const currentMatch = autocompleteState.matches[autocompleteState.index];
            if (trimmedValue === currentMatch) {
                searchPrefix = autocompleteState.prefix;
            }
        }

        if (searchPrefix.includes(' ') || searchPrefix.includes(':')) {
            resetAutocompleteState();
            return;
        }

        const lowerPrefix = searchPrefix.toLowerCase();
        const matches = (
            lowerPrefix
                ? COMMAND_ALIASES.filter((cmd) => cmd.startsWith(lowerPrefix))
                : COMMAND_ALIASES
        ).filter((cmd, index, arr) => arr.indexOf(cmd) === index);

        if (matches.length === 0) {
            resetAutocompleteState();
            return;
        }

        if (
            autocompleteState.prefix === lowerPrefix &&
            autocompleteState.matches.length > 0 &&
            trimmedValue === autocompleteState.matches[autocompleteState.index]
        ) {
            autocompleteState.index =
                (autocompleteState.index + 1) % autocompleteState.matches.length;
        } else {
            autocompleteState.prefix = lowerPrefix;
            autocompleteState.matches = matches;
            autocompleteState.index = 0;
        }

        const completed = autocompleteState.matches[autocompleteState.index];
        const shouldAppendSpace = matches.length === 1;
        input.value = completed + (shouldAppendSpace ? ' ' : '');
        const newLength = input.value.length;
        input.setSelectionRange(newLength, newLength);
    }

    function processCommand(command) {
        if (!outputContainer) {
            return;
        }
        const prompt = `<div><span class="prompt-user">lz@fund:~$</span> ${command}</div>`;
        outputContainer.innerHTML += prompt;
        requestFadeUpdate();

        const parts = command.toLowerCase().split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);
        let dateRange = { from: null, to: null };
        let result = '';

        switch (cmd.toLowerCase()) {
            case 'h':
            case 'help':
                result =
                    'Available commands:\n' +
                    '  stats              - Display summary statistics.\n' +
                    '  holdings           - Display current holdings.\n' +
                    '  cagr               - Show CAGR based on TWRR series.\n' +
                    '  return             - Show annual returns for portfolio and benchmarks.\n' +
                    '  ratio              - Show Sharpe and Sortino ratios for portfolio and benchmarks.\n' +
                    '  table (t)          - Toggle the transaction table visibility.\n' +
                    '  plot (p)           - Toggle the running cost basis chart.\n' +
                    '                       Usage: plot [year] | [from <year>] | [<year1> to <year2>]\n' +
                    '                       Example: plot 2023, plot from 2020, plot 2020 to 2023\n' +
                    '  performance        - Show TWRR performance chart.\n' +
                    '                       Usage: performance [year] | [from <year>] | [<year1> to <year2>]\n' +
                    '                       Example: performance 2023, performance from 2020,\n' +
                    '                                performance 2020 to 2023\n' +
                    '  filter             - Show available filter commands.\n' +
                    '  reset              - Restore full transaction list and show table/chart.\n' +
                    '  clear              - Clear the terminal screen.\n' +
                    '  help (h)           - Show this help message.\n\n' +
                    'Hint: Press Tab to auto-complete command names.\n\n' +
                    'Any other input is treated as a filter for the transaction table.\n' +
                    "When a chart is active, you can use simplified date commands like '2023', 'from:2023', '2020:2023'.";
                break;
            case 'filter':
                result =
                    'Usage: <filter>:<value>\n\nAvailable filters:\n  type     - Filter by order type (buy or sell).\n             Example: type:buy\n  security - Filter by security ticker.\n             Example: security:NVDA\n  min      - Show transactions with a net amount greater than value.\n             Example: min:1000\n  max      - Show transactions with a net amount less than value.\n             Example: max:5000\n\nAny text not part of a command is used for a general text search.';
                break;
            case 'reset':
                closeAllFilterDropdowns();
                resetSortState();
                setChartDateRange({ from: null, to: null }); // Reset date range
                if (terminalInput) {
                    terminalInput.value = '';
                }
                const tableContainer = document.querySelector('.table-responsive-container');
                const plotSection = document.getElementById('runningAmountSection');
                if (tableContainer) {
                    tableContainer.classList.remove('is-hidden');
                    const transactionTable = document.getElementById('transactionTable');
                    if (transactionTable) {
                        transactionTable.style.display = 'table';
                    }
                }
                if (plotSection) {
                    plotSection.classList.add('is-hidden');
                }
                filterAndSort('');
                result =
                    'Reset filters and displaying full transaction history. Use `plot` to view the chart.';
                requestFadeUpdate();
                break;
            case 'clear':
                outputContainer.innerHTML = '';
                closeAllFilterDropdowns();
                resetSortState();
                setChartDateRange({ from: null, to: null }); // Reset date range
                if (terminalInput) {
                    terminalInput.value = '';
                }
                filterAndSort('');
                document
                    .querySelectorAll('.table-responsive-container, #runningAmountSection')
                    .forEach((el) => el.classList.add('is-hidden'));
                requestFadeUpdate();
                break;
            case 'stats':
                result = getStatsText();
                break;
            case 'holdings':
                result = getHoldingsText();
                break;
            case 'cagr':
                result = getCagrText();
                break;
            case 'return':
                result = getAnnualReturnText();
                break;
            case 'ratio':
                result = getRatioText();
                break;
            case 't':
            case 'table':
                toggleTable();
                result = 'Toggled transaction table visibility.';
                break;
            case 'p':
            case 'plot':
                dateRange = parseDateRange(args);
                setChartDateRange(dateRange);
                setActiveChart('contribution');
                // Show the chart and hide the table
                const contributionSection = document.getElementById('runningAmountSection');
                const contributionTableContainer = document.querySelector(
                    '.table-responsive-container'
                );
                if (contributionSection) {
                    contributionSection.classList.remove('is-hidden');
                    chartManager.update(
                        transactionState.allTransactions,
                        transactionState.splitHistory
                    );
                }
                if (contributionTableContainer) {
                    contributionTableContainer.classList.add('is-hidden');
                }
                result = `Toggled plot visibility for ${formatDateRange(dateRange)}.`;
                break;
            case 'performance':
                dateRange = parseDateRange(args);
                setChartDateRange(dateRange);
                setActiveChart('performance');
                // Show the chart and hide the table
                const performanceSection = document.getElementById('runningAmountSection');
                const performanceTableContainer = document.querySelector(
                    '.table-responsive-container'
                );
                if (performanceSection) {
                    performanceSection.classList.remove('is-hidden');
                    chartManager.update(
                        transactionState.allTransactions,
                        transactionState.splitHistory
                    );
                }
                if (performanceTableContainer) {
                    performanceTableContainer.classList.add('is-hidden');
                }
                result = `Toggled performance chart visibility for ${formatDateRange(dateRange)}.`;
                break;
            default:
                // Handle simplified date commands if a chart is active
                if (
                    transactionState.activeChart &&
                    (transactionState.activeChart === 'contribution' ||
                        transactionState.activeChart === 'performance')
                ) {
                    const simplifiedDateRange = parseSimplifiedDateRange(command);
                    if (simplifiedDateRange.from || simplifiedDateRange.to) {
                        setChartDateRange(simplifiedDateRange);
                        // Update the chart with filtered data
                        chartManager.update(
                            transactionState.allTransactions,
                            transactionState.splitHistory
                        );
                        result = `Applied date filter ${formatDateRange(simplifiedDateRange)} to ${transactionState.activeChart} chart.`;
                        break;
                    }
                }
                filterAndSort(command);
                result = `Filtering transactions by: "${command}"...`;
                break;
        }

        if (result) {
            const pre = document.createElement('pre');
            pre.textContent = result;
            outputContainer.appendChild(pre);
        }
        outputContainer.scrollTop = outputContainer.scrollHeight;
        requestFadeUpdate();
    }

    function parseSimplifiedDateRange(command) {
        const parts = command.toLowerCase().split(':');
        if (parts.length === 1) {
            const year = parseInt(parts[0], 10);
            if (!isNaN(year)) {
                return { from: `${year}-01-01`, to: `${year}-12-31` };
            }
        } else if (parts.length === 2) {
            const type = parts[0];
            const value = parts[1];
            if (type === 'from') {
                const year = parseInt(value, 10);
                if (!isNaN(year)) {
                    return { from: `${year}-01-01`, to: null };
                }
            } else if (type === 'to') {
                const year = parseInt(value, 10);
                if (!isNaN(year)) {
                    return { from: null, to: `${year}-12-31` };
                }
            } else {
                const year1 = parseInt(type, 10);
                const year2 = parseInt(value, 10);
                if (!isNaN(year1) && !isNaN(year2) && year1 <= year2) {
                    return { from: `${year1}-01-01`, to: `${year2}-12-31` };
                }
            }
        }
        return { from: null, to: null };
    }

    function handleTerminalInput(e) {
        const input = e.target;
        switch (e.key) {
            case 'Enter':
                if (input.value.trim()) {
                    const command = input.value.trim();
                    pushCommandHistory(command);
                    resetHistoryIndex();
                    processCommand(command);
                    input.value = '';
                }
                resetAutocompleteState();
                requestFadeUpdate();
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (transactionState.historyIndex < transactionState.commandHistory.length - 1) {
                    setHistoryIndex(transactionState.historyIndex + 1);
                    input.value = transactionState.commandHistory[transactionState.historyIndex];
                }
                resetAutocompleteState();
                requestFadeUpdate();
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (transactionState.historyIndex > 0) {
                    setHistoryIndex(transactionState.historyIndex - 1);
                    input.value = transactionState.commandHistory[transactionState.historyIndex];
                } else {
                    resetHistoryIndex();
                    input.value = '';
                }
                resetAutocompleteState();
                requestFadeUpdate();
                break;
            case 'Tab':
                e.preventDefault();
                autocompleteCommand(input);
                break;
            default:
                resetAutocompleteState();
                break;
        }
    }

    if (terminalInput) {
        terminalInput.focus();
        terminalInput.addEventListener('keydown', handleTerminalInput);
    }

    if (terminal) {
        terminal.addEventListener('click', (e) => {
            if (terminalInput && e.target !== terminalInput) {
                terminalInput.focus();
            }
        });
    }

    document.addEventListener('transactionFilterResult', (event) => {
        if (!outputContainer) {
            return;
        }
        const detail = event.detail || {};
        const { count } = detail;
        const searchTerm = typeof detail.searchTerm === 'string' ? detail.searchTerm.trim() : '';
        if (count === 0 && searchTerm) {
            if (lastEmptyFilterTerm !== searchTerm) {
                appendMessage("No transactions match the current filter. Type 'clear' to reset.");
                lastEmptyFilterTerm = searchTerm;
            }
        } else if (count > 0) {
            lastEmptyFilterTerm = null;
        }
        outputContainer.scrollTop = outputContainer.scrollHeight;
        requestFadeUpdate();
    });

    if (outputContainer) {
        outputContainer.addEventListener('scroll', requestFadeUpdate, { passive: true });
        requestFadeUpdate();
    }

    return {
        processCommand,
    };
}

function parseDateRange(args) {
    const currentYear = new Date().getFullYear();
    let from = null;
    let to = null;

    if (args.length === 1) {
        const year = parseInt(args[0], 10);
        if (!isNaN(year) && year >= 1900 && year <= currentYear + 5) {
            from = `${year}-01-01`;
            to = `${year}-12-31`;
        }
    } else if (args.length === 2 && args[0].toLowerCase() === 'from') {
        const year = parseInt(args[1], 10);
        if (!isNaN(year) && year >= 1900 && year <= currentYear + 5) {
            from = `${year}-01-01`;
            to = null; // To current date
        }
    } else if (args.length === 3 && args[1].toLowerCase() === 'to') {
        const year1 = parseInt(args[0], 10);
        const year2 = parseInt(args[2], 10);
        if (
            !isNaN(year1) &&
            year1 >= 1900 &&
            year1 <= currentYear + 5 &&
            !isNaN(year2) &&
            year2 >= 1900 &&
            year2 <= currentYear + 5 &&
            year1 <= year2
        ) {
            from = `${year1}-01-01`;
            to = `${year2}-12-31`;
        }
    }

    return { from, to };
}

function formatDateRange(range) {
    if (range.from && range.to) {
        if (range.from.endsWith('-01-01') && range.to.endsWith('-12-31')) {
            const year1 = range.from.substring(0, 4);
            const year2 = range.to.substring(0, 4);
            if (year1 === year2) {
                return year1;
            }
            return `${year1} to ${year2}`;
        }
        return `${range.from} to ${range.to}`;
    } else if (range.from) {
        return `from ${range.from}`;
    } else if (range.to) {
        return `to ${range.to}`;
    }
    return 'all time';
}
