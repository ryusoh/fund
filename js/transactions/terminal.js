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

const ALLOWED_BENCHMARKS = new Set(['^GSPC', '^IXIC', '^DJI', '^SSEC', '^HSI', '^N225']);

function isPortfolioSymbol(name) {
    const lower = String(name || '').toLowerCase();
    return lower.includes('portfolio') || lower.includes('twrr') || lower.includes('lz');
}

function getStatsText() {
    const stats = calculateStats(transactionState.allTransactions, transactionState.splitHistory);
    return `\n-------------------- TRANSACTION STATS ---------------------\n  Total Transactions: ${stats.totalTransactions.toLocaleString()}\n  Buy Orders:         ${stats.totalBuys.toLocaleString()}\n  Sell Orders:        ${stats.totalSells.toLocaleString()}\n  Total Buy Amount:   ${formatCurrency(stats.totalBuyAmount)}\n  Total Sell Amount:  ${formatCurrency(stats.totalSellAmount)}\n  Net Amount:         ${formatCurrency(stats.netAmount)}\n  Realized Gain:      ${formatCurrency(stats.realizedGain)}\n`;
}

async function getHoldingsText() {
    // Get share counts from transactions (for debugging)
    const holdings = calculateHoldings(
        transactionState.allTransactions,
        transactionState.splitHistory
    );

    // Get authoritative cost basis from holdings_details.json
    let holdingsDetails = {};
    try {
        const response = await fetch('../data/holdings_details.json');
        holdingsDetails = await response.json();
    } catch {
        // console.warn(
        //     'Could not load holdings_details.json, falling back to transaction-based calculation'
        // );
    }

    const activeHoldings = Object.entries(holdings).filter(
        ([, data]) => Math.abs(data.shares) > 0.001
    );
    if (activeHoldings.length === 0) {
        return 'No current holdings.';
    }

    let table = '  Security        | Shares         | Avg Price      | Total Cost     \n';
    table += '  ----------------|----------------|----------------|----------------\n';
    activeHoldings
        .sort((a, b) => {
            // Sort by total cost, using authoritative data if available
            const aCost = holdingsDetails[a[0]]
                ? parseFloat(holdingsDetails[a[0]].shares) *
                  parseFloat(holdingsDetails[a[0]].average_price)
                : b[1].totalCost;
            const bCost = holdingsDetails[b[0]]
                ? parseFloat(holdingsDetails[b[0]].shares) *
                  parseFloat(holdingsDetails[b[0]].average_price)
                : b[1].totalCost;
            return bCost - aCost;
        })
        .forEach(([security, data]) => {
            const isNegative = data.shares < 0;
            const sec = `  ${security}${isNegative ? ' ⚠️' : ''}`.padEnd(17);

            // Use transaction-based shares for debugging (normalized to 2 decimal places)
            const shares = data.shares
                .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                .padStart(14);

            // Use authoritative cost basis if available, otherwise fall back to transaction calculation
            let avgPrice, totalCost;
            if (holdingsDetails[security]) {
                avgPrice = parseFloat(holdingsDetails[security].average_price);
                totalCost = parseFloat(holdingsDetails[security].shares) * avgPrice;
            } else {
                avgPrice = data.avgPrice;
                totalCost = data.totalCost;
            }

            const avgPriceStr = `$${avgPrice.toFixed(2)}`.padStart(14);
            const totalCostStr = formatCurrency(totalCost).padStart(14);
            table += `${sec} | ${shares} | ${avgPriceStr} | ${totalCostStr}\n`;
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

    // Calculate the total width of the data rows to match the header
    const yearColumnWidth = 8;
    const seriesColumnWidth = 12;
    const totalDataWidth = yearColumnWidth + orderedSeries.length * seriesColumnWidth;
    const headerWidth = Math.max(55, totalDataWidth); // Ensure minimum width of 55

    const header =
        '\n' +
        '-'.repeat(headerWidth) +
        '\n' +
        '  ANNUAL RETURNS'.padStart(Math.floor(headerWidth / 2) + 8).padEnd(headerWidth) +
        '\n' +
        '-'.repeat(headerWidth) +
        '\n' +
        '  Year'.padEnd(yearColumnWidth) +
        orderedSeries.map((entry) => entry.name.padStart(seriesColumnWidth)).join('') +
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

function calculateBeta(portfolioReturns, benchmarkReturns) {
    if (
        !Array.isArray(portfolioReturns) ||
        !Array.isArray(benchmarkReturns) ||
        portfolioReturns.length !== benchmarkReturns.length ||
        portfolioReturns.length < 2
    ) {
        return null;
    }

    const n = portfolioReturns.length;
    const portfolioMean = portfolioReturns.reduce((sum, r) => sum + r, 0) / n;
    const benchmarkMean = benchmarkReturns.reduce((sum, r) => sum + r, 0) / n;

    let covariance = 0;
    let benchmarkVariance = 0;

    for (let i = 0; i < n; i++) {
        covariance += (portfolioReturns[i] - portfolioMean) * (benchmarkReturns[i] - benchmarkMean);
        benchmarkVariance += Math.pow(benchmarkReturns[i] - benchmarkMean, 2);
    }

    covariance /= n - 1;
    benchmarkVariance /= n - 1;

    if (benchmarkVariance === 0) {
        return null;
    }

    return covariance / benchmarkVariance;
}

function calculateTreynorRatio(meanReturn, beta, riskFreeRate = 0.053, periodsPerYear = 252) {
    if (!Number.isFinite(meanReturn) || !Number.isFinite(beta) || beta === 0) {
        return null;
    }
    // Annualize and convert to percentage points for calculation
    const annualizedReturn = meanReturn * periodsPerYear * 100;
    const riskFreeRatePercent = riskFreeRate * 100;
    return (annualizedReturn - riskFreeRatePercent) / beta;
}

function computeReturns(points, period = 'daily') {
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

    if (period === 'monthly') {
        const monthlyCloses = [];
        let currentKey = '';
        let lastPoint = null;

        sorted.forEach((point) => {
            const year = point.date.getUTCFullYear();
            const month = point.date.getUTCMonth();
            const key = `${year}-${month}`;
            if (currentKey !== '' && key !== currentKey && lastPoint) {
                monthlyCloses.push(lastPoint);
            }
            currentKey = key;
            lastPoint = point;
        });

        if (lastPoint) {
            monthlyCloses.push(lastPoint);
        }

        if (monthlyCloses.length < 2) {
            return [];
        }

        const monthlyReturns = [];
        for (let i = 1; i < monthlyCloses.length; i += 1) {
            const prevValue = monthlyCloses[i - 1].value;
            const currValue = monthlyCloses[i].value;
            if (prevValue > 0) {
                const monthlyReturn = (currValue - prevValue) / prevValue;
                if (Number.isFinite(monthlyReturn)) {
                    monthlyReturns.push({ date: monthlyCloses[i].date, value: monthlyReturn });
                }
            }
        }

        return monthlyReturns;
    }

    const returns = [];
    for (let i = 1; i < sorted.length; i += 1) {
        const prevValue = sorted[i - 1].value;
        const currValue = sorted[i].value;
        if (prevValue > 0) {
            const dailyReturn = (currValue - prevValue) / prevValue;
            if (Number.isFinite(dailyReturn)) {
                returns.push({ date: sorted[i].date, value: dailyReturn });
            }
        }
    }

    return returns;
}

const SYMBOL_ALIASES = {
    '^SSE': '^SSEC',
    '^SSEC': '^SSEC',
};

function normalizeSymbol(symbol) {
    return SYMBOL_ALIASES[symbol] || symbol;
}

function getMonthKey(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

async function convertHistoricalPricesToSeries(historicalPrices) {
    const seriesMap = {};

    Object.entries(historicalPrices).forEach(([symbol, prices]) => {
        const normalizedSymbol = normalizeSymbol(symbol);
        if (!ALLOWED_BENCHMARKS.has(normalizedSymbol) || !prices || typeof prices !== 'object') {
            return;
        }

        const points = Object.entries(prices)
            .map(([date, price]) => ({ date, value: Number(price) }))
            .filter((point) => Number.isFinite(point.value) && point.value > 0)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (points.length > 0) {
            seriesMap[normalizedSymbol] = points;
        }
    });

    return seriesMap;
}

async function getRatioText() {
    // Load raw historical prices for accurate beta calculations
    let historicalPrices = {};
    try {
        const response = await fetch('../data/historical_prices.json');
        if (response.ok) {
            historicalPrices = await response.json();
        }
    } catch {
        // Historical prices unavailable; proceed with existing performance series.
    }

    const fallbackSeries =
        transactionState.performanceSeries && typeof transactionState.performanceSeries === 'object'
            ? transactionState.performanceSeries
            : {};

    const rawSeries =
        Object.keys(historicalPrices).length > 0
            ? await convertHistoricalPricesToSeries(historicalPrices)
            : {};

    const seriesMap = {};
    Object.entries(fallbackSeries).forEach(([symbol, points]) => {
        if (Array.isArray(points) && points.length > 0) {
            const normalizedSymbol = normalizeSymbol(symbol);
            seriesMap[normalizedSymbol] = points;
        }
    });
    Object.entries(rawSeries).forEach(([symbol, points]) => {
        if (Array.isArray(points) && points.length > 0) {
            seriesMap[normalizeSymbol(symbol)] = points;
        }
    });

    const entries = Object.entries(seriesMap).filter(([name]) => {
        const normalized = normalizeSymbol(name);
        return ALLOWED_BENCHMARKS.has(normalized) || isPortfolioSymbol(normalized);
    });
    if (entries.length === 0) {
        return 'Risk ratios unavailable: no price data available.';
    }

    const dailyReturnsData = new Map(
        entries.map(([name, points]) => [name, computeReturns(points, 'daily')])
    );
    const monthlyReturnsData = new Map(
        entries.map(([name, points]) => [name, computeReturns(points, 'monthly')])
    );
    const benchmarkMonthlyReturns = monthlyReturnsData.get('^GSPC');
    const benchmarkMonthlyMap = benchmarkMonthlyReturns
        ? new Map(benchmarkMonthlyReturns.map((r) => [getMonthKey(r.date), r.value]))
        : null;

    const ratioData = entries
        .map(([name]) => {
            const portfolioReturnsData = dailyReturnsData.get(name) || [];
            const dailyReturns = portfolioReturnsData.map((r) => r.value);
            const sharpe = calculateSharpeRatio(dailyReturns);
            const sortino = calculateSortinoRatio(dailyReturns);

            let beta = null;
            let treynor = null;

            if (benchmarkMonthlyMap) {
                if (name === '^GSPC') {
                    beta = 1.0;
                    const monthlyReturns = monthlyReturnsData.get(name) || [];
                    if (monthlyReturns.length > 1) {
                        const meanMonthlyReturn =
                            monthlyReturns.reduce((sum, r) => sum + r.value, 0) /
                            monthlyReturns.length;
                        treynor = calculateTreynorRatio(meanMonthlyReturn, beta, 0.053, 12);
                    }
                } else {
                    const alignedPortfolioReturns = [];
                    const alignedBenchmarkReturns = [];
                    const monthlyReturns = monthlyReturnsData.get(name) || [];

                    monthlyReturns.forEach((r) => {
                        const monthKey = getMonthKey(r.date);
                        if (benchmarkMonthlyMap.has(monthKey)) {
                            alignedPortfolioReturns.push(r.value);
                            alignedBenchmarkReturns.push(benchmarkMonthlyMap.get(monthKey));
                        }
                    });

                    if (alignedPortfolioReturns.length > 1) {
                        beta = calculateBeta(alignedPortfolioReturns, alignedBenchmarkReturns);
                        const meanMonthlyReturn =
                            alignedPortfolioReturns.reduce((sum, r) => sum + r, 0) /
                            alignedPortfolioReturns.length;
                        treynor = calculateTreynorRatio(meanMonthlyReturn, beta, 0.053, 12);
                    }
                }
            }

            return {
                name,
                dailyReturns: dailyReturns.length,
                sharpe: sharpe !== null ? sharpe * Math.sqrt(252) : null, // Annualized
                sortino: sortino !== null ? sortino * Math.sqrt(252) : null, // Annualized
                treynor, // Already annualized
                beta,
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
        '\n  --------------------------------- RISK RATIOS --------------------------------------\n' +
        '  Series                         Sharpe Ratio   Sortino Ratio   Treynor Ratio     Beta  \n' +
        '  ----------------------------   ------------   -------------   -------------   ------\n';

    const lines = orderedData
        .map((item) => {
            const name = `  ${item.name}`.padEnd(30);
            const sharpe =
                item.sharpe !== null ? item.sharpe.toFixed(3).padStart(12) : 'N/A'.padStart(12);
            const sortino =
                item.sortino !== null ? item.sortino.toFixed(3).padStart(13) : 'N/A'.padStart(13);
            const treynor =
                item.treynor !== null ? item.treynor.toFixed(3).padStart(13) : 'N/A'.padStart(13);
            const beta = item.beta !== null ? item.beta.toFixed(3).padStart(6) : 'N/A'.padStart(6);
            return `${name}   ${sharpe}   ${sortino}   ${treynor}   ${beta}`;
        })
        .join('\n');

    const footer =
        '\n\n  Note: Ratios are annualized using 5.3% risk-free rate (3-month T-bill).\n' +
        '        Higher values indicate better risk-adjusted returns.\n\n' +
        '        - Sharpe Ratio: (Return - Risk-Free) / Volatility (Std. Dev. of returns)\n' +
        '        - Sortino Ratio: (Return - Risk-Free) / Downside Volatility\n' +
        '        - Treynor Ratio: (Return - Risk-Free) / Beta (vs ^GSPC)';

    return header + lines + footer + '\n';
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
                    chartManager.update(
                        transactionState.allTransactions,
                        transactionState.splitHistory
                    );
                }

                result = 'Showing all data (filters and date ranges cleared).';
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
                            result = getStatsText();
                            break;
                        case 'holdings':
                            result = await getHoldingsText();
                            break;
                        case 'cagr':
                            result = getCagrText();
                            break;
                        case 'return':
                            result = getAnnualReturnText();
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
                                    chartManager.update(
                                        transactionState.allTransactions,
                                        transactionState.splitHistory
                                    );
                                }
                                if (contributionTableContainer) {
                                    contributionTableContainer.classList.add('is-hidden');
                                }
                                result = `Showing contribution chart for ${formatDateRange(dateRange)}.`;
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
                                    chartManager.update(
                                        transactionState.allTransactions,
                                        transactionState.splitHistory
                                    );
                                }
                                if (perfTableContainer) {
                                    perfTableContainer.classList.add('is-hidden');
                                }
                                result = `Showing performance chart for ${formatDateRange(dateRange)}.`;
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
                                    chartManager.update(
                                        transactionState.allTransactions,
                                        transactionState.splitHistory
                                    );
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
