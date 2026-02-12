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
import { drawAxes, drawStartValue, drawEndValue, drawMountainFill } from '../core.js';
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
    applyDrawdownToSeries,
    computeAppreciationSeries,
} from '../data/contribution.js';
import { drawVolumeChart, drawContributionMarkers } from './contributionComponents.js';
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
import {
    injectSyntheticStartPoint,
    injectCarryForwardStartPoint,
    constrainSeriesToRange,
} from '../helpers.js';
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
    const showAppreciation = visibility.appreciation !== false && hasBalanceSeries;
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

    // Map contribution data to use 'value' key for compatibility with helper functions
    const mappedContributionSource = (contributionSource || []).map((item) => ({
        ...item,
        date: item.tradeDate || item.date,
        value: item.amount,
    }));

    // Use injectCarryForwardStartPoint to carry forward cumulative contribution value at filter start
    const filteredContributionData = filterDataByDateRange(mappedContributionSource);
    const rawContributionData = injectCarryForwardStartPoint(
        filteredContributionData,
        mappedContributionSource,
        filterFrom,
        'value'
    ).map((item) => ({ ...item, date: parseLocalDate(item.date), amount: item.value }));

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
        // Calculate historical peak from full series (before filter) for accurate drawdown
        let contributionHistoricalPeak = -Infinity;
        let balanceHistoricalPeak = -Infinity;

        if (filterFrom) {
            const filterFromTime = filterFrom.getTime();
            // Find peak in contribution data before filter start
            (mappedContributionSource || []).forEach((item) => {
                const itemDate = new Date(item.date);
                if (itemDate.getTime() < filterFromTime && Number.isFinite(item.value)) {
                    contributionHistoricalPeak = Math.max(contributionHistoricalPeak, item.value);
                }
            });
            // Find peak in balance data before filter start
            (mappedBalanceSource || []).forEach((item) => {
                const itemDate = item.date instanceof Date ? item.date : new Date(item.date);
                if (itemDate.getTime() < filterFromTime && Number.isFinite(item.value)) {
                    balanceHistoricalPeak = Math.max(balanceHistoricalPeak, item.value);
                }
            });
        }

        finalContributionData = applyDrawdownToSeries(
            contributionData,
            'amount',
            contributionHistoricalPeak
        );
        finalBalanceData = applyDrawdownToSeries(balanceData, 'value', balanceHistoricalPeak);
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
        // Use the first point (including synthetic start point) for consistency with balance data
        effectiveMinTimes.push(rawContributionData[0].date.getTime());
    }

    if (showBalance && rawBalanceData.length > 0) {
        effectiveMinTimes.push(rawBalanceData[0].date.getTime());
    }

    const fallbackMinTime = allTimes.length > 0 ? Math.min(...allTimes) : Date.now();
    let minTime = effectiveMinTimes.length > 0 ? Math.min(...effectiveMinTimes) : fallbackMinTime;

    if (Number.isFinite(filterFromTime)) {
        // Ensure minTime is at least the filter start time, but don't extend before actual data
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

    // Compute appreciation data: balance − contribution at aligned timestamps
    const appreciationData =
        !drawdownMode && showAppreciation
            ? computeAppreciationSeries(finalBalanceData, finalContributionData)
            : [];

    const contributionValues = finalContributionData.map((item) => item.amount);
    const balanceValues = finalBalanceData.map((item) => item.value);
    const appreciationValues = appreciationData.map((item) => item.value);
    const combinedValues = [...contributionValues, ...balanceValues, ...appreciationValues].filter(
        (value) => Number.isFinite(value)
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

    if (showAppreciation && appreciationData.length > 0) {
        const appreciationGradient = BALANCE_GRADIENTS['appreciation'];
        animatedSeries.push({
            key: 'appreciation',
            color: appreciationGradient ? appreciationGradient[1] : '#FF8E53',
            lineWidth: CHART_LINE_WIDTHS.appreciation ?? 1,
            order: 1.5,
            data: appreciationData
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

    // Draw divider line between line chart and volume chart
    if (volumeHeight > 0) {
        const dividerY = padding.top + plotHeight + volumeGap / 2;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(padding.left, dividerY);
        ctx.lineTo(padding.left + plotWidth, dividerY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }

    const { buyVolumeMap, sellVolumeMap } = drawVolumeChart(ctx, rawContributionData, {
        showBuy,
        showSell,
        minTime,
        maxTime,
        volumeHeight,
        volumeTop,
        padding,
        plotWidth,
        xScale,
        formatCurrencyCompact,
        selectedCurrency: transactionState.selectedCurrency || 'USD',
        volumeGap,
    });

    const chartBounds = {
        top: padding.top,
        bottom: volumeHeight > 0 ? volumeTop : padding.top + plotHeight,
        left: padding.left,
        right: padding.left + plotWidth,
    };

    drawContributionMarkers(ctx, rawContributionData, {
        showMarkersConfig: CHART_MARKERS?.showContributionMarkers !== false,
        showBuy,
        showSell,
        minTime,
        maxTime,
        xScale,
        yScale,
        bounds: chartBounds,
        colors,
    });

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
    const labelBounds = [];

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
            const startBounds = drawStartValue(
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
            if (startBounds) {
                labelBounds.push(startBounds);
            }
        }

        const lastContribution = labelContributionData[labelContributionData.length - 1];
        const lastContributionX = xScale(lastContribution.date.getTime());
        const lastContributionY = yScale(lastContribution.amount);
        const endBounds = drawEndValue(
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
            true,
            labelBounds
        );
        if (endBounds) {
            labelBounds.push(endBounds);
        }
    }

    const labelBalanceData = drawdownMode ? finalBalanceData : rawBalanceData;
    if (showChartLabels && showBalance && labelBalanceData.length > 0) {
        const balanceGradient = BALANCE_GRADIENTS['balance'];
        const balanceStartColor = balanceGradient ? balanceGradient[0] : colors.portfolio;
        const balanceEndColor = balanceGradient ? balanceGradient[1] : colors.portfolio;

        const firstBalance = labelBalanceData[0];
        const firstBalanceX = xScale(firstBalance.date.getTime());
        const firstBalanceY = yScale(firstBalance.value);
        const balStartBounds = drawStartValue(
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
            true,
            labelBounds
        );
        if (balStartBounds) {
            labelBounds.push(balStartBounds);
        }

        const lastBalance = labelBalanceData[labelBalanceData.length - 1];
        const lastBalanceX = xScale(lastBalance.date.getTime());
        const lastBalanceY = yScale(lastBalance.value);
        const balEndBounds = drawEndValue(
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
            true,
            labelBounds
        );
        if (balEndBounds) {
            labelBounds.push(balEndBounds);
        }
    }

    // Draw appreciation labels (only in non-drawdown mode)
    if (showChartLabels && showAppreciation && !drawdownMode && appreciationData.length > 0) {
        const appreciationGradient = BALANCE_GRADIENTS['appreciation'];
        const appreciationStartColor = appreciationGradient ? appreciationGradient[0] : '#FF8E53';
        const appreciationEndColor = appreciationGradient ? appreciationGradient[1] : '#FF8E53';

        const firstAppreciation = appreciationData[0];
        const firstAppreciationX = xScale(firstAppreciation.date.getTime());
        const firstAppreciationY = yScale(firstAppreciation.value);
        const apprStartBounds = drawStartValue(
            ctx,
            firstAppreciationX,
            firstAppreciationY,
            firstAppreciation.value,
            appreciationStartColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatBalanceValue,
            true,
            labelBounds
        );
        if (apprStartBounds) {
            labelBounds.push(apprStartBounds);
        }

        const lastAppreciation = appreciationData[appreciationData.length - 1];
        const lastAppreciationX = xScale(lastAppreciation.date.getTime());
        const lastAppreciationY = yScale(lastAppreciation.value);
        const apprEndBounds = drawEndValue(
            ctx,
            lastAppreciationX,
            lastAppreciationY,
            lastAppreciation.value,
            appreciationEndColor,
            isMobile,
            padding,
            plotWidth,
            plotHeight,
            formatBalanceValue,
            true,
            labelBounds
        );
        if (apprEndBounds) {
            labelBounds.push(apprEndBounds);
        }
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
        if (hasBalanceSeries) {
            const appreciationGradient = BALANCE_GRADIENTS['appreciation'];
            legendSeries.push({
                key: 'appreciation',
                name: 'Appreciation',
                color: appreciationGradient ? appreciationGradient[1] : '#FF8E53',
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

    const seriesDisplayLabels = {
        balance: 'Balance',
        contribution: 'Contribution',
        appreciation: 'Appreciation',
    };

    const baseSeries = animatedSeries.map((series) => {
        const displayLabel = seriesDisplayLabels[series.key] || series.key;
        let displayColor = series.color;
        if (series.key === 'balance') {
            displayColor =
                (BALANCE_GRADIENTS.balance && BALANCE_GRADIENTS.balance[1]) || colors.portfolio;
        } else if (series.key === 'contribution') {
            displayColor =
                (BALANCE_GRADIENTS.contribution && BALANCE_GRADIENTS.contribution[1]) ||
                colors.contribution;
        } else if (series.key === 'appreciation') {
            displayColor =
                (BALANCE_GRADIENTS.appreciation && BALANCE_GRADIENTS.appreciation[1]) || '#FF8E53';
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
