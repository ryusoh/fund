import { logger } from '@utils/logger.js';
import { getNyDate, isTradingDay } from '@utils/date.js';
import { fetchPortfolioData } from '@services/dataService.js';

const FX_DATA_URL = '../data/fx_data.json';

async function fetchJSON(url) {
    const response = await fetch(`${url}?t=${new Date().getTime()}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

/**
 * Fetches real-time data and calculates the current portfolio state.
 * @returns {Promise<{
 *   date: string,
 *   balance: number,
 *   composition: Array<{ticker: string, value: number, percent: number}>,
 *   fxRates: Object
 * } | null>}
 */
export async function fetchRealTimeData() {
    try {
        const today = getNyDate();
        if (!isTradingDay(today)) {
            // Optional: You might still want to return data if you want to show
            // the "latest" closed price even on weekends, but usually charts
            // stick to trading days. For now, let's respect the trading day check.
            // But if the user wants "real time", they might expect to see it updates
            // even if the market is closed but data was updated?
            // "data updated every 30min" implies it might change.
            // Let's allow it for now, as isTradingDay might strict check weekends.
        }

        const [{ holdingsDetails: holdings, prices }, fx] = await Promise.all([
            fetchPortfolioData(),
            fetchJSON(FX_DATA_URL),
        ]);

        if (!holdings || !prices) {
            return null;
        }

        let totalBalanceUSD = 0;
        const composition = [];

        // 1. Calculate Balance and Composition
        Object.entries(holdings).forEach(([ticker, details]) => {
            const shares = parseFloat(details.shares) || 0;
            const price = parseFloat(prices[ticker]) || 0;
            if (shares > 0 && price > 0) {
                const value = shares * price;
                totalBalanceUSD += value;
                composition.push({
                    ticker,
                    value,
                    // percent calculated later
                });
            }
        });

        // 2. Add Composition Percentages
        if (totalBalanceUSD > 0) {
            composition.forEach((item) => {
                item.percent = (item.value / totalBalanceUSD) * 100;
            });
        }

        // Sort composition by value desc for consistency
        composition.sort((a, b) => b.value - a.value);

        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        return {
            date: dateStr,
            balance: totalBalanceUSD,
            composition,
            fxRates: fx.rates || { USD: 1.0 },
        };
    } catch (error) {
        logger.warn('Failed to fetch real-time data:', error);
        return null;
    }
}

// Dummy variable to enable statement coverage tracking for this file.
export const _coverage_dummy = true;
