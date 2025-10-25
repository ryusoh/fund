import {
    transactionState,
    pushCommandHistory,
    resetHistoryIndex,
    setHistoryIndex,
    setChartDateRange,
    setActiveChart,
    setHistoricalPrices,
} from './state.js';
import { formatCurrency } from './utils.js';
import {
    hasActiveTransactionFilters,
    buildContributionSeriesFromTransactions,
    buildFilteredBalanceSeries,
} from './chart.js';

async function getStatsText() {
    try {
        const response = await fetch('../data/output/transaction_stats.txt');
        if (!response.ok) {
            return 'Error loading transaction stats.';
        }
        return await response.text();
    } catch {
        return 'Error loading transaction stats.';
    }
}

async function getHoldingsText() {
    try {
        const response = await fetch('../data/output/holdings.txt');
        if (!response.ok) {
            return 'Error loading holdings data.';
        }
        return await response.text();
    } catch {
        return 'Error loading holdings data.';
    }
}

async function getCagrText() {
    try {
        const response = await fetch('../data/output/cagr.txt');
        if (!response.ok) {
            return 'Error loading CAGR data.';
        }
        return await response.text();
    } catch {
        return 'Error loading CAGR data.';
    }
}

async function getAnnualReturnText() {
    try {
        const response = await fetch('../data/output/annual_returns.txt');
        if (!response.ok) {
            return 'Error loading annual returns.';
        }
        return await response.text();
    } catch {
        return 'Error loading annual returns.';
    }
}

async function getRatioText() {
    try {
        const response = await fetch('../data/output/ratios.txt');
        if (!response.ok) {
            return 'Error loading risk ratios.';
        }
        return await response.text();
    } catch {
        return 'Error loading risk ratios.';
    }
}
let lastEmptyFilterTerm = null;
const COMMAND_ALIASES = [
    'help',
    'h',
    'reset',
    'clear',
    'all',
    'stats',
    's',
    'transaction',
    't',
    'plot',
    'p',
    'from', // For simplified commands
    'to', // For simplified commands
];

const STATS_SUBCOMMANDS = ['transactions', 'holdings', 'cagr', 'return', 'ratio'];

const PLOT_SUBCOMMANDS = ['balance', 'performance', 'composition'];

const HELP_SUBCOMMANDS = ['filter'];

const MIN_FADE_OPACITY = 0.1;
const TWRR_MESSAGE =
    'TWRR (Time-Weighted Rate of Return) describes how efficiently the portfolio has grown regardless of when money moved in or out. It focuses purely on investment performance, so the result is not distorted by the size or timing of deposits and withdrawals.\n' +
    '\n' +
    'We follow the industry-standard method: for each day we compute a return factor by dividing the ending market value by the prior-day value after applying that day’s net contribution (cash in is added, cash out is subtracted). Multiplying, or “chaining,” these daily factors produces the cumulative TWRR curve shown in the chart.';

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

function normalizeDateOnly(input) {
    if (!input) {
        return null;
    }
    const date = input instanceof Date ? new Date(input) : new Date(input);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
}

function normalizeSeriesPoints(series, primaryDateKey, valueKey) {
    if (!Array.isArray(series) || series.length === 0) {
        return [];
    }

    return series
        .map((item) => {
            const rawDate = item[primaryDateKey] || item.date || item.tradeDate;
            const value = Number(item[valueKey]);
            const date = normalizeDateOnly(rawDate);
            if (!date || !Number.isFinite(value)) {
                return null;
            }
            return { date, value };
        })
        .filter(Boolean)
        .sort((a, b) => a.date - b.date);
}

function findLastPointAtOrBefore(points, targetDate) {
    for (let i = points.length - 1; i >= 0; i -= 1) {
        if (points[i].date <= targetDate) {
            return points[i];
        }
    }
    return null;
}

function findFirstPointAtOrAfter(points, targetDate) {
    for (let i = 0; i < points.length; i += 1) {
        if (points[i].date >= targetDate) {
            return points[i];
        }
    }
    return null;
}

function computeSeriesSummary(series, dateRange, dateKey, valueKey) {
    const points = normalizeSeriesPoints(series, dateKey, valueKey);
    if (points.length === 0) {
        return { hasData: false };
    }

    const fromDate = dateRange?.from ? normalizeDateOnly(dateRange.from) : null;
    const toDate = dateRange?.to ? normalizeDateOnly(dateRange.to) : null;

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    if (toDate && toDate < firstPoint.date) {
        return { hasData: false };
    }

    const effectiveStartDate = fromDate || firstPoint.date;
    const startPoint =
        findLastPointAtOrBefore(points, effectiveStartDate) ||
        findFirstPointAtOrAfter(points, effectiveStartDate);

    if (!startPoint) {
        return { hasData: false };
    }

    const effectiveEndDate = toDate || lastPoint.date;
    const endPoint =
        findLastPointAtOrBefore(points, effectiveEndDate) ||
        findFirstPointAtOrAfter(points, effectiveEndDate);

    if (!endPoint || endPoint.date < startPoint.date) {
        return { hasData: false };
    }

    return {
        hasData: true,
        startValue: startPoint.value,
        endValue: endPoint.value,
        netChange: endPoint.value - startPoint.value,
        startDate: new Date(startPoint.date),
        endDate: new Date(endPoint.date),
    };
}

function formatCurrencyChange(value) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    const formatted = formatCurrency(value);
    if (value > 0) {
        return `+${formatted}`;
    }
    return formatted;
}

function formatSummaryDateSuffix(actualDate, targetDateStr) {
    if (!(actualDate instanceof Date)) {
        return '';
    }
    const actual = actualDate.toISOString().split('T')[0];
    if (!targetDateStr || actual === targetDateStr) {
        return '';
    }
    return ` (${actual})`;
}

function formatSummaryBlock(label, summary, dateRange) {
    if (!summary || !summary.hasData) {
        return `  ${label}\n    (no data for selected range)`;
    }
    const startSuffix = formatSummaryDateSuffix(summary.startDate, dateRange?.from);
    const endSuffix = formatSummaryDateSuffix(summary.endDate, dateRange?.to);
    const startText = formatCurrency(summary.startValue);
    const endText = formatCurrency(summary.endValue);
    const changeText = formatCurrencyChange(summary.netChange);
    return [
        `  ${label}`,
        `    Start: ${startText}${startSuffix}`,
        `    End: ${endText}${endSuffix}`,
        `    Change: ${changeText}`,
    ].join('\n');
}

function formatAppreciationBlock(balanceSummary, contributionSummary) {
    if (
        !balanceSummary ||
        !contributionSummary ||
        !balanceSummary.hasData ||
        !contributionSummary.hasData
    ) {
        return '';
    }
    const deltaContribution = contributionSummary.netChange;
    const deltaBalance = balanceSummary.netChange;
    const valueAdded = deltaBalance - deltaContribution;
    if (!Number.isFinite(valueAdded)) {
        return '';
    }
    const changeText = formatCurrencyChange(valueAdded);
    return [
        '  Appreciation',
        `    Value: ${changeText}`,
        '    (balance change minus contribution change)',
    ].join('\n');
}

async function ensureHistoricalPricesAvailable(filtersActive) {
    if (!filtersActive) {
        return transactionState.historicalPrices || {};
    }

    let historicalPrices = transactionState.historicalPrices;
    if (historicalPrices && Object.keys(historicalPrices).length > 0) {
        return historicalPrices;
    }

    try {
        const response = await fetch('../data/historical_prices.json');
        if (response.ok) {
            historicalPrices = await response.json();
            setHistoricalPrices(historicalPrices);
        } else {
            historicalPrices = {};
        }
    } catch {
        historicalPrices = {};
    }
    return historicalPrices;
}

async function buildContributionChartSummary(dateRange = transactionState.chartDateRange) {
    const filtersActive = hasActiveTransactionFilters();
    let contributionSource = [];
    if (filtersActive) {
        contributionSource = buildContributionSeriesFromTransactions(
            transactionState.filteredTransactions || []
        );
    } else if (Array.isArray(transactionState.runningAmountSeries)) {
        contributionSource = transactionState.runningAmountSeries;
    }

    const historicalPrices = await ensureHistoricalPricesAvailable(filtersActive);
    let balanceSource = [];
    if (filtersActive) {
        balanceSource = buildFilteredBalanceSeries(
            transactionState.filteredTransactions || [],
            historicalPrices,
            transactionState.splitHistory || []
        );
    } else if (Array.isArray(transactionState.portfolioSeries)) {
        balanceSource = transactionState.portfolioSeries;
    }

    const contributionSummary = computeSeriesSummary(
        contributionSource,
        dateRange,
        'tradeDate',
        'amount'
    );
    const balanceSummary = computeSeriesSummary(balanceSource, dateRange, 'date', 'value');

    return { contributionSummary, balanceSummary };
}

async function getContributionSummaryText(dateRange = transactionState.chartDateRange) {
    const { contributionSummary, balanceSummary } = await buildContributionChartSummary(dateRange);
    const blocks = [
        formatSummaryBlock('Contribution', contributionSummary, dateRange),
        formatSummaryBlock('Balance', balanceSummary, dateRange),
        formatAppreciationBlock(balanceSummary, contributionSummary),
    ].filter(Boolean);
    if (blocks.length === 0) {
        return '';
    }
    return ['Contribution & Balance Summary', ...blocks].join('\n');
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

        if (searchPrefix.includes(':')) {
            resetAutocompleteState();
            return;
        }

        const lowerPrefix = searchPrefix.toLowerCase();
        let matches = [];

        // Handle subcommands
        if (searchPrefix.includes(' ')) {
            const parts = searchPrefix.split(' ');
            if (parts.length >= 2 && (parts[0] === 'stats' || parts[0] === 's')) {
                const subPrefix = parts[1] ? parts[1].toLowerCase() : '';
                matches = subPrefix
                    ? STATS_SUBCOMMANDS.filter((cmd) => cmd.startsWith(subPrefix))
                    : STATS_SUBCOMMANDS;
            } else if (parts.length >= 2 && (parts[0] === 'plot' || parts[0] === 'p')) {
                const subPrefix = parts[1] ? parts[1].toLowerCase() : '';
                matches = subPrefix
                    ? PLOT_SUBCOMMANDS.filter((cmd) => cmd.startsWith(subPrefix))
                    : PLOT_SUBCOMMANDS;
            } else if (parts.length >= 2 && (parts[0] === 'help' || parts[0] === 'h')) {
                const subPrefix = parts[1] ? parts[1].toLowerCase() : '';
                matches = subPrefix
                    ? HELP_SUBCOMMANDS.filter((cmd) => cmd.startsWith(subPrefix))
                    : HELP_SUBCOMMANDS;
            } else {
                resetAutocompleteState();
                return;
            }
        } else {
            // Handle main commands
            matches = (
                lowerPrefix
                    ? COMMAND_ALIASES.filter((cmd) => cmd.startsWith(lowerPrefix))
                    : COMMAND_ALIASES
            ).filter((cmd, index, arr) => arr.indexOf(cmd) === index);
        }

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

        // Handle subcommand completion
        if (searchPrefix.includes(' ') && searchPrefix.split(' ')[0] === 'stats') {
            const baseCommand = 'stats ';
            input.value = baseCommand + completed + (shouldAppendSpace ? ' ' : '');
        } else if (searchPrefix.includes(' ') && searchPrefix.split(' ')[0] === 's') {
            const baseCommand = 's ';
            input.value = baseCommand + completed + (shouldAppendSpace ? ' ' : '');
        } else if (searchPrefix.includes(' ') && searchPrefix.split(' ')[0] === 'plot') {
            const baseCommand = 'plot ';
            input.value = baseCommand + completed + (shouldAppendSpace ? ' ' : '');
        } else if (searchPrefix.includes(' ') && searchPrefix.split(' ')[0] === 'p') {
            const baseCommand = 'p ';
            input.value = baseCommand + completed + (shouldAppendSpace ? ' ' : '');
        } else if (searchPrefix.includes(' ') && searchPrefix.split(' ')[0] === 'help') {
            const baseCommand = 'help ';
            input.value = baseCommand + completed + (shouldAppendSpace ? ' ' : '');
        } else if (searchPrefix.includes(' ') && searchPrefix.split(' ')[0] === 'h') {
            const baseCommand = 'h ';
            input.value = baseCommand + completed + (shouldAppendSpace ? ' ' : '');
        } else {
            input.value = completed + (shouldAppendSpace ? ' ' : '');
        }

        const newLength = input.value.length;
        input.setSelectionRange(newLength, newLength);
    }

    async function processCommand(command) {
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
                if (args.length === 0) {
                    // Show main help
                    result =
                        'Available commands:\n' +
                        '  stats (s)          - Statistics commands\n' +
                        '                       Use "stats" or "s" for subcommands\n' +
                        '                       Subcommands: transactions, holdings, cagr, return, ratio\n' +
                        '                       Examples: stats transactions, s cagr, stats ratio\n' +
                        '  plot (p)           - Chart commands\n' +
                        '                       Use "plot" or "p" for subcommands\n' +
                        '                       Subcommands: balance, performance, composition\n' +
                        '                       Examples: plot balance, p performance, plot composition 2023\n' +
                        '  transaction (t)    - Toggle the transaction table visibility\n' +
                        '  all                - Show all data (remove filters and date ranges)\n' +
                        '  reset              - Restore full transaction list and show table/chart\n' +
                        '  clear              - Clear the terminal screen\n' +
                        '  help (h)           - Show this help message\n' +
                        '                       Use "help filter" for filter commands\n\n' +
                        'Hint: Press Tab to auto-complete command names and subcommands\n\n' +
                        'Any other input is treated as a filter for the transaction table\n' +
                        "When a chart is active, you can use simplified date commands like '2023', 'from:2023' (or 'f:2023'), '2020:2023'";
                } else {
                    const subcommand = args[0].toLowerCase();
                    switch (subcommand) {
                        case 'filter':
                            result =
                                'Usage: <filter>:<value>\n\nAvailable filters:\n  type     - Filter by order type (buy or sell).\n             Example: type:buy\n  security - Filter by security ticker.\n             Example: security:NVDA or s:NVDA\n  min      - Show transactions with a net amount greater than value.\n             Example: min:1000\n  max      - Show transactions with a net amount less than value.\n             Example: max:5000\n\nDate filters (when chart is active):\n  from:YYYY or f:YYYY - Filter from year (e.g., from:2022 or f:2022)\n  to:YYYY             - Filter to year (e.g., to:2023)\n  YYYY:YYYY           - Filter year range (e.g., 2022:2023)\n\nAny text not part of a command is used for a general text search.';
                            break;
                        default:
                            result = `Unknown help subcommand: ${subcommand}\nAvailable: ${HELP_SUBCOMMANDS.join(', ')}`;
                            break;
                    }
                }
                break;
            case 'all':
                // Clear all filters and date ranges without changing view
                closeAllFilterDropdowns();
                resetSortState();
                setChartDateRange({ from: null, to: null }); // Reset date range
                filterAndSort(''); // Clear all filters

                // Update chart if it's currently visible
                if (
                    transactionState.activeChart === 'contribution' ||
                    transactionState.activeChart === 'performance'
                ) {
                    chartManager.update();
                }

                result = 'Showing all data (filters and date ranges cleared).';
                if (transactionState.activeChart === 'contribution') {
                    const summaryText = await getContributionSummaryText(
                        transactionState.chartDateRange
                    );
                    if (summaryText) {
                        result += `\n${summaryText}`;
                    }
                }
                break;
            case 'reset':
                closeAllFilterDropdowns();
                resetSortState();
                setChartDateRange({ from: null, to: null }); // Reset date range
                if (terminalInput) {
                    terminalInput.value = '';
                }
                // Hide both table and chart
                const resetTableContainer = document.querySelector('.table-responsive-container');
                const resetPlotSection = document.getElementById('runningAmountSection');
                const resetPerformanceSection = document.getElementById('performanceSection');

                if (resetTableContainer) {
                    resetTableContainer.classList.add('is-hidden');
                }
                if (resetPlotSection) {
                    resetPlotSection.classList.add('is-hidden');
                }
                if (resetPerformanceSection) {
                    resetPerformanceSection.classList.add('is-hidden');
                }

                filterAndSort('');
                result =
                    'Reset filters and date ranges. All views hidden. Use `table`, `plot`, or `performance` to view data.';
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
            case 's':
                if (args.length === 0) {
                    // Show stats help
                    result =
                        'Stats commands:\n  stats transactions - Show transaction statistics\n  stats holdings     - Show current holdings\n  stats cagr         - Show CAGR based on TWRR series\n  stats return       - Show annual returns for portfolio and benchmarks\n  stats ratio        - Show Sharpe and Sortino ratios\n\nUsage: stats <subcommand> or s <subcommand>';
                } else {
                    const subcommand = args[0].toLowerCase();
                    switch (subcommand) {
                        case 'transactions':
                            result = await getStatsText();
                            break;
                        case 'holdings':
                            result = await getHoldingsText();
                            break;
                        case 'cagr':
                            result = await getCagrText();
                            break;
                        case 'return':
                            result = await getAnnualReturnText();
                            break;
                        case 'ratio':
                            result = await getRatioText();
                            break;
                        default:
                            result = `Unknown stats subcommand: ${subcommand}\nAvailable: ${STATS_SUBCOMMANDS.join(', ')}`;
                            break;
                    }
                }
                break;
            case 't':
            case 'transaction':
                toggleTable();
                result = 'Toggled transaction table visibility.';
                break;
            case 'p':
            case 'plot':
                if (args.length === 0) {
                    // Show plot help
                    result =
                        'Plot commands:\n  plot balance      - Show contribution/balance chart\n  plot performance  - Show TWRR performance chart\n  plot composition  - Show portfolio composition chart\n\nUsage: plot <subcommand> or p <subcommand>\n       plot balance [year] | [from <year>] | [<year1> to <year2>]\n       plot performance [year] | [from <year>] | [<year1> to <year2>]\n       plot composition [year] | [from <year>] | [<year1> to <year2>]';
                } else {
                    const subcommand = args[0].toLowerCase();
                    dateRange = parseDateRange(args.slice(1));
                    setChartDateRange(dateRange);

                    switch (subcommand) {
                        case 'balance':
                            const contributionSection =
                                document.getElementById('runningAmountSection');
                            const contributionTableContainer = document.querySelector(
                                '.table-responsive-container'
                            );

                            // Check if contribution chart is already active and visible
                            const isContributionActive =
                                transactionState.activeChart === 'contribution';
                            const isChartVisible =
                                contributionSection &&
                                !contributionSection.classList.contains('is-hidden');

                            if (isContributionActive && isChartVisible) {
                                // Toggle off if contribution chart is already visible
                                setActiveChart(null);
                                if (contributionSection) {
                                    contributionSection.classList.add('is-hidden');
                                }
                                result = 'Hidden contribution chart.';
                            } else {
                                // Show contribution chart
                                setActiveChart('contribution');
                                if (contributionSection) {
                                    contributionSection.classList.remove('is-hidden');
                                    chartManager.update();
                                }
                                if (contributionTableContainer) {
                                    contributionTableContainer.classList.add('is-hidden');
                                }
                                const summaryText = await getContributionSummaryText(
                                    transactionState.chartDateRange
                                );
                                result = `Showing contribution chart for ${formatDateRange(dateRange)}.`;
                                if (summaryText) {
                                    result += `\n${summaryText}`;
                                }
                            }
                            break;
                        case 'performance':
                            const perfSection = document.getElementById('runningAmountSection');
                            const perfTableContainer = document.querySelector(
                                '.table-responsive-container'
                            );

                            // Check if performance chart is already active and visible
                            const isPerformanceActive =
                                transactionState.activeChart === 'performance';
                            const isPerfChartVisible =
                                perfSection && !perfSection.classList.contains('is-hidden');

                            if (isPerformanceActive && isPerfChartVisible) {
                                // Toggle off if performance chart is already visible
                                setActiveChart(null);
                                if (perfSection) {
                                    perfSection.classList.add('is-hidden');
                                }
                                result = 'Hidden performance chart.';
                            } else {
                                // Show performance chart
                                setActiveChart('performance');
                                if (perfSection) {
                                    perfSection.classList.remove('is-hidden');
                                    chartManager.update();
                                }
                                if (perfTableContainer) {
                                    perfTableContainer.classList.add('is-hidden');
                                }
                                result = `Showing performance chart for ${formatDateRange(
                                    dateRange
                                )}.\n\n${TWRR_MESSAGE}`;
                            }
                            break;
                        case 'composition':
                            const compSection = document.getElementById('runningAmountSection');
                            const compTableContainer = document.querySelector(
                                '.table-responsive-container'
                            );

                            // Check if composition chart is already active and visible
                            const isCompositionActive =
                                transactionState.activeChart === 'composition';
                            const isCompChartVisible =
                                compSection && !compSection.classList.contains('is-hidden');

                            if (isCompositionActive && isCompChartVisible) {
                                // Toggle off if composition chart is already visible
                                setActiveChart(null);
                                if (compSection) {
                                    compSection.classList.add('is-hidden');
                                }
                                result = 'Hidden composition chart.';
                            } else {
                                // Show composition chart
                                setActiveChart('composition');
                                if (compSection) {
                                    compSection.classList.remove('is-hidden');
                                    chartManager.update();
                                }
                                if (compTableContainer) {
                                    compTableContainer.classList.add('is-hidden');
                                }
                                result = `Showing composition chart for ${formatDateRange(dateRange)}.`;
                            }
                            break;
                        default:
                            result = `Unknown plot subcommand: ${subcommand}\nAvailable: ${PLOT_SUBCOMMANDS.join(', ')}`;
                            break;
                    }
                }
                break;
            default:
                // Handle simplified date commands if a chart is active
                if (
                    transactionState.activeChart &&
                    (transactionState.activeChart === 'contribution' ||
                        transactionState.activeChart === 'performance' ||
                        transactionState.activeChart === 'composition')
                ) {
                    const simplifiedDateRange = parseSimplifiedDateRange(command);
                    if (simplifiedDateRange.from || simplifiedDateRange.to) {
                        setChartDateRange(simplifiedDateRange);
                        // Update the chart with filtered data
                        chartManager.update();
                        result = `Applied date filter ${formatDateRange(
                            simplifiedDateRange
                        )} to ${transactionState.activeChart} chart.`;
                        if (transactionState.activeChart === 'contribution') {
                            const summaryText = await getContributionSummaryText(
                                transactionState.chartDateRange
                            );
                            if (summaryText) {
                                result += `\n${summaryText}`;
                            }
                        }
                        break;
                    }
                }
                filterAndSort(command);
                const summaryText = await getContributionSummaryText(
                    transactionState.chartDateRange
                );
                result = `Filtering transactions by: "${command}"...`;
                if (summaryText) {
                    result += `\n${summaryText}`;
                }
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
            if (type === 'from' || type === 'f') {
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

    async function handleTerminalInput(e) {
        const input = e.target;
        switch (e.key) {
            case 'Enter':
                if (input.value.trim()) {
                    const command = input.value.trim();
                    pushCommandHistory(command);
                    resetHistoryIndex();
                    await processCommand(command);
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
