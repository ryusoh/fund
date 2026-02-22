export async function loadSectorsSnapshotData() {
    try {
        const response = await fetch('../data/output/figures/sectors.json');
        if (!response.ok) {
            logger.warn('figures/sectors.json not found');
            return null;
        }
        return await response.json();
    } catch (error) {
        logger.warn('Failed to load sectors snapshot:', error);
        return null;
    }
}

export async function loadGeographySnapshotData() {
    try {
        const response = await fetch('../data/output/figures/geography.json');
        if (!response.ok) {
            logger.warn('figures/geography.json not found');
            return null;
        }
        return await response.json();
    } catch (error) {
        logger.warn('Failed to load geography snapshot:', error);
        return null;
    }
}

export async function loadMarketcapSnapshotData() {
    try {
        const response = await fetch('../data/output/figures/marketcap.json');
        if (!response.ok) {
            logger.warn('figures/marketcap.json not found');
            return null;
        }
        return await response.json();
    } catch (error) {
        logger.warn('Failed to load market cap snapshot:', error);
        return null;
    }
}
import { logger } from '@utils/logger.js';
import { parseCSV } from './calculations.js';
import { parseCSVLine } from './utils.js';

const SERIES_SYMBOL_ALIASES = {
    '^SSE': '^SSEC',
};

const TICKER_ALIAS_MAP = {
    BRK: 'BRKB',
    'BRK-B': 'BRKB',
    BRKB: 'BRKB',
};

function normalizeTicker(ticker) {
    if (typeof ticker !== 'string') {
        return ticker;
    }
    const cleaned = ticker.trim().toUpperCase();
    return TICKER_ALIAS_MAP[cleaned] || cleaned;
}

function normalizeSeriesKey(name, fallback) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) {
        return fallback;
    }
    return SERIES_SYMBOL_ALIASES[trimmed] || trimmed;
}

export async function loadSplitHistory() {
    try {
        const response = await fetch('../data/split_history.csv');
        if (!response.ok) {
            logger.warn('Split history file not found, continuing without split adjustments');
            return [];
        }
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        const splits = [];
        for (let i = 1; i < lines.length; i += 1) {
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

export async function loadTransactionData() {
    const response = await fetch('../data/transactions.csv');
    if (!response.ok) {
        throw new Error('Failed to load transactions.csv');
    }
    const csvText = await response.text();
    return parseCSV(csvText);
}

import { fetchRealTimeData } from './realtimeData.js';

export async function loadPortfolioSeries() {
    try {
        const [response, realtime] = await Promise.all([
            fetch('../data/output/balance_series.json'),
            fetchRealTimeData().catch((err) => {
                logger.warn('Real-time data fetch failed:', err);
                return null;
            }),
        ]);

        if (!response.ok) {
            logger.warn('balance_series.json not found; portfolio balance line disabled');
            return [];
        }
        const payload = await response.json();
        const normalizeSeries = (entries) =>
            (Array.isArray(entries) ? entries : [])
                .map((entry) => ({
                    date: typeof entry.date === 'string' ? entry.date : null,
                    value: Number(entry.value),
                }))
                .filter((entry) => typeof entry.date === 'string' && Number.isFinite(entry.value));

        let result = { USD: [] };

        if (Array.isArray(payload)) {
            result = { USD: normalizeSeries(payload) };
        } else if (payload && typeof payload === 'object') {
            result = {};
            Object.entries(payload).forEach(([currency, entries]) => {
                result[currency] = normalizeSeries(entries);
            });
        }

        // Merge real-time data
        if (realtime && realtime.balance > 0) {
            const date = realtime.date;
            const usdBalance = realtime.balance;

            // Ensure USD exists
            if (!result.USD) {
                result.USD = [];
            }

            // Helper to append or update
            const mergePoint = (series, val) => {
                const last = series[series.length - 1];
                if (last && last.date === date) {
                    last.value = val;
                } else {
                    series.push({ date, value: val });
                }
            };

            mergePoint(result.USD, usdBalance);

            // Update other currencies
            if (realtime.fxRates) {
                Object.entries(realtime.fxRates).forEach(([code, rate]) => {
                    if (code === 'USD') {
                        return;
                    }
                    if (!result[code]) {
                        result[code] = [];
                    }
                    mergePoint(result[code], usdBalance * rate);
                });
            }
        }

        return result;
    } catch (error) {
        logger.warn('Failed to load balance series:', error);
        return { USD: [] };
    }
}

export async function loadContributionSeries() {
    try {
        const response = await fetch('../data/output/contribution_series.json');
        if (!response.ok) {
            logger.warn('contribution_series.json not found; contribution chart disabled');
            return { USD: [] };
        }

        const payload = await response.json();
        const normalizeSeries = (entries) =>
            (Array.isArray(entries) ? entries : [])
                .map((entry) => ({
                    tradeDate: typeof entry.tradeDate === 'string' ? entry.tradeDate : null,
                    amount: Number(entry.amount),
                    orderType: typeof entry.orderType === 'string' ? entry.orderType : 'padding',
                    netAmount: Number(entry.netAmount || 0),
                }))
                .filter(
                    (entry) =>
                        typeof entry.tradeDate === 'string' &&
                        Number.isFinite(entry.amount) &&
                        Number.isFinite(entry.netAmount)
                );

        if (Array.isArray(payload)) {
            return { USD: normalizeSeries(payload) };
        }
        if (payload && typeof payload === 'object') {
            const result = {};
            Object.entries(payload).forEach(([currency, entries]) => {
                result[currency] = normalizeSeries(entries);
            });
            return result;
        }
        return { USD: [] };
    } catch (error) {
        logger.warn('Failed to load contribution series:', error);
        return { USD: [] };
    }
}

export async function loadPerformanceSeries() {
    try {
        const [response, realtime] = await Promise.all([
            fetch('../data/output/performance_series.json'),
            fetchRealTimeData().catch(() => null),
        ]);

        if (!response.ok) {
            logger.warn('performance_series.json not found; performance chart disabled');
            return {};
        }

        const payload = await response.json();
        if (!payload || typeof payload !== 'object') {
            return {};
        }

        const seriesMap = {};
        Object.entries(payload).forEach(([rawKey, points]) => {
            if (!Array.isArray(points) || points.length === 0) {
                return;
            }

            const normalizedPoints = points
                .map((point) => ({
                    date: typeof point.date === 'string' ? point.date : null,
                    value: Number(point.value),
                }))
                .filter((point) => typeof point.date === 'string' && Number.isFinite(point.value));

            if (normalizedPoints.length === 0) {
                return;
            }

            const key = normalizeSeriesKey(rawKey, rawKey);
            seriesMap[key] = normalizedPoints;
        });

        // Estimate real-time performance for LZ fund
        // Logic: (TodayBalance / LastBalance) - 1 + LastTWRR?
        // Or rather: NewTWRR = LastTWRR * (CurrentBalance / PreviousBalance) (assuming no flows)
        if (realtime && seriesMap['^LZ'] && seriesMap['^LZ'].length > 0) {
            // We need the previous balance value to calculate return
            // We can re-fetch balance series or assume we can get it.
            // Getting it from loadPortfolioSeries is circular or messy.
            // Simplified approach: fetch balance series here locally just to find the last point.
            try {
                const balResponse = await fetch('../data/output/balance_series.json');
                const balPayload = await balResponse.json();
                const usdOpen = Array.isArray(balPayload)
                    ? balPayload[balPayload.length - 1]
                    : balPayload.USD
                      ? balPayload.USD[balPayload.USD.length - 1]
                      : null;

                if (usdOpen && usdOpen.value > 0) {
                    const lastTwrrPoint = seriesMap['^LZ'][seriesMap['^LZ'].length - 1];
                    const dailyReturn = realtime.balance / usdOpen.value; // e.g. 1.01

                    // If dates match, update the last point
                    if (lastTwrrPoint.date === realtime.date) {
                        // This implies the series already has today's data (maybe from batch job).
                        // We probably shouldn't overwrite it with a simple estimate unless we are sure.
                        // But for "live" feel, maybe we do?
                        // Let's only append if date is new.
                    } else {
                        const newTwrrValue = lastTwrrPoint.value * dailyReturn;
                        seriesMap['^LZ'].push({
                            date: realtime.date,
                            value: newTwrrValue,
                        });
                    }
                }
            } catch {
                // Ignore complexity if balance fetch fails
            }
        }

        return seriesMap;
    } catch (error) {
        logger.warn('Failed to load performance series:', error);
        return {};
    }
}

export async function loadFxDailyRates() {
    try {
        const response = await fetch('../data/output/fx_daily_rates.json');
        if (!response.ok) {
            logger.warn('fx_daily_rates.json not found; currency conversion disabled');
            return null;
        }
        const payload = await response.json();
        if (!payload || typeof payload !== 'object' || !payload.rates) {
            return null;
        }
        return payload;
    } catch (error) {
        logger.warn('Failed to load FX daily rates:', error);
        return null;
    }
}

export async function loadCompositionSnapshotData() {
    try {
        const [response, realtime] = await Promise.all([
            fetch('../data/output/figures/composition.json'),
            fetchRealTimeData().catch(() => null),
        ]);

        if (!response.ok) {
            logger.warn('figures/composition.json not found');
            return null;
        }

        const data = await response.json();

        // Merge real-time composition
        if (realtime && realtime.composition && realtime.date) {
            // Append date
            if (data.dates) {
                const lastDate = data.dates[data.dates.length - 1];
                // Update if dates match (intraday) or append if new date
                if (lastDate === realtime.date || lastDate < realtime.date) {
                    // If dates match, remove the stale point first so we can append the fresh one
                    // OR overwrite. Appending logic is simpler if we just pop the key arrays.
                    // But data.composition is object of arrays.
                    // Let's use an overwrite index strategy.
                    let targetIndex = data.dates.length;
                    if (lastDate === realtime.date) {
                        targetIndex = data.dates.length - 1;
                    } else {
                        data.dates.push(realtime.date);
                    }

                    // Update/Append total balance
                    if (Array.isArray(data.total_values) && Number.isFinite(realtime.balance)) {
                        data.total_values[targetIndex] = realtime.balance;
                    }

                    // Merge composition values
                    const composition = data.composition || data.series; // Support flexibility
                    if (composition) {
                        // For each ticker in historical composition, update/add point
                        Object.keys(composition).forEach((ticker) => {
                            if (!Array.isArray(composition[ticker])) {
                                return;
                            }
                            // Find real-time percent for this ticker
                            const rtItem = realtime.composition.find(
                                (i) => normalizeTicker(i.ticker) === ticker
                            );
                            const rtPercent = rtItem ? rtItem.percent : 0;
                            composition[ticker][targetIndex] = rtPercent;
                        });

                        // Add new tickers found in real-time but not history
                        realtime.composition.forEach((rtItem) => {
                            const normalizedTicker = normalizeTicker(rtItem.ticker);
                            if (Math.abs(rtItem.percent) > 0.001) {
                                // Only if significant
                                if (!composition[normalizedTicker]) {
                                    // Backfill with 0s up to targetIndex
                                    composition[normalizedTicker] = new Array(targetIndex).fill(0);
                                    composition[normalizedTicker][targetIndex] = rtItem.percent;
                                } else {
                                    // Ensure it has value at targetIndex (handled in loop above if key existed)
                                    // If key didn't exist in composition before loop, it enters this block.
                                    // If it partially existed but loop missed it? No, Object.keys covers existing.
                                    // So this block is strictly for NEW keys.
                                    composition[normalizedTicker][targetIndex] = rtItem.percent;
                                }
                            }
                        });
                    }
                }
            }
        }

        return data;
    } catch (error) {
        logger.warn('Failed to load composition snapshot:', error);
        return null;
    }
}
