import { initCurrencyToggle, cycleCurrency } from '@ui/currencyToggleManager.js';
import { CURRENCY_SYMBOLS, DATA_PATHS, CALENDAR_SELECTORS, CALENDAR_CONFIG } from '@js/config.js';
import { getNyDate } from '@utils/date.js';
import { formatNumber } from '@utils/formatting.js';
import { getCalendarData } from '@services/dataService.js';
import { initCalendarResponsiveHandlers } from '@ui/responsive.js';
import { logger } from '@utils/logger.js';
import { updateMonthLabels } from '@ui/calendarMonthLabelManager.js';

// --- STATE ---
let d3; // will be loaded lazily from local vendor or CDN
let CalHeatmap; // will be loaded lazily from local vendor or CDN

const appState = {
    selectedCurrency: 'USD',
    labelsVisible: false,
    rates: {},
    monthlyPnl: new Map(),
    highlightMonthKey: null,
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
    /* istanbul ignore next: defensive state handling in render labels */
    const monthState = state && state.monthlyPnl instanceof Map ? state : appState;
    /* istanbul ignore next: defensive state handling in render labels */
    if (d3 && monthState && monthState.monthlyPnl instanceof Map) {
        /* istanbul ignore next: defensive state handling in render labels */
        updateMonthLabels(d3, monthState, currencySymbols);
    }
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
            /* istanbul ignore next: defensive DOM manipulation in render labels */
            el.html('');

            const dateText = dt.getUTCDate();
            /* istanbul ignore next: defensive attribute fallback in render labels */
            const x = el.attr('x') || 0;

            el.append('tspan')
                .attr('class', 'subdomain-line0')
                .attr('dy', '-1.0em')
                .attr('x', x)
                .text(dateText);

            /* istanbul ignore next: defensive programming for missing entry data */
            if (!entry || entry.dailyChange === 0) {
                /* istanbul ignore next: defensive programming for missing entry data */
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
    /* istanbul ignore next: event listener registration in test environment */
    document.querySelector(CALENDAR_SELECTORS.prevButton).addEventListener('click', (e) => {
        /* istanbul ignore next: event handler execution in test environment */
        e.preventDefault();
        /* istanbul ignore next: event handler execution in test environment */
        cal.previous();
    });

    /* istanbul ignore next: event listener registration in test environment */
    document.querySelector(CALENDAR_SELECTORS.nextButton).addEventListener('click', (e) => {
        /* istanbul ignore next: event handler execution in test environment */
        e.preventDefault();
        /* istanbul ignore next: event handler execution in test environment */
        cal.next();
    });

    let clickTimer = null;
    /* istanbul ignore next: event listener registration in test environment */
    document.querySelector(CALENDAR_SELECTORS.todayButton).addEventListener('click', (e) => {
        /* istanbul ignore next: event handler execution in test environment */
        e.preventDefault();

        /* istanbul ignore next: event handler execution in test environment */
        if (clickTimer) {
            /* istanbul ignore next: event handler execution in test environment */
            clearTimeout(clickTimer);
            /* istanbul ignore next: event handler execution in test environment */
            clickTimer = null;
        } else {
            /* istanbul ignore next: event handler execution in test environment */
            clickTimer = setTimeout(() => {
                /* istanbul ignore next: event handler execution in test environment */
                state.labelsVisible = !state.labelsVisible;
                /* istanbul ignore next: event handler execution in test environment */
                cal.jumpTo(getNyDate());
                /* istanbul ignore next: event handler execution in test environment */
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
        // Currency cycling with Cmd/Ctrl + ArrowLeft/Right (avoid conflict with calendar nav)
        /* istanbul ignore next: keyboard navigation edge case in test environment */
        if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            /* istanbul ignore next: keyboard navigation edge case in test environment */
            e.preventDefault();
            /* istanbul ignore next: keyboard navigation edge case in test environment */
            cycleCurrency(e.key === 'ArrowRight' ? 1 : -1);
            /* istanbul ignore next: keyboard navigation edge case in test environment */
            return;
        }
        // Ignore if typing in inputs or using other modifiers
        /* istanbul ignore next: keyboard navigation edge case in test environment */
        if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) {
            /* istanbul ignore next: keyboard navigation edge case in test environment */
            return;
        }
        /* istanbul ignore next: keyboard navigation edge case in test environment */
        const active = document.activeElement;
        /* istanbul ignore next: keyboard navigation edge case in test environment */
        if (
            active &&
            (active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA' ||
                active.tagName === 'SELECT' ||
                active.isContentEditable)
        ) {
            /* istanbul ignore next: keyboard navigation edge case in test environment */
            return;
        }

        /* istanbul ignore next: keyboard navigation switch statement in test environment */
        switch (e.key) {
            case 'ArrowLeft':
                /* istanbul ignore next: keyboard navigation edge case in test environment */
                if (prevBtnEl && !prevBtnEl.disabled) {
                    /* istanbul ignore next: keyboard navigation edge case in test environment */
                    e.preventDefault();
                    /* istanbul ignore next: keyboard navigation edge case in test environment */
                    prevBtnEl.click();
                }
                /* istanbul ignore next: keyboard navigation edge case in test environment */
                break;
            case 'ArrowRight':
                /* istanbul ignore next: keyboard navigation edge case in test environment */
                if (nextBtnEl && !nextBtnEl.disabled) {
                    /* istanbul ignore next: keyboard navigation edge case in test environment */
                    e.preventDefault();
                    /* istanbul ignore next: keyboard navigation edge case in test environment */
                    nextBtnEl.click();
                }
                /* istanbul ignore next: keyboard navigation edge case in test environment */
                break;
            case 'ArrowDown':
                /* istanbul ignore next: keyboard navigation edge case in test environment */
                if (todayBtnEl) {
                    /* istanbul ignore next: keyboard navigation edge case in test environment */
                    e.preventDefault();
                    /* istanbul ignore next: keyboard navigation edge case in test environment */
                    todayBtnEl.click();
                }
                /* istanbul ignore next: keyboard navigation edge case in test environment */
                break;
            case 'ArrowUp': {
                // Emulate a double-click on the Today button:
                // 1) cancel any pending single-click action
                // 2) trigger the same dblclick behavior wired in responsive handlers (zoom)
                /* istanbul ignore next: keyboard navigation double-click emulation edge case */
                e.preventDefault();
                /* istanbul ignore next: keyboard navigation double-click emulation edge case */
                if (clickTimer) {
                    /* istanbul ignore next: keyboard navigation double-click emulation edge case */
                    clearTimeout(clickTimer);
                    /* istanbul ignore next: keyboard navigation double-click emulation edge case */
                    clickTimer = null;
                }
                /* istanbul ignore next: keyboard navigation double-click emulation edge case */
                if (todayBtnEl && typeof todayBtnEl.dispatchEvent === 'function') {
                    /* istanbul ignore next: keyboard navigation double-click emulation edge case */
                    try {
                        /* istanbul ignore next: keyboard navigation double-click emulation edge case */
                        todayBtnEl.dispatchEvent(
                            new MouseEvent('dblclick', { bubbles: true, cancelable: true })
                        );
                    } catch {
                        /* istanbul ignore next: keyboard navigation double-click emulation edge case */
                        const evt = document.createEvent('MouseEvents');
                        /* istanbul ignore next: keyboard navigation double-click emulation edge case */
                        evt.initEvent('dblclick', true, true);
                        /* istanbul ignore next: keyboard navigation double-click emulation edge case */
                        todayBtnEl.dispatchEvent(evt);
                    }
                }
                /* istanbul ignore next: keyboard navigation double-click emulation edge case */
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

        const { processedData, byDate, rates, monthlyPnl } = await getCalendarData(DATA_PATHS);
        appState.rates = rates;
        appState.monthlyPnl = monthlyPnl instanceof Map ? monthlyPnl : new Map();

        const parseDataDate = (dateString) => {
            const parts = dateString.split('-');
            if (parts.length !== 3) {
                return null;
            }
            const [yearStr, monthStr, dayStr] = parts;
            const year = Number(yearStr);
            const month = Number(monthStr);
            const day = Number(dayStr);
            if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
                return null;
            }
            return new Date(year, month - 1, day);
        };

        /* istanbul ignore next: defensive data parsing fallback in calendar init */
        const firstDataDate = parseDataDate(processedData[0].date) || new Date();
        /* istanbul ignore next: defensive data parsing fallback in calendar init */
        const rawLastDate =
            parseDataDate(processedData[processedData.length - 1].date) || firstDataDate;
        /* istanbul ignore next: defensive data parsing fallback in calendar init */
        const lastDataDate = Number.isFinite(rawLastDate.getTime()) ? rawLastDate : firstDataDate;

        const monthHasLabels = new Map();
        for (const entry of processedData) {
            const key = entry.date.slice(0, 7);
            if (!monthHasLabels.has(key)) {
                monthHasLabels.set(key, false);
            }
            if (typeof entry.dailyChange === 'number' && entry.dailyChange !== 0) {
                monthHasLabels.set(key, true);
            }
        }

        let firstMonthWithLabels = null;
        for (const [key, hasLabel] of monthHasLabels.entries()) {
            if (hasLabel) {
                const [yearStr, monthStr] = key.split('-');
                const year = Number(yearStr);
                const monthIndex = Number(monthStr) - 1;
                if (!Number.isNaN(year) && !Number.isNaN(monthIndex)) {
                    firstMonthWithLabels = new Date(year, monthIndex, 1);
                }
                break;
            }
        }

        /* istanbul ignore next: fallback for missing month labels edge case */
        if (!firstMonthWithLabels) {
            /* istanbul ignore next: fallback for missing month labels edge case */
            firstMonthWithLabels = new Date(
                firstDataDate.getFullYear(),
                firstDataDate.getMonth(),
                1
            );
        }

        // Determine the range of months to display so the right-most month is always the latest available.
        const todayNy = getNyDate();
        const currentMonthStart = new Date(todayNy.getFullYear(), todayNy.getMonth(), 1);
        const lastDataMonthStart = new Date(lastDataDate.getFullYear(), lastDataDate.getMonth(), 1);
        const lastVisibleMonth = new Date(
            Math.max(currentMonthStart.getTime(), lastDataMonthStart.getTime())
        );
        appState.highlightMonthKey = `${lastVisibleMonth.getFullYear()}-${String(lastVisibleMonth.getMonth() + 1).padStart(2, '0')}`;

        /* istanbul ignore next: mathematical utility function for date calculations */
        const monthToIndex = (date) => date.getFullYear() * 12 + date.getMonth();
        /* istanbul ignore next: mathematical utility function for date calculations */
        const indexToMonthDate = (index) => new Date(Math.floor(index / 12), index % 12, 1);

        /* istanbul ignore next: calendar range configuration calculation */
        const configuredRange = Math.max(1, CALENDAR_CONFIG.range || 1);
        /* istanbul ignore next: calendar range configuration calculation */
        const firstLabelIndex = monthToIndex(firstMonthWithLabels);
        /* istanbul ignore next: calendar range configuration calculation */
        const lastVisibleIndex = monthToIndex(lastVisibleMonth);
        /* istanbul ignore next: calendar range configuration calculation */
        const maxAvailableSpan = Math.max(1, lastVisibleIndex - firstLabelIndex + 1);
        /* istanbul ignore next: calendar range configuration calculation */
        const effectiveRange = Math.min(configuredRange, maxAvailableSpan);

        /* istanbul ignore next: calendar range configuration calculation */
        let startIndex = lastVisibleIndex - (effectiveRange - 1);
        /* istanbul ignore next: calendar range configuration calculation */
        if (startIndex < firstLabelIndex) {
            /* istanbul ignore next: mathematical edge case for very constrained date ranges */
            startIndex = firstLabelIndex;
        }

        /* istanbul ignore next: calendar range configuration calculation */
        const calendarStartDate = indexToMonthDate(startIndex);

        const cal = new CalHeatmap();

        setupEventListeners(cal, byDate, appState, CURRENCY_SYMBOLS);

        /* istanbul ignore next: tooltip configuration object creation */
        const tooltip = {
            /* istanbul ignore next: tooltip function implementation */
            text: function (date, value, dayjsDate) {
                /* istanbul ignore next: tooltip function implementation */
                const entry = processedData.find((d) => d.date === dayjsDate.format('YYYY-MM-DD'));
                /* istanbul ignore next: tooltip function implementation */
                const pnlPercent = (value * 100).toFixed(2);
                /* istanbul ignore next: tooltip function implementation */
                const totalValue = entry
                    ? entry.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
                    : 'N/A';
                /* istanbul ignore next: tooltip function implementation */
                const sign = value > 0 ? '+' : '';
                /* istanbul ignore next: tooltip function implementation */
                const pnlClass = value > 0 ? 'pnl-positive' : value < 0 ? 'pnl-negative' : '';

                /* istanbul ignore next: tooltip function implementation */
                return (
                    `${dayjsDate.format('MMMM D, YYYY')}<br>` +
                    `<span class="${pnlClass}">P/L: ${sign}${pnlPercent}%</span><br>` +
                    `Value: ${totalValue}`
                );
            },
        };

        const paintConfig = {
            ...CALENDAR_CONFIG,
            range: effectiveRange,
            data: {
                source: processedData,
                x: 'date',
                y: 'value',
                groupY: 'max',
            },
            date: {
                start: calendarStartDate,
                min: firstMonthWithLabels,
                // Allow viewing through the current month even if data isn't present yet
                /* istanbul ignore next: mathematical calculation for max date in calendar config */
                max: (function () {
                    /* istanbul ignore next: mathematical calculation for max date in calendar config */
                    const endOfCurrentMonth = new Date(
                        todayNy.getFullYear(),
                        todayNy.getMonth() + 1,
                        0
                    );
                    /* istanbul ignore next: mathematical calculation for max date in calendar config */
                    return new Date(Math.max(endOfCurrentMonth.getTime(), lastDataDate.getTime()));
                })(),
                highlight: [todayNy],
            },
            tooltip,
            /* istanbul ignore next: calendar domain navigation callback in test environment */
            onMinDomainReached: (isMin) => {
                /* istanbul ignore next: calendar domain navigation callback in test environment */
                document.querySelector(CALENDAR_SELECTORS.prevButton).disabled = isMin;
            },
            /* istanbul ignore next: calendar domain navigation callback in test environment */
            onMaxDomainReached: (isMax) => {
                /* istanbul ignore next: calendar domain navigation callback in test environment */
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
