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

export async function loadHistoricalPrices() {
    try {
        const response = await fetch('../data/historical_prices.json');
        if (!response.ok) {
            logger.warn('historical_prices.json not found; dynamic portfolio balance disabled');
            return {};
        }
        return await response.json();
    } catch (error) {
        logger.warn('Failed to load historical prices:', error);
        return {};
    }
}

export async function loadPortfolioSeries() {
    try {
        const response = await fetch('../data/historical_portfolio_values.csv');
        if (!response.ok) {
            logger.warn(
                'historical_portfolio_values.csv not found; portfolio balance line disabled'
            );
            return [];
        }

        const text = await response.text();
        const lines = text.trim().split('\n');
        if (lines.length <= 1) {
            return [];
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const dateIndex = headers.indexOf('date');
        const valueIndex = headers.indexOf('value_usd');
        if (dateIndex === -1 || valueIndex === -1) {
            logger.warn(
                'historical_portfolio_values.csv missing required columns (date, value_usd)'
            );
            return [];
        }

        const series = [];
        for (let i = 1; i < lines.length; i += 1) {
            const row = lines[i].split(',');
            if (row.length <= Math.max(dateIndex, valueIndex)) {
                continue;
            }
            const date = row[dateIndex];
            const value = parseFloat(row[valueIndex]);
            if (!Number.isFinite(value)) {
                continue;
            }
            series.push({ date, value });
        }
        return series;
    } catch (error) {
        logger.warn('Failed to load historical portfolio values:', error);
        return [];
    }
}

function decodePlotlyVector(column) {
    if (!column) {
        return [];
    }

    if (Array.isArray(column)) {
        const numericValues = column
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value));
        if (numericValues.length === column.length && column.length > 0) {
            return numericValues;
        }
        return [...column];
    }

    if (typeof column === 'object' && typeof column.bdata === 'string') {
        const binaryString = globalThis.atob(column.bdata);
        const { length } = binaryString;
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i += 1) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const buffer = bytes.buffer;
        switch (column.dtype) {
            case 'f8':
                return Array.from(new Float64Array(buffer));
            case 'f4':
                return Array.from(new Float32Array(buffer));
            case 'i4':
                return Array.from(new Int32Array(buffer));
            case 'u4':
                return Array.from(new Uint32Array(buffer));
            case 'i2':
                return Array.from(new Int16Array(buffer));
            case 'u2':
                return Array.from(new Uint16Array(buffer));
            case 'i1':
                return Array.from(new Int8Array(buffer));
            case 'u1':
                return Array.from(new Uint8Array(buffer));
            default:
                return [];
        }
    }

    return [];
}

export async function loadPerformanceSeries() {
    try {
        const response = await fetch('../data/output/figures/twrr.json');
        if (!response.ok) {
            logger.warn('twrr.json not found; CAGR terminal command disabled');
            return {};
        }

        const payload = await response.json();
        const traces = Array.isArray(payload.data) ? payload.data : [];
        if (traces.length === 0) {
            return {};
        }

        const seriesMap = {};

        traces.forEach((trace, index) => {
            const rawDates = Array.isArray(trace.x) ? trace.x : decodePlotlyVector(trace.x);
            const values = decodePlotlyVector(trace.y);
            if (!rawDates || rawDates.length === 0 || values.length === 0) {
                return;
            }

            const points = [];
            const count = Math.min(rawDates.length, values.length);
            for (let i = 0; i < count; i += 1) {
                const rawDate = rawDates[i];
                const numericValue = values[i];
                if (!Number.isFinite(numericValue)) {
                    continue;
                }
                const parsedDate = normalizeDate(rawDate);
                if (!parsedDate) {
                    continue;
                }
                points.push({ date: parsedDate, value: numericValue });
            }
            if (points.length > 0) {
                const rawKey =
                    typeof trace.name === 'string' && trace.name.trim()
                        ? trace.name.trim()
                        : `Series ${index + 1}`;
                const key = normalizeSeriesKey(rawKey, `Series ${index + 1}`);
                seriesMap[key] = points;
            }
        });

        return seriesMap;
    } catch (error) {
        logger.warn('Failed to load TWRR JSON:', error);
        return {};
    }
}

function normalizeDate(input) {
    if (input instanceof Date) {
        if (Number.isNaN(input.getTime())) {
            return null;
        }
        return input.toISOString();
    }
    if (typeof input === 'number') {
        const fromNumber = new Date(input);
        return Number.isNaN(fromNumber.getTime()) ? null : fromNumber.toISOString();
    }
    if (typeof input === 'string') {
        const parsed = new Date(input);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    return null;
}
