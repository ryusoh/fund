import { formatCurrency } from '../utils/formatting.js';
import { getBlueColorForSlice, hexToRgba } from '../utils/colors.js';
import { updatePieChart } from '../chart/chartManager.js';
import { checkAndToggleVerticalScroll } from '../ui/responsive.js';
import {
    HOLDINGS_DETAILS_URL,
    FUND_DATA_URL,
    COLORS,
    CHART_DEFAULTS
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
 * @returns {{sortedHoldings: Array<Object>, totalPortfolioValue: number}}
 */
function processAndEnrichHoldings(holdingsDetails, prices) {
    let totalPortfolioValue = 0;
    const enrichedHoldings = Object.entries(holdingsDetails).map(([ticker, details]) => {
        const shares = parseFloat(details.shares);
        const cost = parseFloat(details.average_price); // Use average_price
        const currentPrice = parseFloat(prices[ticker]) || 0;
        const name = details.name || ticker;

        let currentValue = 0;
        let pnlValue = 0;
        let pnlPercentage = 0;

        if (!isNaN(shares) && currentPrice !== undefined) {
            currentValue = shares * currentPrice;
            if (!isNaN(cost)) {
                pnlValue = (currentPrice - cost) * shares;
                const initialCostValue = cost * shares;
                pnlPercentage = initialCostValue !== 0 ? (pnlValue / initialCostValue) * 100 : 0;
            }
        }
        totalPortfolioValue += currentValue;

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

    // Sort holdings by current value in descending order
    const sortedHoldings = enrichedHoldings.sort((a, b) => b.currentValue - a.currentValue);

    return { sortedHoldings, totalPortfolioValue };
}

/**
 * Creates a table row element for a given holding.
 * @param {Object} holding - Processed holding data.
 * @param {number} totalPortfolioValue - Total value of the portfolio for allocation calculation.
 * @returns {HTMLTableRowElement} The created table row element.
 */
function createHoldingRow(holding, totalPortfolioValue) {
    const row = document.createElement('tr');
    row.dataset.ticker = holding.ticker;

    const allocationPercentage = totalPortfolioValue > 0 ? (holding.currentValue / totalPortfolioValue) * 100 : 0;

    row.innerHTML = `
        <td>${holding.name}</td>
        <td class="allocation">${allocationPercentage.toFixed(2)}%</td>
        <td class="price">${formatCurrency(holding.currentPrice)}</td>
        <td class="cost">${formatCurrency(holding.cost)}</td>
        <td class="shares">${holding.shares.toFixed(2)}</td>
        <td class="value">${formatCurrency(holding.currentValue)}</td>
        <td class="pnl"></td>
    `;

    const pnlCell = row.querySelector('td.pnl');
    if (pnlCell) {
        const formattedPnlCurrency = formatCurrency(holding.pnlValue);
        const pnlPrefix = holding.pnlValue >= 0 ? '+' : '';
        const displayPnlAmount = holding.pnlValue >= 0 ? `+${formattedPnlCurrency}` : formattedPnlCurrency;

        pnlCell.textContent = `${displayPnlAmount} (${pnlPrefix}${holding.pnlPercentage.toFixed(2)}%)`;
        if (holding.pnlValue > 0) {
            pnlCell.style.color = COLORS.POSITIVE_PNL;
        } else if (holding.pnlValue < 0) {
            pnlCell.style.color = COLORS.NEGATIVE_PNL;
        } else {
            pnlCell.style.color = ''; // Default browser/CSS color
        }
    }
    return row;
}

/**
 * Updates the holdings table in the DOM and prepares data for the pie chart.
 * @param {Array<Object>} sortedHoldings - Array of sorted, processed holding data.
 * @param {number} totalPortfolioValue - Total value of the portfolio.
 * @returns {Object} Data formatted for the pie chart.
 */
function updateTableAndPrepareChartData(sortedHoldings, totalPortfolioValue) {
    const tbody = document.querySelector('table tbody');
    tbody.innerHTML = ''; // Clear existing rows

    const chartData = {
        labels: [],
        datasets: [{
            data: [],
            backgroundColor: [],
            borderColor: CHART_DEFAULTS.BORDER_COLOR,
            borderWidth: CHART_DEFAULTS.BORDER_WIDTH,
        }]
    };

    sortedHoldings.forEach((holding, index) => {
        const row = createHoldingRow(holding, totalPortfolioValue);
        tbody.appendChild(row);

        const allocationPercentage = totalPortfolioValue > 0 ? (holding.currentValue / totalPortfolioValue) * 100 : 0;
        chartData.labels.push(holding.ticker);
        chartData.datasets[0].data.push(allocationPercentage);
        const baseColor = getBlueColorForSlice(index, sortedHoldings.length);
        chartData.datasets[0].backgroundColor.push(hexToRgba(baseColor, CHART_DEFAULTS.BACKGROUND_ALPHA));
    });

    return chartData;
}

/**
 * Fetches, processes, and displays portfolio data including holdings table and pie chart.
 */
export async function loadAndDisplayPortfolioData() {
    try {
        const { holdingsDetails, prices } = await fetchPortfolioData();

        if (!holdingsDetails || !prices) {
            console.error('Essential data missing, cannot update portfolio display.');
            return;
        }

        const { sortedHoldings, totalPortfolioValue } = processAndEnrichHoldings(holdingsDetails, prices);
        const chartData = updateTableAndPrepareChartData(sortedHoldings, totalPortfolioValue);

        document.getElementById('total-portfolio-value-in-table').textContent = formatCurrency(totalPortfolioValue);
        updatePieChart(chartData);
        checkAndToggleVerticalScroll();

    } catch (error) {
        console.error('Error fetching or processing fund data:', error);
    }
}