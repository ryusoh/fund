import * as d3 from 'https://esm.sh/d3@7';
import { getNyDate } from '../utils/date.js';
import { formatCurrency, formatNumber } from '../utils/formatting.js';
import { getBlueColorForSlice, hexToRgba } from '../utils/colors.js';
import { updatePieChart } from '../chart/chartManager.js';
import { checkAndToggleVerticalScroll } from '../ui/responsive.js';
import {
    HOLDINGS_DETAILS_URL,
    FUND_DATA_URL,
    COLORS,
    CHART_DEFAULTS,
    TICKER_TO_LOGO_MAP,
    BASE_URL,
    DATA_PATHS
} from '../config.js';

// --- Private Functions ---

/**
 * Fetches all necessary data from the server.
 * @param {object} paths An object with paths to the data files.
 * @returns {Promise<object>} A promise that resolves with the fetched data.
 */

async function fetchJSON(url) {
    const response = await fetch(`${url}?t=${new Date().getTime()}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function fetchPortfolioData() {
    const holdingsDetails = await fetchJSON(HOLDINGS_DETAILS_URL);
    const prices = await fetchJSON(FUND_DATA_URL);
    return { holdingsDetails, prices };
}

function processAndEnrichHoldings(holdingsDetails, prices) {
    let totalPortfolioValue = 0;
    let totalPnl = 0;
    const enrichedHoldings = Object.entries(holdingsDetails).map(([ticker, details]) => {
        const shares = parseFloat(details.shares) || 0;
        const cost = parseFloat(details.average_price) || 0;
        const currentPrice = parseFloat(prices[ticker]) || 0;
        const name = details.name || ticker;

        let currentValue = 0;
        let pnlValue = 0;
        let pnlPercentage = 0;

        if (!isNaN(shares) && !isNaN(currentPrice)) {
            currentValue = shares * currentPrice;
            if (!isNaN(cost) && cost !== 0) {
                pnlValue = (currentPrice - cost) * shares;
                const initialCostValue = cost * shares;
                pnlPercentage = initialCostValue !== 0 ? (pnlValue / initialCostValue) * 100 : 0;
            }
        }

        totalPortfolioValue += currentValue;
        totalPnl += pnlValue;

        return {
            ticker,
            name,
            shares,
            cost,
            currentPrice,
            currentValue,
            pnlValue,
            pnlPercentage,
        };
    });

    const sortedHoldings = enrichedHoldings.sort((a, b) => b.currentValue - a.currentValue);

    return { sortedHoldings, totalPortfolioValue, totalPnl };
}

function createHoldingRow(holding, totalPortfolioValueUSD, currentCurrency, exchangeRates, currencySymbols) {
    const row = document.createElement('tr');
    row.dataset.ticker = holding.ticker;

    const allocationPercentage = totalPortfolioValueUSD > 0 ? (holding.currentValue / totalPortfolioValueUSD) * 100 : 0;

    row.innerHTML = `
        <td>${holding.name}</td>
        <td class="allocation">${allocationPercentage.toFixed(2)}%</td>
        <td class="price">${formatCurrency(holding.currentPrice, currentCurrency, exchangeRates, currencySymbols)}</td>
        <td class="cost">${formatCurrency(holding.cost, currentCurrency, exchangeRates, currencySymbols)}</td>
        <td class="shares">${holding.shares.toFixed(2)}</td>
        <td class="value">${formatCurrency(holding.currentValue, currentCurrency, exchangeRates, currencySymbols)}</td>
        <td class="pnl"></td>
        <td class="pnl-percentage"></td>
    `;

    const pnlCell = row.querySelector('td.pnl');
    const pnlPercentageCell = row.querySelector('td.pnl-percentage');

    if (pnlCell && pnlPercentageCell) {
        const formattedAbsolutePnlValueWithSymbol = formatCurrency(holding.pnlValue, currentCurrency, exchangeRates, currencySymbols);
        let displayPnlValue;
        if (holding.pnlValue >= 0) {
            displayPnlValue = `+${formattedAbsolutePnlValueWithSymbol}`;
        } else {
            displayPnlValue = `-${formattedAbsolutePnlValueWithSymbol}`;
        }
        pnlCell.textContent = displayPnlValue;

        const pnlPercentagePrefix = holding.pnlPercentage >= 0 ? '+' : '';
        const formattedPnlPercentage = holding.pnlPercentage.toFixed(2);
        pnlPercentageCell.textContent = `${pnlPercentagePrefix}${formattedPnlPercentage}%`;

        if (holding.pnlValue > 0) {
            pnlCell.style.color = COLORS.POSITIVE_PNL;
            pnlPercentageCell.style.color = COLORS.POSITIVE_PNL;
        } else if (holding.pnlValue < 0) {
            pnlCell.style.color = COLORS.NEGATIVE_PNL;
            pnlPercentageCell.style.color = COLORS.NEGATIVE_PNL;
        } else {
            pnlCell.style.color = '';
            pnlPercentageCell.style.color = '';
        }
    }
    return row;
}

function updateTableAndPrepareChartData(sortedHoldings, totalPortfolioValueUSD, currentCurrency, exchangeRates, currencySymbols) {
    const tbody = document.querySelector('table tbody');
    tbody.innerHTML = '';

    const chartData = {
        labels: [],
        datasets: [{
            data: [],
            backgroundColor: [],
            borderColor: CHART_DEFAULTS.BORDER_COLOR,
            borderWidth: CHART_DEFAULTS.BORDER_WIDTH,
            images: []
        }]
    };

    sortedHoldings.forEach((holding, index) => {
        const row = createHoldingRow(holding, totalPortfolioValueUSD, currentCurrency, exchangeRates, currencySymbols);
        tbody.appendChild(row);

        const allocationPercentage = totalPortfolioValueUSD > 0 ? (holding.currentValue / totalPortfolioValueUSD) * 100 : 0;
        chartData.labels.push(holding.ticker);
        chartData.datasets[0].data.push(allocationPercentage);
        const baseColor = getBlueColorForSlice(index, sortedHoldings.length);
        chartData.datasets[0].backgroundColor.push(hexToRgba(baseColor, CHART_DEFAULTS.BACKGROUND_ALPHA));
        
        const originalLogoInfo = TICKER_TO_LOGO_MAP[holding.ticker] || { src: '/assets/logo/vt.png', scale: 1.0 };
        const logoInfo = { ...originalLogoInfo, src: BASE_URL + originalLogoInfo.src };
        chartData.datasets[0].images.push(logoInfo);
    });

    return chartData;
}

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
export async function loadAndDisplayPortfolioData(currentCurrency, exchangeRates, currencySymbols) {
    try {
        const { holdingsDetails, prices } = await fetchPortfolioData();

        if (!holdingsDetails || !prices) {
            console.error('Essential holding or price data missing, cannot update portfolio display.');
            return;
        }
        if (!exchangeRates || !currencySymbols) {
            console.error('Exchange rates or currency symbols missing, cannot update portfolio display correctly.');
            return;
        }

        const { sortedHoldings, totalPortfolioValue: totalPortfolioValueUSD, totalPnl: totalPnlUSD } = processAndEnrichHoldings(holdingsDetails, prices);
        const chartData = updateTableAndPrepareChartData(sortedHoldings, totalPortfolioValueUSD, currentCurrency, exchangeRates, currencySymbols);

        console.log('Chart data for updatePieChart:', JSON.stringify(chartData, null, 2));

        document.getElementById('total-portfolio-value-in-table').textContent = formatCurrency(totalPortfolioValueUSD, currentCurrency, exchangeRates, currencySymbols);

        const totalPortfolioCostUSD = totalPortfolioValueUSD - totalPnlUSD;
        const totalPnlPercentage = totalPortfolioCostUSD !== 0 ? (totalPnlUSD / totalPortfolioCostUSD) * 100 : 0;

        const pnlContainer = document.getElementById('table-footer-summary');
        const pnlElement = pnlContainer.querySelector('.total-pnl');

        const formattedPnl = formatCurrency(Math.abs(totalPnlUSD), currentCurrency, exchangeRates, currencySymbols);
        const pnlSign = totalPnlUSD >= 0 ? '+' : '-';
        const pnlPercentageSign = totalPnlPercentage >= 0 ? '+' : '';

        pnlElement.textContent = ` (${pnlSign}${formattedPnl}, ${pnlPercentageSign}${totalPnlPercentage.toFixed(2)}%)`;

        if (totalPnlUSD >= 0) {
            pnlElement.style.color = COLORS.POSITIVE_PNL;
        } else {
            pnlElement.style.color = COLORS.NEGATIVE_PNL;
        }

        updatePieChart(chartData);
        checkAndToggleVerticalScroll();

    } catch (error) {
        console.error('Error fetching or processing fund data:', error);
    }
}

export async function getCalendarData(dataPaths) {
    const allData = await fetchData(dataPaths);
    const rates = allData.fx.rates;

    const historicalData = processHistoricalData(allData.historical);
    if (historicalData.length === 0) {
        throw new Error('No historical data available.');
    }

    const today = getNyDate();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let valueForPnlCalculation;
    const lastHistoricalData = historicalData[historicalData.length - 1];

    if (lastHistoricalData.date === todayStr) {
        // If today's data is present, use yesterday's value for PNL calculation.
        if (historicalData.length > 1) {
            valueForPnlCalculation = historicalData[historicalData.length - 2].total;
        } else {
            // Only today's data exists, so PNL is against 0.
            valueForPnlCalculation = 0;
        }
    } else {
        // Otherwise, use the last available historical value.
        valueForPnlCalculation = lastHistoricalData.total;
    }

    const realtimeData = calculateRealtimePnl(allData.holdings, allData.fund, valueForPnlCalculation);

    const processedData = combineData(historicalData, realtimeData);
    const byDate = new Map(processedData.map(d => [d.date, d]));

    return { processedData, byDate, rates };
}