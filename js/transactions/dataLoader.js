import { logger } from '@utils/logger.js';
import { parseCSV } from './calculations.js';
import { parseCSVLine } from './utils.js';

const SERIES_SYMBOL_ALIASES = {
    '^SSE': '^SSEC',
};

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

export async function loadPortfolioSeries() {
    try {
        const response = await fetch('../data/output/balance_series.json');
        if (!response.ok) {
            logger.warn('balance_series.json not found; portfolio balance line disabled');
            return [];
        }
        const payload = await response.json();
        if (!Array.isArray(payload)) {
            return [];
        }
        return payload
            .map((entry) => ({
                date: typeof entry.date === 'string' ? entry.date : null,
                value: Number(entry.value),
            }))
            .filter((entry) => typeof entry.date === 'string' && Number.isFinite(entry.value));
    } catch (error) {
        logger.warn('Failed to load balance series:', error);
        return [];
    }
}

export async function loadContributionSeries() {
    try {
        const response = await fetch('../data/output/contribution_series.json');
        if (!response.ok) {
            logger.warn('contribution_series.json not found; contribution chart disabled');
            return [];
        }

        const payload = await response.json();
        if (!Array.isArray(payload)) {
            return [];
        }

        return payload
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
    } catch (error) {
        logger.warn('Failed to load contribution series:', error);
        return [];
    }
}

export async function loadPerformanceSeries() {
    try {
        const response = await fetch('../data/output/performance_series.json');
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

        return seriesMap;
    } catch (error) {
        logger.warn('Failed to load performance series:', error);
        return {};
    }
}
