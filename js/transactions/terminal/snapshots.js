import {
    transactionState,
    setHistoricalPrices,
    getCompositionFilterTickers,
    getCompositionAssetClassFilter,
} from '../state.js';
import {
    hasActiveTransactionFilters,
    buildContributionSeriesFromTransactions,
    buildFilteredBalanceSeries,
    buildFxChartSeries,
    buildDrawdownSeries,
    getContributionSeriesForTransactions,
} from '../chart.js';
import { PERFORMANCE_SERIES_CURRENCY } from '../chart/config.js';
import { loadCompositionSnapshotData } from '../dataLoader.js'; // Adjust path if needed
import {
    formatCurrency as formatValueWithCurrency,
    convertBetweenCurrencies,
    convertValueToCurrency,
    formatCurrencyInline,
} from '../utils.js';
import { normalizeDateOnly } from '@utils/date.js';
import { getHoldingAssetClass } from '@js/config.js';
import { formatSummaryBlock, formatAppreciationBlock } from '@utils/formatting.js';
import { getConcentrationText } from './stats/analysis.js';
import { loadPEData, buildPESeries } from '../chart/renderers/pe.js';
import { parseLocalDate } from '../chart/helpers.js';

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

export function getFxSnapshotLine() {
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

function parseDateSafe(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function getDrawdownSnapshotLine({ includeHidden = false, isAbsolute = false } = {}) {
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

        // Check if filters are active
        const filtersActive =
            hasActiveTransactionFilters() &&
            transactionState.activeFilterTerm &&
            transactionState.activeFilterTerm.trim().length > 0;

        // 1. Balance (Portfolio Series)
        // Use filtered balance when filters active, otherwise use currency-specific portfolio series
        let portfolioSeries;
        if (filtersActive) {
            // Build filtered balance series from filtered transactions
            const historicalPrices = transactionState.historicalPrices || {};
            const rawBalanceSeries = buildFilteredBalanceSeries(
                transactionState.filteredTransactions || [],
                historicalPrices,
                transactionState.splitHistory
            );
            // Convert to selected currency if needed
            if (selectedCurrency !== 'USD' && rawBalanceSeries.length > 0) {
                // convertValueToCurrency is already imported at top of file
                portfolioSeries = rawBalanceSeries.map((entry) => ({
                    ...entry,
                    value: convertValueToCurrency(entry.value, entry.date, selectedCurrency),
                }));
            } else {
                portfolioSeries = rawBalanceSeries;
            }
        } else {
            portfolioSeries =
                transactionState.portfolioSeriesByCurrency?.[selectedCurrency] ||
                transactionState.portfolioSeries ||
                [];
        }

        if (portfolioSeries.length === 0) {
            return null;
        }

        // Ensure balance data is sorted and strictly daily (taking last value of day)
        const consolidatedBalance = consolidateAndSort(portfolioSeries, 'date', 'value');

        let runningPeak = -Infinity;
        const balanceDrawdownData = consolidatedBalance.map((p) => {
            const val = p.value;
            if (val > runningPeak) {
                runningPeak = val;
            }
            return { date: p.date, value: val - runningPeak };
        });

        // 2. Contribution (Running Amount Series)
        // Re-calculate using the chart's logic to ensure consistency and proper daily consolidation
        // (filtersActive was already defined above for balance series calculation)
        const contributionTransactions = filtersActive
            ? transactionState.filteredTransactions
            : transactionState.allTransactions;

        // Use the chart's generator which handles daily consolidation and currency conversion
        // We request the selected currency to ensure we calculate based on real value in that currency
        const calculatedContributionSeries = getContributionSeriesForTransactions(
            contributionTransactions,
            {
                includeSyntheticStart: true,
                padToDate: Date.now(), // Pad to now for consistent end
                currency: selectedCurrency,
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
        const contributionDrawdownData = consolidatedContribution.map((p) => {
            const val = p.value; // value is amount from consolidateAndSort
            if (val > contribPeak) {
                contribPeak = val;
            }
            return { date: p.date, value: val - contribPeak };
        });

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

export function getPerformanceSnapshotLine({ includeHidden = false } = {}) {
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

export async function getCompositionSnapshotLine({ labelPrefix = 'Composition' } = {}) {
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

export async function getContributionSummaryText(dateRange = transactionState.chartDateRange) {
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

export async function getConcentrationSnapshotText() {
    return getConcentrationText();
}
export async function getPESnapshotLine() {
    const data = await loadPEData();
    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray(data.dates) ||
        data.dates.length === 0
    ) {
        return null;
    }

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;

    const series = buildPESeries(
        data.dates,
        data.portfolio_pe,
        data.ticker_pe,
        data.ticker_weights,
        filterFrom,
        filterTo
    );

    if (series.length === 0) {
        return 'No PE data in range';
    }

    const lastPoint = series[series.length - 1];
    const current = lastPoint.pe;

    const values = series.map((p) => p.pe);
    const min = Math.min(...values);
    const max = Math.max(...values);

    let text = `Current: ${current.toFixed(2)}x | Range: ${min.toFixed(2)}x - ${max.toFixed(2)}x | Harmonic Mean (1 / Σ(w/PE))`;

    if (lastPoint.tickerPEs) {
        const entries = Object.entries(lastPoint.tickerPEs)
            .filter(([, pe]) => pe !== null && Number.isFinite(pe))
            .sort((a, b) => {
                const wA = lastPoint.tickerWeights ? lastPoint.tickerWeights[a[0]] : 0;
                const wB = lastPoint.tickerWeights ? lastPoint.tickerWeights[b[0]] : 0;
                return (wB || 0) - (wA || 0);
            })
            .slice(0, 8);
        if (entries.length > 0) {
            const breakdown = entries.map(([t, pe]) => `${t}:${pe.toFixed(0)}`).join(' ');
            text += `\nComponents: ${breakdown}`;
        }
    }

    return text;
}
