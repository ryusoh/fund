import { formatCurrency } from '../utils/formatting.js';
import { getBlueColorForSlice, hexToRgba } from '../utils/colors.js';
import { updatePieChart } from '../chart/chartManager.js';
import { checkAndToggleVerticalScroll } from '../ui/responsive.js';
import {
    HOLDINGS_DETAILS_URL,
    FUND_DATA_URL,
    COLORS,
    CHART_DEFAULTS,
    TICKER_TO_LOGO_MAP
} from '../config.js';

/**
 * Fetches JSON data from a given URL with cache busting.
 * @param {string} url - The URL to fetch data from.
 * @returns {Promise<Object>} A promise that resolves with the JSON data.
 * @throws {Error} If the network response is not ok.
 */
async function fetchJSON(url) {
    const response = await fetch(`${url}?t=${new Date().getTime()}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

/**
 * Fetches portfolio data (holdings details and current prices).
 * @returns {Promise<{holdingsDetails: Object, prices: Object}>}
 */
async function fetchPortfolioData() {
    const holdingsDetails = await fetchJSON(HOLDINGS_DETAILS_URL);
    const prices = await fetchJSON(FUND_DATA_URL);
    return { holdingsDetails, prices };
}

/**
 * Processes raw holding and price data to calculate values, P&L, and sorts holdings.
 * @param {Object} holdingsDetails - Raw holdings data.
 * @param {Object} prices - Current market prices for tickers.
 * All monetary values in holdingsDetails (like average_price) and prices are assumed to be in USD.
 * @returns {{sortedHoldings: Array<Object>, totalPortfolioValue: number, totalPnl: number}}
 * All monetary values in returned objects (currentValue, pnlValue, totalPortfolioValue) are in USD.
 */
function processAndEnrichHoldings(holdingsDetails, prices) {
    let totalPortfolioValue = 0;
    let totalPnl = 0;
    const enrichedHoldings = Object.entries(holdingsDetails).map(([ticker, details]) => {
        const shares = parseFloat(details.shares) || 0; // Fallback to 0 if NaN
        const cost = parseFloat(details.average_price) || 0; // Fallback to 0 if NaN
        const currentPrice = parseFloat(prices[ticker]) || 0;
        const name = details.name || ticker;

        let currentValue = 0;
        let pnlValue = 0;
        let pnlPercentage = 0;

        if (!isNaN(shares) && !isNaN(currentPrice)) {
            currentValue = shares * currentPrice; // Total current value in USD
            if (!isNaN(cost) && cost !== 0) { // Ensure cost is a valid number and not zero for percentage calculation
                pnlValue = (currentPrice - cost) * shares; // Total P&L in USD
                const initialCostValue = cost * shares;
                pnlPercentage = initialCostValue !== 0 ? (pnlValue / initialCostValue) * 100 : 0;
            }
        }
        totalPortfolioValue += currentValue;
        totalPnl += pnlValue;

        return {
            ticker,
            name,
            shares, // unit
            cost, // USD per share
            currentPrice, // USD per share
            currentValue, // USD total
            pnlValue, // USD total
            pnlPercentage,
        };
    });

    // Sort holdings by current value in descending order
    const sortedHoldings = enrichedHoldings.sort((a, b) => b.currentValue - a.currentValue);

    return { sortedHoldings, totalPortfolioValue, totalPnl };
}

/**
 * Creates a table row element for a given holding.
 * @param {Object} holding - Processed holding data.
 * @param {number} totalPortfolioValueUSD - Total value of the portfolio in USD for allocation calculation.
 * @param {string} currentCurrency - The target currency code for display.
 * @param {Object} exchangeRates - Exchange rates object.
 * @param {Object} currencySymbols - Currency symbols object.
 * @returns {HTMLTableRowElement} The created table row element.
 */
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
        <td class="pnl"></td> <!-- For absolute PnL value -->
        <td class="pnl-percentage"></td> <!-- For PnL percentage -->
    `;

    const pnlCell = row.querySelector('td.pnl');
    const pnlPercentageCell = row.querySelector('td.pnl-percentage');

    if (pnlCell && pnlPercentageCell) {
        const formattedAbsolutePnlValueWithSymbol = formatCurrency(holding.pnlValue, currentCurrency, exchangeRates, currencySymbols);
        let displayPnlValue;
        if (holding.pnlValue >= 0) { // Positive or Zero
            displayPnlValue = `+${formattedAbsolutePnlValueWithSymbol}`; // e.g. "+$10.00"
        } else { // Negative
            displayPnlValue = `-${formattedAbsolutePnlValueWithSymbol}`; // e.g. "-$10.00"
        }
        pnlCell.textContent = displayPnlValue;

        const pnlPercentagePrefix = holding.pnlPercentage >= 0 ? '+' : ''; // Prefix for the percentage number
        const formattedPnlPercentage = holding.pnlPercentage.toFixed(2);
        pnlPercentageCell.textContent = `${pnlPercentagePrefix}${formattedPnlPercentage}%`;

        if (holding.pnlValue > 0) {
            pnlCell.style.color = COLORS.POSITIVE_PNL;
            pnlPercentageCell.style.color = COLORS.POSITIVE_PNL;
        } else if (holding.pnlValue < 0) {
            pnlCell.style.color = COLORS.NEGATIVE_PNL;
            pnlPercentageCell.style.color = COLORS.NEGATIVE_PNL;
        } else {
            pnlCell.style.color = ''; // Default browser/CSS color
            pnlPercentageCell.style.color = ''; // Default browser/CSS color
        }
    }
    return row;
}

/**
 * Updates the holdings table in the DOM and prepares data for the pie chart.
 * @param {Array<Object>} sortedHoldings - Array of sorted, processed holding data (monetary values in USD).
 * @param {number} totalPortfolioValueUSD - Total value of the portfolio in USD.
 * @param {string} currentCurrency - The target currency code for display.
 * @param {Object} exchangeRates - Exchange rates object.
 * @param {Object} currencySymbols - Currency symbols object.
 * @returns {Object} Data formatted for the pie chart.
 */
function updateTableAndPrepareChartData(sortedHoldings, totalPortfolioValueUSD, currentCurrency, exchangeRates, currencySymbols) {
    const tbody = document.querySelector('table tbody');
    tbody.innerHTML = ''; // Clear existing rows

    const chartData = {
        labels: [],
        datasets: [{
            data: [],
            backgroundColor: [],
            borderColor: CHART_DEFAULTS.BORDER_COLOR,
            borderWidth: CHART_DEFAULTS.BORDER_WIDTH,
            images: [] // This will now be an array of objects
        }]
    };

    sortedHoldings.forEach((holding, index) => {
        const row = createHoldingRow(holding, totalPortfolioValueUSD, currentCurrency, exchangeRates, currencySymbols);
        tbody.appendChild(row);

        const allocationPercentage = totalPortfolioValueUSD > 0 ? (holding.currentValue / totalPortfolioValueUSD) * 100 : 0;
        chartData.labels.push(holding.ticker); // Ticker is currency-agnostic
        chartData.datasets[0].data.push(allocationPercentage);
        const baseColor = getBlueColorForSlice(index, sortedHoldings.length);
        chartData.datasets[0].backgroundColor.push(hexToRgba(baseColor, CHART_DEFAULTS.BACKGROUND_ALPHA));
        
        // --- Add the logo info to the dataset ---
        const logoInfo = TICKER_TO_LOGO_MAP[holding.ticker] || { src: '/img/logo/default.svg', scale: 1.0 };
        chartData.datasets[0].images.push(logoInfo);
    });

    return chartData;
}

/**
 * Fetches, processes, and displays portfolio data including holdings table and pie chart.
 * @param {string} currentCurrency - The target currency code for display.
 * @param {Object} exchangeRates - Exchange rates object.
 * @param {Object} currencySymbols - Currency symbols object.
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

        // Log the data being sent to the chart
        console.log('Chart data for updatePieChart:', JSON.stringify(chartData, null, 2));

        document.getElementById('total-portfolio-value-in-table').textContent = formatCurrency(totalPortfolioValueUSD, currentCurrency, exchangeRates, currencySymbols);

        // New PnL display logic
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