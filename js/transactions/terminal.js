import {
    transactionState,
    pushCommandHistory,
    resetHistoryIndex,
    setHistoryIndex,
    setChartDateRange,
    setActiveChart,
    setHistoricalPrices,
    getCompositionFilterTickers,
    getCompositionAssetClassFilter,
    setCompositionFilterTickers,
    setCompositionAssetClassFilter,
} from './state.js';
import { formatSummaryBlock, formatAppreciationBlock } from '@utils/formatting.js';
import {
    hasActiveTransactionFilters,
    buildContributionSeriesFromTransactions,
    buildFilteredBalanceSeries,
    buildFxChartSeries,
    PERFORMANCE_SERIES_CURRENCY,
    buildDrawdownSeries,
    getContributionSeriesForTransactions,
} from './chart.js';
import { loadCompositionSnapshotData } from './dataLoader.js';
import { cycleCurrency } from '@ui/currencyToggleManager.js';
import {
    getStatsText,
    getDynamicStatsText,
    getHoldingsText,
    getHoldingsDebugText,
    getCagrText,
    getAnnualReturnText,
    getRatioText,
    getDurationStatsText,
    getLifespanStatsText,
    getConcentrationText,
    getFinancialStatsText,
    getTechnicalStatsText,
} from './terminalStats.js';
import {
    parseYearFromDate,
    parseQuarterToken,
    resolveQuarterRange as computeQuarterRange,
    normalizeDateOnly,
} from '@utils/date.js';
import {
    formatCurrency as formatValueWithCurrency,
    convertBetweenCurrencies,
    convertValueToCurrency,
    formatCurrencyInline,
} from './utils.js';
import { getHoldingAssetClass } from '@js/config.js';
import { toggleZoom, getZoomState } from './zoom.js';
import { initFade, requestFadeUpdate, setFadePreserveSecondLast } from './fade.js';

let crosshairOverlay = null;
let crosshairDetails = null;
let crosshairTimeout = null;
const crosshairDateFormatter =
    typeof Intl !== 'undefined'
        ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
        : null;

let lastContextYear = null;

function formatWithSelectedCurrency(value) {
    return formatValueWithCurrency(value, { currency: transactionState.selectedCurrency || 'USD' });
}

function formatPercentInline(value) {
    if (!Number.isFinite(value)) {
        return '0%';
    }
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function updateContextYearFromRange(range) {
    if (!range) {
        return;
    }
    const year = parseYearFromDate(range.from) ?? parseYearFromDate(range.to);
    if (Number.isFinite(year)) {
        lastContextYear = year;
    }
}

const noopDebug = () => {};
const debugContext = noopDebug;

function getActiveRangeYear() {
    const { chartDateRange } = transactionState;
    if (!chartDateRange) {
        return null;
    }
    const fromYear = parseYearFromDate(chartDateRange.from);
    if (Number.isFinite(fromYear)) {
        return fromYear;
    }
    const toYear = parseYearFromDate(chartDateRange.to);
    return Number.isFinite(toYear) ? toYear : null;
}

function getDefaultYear() {
    const rangeYear = getActiveRangeYear();
    if (Number.isFinite(rangeYear)) {
        lastContextYear = rangeYear;
        return rangeYear;
    }
    if (Number.isFinite(lastContextYear)) {
        return lastContextYear;
    }
    const fallback = getEarliestDataYear();
    lastContextYear = fallback;
    return fallback;
}

function getEarliestDataYear() {
    const transactions = transactionState.allTransactions || [];
    let minYear = Infinity;

    transactions.forEach((txn) => {
        const year = parseYearFromDate(txn.tradeDate || txn.date);
        if (Number.isFinite(year)) {
            minYear = Math.min(minYear, year);
        }
    });

    if (!Number.isFinite(minYear)) {
        const runningSeries = transactionState.runningAmountSeries || [];
        runningSeries.forEach((item) => {
            const year = parseYearFromDate(item.tradeDate || item.date);
            if (Number.isFinite(year)) {
                minYear = Math.min(minYear, year);
            }
        });
    }

    if (!Number.isFinite(minYear)) {
        const portfolioSeries = transactionState.portfolioSeries || [];
        portfolioSeries.forEach((item) => {
            const year = parseYearFromDate(item.date);
            if (Number.isFinite(year)) {
                minYear = Math.min(minYear, year);
            }
        });
    }

    if (!Number.isFinite(minYear)) {
        const currentYear = new Date().getFullYear();
        return currentYear;
    }

    return minYear;
}

function resolveQuarterRange(year, quarter, mode = 'full') {
    if (Number.isFinite(year)) {
        lastContextYear = year;
    }
    return computeQuarterRange(year, quarter, mode);
}

function formatFxInline(value) {
    if (!Number.isFinite(value)) {
        return '–';
    }
    const absValue = Math.abs(value);
    if (absValue >= 100) {
        return value.toFixed(1);
    }
    if (absValue >= 10) {
        return value.toFixed(2);
    }
    if (absValue >= 1) {
        return value.toFixed(3);
    }
    return value.toFixed(4);
}

function getFxSnapshotLine() {
    if (transactionState.activeChart !== 'fx') {
        return null;
    }
    const baseCurrency = (transactionState.selectedCurrency || 'USD').toUpperCase();
    const seriesList = buildFxChartSeries(baseCurrency);
    if (!Array.isArray(seriesList) || seriesList.length === 0) {
        return null;
    }
    const visibility = transactionState.chartVisibility || {};
    const snapshots = [];
    seriesList.forEach((series) => {
        if (visibility[series.key] === false) {
            return;
        }
        const data = Array.isArray(series.data) ? series.data : [];
        if (data.length === 0) {
            return;
        }
        const latestPoint = data[data.length - 1];
        if (!latestPoint || !Number.isFinite(latestPoint.value)) {
            return;
        }
        snapshots.push(`${baseCurrency}/${series.quote} ${formatFxInline(latestPoint.value)}`);
    });
    if (!snapshots.length) {
        return null;
    }
    return `FX (${baseCurrency} base): ${snapshots.join('   ')}`;
}

function getDrawdownSnapshotLine({ includeHidden = false, isAbsolute = false } = {}) {
    const activeChart = transactionState.activeChart;
    // Allow when explicitly requested as absolute OR when chart is drawdownAbs
    const isAbsoluteMode = isAbsolute || activeChart === 'drawdownAbs';

    if (activeChart !== 'drawdown' && activeChart !== 'drawdownAbs') {
        return null;
    }

    const selectedCurrency = transactionState.selectedCurrency || 'USD';
    const { chartDateRange } = transactionState;
    const filterFrom = parseDateSafe(chartDateRange?.from);
    const filterTo = parseDateSafe(chartDateRange?.to);

    if (isAbsoluteMode) {
        // ABSOLUTE MODE: Use portfolioSeries (balance data)

        // --- DYNAMIC DRAWDOWN CALCULATION ---

        // Helper to consolidate data to end-of-day values and sort
        const consolidateAndSort = (data, dateKey, valueKey) => {
            const sorted = [...data].sort((a, b) => {
                const da = new Date(a[dateKey] || a.date);
                const db = new Date(b[dateKey] || b.date);
                return da - db;
            });

            // Consolidate by day (keep last value)
            const dailyMap = new Map();
            sorted.forEach((item) => {
                const d = new Date(item[dateKey] || item.date);
                if (Number.isNaN(d.getTime())) {
                    return;
                }
                const dayStr = d.toISOString().split('T')[0];
                dailyMap.set(dayStr, item);
            });

            return Array.from(dailyMap.values()).map((item) => ({
                date: new Date(item[dateKey] || item.date),
                value: Number(item[valueKey] || item.value),
            }));
        };

        // 1. Balance (Portfolio Series)
        // Use USD series if available to ensure we calculate drawdown on base currency
        const portfolioSeriesUSD =
            transactionState.portfolioSeriesByCurrency?.['USD'] ||
            transactionState.portfolioSeries ||
            [];

        if (portfolioSeriesUSD.length === 0) {
            return null;
        }

        // Ensure balance data is sorted and strictly daily (taking last value of day)
        const consolidatedBalance = consolidateAndSort(portfolioSeriesUSD, 'date', 'value');

        let runningPeak = -Infinity;
        // Calculate drawdown in base currency (USD) first
        const balanceDrawdownDataUSD = consolidatedBalance.map((p) => {
            const val = p.value;
            if (val > runningPeak) {
                runningPeak = val;
            }
            return { date: p.date, value: val - runningPeak };
        });

        const balanceDrawdownData = balanceDrawdownDataUSD.map((p) => ({
            date: p.date,
            value: convertValueToCurrency(p.value, p.date, selectedCurrency),
        }));

        // 2. Contribution (Running Amount Series)
        // Re-calculate using the chart's logic to ensure consistency and proper daily consolidation
        const filtersActive =
            hasActiveTransactionFilters() &&
            transactionState.activeFilterTerm &&
            transactionState.activeFilterTerm.trim().length > 0;
        const contributionTransactions = filtersActive
            ? transactionState.filteredTransactions
            : transactionState.allTransactions;

        // Use the chart's generator which handles daily consolidation and currency conversion (if needed)
        // We request 'USD' to calculate drawdown in base currency
        const calculatedContributionSeries = getContributionSeriesForTransactions(
            contributionTransactions,
            {
                includeSyntheticStart: true,
                padToDate: Date.now(), // Pad to now for consistent end
                currency: 'USD',
            }
        );

        // The series returned by chart.js is already daily consolidated.
        // We just need to ensure it's sorted by date for the drawdown calc.
        const consolidatedContribution = consolidateAndSort(
            calculatedContributionSeries,
            'tradeDate', // buildContributionSeriesFromTransactions returns 'tradeDate' property
            'amount' // and 'amount' property
        );

        let contribPeak = -Infinity;
        // Calculate drawdown in base currency (USD) first
        const contributionDrawdownDataUSD = consolidatedContribution.map((p) => {
            const val = p.value; // value is amount from consolidateAndSort
            if (val > contribPeak) {
                contribPeak = val;
            }
            return { date: p.date, value: val - contribPeak };
        });

        const contributionDrawdownData = contributionDrawdownDataUSD.map((p) => ({
            date: p.date,
            value: convertValueToCurrency(p.value, p.date, selectedCurrency),
        }));

        // Filter by date range
        const relevantBalance = balanceDrawdownData.filter(
            (p) => (!filterFrom || p.date >= filterFrom) && (!filterTo || p.date <= filterTo)
        );
        const relevantContribution = contributionDrawdownData.filter(
            (p) => (!filterFrom || p.date >= filterFrom) && (!filterTo || p.date <= filterTo)
        );

        if (relevantBalance.length === 0 && relevantContribution.length === 0) {
            return null;
        }

        const getStats = (points) => {
            if (points.length === 0) {
                return { current: 0, max: 0 };
            }
            const current = points[points.length - 1].value;
            let min = 0;
            for (const p of points) {
                if (p.value < min) {
                    min = p.value;
                }
            }
            return { current, max: min };
        };

        const balanceStats = getStats(relevantBalance);
        const contribStats = getStats(relevantContribution);

        const balCur = formatCurrencyInline(balanceStats.current);
        const balMax = formatCurrencyInline(balanceStats.max);
        const conCur = formatCurrencyInline(contribStats.current);
        const conMax = formatCurrencyInline(contribStats.max);

        const header = `Absolute Drawdown (base ${selectedCurrency}):`;
        const hint = "(Hint: use 'per' for percentages)";

        const balanceLine = `Balance      ${balCur} (Max: ${balMax})`;
        const contribLine = `Contribution ${conCur} (Max: ${conMax})`;

        return `${header}\n${balanceLine}\n${contribLine}\n${hint}`;
    }

    // PERCENTAGE MODE: Use performanceSeries
    const performanceSeries = transactionState.performanceSeries || {};
    const seriesKeys = Object.keys(performanceSeries);
    if (seriesKeys.length === 0) {
        return null;
    }
    const visibility = transactionState.chartVisibility || {};

    const orderedKeys = [...seriesKeys].sort((a, b) => {
        if (a === '^LZ') {
            return -1;
        }
        if (b === '^LZ') {
            return 1;
        }
        return a.localeCompare(b);
    });

    const snapshots = [];
    for (const key of orderedKeys) {
        if (!includeHidden && visibility[key] === false) {
            continue;
        }
        const rawPoints = Array.isArray(performanceSeries[key]) ? performanceSeries[key] : [];
        if (rawPoints.length === 0) {
            continue;
        }

        const sourceCurrency = PERFORMANCE_SERIES_CURRENCY[key] || 'USD';
        const convertedPoints = [];
        for (const point of rawPoints) {
            const dateObj = parseDateSafe(point.date);
            if (!dateObj) {
                continue;
            }
            const convertedValue = convertBetweenCurrencies(
                point.value,
                sourceCurrency,
                point.date,
                selectedCurrency
            );
            if (Number.isFinite(convertedValue)) {
                convertedPoints.push({ date: dateObj, value: convertedValue });
            }
        }

        if (convertedPoints.length === 0) {
            continue;
        }

        const drawdownSeries = buildDrawdownSeries(convertedPoints);
        const relevantPoints = [];
        for (const p of drawdownSeries) {
            if ((!filterFrom || p.date >= filterFrom) && (!filterTo || p.date <= filterTo)) {
                relevantPoints.push(p);
            }
        }

        if (relevantPoints.length === 0) {
            continue;
        }

        const currentDrawdown = relevantPoints[relevantPoints.length - 1].value;
        let minDrawdown = 0;
        for (const p of relevantPoints) {
            if (p.value < minDrawdown) {
                minDrawdown = p.value;
            }
        }

        const currentFormatted = `${currentDrawdown.toFixed(2)}%`;
        const maxFormatted = `${minDrawdown.toFixed(2)}%`;
        snapshots.push(`${key} ${currentFormatted} (Max: ${maxFormatted})`);
    }

    if (!snapshots.length) {
        return null;
    }
    const header = `Drawdown (base ${selectedCurrency}):`;
    const lines = [];
    for (let i = 0; i < snapshots.length; i += 2) {
        lines.push(snapshots.slice(i, i + 2).join('   '));
    }
    const hint = "\n(Hint: use 'abs' for absolute values)";
    return `${header}\n${lines.join('\n')}${hint}`;
}

function parseDateSafe(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getPerformanceSnapshotLine({ includeHidden = false } = {}) {
    if (transactionState.activeChart !== 'performance') {
        return null;
    }
    const performanceSeries = transactionState.performanceSeries || {};
    const seriesKeys = Object.keys(performanceSeries);
    if (seriesKeys.length === 0) {
        return null;
    }
    const visibility = transactionState.chartVisibility || {};
    const { chartDateRange } = transactionState;
    const filterFrom = parseDateSafe(chartDateRange?.from);
    const filterTo = parseDateSafe(chartDateRange?.to);
    const selectedCurrency = transactionState.selectedCurrency || 'USD';

    const orderedKeys = [...seriesKeys].sort((a, b) => {
        if (a === '^LZ') {
            return -1;
        }
        if (b === '^LZ') {
            return 1;
        }
        return a.localeCompare(b);
    });

    const snapshots = [];
    const filterApplied = Boolean(filterFrom || filterTo);
    const showAllSeries = includeHidden || filterApplied;
    orderedKeys.forEach((key) => {
        if (!showAllSeries && visibility[key] === false) {
            return;
        }
        const rawPoints = Array.isArray(performanceSeries[key]) ? performanceSeries[key] : [];
        if (rawPoints.length === 0) {
            if (showAllSeries) {
                snapshots.push(`${key} –`);
            }
            return;
        }
        const sourceCurrency = PERFORMANCE_SERIES_CURRENCY[key] || 'USD';
        const normalizedPoints = rawPoints
            .map((point) => {
                const dateObj = parseDateSafe(point.date);
                if (!dateObj) {
                    return null;
                }
                const convertedValue = convertBetweenCurrencies(
                    point.value,
                    sourceCurrency,
                    point.date,
                    selectedCurrency
                );
                return {
                    date: dateObj,
                    value: Number.isFinite(convertedValue) ? convertedValue : null,
                };
            })
            .filter(
                (point) =>
                    point &&
                    Number.isFinite(point.value) &&
                    (!filterFrom || point.date >= filterFrom) &&
                    (!filterTo || point.date <= filterTo)
            )
            .sort((a, b) => a.date - b.date);

        if (normalizedPoints.length === 0) {
            if (showAllSeries) {
                snapshots.push(`${key} –`);
            }
            return;
        }
        const startValue = normalizedPoints[0].value;
        const endValue = normalizedPoints[normalizedPoints.length - 1].value;
        if (
            !Number.isFinite(startValue) ||
            Math.abs(startValue) < 1e-9 ||
            !Number.isFinite(endValue)
        ) {
            if (showAllSeries) {
                snapshots.push(`${key} –`);
            }
            return;
        }
        const percentChange = (endValue / startValue - 1) * 100;
        snapshots.push(`${key} ${formatPercentInline(percentChange)}`);
    });

    if (!snapshots.length) {
        return null;
    }
    const header = `Performance (base ${selectedCurrency}):`;
    const lines = [];
    for (let i = 0; i < snapshots.length; i += 4) {
        lines.push(snapshots.slice(i, i + 4).join('   '));
    }
    return `${header}\n${lines.join('\n')}`;
}

async function getCompositionSnapshotLine({ labelPrefix = 'Composition' } = {}) {
    if (
        transactionState.activeChart !== 'composition' &&
        transactionState.activeChart !== 'compositionAbs'
    ) {
        return null;
    }
    const data = await loadCompositionSnapshotData();
    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray(data.dates) ||
        data.dates.length === 0
    ) {
        return null;
    }

    const dates = data.dates;
    const { chartDateRange } = transactionState;
    const filterFrom = parseDateSafe(chartDateRange?.from);
    const filterTo = parseDateSafe(chartDateRange?.to);

    const filteredIndices = dates
        .map((dateStr, index) => {
            const date = parseDateSafe(dateStr);
            return { index, date };
        })
        .filter(
            ({ date }) =>
                date && (!filterFrom || date >= filterFrom) && (!filterTo || date <= filterTo)
        )
        .map(({ index }) => index);

    let targetIndex =
        filteredIndices.length > 0 ? filteredIndices[filteredIndices.length - 1] : dates.length - 1;
    if (!Number.isFinite(targetIndex) || targetIndex < 0) {
        targetIndex = dates.length - 1;
    }

    const totalValues = Array.isArray(data.total_values) ? data.total_values : [];
    const totalValueRaw = Number(totalValues[targetIndex] ?? 0) || 0;
    const dateLabel = dates[targetIndex];
    const selectedCurrency = transactionState.selectedCurrency || 'USD';

    const compositionSeries = data.composition || data.series || {};
    const holdings = [];
    Object.entries(compositionSeries).forEach(([ticker, values]) => {
        const seriesValues = Array.isArray(values) ? values : [];
        const percentage = Number(seriesValues[targetIndex] ?? 0);
        if (!Number.isFinite(percentage) || percentage <= 0) {
            return;
        }
        const baseValue = (totalValueRaw * percentage) / 100;
        const convertedValue = convertValueToCurrency(baseValue, dateLabel, selectedCurrency);
        holdings.push({
            ticker,
            percent: percentage,
            absolute: convertedValue,
        });
    });

    if (!holdings.length) {
        return null;
    }

    holdings.sort((a, b) => b.percent - a.percent);

    let displayHoldings = holdings;
    const filterTickers = getCompositionFilterTickers();
    if (Array.isArray(filterTickers) && filterTickers.length > 0) {
        const normalized = new Set(
            filterTickers.map((ticker) => (typeof ticker === 'string' ? ticker.toUpperCase() : ''))
        );
        const selected = holdings.filter((holding) => normalized.has(holding.ticker.toUpperCase()));
        if (selected.length > 0) {
            const remainder = holdings.filter(
                (holding) => !normalized.has(holding.ticker.toUpperCase())
            );
            if (remainder.length > 0) {
                const totalPercent = remainder.reduce((sum, item) => sum + item.percent, 0);
                const totalAbsolute = remainder.reduce((sum, item) => sum + item.absolute, 0);
                selected.push({
                    ticker: 'Others',
                    percent: totalPercent,
                    absolute: totalAbsolute,
                });
            }
            displayHoldings = selected;
        }
    } else {
        const assetClassFilter = getCompositionAssetClassFilter();
        if (assetClassFilter === 'etf' || assetClassFilter === 'stock') {
            const shouldMatchEtf = assetClassFilter === 'etf';
            const selected = holdings.filter((holding) => {
                if (holding.ticker && holding.ticker.toUpperCase() === 'OTHERS') {
                    return false;
                }
                const assetClass = getHoldingAssetClass(holding.ticker);
                return shouldMatchEtf ? assetClass === 'etf' : assetClass !== 'etf';
            });
            if (selected.length > 0) {
                const remainder = holdings.filter((holding) =>
                    shouldMatchEtf
                        ? getHoldingAssetClass(holding.ticker) !== 'etf'
                        : getHoldingAssetClass(holding.ticker) === 'etf'
                );
                if (remainder.length > 0) {
                    const totalPercent = remainder.reduce((sum, item) => sum + item.percent, 0);
                    const totalAbsolute = remainder.reduce((sum, item) => sum + item.absolute, 0);
                    selected.push({
                        ticker: 'Others',
                        percent: totalPercent,
                        absolute: totalAbsolute,
                    });
                }
                displayHoldings = selected;
            }
        }
    }

    const formatted = displayHoldings
        .filter((holding) => Number.isFinite(holding.percent) && holding.percent > 0.1)
        .map((holding) => {
            const label = holding.ticker === 'BRKB' ? 'BRK-B' : holding.ticker;
            const valueText = formatWithSelectedCurrency(holding.absolute);
            const percentText = `${holding.percent.toFixed(2)}%`;
            return `${label} ${valueText} (${percentText})`;
        });

    if (!formatted.length) {
        return null;
    }

    const lines = [];
    for (let i = 0; i < formatted.length; i += 3) {
        lines.push(formatted.slice(i, i + 3).join('   '));
    }

    let hint = '';
    if (labelPrefix === 'Composition') {
        hint = "\n(Hint: use 'abs' for absolute values)";
    } else if (labelPrefix === 'Composition Abs') {
        hint = "\n(Hint: use 'per' for percentages)";
    }

    return `${labelPrefix} (${dateLabel}):\n${lines.join('\n')}${hint}`;
}

async function getActiveChartSummaryText() {
    const activeChart = transactionState.activeChart;
    if (activeChart === 'composition') {
        return await getCompositionSnapshotLine();
    }
    if (activeChart === 'compositionAbs') {
        return await getCompositionSnapshotLine({ labelPrefix: 'Composition Abs' });
    }
    if (activeChart === 'performance') {
        return getPerformanceSnapshotLine({ includeHidden: true });
    }
    if (activeChart === 'fx') {
        return getFxSnapshotLine();
    }
    if (activeChart === 'contribution') {
        return await getContributionSummaryText(transactionState.chartDateRange);
    }
    if (activeChart === 'drawdown') {
        return getDrawdownSnapshotLine({ includeHidden: true });
    }
    if (activeChart === 'drawdownAbs') {
        return getDrawdownSnapshotLine({ includeHidden: true, isAbsolute: true });
    }
    return null;
}

function formatCrosshairDateLabel(time) {
    if (!Number.isFinite(time)) {
        return '';
    }
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    if (crosshairDateFormatter) {
        return crosshairDateFormatter.format(date);
    }
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function ensureCrosshairOverlay() {
    if (crosshairOverlay && crosshairDetails) {
        return { overlay: crosshairOverlay, details: crosshairDetails };
    }

    const terminalElement = document.getElementById('terminal');
    if (!terminalElement) {
        return { overlay: null, details: null };
    }

    let overlay = document.getElementById('terminalCrosshairOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'terminalCrosshairOverlay';
        overlay.className = 'terminal-crosshair-overlay';
        overlay.style.visibility = 'hidden';
        overlay.classList.remove('terminal-crosshair-active');
        overlay.innerHTML = `
            <div class="terminal-crosshair-panel">
                <div class="terminal-crosshair-header">
                    <span class="terminal-crosshair-date" id="terminalCrosshairDate"></span>
                </div>
                <div class="terminal-crosshair-body">
                    <div id="terminalCrosshairList" class="terminal-crosshair-list"></div>
                    <div id="terminalCrosshairRange" class="terminal-crosshair-range" hidden></div>
                </div>
            </div>
        `;
        terminalElement.appendChild(overlay);
    }

    const details = {
        date: overlay.querySelector('#terminalCrosshairDate'),
        list: overlay.querySelector('#terminalCrosshairList'),
        range: overlay.querySelector('#terminalCrosshairRange'),
    };

    crosshairOverlay = overlay;
    crosshairDetails = details;

    overlay.addEventListener('transitionend', () => {
        if (!overlay.classList.contains('terminal-crosshair-active')) {
            overlay.style.visibility = 'hidden';
        }
    });

    return { overlay, details };
}

export function updateTerminalCrosshair(snapshot, rangeSummary) {
    const { overlay, details } = ensureCrosshairOverlay();
    if (!overlay || !details) {
        return;
    }

    if (!snapshot) {
        overlay.classList.remove('terminal-crosshair-active');
        if (crosshairTimeout) {
            clearTimeout(crosshairTimeout);
        }
        crosshairTimeout = setTimeout(() => {
            overlay.style.visibility = 'hidden';
        }, 160);
        return;
    }

    if (crosshairTimeout) {
        clearTimeout(crosshairTimeout);
        crosshairTimeout = null;
    }

    overlay.style.visibility = 'visible';
    requestAnimationFrame(() => overlay.classList.add('terminal-crosshair-active'));

    if (details.date) {
        details.date.textContent = snapshot.label || '';
    }

    if (details.list) {
        const markup = snapshot.series
            .map(
                (series) => `
                <div class="terminal-crosshair-row">
                    <span class="terminal-crosshair-key">
                        <span class="terminal-crosshair-dot" style="background:${series.color};"></span>
                        ${series.label}
                    </span>
                    <span class="terminal-crosshair-value">${series.formatted}</span>
                </div>
            `
            )
            .join('');
        details.list.innerHTML = markup;
    }

    if (details.range) {
        if (!rangeSummary) {
            details.range.hidden = true;
            details.range.innerHTML = '';
        } else {
            const durationLabel =
                rangeSummary.durationDays >= 1
                    ? `${Math.round(rangeSummary.durationDays)} day${
                          Math.round(rangeSummary.durationDays) === 1 ? '' : 's'
                      }`
                    : `${Math.max(1, Math.round(rangeSummary.durationMs / (1000 * 60 * 60)))} hrs`;
            const entriesMarkup = rangeSummary.entries
                .map(
                    (entry) => `
                        <div class="terminal-crosshair-range-row">
                            <span class="terminal-crosshair-key">
                                <span class="terminal-crosshair-dot" style="background:${entry.color};"></span>
                                ${entry.label}
                            </span>
                            <span class="terminal-crosshair-value">${entry.deltaFormatted}${
                                entry.percentFormatted ? ` (${entry.percentFormatted})` : ''
                            }</span>
                        </div>
                    `
                )
                .join('');
            const startLabel = formatCrosshairDateLabel(rangeSummary.start);
            const endLabel = formatCrosshairDateLabel(rangeSummary.end);
            details.range.innerHTML = `
                <div class="terminal-crosshair-range-header">${startLabel} → ${endLabel} · ${durationLabel}</div>
                ${entriesMarkup ? `<div class="terminal-crosshair-range-body">${entriesMarkup}</div>` : ''}
            `;
            details.range.hidden = false;
        }
    }
}

let lastEmptyFilterTerm = null;
const COMMAND_ALIASES = [
    'help',
    'h',
    'label',
    'l',
    'reset',
    'clear',
    'all',
    'alltime',
    'allstock',
    'stats',
    's',
    'transaction',
    't',
    'plot',
    'p',
    'abs',
    'absolute',
    'a',
    'percentage',
    'percent',
    'per',
    'stock',
    'etf',
    'from', // For simplified commands
    'to', // For simplified commands
    'zoom',
    'z',
    'summary',
];

const STATS_SUBCOMMANDS = [
    'transactions',
    'holdings',
    'holdings-debug',
    'financial',
    'technical',
    'duration',
    'lifespan',
    'concentration',
    'cagr',
    'return',
    'ratio',
];

const PLOT_SUBCOMMANDS = [
    'balance',
    'performance',
    'composition',
    'composition-abs',
    'fx',
    'drawdown',
];

const HELP_SUBCOMMANDS = ['filter'];

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
            transactionState.filteredTransactions || [],
            { includeSyntheticStart: true }
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
        // Apply currency conversion if not USD
        const selectedCurrency = transactionState.selectedCurrency || 'USD';
        if (selectedCurrency !== 'USD' && Array.isArray(balanceSource)) {
            balanceSource = balanceSource.map((entry) => ({
                ...entry,
                value: convertValueToCurrency(entry.value, entry.date, selectedCurrency),
            }));
        }
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
        formatSummaryBlock('Contribution', contributionSummary, dateRange, {
            formatValue: formatWithSelectedCurrency,
        }),
        formatSummaryBlock('Balance', balanceSummary, dateRange, {
            formatValue: formatWithSelectedCurrency,
        }),
        formatAppreciationBlock(balanceSummary, contributionSummary, {
            formatValue: formatWithSelectedCurrency,
        }),
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
    onCommandExecuted,
}) {
    const terminalInput = document.getElementById('terminalInput');
    const terminal = document.getElementById('terminal');
    const outputContainer = document.getElementById('terminalOutput');

    function appendMessage(message) {
        if (!outputContainer) {
            return;
        }
        const pre = document.createElement('pre');
        pre.textContent = message;
        outputContainer.appendChild(pre);
        outputContainer.scrollTop = outputContainer.scrollHeight;
        requestFadeUpdate(outputContainer);
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
                const subPrefixRaw = parts.slice(1).join(' ').toLowerCase();
                const normalizedSubPrefix = subPrefixRaw.replace(/\s+/g, '-');
                matches = normalizedSubPrefix
                    ? PLOT_SUBCOMMANDS.filter((cmd) => cmd.startsWith(normalizedSubPrefix))
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

        setFadePreserveSecondLast(false);

        switch (cmd.toLowerCase()) {
            case 'h':
            case 'help':
                if (args.length === 0) {
                    // Show main help
                    result =
                        'Available commands:\n' +
                        '  stats (s)          - Statistics commands\n' +
                        '                       Use "stats" or "s" for subcommands\n' +
                        '                       Subcommands: transactions, holdings, financial, technical, duration, lifespan,\n' +
                        '                                    concentration, cagr, return, ratio\n' +
                        '                       Examples: stats lifespan, s cagr, stats concentration\n' +
                        '  plot (p)           - Chart commands\n' +
                        '                       Use "plot" or "p" for subcommands\n' +
                        '                       Subcommands: balance, performance, drawdown, composition, composition-abs, fx\n' +
                        '                       Examples: plot balance, p performance, plot drawdown, plot composition 2023,\n' +
                        '                                 plot composition abs 2023, plot fx\n' +
                        '  transaction (t)    - Toggle the transaction table visibility\n' +
                        '  zoom (z)           - Toggle terminal zoom (expand to take over chart area)\n' +
                        '  summary            - Show summary of the currently active chart\n' +
                        '  all                - Show all data (remove filters and date ranges)\n' +
                        '  reset              - Restore full transaction list and show table/chart\n' +
                        '  clear              - Clear the terminal screen\n' +
                        '  help (h)           - Show this help message\n' +
                        '                       Use "help filter" for filter commands\n\n' +
                        'Hint: Press Tab to auto-complete command names and subcommands\n\n' +
                        'Any other input is treated as a filter for the transaction table\n' +
                        "When a chart is active, you can use simplified date commands like '2023', '2023q1', 'from:2023q2' (or 'f:2023q2'), '2022:2023'";
                } else {
                    const subcommand = args[0].toLowerCase();
                    switch (subcommand) {
                        case 'filter':
                            result =
                                'Usage: <filter>:<value>\n\nAvailable filters:\n  type     - Filter by order type (buy or sell).\n             Example: type:buy\n  security - Filter by security ticker.\n             Example: security:NVDA or s:NVDA\n  min      - Show transactions with a net amount greater than value.\n             Example: min:1000\n  max      - Show transactions with a net amount less than value.\n             Example: max:5000\n  stock    - Show individual stock positions (excludes ETFs/funds).\n             Example: stock\n  etf      - Show ETF/mutual fund positions (excludes individual stocks).\n             Example: etf\n  abs/a    - When composition chart is open, switch to absolute view.\n             Example: abs\n  per      - When absolute view is open, switch back to percentage view.\n             Example: per\n  alltime  - Clear chart date filters without touching other filters.\n             Example: alltime\n  allstock - Clear composition ticker filters (show all holdings).\n             Example: allstock\n\nDate filters (when chart is active):\n  from:YYYY or f:YYYY     - Filter from year (e.g., from:2022 or f:2022)\n  to:YYYY                 - Filter to year (e.g., to:2023)\n  YYYY:YYYY               - Filter year range (e.g., 2022:2023)\n  YYYYqN                  - Filter by quarter (e.g., 2023q1)\n  YYYYqN:YYYYqN           - Filter between two quarters (e.g., 2022q1:2023q2)\n  from:YYYYqN or f:YYYYqN - Filter from quarter (e.g., from:2022q3)\n  qN                      - Quarter of the current range (e.g., q2)\n  from:qN or f:qN         - From the start of that quarter (e.g., f:q3)\n  to:qN                   - To the end of that quarter (e.g., to:q4)\n\nChart label toggle:\n  label (l)               - Toggle chart labels (start/end annotations, FX/composition hover panels).\n                            Example: label\n\nAny text not part of a command is used for a general text search.';
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
                updateContextYearFromRange({ from: null, to: null });
                filterAndSort(''); // Clear all filters

                // Update chart if it's currently visible
                if (
                    transactionState.activeChart === 'contribution' ||
                    transactionState.activeChart === 'performance'
                ) {
                    chartManager.update();
                }

                result = 'Showing all data (filters and date ranges cleared).';

                if (isTransactionTableVisible()) {
                    const statsText = await getDynamicStatsText(
                        transactionState.selectedCurrency || 'USD'
                    );
                    if (statsText) {
                        result += statsText.startsWith('\n') ? statsText : `\n${statsText}`;
                    }
                } else {
                    const summaryText = await getActiveChartSummaryText();
                    if (summaryText) {
                        result += `\n${summaryText}`;
                    }
                }

                const fxSnapshot = getFxSnapshotLine();
                if (fxSnapshot) {
                    result += `\n${fxSnapshot}`;
                }
                break;
            case 'alltime': {
                setChartDateRange({ from: null, to: null });
                updateContextYearFromRange({ from: null, to: null });
                filterAndSort(transactionState.activeFilterTerm || '');
                if (
                    isActiveChartVisible() &&
                    chartManager &&
                    typeof chartManager.update === 'function'
                ) {
                    chartManager.update();
                }
                result = 'Cleared chart date filters.';

                if (isTransactionTableVisible()) {
                    const statsText = await getDynamicStatsText(
                        transactionState.selectedCurrency || 'USD'
                    );
                    if (statsText) {
                        result += statsText.startsWith('\n') ? statsText : `\n${statsText}`;
                    }
                } else {
                    const summaryText = await getActiveChartSummaryText();
                    if (summaryText) {
                        result += `\n${summaryText}`;
                    }
                }
                break;
            }
            case 'allstock': {
                const currentTerm = transactionState.activeFilterTerm || '';
                const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const activeTickers = transactionState.compositionFilterTickers || [];
                let cleanedTerm = currentTerm
                    .replace(/^\s*(stock|etf)\s*:?/gi, ' ')
                    .replace(/\b(stock|etf)\b/gi, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                activeTickers.forEach((ticker) => {
                    const escaped = escapeRegExp(ticker);
                    const tickerRegex = new RegExp(`\\b${escaped}\\b`, 'gi');
                    const securityRegex = new RegExp(`\\bsecurity:${escaped}\\b`, 'gi');
                    const shorthandRegex = new RegExp(`\\bs:${escaped}\\b`, 'gi');
                    cleanedTerm = cleanedTerm
                        .replace(tickerRegex, ' ')
                        .replace(securityRegex, ' ')
                        .replace(shorthandRegex, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                });
                if (terminalInput) {
                    terminalInput.value = cleanedTerm;
                }
                setCompositionFilterTickers([]);
                setCompositionAssetClassFilter(null);
                filterAndSort(cleanedTerm);
                if (
                    isActiveChartVisible() &&
                    chartManager &&
                    typeof chartManager.update === 'function'
                ) {
                    chartManager.update();
                }
                result = 'Cleared composition ticker filters.';

                if (isTransactionTableVisible()) {
                    const statsText = await getDynamicStatsText(
                        transactionState.selectedCurrency || 'USD'
                    );
                    if (statsText) {
                        result += statsText.startsWith('\n') ? statsText : `\n${statsText}`;
                    }
                } else {
                    const summary = await getActiveChartSummaryText();
                    if (summary) {
                        result += `\n${summary}`;
                    }
                }
                break;
            }
            case 'reset':
                closeAllFilterDropdowns();
                resetSortState();
                setChartDateRange({ from: null, to: null }); // Reset date range
                updateContextYearFromRange({ from: null, to: null });
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
                updateContextYearFromRange({ from: null, to: null });
                if (terminalInput) {
                    terminalInput.value = '';
                }
                filterAndSort('');
                document
                    .querySelectorAll('.table-responsive-container, #runningAmountSection')
                    .forEach((el) => el.classList.add('is-hidden'));
                requestFadeUpdate();
                break;
            case 'zoom':
            case 'z': {
                setFadePreserveSecondLast(true);
                const zoomResult = await toggleZoom();
                result = zoomResult.message;
                break;
            }
            case 'stats':
            case 's':
                if (args.length === 0) {
                    // Show stats help
                    result =
                        'Stats commands:\n' +
                        '  stats transactions  - Show transaction statistics\n' +
                        '  stats holdings      - Show current holdings\n' +
                        '  stats financial     - Show market data for current holdings\n' +
                        '  stats technical     - Show technical indicators (price, ranges, averages)\n' +
                        '  stats duration      - Show value-weighted holding ages\n' +
                        '  stats lifespan      - Show holding lifespans for open and closed tickers\n' +
                        '  stats concentration - Show Herfindahl concentration & effective holdings\n' +
                        '  stats cagr          - Show CAGR based on TWRR series\n' +
                        '  stats return        - Show annual returns for portfolio and benchmarks\n' +
                        '  stats ratio         - Show Sharpe and Sortino ratios\n' +
                        '\nUsage: stats <subcommand> or s <subcommand>';
                } else {
                    const subcommand = args[0].toLowerCase();
                    switch (subcommand) {
                        case 'transactions':
                            result = await getStatsText(transactionState.selectedCurrency || 'USD');
                            break;
                        case 'holdings':
                            result = await getHoldingsText(
                                transactionState.selectedCurrency || 'USD'
                            );
                            break;
                        case 'holdings-debug':
                            result = await getHoldingsDebugText();
                            break;
                        case 'financial':
                            result = await getFinancialStatsText();
                            break;
                        case 'technical':
                            result = await getTechnicalStatsText();
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
                        case 'duration':
                            result = await getDurationStatsText();
                            break;
                        case 'lifespan':
                            result = await getLifespanStatsText();
                            break;
                        case 'concentration':
                            result = await getConcentrationText();
                            break;
                        default:
                            result = `Unknown stats subcommand: ${subcommand}\nAvailable: ${STATS_SUBCOMMANDS.join(', ')}`;
                            break;
                    }
                }
                break;
            case 'label':
            case 'l': {
                const nextState = !(transactionState.showChartLabels === false);
                transactionState.showChartLabels = !nextState;
                result = `Chart labels are now ${transactionState.showChartLabels ? 'visible' : 'hidden'}.`;
                if (chartManager && typeof chartManager.redraw === 'function') {
                    chartManager.redraw();
                }
                break;
            }
            case 't':
            case 'transaction':
                // Auto-unzoom if zoomed
                if (getZoomState()) {
                    await toggleZoom();
                }

                if (args.length === 0) {
                    toggleTable();
                    result = 'Toggled transaction table visibility.';
                } else {
                    ensureTransactionTableVisible();
                    const trailingInput = args.join(' ').trim();
                    if (trailingInput) {
                        const rangeCandidate = parseSimplifiedDateRange(trailingInput);
                        if (rangeCandidate.from || rangeCandidate.to) {
                            const dateResult = await applyDateFilterRange(rangeCandidate);
                            if (dateResult) {
                                result = dateResult;
                            }
                        } else {
                            filterAndSort(trailingInput);
                            const summary = await getActiveChartSummaryText();
                            result = `Filtering transactions by: "${trailingInput}"...`;
                            if (summary) {
                                result += `\n${summary}`;
                            }
                        }
                    } else {
                        result = 'Showing transaction table.';
                    }
                }

                if (isTransactionTableVisible() && result) {
                    const statsText = await getDynamicStatsText(
                        transactionState.selectedCurrency || 'USD'
                    );
                    if (statsText) {
                        // Ensure readable separation
                        result += statsText.startsWith('\n') ? statsText : `\n${statsText}`;
                    }
                }
                break;
            case 'p':
            case 'plot':
                if (args.length === 0) {
                    // Show plot help
                    result =
                        'Plot commands:\n  plot balance         - Show contribution/balance chart\n  plot performance     - Show TWRR performance chart\n  plot drawdown        - Show underwater drawdown chart (percentage)\n  plot drawdown abs    - Show drawdown chart with absolute values\n  plot composition     - Show portfolio composition chart (percent view)\n  plot composition abs - Show composition chart with absolute values\n  plot fx              - Show FX rate chart for the selected base currency\n\nUsage: plot <subcommand> or p <subcommand>\n  balance      [year|quarter|qN] | [from <...>] | [<...> to <...>]\n  performance  [year|quarter|qN] | [from <...>] | [<...> to <...>]\n  drawdown     [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n  composition  [abs] [year|quarter|qN] | [from <...>] | [<...> to <...>]\n  fx           [year|quarter|qN] | [from <...>] | [<...> to <...>]\n\nExamples:\n       plot balance 2023            - Show data for entire year 2023\n       plot performance q1          - Show performance chart for Q1 of current context\n       plot drawdown abs            - Show absolute drawdown chart\n       plot composition from 2022q3 - Percent composition from Q3 2022 onward\n       plot composition abs 2023    - Absolute composition for 2023\n       plot fx                      - Show FX chart for current currency toggle';
                } else {
                    // Auto-unzoom if zoomed
                    if (getZoomState()) {
                        await toggleZoom();
                    }

                    const subcommand = args[0].toLowerCase();
                    const rawArgs = args.slice(1);
                    const getExistingChartRange = () => {
                        const current = transactionState.chartDateRange || {};
                        return {
                            from: current.from || null,
                            to: current.to || null,
                        };
                    };
                    const applyDateArgs = (tokens) => {
                        const normalizedTokens = tokens
                            .map((token) => (typeof token === 'string' ? token.trim() : ''))
                            .filter((token) => token.length > 0);

                        if (normalizedTokens.length === 0) {
                            // Keep current range if one is already applied when simply switching charts.
                            const existing = getExistingChartRange();
                            return existing;
                        }

                        if (normalizedTokens.length === 1) {
                            const token = normalizedTokens[0].toLowerCase();
                            if (token === 'all' || token === 'reset' || token === 'clear') {
                                const clearedRange = { from: null, to: null };
                                setChartDateRange(clearedRange);
                                updateContextYearFromRange(clearedRange);
                                return clearedRange;
                            }
                        }

                        const range = parseDateRange(normalizedTokens);
                        if (!range.from && !range.to) {
                            return getExistingChartRange();
                        }
                        setChartDateRange(range);
                        updateContextYearFromRange(range);
                        return range;
                    };

                    switch (subcommand) {
                        case 'balance':
                            dateRange = applyDateArgs(rawArgs);
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
                            dateRange = applyDateArgs(rawArgs);
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
                                const performanceSnapshot = getPerformanceSnapshotLine({
                                    includeHidden: true,
                                });
                                if (performanceSnapshot) {
                                    result += `\n\n${performanceSnapshot}`;
                                }
                            }
                            break;
                        case 'composition':
                        case 'composition-abs':
                        case 'compositionabs':
                        case 'compositionabsolute': {
                            let useAbsolute = subcommand !== 'composition';
                            let rangeTokens = [...rawArgs];
                            if (!useAbsolute && rangeTokens.length > 0) {
                                const maybeMode = rangeTokens[0].toLowerCase();
                                if (maybeMode === 'abs' || maybeMode === 'absolute') {
                                    useAbsolute = true;
                                    rangeTokens = rangeTokens.slice(1);
                                }
                            }
                            dateRange = applyDateArgs(rangeTokens);
                            const compSection = document.getElementById('runningAmountSection');
                            const compTableContainer = document.querySelector(
                                '.table-responsive-container'
                            );

                            // Check if composition chart is already active and visible
                            const targetChart = useAbsolute ? 'compositionAbs' : 'composition';
                            const isCompositionActive =
                                transactionState.activeChart === targetChart;
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
                                setActiveChart(targetChart);
                                if (compSection) {
                                    compSection.classList.remove('is-hidden');
                                    chartManager.update();
                                }
                                if (compTableContainer) {
                                    compTableContainer.classList.add('is-hidden');
                                }
                                result = `Showing composition${
                                    useAbsolute ? ' (absolute)' : ''
                                } chart for ${formatDateRange(dateRange)}.`;
                                const compositionSnapshot = await getCompositionSnapshotLine({
                                    labelPrefix: useAbsolute ? 'Composition Abs' : 'Composition',
                                });
                                if (compositionSnapshot) {
                                    result += `\n${compositionSnapshot}`;
                                }
                            }
                            break;
                        }
                        case 'fx':
                            dateRange = applyDateArgs(rawArgs);
                            const fxSection = document.getElementById('runningAmountSection');
                            const fxTableContainer = document.querySelector(
                                '.table-responsive-container'
                            );

                            const isFxActive = transactionState.activeChart === 'fx';
                            const isFxVisible =
                                fxSection && !fxSection.classList.contains('is-hidden');

                            if (isFxActive && isFxVisible) {
                                setActiveChart(null);
                                if (fxSection) {
                                    fxSection.classList.add('is-hidden');
                                }
                                result = 'Hidden FX chart.';
                            } else {
                                setActiveChart('fx');
                                if (fxSection) {
                                    fxSection.classList.remove('is-hidden');
                                    chartManager.update();
                                }
                                if (fxTableContainer) {
                                    fxTableContainer.classList.add('is-hidden');
                                }
                                const baseCurrency = transactionState.selectedCurrency || 'USD';
                                result = `Showing FX chart (base ${baseCurrency}) for ${formatDateRange(
                                    dateRange
                                )}.`;
                                const fxSnapshot = getFxSnapshotLine();
                                if (fxSnapshot) {
                                    result += `\n${fxSnapshot}`;
                                }
                            }
                            break;
                        case 'drawdown': {
                            // Check for abs argument
                            const useAbsolute = rawArgs.some(
                                (arg) =>
                                    arg.toLowerCase() === 'abs' || arg.toLowerCase() === 'absolute'
                            );
                            const filteredArgs = rawArgs.filter(
                                (arg) =>
                                    arg.toLowerCase() !== 'abs' && arg.toLowerCase() !== 'absolute'
                            );
                            dateRange = applyDateArgs(filteredArgs);

                            const drawdownSection = document.getElementById('runningAmountSection');
                            const drawdownTableContainer = document.querySelector(
                                '.table-responsive-container'
                            );

                            const targetChart = useAbsolute ? 'drawdownAbs' : 'drawdown';
                            const isDrawdownActive =
                                transactionState.activeChart === 'drawdown' ||
                                transactionState.activeChart === 'drawdownAbs';
                            const isDrawdownVisible =
                                drawdownSection && !drawdownSection.classList.contains('is-hidden');

                            if (
                                isDrawdownActive &&
                                isDrawdownVisible &&
                                !useAbsolute &&
                                transactionState.activeChart === 'drawdown'
                            ) {
                                // Toggle off only if same mode
                                setActiveChart(null);
                                if (drawdownSection) {
                                    drawdownSection.classList.add('is-hidden');
                                }
                                result = 'Hidden drawdown chart.';
                            } else {
                                setActiveChart(targetChart);
                                if (drawdownSection) {
                                    drawdownSection.classList.remove('is-hidden');
                                    chartManager.update();
                                }
                                if (drawdownTableContainer) {
                                    drawdownTableContainer.classList.add('is-hidden');
                                }
                                const modeLabel = useAbsolute ? ' (absolute)' : '';
                                result = `Showing drawdown${modeLabel} chart for ${formatDateRange(dateRange)}.`;
                                const drawdownSnapshot = getDrawdownSnapshotLine({
                                    includeHidden: true,
                                    isAbsolute: useAbsolute,
                                });
                                if (drawdownSnapshot) {
                                    result += `\n${drawdownSnapshot}`;
                                }
                            }
                            break;
                        }
                        default:
                            result = `Unknown plot subcommand: ${subcommand}\nAvailable: ${PLOT_SUBCOMMANDS.join(', ')}`;
                            break;
                    }
                }
                break;
            case 'abs':
            case 'absolute':
            case 'a': {
                const chartSection = document.getElementById('runningAmountSection');
                const isChartVisible =
                    chartSection && !chartSection.classList.contains('is-hidden');
                const activeChart = transactionState.activeChart;

                // Check if it's a composition chart
                if (activeChart === 'composition' || activeChart === 'compositionAbs') {
                    if (!isChartVisible) {
                        result = 'Composition chart must be active. Use `plot composition` first.';
                        break;
                    }
                    if (activeChart === 'compositionAbs') {
                        result = 'Composition chart is already showing absolute values.';
                        break;
                    }
                    setActiveChart('compositionAbs');
                    if (chartManager && typeof chartManager.update === 'function') {
                        chartManager.update();
                    }
                    result = 'Switched composition chart to absolute view.';
                    {
                        const summary = await getCompositionSnapshotLine({
                            labelPrefix: 'Composition Abs',
                        });
                        if (summary) {
                            result += `\n${summary}`;
                        }
                    }
                    break;
                }

                // Check if it's a drawdown chart
                if (activeChart === 'drawdown' || activeChart === 'drawdownAbs') {
                    if (!isChartVisible) {
                        result = 'Drawdown chart must be active. Use `plot drawdown` first.';
                        break;
                    }
                    if (activeChart === 'drawdownAbs') {
                        result = 'Drawdown chart is already showing absolute values.';
                        break;
                    }
                    setActiveChart('drawdownAbs');
                    if (chartManager && typeof chartManager.update === 'function') {
                        chartManager.update();
                    }
                    result = 'Switched drawdown chart to absolute view.';
                    {
                        const summary = getDrawdownSnapshotLine({
                            includeHidden: true,
                            isAbsolute: true,
                        });
                        if (summary) {
                            result += `\n${summary}`;
                        }
                    }
                    break;
                }

                // No matching chart active
                result =
                    'Composition or Drawdown chart must be active to switch views. Use `plot composition` or `plot drawdown` first.';
                break;
            }
            case 'percentage':
            case 'percent':
            case 'per': {
                const chartSection = document.getElementById('runningAmountSection');
                const isChartVisible =
                    chartSection && !chartSection.classList.contains('is-hidden');
                const activeChart = transactionState.activeChart;

                // Check if it's a composition chart
                if (activeChart === 'composition' || activeChart === 'compositionAbs') {
                    if (!isChartVisible) {
                        result = 'Composition chart must be active. Use `plot composition` first.';
                        break;
                    }
                    if (activeChart === 'composition') {
                        result = 'Composition chart is already showing percentages.';
                        break;
                    }
                    setActiveChart('composition');
                    if (chartManager && typeof chartManager.update === 'function') {
                        chartManager.update();
                    }
                    result = 'Switched composition chart to percentage view.';
                    {
                        const summary = await getCompositionSnapshotLine({
                            labelPrefix: 'Composition',
                        });
                        if (summary) {
                            result += `\n${summary}`;
                        }
                    }
                    break;
                }

                // Check if it's a drawdown chart
                if (activeChart === 'drawdown' || activeChart === 'drawdownAbs') {
                    if (!isChartVisible) {
                        result = 'Drawdown chart must be active. Use `plot drawdown` first.';
                        break;
                    }
                    if (activeChart === 'drawdown') {
                        result = 'Drawdown chart is already showing percentages.';
                        break;
                    }
                    setActiveChart('drawdown');
                    if (chartManager && typeof chartManager.update === 'function') {
                        chartManager.update();
                    }
                    result = 'Switched drawdown chart to percentage view.';
                    {
                        const summary = getDrawdownSnapshotLine({
                            includeHidden: true,
                            isAbsolute: false,
                        });
                        if (summary) {
                            result += `\n${summary}`;
                        }
                    }
                    break;
                }

                // No matching chart active
                result =
                    'Composition or Drawdown chart must be active to switch views. Use `plot composition` or `plot drawdown` first.';
                break;
            }
            case 'summary':
                {
                    let resultText = '';

                    if (isTransactionTableVisible()) {
                        const statsText = await getDynamicStatsText(
                            transactionState.selectedCurrency || 'USD'
                        );
                        if (statsText) {
                            resultText = statsText;
                        }
                    } else {
                        const chartSummary = await getActiveChartSummaryText();
                        if (chartSummary) {
                            resultText = chartSummary;
                        }
                    }

                    if (resultText) {
                        result = resultText;
                    } else {
                        result = 'No active chart or summary available.';
                    }
                }
                break;
            default: {
                const simplifiedDateRange = parseSimplifiedDateRange(command);
                if (simplifiedDateRange.from || simplifiedDateRange.to) {
                    const dateMessage = await applyDateFilterRange(simplifiedDateRange);
                    if (dateMessage) {
                        result = dateMessage;
                        if (isTransactionTableVisible()) {
                            const statsText = await getDynamicStatsText(
                                transactionState.selectedCurrency || 'USD'
                            );
                            if (statsText) {
                                result += statsText.startsWith('\n') ? statsText : `\n${statsText}`;
                            }
                        }
                        // applyDateFilterRange already appends chart summary if chart is visible, so we don't need to do it here.
                        break;
                    }
                }
                filterAndSort(command);
                if (isTransactionTableVisible()) {
                    const statsText = await getDynamicStatsText(
                        transactionState.selectedCurrency || 'USD'
                    );
                    if (statsText) {
                        result += statsText.startsWith('\n') ? statsText : `\n${statsText}`;
                    }
                } else {
                    const summaryText = await getActiveChartSummaryText();
                    if (summaryText) {
                        result += `\n${summaryText}`;
                    }
                }
                break;
            }
        }

        if (result) {
            const pre = document.createElement('pre');
            pre.textContent = result;
            outputContainer.appendChild(pre);
        }
        outputContainer.scrollTop = outputContainer.scrollHeight;
        requestFadeUpdate();

        if (typeof onCommandExecuted === 'function') {
            onCommandExecuted();
        }
    }

    function parseSimplifiedDateRange(command) {
        const defaultYear = getDefaultYear();
        const parts = command.toLowerCase().split(':');
        if (parts.length === 1) {
            const quarterToken = parseQuarterToken(parts[0], defaultYear);
            if (quarterToken) {
                return resolveQuarterRange(quarterToken.year, quarterToken.quarter, 'full');
            }

            // Then check for year format (e.g., 2023)
            const year = parseInt(parts[0], 10);
            if (!isNaN(year)) {
                lastContextYear = year;
                return { from: `${year}-01-01`, to: `${year}-12-31` };
            }
        } else if (parts.length === 2) {
            const type = parts[0];
            const value = parts[1];
            if (type === 'from' || type === 'f') {
                const quarterToken = parseQuarterToken(value, defaultYear);
                if (quarterToken) {
                    return resolveQuarterRange(quarterToken.year, quarterToken.quarter, 'start');
                }

                // Then check for year format (e.g., f:2023)
                const year = parseInt(value, 10);
                if (!isNaN(year)) {
                    lastContextYear = year;
                    return { from: `${year}-01-01`, to: null };
                }
            } else if (type === 'to') {
                const quarterToken = parseQuarterToken(value, defaultYear);
                if (quarterToken) {
                    return resolveQuarterRange(quarterToken.year, quarterToken.quarter, 'end');
                }

                // Then check for year format (e.g., to:2023)
                const year = parseInt(value, 10);
                if (!isNaN(year)) {
                    lastContextYear = year;
                    return { from: null, to: `${year}-12-31` };
                }
            } else {
                // Check for year range format (e.g., 2020:2023)
                // Also check for quarter range format (e.g., 2020q1:2023q2)
                const quarterTokenStart = parseQuarterToken(type, defaultYear);
                const quarterTokenEnd = parseQuarterToken(value, defaultYear);
                if (quarterTokenStart && quarterTokenEnd) {
                    const startDate = resolveQuarterRange(
                        quarterTokenStart.year,
                        quarterTokenStart.quarter,
                        'full'
                    );
                    const endDate = resolveQuarterRange(
                        quarterTokenEnd.year,
                        quarterTokenEnd.quarter,
                        'full'
                    );
                    const start = new Date(startDate.from);
                    const end = new Date(endDate.to || endDate.from);
                    if (
                        !Number.isNaN(start.getTime()) &&
                        !Number.isNaN(end.getTime()) &&
                        start <= end
                    ) {
                        lastContextYear = quarterTokenStart.year;
                        return { from: startDate.from, to: endDate.to };
                    }
                }

                const year1 = parseInt(type, 10);
                const year2 = parseInt(value, 10);
                if (!isNaN(year1) && !isNaN(year2) && year1 <= year2) {
                    lastContextYear = year1;
                    return { from: `${year1}-01-01`, to: `${year2}-12-31` };
                }
            }
        }
        return { from: null, to: null };
    }

    function ensureTransactionTableVisible() {
        const tableContainer = document.querySelector('.table-responsive-container');
        if (tableContainer) {
            tableContainer.classList.remove('is-hidden');
        }
        const plotSection = document.getElementById('runningAmountSection');
        if (plotSection) {
            plotSection.classList.add('is-hidden');
        }
    }

    function isTransactionTableVisible() {
        const tableContainer = document.querySelector('.table-responsive-container');
        return Boolean(tableContainer && !tableContainer.classList.contains('is-hidden'));
    }

    function isActiveChartVisible() {
        const activeChart = transactionState.activeChart;
        if (
            !activeChart ||
            ![
                'contribution',
                'performance',
                'composition',
                'compositionAbs',
                'fx',
                'drawdown',
                'drawdownAbs',
            ].includes(activeChart)
        ) {
            return false;
        }
        const plotSection = document.getElementById('runningAmountSection');
        return plotSection && !plotSection.classList.contains('is-hidden');
    }

    async function applyDateFilterRange(range) {
        if (!range || (!range.from && !range.to)) {
            return null;
        }
        const activeChartVisible = isActiveChartVisible();
        const activeChart = transactionState.activeChart;
        if (activeChartVisible) {
            setChartDateRange(range);
            updateContextYearFromRange(range);
            chartManager.update();
            let message = `Applied date filter ${formatDateRange(range)} to ${activeChart} chart.`;
            const summary = await getActiveChartSummaryText();
            if (summary) {
                message += `\n${summary}`;
            }
            return message;
        }
        if (!isTransactionTableVisible()) {
            return 'Transaction table is hidden. Use the "transaction" command to show it before applying date filters.';
        }
        setChartDateRange(range);
        updateContextYearFromRange(range);
        filterAndSort(transactionState.activeFilterTerm || '');
        return `Applied date filter ${formatDateRange(range)} to transactions table.`;
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
            case 'ArrowLeft':
                // Only cycle currency if the input is empty
                if (input.value.trim() === '') {
                    e.preventDefault();
                    import('@ui/currencyToggleManager.js').then(({ cycleCurrency }) => {
                        cycleCurrency(-1); // Move left/cycle backward
                    });
                }
                resetAutocompleteState();
                requestFadeUpdate();
                break;
            case 'ArrowLeft':
                // Only cycle currency if the input is empty and no modifier keys (don't interfere when user is editing text)
                if (input.value.trim() === '' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    cycleCurrency(-1); // Move left/cycle backward
                } else if (e.ctrlKey || e.metaKey) {
                    // Process Cmd/Ctrl+arrows synchronously to prevent double firing
                    e.preventDefault();
                    cycleCurrency(-1); // Move left/cycle backward
                }
                resetAutocompleteState();
                requestFadeUpdate();
                break;
            case 'ArrowRight':
                // Only cycle currency if the input is empty and no modifier keys (don't interfere when user is editing text)
                if (input.value.trim() === '' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    cycleCurrency(1); // Move right/cycle forward
                } else if (e.ctrlKey || e.metaKey) {
                    // Process Cmd/Ctrl+arrows synchronously to prevent double firing
                    e.preventDefault();
                    cycleCurrency(1); // Move right/cycle forward
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
        requestFadeUpdate(outputContainer);
    });

    if (outputContainer) {
        // Initialize scroll fading
        initFade(outputContainer);
    }

    return {
        processCommand,
    };
}

function parseDateRange(args) {
    const currentYear = new Date().getFullYear();
    const defaultYear = getDefaultYear();
    let from = null;
    let to = null;

    if (args.length === 1) {
        const arg = args[0];

        // Check for quarter format (e.g., 2023q1, 2024q2)
        const quarterToken = parseQuarterToken(arg, defaultYear);
        if (quarterToken) {
            const resolved = resolveQuarterRange(quarterToken.year, quarterToken.quarter, 'full');
            debugContext('parseDateRange:single-quarter', { arg, defaultYear, resolved });
            return resolved;
        }

        // Check for year format
        const year = parseInt(arg, 10);
        if (!isNaN(year) && year >= 1900 && year <= currentYear + 5) {
            lastContextYear = year;
            from = `${year}-01-01`;
            to = `${year}-12-31`;
            debugContext('parseDateRange:single-year', { arg, year });
        }
    } else if (args.length === 2 && args[0].toLowerCase() === 'from') {
        const arg = args[1];

        // Check for quarter format (e.g., from 2023q1)
        const quarterToken = parseQuarterToken(arg, defaultYear);
        if (quarterToken) {
            const resolved = resolveQuarterRange(quarterToken.year, quarterToken.quarter, 'start');
            debugContext('parseDateRange:from-quarter', { arg, defaultYear, resolved });
            return resolved;
        }

        // Check for year format
        const year = parseInt(arg, 10);
        if (!isNaN(year) && year >= 1900 && year <= currentYear + 5) {
            lastContextYear = year;
            from = `${year}-01-01`;
            to = null; // To current date
            debugContext('parseDateRange:from-year', { arg, year });
        }
    } else if (args.length === 3 && args[1].toLowerCase() === 'to') {
        const arg1 = args[0];
        const arg2 = args[2];

        // Parse first argument (could be year or quarter)
        let year1, year2;
        let fromDate, toDate;

        // Parse first date
        const quarterTokenStart = parseQuarterToken(arg1, defaultYear);
        if (quarterTokenStart) {
            const resolvedStart = resolveQuarterRange(
                quarterTokenStart.year,
                quarterTokenStart.quarter,
                'full'
            );
            fromDate = resolvedStart.from;
            lastContextYear = quarterTokenStart.year;
            debugContext('parseDateRange:range-start-quarter', {
                arg1,
                defaultYear,
                resolvedStart,
            });
        } else {
            year1 = parseInt(arg1, 10);
            if (!isNaN(year1) && year1 >= 1900 && year1 <= currentYear + 5) {
                fromDate = `${year1}-01-01`;
                lastContextYear = year1;
                debugContext('parseDateRange:range-start-year', { arg1, year1 });
            }
        }

        // Parse second date
        const quarterTokenEnd = parseQuarterToken(arg2, defaultYear);
        if (quarterTokenEnd) {
            const resolvedEnd = resolveQuarterRange(
                quarterTokenEnd.year,
                quarterTokenEnd.quarter,
                'full'
            );
            toDate = resolvedEnd.to;
            debugContext('parseDateRange:range-end-quarter', {
                arg2,
                defaultYear,
                resolvedEnd,
            });
        } else {
            year2 = parseInt(arg2, 10);
            if (!isNaN(year2) && year2 >= 1900 && year2 <= currentYear + 5) {
                toDate = `${year2}-12-31`;
                if (!Number.isFinite(lastContextYear)) {
                    lastContextYear = year2;
                }
                debugContext('parseDateRange:range-end-year', { arg2, year2 });
            }
        }

        // Validate and set dates
        if (fromDate && toDate) {
            const date1 = new Date(fromDate);
            const date2 = new Date(toDate);
            if (date1 <= date2) {
                from = fromDate;
                to = toDate;
            }
        }
    }

    return { from, to };
}

function formatDateRange(range) {
    if (range.from && range.to) {
        // Check if it's a quarter range
        const fromParts = range.from.split('-');
        const toParts = range.to.split('-');

        if (fromParts.length === 3 && toParts.length === 3) {
            const fromYear = fromParts[0];
            const fromMonth = parseInt(fromParts[1], 10);
            const toYear = toParts[0];
            const toMonth = parseInt(toParts[1], 10);
            const toDay = parseInt(toParts[2], 10);

            // Check if it's a standard quarter range
            if (fromYear === toYear) {
                const quarters = {
                    '01': { endMonth: 3, endDay: 31, quarter: 1 },
                    '04': { endMonth: 6, endDay: 30, quarter: 2 },
                    '07': { endMonth: 9, endDay: 30, quarter: 3 },
                    10: { endMonth: 12, endDay: 31, quarter: 4 },
                };

                const quarterInfo = quarters[fromMonth.toString().padStart(2, '0')];
                if (
                    quarterInfo &&
                    quarterInfo.endMonth === toMonth &&
                    quarterInfo.endDay === toDay
                ) {
                    return `${fromYear}Q${quarterInfo.quarter}`;
                }
            }

            // Check if it's a year range
            if (
                fromParts[1] === '01' &&
                fromParts[2] === '01' &&
                toParts[1] === '12' &&
                toParts[2] === '31'
            ) {
                if (fromYear === toYear) {
                    return fromYear;
                }
                return `${fromYear} to ${toYear}`;
            }
        }

        return `${range.from} to ${range.to}`;
    } else if (range.from && !range.to) {
        // Check if it's a quarter range (from quarter to now)
        const fromParts = range.from.split('-');
        if (fromParts.length === 3) {
            const fromYear = fromParts[0];
            const fromMonth = parseInt(fromParts[1], 10);

            // Check if it's a standard quarter start
            const quarters = {
                '01': { quarter: 1 },
                '04': { quarter: 2 },
                '07': { quarter: 3 },
                10: { quarter: 4 },
            };

            const quarterInfo = quarters[fromMonth.toString().padStart(2, '0')];
            if (quarterInfo) {
                return `from ${fromYear}q${quarterInfo.quarter}`;
            }
        }
        return `from ${range.from}`;
    } else if (range.to) {
        return `to ${range.to}`;
    }
    return 'all time';
}
