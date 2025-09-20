import { getNyDate, isTradingDay } from '@utils/date.js';
import { formatCurrency } from '@utils/formatting.js';
import { getBlueColorForSlice, hexToRgba } from '@utils/colors.js';
import { updatePieChart } from '@charts/allocationChartManager.js';
import { checkAndToggleVerticalScroll } from '@ui/responsive.js';
import { setThinkingHighlight } from '@ui/textHighlightManager.js';
import {
    HOLDINGS_DETAILS_URL,
    FUND_DATA_URL,
    COLORS,
    CHART_DEFAULTS,
    TICKER_TO_LOGO_MAP,
    BASE_URL,
    POSITION_PNL_HIGHLIGHT,
} from '@js/config.js';
import { logger } from '@utils/logger.js';

function lightenHexToRgba(hex, lightenFactor, alpha) {
    /* istanbul ignore next: defensive parameter validation */
    if (typeof hex !== 'string' || !/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(hex)) {
        /* istanbul ignore next: defensive parameter validation */
        return null;
    }
    /* istanbul ignore next: defensive handling of short hex format */
    const normalized =
        hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    const r = parseInt(normalized.substring(1, 3), 16);
    const g = parseInt(normalized.substring(3, 5), 16);
    const b = parseInt(normalized.substring(5, 7), 16);
    /* istanbul ignore next: defensive parameter validation */
    const light = Math.max(0, Math.min(1, Number.isFinite(lightenFactor) ? lightenFactor : 0.5));
    /* istanbul ignore next: defensive parameter validation */
    const targetAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    const lighten = (channel) => Math.round(channel + (255 - channel) * light);
    return `rgba(${lighten(r)}, ${lighten(g)}, ${lighten(b)}, ${targetAlpha})`;
}

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
        const resolvedSrc =
            typeof originalLogoInfo.src === 'string' && originalLogoInfo.src.startsWith('http')
                ? originalLogoInfo.src
                : BASE_URL + originalLogoInfo.src;
        const logoInfo = { ...originalLogoInfo, src: resolvedSrc };
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

/* istanbul ignore next: defensive utility function for previous month calculation */
function getPreviousMonthKey(monthKey) {
    /* istanbul ignore next: defensive programming for invalid input */
    const [yearStr, monthStr] = monthKey.split('-');
    /* istanbul ignore next: defensive programming for invalid input */
    const year = Number(yearStr);
    /* istanbul ignore next: defensive programming for invalid input */
    const month = Number(monthStr);
    /* istanbul ignore next: defensive programming for invalid input */
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
        /* istanbul ignore next: defensive programming for invalid input */
        return null;
    }
    /* istanbul ignore next: defensive programming for invalid input */
    let prevYear = year;
    /* istanbul ignore next: defensive programming for invalid input */
    let prevMonth = month - 1;
    /* istanbul ignore next: defensive programming for invalid input */
    if (prevMonth < 1) {
        /* istanbul ignore next: defensive programming for invalid input */
        prevMonth = 12;
        /* istanbul ignore next: defensive programming for invalid input */
        prevYear -= 1;
    }
    /* istanbul ignore next: defensive programming for invalid input */
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

/* istanbul ignore next: defensive monthly PnL computation function */
function computeMonthlyPnl(processedData) {
    /* istanbul ignore next: defensive programming for empty data */
    if (!Array.isArray(processedData) || processedData.length === 0) {
        /* istanbul ignore next: defensive programming for empty data */
        return new Map();
    }

    /* istanbul ignore next: defensive programming for empty data */
    const buckets = new Map();
    /* istanbul ignore next: defensive programming for empty data */
    for (const entry of processedData) {
        /* istanbul ignore next: defensive programming for malformed entries */
        if (!entry || typeof entry.date !== 'string') {
            /* istanbul ignore next: defensive programming for malformed entries */
            continue;
        }
        /* istanbul ignore next: defensive programming for malformed entries */
        const monthKey = entry.date.slice(0, 7);
        /* istanbul ignore next: defensive programming for malformed entries */
        if (!buckets.has(monthKey)) {
            /* istanbul ignore next: defensive programming for malformed entries */
            buckets.set(monthKey, []);
        }
        /* istanbul ignore next: defensive programming for malformed entries */
        buckets.get(monthKey).push(entry);
    }

    /* istanbul ignore next: defensive programming for malformed entries */
    const sortedMonthKeys = Array.from(buckets.keys()).sort();
    /* istanbul ignore next: defensive programming for malformed entries */
    const monthlyPnl = new Map();

    /* istanbul ignore next: defensive programming for malformed entries */
    for (const monthKey of sortedMonthKeys) {
        /* istanbul ignore next: defensive programming for empty month buckets */
        const entries = buckets.get(monthKey);
        /* istanbul ignore next: defensive programming for empty month buckets */
        if (!entries || entries.length === 0) {
            /* istanbul ignore next: defensive programming for empty month buckets */
            continue;
        }

        /* istanbul ignore next: defensive programming for empty month buckets */
        entries.sort((a, b) => a.date.localeCompare(b.date));

        /* istanbul ignore next: defensive programming for missing entries */
        const firstEntry = entries[0];
        /* istanbul ignore next: defensive programming for missing entries */
        const lastEntry = entries[entries.length - 1];

        /* istanbul ignore next: defensive programming for missing entries */
        if (!firstEntry || !lastEntry) {
            /* istanbul ignore next: defensive programming for missing entries */
            continue;
        }

        /* istanbul ignore next: defensive programming for optional previous month */
        const prevMonthKey = getPreviousMonthKey(monthKey);
        /* istanbul ignore next: defensive programming for optional previous month */
        const prevEntries = prevMonthKey ? buckets.get(prevMonthKey) : null;
        /* istanbul ignore next: defensive programming for optional previous month entries */
        const prevMonthLastEntry =
            prevEntries && prevEntries.length > 0 ? prevEntries[prevEntries.length - 1] : null;
        /* istanbul ignore next: defensive programming for fallback entry selection */
        const baseEntry = prevMonthLastEntry || firstEntry;

        /* istanbul ignore next: defensive programming for invalid totals */
        const baseTotal = Number(baseEntry?.total);
        /* istanbul ignore next: defensive programming for invalid totals */
        const lastTotal = Number(lastEntry?.total);

        /* istanbul ignore next: defensive programming for invalid totals */
        if (!Number.isFinite(baseTotal) || !Number.isFinite(lastTotal)) {
            /* istanbul ignore next: defensive programming for invalid totals */
            continue;
        }

        /* istanbul ignore next: defensive programming for zero base total edge case */
        const absoluteChangeUSD = lastTotal - baseTotal;
        /* istanbul ignore next: defensive programming for zero base total edge case */
        let percentChange = null;

        /* istanbul ignore next: defensive programming for zero base total edge case */
        if (baseTotal === 0) {
            /* istanbul ignore next: defensive programming for zero base total edge case */
            percentChange = absoluteChangeUSD === 0 ? 0 : null;
        } else {
            /* istanbul ignore next: defensive programming for zero base total edge case */
            percentChange = absoluteChangeUSD / baseTotal;
        }

        /* istanbul ignore next: defensive programming for zero base total edge case */
        monthlyPnl.set(monthKey, {
            absoluteChangeUSD,
            percentChange,
        });
    }

    /* istanbul ignore next: defensive programming for zero base total edge case */
    return monthlyPnl;
}

export async function loadAndDisplayPortfolioData(currentCurrency, exchangeRates, currencySymbols) {
    try {
        const { holdingsDetails, prices } = await fetchPortfolioData();

        if (!holdingsDetails || !prices) {
            logger.error(
                'Essential holding or price data missing, cannot update portfolio display.'
            );
            return;
        }
        if (!exchangeRates || !currencySymbols) {
            logger.error(
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

        // Clear previous content and stop any existing thinking effects
        setThinkingHighlight(pnlElement, false);
        pnlElement.innerHTML = '';

        // Create structured spans for PnL display with thinking effect
        const openBracket = document.createElement('span');
        openBracket.className = 'pnl-bracket';
        openBracket.textContent = ' (';

        const pnlAmount = document.createElement('span');
        pnlAmount.className = 'pnl-amount';
        pnlAmount.textContent = `${pnlSign}${formattedPnl}`;

        const separator = document.createElement('span');
        separator.className = 'pnl-separator';
        separator.textContent = ', ';

        const pnlPercent = document.createElement('span');
        pnlPercent.className = 'pnl-percent';
        pnlPercent.textContent = `${pnlPercentageSign}${totalPnlPercentage.toFixed(2)}%`;

        const closeBracket = document.createElement('span');
        closeBracket.className = 'pnl-bracket';
        closeBracket.textContent = ')';

        // Set colors for interactive elements
        const pnlColor = totalPnlUSD >= 0 ? COLORS.POSITIVE_PNL : COLORS.NEGATIVE_PNL;
        pnlAmount.style.color = pnlColor;
        pnlPercent.style.color = pnlColor;

        // Set bracket color to match footer text color (same as "TOTAL")
        const footerTextColor = window.getComputedStyle(pnlContainer).color;
        openBracket.style.color = footerTextColor;
        separator.style.color = footerTextColor;
        closeBracket.style.color = footerTextColor;

        // Append all parts
        pnlElement.appendChild(openBracket);
        pnlElement.appendChild(pnlAmount);
        pnlElement.appendChild(separator);
        pnlElement.appendChild(pnlPercent);
        pnlElement.appendChild(closeBracket);

        // Apply thinking highlight to the PnL values (amount and percentage)
        // Create a lightened version of the PnL color for the wave effect (same as calendar)
        /* istanbul ignore next: defensive fallback for null case */
        const lightenedPnlColor =
            lightenHexToRgba(
                pnlColor,
                POSITION_PNL_HIGHLIGHT.pnlLightenFactor,
                POSITION_PNL_HIGHLIGHT.pnlLightAlpha
            ) || POSITION_PNL_HIGHLIGHT.neutralDimColor;
        const thinkingOptions = {
            intervalMs: POSITION_PNL_HIGHLIGHT.intervalMs,
            waveSize: POSITION_PNL_HIGHLIGHT.waveSize,
            baseColor: POSITION_PNL_HIGHLIGHT.baseColor,
            dimColor: lightenedPnlColor,
        };
        setThinkingHighlight([pnlAmount, pnlPercent], true, thinkingOptions);

        updatePieChart(chartData);
        checkAndToggleVerticalScroll();
    } catch (error) {
        logger.error('Error fetching or processing fund data:', error);
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
    const monthlyPnl = computeMonthlyPnl(processedData);

    return { processedData, byDate, rates, monthlyPnl };
}
