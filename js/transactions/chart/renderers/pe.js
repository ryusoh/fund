import { logger } from '../../../utils/logger.js';
import { transactionState } from '../../state.js';
import { chartLayouts } from '../state.js';
import { mountainFill, CHART_LINE_WIDTHS } from '../../../config.js';
import { BENCHMARK_GRADIENTS } from '../config.js';
import {
    stopPerformanceAnimation,
    stopContributionAnimation,
    stopFxAnimation,
    stopPeAnimation,
    stopConcentrationAnimation,
    isAnimationEnabled,
    advancePeAnimation,
    schedulePeAnimation,
    drawSeriesGlow,
} from '../animation.js';
import { updateCrosshairUI, updateLegend, drawCrosshairOverlay } from '../interaction.js';
import { drawAxes, drawMountainFill, drawEndValue } from '../core.js';
import { getChartColors, createTimeInterpolator, clampTime, parseLocalDate } from '../helpers.js';

import { fetchRealTimeData } from '../../realtimeData.js';

// Data cache
let peDataCache = null;
let peDataLoading = false;

/**
 * Recompute realtime PE values using the same EPS basis as the historical
 * pipeline: last historical PE scaled by the price change since the last
 * pipeline run. This prevents a jump caused by mixing the pipeline's
 * point-in-time EPS with a different EPS source from analysis JSON.
 * @param {Object} data - Historical pe_ratio.json payload.
 * @param {Object} realtime - Realtime payload from fetchRealTimeData.
 * @returns {Object} Realtime payload with scaled PE values.
 */
function _computeScaledTickerPe(ticker, lastIdx, lastHistoricalPe, lastHistoricalPrices, realtime) {
    const historicalPe = lastHistoricalPe[ticker]?.[lastIdx];
    const historicalPrice = lastHistoricalPrices[ticker];
    if (
        Number.isFinite(historicalPe) &&
        historicalPe > 0 &&
        Number.isFinite(historicalPrice) &&
        historicalPrice > 0
    ) {
        const currentPrice = parseFloat(realtime.prices?.[ticker]) || 0;
        if (currentPrice > 0) {
            return historicalPe * (currentPrice / historicalPrice);
        }
    }
    // Fallback for tickers without historical data (new holdings)
    return realtime.tickerPEs?.[ticker] || null;
}

function _scaleRealtimePeToHistoricalBasis(data, realtime) {
    if (!data || !realtime || !Array.isArray(data.dates) || data.dates.length === 0) {
        return realtime;
    }
    const lastIdx = data.dates.length - 1;
    const lastHistoricalPe = data.ticker_pe || {};
    const lastHistoricalPrices = data.ticker_prices || {};
    const holdings = realtime.holdings || {};
    const scaledTickerPEs = {};
    let weightSum = 0;
    let weightedYieldSum = 0;

    const tickers = Object.keys(holdings);
    for (let i = 0; i < tickers.length; i += 1) {
        const ticker = tickers[i];
        const shares = parseFloat(holdings[ticker]?.shares) || 0;
        const currentPrice = parseFloat(realtime.prices?.[ticker]) || 0;
        if (shares <= 0 || currentPrice <= 0) {
            continue;
        }
        const value = shares * currentPrice;
        const pe = _computeScaledTickerPe(
            ticker,
            lastIdx,
            lastHistoricalPe,
            lastHistoricalPrices,
            realtime
        );
        if (Number.isFinite(pe) && pe > 0) {
            scaledTickerPEs[ticker] = pe;
            weightedYieldSum += value / pe;
            weightSum += value;
        }
    }

    // If we couldn't scale any ticker (missing holdings/prices or no historical
    // data), fall back to the original realtime values so the merge still works.
    if (weightSum <= 0 || weightedYieldSum <= 0) {
        return realtime;
    }

    const portfolioPE = weightSum / weightedYieldSum;

    return {
        ...realtime,
        pe: portfolioPE,
        tickerPEs: scaledTickerPEs,
    };
}

/**
 * Load PE ratio data from the backend JSON and merge real-time data if available.
 * @returns {Promise<Object|null>}
 */

function _updateSingleTickerMap(dataMap, realtimeMap, idx, isAppend) {
    const keys = Object.keys(dataMap || {});
    for (let k = 0; k < keys.length; k += 1) {
        const ticker = keys[k];
        if (isAppend) {
            dataMap[ticker].push(realtimeMap[ticker] || null);
        } else {
            dataMap[ticker][idx] = realtimeMap[ticker] || null;
        }
    }
}

function _updateTickerArrays(data, realtimeData, idx, isAppend) {
    _updateSingleTickerMap(data.ticker_pe, realtimeData.tickerPEs, idx, isAppend);
    _updateSingleTickerMap(data.ticker_weights, realtimeData.tickerWeights, idx, isAppend);
}

function _addNewTickerEntries(dataMap, realtimeMap, idx) {
    const keys = Object.keys(realtimeMap || {});
    for (let k = 0; k < keys.length; k += 1) {
        const ticker = keys[k];
        if (!dataMap[ticker]) {
            dataMap[ticker] = new Array(idx + 1).fill(null);
            dataMap[ticker][idx] = realtimeMap[ticker];
        }
    }
}

function _addNewTickers(data, realtimeData, idx) {
    data.ticker_pe = data.ticker_pe || {};
    data.ticker_weights = data.ticker_weights || {};

    _addNewTickerEntries(data.ticker_pe, realtimeData.tickerPEs, idx);
    _addNewTickerEntries(data.ticker_weights, realtimeData.tickerWeights, idx);
}

function _updateForwardPE(data, realtimeData) {
    if (realtimeData.forwardPe !== null) {
        data.forward_pe = data.forward_pe || {};
        data.forward_pe.portfolio_forward_pe = realtimeData.forwardPe;
        if (!data.forward_pe.target_date) {
            const parts = realtimeData.date.split('-');
            if (parts.length === 3) {
                parts[0] = String(Number(parts[0]) + 1);
                data.forward_pe.target_date = parts.join('-');
            }
        }
    }
}

function _mergeRealtimeData(data, scaledRealtime) {
    if (!data || !scaledRealtime || !scaledRealtime.date || scaledRealtime.pe === null) {
        return;
    }
    const lastDate = data.dates[data.dates.length - 1];
    if (lastDate > scaledRealtime.date) {
        return;
    }

    if (lastDate === scaledRealtime.date) {
        data.portfolio_pe[data.portfolio_pe.length - 1] = scaledRealtime.pe;
        const idx = data.dates.length - 1;
        _updateTickerArrays(data, scaledRealtime, idx, false);
    } else {
        data.dates.push(scaledRealtime.date);
        data.portfolio_pe.push(scaledRealtime.pe);
        _updateTickerArrays(data, scaledRealtime, null, true);
    }

    const idx = data.dates.length - 1;
    _addNewTickers(data, scaledRealtime, idx);
    _updateForwardPE(data, scaledRealtime);
}

export async function loadPEData() {
    try {
        const [response, realtime] = await Promise.all([
            fetch('../data/output/figures/pe_ratio.json').catch(() => null),
            fetchRealTimeData().catch((err) => {
                logger.warn('Real-time PE data fetch failed:', err);
                return null;
            }),
        ]);

        let data = null;
        if (response && response.ok) {
            data = await response.json();
        }

        // Scale realtime PEs to the historical EPS basis so the realtime point
        // doesn't jump when the portfolio value barely moves.
        const scaledRealtime = _scaleRealtimePeToHistoricalBasis(data, realtime);

        _mergeRealtimeData(data, scaledRealtime);

        if (!data) {
            // eslint-disable-next-line no-console
            console.warn('pe_ratio.json not found');
            return null;
        }

        return data;
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load PE data:', error);
        return null;
    }
}

/**
 * Build a PE ratio time-series from pre-computed PE data.
 *
 * @param {string[]} dates - Array of date strings.
 * @param {(number|null)[]} portfolioPE - Portfolio-weighted PE values.
 * @param {Object} tickerPE - Map of ticker → array of PE values.
 * @param {Object} tickerWeights - Map of ticker → array of weights.
 * @param {Date|null} filterFrom - Optional start date filter.
 * @param {Date|null} filterTo - Optional end date filter.
 * @returns {{ date: Date, pe: number, tickerPEs: Object, tickerWeights: Object }[]}
 */
export function buildPESeries(dates, portfolioPE, tickerPE, tickerWeights, filterFrom, filterTo) {
    if (!Array.isArray(dates) || dates.length === 0) {
        return [];
    }
    if (!Array.isArray(portfolioPE) || portfolioPE.length === 0) {
        return [];
    }

    const result = [];

    for (let i = 0; i < dates.length; i += 1) {
        const dateStr = dates[i];
        const date = parseLocalDate(dateStr);
        if (!date || Number.isNaN(date.getTime())) {
            continue;
        }
        if (filterFrom && date < filterFrom) {
            continue;
        }
        if (filterTo && date > filterTo) {
            continue;
        }

        const pe = portfolioPE[i];
        if (pe === null || pe === undefined || !Number.isFinite(pe)) {
            continue;
        }

        // Gather per-ticker PE values and weights for crosshair
        // Bolt: Use explicit loops instead of .forEach to eliminate closure allocations and reduce GC overhead
        const dayTickerPEs = {};
        if (tickerPE && typeof tickerPE === 'object') {
            const keys = Object.keys(tickerPE);
            for (let k = 0; k < keys.length; k += 1) {
                const ticker = keys[k];
                const val = tickerPE[ticker][i];
                if (val !== null && val !== undefined && Number.isFinite(val)) {
                    dayTickerPEs[ticker] = val;
                }
            }
        }

        const dayTickerWeights = {};
        if (tickerWeights && typeof tickerWeights === 'object') {
            const keys = Object.keys(tickerWeights);
            for (let k = 0; k < keys.length; k += 1) {
                const ticker = keys[k];
                const val = tickerWeights ? tickerWeights[ticker][i] : null;
                if (val !== null && val !== undefined && Number.isFinite(val)) {
                    dayTickerWeights[ticker] = val;
                }
            }
        }

        result.push({ date, pe, tickerPEs: dayTickerPEs, tickerWeights: dayTickerWeights });
    }

    return result;
}

/**
 * @param {Array} series
 * @param {Date|null} filterFrom
 * @returns {Object}
 */
function _computePEMinMaxTime(series, filterFrom) {
    let minTime = Infinity;
    let maxTime = -Infinity;
    for (let i = 0; i < series.length; i += 1) {
        const time = series[i].date.getTime();
        if (time < minTime) {
            minTime = time;
        }
        if (time > maxTime) {
            maxTime = time;
        }
    }

    const filterFromTime = filterFrom ? filterFrom.getTime() : null;
    if (Number.isFinite(filterFromTime) && filterFromTime > minTime) {
        minTime = filterFromTime;
    }
    return { minTime, maxTime };
}

function _calcPortfolioForwardPEValue(forwardPE, lastPt) {
    const msciRatio = forwardPE.msci_pe_ratio;
    if (!(msciRatio?.ratio > 0 && lastPt?.tickerPEs?.VT > 0 && lastPt?.tickerWeights)) {
        return forwardPE.portfolio_forward_pe;
    }

    const tickerFwdPE = forwardPE.ticker_forward_pe || {};
    const vtDerivedFwdPE = lastPt.tickerPEs.VT / msciRatio.ratio;
    let weightedYieldSum = 0;
    let weightSum = 0;

    const weights = Object.entries(lastPt.tickerWeights);
    for (let i = 0; i < weights.length; i += 1) {
        const [ticker, weight] = weights[i];
        if (!Number.isFinite(weight) || weight <= 0) {
            continue;
        }
        let fwdPe = ticker === 'VT' ? vtDerivedFwdPE : tickerFwdPE[ticker];
        if (!Number.isFinite(fwdPe) || fwdPe <= 0) {
            fwdPe = lastPt.tickerPEs[ticker];
        }
        if (Number.isFinite(fwdPe) && fwdPe > 0) {
            weightedYieldSum += weight * (1 / fwdPe);
            weightSum += weight;
        }
    }

    if (weightedYieldSum > 0 && weightSum > 0) {
        return 1 / (weightedYieldSum / weightSum);
    }
    return forwardPE.portfolio_forward_pe;
}

function _computePEForwardTime(series, forwardPE, filterTo, maxTime) {
    let forwardTargetTime = null;
    let forwardPEValue = null;
    let newMaxTime = maxTime;

    if (!(forwardPE && forwardPE.target_date && forwardPE.portfolio_forward_pe && !filterTo)) {
        return { forwardTargetTime, forwardPEValue, maxTime: newMaxTime };
    }

    const targetDate = parseLocalDate(forwardPE.target_date);
    if (targetDate && !Number.isNaN(targetDate.getTime())) {
        forwardTargetTime = targetDate.getTime();
        const lastPt = series[series.length - 1];
        forwardPEValue = _calcPortfolioForwardPEValue(forwardPE, lastPt);
        newMaxTime = Math.max(maxTime, forwardTargetTime);
    }

    return { forwardTargetTime, forwardPEValue, maxTime: newMaxTime };
}

function _computePEMinMaxValues(series, forwardPEValue) {
    let dataMin = Infinity;
    let dataMax = -Infinity;
    for (let i = 0; i < series.length; i += 1) {
        const pe = series[i].pe;
        if (pe < dataMin) {
            dataMin = pe;
        }
        if (pe > dataMax) {
            dataMax = pe;
        }
    }
    if (forwardPEValue !== null && forwardPEValue > dataMax) {
        dataMax = forwardPEValue;
    }
    return { dataMin, dataMax };
}

function _buildPEBenchmarkSeries(benchmarkData, dates, filterFrom, filterTo) {
    const benchmarkSeriesMap = {};
    const benchmarkKeys = Object.keys(benchmarkData);
    for (let i = 0; i < benchmarkKeys.length; i += 1) {
        const bmkKey = benchmarkKeys[i];
        const bmkPE = benchmarkData[bmkKey];
        if (!Array.isArray(bmkPE)) {
            continue;
        }
        const bmkSeries = buildPESeries(dates, bmkPE, null, null, filterFrom, filterTo);
        if (bmkSeries.length > 0) {
            benchmarkSeriesMap[bmkKey] = bmkSeries;
        }
    }
    return benchmarkSeriesMap;
}

function _updatePEBenchmarkValues(benchmarkData, benchmarkSeriesMap, benchmarkFwdPE, dataMax) {
    let visibleBenchmarkKey = null;
    let max = dataMax;

    if (benchmarkData['^GSPC']) {
        visibleBenchmarkKey = '^GSPC';
    }

    if (visibleBenchmarkKey && benchmarkSeriesMap[visibleBenchmarkKey]) {
        const bmkSeries = benchmarkSeriesMap[visibleBenchmarkKey];
        for (let i = 0; i < bmkSeries.length; i += 1) {
            const pe = bmkSeries[i].pe;
            if (pe > max) {
                max = pe;
            }
        }
        const bmkFwdVal = benchmarkFwdPE[visibleBenchmarkKey];
        if (typeof bmkFwdVal === 'number' && bmkFwdVal > max) {
            max = bmkFwdVal;
        }
    }
    return { visibleBenchmarkKey, updatedDataMax: max };
}

function _drawPEBenchmarkMountainFillAndLine(ctx, bmkCoords, bmkColor, bmkGradientStops, padding, plotHeight, plotWidth, lineThickness) {
    const bmkGradient = ctx.createLinearGradient(0, padding.top, 0, plotHeight + padding.top);
    bmkGradient.addColorStop(0, `${bmkColor}33`);
    bmkGradient.addColorStop(1, `${bmkColor}00`);

    ctx.beginPath();
    if (bmkCoords.length > 0) {
        ctx.moveTo(bmkCoords[0].x, plotHeight + padding.top);
        for (let i = 0; i < bmkCoords.length; i += 1) {
            ctx.lineTo(bmkCoords[i].x, bmkCoords[i].y);
        }
        ctx.lineTo(bmkCoords[bmkCoords.length - 1].x, plotHeight + padding.top);
    }
    ctx.closePath();
    ctx.fillStyle = bmkGradient;
    ctx.fill();

    if (bmkGradientStops.length === 2) {
        const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + plotWidth, 0);
        gradient.addColorStop(0, bmkGradientStops[0]);
        gradient.addColorStop(1, bmkGradientStops[1]);
        ctx.strokeStyle = gradient;
    } else {
        ctx.strokeStyle = bmkColor;
    }
    ctx.beginPath();
    ctx.lineWidth = Math.max(1, lineThickness - 0.5);
    ctx.globalAlpha = 0.8;
    if (bmkCoords.length > 0) {
        ctx.moveTo(bmkCoords[0].x, bmkCoords[0].y);
        for (let i = 1; i < bmkCoords.length; i += 1) {
            ctx.lineTo(bmkCoords[i].x, bmkCoords[i].y);
        }
    }
    ctx.stroke();
    ctx.globalAlpha = 1.0;
}

function _drawBmkFwdSegment(ctx, args, bmkLastX, bmkLastY, bmkFwdX, bmkFwdY) {
    const { bmkColor, bmkGradientStops, plotHeight, padding, chartBounds, lineThickness } = args;
    if (mountainFill.enabled) {
        const fwdCoords = [{ x: bmkLastX, y: bmkLastY }, { x: bmkFwdX, y: bmkFwdY }];
        drawMountainFill(ctx, fwdCoords, plotHeight + padding.top, {
            color: bmkColor,
            colorStops: bmkGradientStops,
            opacityTop: 0.1,
            opacityBottom: 0.0,
            bounds: chartBounds,
        });
    }

    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = bmkColor;
    ctx.lineWidth = Math.max(1, lineThickness - 0.5);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(bmkLastX, bmkLastY);
    ctx.lineTo(bmkFwdX, bmkFwdY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
    ctx.restore();
}

function _drawBmkFwdLabel(ctx, args, bmkFwdX, bmkFwdY) {
    const { bmkFwdPE, bmkColor, isMobile, padding, plotWidth, plotHeight, labelBounds, timestamp, chartManager, bmkLastX, bmkLastY, lineThickness } = args;
    if (isAnimationEnabled('pe')) {
        const fwdGlowCoords = [{ x: bmkLastX, y: bmkLastY }, { x: bmkFwdX, y: bmkFwdY }];
        drawSeriesGlow(
            ctx,
            { coords: fwdGlowCoords, color: bmkColor, lineWidth: lineThickness },
            {
                basePhase: advancePeAnimation(timestamp),
                seriesIndex: 1,
                isMobile,
                chartKey: 'pe',
            }
        );
        schedulePeAnimation(chartManager);
    }

    if (args.showLabels) {
        const bounds = drawEndValue(
            ctx, bmkFwdX, bmkFwdY, bmkFwdPE, bmkColor, isMobile,
            padding, plotWidth, plotHeight, (v) => `${v.toFixed(1)}x`, true, null
        );
        if (bounds) {
            labelBounds.push(bounds);
        }
    }
}

function _drawPEBenchmarkFwdLine(ctx, args) {
    const {
        bmkFwdPE, forwardTargetTime, filterTo, bmkLastPoint, xScale, yScale, bmkColor,
        lineThickness, isMobile, timestamp, chartManager
    } = args;

    if (bmkFwdPE && forwardTargetTime !== null && bmkLastPoint && !filterTo) {
        const bmkLastX = xScale(bmkLastPoint.date.getTime());
        const bmkLastY = yScale(bmkLastPoint.pe);
        const bmkFwdX = xScale(forwardTargetTime);
        const bmkFwdY = yScale(bmkFwdPE);

        _drawBmkFwdSegment(ctx, args, bmkLastX, bmkLastY, bmkFwdX, bmkFwdY);
        args.bmkLastX = bmkLastX;
        args.bmkLastY = bmkLastY;
        _drawBmkFwdLabel(ctx, args, bmkFwdX, bmkFwdY);
    } else if (isAnimationEnabled('pe') && bmkLastPoint && !filterTo) {
        const lastCoord = { x: xScale(bmkLastPoint.date.getTime()), y: yScale(bmkLastPoint.pe) };
        drawSeriesGlow(
            ctx,
            { coords: [lastCoord], color: bmkColor, lineWidth: lineThickness },
            {
                basePhase: advancePeAnimation(timestamp),
                seriesIndex: 1,
                isMobile,
                chartKey: 'pe',
            }
        );
        schedulePeAnimation(chartManager);
    }
}

function _drawPEBenchmarkLine(ctx, args) {
    const {
        bmkSeries, bmkGradientStops, bmkColor, xScale, yScale, padding, plotHeight, plotWidth,
        lineThickness, visibleBenchmarkKey, benchmarkFwdPE, forwardTargetTime, filterTo, chartBounds,
        isMobile, timestamp, chartManager, showLabels, labelBounds, benchmarkRendered
    } = args;

    const bmkCoords = new Array(bmkSeries.length);
    for (let i = 0; i < bmkSeries.length; i += 1) {
        const point = bmkSeries[i];
        bmkCoords[i] = {
            x: xScale(point.date.getTime()),
            y: yScale(point.pe),
        };
    }

    _drawPEBenchmarkMountainFillAndLine(ctx, bmkCoords, bmkColor, bmkGradientStops, padding, plotHeight, plotWidth, lineThickness);

    const bmkFwdPE = benchmarkFwdPE[visibleBenchmarkKey];
    const bmkLastPoint = bmkSeries[bmkSeries.length - 1];

    _drawPEBenchmarkFwdLine(ctx, {
        bmkFwdPE, forwardTargetTime, filterTo, bmkLastPoint, xScale, yScale, bmkColor,
        bmkGradientStops, plotHeight, padding, chartBounds, lineThickness,
        isMobile, timestamp, chartManager, showLabels, plotWidth, labelBounds
    });

    if (showLabels && bmkLastPoint) {
        const bmkLastX = xScale(bmkLastPoint.date.getTime());
        const bmkLastY = yScale(bmkLastPoint.pe);
        const bounds = drawEndValue(
            ctx, bmkLastX, bmkLastY, bmkLastPoint.pe, bmkColor, isMobile,
            padding, plotWidth, plotHeight, (v) => `${v.toFixed(1)}x`, true, labelBounds
        );
        if (bounds) {
            labelBounds.push(bounds);
        }
    }

    const bmkPoints = new Array(bmkSeries.length);
    for (let i = 0; i < bmkSeries.length; i += 1) {
        const p = bmkSeries[i];
        bmkPoints[i] = { time: p.date.getTime(), value: p.pe };
    }
    benchmarkRendered.push({
        key: visibleBenchmarkKey,
        color: bmkColor,
        points: bmkPoints,
        lastPE: bmkLastPoint ? bmkLastPoint.pe : 0,
    });
}

function _drawPEPortfolioLine(ctx, args) {
    const {
        series, xScale, yScale, yMin, gradientStops, lineColor, lineThickness, chartBounds, padding, plotWidth
    } = args;

    const coords = new Array(series.length);
    for (let i = 0; i < series.length; i += 1) {
        const point = series[i];
        coords[i] = {
            x: xScale(point.date.getTime()),
            y: yScale(point.pe),
            time: point.date.getTime(),
            value: point.pe,
        };
    }

    const baselineY = yScale(yMin);
    if (mountainFill.enabled) {
        drawMountainFill(ctx, coords, baselineY, {
            color: lineColor,
            colorStops: gradientStops,
            opacityTop: 0.3,
            opacityBottom: 0.05,
            bounds: chartBounds,
        });
    }

    if (gradientStops.length === 2) {
        const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + plotWidth, 0);
        gradient.addColorStop(0, gradientStops[0]);
        gradient.addColorStop(1, gradientStops[1]);
        ctx.strokeStyle = gradient;
    } else {
        ctx.strokeStyle = lineColor;
    }
    ctx.beginPath();
    ctx.lineWidth = lineThickness;
    if (coords.length > 0) {
        ctx.moveTo(coords[0].x, coords[0].y);
        for (let i = 1; i < coords.length; i += 1) {
            ctx.lineTo(coords[i].x, coords[i].y);
        }
    }
    ctx.stroke();
    return coords;
}

function _drawPEForwardLineCore(ctx, args, fwdX, fwdY, lastX, lastY) {
    const {
        lineColor, gradientStops, chartBounds, lineThickness, isMobile,
        timestamp, chartManager, showLabels, padding, plotWidth, plotHeight, yMin, yScale
    } = args;
    const baselineY = yScale(yMin);

    if (mountainFill.enabled) {
        const fwdCoords = [{ x: lastX, y: lastY }, { x: fwdX, y: fwdY }];
        drawMountainFill(ctx, fwdCoords, baselineY, {
            color: lineColor,
            colorStops: gradientStops,
            opacityTop: 0.15,
            opacityBottom: 0.02,
            bounds: chartBounds,
        });
    }

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineThickness;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(fwdX, fwdY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
    ctx.restore();

    const peAnimEnabled = isAnimationEnabled('pe');
    const animPhase = advancePeAnimation(timestamp);
    if (peAnimEnabled) {
        const fwdGlowCoords = [{ x: lastX, y: lastY }, { x: fwdX, y: fwdY }];
        drawSeriesGlow(
            ctx,
            { coords: fwdGlowCoords, color: lineColor, lineWidth: lineThickness },
            {
                basePhase: animPhase,
                seriesIndex: 0,
                isMobile,
                chartKey: 'pe',
            }
        );
        schedulePeAnimation(chartManager);
    } else {
        stopPeAnimation();
    }

    if (showLabels) {
        drawEndValue(
            ctx, fwdX, fwdY, args.forwardPEValue, lineColor, isMobile,
            padding, plotWidth, plotHeight, (v) => `${v.toFixed(1)}x`, true, null
        );
    }
}

function _drawPEForwardLine(ctx, args) {
    const {
        forwardTargetTime, forwardPEValue, lastPoint, xScale, yScale, lineColor,
        isMobile, showLabels, padding, plotWidth, plotHeight, labelBounds
    } = args;

    if (forwardTargetTime !== null && forwardPEValue !== null && lastPoint) {
        const lastX = xScale(lastPoint.date.getTime());
        const lastY = yScale(lastPoint.pe);
        const fwdX = xScale(forwardTargetTime);
        const fwdY = yScale(forwardPEValue);

        _drawPEForwardLineCore(ctx, args, fwdX, fwdY, lastX, lastY);
    } else {
        stopPeAnimation();
    }

    if (showLabels && lastPoint) {
        const lastX = xScale(lastPoint.date.getTime());
        const lastY = yScale(lastPoint.pe);
        const bounds = drawEndValue(
            ctx, lastX, lastY, lastPoint.pe, lineColor, isMobile,
            padding, plotWidth, plotHeight, (v) => `${v.toFixed(1)}x`, true, labelBounds
        );
        if (bounds) {
            labelBounds.push(bounds);
        }
    }
}

function _buildPEChartLayoutsLegend(benchmarkData, legendItems) {
    const allBenchmarkKeys = ['^GSPC'];
    for (let i = 0; i < allBenchmarkKeys.length; i += 1) {
        const bmkKey = allBenchmarkKeys[i];
        if (!benchmarkData[bmkKey]) {
            continue;
        }
        const bmkName = bmkKey;
        const bmkGradient = BENCHMARK_GRADIENTS[bmkKey];
        const bmkColor = bmkGradient ? bmkGradient[1] : '#999';

        legendItems.push({
            key: bmkKey,
            name: bmkName,
            color: bmkColor,
        });
    }
    return legendItems;
}

function _buildPEChartLayouts(args) {
    const {
        series, minTime, maxTime, padding, chartBounds, xScale, yScale, plotWidth,
        lineColor, forwardPE, benchmarkRendered, lastPoint, forwardPEValue, benchmarkData, chartManager
    } = args;

    const pePoints = new Array(series.length);
    for (let i = 0; i < series.length; i += 1) {
        const p = series[i];
        pePoints[i] = { time: p.date.getTime(), value: p.pe };
    }

    chartLayouts.pe = {
        key: 'pe', minTime, maxTime, valueType: 'number', padding, chartBounds, xScale, yScale,
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
        series: [
            {
                key: 'portfolioPE',
                name: 'Portfolio P/E',
                label: '^LZ',
                color: lineColor,
                getValueAtTime: createTimeInterpolator(pePoints),
                formatValue: (v) => `${v.toFixed(1)}x`,
                formatDelta: (d) => `${d > 0 ? '+' : ''}${d.toFixed(1)}`,
            },
        ],
        rawSeries: series,
        forwardPE: forwardPE || null,
    };

    for (let i = 0; i < benchmarkRendered.length; i += 1) {
        const bmk = benchmarkRendered[i];
        chartLayouts.pe.series.push({
            key: bmk.key, name: bmk.key, label: bmk.key, color: bmk.color,
            getValueAtTime: createTimeInterpolator(bmk.points),
            formatValue: (v) => `${v.toFixed(1)}x`,
            formatDelta: (d) => `${d > 0 ? '+' : ''}${d.toFixed(1)}`,
        });
    }

    const latestPE = lastPoint ? lastPoint.pe : 0;
    const legendItems = [
        { key: 'pe', name: `P/E Ratio: ${latestPE.toFixed(1)}x`, color: lineColor },
    ];
    if (forwardPEValue !== null) {
        legendItems.push({ key: 'fwd_pe', name: `Forward P/E: ${forwardPEValue.toFixed(1)}x`, color: lineColor });
    }

    const fullLegendItems = _buildPEChartLayoutsLegend(benchmarkData, legendItems);

    const savedGSPCVisibility = transactionState.chartVisibility['^GSPC'];
    transactionState.chartVisibility['^GSPC'] = true;
    updateLegend(fullLegendItems, chartManager);
    transactionState.chartVisibility['^GSPC'] = savedGSPCVisibility;
}

function _handlePEDataLoading(emptyState, chartManager) {
    if (!peDataCache && peDataLoading) {
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return true;
    }

    if (!peDataCache) {
        peDataLoading = true;
        loadPEData()
            .then((data) => {
                if (!data) {
                    throw new Error('Failed to load PE data');
                }
                peDataCache = data;
                chartManager.redraw();
            })
            .catch((error) => {
                logger.warn('PE chart rendering failed:', error);
                chartLayouts.pe = null;
                updateCrosshairUI(null, null);
                if (emptyState) {
                    emptyState.style.display = 'block';
                }
            })
            .finally(() => {
                peDataLoading = false;
            });
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return true;
    }

    return false;
}

function _checkPEDataValid(data, emptyState) {
    if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray(data.dates) ||
        data.dates.length === 0
    ) {
        chartLayouts.pe = null;
        updateCrosshairUI(null, null);
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return false;
    }

    if (emptyState) {
        emptyState.style.display = 'none';
    }
    return true;
}

function _getPECanvasSettings(ctx) {
    const canvas = ctx.canvas;
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    const isMobile = window.innerWidth <= 768;
    const padding = isMobile
        ? { top: 15, right: 20, bottom: 35, left: 50 }
        : { top: 20, right: 30, bottom: 48, left: 70 };
    const plotWidth = canvasWidth - padding.left - padding.right;
    const plotHeight = canvasHeight - padding.top - padding.bottom;

    return { isMobile, padding, plotWidth, plotHeight };
}

function _calcPEScales(series, filterFrom, filterTo, data, padding, plotWidth, plotHeight) {
    const { minTime, maxTime: initialMaxTime } = _computePEMinMaxTime(series, filterFrom);

    const forwardPE = data.forward_pe;
    const fwdResults = _computePEForwardTime(series, forwardPE, filterTo, initialMaxTime);
    const { forwardTargetTime, forwardPEValue, maxTime } = fwdResults;

    const { dataMin, dataMax: initialDataMax } = _computePEMinMaxValues(series, forwardPEValue);
    let dataMax = initialDataMax;

    const benchmarkData = data.benchmark_pe || {};
    const benchmarkSeriesMap = _buildPEBenchmarkSeries(benchmarkData, data.dates, filterFrom, filterTo);
    const benchmarkFwdPE = forwardPE ? forwardPE.benchmark_forward_pe || {} : {};

    const bmkUpdateResults = _updatePEBenchmarkValues(benchmarkData, benchmarkSeriesMap, benchmarkFwdPE, dataMax);
    const { visibleBenchmarkKey } = bmkUpdateResults;
    dataMax = bmkUpdateResults.updatedDataMax;

    const range = dataMax - dataMin;
    const yPadding = Math.max(range * 0.1, 1);
    const yMin = 0;
    const yMax = dataMax + yPadding;

    const xScale = (t) =>
        padding.left +
        (maxTime === minTime ? plotWidth / 2 : ((t - minTime) / (maxTime - minTime)) * plotWidth);
    const yScale = (v) => padding.top + plotHeight - ((v - yMin) / (yMax - yMin || 1)) * plotHeight;

    return {
        minTime, maxTime, yMin, yMax, xScale, yScale, forwardTargetTime, forwardPEValue,
        visibleBenchmarkKey, benchmarkSeriesMap, benchmarkFwdPE, benchmarkData, forwardPE
    };
}

function _drawPEBenchmarkLineIfVisible(ctx, args) {
    const { visibleBenchmarkKey, benchmarkSeriesMap, colors } = args;
    if (visibleBenchmarkKey) {
        const bmkSeries = benchmarkSeriesMap[visibleBenchmarkKey];
        if (bmkSeries && bmkSeries.length > 0) {
            const bmkGradientStops = BENCHMARK_GRADIENTS[visibleBenchmarkKey] || [colors.portfolio, colors.portfolio];
            const bmkColor = bmkGradientStops[1] || '#999';
            _drawPEBenchmarkLine(ctx, {
                ...args, bmkSeries, bmkGradientStops, bmkColor
            });
        }
    }
}

function _executePEChartDraws(ctx, args) {
    const { scales, settings, series, timestamp, chartManager } = args;
    const {
        minTime, maxTime, yMin, yMax, xScale, yScale, forwardTargetTime, forwardPEValue,
        visibleBenchmarkKey, benchmarkSeriesMap, benchmarkFwdPE, benchmarkData, forwardPE
    } = scales;
    const { isMobile, padding, plotWidth, plotHeight } = settings;

    const yLabelFormatter = (v) => (Number.isInteger(v) ? `${v}x` : `${v.toFixed(1)}x`);
    drawAxes(
        ctx, padding, plotWidth, plotHeight, minTime, maxTime, yMin, yMax, xScale, yScale, yLabelFormatter, false
    );

    const chartBounds = {
        top: padding.top, bottom: padding.top + plotHeight, left: padding.left, right: padding.left + plotWidth,
    };
    const rootStyles = window.getComputedStyle(document.documentElement);
    const colors = getChartColors(rootStyles);
    const gradientStops = BENCHMARK_GRADIENTS['^LZ'] || [colors.portfolio, colors.portfolio];
    const lineColor = gradientStops[1] || colors.portfolio || '#ffef2f';
    const lineThickness = CHART_LINE_WIDTHS.contribution ?? 2;

    const lastPoint = series[series.length - 1];
    const showLabels = transactionState.showChartLabels !== false;
    const benchmarkRendered = [];
    const labelBounds = [];
    const { chartDateRange } = transactionState;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;

    _drawPEBenchmarkLineIfVisible(ctx, {
        visibleBenchmarkKey, benchmarkSeriesMap, colors, xScale, yScale, padding, plotHeight, plotWidth,
        lineThickness, benchmarkFwdPE, forwardTargetTime, filterTo, chartBounds,
        isMobile, timestamp, chartManager, showLabels, labelBounds, benchmarkRendered
    });

    _drawPEPortfolioLine(ctx, {
        series, xScale, yScale, yMin, gradientStops, lineColor, lineThickness, chartBounds, padding, plotWidth
    });

    _drawPEForwardLine(ctx, {
        forwardTargetTime, forwardPEValue, lastPoint, xScale, yScale, yMin, lineColor, gradientStops,
        chartBounds, lineThickness, isMobile, timestamp, chartManager, showLabels, padding, plotWidth, plotHeight, labelBounds
    });

    _buildPEChartLayouts({
        series, minTime, maxTime, padding, chartBounds, xScale, yScale, plotWidth, lineColor,
        forwardPE, benchmarkRendered, lastPoint, forwardPEValue, benchmarkData, chartManager
    });
}

/**
 * Draw the PE ratio chart — a single line showing weighted average P/E over time.
 */
export function drawPEChart(ctx, chartManager, timestamp) {
    stopPerformanceAnimation();
    stopContributionAnimation();
    stopFxAnimation();
    stopConcentrationAnimation();

    const emptyState = document.getElementById('runningAmountEmpty');

    if (_handlePEDataLoading(emptyState, chartManager)) {
        return;
    }

    const data = peDataCache;
    if (!_checkPEDataValid(data, emptyState)) {
        return;
    }

    const { chartDateRange } = transactionState;
    const filterFrom = chartDateRange.from ? parseLocalDate(chartDateRange.from) : null;
    const filterTo = chartDateRange.to ? parseLocalDate(chartDateRange.to) : null;

    const series = buildPESeries(
        data.dates, data.portfolio_pe, data.ticker_pe, data.ticker_weights, filterFrom, filterTo
    );

    if (series.length === 0) {
        chartLayouts.pe = null;
        updateCrosshairUI(null, null);
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        return;
    }

    const settings = _getPECanvasSettings(ctx);
    if (settings.plotWidth <= 0 || settings.plotHeight <= 0) {
        chartLayouts.pe = null;
        updateCrosshairUI(null, null);
        return;
    }

    const scales = _calcPEScales(series, filterFrom, filterTo, data, settings.padding, settings.plotWidth, settings.plotHeight);

    _executePEChartDraws(ctx, { scales, settings, series, timestamp, chartManager });

    drawCrosshairOverlay(ctx, chartLayouts.pe);
}

/**
 * Get summary text for the PE chart (Current + Range).
 */
export function getPESnapshotText() {
    if (!chartLayouts.pe || !chartLayouts.pe.rawSeries || chartLayouts.pe.rawSeries.length === 0) {
        return 'Loading PE data...';
    }

    const series = chartLayouts.pe.rawSeries;
    const { chartDateRange } = transactionState;
    const fromTime = chartDateRange.from
        ? parseLocalDate(chartDateRange.from).getTime()
        : -Infinity;
    const toTime = chartDateRange.to ? parseLocalDate(chartDateRange.to).getTime() : Infinity;

    const visiblePoints = series.filter((p) => {
        const t = p.date.getTime();
        return t >= fromTime && t <= toTime;
    });

    if (visiblePoints.length === 0) {
        return 'No PE data in range';
    }

    // Bolt: Optimized value min/max calculations to avoid map and spread allocations
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < visiblePoints.length; i += 1) {
        const pe = visiblePoints[i].pe;
        if (pe < min) {
            min = pe;
        }
        if (pe > max) {
            max = pe;
        }
    }
    const current = visiblePoints[visiblePoints.length - 1].pe;

    const fwd = chartLayouts.pe.forwardPE;
    let fwdText = '';
    if (fwd && fwd.portfolio_forward_pe) {
        fwdText = ` | Forward: ${fwd.portfolio_forward_pe.toFixed(2)}x`;
        if (fwd.benchmark_forward_pe && fwd.benchmark_forward_pe['^GSPC']) {
            fwdText += ` (S&P 500: ${fwd.benchmark_forward_pe['^GSPC'].toFixed(2)}x)`;
        }
    }

    return `Current: ${current.toFixed(2)}x | Range: ${min.toFixed(2)}x - ${max.toFixed(2)}x | Harmonic Mean (1 / Σ(w/PE))${fwdText}`;
}
