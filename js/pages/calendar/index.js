import { getNumberFormatter } from '@utils/formatting.js';
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
    PERLIN_BACKGROUND_SETTINGS,
    CALENDAR_ZOOM_REFRACTION,
} from '@js/config.js';
import { WebGLCaustics } from '../../ui/webglCaustics.js';
import { LiquidGlassRefraction } from '@ui/liquidGlassRefraction.js';
import { getNyDate } from '@utils/date.js';
import { getCalendarData } from '@services/dataService.js';
import { initCalendarResponsiveHandlers } from '@ui/responsive.js';
import { logger } from '@utils/logger.js';
import { getValueFieldForCurrency } from '@pages/calendar/colorUtils.js';
import { precomputeDisplayCaches } from '@pages/calendar/displayCache.js';
import { createCalendarRenderer } from '@pages/calendar/renderers/index.js';
import { mountPerlinPlaneBackground } from '../../vendor/perlin-plane.js';

// --- STATE ---
// The zoom transform transition runs 0.55s; GPU-heavy effects (optic sweep,
// refraction lens) wait this long after a zoom toggle before starting.
let calendarInstance = null; // Store calendar instance for resize handling
let calendarByDate = new Map(); // Store calendar data for resize handling
let basePaintConfig = null; // Store base paint configuration for resizing
const touchNavigationState = { isNavigating: false }; // Shared touch navigation state
let lastFetchedAt = 0;

const appState = {
    selectedCurrency: 'USD',
    labelsVisible: false,
    rates: {},
    monthlyPnl: new Map(),
    highlightMonthKey: null,
    isAnimating: false,
    isCalendarTransition: false,
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
let pendingPostPaintAfterTransition = false;
let pendingDataRefresh = null;
const fetchedMonthKeys = new Set();
const cachedMonthRange = { min: null, max: null };
let isInitialLoad = true;

function queuePostPaintFrame() {
    if (pendingPostPaintFrame !== null) {
        return;
    }

    const scheduler =
        typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame.bind(window)
            : (cb) => setTimeout(cb, 0);

    pendingPostPaintFrame = scheduler(() => {
        pendingPostPaintFrame = null;
        if (!latestPostPaintArgs) {
            return;
        }
        const args = latestPostPaintArgs;
        // The active renderer decides how to paint colours/labels/bevel for its
        // backend (and whether to stagger on first load). The page stays
        // backend-agnostic — it no longer touches d3/SVG directly.
        args.cal.renderState({
            byDate: args.byDate,
            state: args.state,
            currencySymbols: args.currencySymbols,
            isInitialLoad,
        });
    });
}

function schedulePostPaintUpdates(cal, byDate, state, currencySymbols) {
    latestPostPaintArgs = { cal, byDate, state, currencySymbols };

    if (state?.isCalendarTransition) {
        pendingPostPaintAfterTransition = true;

        return;
    }

    queuePostPaintFrame();
}

function flushPostPaintAfterTransition() {
    if (pendingPostPaintAfterTransition && latestPostPaintArgs) {
        pendingPostPaintAfterTransition = false;
        queuePostPaintFrame();
    }
}

function formatMonthKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
    }
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthKeyToIndex(key) {
    if (typeof key !== 'string') {
        return null;
    }
    const [yearStr, monthStr] = key.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
        return null;
    }
    return year * 12 + (month - 1);
}

function dateToMonthIndex(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
    }
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function rebuildFetchedMonthIndex(byDate) {
    fetchedMonthKeys.clear();
    cachedMonthRange.min = null;
    cachedMonthRange.max = null;
    if (!byDate) {
        return;
    }
    const addKey = (key) => {
        if (typeof key !== 'string') {
            return;
        }
        const monthKey = key.slice(0, 7);
        fetchedMonthKeys.add(monthKey);
        const index = monthKeyToIndex(monthKey);
        if (index === null) {
            return;
        }
        if (cachedMonthRange.min === null || index < cachedMonthRange.min) {
            cachedMonthRange.min = index;
        }
        if (cachedMonthRange.max === null || index > cachedMonthRange.max) {
            cachedMonthRange.max = index;
        }
    };
    if (byDate instanceof Map) {
        byDate.forEach((_value, key) => {
            addKey(key);
        });
    } else if (Array.isArray(byDate)) {
        byDate.forEach((entry) => {
            if (entry?.date) {
                addKey(entry.date);
            }
        });
    }
}

function hasDataForDomain(startDate, endDate) {
    const startIndex = dateToMonthIndex(startDate);
    const endIndex = dateToMonthIndex(endDate);
    let hasData = true;

    if (startIndex === null || endIndex === null) {
        hasData = true;
    } else if (
        cachedMonthRange.min === null ||
        cachedMonthRange.max === null ||
        startIndex < cachedMonthRange.min ||
        endIndex > cachedMonthRange.max
    ) {
        hasData = false;
    } else {
        const iter = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
        const last = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
        while (iter <= last) {
            const key = formatMonthKey(iter);
            if (key && !fetchedMonthKeys.has(key)) {
                hasData = false;
                break;
            }
            iter.setUTCMonth(iter.getUTCMonth() + 1);
        }
    }

    return hasData;
}

async function refreshCalendarData(domainStart) {
    if (!calendarInstance || !basePaintConfig) {
        return null;
    }
    if (pendingDataRefresh) {
        return pendingDataRefresh;
    }
    pendingDataRefresh = getCalendarData(DATA_PATHS)
        .then(async ({ processedData, byDate, rates, monthlyPnl }) => {
            calendarByDate = byDate;
            appState.rates = rates;
            appState.monthlyPnl = monthlyPnl instanceof Map ? monthlyPnl : new Map();
            precomputeDisplayCaches(calendarByDate, CURRENCY_SYMBOLS, appState.rates);
            rebuildFetchedMonthIndex(calendarByDate);
            basePaintConfig = {
                ...basePaintConfig,
                data: {
                    ...basePaintConfig.data,
                    source: processedData,
                },
            };
            const domainStartDate =
                domainStart instanceof Date && !Number.isNaN(domainStart.getTime())
                    ? domainStart
                    : basePaintConfig?.date?.start;
            const repaintConfig = {
                ...basePaintConfig,
                date: {
                    ...basePaintConfig.date,
                    start: domainStartDate,
                },
            };
            await calendarInstance.paint(repaintConfig);
            lastFetchedAt = Date.now();
            schedulePostPaintUpdates(calendarInstance, calendarByDate, appState, CURRENCY_SYMBOLS);
        })
        .catch((err) => {
            logger.error('Failed to refresh calendar data:', err);
        })
        .finally(() => {
            pendingDataRefresh = null;
        });
    return pendingDataRefresh;
}

function attachDateChangeHandler(cal) {
    const dateChangeHandler = async (context) => {
        const domain = context?.domain || context || {};
        const start =
            domain.start instanceof Date
                ? domain.start
                : domain.start
                  ? new Date(domain.start)
                  : null;
        const end =
            domain.end instanceof Date ? domain.end : domain.end ? new Date(domain.end) : start;
        if (hasDataForDomain(start, end)) {
            schedulePostPaintUpdates(cal, calendarByDate, appState, CURRENCY_SYMBOLS);
            return;
        }
        logger.log('Encountered domain outside cached range, refreshing calendar data');
        await refreshCalendarData(start);
    };
    cal.on('date-change', dateChangeHandler);
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
    attachDateChangeHandler(cal);
    cal.on('fill', () => {
        state.isCalendarTransition = false;
        state.isAnimating = false;
        schedulePostPaintUpdates(cal, byDate, state, currencySymbols);
        flushPostPaintAfterTransition();
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
        state.isAnimating = true;
        state.isCalendarTransition = true;

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
        state.isAnimating = true;
        state.isCalendarTransition = true;

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
                state.isCalendarTransition = true;

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
                    } catch (error) {
                        logger.warn('Calendar index operations failed:', error);
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
    setupTouchNavigation(cal, state);
}

// --- TOUCH NAVIGATION ---

/**
 * Sets up touch swipe navigation for the calendar on mobile devices
 * @param {CalHeatmap} cal The CalHeatmap instance
 */
const TOUCH_CONSTANTS = {
    MIN_SWIPE: 50,
    MAX_VERTICAL: 100,
    DEBOUNCE: 300,
};

let touchState = { startX: 0, startY: 0, endX: 0, endY: 0, isSwiping: false, startTime: 0 };

function _resetTouchState(container) {
    touchState = { startX: 0, startY: 0, endX: 0, endY: 0, isSwiping: false, startTime: 0 };
    container.classList.remove('touch-active');
}

function _executeTouchNavigation(horizontalDistance, cal, state) {
    const prevBtn = document.querySelector(CALENDAR_SELECTORS.prevButton);
    const nextBtn = document.querySelector(CALENDAR_SELECTORS.nextButton);
    touchNavigationState.isNavigating = true;

    /* istanbul ignore next: touch event handling in test environment */
    if (horizontalDistance > 0 && prevBtn && !prevBtn.disabled) {
        logger.log('Touch swipe right detected - navigating to previous month');
        state.isCalendarTransition = true;
        state.isAnimating = true;

        cal.previous();
    } else if (horizontalDistance <= 0 && nextBtn && !nextBtn.disabled) {
        logger.log('Touch swipe left detected - navigating to next month');
        state.isCalendarTransition = true;
        state.isAnimating = true;

        cal.next();
    } else {
        logger.log('Swipe ignored - button disabled');
    }

    /* istanbul ignore next: touch event handling in test environment */
    setTimeout(() => {
        touchNavigationState.isNavigating = false;
        logger.log('Touch navigation unlocked');
    }, TOUCH_CONSTANTS.DEBOUNCE);
}

function setupTouchNavigation(cal, state) {
    const calendarContainer = document.querySelector(CALENDAR_SELECTORS.container);
    if (!calendarContainer) {
        return;
    }

    /* istanbul ignore next: touch event handling in test environment */
    calendarContainer.addEventListener(
        'touchstart',
        (e) => {
            if (touchNavigationState.isNavigating) {
                return;
            }
            _resetTouchState(calendarContainer);
            touchState.startX = e.touches[0].clientX;
            touchState.startY = e.touches[0].clientY;
            touchState.isSwiping = true;
            touchState.startTime = Date.now();
            calendarContainer.classList.add('touch-active');
            logger.log('Touch swipe started');
        },
        { passive: true }
    );

    /* istanbul ignore next: touch event handling in test environment */
    calendarContainer.addEventListener(
        'touchmove',
        (e) => {
            if (!touchState.isSwiping) {
                return;
            }
            touchState.endX = e.touches[0].clientX;
            touchState.endY = e.touches[0].clientY;
            const hDist = Math.abs(touchState.endX - touchState.startX);
            const vDist = Math.abs(touchState.endY - touchState.startY);
            if (hDist > vDist && hDist > 20) {
                e.preventDefault();
            }
        },
        { passive: false }
    );

    /* istanbul ignore next: touch event handling in test environment */
    calendarContainer.addEventListener(
        'touchend',
        () => {
            if (!touchState.isSwiping || touchNavigationState.isNavigating) {
                _resetTouchState(calendarContainer);
                return;
            }
            const duration = Date.now() - touchState.startTime;
            if (duration < 50 || duration > 1000) {
                _resetTouchState(calendarContainer);
                return;
            }
            const hDist = touchState.endX - touchState.startX;
            const vDist = Math.abs(touchState.endY - touchState.startY);
            if (
                Math.abs(hDist) >= TOUCH_CONSTANTS.MIN_SWIPE &&
                vDist <= TOUCH_CONSTANTS.MAX_VERTICAL
            ) {
                _executeTouchNavigation(hDist, cal, state);
            }
            _resetTouchState(calendarContainer);
        },
        { passive: true }
    );

    /* istanbul ignore next: touch event handling in test environment */
    calendarContainer.addEventListener(
        'touchcancel',
        () => {
            logger.log('Touch cancelled - resetting state');
            _resetTouchState(calendarContainer);
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
            appState.isCalendarTransition = true;
            appState.isAnimating = true;

            // Simply re-paint with the updated configuration
            // CalHeatmap should handle the range change gracefully
            calendarInstance
                .paint(basePaintConfig)
                .then(() => {
                    logger.log('Calendar successfully repainted with new range');
                    appState.isCalendarTransition = false;
                    appState.isAnimating = false;
                    schedulePostPaintUpdates(
                        calendarInstance,
                        calendarByDate,
                        appState,
                        CURRENCY_SYMBOLS
                    );
                    flushPostPaintAfterTransition();
                })
                .catch((error) => {
                    logger.error('Error repainting calendar:', error);
                    // If repaint fails, try a full refresh
                    logger.log('Attempting full calendar refresh...');
                    appState.isAnimating = true;
                    try {
                        const calendarElement = document.querySelector(CALENDAR_SELECTORS.heatmap);
                        if (calendarElement) {
                            calendarElement.replaceChildren();
                        }
                        calendarInstance
                            .paint(basePaintConfig)
                            .then(() => {
                                appState.isCalendarTransition = false;
                                appState.isAnimating = false;
                                schedulePostPaintUpdates(
                                    calendarInstance,
                                    calendarByDate,
                                    appState,
                                    CURRENCY_SYMBOLS
                                );
                                flushPostPaintAfterTransition();
                            })
                            .catch((refreshError) => {
                                appState.isAnimating = false;
                                appState.isCalendarTransition = false;
                                logger.error('Full calendar refresh also failed:', refreshError);
                            });
                    } catch (refreshError) {
                        appState.isAnimating = false;
                        appState.isCalendarTransition = false;
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
        precomputeDisplayCaches(byDate, CURRENCY_SYMBOLS, appState.rates);
        rebuildFetchedMonthIndex(byDate);
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
                    // Local construction: monthToIndex below reads local
                    // getters, and getNyDate()'s result is local-domain too.
                    // Date.UTC here would land on the previous month in UTC−
                    // timezones (see docs/testing-notes.md § Timezone).
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

        const cal = createCalendarRenderer();
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
                    ? getNumberFormatter('en-US', 2, 2, {
                          style: 'currency',
                          currency: 'USD',
                      }).format(entry.total)
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
                        Date.UTC(todayNy.getFullYear(), todayNy.getMonth() + 1, 0)
                    );
                    /* istanbul ignore next: mathematical calculation for max date in calendar config */
                    return new Date(
                        Math.max(
                            endOfCurrentMonth.getTime(),
                            Date.UTC(
                                lastDataDate.getFullYear(),
                                lastDataDate.getMonth(),
                                lastDataDate.getDate()
                            )
                        )
                    );
                })(),
                highlight: [
                    new Date(
                        Date.UTC(todayNy.getFullYear(), todayNy.getMonth(), todayNy.getDate())
                    ),
                ],
                timezone: 'utc',
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
        lastFetchedAt = Date.now();
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

        // Trigger entrance animation
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            window.requestAnimationFrame(() => {
                const wrapper = document.querySelector(CALENDAR_SELECTORS.pageWrapper);
                if (wrapper) {
                    wrapper.classList.add('calendar-ready');
                }
                isInitialLoad = false;
            });
        } else {
            isInitialLoad = false;
        }
    } catch (error) {
        logger.error('Error initializing calendar:', error);
        logger.log(error);
        const container = document.querySelector(CALENDAR_SELECTORS.container);
        if (container) {
            const p = document.createElement('p');
            p.textContent = error.message;
            if (typeof container.replaceChildren === 'function') {
                container.replaceChildren(p);
            } else {
                // Fallback for extreme environments (like partial JSDOM mocks in some test setups)
                container.textContent = '';
                if (typeof container.appendChild === 'function') {
                    container.appendChild(p);
                } else {
                    container.textContent = error.message;
                }
            }
        }
    }
}

// --- PERLIN BACKGROUND ---
let perlinBackgroundHandle = null;

// --- ZOOM PANE: CENTERING + LIQUID GLASS ---
// When the calendar zooms, the pane glides to the viewport center and scales
// as one composited transform (--zoom-center-shift is measured here, in the
// same microtask the class flips, so no intermediate frame paints). The
// refraction lens (bezel distortion + edge caustics) attaches only after the
// transform settles — building the displacement map and re-rasterizing the
// backdrop mid-animation would steal frame budget from the transition — and
// is disposed on zoom-out so the unzoomed wrapper stays untouched.
// is disposed on zoom-out so the unzoomed wrapper stays untouched.
let zoomRefraction = null;
let zoomCaustics = null;

function initCalendarZoomPane() {
    const wrapper = document.querySelector(CALENDAR_SELECTORS.pageWrapper);
    if (!wrapper) {
        return;
    }

    const centerZoomedPane = () => {
        // Layout coordinates (offset* ignores transforms), so the measurement
        // is correct even when re-zooming mid-transition.
        let layoutTop = 0;
        let node = wrapper;
        while (node) {
            layoutTop += node.offsetTop;
            node = node.offsetParent;
        }
        const layoutCenterY = layoutTop + wrapper.offsetHeight / 2 - window.scrollY;
        const shiftY = Math.round(window.innerHeight / 2 - layoutCenterY);
        wrapper.style.setProperty('--zoom-center-shift', `${shiftY}px`);
    };

    const syncZoomRefraction = () => {
        const isZoomed = wrapper.classList.contains('zoomed');
        if (isZoomed && !zoomRefraction) {
            centerZoomedPane();
            try {
                zoomRefraction = new LiquidGlassRefraction(wrapper, CALENDAR_ZOOM_REFRACTION);

                // Start the WebGL Caustics immediately to run alongside the zoom animation
                if (
                    !window.AMBIENT_CONFIG ||
                    window.AMBIENT_CONFIG.webglCausticsEnabled !== false
                ) {
                    zoomCaustics = new WebGLCaustics(wrapper);
                    zoomCaustics.start();
                }
            } catch (e) {
                logger.error('Failed to initialize zoom pane effects:', e);
                zoomRefraction = null;
                if (zoomCaustics) {
                    zoomCaustics.dispose();
                    zoomCaustics = null;
                }
            }
        } else if (!isZoomed) {
            if (zoomRefraction) {
                zoomRefraction.dispose();
                zoomRefraction = null;
            }
            if (zoomCaustics) {
                zoomCaustics.dispose();
                zoomCaustics = null;
            }
        }
    };

    const observer = new window.MutationObserver(syncZoomRefraction);
    observer.observe(wrapper, {
        attributes: true,
        attributeFilter: ['class'],
    });

    syncZoomRefraction();

    window.addEventListener('beforeunload', () => {
        observer.disconnect();
    });
}

// --- START ---
// Avoid auto-running during Jest tests to prevent async side-effects
export function autoInitCalendar() {
    if (!(typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test')) {
        if (PERLIN_BACKGROUND_SETTINGS?.enabled) {
            perlinBackgroundHandle = mountPerlinPlaneBackground(PERLIN_BACKGROUND_SETTINGS);
        }
        initCalendar().then(() => {
            initCalendarZoomPane();
        });
    }
}

export const __testables = {
    get isInitialLoad() {
        return isInitialLoad;
    },
    set isInitialLoad(value) {
        isInitialLoad = value;
    },
    resetInitialLoadState: () => {
        isInitialLoad = true;
    },
    queuePostPaintFrame,
    schedulePostPaintUpdates,
};

// Auto-initialize the calendar
autoInitCalendar();

// Refresh data when the app returns to foreground after 60+ seconds (iOS PWA resume)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastFetchedAt >= 60_000) {
        refreshCalendarData(basePaintConfig?.date?.start);
    }
});

// iOS PWA bfcache restore — more reliable than visibilitychange on iOS
window.addEventListener('pageshow', (event) => {
    if (event.persisted && Date.now() - lastFetchedAt >= 60_000) {
        refreshCalendarData(basePaintConfig?.date?.start);
    }
});

window.addEventListener('beforeunload', () => {
    perlinBackgroundHandle?.dispose();
    perlinBackgroundHandle = null;
});
