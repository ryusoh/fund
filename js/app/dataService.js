import * as d3 from 'https://esm.sh/d3@7';
import { getNyDate } from '../utils/date.js';

// --- Private Functions ---

/**
 * Fetches all necessary data from the server.
 * @param {object} paths An object with paths to the data files.
 * @returns {Promise<object>} A promise that resolves with the fetched data.
 */
async function fetchData(paths) {
    const timestamp = new Date().getTime();
    const [historical, fx, holdings, fund] = await Promise.all([
        d3.csv(`${paths.historical}?t=${timestamp}`),
        d3.json(`${paths.fx}?t=${timestamp}`),
        d3.json(`${paths.holdings}?t=${timestamp}`),
        d3.json(`${paths.fund}?t=${timestamp}`),
    ]);
    return { historical, fx, holdings, fund };
}

/**
 * Processes the raw historical data to calculate daily P&L.
 * @param {Array<object>} rawData The raw data from the CSV.
 * @returns {Array<object>} The processed data.
 */
function processHistoricalData(rawData) {
    if (!rawData || rawData.length === 0) {
        return [];
    }
    return rawData.map((d, i) => {
        const currentValue = parseFloat(d.value_usd);
        let dailyChange = 0;
        let pnl = 0;

        if (i > 0) {
            const previousValue = parseFloat(rawData[i - 1].value_usd);
            dailyChange = currentValue - previousValue;
            pnl = previousValue === 0 ? 0 : (dailyChange / previousValue);
        }

        return { date: d.date, value: pnl, total: currentValue, dailyChange };
    }).filter(d => d.date);
}

/**
 * Calculates the real-time P&L for today.
 * @param {object} holdingsData The holdings data.
 * @param {object} fundData The fund data.
 * @param {number} lastHistoricalValue The last available historical value.
 * @returns {object|null} The real-time data for today, or null if not available.
 */
function calculateRealtimePnl(holdingsData, fundData, lastHistoricalValue) {
    if (!holdingsData || !fundData) {
        return null;
    }

    let currentTotalValue = 0;
    for (const ticker in holdingsData) {
        if (fundData[ticker]) {
            currentTotalValue += parseFloat(holdingsData[ticker].shares) * parseFloat(fundData[ticker]);
        }
    }

    const dailyChange = currentTotalValue - lastHistoricalValue;
    const pnl = lastHistoricalValue === 0 ? 0 : (dailyChange / lastHistoricalValue);
    const today = getNyDate();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return {
        date: todayStr,
        value: pnl,
        total: currentTotalValue,
        dailyChange,
    };
}

/**
 * Combines historical and real-time data.
 * @param {Array<object>} historicalData The processed historical data.
 * @param {object} realtimeData The real-time data for today.
 * @returns {Array<object>} The combined data.
 */
function combineData(historicalData, realtimeData) {
    if (!realtimeData) {
        return historicalData;
    }

    const combinedData = [...historicalData];
    const lastHistoricalData = combinedData[combinedData.length - 1];

    if (lastHistoricalData.date !== realtimeData.date) {
        combinedData.push(realtimeData);
    } else {
        combinedData[combinedData.length - 1] = realtimeData;
    }
    return combinedData;
}


// --- Public API ---

/**
 * Fetches and processes all data required for the calendar.
 * @param {object} dataPaths Paths to the data files.
 * @returns {Promise<{processedData: Array<object>, byDate: Map<string, object>, rates: object}>}
 */
export async function getCalendarData(dataPaths) {
    const allData = await fetchData(dataPaths);
    const rates = allData.fx.rates;

    const historicalData = processHistoricalData(allData.historical);
    if (historicalData.length === 0) {
        throw new Error('No historical data available.');
    }

    const lastHistoricalValue = historicalData[historicalData.length - 1].total;
    const realtimeData = calculateRealtimePnl(allData.holdings, allData.fund, lastHistoricalValue);

    const processedData = combineData(historicalData, realtimeData);
    const byDate = new Map(processedData.map(d => [d.date, d]));

    return { processedData, byDate, rates };
}