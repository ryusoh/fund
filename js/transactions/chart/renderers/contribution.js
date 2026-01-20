import {
    transactionState,
    getShowChartLabels,
    setRunningAmountSeries,
    setHistoricalPrices,
    hasActiveTransactionFilters,
} from '../../state.js';
import {
    CONTRIBUTION_CHART_SETTINGS,
    CHART_MARKERS,
    mountainFill,
    CHART_LINE_WIDTHS,
} from '../../../config.js';
import { BALANCE_GRADIENTS } from '../config.js';
import { drawAxes, drawStartValue, drawEndValue, drawMarker, drawMountainFill } from '../core.js';
import {
    drawSeriesGlow,
    scheduleContributionAnimation,
    stopContributionAnimation,
    stopPerformanceAnimation,
    stopFxAnimation,
    isAnimationEnabled,
    advanceContributionAnimation,
} from '../animation.js';
import { updateLegend, drawCrosshairOverlay, legendState } from '../interaction.js';
import { chartLayouts } from '../state.js';
import {
    getContributionSeriesForTransactions,
    buildFilteredBalanceSeries,
} from '../data/contribution.js';
import {
    parseLocalDate,
    clampTime,
    createTimeInterpolator,
    getSmoothingConfig,
    getChartColors,
} from '../helpers.js';
import {
    formatCurrencyCompact,
    formatCurrencyInline,
    convertValueToCurrency,
} from '../../utils.js';
import { injectSyntheticStartPoint, constrainSeriesToRange } from '../helpers.js';
import { smoothFinancialData } from '../../../utils/smoothing.js';

export async function drawContributionChart(ctx, chartManager, timestamp, options = {}) {
    const { drawdownMode = false } = options;
    stopPerformanceAnimation();
    stopFxAnimation();

    const runningAmountSeries = Array.isArray(transactionState.runningAmountSeries)
        ? transactionState.runningAmountSeries
        : [];
    const portfolioSeries = Array.isArray(transactionState.portfolioSeries)
        ? transactionState.portfolioSeries
        : [];
    const filteredTransactions = Array.isArray(transactionState.filteredTransactions)
        ? transactionState.filteredTransactions
        : [];
    const allTransactions = Array.isArray(transactionState.allTransactions)
        ? transactionState.allTransactions
        : [];

    const filtersActive =
        hasActiveTransactionFilters() &&
        transactionState.activeFilterTerm &&
        transactionState.activeFilterTerm.trim().length > 0;
    const selectedCurrency = transactionState.selectedCurrency || 'USD';

    const contributionTransactions = filtersActive ? filteredTransactions : allTransactions;
    let contributionSource = [];
    let contributionFromTransactions = false;

    if (contributionTransactions.length > 0) {
        const today = parseLocalDate(new Date());
        const rangeTo = transactionState.chartDateRange?.to
            ? parseLocalDate(transactionState.chartDateRange.to)
            : null;
        let padToDate;
        if (rangeTo && today) {
            padToDate = Math.min(rangeTo.getTime(), today.getTime());
        } else if (today) {
            padToDate = today.getTime();
        } else {
            padToDate = rangeTo?.getTime() ?? Date.now();
        }
        contributionSource = getContributionSeriesForTransactions(contributionTransactions, {
            includeSyntheticStart: true,
            padToDate,
            currency: null,
        });
        contributionFromTransactions =
            filtersActive && Array.isArray(contributionSource) && contributionSource.length > 0;
        if (!filtersActive && contributionSource !== runningAmountSeries) {
            setRunningAmountSeries(contributionSource);
        }
    } else {
        const mappedSeries =
            transactionState.runningAmountSeriesByCurrency?.[selectedCurrency] || null;

        if (mappedSeries && mappedSeries === runningAmountSeries) {
            contributionSource = runningAmountSeries;
        } else if (mappedSeries) {
            contributionSource = mappedSeries;
            setRunningAmountSeries(mappedSeries);
        } else {
            contributionSource = runningAmountSeries;
        }
    }

    let historicalPrices = transactionState.historicalPrices;
    if (filtersActive && (!historicalPrices || Object.keys(historicalPrices).length === 0)) {
        try {
            const response = await fetch('../data/historical_prices.json');
            if (response.ok) {
                historicalPrices = await response.json();
                // Cache the fetched data to prevent repeated async fetches
                setHistoricalPrices(historicalPrices);
            } else {
                historicalPrices = {};
            }
        } catch {
            historicalPrices = {};
        }
    } else {
        historicalPrices = historicalPrices || {};
    }
    // For non-filter mode, use currency-specific portfolio series if available
    const currencyPortfolioSeries =
        transactionState.portfolioSeriesByCurrency?.[selectedCurrency] || portfolioSeries;

    let balanceSource = filtersActive
        ? buildFilteredBalanceSeries(
              filteredTransactions,
              historicalPrices,
              transactionState.splitHistory
          )
        : currencyPortfolioSeries;

    // For filtered data, convert to target currency before any other transformations
    // (including drawdown which should calculate HWM in the target currency)
    if (selectedCurrency !== 'USD' && Array.isArray(balanceSource) && filtersActive) {
        balanceSource = [...balanceSource]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map((entry) => ({
                ...entry,
                value: convertValueToCurrency(entry.value, entry.date, selectedCurrency),
            }));
    }
    const hasBalanceSeries = Array.isArray(balanceSource) && balanceSource.length > 0;

    const { chartVisibility } = transactionState;
    const visibility = chartVisibility || {};
    const showContribution = visibility.contribution !== false;
    const showBalance = visibility.balance !== false && hasBalanceSeries;
    const showBuy = visibility.buy !== false;
    const showSell = visibility.sell !== false;

    const canvas = ctx.canvas;
    const emptyState = document.getElementById('runningAmountEmpty');

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;
    const filterFromTime =
        filterFrom && Number.isFinite(filterFrom.getTime()) ? filterFrom.getTime() : null;
    const filterToTime =
        filterTo && Number.isFinite(filterTo.getTime()) ? filterTo.getTime() : null;

    const filterDataByDateRange = (data) => {
        return data.filter((item) => {
            const itemDate = parseLocalDate(item.date);
            if (!itemDate) {
                return false;
            }

            // Normalize dates to date-only strings for comparison (YYYY-MM-DD)
            const itemDateStr = itemDate.toISOString().split('T')[0];
            const filterFromStr = filterFrom ? filterFrom.toISOString().split('T')[0] : null;
            const filterToStr = filterTo ? filterTo.toISOString().split('T')[0] : null;

            // Check if item is within the filter range
            const withinStart = !filterFromStr || itemDateStr >= filterFromStr;
            const withinEnd = !filterToStr || itemDateStr <= filterToStr;

            // Preserve padding points that extend the series to the filter endpoint
            const isPadding = item.orderType && item.orderType.toLowerCase() === 'padding';
            if (isPadding && filterToStr) {
                // If it's a padding point, allow it if it matches the filter end
                // or if it's within the valid range (which is covered by withinStart && withinEnd)
                if (itemDateStr === filterToStr) {
                    return withinStart;
                }
            }

            return withinStart && withinEnd;
        });
    };

    const rawContributionData = filterDataByDateRange(
        (contributionSource || [])
            .map((item) => ({ ...item, date: parseLocalDate(item.tradeDate || item.date) }))
            .filter((item) => item.date && !Number.isNaN(item.date.getTime()))
    );
    const mappedBalanceSource = showBalance
        ? (balanceSource || [])
              .map((item) => ({ ...item, date: parseLocalDate(item.date) }))
              .filter((item) => item.date && !Number.isNaN(item.date.getTime()))
        : [];
    const rawBalanceData = showBalance
        ? injectSyntheticStartPoint(
              filterDataByDateRange(mappedBalanceSource),
              balanceSource,
              filterFrom
          )
        : [];
    const balanceDataWithinRange =
        (filterFrom || filterTo) && rawBalanceData.length > 0
            ? constrainSeriesToRange(rawBalanceData, filterFrom, filterTo)
            : rawBalanceData;

    // Apply smoothing to contribution and balance data
    const contributionSmoothingConfig = getSmoothingConfig('contribution');
    const balanceSmoothingConfig = getSmoothingConfig('balance') || contributionSmoothingConfig;
    const rangeActive = Boolean(filterFrom || filterTo);
    const shouldSmoothContribution =
        !rangeActive &&
        !contributionFromTransactions &&
        rawContributionData.length > 2 &&
        contributionSmoothingConfig;
    const contributionData = shouldSmoothContribution
        ? smoothFinancialData(
              rawContributionData.map((item) => ({ x: item.date.getTime(), y: item.amount })),
              contributionSmoothingConfig,
              true // preserveEnd - keep the last point unchanged
          ).map((p) => ({ date: new Date(p.x), amount: p.y }))
        : rawContributionData;

    const shouldSmoothBalance =
        !filtersActive && balanceDataWithinRange.length > 2 && balanceSmoothingConfig;
    const balanceData = shouldSmoothBalance
        ? smoothFinancialData(
              balanceDataWithinRange.map((item) => ({ x: item.date.getTime(), y: item.value })),
              balanceSmoothingConfig,
              true // preserveEnd - keep the last point unchanged
          ).map((p) => ({ date: new Date(p.x), value: p.y }))
        : balanceDataWithinRange;

    if (contributionData.length === 0 && balanceData.length === 0) {
        stopContributionAnimation();
        if (emptyState) {
            emptyState.style.display = '';
        }
        return;
    }

    // Apply drawdown transformation if in drawdown mode
    let finalContributionData = contributionData;
    let finalBalanceData = balanceData;

    if (drawdownMode) {
        // Helper to apply HWM drawdown to a series
        const applyDrawdown = (data, valueKey) => {
            if (data.length === 0) {
                return [];
            }
            // Sort by date first
            const sorted = [...data].sort((a, b) => a.date - b.date);
            let runningPeak = -Infinity;
            return sorted.map((p) => {
                const val = p[valueKey];
                if (val > runningPeak) {
                    runningPeak = val;
                }
                return {
                    ...p,
                    [valueKey]: val - runningPeak, // <= 0
                };
            });
        };

        finalContributionData = applyDrawdown(contributionData, 'amount');
        finalBalanceData = applyDrawdown(balanceData, 'value');
    }

    if (emptyState) {
        emptyState.style.display = 'none';
    }

    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 50 }
        : { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvas.offsetWidth - padding.left - padding.right;
    const totalPlotHeight = canvas.offsetHeight - padding.top - padding.bottom;
    const volumeGap = isMobile ? 10 : 16;
    const minMainHeight = isMobile ? 120 : 180;
    const minVolumeHeight = isMobile ? 50 : 80;
    const availableHeight = Math.max(totalPlotHeight - volumeGap, 0);

    let mainPlotHeight = 0;
    let volumeHeight = 0;

    if (availableHeight <= 0) {
        mainPlotHeight = Math.max(totalPlotHeight, 0);
    } else if (availableHeight < minMainHeight + minVolumeHeight) {
        const scale = availableHeight / (minMainHeight + minVolumeHeight);
        mainPlotHeight = minMainHeight * scale;
        volumeHeight = minVolumeHeight * scale;
    } else {
        mainPlotHeight = Math.max(minMainHeight, availableHeight * 0.7);
        volumeHeight = availableHeight - mainPlotHeight;
        if (volumeHeight < minVolumeHeight) {
            volumeHeight = minVolumeHeight;
            mainPlotHeight = availableHeight - volumeHeight;
        }
    }

    const plotHeight = mainPlotHeight;
    const volumeTop = padding.top + plotHeight + (volumeHeight > 0 ? volumeGap : 0);

    const allTimes = [
        ...contributionData.map((d) => d.date.getTime()),
        ...balanceData.map((d) => d.date.getTime()),
    ];

    // Calculate effective min times based on actual data within filter range
    const effectiveMinTimes = [];
    if (rawContributionData.length > 0) {
        const firstContributionPoint = filtersActive
            ? rawContributionData.find(
                  (item) =>
                      typeof item.orderType !== 'string' ||
                      item.orderType.toLowerCase() !== 'padding'
              )
            : rawContributionData[0];
        if (firstContributionPoint) {
            effectiveMinTimes.push(firstContributionPoint.date.getTime());
        }
    }
    if (showBalance && rawBalanceData.length > 0) {
        effectiveMinTimes.push(rawBalanceData[0].date.getTime());
    }

    const fallbackMinTime = allTimes.length > 0 ? Math.min(...allTimes) : Date.now();
    let minTime = effectiveMinTimes.length > 0 ? Math.min(...effectiveMinTimes) : fallbackMinTime;

    if (Number.isFinite(filterFromTime)) {
        // Ensure minTime is at least the filter start time
        minTime = Math.max(minTime, filterFromTime);
    }
    // Calculate maxTime - use filter end if specified (clamped to today), otherwise use data max
    let maxTime;
    if (Number.isFinite(filterToTime)) {
        // When filter is active, extend to min(filterEnd, today)
        // This handles both past periods (stops at filter end) and current periods (stops at today)
        maxTime = Math.min(filterToTime, Date.now());
    } else if (allTimes.length > 0) {
        // No filter: use the maximum time from the data (including padding points)
        maxTime = Math.max(...allTimes);
    } else {
        maxTime = Date.now();
    }

    // Force-extend series to maxTime to ensure the line reaches the right edge of the chart
    // This fixes issues where the line stops at the last transaction date instead of the filter end/today
    if (contributionData.length > 0) {
        const lastPoint = contributionData[contributionData.length - 1];
        if (lastPoint.date.getTime() < maxTime) {
            contributionData.push({
                date: new Date(maxTime),
                amount: lastPoint.amount,
            });
        }
    }

    if (balanceData.length > 0) {
        const lastPoint = balanceData[balanceData.length - 1];
        if (lastPoint.date.getTime() < maxTime) {
            balanceData.push({
                date: new Date(maxTime),
                value: lastPoint.value,
            });
        }
    }

    // Remove debug object
    if (window.DEBUG_CHART) {
        delete window.DEBUG_CHART;
    }

    const contributionValues = finalContributionData.map((item) => item.amount);
    const balanceValues = finalBalanceData.map((item) => item.value);
    const combinedValues = [...contributionValues, ...balanceValues].filter((value) =>
        Number.isFinite(value)
    );
    const hasValues = combinedValues.length > 0;
    const rawMin = hasValues ? Math.min(...combinedValues) : 0;
    const rawMax = hasValues ? Math.max(...combinedValues) : 0;

    const {
        startYAxisAtZero = true,
        paddingRatio: configuredPaddingRatio = 0.05,
        minPaddingValue: configuredMinPadding = 0,
    } = CONTRIBUTION_CHART_SETTINGS || {};

    const paddingRatio = Number.isFinite(configuredPaddingRatio)
        ? Math.max(configuredPaddingRatio, 0)
        : 0.05;
    const minPaddingValue = Number.isFinite(configuredMinPadding)
        ? Math.max(configuredMinPadding, 0)
        : 0;

    let yMin = startYAxisAtZero ? Math.min(0, rawMin) : rawMin;
    let yMax = startYAxisAtZero ? Math.max(rawMax, 0) : rawMax;

    // In drawdown mode, force yMax to 0 and yMin to include all negative values
    if (drawdownMode) {
        yMax = 0;
        yMin = Math.min(rawMin, 0);
    }

    if (!hasValues) {
        yMin = startYAxisAtZero || drawdownMode ? 0 : 0;
        yMax = drawdownMode ? 0 : 1;
        if (drawdownMode) {
            yMin = -1;
        }
    }

    const range = yMax - yMin;
    const paddingDelta =
        range > 0
            ? Math.max(range * paddingRatio, minPaddingValue)
            : Math.max(Math.abs(yMax || yMin) * paddingRatio, minPaddingValue || 1);

    if (startYAxisAtZero) {
        yMax += paddingDelta;
    } else {
        yMin -= paddingDelta;
        yMax += paddingDelta;
    }

    if (yMax <= yMin) {
        const fallbackSpan = paddingDelta || 1;
        yMax = yMin + fallbackSpan;
    }

    const xScale = (t) =>
        padding.left +
        (maxTime === minTime ? plotWidth / 2 : ((t - minTime) / (maxTime - minTime)) * plotWidth);
    const yScale = (v) => padding.top + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;

    drawAxes(
        ctx,
        padding,
        plotWidth,
        plotHeight,
        minTime,
        maxTime,
        yMin,
        yMax,
        xScale,
        yScale,
        formatCurrencyCompact,
        false, // isPerformanceChart
        volumeHeight > 0 ? { drawXAxis: false } : {},
        transactionState.selectedCurrency || 'USD'
    );

    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);
    const contributionAnimationEnabled = isAnimationEnabled('contribution');
    const animationPhase = advanceContributionAnimation(timestamp);

    const animatedSeries = [];
    const filterStartTime = Number.isFinite(filterFromTime) ? filterFromTime : null;

    const formatBalanceValue = (value) =>
        formatCurrencyCompact(value, { currency: transactionState.selectedCurrency || 'USD' });

    const formatContributionAnnotationValue = (value) => {
        const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
        if (Math.abs(amount) < 1) {
            return formatBalanceValue(amount);
        }
        const currency = transactionState.selectedCurrency || 'USD';
        return formatCurrencyCompact(amount, { currency });
    };

    const showChartLabels = getShowChartLabels();
    let firstContributionLabelY = null;
    let contributionEndLabelY = null;

    if (showContribution && finalContributionData.length > 0) {
        animatedSeries.push({
            key: 'contribution',
            color: colors.contribution,
            lineWidth: CHART_LINE_WIDTHS.contribution ?? 2,
            order: 1,
            data: finalContributionData
                .filter((item) => {
                    const t = item.date.getTime();
                    return !filterStartTime || t >= filterStartTime;
                })
                .map((item) => ({
                    time: item.date.getTime(),
                    value: item.amount,
                })),
        });
    }

    if (showBalance && finalBalanceData.length > 0) {
        animatedSeries.push({
            key: 'balance',
            color: colors.portfolio,
            lineWidth: CHART_LINE_WIDTHS.balance ?? 2,
            order: 2,
            data: finalBalanceData
                .filter((item) => {
                    const t = item.date.getTime();
                    return !filterStartTime || t >= filterStartTime;
                })
                .map((item) => ({
                    time: item.date.getTime(),
                    value: item.value,
                })),
        });
    }

    animatedSeries.forEach((series) => {
        const coords = [];
        if (series.data.length > 0) {
            // Ensure visual continuity by adding a synthetic start point if filtering
            if (filterStartTime && series.data[0].time > filterStartTime) {
                // ... same logic as injectSyntheticStartPoint but for drawing coordinates ...
                // actually injectSyntheticStartPoint was applied to raw data, so series.data should already cover it
                // except if clamping cut it off?
                // The data passed here is finalBalanceData/finalContributionData which went through helpers
            }
        }

        series.data.forEach((point) => {
            coords.push({
                x: xScale(point.time),
                y: yScale(point.value),
                time: point.time,
                value: point.value,
            });
        });

        series.coords = coords;
    });

    // --- Draw Markers ---
    // Use raw data for markers since smoothed data doesn't have orderType
    const showMarkersConfig = CHART_MARKERS?.showContributionMarkers !== false;
    const markerGroups = new Map();

    if (showMarkersConfig) {
        rawContributionData.forEach((item) => {
            if (typeof item.orderType !== 'string') {
                return;
            }
            const type = item.orderType.toLowerCase();
            if (!((type === 'buy' && showBuy) || (type === 'sell' && showSell))) {
                return;
            }
            const timestamp = item.date.getTime();
            if (!Number.isFinite(timestamp)) {
                return;
            }

            if (!markerGroups.has(timestamp)) {
                markerGroups.set(timestamp, { buys: [], sells: [] });
            }
            const group = markerGroups.get(timestamp);
            const netAmount = Number(item.netAmount) || 0;
            const amount = Number(item.amount) || 0;
            const radius = Math.min(8, Math.max(2, Math.abs(netAmount) / 500));
            if (type === 'buy') {
                group.buys.push({ radius, amount, netAmount });
            } else {
                group.sells.push({ radius, amount, netAmount });
            }
        });
    }

    const volumeEntries = [];
    let maxVolume = 0;
    const volumeGroups = new Map();

    rawContributionData.forEach((item) => {
        if (typeof item.orderType !== 'string') {
            return;
        }
        const type = item.orderType.toLowerCase();

        // If we have explicit volume data, we can process even if type is 'mixed'
        const hasExplicitVolume = Number(item.buyVolume) > 0 || Number(item.sellVolume) > 0;

        if (!hasExplicitVolume && !((type === 'buy' && showBuy) || (type === 'sell' && showSell))) {
            return;
        }
        const normalizedDate = new Date(item.date.getTime());
        normalizedDate.setHours(0, 0, 0, 0);
        const timestamp = normalizedDate.getTime();
        if (!Number.isFinite(timestamp)) {
            return;
        }
        // Ensure volume bars are strictly within the visible chart range
        if (timestamp < minTime || timestamp > maxTime) {
            return;
        }
        const netAmount = Math.abs(Number(item.netAmount) || 0);
        if (!hasExplicitVolume && netAmount <= 0) {
            return;
        }

        if (!volumeGroups.has(timestamp)) {
            volumeGroups.set(timestamp, { totalBuy: 0, totalSell: 0 });
        }
        const totals = volumeGroups.get(timestamp);

        // Use pre-consolidated volumes if available
        if (Number.isFinite(item.buyVolume) || Number.isFinite(item.sellVolume)) {
            if (showBuy) {
                totals.totalBuy += Number(item.buyVolume) || 0;
            }
            if (showSell) {
                totals.totalSell += Number(item.sellVolume) || 0;
            }
        } else if (type === 'buy') {
            // Fallback for non-consolidated items
            totals.totalBuy += netAmount;
        } else {
            totals.totalSell += netAmount;
        }
    });

    volumeGroups.forEach((totals, timestamp) => {
        const { totalBuy, totalSell } = totals;
        const totalBuyVolume = totalBuy;
        const totalSellVolume = totalSell;
        if (totalBuyVolume === 0 && totalSellVolume === 0) {
            return;
        }

        maxVolume = Math.max(maxVolume, totalBuyVolume, totalSellVolume);
        volumeEntries.push({
            timestamp,
            totalBuyVolume,
            totalSellVolume,
        });
    });

    const buyVolumeMap = new Map();
    const sellVolumeMap = new Map();
    volumeEntries.forEach(({ timestamp, totalBuyVolume, totalSellVolume }) => {
        if (totalBuyVolume > 0) {
            buyVolumeMap.set(timestamp, totalBuyVolume);
        }
        if (totalSellVolume > 0) {
            sellVolumeMap.set(timestamp, totalSellVolume);
        }
    });

    const volumePadding = {
        top: volumeTop,
        right: padding.right,
        bottom: padding.bottom,
        left: padding.left,
    };

    let volumeYScale;
    if (volumeHeight > 0) {
        const volumeYMin = 0;
        const volumeYMax = maxVolume > 0 ? maxVolume * 1.1 : 1;
        const volumeRange = volumeYMax - volumeYMin || 1;
        volumeYScale = (value) =>
            volumePadding.top + volumeHeight - ((value - volumeYMin) / volumeRange) * volumeHeight;

        drawAxes(
            ctx,
            volumePadding,
            plotWidth,
            volumeHeight,
            minTime,
            maxTime,
            volumeYMin,
            volumeYMax,
            xScale,
            volumeYScale,
            formatCurrencyCompact,
            false,
            { drawYAxis: maxVolume > 0 },
            transactionState.selectedCurrency || 'USD'
        );
    }

    // Clip the drawing area to prevent overhangs and spikes for ALL chart elements
    ctx.save();
    ctx.beginPath();
    // Include volume area in clipping if volume is shown
    // clipTop must start at padding.top to include the main chart!
    const clipTop = padding.top;
    const clipHeight =
        volumeHeight > 0
            ? plotHeight + (volumeGap || 0) + volumeHeight + (volumePadding?.top || 0)
            : plotHeight;

    ctx.rect(padding.left, clipTop, plotWidth, clipHeight);
    ctx.clip();

    if (volumeHeight > 0 && volumeEntries.length > 0 && typeof volumeYScale === 'function') {
        volumeEntries.sort((a, b) => a.timestamp - b.timestamp);
        const barWidth = 8;
        const baselineY = volumePadding.top + volumeHeight;

        const allVolumeRects = [];

        volumeEntries.forEach((entry) => {
            const { timestamp, totalBuyVolume, totalSellVolume } = entry;
            const x = xScale(timestamp);

            const bars = [];
            if (totalBuyVolume > 0) {
                bars.push({
                    type: 'buy',
                    volume: totalBuyVolume,
                    fill: 'rgba(76, 175, 80, 0.6)',
                    stroke: 'rgba(76, 175, 80, 0.8)',
                });
            }
            if (totalSellVolume > 0) {
                bars.push({
                    type: 'sell',
                    volume: totalSellVolume,
                    fill: 'rgba(244, 67, 54, 0.6)',
                    stroke: 'rgba(244, 67, 54, 0.8)',
                });
            }
            if (bars.length === 0) {
                return;
            }

            // Determine max volume for this day to identify which bar should be narrower
            const dayMaxVolume = Math.max(totalBuyVolume, totalSellVolume);

            bars.forEach((bar) => {
                const topY = volumeYScale(bar.volume);
                const height = baselineY - topY;

                // Nested Widths Pattern:
                // If this bar is smaller than the day's max (or equal but we want one to be inner),
                // we adjust width. If both are equal, we can arbitrarily shrink one,
                // or keep both full width (which blends colors).
                // Better UX: If volumes are distinct, shrink the smaller one.
                // If volumes are exactly equal, shrink 'sell' to make it look like a "core" inside "buy"?
                // Or just keep them same size.
                // Let's go with: strictly smaller volume gets smaller width.

                let actualWidth = barWidth;
                if (bar.volume < dayMaxVolume) {
                    actualWidth = barWidth * 0.5; // 4px if base is 8px
                } else if (
                    bars.length === 2 &&
                    totalBuyVolume === totalSellVolume &&
                    bar.type === 'sell'
                ) {
                    // Tie-breaker: if equal, make sell bar narrower so both are seen
                    actualWidth = barWidth * 0.5;
                }

                const currentX = x - actualWidth / 2;

                if (height > 0) {
                    allVolumeRects.push({
                        timestamp,
                        x: currentX,
                        width: actualWidth,
                        topY,
                        height,
                        fill: bar.fill,
                        stroke: bar.stroke,
                        order: actualWidth < barWidth ? 1 : 0, // Draw narrower bars (1) after wider bars (0)
                    });
                }
            });
        });

        allVolumeRects
            .sort((a, b) => {
                if (a.height !== b.height) {
                    return b.height - a.height; // draw taller bars first so shorter remain visible
                }
                if (a.timestamp !== b.timestamp) {
                    return a.timestamp - b.timestamp;
                }
                return a.order - b.order;
            })
            .forEach((rect) => {
                ctx.fillStyle = rect.fill;
                ctx.fillRect(rect.x, rect.topY, rect.width, rect.height);

                ctx.strokeStyle = rect.stroke;
                ctx.lineWidth = 1;
                ctx.strokeRect(rect.x, rect.topY, rect.width, rect.height);
            });
    }

    const chartBounds = {
        top: padding.top,
        bottom: volumeHeight > 0 ? volumeTop : padding.top + plotHeight,
        left: padding.left,
        right: padding.left + plotWidth,
    };

    if (showMarkersConfig && markerGroups.size > 0) {
        markerGroups.forEach((group, timestamp) => {
            const x = xScale(timestamp);

            const sortedBuys = [...group.buys].sort((a, b) => b.radius - a.radius);
            let buyOffset = 8;
            sortedBuys.forEach((marker) => {
                const y = yScale(marker.amount) - buyOffset - marker.radius;
                drawMarker(ctx, x, y, marker.radius, true, colors, chartBounds);
                buyOffset += marker.radius * 2 + 4;
            });

            const sortedSells = [...group.sells].sort((a, b) => b.radius - a.radius);
            let sellOffset = 8;
            sortedSells.forEach((marker) => {
                const y = yScale(marker.amount) + sellOffset + marker.radius;
                drawMarker(ctx, x, y, marker.radius, false, colors, chartBounds);
                sellOffset += marker.radius * 2 + 4;
            });
        });
    }

    const sortedSeries = animatedSeries
        .map((series) => ({ ...series }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    let hasAnimatedSeries = false;

    const areaBaselineY = drawdownMode ? yScale(0) : chartBounds.bottom;

    // Line chart clipping is now handled by the global clip above,
    // but we might want to restrict it further to just the plot area (excluding volume)
    // However, since volume is below, and line chart is above, they don't overlap much.
    // But to be safe and consistent with previous logic:

    sortedSeries.forEach((series, index) => {
        const coords = series.coords || [];
        if (coords.length === 0) {
            return;
        }

        // Apply gradient effect for balance chart lines
        const gradientStops = BALANCE_GRADIENTS[series.key];
        if (gradientStops) {
            const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + plotWidth, 0);
            gradient.addColorStop(0, gradientStops[0]);
            gradient.addColorStop(1, gradientStops[1]);
            ctx.strokeStyle = gradient;
        } else {
            ctx.strokeStyle = series.color;
        }

        if (mountainFill.enabled) {
            const gradientStops = BALANCE_GRADIENTS[series.key];
            const colorStops =
                gradientStops && gradientStops.length === 2
                    ? gradientStops
                    : [series.color, series.color];

            drawMountainFill(ctx, coords, areaBaselineY, {
                color: series.color,
                colorStops,
                opacityTop: drawdownMode ? 0 : 0.35,
                opacityBottom: drawdownMode ? 0.35 : 0,
                bounds: chartBounds,
            });
        }

        ctx.beginPath();
        coords.forEach((coord, coordIndex) => {
            if (coordIndex === 0) {
                ctx.moveTo(coord.x, coord.y);
            } else {
                ctx.lineTo(coord.x, coord.y);
            }
        });
        ctx.lineWidth = series.lineWidth;
        ctx.stroke();

        if (contributionAnimationEnabled) {
            // Use gradient end color for glow effect
            const glowColor = gradientStops ? gradientStops[1] : series.color;
            drawSeriesGlow(
                ctx,
                { coords, color: glowColor, lineWidth: series.lineWidth },
                {
                    basePhase: animationPhase,
                    seriesIndex: index,
                    isMobile,
                    chartKey: 'contribution',
                }
            );
            hasAnimatedSeries = true;
        }
    });

    // ctx.restore(); // Removed inner restore, will restore at the end

    if (contributionAnimationEnabled && hasAnimatedSeries) {
        scheduleContributionAnimation(chartManager);
    } else {
        stopContributionAnimation();
    }

    // Draw start and end values using raw data to ensure accuracy (or transformed data for drawdown)
    const labelContributionData = drawdownMode ? finalContributionData : rawContributionData;
    if (showChartLabels && showContribution && labelContributionData.length > 0) {
        const contributionGradient = BALANCE_GRADIENTS['contribution'];
        const contributionStartColor = contributionGradient
            ? contributionGradient[0]
            : colors.contribution;
        const contributionEndColor = contributionGradient
            ? contributionGradient[1]
            : colors.contribution;

        const firstContribution =
            labelContributionData.find((item) => item.synthetic) ||
            labelContributionData.find((item) => {
                if (typeof item.orderType !== 'string') {
                    return true;
                }
                return item.orderType.toLowerCase() !== 'padding';
            }) ||
            labelContributionData[0];
        if (firstContribution) {
            const firstContributionX = xScale(firstContribution.date.getTime());
            const firstContributionY = yScale(
                drawdownMode ? firstContribution.amount : firstContribution.amount
            );
            firstContributionLabelY = drawStartValue(
                ctx,
                firstContributionX,
                firstContributionY,
                firstContribution.amount,
                contributionStartColor,
                isMobile,
                padding,
                plotWidth,
                plotHeight,
                formatContributionAnnotationValue,
                true
            );
        }

        const lastContribution = labelContributionData[labelContributionData.length - 1];
        const lastContributionX = xScale(lastContribution.date.getTime());
        const lastContributionY = yScale(lastContribution.amount);
        contributionEndLabelY = drawEndValue(
            ctx,
            lastContributionX,
            lastContributionY,
            lastContribution.amount,
            contributionEndColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatContributionAnnotationValue,
            true
        );
    }

    const labelBalanceData = drawdownMode ? finalBalanceData : rawBalanceData;
    if (showChartLabels && showBalance && labelBalanceData.length > 0) {
        const balanceGradient = BALANCE_GRADIENTS['balance'];
        const balanceStartColor = balanceGradient ? balanceGradient[0] : colors.portfolio;
        const balanceEndColor = balanceGradient ? balanceGradient[1] : colors.portfolio;

        const firstBalance = labelBalanceData[0];
        const firstBalanceX = xScale(firstBalance.date.getTime());
        let firstBalanceY = yScale(firstBalance.value);
        if (firstContributionLabelY !== null) {
            const minGap = isMobile ? 18 : 14;
            if (Math.abs(firstBalanceY - firstContributionLabelY) < minGap) {
                if (firstBalanceY >= firstContributionLabelY) {
                    firstBalanceY = Math.min(
                        firstBalanceY + minGap,
                        padding.top + plotHeight - minGap / 2
                    );
                } else {
                    firstBalanceY = Math.max(firstBalanceY - minGap, padding.top + minGap / 2);
                }
            }
        }
        drawStartValue(
            ctx,
            firstBalanceX,
            firstBalanceY,
            firstBalance.value,
            balanceStartColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatBalanceValue,
            true
        );

        const lastBalance = labelBalanceData[labelBalanceData.length - 1];
        const lastBalanceX = xScale(lastBalance.date.getTime());
        let lastBalanceY = yScale(lastBalance.value);
        if (contributionEndLabelY !== null) {
            const minGap = isMobile ? 18 : 14;
            if (Math.abs(lastBalanceY - contributionEndLabelY) < minGap) {
                if (lastBalanceY >= contributionEndLabelY) {
                    lastBalanceY = Math.min(
                        lastBalanceY + minGap,
                        padding.top + plotHeight - minGap / 2
                    );
                } else {
                    lastBalanceY = Math.max(lastBalanceY - minGap, padding.top + minGap / 2);
                }
            }
        }
        drawEndValue(
            ctx,
            lastBalanceX,
            lastBalanceY,
            lastBalance.value,
            balanceEndColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatBalanceValue,
            true
        );
    }

    ctx.restore(); // Restore the global clip

    if (legendState.contributionDirty) {
        // Use gradient end colors for legend
        const contributionGradient = BALANCE_GRADIENTS['contribution'];
        const balanceGradient = BALANCE_GRADIENTS['balance'];
        const legendSeries = [
            {
                key: 'contribution',
                name: 'Contribution',
                color: contributionGradient ? contributionGradient[1] : colors.contribution,
            },
        ];
        if (hasBalanceSeries) {
            legendSeries.push({
                key: 'balance',
                name: 'Balance',
                color: balanceGradient ? balanceGradient[1] : colors.portfolio,
            });
        }
        legendSeries.push({ key: 'buy', name: 'Buy', color: colors.buy });
        legendSeries.push({ key: 'sell', name: 'Sell', color: colors.sell });
        updateLegend(legendSeries, chartManager);
        legendState.contributionDirty = false;
    }

    const normalizeToDay = (time) => {
        const day = new Date(time);
        day.setHours(0, 0, 0, 0);
        return day.getTime();
    };

    const baseSeries = animatedSeries.map((series) => {
        const displayLabel = series.key === 'balance' ? 'Balance' : 'Contribution';
        let displayColor = series.color;
        if (series.key === 'balance') {
            displayColor =
                (BALANCE_GRADIENTS.balance && BALANCE_GRADIENTS.balance[1]) || colors.portfolio;
        } else if (series.key === 'contribution') {
            displayColor =
                (BALANCE_GRADIENTS.contribution && BALANCE_GRADIENTS.contribution[1]) ||
                colors.contribution;
        }
        return {
            key: series.key,
            label: displayLabel,
            color: displayColor,
            getValueAtTime: createTimeInterpolator(series.data),
            formatValue: formatBalanceValue,
            formatDelta: (delta) => formatCurrencyInline(delta),
        };
    });

    const volumeSeries = [];
    const makeVolumeGetter = (map) => (time) => {
        const value = map.get(normalizeToDay(time));
        return Number.isFinite(value) ? value : 0;
    };

    volumeSeries.push({
        key: 'buyVolume',
        label: 'Buy',
        color: colors.buy,
        getValueAtTime: makeVolumeGetter(buyVolumeMap),
        formatValue: formatCurrencyInline,
        includeInRangeSummary: false,
        drawMarker: false,
    });

    volumeSeries.push({
        key: 'sellVolume',
        label: 'Sell',
        color: colors.sell,
        getValueAtTime: makeVolumeGetter(sellVolumeMap),
        formatValue: formatCurrencyInline,
        includeInRangeSummary: false,
        drawMarker: false,
    });

    const layoutKey = drawdownMode ? 'drawdownAbs' : 'contribution';
    chartLayouts[layoutKey] = {
        key: layoutKey,
        minTime,
        maxTime,
        valueType: 'currency',
        padding,
        chartBounds,
        xScale,
        yScale,
        invertX: (pixelX) => {
            if (!Number.isFinite(pixelX)) {
                return minTime;
            }
            const clampedX = Math.max(padding.left, Math.min(padding.left + plotWidth, pixelX));
            if (plotWidth <= 0 || maxTime === minTime) {
                return minTime;
            }
            const ratio = (clampedX - padding.left) / plotWidth;
            return clampTime(minTime + ratio * (maxTime - minTime), minTime, maxTime);
        },
        series: [...baseSeries, ...volumeSeries],
    };

    drawCrosshairOverlay(ctx, chartLayouts[layoutKey]);

    if (contributionAnimationEnabled && hasAnimatedSeries) {
        scheduleContributionAnimation(chartManager);
    } else {
        stopContributionAnimation();
    }
}
