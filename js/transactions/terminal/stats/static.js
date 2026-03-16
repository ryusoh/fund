import { logger } from '../../../utils/logger.js';
export async function getCagrText() {
    try {
        const response = await fetch('../data/output/cagr.txt');
        if (!response.ok) {
            return 'Error loading CAGR data.';
        }
        return await response.text();
    } catch (error) {
        logger.warn('Caught exception:', error);
        return 'Error loading CAGR data.';
    }
}

export async function getAnnualReturnText() {
    try {
        const response = await fetch('../data/output/annual_returns.txt');
        if (!response.ok) {
            return 'Error loading annual returns.';
        }
        return await response.text();
    } catch (error) {
        logger.warn('Caught exception:', error);
        return 'Error loading annual returns.';
    }
}

export async function getRatioText() {
    try {
        const response = await fetch('../data/output/ratios.txt');
        if (!response.ok) {
            return 'Error loading Sharpe and Sortino ratios.';
        }
        return await response.text();
    } catch (error) {
        logger.warn('Caught exception:', error);
        return 'Error loading Sharpe and Sortino ratios.';
    }
}
