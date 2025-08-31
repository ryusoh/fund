import { getNyDate, isTradingDay } from '@utils/date.js';
import { formatCurrency } from '@utils/formatting.js';
import { getBlueColorForSlice, hexToRgba } from '@utils/colors.js';
import { updatePieChart } from '@charts/allocationChartManager.js';
import { checkAndToggleVerticalScroll } from '@ui/responsive.js';
import {
    HOLDINGS_DETAILS_URL,
    FUND_DATA_URL,
    COLORS,
    CHART_DEFAULTS,
    TICKER_TO_LOGO_MAP,
    BASE_URL,
} from '@js/config.js';

// --- Private Functions ---

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

        currentValue = shares * currentPrice;
        if (cost !== 0) {
            pnlValue = (currentPrice - cost) * shares;
            const initialCostValue = cost * shares;
            if (initialCostValue !== 0) {
                pnlPercentage = (pnlValue / initialCostValue) * 100;
            } else {
                pnlPercentage = 0;
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

function createHoldingRow(
    holding,
    totalPortfolioValueUSD,
    currentCurrency,
    exchangeRates,
    currencySymbols
) {
    const row = document.createElement('tr');
    row.dataset.ticker = holding.ticker;

    const allocationPercentage =
        totalPortfolioValueUSD > 0 ? (holding.currentValue / totalPortfolioValueUSD) * 100 : 0;

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
        const formattedAbsolutePnlValueWithSymbol = formatCurrency(
            holding.pnlValue,
            currentCurrency,
            exchangeRates,
            currencySymbols
        );
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

function updateTableAndPrepareChartData(
    sortedHoldings,
    totalPortfolioValueUSD,
    currentCurrency,
    exchangeRates,
    currencySymbols
) {
    const tbody = document.querySelector('table tbody');
    tbody.innerHTML = '';

    const chartData = {
        labels: [],
        datasets: [
            {
                data: [],
                backgroundColor: [],
                borderColor: CHART_DEFAULTS.BORDER_COLOR,
                borderWidth: CHART_DEFAULTS.BORDER_WIDTH,
                images: [],
            },
        ],
    };

    sortedHoldings.forEach((holding, index) => {
        const row = createHoldingRow(
            holding,
            totalPortfolioValueUSD,
            currentCurrency,
            exchangeRates,
            currencySymbols
        );
        tbody.appendChild(row);

        const allocationPercentage =
            totalPortfolioValueUSD > 0 ? (holding.currentValue / totalPortfolioValueUSD) * 100 : 0;
        chartData.labels.push(holding.ticker);
        chartData.datasets[0].data.push(allocationPercentage);
        const baseColor = getBlueColorForSlice(index, sortedHoldings.length);
        chartData.datasets[0].backgroundColor.push(
            hexToRgba(baseColor, CHART_DEFAULTS.BACKGROUND_ALPHA)
        );

        const originalLogoInfo = TICKER_TO_LOGO_MAP[holding.ticker] || {
            src: '/assets/logo/vt.png',
            scale: 1.0,
        };
        const logoInfo = { ...originalLogoInfo, src: BASE_URL + originalLogoInfo.src };
        chartData.datasets[0].images.push(logoInfo);
    });

    return chartData;
}

async function fetchData(paths) {
    // Lazy-load d3 (prefer local vendor, fallback to CDN)
    let d3;
    try {
        d3 = await import('@vendor/d3.v7.mjs');
    } catch {
        d3 = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm');
    }
    const timestamp = new Date().getTime();
    const [historical, fx, holdings, fund] = await Promise.all([
        d3.csv(`${paths.historical}?t=${timestamp}`),
        d3.json(`${paths.fx}?t=${timestamp}`),
        d3.json(`${paths.holdings}?t=${timestamp}`),
        d3.json(`${paths.fund}?t=${timestamp}`),
    ]);
    return { historical, fx, holdings, fund };
}

function processHistoricalData(rawData) {
    if (!rawData || rawData.length === 0) {
        return [];
    }
    return rawData
        .map((d, i) => {
            const currentValue = parseFloat(d.value_usd);
            let dailyChange = 0;
            let pnl = 0;

            if (i > 0) {
                const previousValue = parseFloat(rawData[i - 1].value_usd);
                dailyChange = currentValue - previousValue;
                pnl = previousValue === 0 ? 0 : dailyChange / previousValue;
            }

            return { date: d.date, value: pnl, total: currentValue, dailyChange };
        })
        .filter((d) => d.date);
}

function calculateRealtimePnl(holdingsData, fundData, lastHistoricalValue) {
    if (!holdingsData || !fundData) {
        return null;
    }

    const today = getNyDate();

    if (!isTradingDay(today)) {
        return null;
    }

    let currentTotalValue = 0;
    for (const ticker in holdingsData) {
        if (fundData[ticker]) {
            currentTotalValue +=
                parseFloat(holdingsData[ticker].shares) * parseFloat(fundData[ticker]);
        }
    }

    const dailyChange = currentTotalValue - lastHistoricalValue;
    const pnl = lastHistoricalValue === 0 ? 0 : dailyChange / lastHistoricalValue;
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return {
        date: todayStr,
        value: pnl,
        total: currentTotalValue,
        dailyChange,
    };
}

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

export async function loadAndDisplayPortfolioData(currentCurrency, exchangeRates, currencySymbols) {
    try {
        const { holdingsDetails, prices } = await fetchPortfolioData();

        if (!holdingsDetails || !prices) {
            console.error(
                'Essential holding or price data missing, cannot update portfolio display.'
            );
            return;
        }
        if (!exchangeRates || !currencySymbols) {
            console.error(
                'Exchange rates or currency symbols missing, cannot update portfolio display correctly.'
            );
            return;
        }

        const {
            sortedHoldings,
            totalPortfolioValue: totalPortfolioValueUSD,
            totalPnl: totalPnlUSD,
        } = processAndEnrichHoldings(holdingsDetails, prices);
        const chartData = updateTableAndPrepareChartData(
            sortedHoldings,
            totalPortfolioValueUSD,
            currentCurrency,
            exchangeRates,
            currencySymbols
        );

        document.getElementById('total-portfolio-value-in-table').textContent = formatCurrency(
            totalPortfolioValueUSD,
            currentCurrency,
            exchangeRates,
            currencySymbols
        );

        const totalPortfolioCostUSD = totalPortfolioValueUSD - totalPnlUSD;
        const totalPnlPercentage =
            totalPortfolioCostUSD !== 0 ? (totalPnlUSD / totalPortfolioCostUSD) * 100 : 0;

        const pnlContainer = document.getElementById('table-footer-summary');
        const pnlElement = pnlContainer.querySelector('.total-pnl');

        const formattedPnl = formatCurrency(
            Math.abs(totalPnlUSD),
            currentCurrency,
            exchangeRates,
            currencySymbols
        );
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
        if (historicalData.length > 1) {
            valueForPnlCalculation = historicalData[historicalData.length - 2].total;
        } else {
            valueForPnlCalculation = 0;
        }
    } else {
        valueForPnlCalculation = lastHistoricalData.total;
    }

    const realtimeData = calculateRealtimePnl(
        allData.holdings,
        allData.fund,
        valueForPnlCalculation
    );

    const processedData = combineData(historicalData, realtimeData);
    const byDate = new Map(processedData.map((d) => [d.date, d]));

    return { processedData, byDate, rates };
}
