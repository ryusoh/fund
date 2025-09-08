import { initCurrencyToggle } from '@ui/currencyToggleManager.js';
import { CURRENCY_SYMBOLS, DATA_PATHS, CALENDAR_SELECTORS, CALENDAR_CONFIG } from '@js/config.js';
import { getNyDate } from '@utils/date.js';
import { formatNumber } from '@utils/formatting.js';
import { getCalendarData } from '@services/dataService.js';
import { initCalendarResponsiveHandlers } from '@ui/responsive.js';
import { logger } from '@utils/logger.js';

// --- STATE ---
let d3; // will be loaded lazily from local vendor or CDN
let CalHeatmap; // will be loaded lazily from local vendor or CDN

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

            if (!entry || entry.dailyChange === 0) {
                return;
            }

            const changeText = formatNumber(
                entry.dailyChange,
                currencySymbols,
                true,
                state.selectedCurrency,
                state.rates
            );
            const totalText = formatNumber(
                entry.total,
                currencySymbols,
                false,
                state.selectedCurrency,
                state.rates
            );

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

    // Keyboard navigation: Left/Right for prev/next, Down for today button behavior,
    // Up to emulate a fast second press (double-click) of the center button: cancel pending action
    const prevBtnEl = document.querySelector(CALENDAR_SELECTORS.prevButton);
    const nextBtnEl = document.querySelector(CALENDAR_SELECTORS.nextButton);
    const todayBtnEl = document.querySelector(CALENDAR_SELECTORS.todayButton);

    window.addEventListener('keydown', (e) => {
        // Ignore if typing in inputs or using modifiers
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
            return;
        }
        const active = document.activeElement;
        if (
            active &&
            (active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA' ||
                active.tagName === 'SELECT' ||
                active.isContentEditable)
        ) {
            return;
        }

        switch (e.key) {
            case 'ArrowLeft':
                if (prevBtnEl && !prevBtnEl.disabled) {
                    e.preventDefault();
                    // Delegate to existing click handler so behavior stays in sync
                    prevBtnEl.click();
                }
                break;
            case 'ArrowRight':
                if (nextBtnEl && !nextBtnEl.disabled) {
                    e.preventDefault();
                    nextBtnEl.click();
                }
                break;
            case 'ArrowDown':
                /* istanbul ignore next: presence check not critical */
                if (todayBtnEl) {
                    e.preventDefault();
                    todayBtnEl.click();
                }
                break;
            case 'ArrowUp': {
                // Emulate a double-click on the Today button:
                // 1) cancel any pending single-click action
                // 2) trigger the same dblclick behavior wired in responsive handlers (zoom)
                e.preventDefault();
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                /* istanbul ignore next: presence check */
                if (todayBtnEl && typeof todayBtnEl.dispatchEvent === 'function') {
                    try {
                        todayBtnEl.dispatchEvent(
                            new MouseEvent('dblclick', { bubbles: true, cancelable: true })
                        );
                    } catch {
                        // Fallback for environments without MouseEvent constructor
                        const evt = document.createEvent('MouseEvents');
                        evt.initEvent('dblclick', true, true);
                        todayBtnEl.dispatchEvent(evt);
                    }
                }
                break;
            }
            default:
                /* istanbul ignore next */
                break;
        }
    });
}

// --- INITIALIZATION ---

/**
 * Initializes the calendar application.
 */
export async function initCalendar() {
    try {
        // Lazy-load libraries (prefer local vendor, fallback to CDN)
        if (!d3) {
            try {
                d3 = await import('@vendor/d3.v7.mjs');
            } catch {
                d3 = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm');
            }
        }
        if (!CalHeatmap) {
            try {
                const mod = await import('@vendor/cal-heatmap-4.2.4.mjs');
                /* istanbul ignore next: alias resolves in tests; fallback tested separately */
                CalHeatmap = mod.default || mod;
            } catch {
                const mod = await import('https://cdn.jsdelivr.net/npm/cal-heatmap@4.2.4/+esm');
                /* istanbul ignore next: network path only in production */
                CalHeatmap = mod.default || mod;
            }
        }

        initCurrencyToggle();

        const { processedData, byDate, rates } = await getCalendarData(DATA_PATHS);
        appState.rates = rates;

        const firstDataDate = new Date(`${processedData[0].date}T00:00:00Z`);
        const lastDataDate = new Date(`${processedData[processedData.length - 1].date}T00:00:00Z`);

        // Start calendar so that the current month is visible by default
        const todayNy = getNyDate();
        const currentMonthStart = new Date(todayNy.getFullYear(), todayNy.getMonth(), 1);
        const calendarStartDate = new Date(currentMonthStart);
        if (window.innerWidth > 768) {
            // For multi-month view, show the months leading up to and including the current month
            calendarStartDate.setMonth(calendarStartDate.getMonth() - (CALENDAR_CONFIG.range - 1));
        }

        const cal = new CalHeatmap();

        setupEventListeners(cal, byDate, appState, CURRENCY_SYMBOLS);

        const tooltip = {
            text: function (date, value, dayjsDate) {
                const entry = processedData.find((d) => d.date === dayjsDate.format('YYYY-MM-DD'));
                const pnlPercent = (value * 100).toFixed(2);
                const totalValue = entry
                    ? entry.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
                    : 'N/A';
                const sign = value > 0 ? '+' : '';
                const pnlClass = value > 0 ? 'pnl-positive' : value < 0 ? 'pnl-negative' : '';

                return (
                    `${dayjsDate.format('MMMM D, YYYY')}<br>` +
                    `<span class="${pnlClass}">P/L: ${sign}${pnlPercent}%</span><br>` +
                    `Value: ${totalValue}`
                );
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
                // Allow viewing through the current month even if data isn't present yet
                max: (function () {
                    const endOfCurrentMonth = new Date(
                        todayNy.getFullYear(),
                        todayNy.getMonth() + 1,
                        0
                    );
                    return new Date(Math.max(endOfCurrentMonth.getTime(), lastDataDate.getTime()));
                })(),
                highlight: [todayNy],
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
        logger.error('Error initializing calendar:', error);
        logger.log(error);
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
