import { logger } from '@utils/logger.js';
import { parseCSV } from './calculations.js';
import { parseCSVLine } from './utils.js';
import { setPortfolioSeries } from './state.js';

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
        const response = await fetch('../data/historical_portfolio_values.csv');
        if (!response.ok) {
            logger.warn(
                'historical_portfolio_values.csv not found; portfolio balance line disabled'
            );
            setPortfolioSeries([]);
            return;
        }

        const text = await response.text();
        const lines = text.trim().split('\n');
        if (lines.length <= 1) {
            setPortfolioSeries([]);
            return;
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const dateIndex = headers.indexOf('date');
        const valueIndex = headers.indexOf('value_usd');
        if (dateIndex === -1 || valueIndex === -1) {
            logger.warn(
                'historical_portfolio_values.csv missing required columns (date, value_usd)'
            );
            setPortfolioSeries([]);
            return;
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
        setPortfolioSeries(series);
    } catch (error) {
        logger.warn('Failed to load historical portfolio values:', error);
        setPortfolioSeries([]);
    }
}
