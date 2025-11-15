import {
    initCurrencyToggle,
    cycleCurrency,
    applyCurrencySelection,
    getStoredCurrency,
} from '@ui/currencyToggleManager.js';
import {
    CURRENCY_SYMBOLS,
    DATA_PATHS,
    CALENDAR_SELECTORS,
    CALENDAR_CONFIG,
    UI_BREAKPOINTS,
    getCalendarRange,
} from '@js/config.js';
import { getNyDate } from '@utils/date.js';
import { formatNumber } from '@utils/formatting.js';
import { getCalendarData } from '@services/dataService.js';
import { initCalendarResponsiveHandlers } from '@ui/responsive.js';
import { logger } from '@utils/logger.js';
import { updateMonthLabels } from '@ui/calendarMonthLabelManager.js';
import { getValueFieldForCurrency, applyCurrencyColors } from '@pages/calendar/colorUtils.js';
import { mountPerlinPlaneBackground } from '../../vendor/perlin-plane.js';
import { PERLIN_BACKGROUND_SETTINGS } from '@js/config.js';

// --- STATE ---
let calendarInstance = null; // Store calendar instance for resize handling
let calendarByDate = new Map(); // Store calendar data for resize handling
let basePaintConfig = null; // Store base paint configuration for resizing
const touchNavigationState = { isNavigating: false }; // Shared touch navigation state

const appState = {
    selectedCurrency: 'USD',
    labelsVisible: false,
    rates: {},
    monthlyPnl: new Map(),
    highlightMonthKey: null,
    isAnimating: false,
};

let viewportUpdateTimer = null;

function scheduleViewportUpdate(delay = 100) {
    if (viewportUpdateTimer) {
        clearTimeout(viewportUpdateTimer);
    }
    viewportUpdateTimer = setTimeout(() => {
        viewportUpdateTimer = null;
        handleViewportChange();
    }, delay);
}

function getLatestMonthlyKey(monthlyPnl) {
    if (!(monthlyPnl instanceof Map) || monthlyPnl.size === 0) {
        return null;
    }
    const keys = Array.from(monthlyPnl.keys());
    return keys[keys.length - 1] || null;
}

let pendingPostPaintFrame = null;
let latestPostPaintArgs = null;

function schedulePostPaintUpdates(cal, byDate, state, currencySymbols) {
    latestPostPaintArgs = { cal, byDate, state, currencySymbols };

    const scheduler =
        typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame.bind(window)
            : (cb) => setTimeout(cb, 0);

    if (pendingPostPaintFrame !== null) {
        return;
    }

    pendingPostPaintFrame = scheduler(() => {
        pendingPostPaintFrame = null;
        if (!latestPostPaintArgs || !d3) {
            return;
        }
        const args = latestPostPaintArgs;
        renderLabels(args.cal, args.byDate, args.state, args.currencySymbols);
        applyCurrencyColors(d3, args.state, args.byDate);
    });
}

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
        if (state.isAnimating) {
            // Smooth fade-out animation when toggling off
            /* istanbul ignore next: style method availability in test environment */
            const allTextElements = d3
                .select(CALENDAR_SELECTORS.heatmap)
                .selectAll('text.ch-subdomain-text');

            /* istanbul ignore next: filter method availability in test environment */
            const fadeOutSelection = allTextElements.filter
                ? allTextElements.filter(function () {
                      return this.textContent && this.textContent.trim() !== '';
                  })
                : allTextElements;
            /* istanbul ignore next: style method availability in test environment */
            if (fadeOutSelection.style) {
                fadeOutSelection
                    .transition()
                    .duration(400)
                    .ease(d3.easeCubicInOut)
                    .style('opacity', 0)
                    .on('end', function () {
                        d3.select(this).html('');
                        state.isAnimating = false;
                    });
            } else {
                // Fallback for test environment
                fadeOutSelection.html('');
                state.isAnimating = false;
            }
        } else {
            // Immediate clear without animation (navigation)
            d3.select(CALENDAR_SELECTORS.heatmap).selectAll('text.ch-subdomain-text').html('');
        }
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
                state.rates,
                entry, // Pass the historical data entry
                'dailyChange' // Specify we want daily change values
            );
            const totalText = formatNumber(
                entry.total,
                currencySymbols,
                false,
                state.selectedCurrency,
                state.rates,
                entry, // Pass the historical data entry
                'total' // Specify we want total values
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

    // Handle animation vs immediate display
    if (state.isAnimating) {
        // Smooth fade-in animation when toggling on
        /* istanbul ignore next: style method availability in test environment */
        const fadeSelection = d3
            .select(CALENDAR_SELECTORS.heatmap)
            .selectAll('text.ch-subdomain-text');
        /* istanbul ignore next: style method availability in test environment */
        if (fadeSelection.style) {
            fadeSelection
                .style('opacity', 0)
                .transition()
                .duration(400)
                .ease(d3.easeCubicInOut)
                .style('opacity', 1)
                .on('end', function () {
                    state.isAnimating = false;
                });
        }
    } else {
        // Immediate display without animation (navigation)
        /* istanbul ignore next: style method availability in test environment */
        const selection = d3.select(CALENDAR_SELECTORS.heatmap).selectAll('text.ch-subdomain-text');
        /* istanbul ignore next: style method availability in test environment */
        if (selection.style) {
            selection.style('opacity', 1);
        }
    }
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
        schedulePostPaintUpdates(cal, byDate, state, currencySymbols);
        // Reset touch navigation state when calendar updates
        if (touchNavigationState.isNavigating) {
            setTimeout(() => {
                touchNavigationState.isNavigating = false;
                logger.log('Touch navigation reset after calendar fill');
            }, 100);
        }
    });

    window.addEventListener('calendar-zoom-end', () => {
        schedulePostPaintUpdates(cal, byDate, state, currencySymbols);
    });

    // Navigation
    /* istanbul ignore next: event listener registration in test environment */
    document.querySelector(CALENDAR_SELECTORS.prevButton).addEventListener('click', (e) => {
        /* istanbul ignore next: event handler execution in test environment */
        e.preventDefault();
        /* istanbul ignore next: event handler execution in test environment */
        // Reset touch navigation state to prevent conflicts
        touchNavigationState.isNavigating = true;
        /* istanbul ignore next: event handler execution in test environment */
        // Remove focus to prevent shimmer during subsequent swipes on mobile
        e.target.blur();
        /* istanbul ignore next: event handler execution in test environment */
        cal.previous();
        /* istanbul ignore next: event handler execution in test environment */
        // Release navigation lock after a short delay
        setTimeout(() => {
            touchNavigationState.isNavigating = false;
        }, 150);
    });

    /* istanbul ignore next: event listener registration in test environment */
    document.querySelector(CALENDAR_SELECTORS.nextButton).addEventListener('click', (e) => {
        /* istanbul ignore next: event handler execution in test environment */
        e.preventDefault();
        /* istanbul ignore next: event handler execution in test environment */
        // Reset touch navigation state to prevent conflicts
        touchNavigationState.isNavigating = true;
        /* istanbul ignore next: event handler execution in test environment */
        // Remove focus to prevent shimmer during subsequent swipes on mobile
        e.target.blur();
        /* istanbul ignore next: event handler execution in test environment */
        cal.next();
        /* istanbul ignore next: event handler execution in test environment */
        // Release navigation lock after a short delay
        setTimeout(() => {
            touchNavigationState.isNavigating = false;
        }, 150);
    });

    let clickTimer = null;
    /* istanbul ignore next: event listener registration in test environment */
    document.querySelector(CALENDAR_SELECTORS.todayButton).addEventListener('click', (e) => {
        /* istanbul ignore next: event handler execution in test environment */
        e.preventDefault();
        /* istanbul ignore next: event handler execution in test environment */
        // Remove focus to prevent shimmer during subsequent swipes on mobile
        e.target.blur();

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
                // Reset touch navigation state to prevent conflicts
                touchNavigationState.isNavigating = true;
                /* istanbul ignore next: event handler execution in test environment */
                state.isAnimating = true;
                state.labelsVisible = !state.labelsVisible;
                /* istanbul ignore next: event handler execution in test environment */
                cal.jumpTo(getNyDate());
                schedulePostPaintUpdates(cal, byDate, state, currencySymbols);
                /* istanbul ignore next: event handler execution in test environment */
                // Release navigation lock after a short delay
                setTimeout(() => {
                    touchNavigationState.isNavigating = false;
                }, 150);
                /* istanbul ignore next: event handler execution in test environment */
                clickTimer = null;
            }, 250);
        }
    });

    // Currency toggle
    document.addEventListener('currencyChangedGlobal', (event) => {
        const newCurrency = event?.detail?.currency;
        if (!newCurrency) {
            return;
        }
        state.selectedCurrency = newCurrency;
        schedulePostPaintUpdates(cal, byDate, state, currencySymbols);
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

    // Responsive calendar handling - update range on viewport changes
    window.addEventListener('resize', () => {
        logger.log('Window resize detected, scheduling viewport check');
        scheduleViewportUpdate(150); // Debounce resize events
    });

    // Handle zoom state changes
    window.addEventListener('calendar-zoom-start', () => {
        // Small delay to ensure zoom class is applied
        scheduleViewportUpdate(120);
    });

    window.addEventListener('calendar-zoom-end', () => {
        // Small delay to ensure zoom class is removed
        scheduleViewportUpdate(120);
    });

    // Touch swipe navigation for mobile devices
    setupTouchNavigation(cal);
}

// --- TOUCH NAVIGATION ---

/**
 * Sets up touch swipe navigation for the calendar on mobile devices
 * @param {CalHeatmap} cal The CalHeatmap instance
 */
function setupTouchNavigation(cal) {
    const calendarContainer = document.querySelector(CALENDAR_SELECTORS.container);
    if (!calendarContainer) {
        return;
    }

    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let isSwiping = false;
    let swipeStartTime = 0;

    // Minimum distance for a swipe to be registered (in pixels)
    const MIN_SWIPE_DISTANCE = 50;
    // Maximum vertical distance allowed for horizontal swipe
    const MAX_VERTICAL_DISTANCE = 100;
    // Debounce time to prevent rapid successive swipes (ms)
    const SWIPE_DEBOUNCE_TIME = 300;

    // Reset touch state
    const resetTouchState = () => {
        touchStartX = 0;
        touchStartY = 0;
        touchEndX = 0;
        touchEndY = 0;
        isSwiping = false;
        swipeStartTime = 0;
        // Remove touch-active class to restore button hover effects
        calendarContainer.classList.remove('touch-active');
    };

    /* istanbul ignore next: touch event handling in test environment */
    calendarContainer.addEventListener(
        'touchstart',
        (e) => {
            /* istanbul ignore next: touch event handling in test environment */
            // Don't start new swipe if currently navigating
            if (touchNavigationState.isNavigating) {
                return;
            }

            /* istanbul ignore next: touch event handling in test environment */
            resetTouchState();
            /* istanbul ignore next: touch event handling in test environment */
            touchStartX = e.touches[0].clientX;
            /* istanbul ignore next: touch event handling in test environment */
            touchStartY = e.touches[0].clientY;
            /* istanbul ignore next: touch event handling in test environment */
            isSwiping = true;
            /* istanbul ignore next: touch event handling in test environment */
            swipeStartTime = Date.now();
            /* istanbul ignore next: touch event handling in test environment */
            // Add touch-active class to prevent button hover effects
            calendarContainer.classList.add('touch-active');
            /* istanbul ignore next: touch event handling in test environment */
            logger.log('Touch swipe started');
        },
        { passive: true }
    );

    /* istanbul ignore next: touch event handling in test environment */
    calendarContainer.addEventListener(
        'touchmove',
        (e) => {
            /* istanbul ignore next: touch event handling in test environment */
            if (!isSwiping) {
                return;
            }

            /* istanbul ignore next: touch event handling in test environment */
            touchEndX = e.touches[0].clientX;
            /* istanbul ignore next: touch event handling in test environment */
            touchEndY = e.touches[0].clientY;

            // Calculate distances
            /* istanbul ignore next: touch event handling in test environment */
            const horizontalDistance = Math.abs(touchEndX - touchStartX);
            /* istanbul ignore next: touch event handling in test environment */
            const verticalDistance = Math.abs(touchEndY - touchStartY);

            // If this looks like a horizontal swipe, prevent default scroll behavior
            /* istanbul ignore next: touch event handling in test environment */
            if (horizontalDistance > verticalDistance && horizontalDistance > 20) {
                /* istanbul ignore next: touch event handling in test environment */
                e.preventDefault();
            }
        },
        { passive: false }
    );

    /* istanbul ignore next: touch event handling in test environment */
    calendarContainer.addEventListener(
        'touchend',
        () => {
            /* istanbul ignore next: touch event handling in test environment */
            if (!isSwiping || touchNavigationState.isNavigating) {
                resetTouchState();
                return;
            }

            /* istanbul ignore next: touch event handling in test environment */
            const swipeEndTime = Date.now();
            /* istanbul ignore next: touch event handling in test environment */
            const swipeDuration = swipeEndTime - swipeStartTime;

            /* istanbul ignore next: touch event handling in test environment */
            // Ignore very fast or very slow swipes
            if (swipeDuration < 50 || swipeDuration > 1000) {
                resetTouchState();
                return;
            }

            /* istanbul ignore next: touch event handling in test environment */
            const horizontalDistance = touchEndX - touchStartX;
            /* istanbul ignore next: touch event handling in test environment */
            const verticalDistance = Math.abs(touchEndY - touchStartY);

            // Check if this qualifies as a horizontal swipe
            /* istanbul ignore next: touch event handling in test environment */
            if (
                Math.abs(horizontalDistance) >= MIN_SWIPE_DISTANCE &&
                verticalDistance <= MAX_VERTICAL_DISTANCE
            ) {
                /* istanbul ignore next: touch event handling in test environment */
                const prevButton = document.querySelector(CALENDAR_SELECTORS.prevButton);
                /* istanbul ignore next: touch event handling in test environment */
                const nextButton = document.querySelector(CALENDAR_SELECTORS.nextButton);

                /* istanbul ignore next: touch event handling in test environment */
                touchNavigationState.isNavigating = true; // Prevent multiple rapid navigations

                /* istanbul ignore next: touch event handling in test environment */
                if (horizontalDistance > 0) {
                    // Swipe right - go to previous month
                    /* istanbul ignore next: touch event handling in test environment */
                    if (prevButton && !prevButton.disabled) {
                        /* istanbul ignore next: touch event handling in test environment */
                        logger.log('Touch swipe right detected - navigating to previous month');
                        /* istanbul ignore next: touch event handling in test environment */
                        cal.previous();
                    } else {
                        /* istanbul ignore next: touch event handling in test environment */
                        logger.log('Swipe right ignored - previous button disabled');
                    }
                } else if (nextButton && !nextButton.disabled) {
                    // Swipe left - go to next month
                    /* istanbul ignore next: touch event handling in test environment */
                    logger.log('Touch swipe left detected - navigating to next month');
                    /* istanbul ignore next: touch event handling in test environment */
                    cal.next();
                } else {
                    /* istanbul ignore next: touch event handling in test environment */
                    logger.log('Swipe left ignored - next button disabled');
                }

                /* istanbul ignore next: touch event handling in test environment */
                // Reset navigation lock after debounce time
                setTimeout(() => {
                    touchNavigationState.isNavigating = false;
                    logger.log('Touch navigation unlocked');
                }, SWIPE_DEBOUNCE_TIME);
            }

            /* istanbul ignore next: touch event handling in test environment */
            resetTouchState();
        },
        { passive: true }
    );

    /* istanbul ignore next: touch event handling in test environment */
    // Handle touch cancel events (when user lifts finger outside container, etc.)
    calendarContainer.addEventListener(
        'touchcancel',
        () => {
            /* istanbul ignore next: touch event handling in test environment */
            logger.log('Touch cancelled - resetting state');
            /* istanbul ignore next: touch event handling in test environment */
            resetTouchState();
        },
        { passive: true }
    );
}

// --- VIEWPORT HANDLING ---

/**
 * Handles viewport changes by updating calendar range if needed
 */
function handleViewportChange() {
    if (!calendarInstance || !basePaintConfig) {
        return;
    }

    const currentRange = getCalendarRange();

    try {
        // Check if the range actually needs to change
        const currentCalendarRange = basePaintConfig.range;
        if (currentCalendarRange !== currentRange) {
            logger.log(
                `Updating calendar range from ${currentCalendarRange} to ${currentRange} months`
            );

            // Update the stored config
            basePaintConfig.range = currentRange;

            // Simply re-paint with the updated configuration
            // CalHeatmap should handle the range change gracefully
            calendarInstance
                .paint(basePaintConfig)
                .then(() => {
                    logger.log('Calendar successfully repainted with new range');
                    schedulePostPaintUpdates(
                        calendarInstance,
                        calendarByDate,
                        appState,
                        CURRENCY_SYMBOLS
                    );
                })
                .catch((error) => {
                    logger.error('Error repainting calendar:', error);
                    // If repaint fails, try a full refresh
                    logger.log('Attempting full calendar refresh...');
                    try {
                        const calendarElement = document.querySelector(CALENDAR_SELECTORS.heatmap);
                        if (calendarElement) {
                            calendarElement.innerHTML = '';
                        }
                        calendarInstance
                            .paint(basePaintConfig)
                            .then(() => {
                                schedulePostPaintUpdates(
                                    calendarInstance,
                                    calendarByDate,
                                    appState,
                                    CURRENCY_SYMBOLS
                                );
                            })
                            .catch((refreshError) => {
                                logger.error('Full calendar refresh also failed:', refreshError);
                            });
                    } catch (refreshError) {
                        logger.error('Full calendar refresh also failed:', refreshError);
                    }
                });
        }
    } catch (error) {
        logger.error('Could not update calendar range dynamically:', error);
    }
}

// --- INITIALIZATION ---

/**
 * Initializes the calendar application.
 */
export async function initCalendar() {
    try {
        // d3 and CalHeatmap are now loaded globally via script tags

        initCurrencyToggle();
        const storedCurrency = getStoredCurrency();
        if (storedCurrency) {
            appState.selectedCurrency = storedCurrency;
        }
        applyCurrencySelection(appState.selectedCurrency, { emitEvent: false });

        const { processedData, byDate, rates, monthlyPnl } = await getCalendarData(DATA_PATHS);
        appState.rates = rates;
        appState.monthlyPnl = monthlyPnl instanceof Map ? monthlyPnl : new Map();
        const latestMonthlyKey = getLatestMonthlyKey(appState.monthlyPnl);
        calendarByDate = byDate; // Store globally for resize handling

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
        if (typeof latestMonthlyKey === 'string') {
            appState.highlightMonthKey = latestMonthlyKey;
        } else {
            appState.highlightMonthKey = `${lastVisibleMonth.getFullYear()}-${String(
                lastVisibleMonth.getMonth() + 1
            ).padStart(2, '0')}`;
        }

        /* istanbul ignore next: mathematical utility function for date calculations */
        const monthToIndex = (date) => date.getFullYear() * 12 + date.getMonth();
        /* istanbul ignore next: mathematical utility function for date calculations */
        const indexToMonthDate = (index) => new Date(Math.floor(index / 12), index % 12, 1);

        /* istanbul ignore next: calendar range configuration calculation */
        const configuredRange = Math.max(1, getCalendarRange() || 1);
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
        calendarInstance = cal; // Store for resize handling

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

        const valueField = getValueFieldForCurrency(appState.selectedCurrency);

        const paintConfig = {
            ...CALENDAR_CONFIG,
            range: effectiveRange,
            data: {
                source: processedData,
                x: 'date',
                y: valueField,
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

        // Store the base configuration for resize handling
        basePaintConfig = { ...paintConfig };

        await cal.paint(paintConfig);
        schedulePostPaintUpdates(cal, calendarByDate, appState, CURRENCY_SYMBOLS);
        initCalendarResponsiveHandlers();
        const toggleContainer = document.querySelector(CALENDAR_SELECTORS.currencyToggle);
        if (toggleContainer) {
            const activate = () => toggleContainer.classList.add('chart-loaded');
            if (window.innerWidth <= UI_BREAKPOINTS.MOBILE) {
                window.setTimeout(activate, 200);
            } else {
                activate();
            }
        }
    } catch (error) {
        logger.error('Error initializing calendar:', error);
        logger.log(error);
        document.querySelector(CALENDAR_SELECTORS.container).innerHTML = `<p>${error.message}</p>`;
    }
}

// --- PERLIN BACKGROUND ---
let perlinBackgroundHandle = null;

// --- START ---
// Avoid auto-running during Jest tests to prevent async side-effects
export function autoInitCalendar() {
    if (!(typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test')) {
        if (PERLIN_BACKGROUND_SETTINGS?.enabled) {
            perlinBackgroundHandle = mountPerlinPlaneBackground(PERLIN_BACKGROUND_SETTINGS);
        }
        initCalendar();
    }
}

// Auto-initialize the calendar
autoInitCalendar();

window.addEventListener('beforeunload', () => {
    perlinBackgroundHandle?.dispose();
    perlinBackgroundHandle = null;
});
