import { formatCurrency } from '../utils/formatting.js';
import { getBlueColorForSlice, hexToRgba } from '../utils/colors.js';
import { updatePieChart } from '../chart/chartManager.js';
import { checkAndToggleVerticalScroll } from '../ui/responsive.js';

export async function fetchAndUpdatePrices() {
    try {
        const response = await fetch('./fund_data.json?t=' + new Date().getTime()); 
        if (!response.ok) {
            console.error('Failed to fetch fund data:', response.status, response.statusText);
            return;
        }
        const prices = await response.json();

        let totalPortfolioValue = 0;
        let rowsArray = Array.from(document.querySelectorAll('tbody tr[data-ticker]'));
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

        rowsArray.forEach(row => {
            const ticker = row.dataset.ticker;
            const sharesCell = row.querySelector('td.shares'); 
            const costCell = row.querySelector('td.cost');
            const pnlCell = row.querySelector('td.pnl');
            const shares = parseFloat(sharesCell.textContent);

            if (sharesCell && !isNaN(shares)) {
                sharesCell.textContent = shares.toFixed(2);
            }

            if (prices[ticker] !== undefined && !isNaN(shares)) {
                const priceCell = row.querySelector('td.price');
                const valueCell = row.querySelector('td.value');
                const currentPrice = parseFloat(prices[ticker]);
                const cost = parseFloat(costCell.textContent.replace('$', ''));

                if (priceCell) priceCell.textContent = formatCurrency(currentPrice);

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
        });

        document.getElementById('total-portfolio-value-in-table').textContent = formatCurrency(totalPortfolioValue);

        rowsArray.sort((a, b) => {
            const valueA = parseFloat(a.dataset.currentValue || "0");
            const valueB = parseFloat(b.dataset.currentValue || "0");
            return valueB - valueA; 
        });

        tbody.innerHTML = ''; 
        rowsArray.forEach(row => tbody.appendChild(row));

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
