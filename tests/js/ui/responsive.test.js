import * as responsive from '@ui/responsive.js';
import { UI_BREAKPOINTS, CALENDAR_SELECTORS } from '@js/config.js';

describe('Responsive Utilities', () => {
    let htmlElement;
    let bodyElement;
    let toggleContainer;
    let chartContainer;
    let calendarContainer;
    let heatmapRoot;
    let heatmapSvg;
    let todayButton;
    let pageWrapper;
    let requestAnimationFrameSpy;

    const originalInnerWidth = window.innerWidth;

    beforeEach(() => {
        document.body.innerHTML = `
            <html style="overflow-y: scroll;"><body>
                <div id="calendar-mobile-overlay"></div>
                <div id="currencyToggleContainer"></div>
                <div id="fundPieChartContainer" style="height: 100px; width: 100px;"></div>
                <div id="calendar-container" style="height: 100px; width: 100px;">
                    <div id="cal-heatmap" style="height: 100%; width: 100%;">
                        <svg id="heatmap-svg"></svg>
                    </div>
                    <button id="cal-today"></button>
                </div>
                <div id="calendar-navigation-controls" style="height: 80px;"></div>
                <div class="page-center-wrapper"></div>
            </body></html>
        `;
        htmlElement = document.documentElement;
        bodyElement = document.body;
        toggleContainer = document.getElementById('currencyToggleContainer');
        chartContainer = document.getElementById('fundPieChartContainer');
        calendarContainer = document.getElementById('calendar-container');
        heatmapRoot = document.getElementById('cal-heatmap');
        heatmapSvg = document.getElementById('heatmap-svg');
        todayButton = document.getElementById('cal-today');
        pageWrapper = document.querySelector('.page-center-wrapper');

        jest.clearAllMocks();
        jest.spyOn(document, 'querySelector');
        jest.spyOn(document, 'getElementById');
        jest.spyOn(window, 'addEventListener');
        window.ResizeObserver = jest.fn().mockImplementation(() => ({
            observe: jest.fn(),
            disconnect: jest.fn(),
        }));
        requestAnimationFrameSpy = jest
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((cb) => {
                if (typeof cb === 'function') {
                    cb();
                }
                return 1;
            });

        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1024,
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        if (requestAnimationFrameSpy) {
            requestAnimationFrameSpy.mockRestore();
        }
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: originalInnerWidth,
        });
        delete window.ResizeObserver;
    });

    describe('checkAndToggleVerticalScroll', () => {
        it('should reset overflowY on html and body when not mobile', () => {
            responsive.checkAndToggleVerticalScroll();
            expect(htmlElement.style.overflowY).toBe('');
            expect(bodyElement.style.overflowY).toBe('');
        });

        it('should not change overflowY on html and body when mobile', () => {
            window.innerWidth = UI_BREAKPOINTS.MOBILE - 1;
            htmlElement.style.overflowY = 'hidden';
            bodyElement.style.overflowY = 'hidden';
            responsive.checkAndToggleVerticalScroll();
            expect(htmlElement.style.overflowY).toBe('hidden');
            expect(bodyElement.style.overflowY).toBe('hidden');
        });
    });

    describe('alignToggleWithChartMobile', () => {
        it('should return early if toggleContainer or chartContainer is null', () => {
            document.body.innerHTML = '';
            const result = responsive.alignToggleWithChartMobile();
            expect(result).toBeUndefined(); // Function returns early
        });

        it('should set position and top for mobile', () => {
            window.innerWidth = UI_BREAKPOINTS.MOBILE - 1;

            // Mock getBoundingClientRect for chartContainer
            chartContainer.getBoundingClientRect = jest.fn().mockReturnValue({
                top: 100,
                height: 200,
            });

            // Mock offsetHeight for toggleContainer
            Object.defineProperty(toggleContainer, 'offsetHeight', {
                value: 40,
                configurable: true,
            });

            responsive.alignToggleWithChartMobile();
            expect(toggleContainer.style.position).toBe('fixed');
            expect(toggleContainer.style.left).toBe('0px');
            // chartCenterY = top + height/2 = 100 + 100 = 200
            // toggleTop = chartCenterY - toggleHeight/2 = 200 - 20 = 180
            expect(toggleContainer.style.top).toBe('180px');
        });

        it('should reset position and top for desktop', () => {
            toggleContainer.style.position = 'fixed';
            toggleContainer.style.top = '100px';
            toggleContainer.style.left = '100px';
            responsive.alignToggleWithChartMobile();
            expect(toggleContainer.style.position).toBe('');
            expect(toggleContainer.style.top).toBe('');
            expect(toggleContainer.style.left).toBe('');
        });
    });

    describe('setupResizeListener', () => {
        it('should add a resize event listener to window', () => {
            responsive.setupResizeListener();
            expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
        });

        it('should call checkAndToggleVerticalScroll and alignToggleWithChartMobile on resize', () => {
            // Clear any existing window event listeners
            window.addEventListener.mockClear();

            responsive.setupResizeListener();

            // Verify the listener was added
            expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));

            // Find and trigger the resize callback
            const resizeCallback = window.addEventListener.mock.calls[0][1];

            // Spy on the functions after setting up the listener
            const checkSpy = jest.spyOn(responsive, 'checkAndToggleVerticalScroll');
            const alignSpy = jest.spyOn(responsive, 'alignToggleWithChartMobile');

            resizeCallback();

            expect(checkSpy).not.toHaveBeenCalled();
            expect(alignSpy).not.toHaveBeenCalled();

            checkSpy.mockRestore();
            alignSpy.mockRestore();
        });
    });

    describe('initCalendarResponsiveHandlers', () => {
        it('should return early if toggleContainer or calendarContainer is null', () => {
            document.body.innerHTML = '';
            const result = responsive.initCalendarResponsiveHandlers();
            expect(document.querySelector).toHaveBeenCalledWith(CALENDAR_SELECTORS.currencyToggle);
            expect(document.querySelector).toHaveBeenCalledWith(CALENDAR_SELECTORS.heatmap);
            expect(document.querySelector).toHaveBeenCalledWith(CALENDAR_SELECTORS.container);
            expect(document.querySelector).toHaveBeenCalledWith(CALENDAR_SELECTORS.navControls);
            expect(result).toBeUndefined(); // Function returns early
        });

        it('should set position and top for mobile', () => {
            window.innerWidth = UI_BREAKPOINTS.MOBILE - 1;

            const heatmapRect = {
                top: 150,
                height: 240,
                bottom: 390,
            };
            const calendarRect = {
                top: 100,
                height: 200,
                bottom: 300,
            };
            const navRect = {
                top: 400,
                height: 80,
                bottom: 480,
            };

            heatmapSvg.getBoundingClientRect = jest.fn().mockReturnValue(heatmapRect);
            calendarContainer.getBoundingClientRect = jest.fn().mockReturnValue(calendarRect);
            heatmapRoot.getBoundingClientRect = jest.fn().mockReturnValue(calendarRect);
            const navElement = document.getElementById('calendar-navigation-controls');
            if (navElement) {
                navElement.getBoundingClientRect = jest.fn().mockReturnValue(navRect);
            }

            // Mock offsetHeight for toggleContainer
            Object.defineProperty(toggleContainer, 'offsetHeight', {
                value: 40,
                configurable: true,
            });

            responsive.initCalendarResponsiveHandlers();
            expect(toggleContainer.style.position).toBe('');
            expect(toggleContainer.style.left).toBe('');
            // combined rect spans 150 to 480 -> center at 315
            expect(toggleContainer.style.top).toBe('315px');
            expect(toggleContainer.style.transform).toBe('');
            expect(heatmapSvg.getBoundingClientRect).toHaveBeenCalled();
            if (navElement) {
                expect(navElement.getBoundingClientRect).toHaveBeenCalled();
            }
        });

        it('should reset position and top for desktop', () => {
            toggleContainer.style.position = 'fixed';
            toggleContainer.style.top = '100px';
            toggleContainer.style.left = '100px';
            toggleContainer.style.transform = 'translateY(-50%)';
            responsive.initCalendarResponsiveHandlers();
            expect(toggleContainer.style.position).toBe('');
            expect(toggleContainer.style.top).toBe('');
            expect(toggleContainer.style.left).toBe('');
            expect(toggleContainer.style.transform).toBe('');
        });

        it('should toggle zoomed class on dblclick of todayButton', () => {
            responsive.initCalendarResponsiveHandlers();
            const dblclickEvent = new Event('dblclick');
            todayButton.dispatchEvent(dblclickEvent);
            expect(pageWrapper.classList.contains('zoomed')).toBe(true);
            expect(document.body.classList.contains('calendar-zoomed')).toBe(true);
            todayButton.dispatchEvent(dblclickEvent);
            expect(pageWrapper.classList.contains('zoomed')).toBe(false);
            expect(document.body.classList.contains('calendar-zoomed')).toBe(false);
        });

        it('should ignore zoom toggling on mobile viewports', () => {
            window.innerWidth = UI_BREAKPOINTS.MOBILE - 1;
            responsive.initCalendarResponsiveHandlers();
            const dblclickEvent = new Event('dblclick');
            todayButton.dispatchEvent(dblclickEvent);
            expect(pageWrapper.classList.contains('zoomed')).toBe(false);
            expect(document.body.classList.contains('calendar-zoomed')).toBe(false);
        });

        it('keeps the mobile overlay element in place after zoom toggles', () => {
            responsive.initCalendarResponsiveHandlers();
            const overlay = document.getElementById('calendar-mobile-overlay');
            expect(overlay).not.toBeNull();

            const dblclickEvent = new Event('dblclick');
            todayButton.dispatchEvent(dblclickEvent); // enter zoom
            expect(document.body.contains(overlay)).toBe(true);

            todayButton.dispatchEvent(dblclickEvent); // exit zoom
            expect(document.body.contains(overlay)).toBe(true);
        });

        it('should dispatch calendar-zoom-end event on transition end', () => {
            responsive.initCalendarResponsiveHandlers();

            // Mock window.dispatchEvent to track calls
            const originalDispatch = window.dispatchEvent;
            window.dispatchEvent = jest.fn();

            // Trigger dblclick to add zoom class and set up transitionend listener
            const dblclickEvent = new Event('dblclick');
            todayButton.dispatchEvent(dblclickEvent);

            // Trigger transitionend event
            const transitionEvent = new Event('transitionend');
            pageWrapper.dispatchEvent(transitionEvent);

            // Check that calendar-zoom-end was dispatched
            expect(window.dispatchEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'calendar-zoom-end',
                })
            );

            // Restore original
            window.dispatchEvent = originalDispatch;
        });
    });
});
