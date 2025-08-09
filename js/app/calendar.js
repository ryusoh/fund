import * as d3 from 'https://esm.sh/d3@7';
import CalHeatmap from 'https://esm.sh/cal-heatmap@4.2.4';

// Helper function to format large numbers into a compact form (e.g., 1.2m, 500k)
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) {
        return '';
    }
    const absNum = Math.abs(num);
    if (absNum >= 1e6) {
        return (num / 1e6).toFixed(2) + 'm';
    }
    if (absNum >= 1e3) {
        return (num / 1e3).toFixed(2) + 'k';
    }
    return num.toFixed(0);
}

async function createCalendar() {
    try {
        const rawData = await d3.csv(`../data/historical_portfolio_values.csv?t=${new Date().getTime()}`);

        if (!rawData || rawData.length === 0) {
            document.getElementById('calendar-container').innerHTML = '<p>No historical data available to display.</p>';
            return;
        }

        // Process data to calculate daily P&L
        const processedData = rawData.map((d, i) => {
            const currentDate = d.date;
            const currentValue = parseFloat(d.value_usd);
            let dailyChange = 0;
            let pnl = 0;

            if (i > 0) {
                const previousValue = parseFloat(rawData[i - 1].value_usd);
                dailyChange = currentValue - previousValue;
                pnl = previousValue === 0 ? 0 : (dailyChange / previousValue);
            }

            return { date: currentDate, value: pnl, total: currentValue, dailyChange: dailyChange };
        }).filter(d => d.date); // Filter out any invalid date entries

        const byDate = new Map(processedData.map(d => [d.date, d]));

        // The CSV is sorted, so the first and last rows have the earliest and latest dates.
        const firstDataDate = new Date(`${rawData[0].date}T00:00:00`);
        const lastDataDate = new Date(`${rawData[rawData.length - 1].date}T00:00:00`);

        // Configure the calendar to show the month of the last data point by default.
        // This ensures the user sees data immediately on load.
        const calendarStartDate = new Date(lastDataDate.getFullYear(), lastDataDate.getMonth(), 1);

        const cal = new CalHeatmap();

        await cal.paint({
            vertical: false, // Use a compact, "GitHub-style" vertical layout for the month.
            itemSelector: '#cal-heatmap',
            data: {
                source: processedData,
                x: 'date',
                y: 'value',
                groupY: 'max',
            },
            date: {
                start: calendarStartDate,
                min: firstDataDate, // Don't paint days before the first data point
                max: lastDataDate, // Don't paint days after the last data point
                highlight: [new Date()], // Highlight today's date
            },
            // Add callbacks to enable/disable navigation buttons
            onMinDomainReached: (isMin) => {
                document.getElementById('cal-prev').disabled = isMin;
            },
            onMaxDomainReached: (isMax) => {
                document.getElementById('cal-next').disabled = isMax;
            },
            range: 1, // Show one month at a time
            scale: {
                color: {
                    type: 'diverging',
                    // Use a custom Red-Gray-Green color range for P&L
                    range: ['rgba(244, 67, 54, 0.95)', 'rgba(84, 84, 88, 0.7)', 'rgba(76, 175, 80, 0.95)'],
                    domain: [-0.02, 0.02], // Color intensity peaks at +/- 2% change
                },
            },
            domain: {
                type: 'month',
                padding: [10, 10, 10, 10],
                label: { text: 'MMMM YYYY', textAlign: 'center', position: 'top' },
            },
            subDomain: {
                type: 'day',
                radius: 3,
                width: 40,
                height: 40,
                gutter: 6,
                label: (ts, value) => {
                    // Build UTC YYYY-MM-DD to match data
                    const dt = new Date(ts);
                    const dateStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
                    const entry = byDate.get(dateStr);
                    if (!entry || entry.dailyChange === 0) return '';

                    const sign = entry.dailyChange > 0 ? '+' : '';
                    const changeText = sign + formatNumber(entry.dailyChange);
                    return changeText; // single-line label managed by Cal-Heatmap
                },
                color: () => 'white',
            },
            tooltip: {
                text: function (date, value, dayjsDate) {
                    const entry = processedData.find(d => d.date === dayjsDate.format('YYYY-MM-DD'));
                    const pnlPercent = (value * 100).toFixed(2);
                    const totalValue = entry ? entry.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'N/A';
                    const sign = value > 0 ? '+' : '';
                    const pnlClass = value > 0 ? 'pnl-positive' : (value < 0 ? 'pnl-negative' : '');

                    return `${dayjsDate.format('MMMM D, YYYY')}<br>` +
                           `<span class="${pnlClass}">P/L: ${sign}${pnlPercent}%</span><br>` +
                           `Value: ${totalValue}`;
                },
            },
        });

        // Add event listeners for navigation buttons
        document.getElementById('cal-prev').addEventListener('click', (e) => {
            e.preventDefault();
            cal.previous();
        });
        document.getElementById('cal-today').addEventListener('click', (e) => {
            e.preventDefault();
            cal.jumpTo(new Date());
        });
        document.getElementById('cal-next').addEventListener('click', (e) => {
            e.preventDefault();
            cal.next();
        });

        // (renderLabels and its registration removed)
    } catch (error) {
        console.error('Error creating calendar:', error);
        document.getElementById('calendar-container').innerHTML = '<p>Could not load calendar data.</p>';
    }
}

createCalendar();