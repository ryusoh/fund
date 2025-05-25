import { formatCurrency } from '../utils/formatting.js';
import { getBlueColorForSlice, hexToRgba } from '../utils/colors.js';
import { updatePieChart } from '../chart/chartManager.js';
import { checkAndToggleVerticalScroll } from '../ui/responsive.js';

export async function fetchAndUpdatePrices() {
    try {
        // Fetch holdings details (cost, shares) from data/ directory
        const holdingsResponse = await fetch('./data/holdings_details.json?t=' + new Date().getTime());
        if (!holdingsResponse.ok) {
            console.error('Failed to fetch holdings_details.json:', holdingsResponse.status, holdingsResponse.statusText);
            return;
        }
        const holdingsDetails = await holdingsResponse.json();
        // Fetch current prices from data/ directory
        const pricesResponse = await fetch('./data/fund_data.json?t=' + new Date().getTime()); 
        if (!pricesResponse.ok) {
            console.error('Failed to fetch fund_data.json (prices):', pricesResponse.status, pricesResponse.statusText);
            return;
        }
        const prices = await pricesResponse.json();

        let totalPortfolioValue = 0;
        const rowsArray = []; // We will build this array dynamically
        const chartData = { 
            labels: [], 
            datasets: [{ 
                data: [], 
                backgroundColor: [],
                borderColor: 'rgba(84, 84, 88, 0.5)', 
                borderWidth: 0.5  
            }] 
        };
        const tbody = document.querySelector('table tbody');
        tbody.innerHTML = ''; // Clear existing rows before adding new ones

        // Dynamically create table rows from holdingsDetails
        // holdingsDetails is now an object like: {"AAPL": {"shares": "10", "average_price": "170.50"}, ...}
        for (const [ticker, details] of Object.entries(holdingsDetails)) {
            const shares = parseFloat(details.shares);
            const cost = parseFloat(details.average_price); // Use average_price from the new format
            const currentPrice = parseFloat(prices[ticker]) || 0; // Get current price, default to 0 if not found
            const name = details.name || ticker;

            const row = document.createElement('tr');
            row.dataset.ticker = ticker;

            row.innerHTML = `
                <td>${name}</td>
                <td class="allocation">0.00%</td>
                <td class="price">${formatCurrency(currentPrice)}</td>
                <td class="cost">${formatCurrency(cost)}</td>
                <td class="shares">${shares.toFixed(2)}</td>
                <td class="value">$0.00</td>
                <td class="pnl">$0.00</td>
            `;
            tbody.appendChild(row);
            rowsArray.push(row); // Add the newly created row to our array for processing

            // Now, populate the dynamic cells (value, PnL) for this new row
            const sharesCell = row.querySelector('td.shares'); 
            const costCell = row.querySelector('td.cost');
            const pnlCell = row.querySelector('td.pnl');
            const priceCell = row.querySelector('td.price');
            const valueCell = row.querySelector('td.value');

            if (!isNaN(shares) && !isNaN(cost) && currentPrice !== undefined) {
                const currentValue = shares * currentPrice;
                if (valueCell) valueCell.textContent = formatCurrency(currentValue);
                
                if (!isNaN(cost) && pnlCell) {
                    const pnlValue = (currentPrice - cost) * shares;
                    const initialCostValue = cost * shares;
                    const pnlPercentage = initialCostValue !== 0 ? (pnlValue / initialCostValue) * 100 : 0;

                    const formattedPnlCurrency = formatCurrency(pnlValue);
                    let pnlPrefix = pnlValue >= 0 ? '+' : ''; 
                    const displayPnlAmount = pnlValue >= 0 ? `+${formattedPnlCurrency}` : formattedPnlCurrency;

                    pnlCell.textContent = `${displayPnlAmount} (${pnlPrefix}${pnlPercentage.toFixed(2)}%)`;
                    if (pnlValue > 0) {
                        pnlCell.style.color = '#30D158'; 
                    } else if (pnlValue < 0) {
                        pnlCell.style.color = '#FF453A'; 
                    } else {
                        pnlCell.style.color = ''; 
                    }
                }
                totalPortfolioValue += currentValue;
                row.dataset.currentValue = currentValue; 
            }
        }

        document.getElementById('total-portfolio-value-in-table').textContent = formatCurrency(totalPortfolioValue);

        rowsArray.sort((a, b) => {
            const valueA = parseFloat(a.dataset.currentValue || "0"); // currentValue was set above
            const valueB = parseFloat(b.dataset.currentValue || "0"); // currentValue was set above
            return valueB - valueA; 
        });

        rowsArray.forEach((row, index) => { // Use index from sorted array for colors
            const allocationCell = row.querySelector('td.allocation');
            if (allocationCell && totalPortfolioValue > 0) {
                const rowValue = parseFloat(row.dataset.currentValue || "0");
                const allocationPercentage = (rowValue / totalPortfolioValue) * 100;
                allocationCell.textContent = allocationPercentage.toFixed(2) + '%';

                const ticker = row.dataset.ticker;
                chartData.labels.push(ticker);
                chartData.datasets[0].data.push(allocationPercentage);
                const baseColor = getBlueColorForSlice(index, rowsArray.length); // Use current index
                chartData.datasets[0].backgroundColor.push(hexToRgba(baseColor, 0.9));
                }
        });

        updatePieChart(chartData);
        checkAndToggleVerticalScroll();

    } catch (error) {
        console.error('Error fetching or processing fund data:', error);
    }
}
