import { logger } from '@utils/logger.js';
import { getNyDate, isTradingDay } from '@utils/date.js';
import {
    fetchPortfolioData,
    fetchMarketRatiosForTickers,
    _calculateDynamicPeValues,
} from '@services/dataService.js';

const FX_DATA_URL = '../data/fx_data.json';

async function fetchJSON(url) {
    const response = await fetch(`${url}?t=${new Date().getTime()}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

/**
 * Calculates portfolio PE
 * @param {number} weightSum
 * @param {number} yieldSum
 * @returns {number | null}
 */
function _calculatePortfolioPE(weightSum, yieldSum) {
    return weightSum > 0 && yieldSum > 0 ? weightSum / yieldSum : null;
}

/**
 * Computes trailing and forward yield delta for a holding.
 * @param {Object} ratioSnapshot
 * @param {number} price
 * @param {number} value
 * @returns {Object}
 */
function _computeHoldingYields(ratioSnapshot, price, value) {
    let yieldDelta = 0;
    let fwdYieldDelta = 0;
    let peValue = null;

    if (ratioSnapshot) {
        const { trailingValue, forwardValue } = _calculateDynamicPeValues(
            ratioSnapshot,
            price
        );

        if (Number.isFinite(trailingValue) && trailingValue > 0) {
            peValue = trailingValue;
            yieldDelta = value / trailingValue;
        }
        if (Number.isFinite(forwardValue) && forwardValue > 0) {
            fwdYieldDelta = value / forwardValue;
        }
    }

    return { yieldDelta, fwdYieldDelta, peValue };
}

/**
 * Processes holdings to compute metrics
 * @param {string[]} tickers
 * @param {Object} holdings
 * @param {Object} prices
 * @param {Map} marketRatiosByTicker
 * @returns {Object}
 */
function _processHoldings(tickers, holdings, prices, marketRatiosByTicker) {
    let weightSum = 0;
    let weightedYieldSum = 0;
    let weightedFwdYieldSum = 0;
    let balanceDelta = 0;
    const newCompositionItems = [];
    const tickerPEs = {};
    const tickerWeights = {};

    for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        const details = holdings[ticker];
        const shares = parseFloat(details.shares) || 0;
        const price = parseFloat(prices[ticker]) || 0;
        if (shares > 0 && price > 0) {
            const value = shares * price;
            balanceDelta += value;
            newCompositionItems.push({
                ticker,
                value,
            });

            const ratioSnapshot = marketRatiosByTicker.get(ticker);
            const { yieldDelta, fwdYieldDelta, peValue } = _computeHoldingYields(
                ratioSnapshot,
                price,
                value
            );

            if (peValue !== null) {
                tickerPEs[ticker] = peValue;
            }
            weightedYieldSum += yieldDelta;
            weightedFwdYieldSum += fwdYieldDelta;

            tickerWeights[ticker] = value;
            weightSum += value;
        }
    }

    return {
        weightSum,
        weightedYieldSum,
        weightedFwdYieldSum,
        tickerPEs,
        tickerWeights,
        balanceDelta,
        newCompositionItems,
    };
}

/**
 * Fetches real-time data and calculates the current portfolio state.
 * @returns {Promise<{
 *   date: string,
 *   balance: number,
 *   composition: Array<{ticker: string, value: number, percent: number}>,
 *   fxRates: Object,
 *   pe: number | null,
 *   forwardPe: number | null,
 *   tickerPEs: Object,
 *   tickerWeights: Object
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
        const tickers = Object.keys(holdings);

        const marketRatiosByTicker = await fetchMarketRatiosForTickers(tickers);

        const {
            weightSum,
            weightedYieldSum,
            weightedFwdYieldSum,
            tickerPEs,
            tickerWeights,
            balanceDelta,
            newCompositionItems,
        } = _processHoldings(tickers, holdings, prices, marketRatiosByTicker);

        totalBalanceUSD += balanceDelta;
        composition.push(...newCompositionItems);

        const portfolioPE = _calculatePortfolioPE(weightSum, weightedYieldSum);
        const portfolioFwdPE = _calculatePortfolioPE(weightSum, weightedFwdYieldSum);

        // 2. Add Composition Percentages
        if (totalBalanceUSD > 0) {
            for (let i = 0; i < composition.length; i++) {
                composition[i].percent = (composition[i].value / totalBalanceUSD) * 100;
            }
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
            pe: portfolioPE,
            forwardPe: portfolioFwdPE,
            tickerPEs,
            tickerWeights,
            holdings,
            prices,
        };
    } catch (error) {
        logger.warn('Failed to fetch real-time data:', error);
        return null;
    }
}
