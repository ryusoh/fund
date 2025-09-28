import { logger } from '@utils/logger.js';
import { parseCSV } from './calculations.js';
import { parseCSVLine } from './utils.js';

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
