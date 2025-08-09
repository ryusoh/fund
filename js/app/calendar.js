import * as d3 from 'https://esm.sh/d3@7';
import CalHeatmap from 'https://esm.sh/cal-heatmap@4.2.4';

async function createCalendar() {
    try {
        const rawData = await d3.csv('../data/historical_portfolio_values.csv');

        if (!rawData || rawData.length === 0) {
            document.getElementById('calendar-container').innerHTML = '<p>No historical data available to display.</p>';
            return;
        }

        // Process data to calculate daily P&L
        const processedData = rawData.map((d, i) => {
            const currentDate = d.date;
            const currentValue = parseFloat(d.value_usd);

            if (i === 0) {
                return { date: currentDate, value: 0, total: currentValue }; // No P&L for the first day
            }

            const previousValue = parseFloat(rawData[i - 1].value_usd);
            const pnl = previousValue === 0 ? 0 : ((currentValue - previousValue) / previousValue);

            return { date: currentDate, value: pnl, total: currentValue };
        }).filter(d => d.date); // Filter out any invalid date entries

        // The CSV is sorted, so the first and last rows have the earliest and latest dates.
        const firstDataDate = new Date(`${rawData[0].date}T00:00:00`);
        const lastDataDate = new Date(`${rawData[rawData.length - 1].date}T00:00:00`);

        // Configure the calendar to show the current month by default.
        const today = new Date();
        const calendarStartDate = new Date(today.getFullYear(), today.getMonth(), 1);

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
                    range: ['rgba(244, 67, 54, 0.95)', 'rgba(84, 84, 88, 0.7)', 'rgba(76, 175, 80, 0.95)'], // Use RGBA for 50% opacity
                    domain: [-0.02, 0.02], // Color intensity peaks at +/- 2% change
                },
            },
            domain: {
                type: 'month',
                padding: [10, 10, 10, 10],
                label: { text: 'MMMM YYYY', textAlign: 'center', position: 'top' },
            },
            subDomain: {
                type: 'day', // Days are grouped by week, running horizontally
                radius: 3,
                width: 40,   // Make boxes bigger
                height: 40,  // Make boxes bigger
                gutter: 6,   // Adjust gutter for bigger boxes
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
    } catch (error) {
        console.error('Error creating calendar:', error);
        document.getElementById('calendar-container').innerHTML = '<p>Could not load calendar data.</p>';
    }
}

createCalendar();