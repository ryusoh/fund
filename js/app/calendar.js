import * as d3 from 'https://esm.sh/d3@7';
import CalHeatmap from 'https://esm.sh/cal-heatmap@4.2.4';
import { initCurrencyToggle } from '../ui/currencyToggleManager.js';
import { CURRENCY_SYMBOLS } from '../config.js';

// Helper function to format large numbers into a compact form (e.g., 1.2m, 500k)
function formatNumber(num, withSign = false, currency = 'USD', rates = {}) {
    if (num === null || num === undefined || isNaN(num)) {
        return '';
    }

    const convertedNum = num * (rates[currency] || 1);
    const sign = convertedNum > 0 ? '+' : (convertedNum < 0 ? '-' : '');
    const absNum = Math.abs(convertedNum);
    let formattedNum;

    const symbol = CURRENCY_SYMBOLS[currency] || '$';

    if (withSign) {
        let val;
        let suffix = '';
        if (absNum >= 1e9) {
            val = absNum / 1e9;
            suffix = 'b';
        } else if (absNum >= 1e6) {
            val = absNum / 1e6;
            suffix = 'm';
        } else if (absNum >= 1e3) {
            val = absNum / 1e3;
            suffix = 'k';
        } else {
            val = absNum;
        }

        let formattedVal;
        if (val >= 100) {
            formattedVal = val.toFixed(0);
        } else if (val >= 10) {
            formattedVal = val.toFixed(1);
        } else if (val >= 1) {
            formattedVal = val.toFixed(2);
        } else {
            formattedVal = val.toPrecision(3);
        }

        formattedNum = symbol + formattedVal + suffix;
        return sign + formattedNum;
    } else {
        // The existing logic for total value
        let val;
        let suffix = '';
        if (currency === 'KRW' && absNum >= 1e6 && absNum < 1e9) {
            val = absNum / 1e6;
            suffix = 'm';
            let precision = 3 - Math.floor(Math.log10(val)) - 1;
            if (precision < 0) {
                precision = 0;
            }
            formattedNum = symbol + val.toFixed(precision) + suffix;
        } else {
            if (absNum >= 1e9) {
                val = absNum / 1e9;
                suffix = 'b';
            } else if (absNum >= 1e6) {
                val = absNum / 1e6;
                suffix = 'm';
            } else if (absNum >= 1e3) {
                val = absNum / 1e3;
                suffix = 'k';
            } else {
                val = absNum;
            }

            let precision = 0;
            if (val > 0) {
                precision = 4 - Math.floor(Math.log10(val)) - 1;
                if (precision < 0) {
                    precision = 0;
                }
                if (suffix === 'k' && precision > 2) {
                    precision = 2;
                }
            }
            formattedNum = symbol + val.toFixed(precision) + suffix;
        }
        return formattedNum;
    }
}

async function createCalendar() {
    initCurrencyToggle();

    try {
        const [rawData, fxData] = await Promise.all([
            d3.csv(`../data/historical_portfolio_values.csv?t=${new Date().getTime()}`),
            d3.json(`../data/fx_data.json?t=${new Date().getTime()}`)
        ]);

        if (!rawData || rawData.length === 0) {
            document.getElementById('calendar-container').innerHTML = '<p>No historical data available to display.</p>';
            return;
        }

        let rates = fxData.rates;
        let selectedCurrency = 'USD';

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

        const isDesktop = window.innerWidth > 768;
        const range = isDesktop ? 3 : 1;

        // Configure the calendar to show the month of the last data point by default.
        // This ensures the user sees data immediately on load.
        let calendarStartDate = new Date(lastDataDate.getFullYear(), lastDataDate.getMonth(), 1);
        if (isDesktop) {
            calendarStartDate.setMonth(calendarStartDate.getMonth() - (range - 1));
        }

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
            range: range, // Show one month at a time
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
                width: 45,
                height: 45,
                gutter: 6,
                label: () => '',
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

        // After painting, update the text labels in each subdomain
        const renderLabels = () => {
            d3.select('#cal-heatmap')
              .selectAll('text.ch-subdomain-text')
              .each(function() {
                  const el = d3.select(this);
                  el.attr('dominant-baseline', 'middle'); // Center the text block vertically
                  const parent = this.parentNode;
                  const datum = parent ? d3.select(parent).datum() : null;
                  if (!datum || !datum.t) {
                      el.html('');
                      return;
                  }
                  const dt = new Date(datum.t);
                  const dateStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
                  const entry = byDate.get(dateStr);
                  el.html('');

                  const dateText = dt.getUTCDate();
                  const x = el.attr('x') || 0;

                  el.append('tspan')
                    .attr('class', 'subdomain-line0')
                    .attr('dy', '-1.0em') // Adjust for vertical centering
                    .attr('x', x)
                    .text(dateText);

                  if (!entry || entry.dailyChange === 0) return;

                  const changeText = formatNumber(entry.dailyChange, true, selectedCurrency, rates);
                  const totalText = formatNumber(entry.total, false, selectedCurrency, rates);

                  el.append('tspan')
                    .attr('class', 'subdomain-line1')
                    .attr('dy', '1.2em') // Move down from the first line
                    .attr('x', x)
                    .text(changeText);
                  el.append('tspan')
                    .attr('class', 'subdomain-line2')
                    .attr('dy', '1.2em') // Move down from the second line
                    .attr('x', x)
                    .text(totalText);
              });
        };
        // Wrap the navigation methods to ensure renderLabels is called
        const originalPrevious = cal.previous;
        cal.previous = () => {
            return originalPrevious.call(cal).then(() => {
                renderLabels();
            });
        };

        const originalNext = cal.next;
        cal.next = () => {
            return originalNext.call(cal).then(() => {
                renderLabels();
            });
        };

        const originalJumpTo = cal.jumpTo;
        cal.jumpTo = (date) => {
            return originalJumpTo.call(cal, date).then(() => {
                renderLabels();
            });
        };

        document.addEventListener('currencyChangedGlobal', (event) => {
            selectedCurrency = event.detail.currency;
            renderLabels();
        });

        // Initial render
        renderLabels();

        // Align the currency toggle with the heatmap on mobile
        const alignToggle = () => {
            const isMobile = window.innerWidth <= 768;
            const toggleContainer = document.getElementById('currencyToggleContainer');
            const heatmapContainer = document.getElementById('cal-heatmap');

            if (!toggleContainer || !heatmapContainer) {
                return;
            }

            if (isMobile) {
                toggleContainer.style.position = 'fixed';
                toggleContainer.style.left = '0px';

                const heatmapRect = heatmapContainer.getBoundingClientRect();
                const heatmapCenterY = heatmapRect.top + heatmapRect.height / 2;
                
                const toggleHeight = toggleContainer.offsetHeight;
                const toggleTop = heatmapCenterY - (toggleHeight / 2);

                toggleContainer.style.top = `${toggleTop}px`;
            } else {
                toggleContainer.style.position = '';
                toggleContainer.style.top = '';
                toggleContainer.style.left = '';
            }
        };

        alignToggle();
        window.addEventListener('resize', alignToggle);
    } catch (error) {
        console.error('Error creating calendar:', error);
        document.getElementById('calendar-container').innerHTML = '<p>Could not load calendar data.</p>';
    }
}

createCalendar();
