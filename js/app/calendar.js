import * as d3 from 'https://esm.sh/d3@7';
import CalHeatmap from 'https://esm.sh/cal-heatmap@4.2.4';
import { initCurrencyToggle } from '../ui/currencyToggleManager.js';
import {
    CURRENCY_SYMBOLS,
    DATA_PATHS,
    CALENDAR_SELECTORS,
    CALENDAR_CONFIG,
} from '../config.js';
import { getNyDate } from '../utils/date.js';
import { formatNumber } from '../utils/formatting.js';
import { getCalendarData } from './dataService.js';
import { initCalendarResponsiveHandlers } from '../ui/responsive.js';

// --- STATE ---

const appState = {
    selectedCurrency: 'USD',
    labelsVisible: false,
    rates: {},
};

// --- CALENDAR RENDERING ---

/**
 * Renders the labels on the calendar cells.
 * @param {CalHeatmap} cal The CalHeatmap instance.
 * @param {Map<string, object>} byDate A map of data by date string.
 * @param {object} state The application state.
 * @param {object} currencySymbols The currency symbols object.
 */
export function renderLabels(cal, byDate, state, currencySymbols) {
    if (!state.labelsVisible) {
        d3.select(CALENDAR_SELECTORS.heatmap).selectAll('text.ch-subdomain-text').html('');
        return;
    }

    d3.select(CALENDAR_SELECTORS.heatmap)
        .selectAll('text.ch-subdomain-text')
        .each(function () {
            const el = d3.select(this);
            el.attr('dominant-baseline', 'middle');
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
                .attr('dy', '-1.0em')
                .attr('x', x)
                .text(dateText);

            if (!entry || entry.dailyChange === 0) return;

            const changeText = formatNumber(entry.dailyChange, currencySymbols, true, state.selectedCurrency, state.rates);
            const totalText = formatNumber(entry.total, currencySymbols, false, state.selectedCurrency, state.rates);

            el.append('tspan')
                .attr('class', 'subdomain-line1')
                .attr('dy', '1.2em')
                .attr('x', x)
                .text(changeText);
            el.append('tspan')
                .attr('class', 'subdomain-line2')
                .attr('dy', '1.2em')
                .attr('x', x)
                .text(totalText);
        });
}

// --- EVENT HANDLING ---

/**
 * Sets up event listeners for the calendar and other UI elements.
 * @param {CalHeatmap} cal The CalHeatmap instance.
 * @param {Map<string, object>} byDate A map of data by date string.
 * @param {object} state The application state.
 * @param {object} currencySymbols The currency symbols object.
 */
function setupEventListeners(cal, byDate, state, currencySymbols) {
    cal.on('fill', () => {
        renderLabels(cal, byDate, state, currencySymbols);
    });

    window.addEventListener('calendar-zoom-end', () => {
        renderLabels(cal, byDate, state, currencySymbols);
    });

    // Navigation
    document.querySelector(CALENDAR_SELECTORS.prevButton).addEventListener('click', (e) => {
        e.preventDefault();
        cal.previous();
    });

    document.querySelector(CALENDAR_SELECTORS.nextButton).addEventListener('click', (e) => {
        e.preventDefault();
        cal.next();
    });

    let clickTimer = null;
    document.querySelector(CALENDAR_SELECTORS.todayButton).addEventListener('click', (e) => {
        e.preventDefault();

        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        } else {
            clickTimer = setTimeout(() => {
                state.labelsVisible = !state.labelsVisible;
                cal.jumpTo(getNyDate());
                clickTimer = null;
            }, 250);
        }
    });

    // Currency toggle
    document.addEventListener('currencyChangedGlobal', (event) => {
        state.selectedCurrency = event.detail.currency;
        renderLabels(cal, byDate, state, currencySymbols);
    });
}


// --- INITIALIZATION ---

/**
 * Initializes the calendar application.
 */
export async function initCalendar() {
    try {
        initCurrencyToggle();

        const { processedData, byDate, rates } = await getCalendarData(DATA_PATHS);
        appState.rates = rates;

        const firstDataDate = new Date(`${processedData[0].date}T00:00:00Z`);
        const lastDataDate = new Date(`${processedData[processedData.length - 1].date}T00:00:00Z`);

        let calendarStartDate = new Date(lastDataDate.getFullYear(), lastDataDate.getMonth(), 1);
        if (window.innerWidth > 768) {
            calendarStartDate.setMonth(calendarStartDate.getMonth() - (CALENDAR_CONFIG.range - 1));
        }

        const cal = new CalHeatmap();

        setupEventListeners(cal, byDate, appState, CURRENCY_SYMBOLS);

        const tooltip = {
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
        };

        const paintConfig = {
            ...CALENDAR_CONFIG,
            data: {
                source: processedData,
                x: 'date',
                y: 'value',
                groupY: 'max',
            },
            date: {
                start: calendarStartDate,
                min: firstDataDate,
                max: lastDataDate,
                highlight: [getNyDate()],
            },
            tooltip,
            onMinDomainReached: (isMin) => {
                document.querySelector(CALENDAR_SELECTORS.prevButton).disabled = isMin;
            },
            onMaxDomainReached: (isMax) => {
                document.querySelector(CALENDAR_SELECTORS.nextButton).disabled = isMax;
            },
        };

        await cal.paint(paintConfig);
        initCalendarResponsiveHandlers();

    } catch (error) {
        console.error('Error initializing calendar:', error);
        console.log(error);
        document.querySelector(CALENDAR_SELECTORS.container).innerHTML = `<p>${error.message}</p>`;
    }
}

// --- START ---
// Avoid auto-running during Jest tests to prevent async side-effects
export function autoInitCalendar() {
  if (!(typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test')) {
    initCalendar();
  }
}

// Auto-initialize the calendar
autoInitCalendar();