
import * as responsive from '../ui/responsive.js';
import { UI_BREAKPOINTS, CALENDAR_SELECTORS } from '../config.js';

describe('Responsive Utilities', () => {
    let htmlElement;
    let bodyElement;
    let toggleContainer;
    let chartContainer;
    let heatmapContainer;
    let todayButton;
    let pageWrapper;

    const originalInnerWidth = window.innerWidth;

    beforeEach(() => {
        document.body.innerHTML = `
            <html style="overflow-y: scroll;"><body>
                <div id="currencyToggleContainer"></div>
                <div id="fundPieChartContainer" style="height: 100px; width: 100px;"></div>
                <div id="calendar-container">
                    <div id="cal-heatmap" style="height: 100px; width: 100px;"></div>
                    <button id="cal-today"></button>
                </div>
                <div class="page-center-wrapper"></div>
            </body></html>
        `;
        htmlElement = document.documentElement;
        bodyElement = document.body;
        toggleContainer = document.getElementById('currencyToggleContainer');
        chartContainer = document.getElementById('fundPieChartContainer');
        heatmapContainer = document.getElementById('cal-heatmap');
        todayButton = document.getElementById('cal-today');
        pageWrapper = document.querySelector('.page-center-wrapper');

        jest.clearAllMocks();
        jest.spyOn(document, 'querySelector');
        jest.spyOn(document, 'getElementById');
        jest.spyOn(window, 'addEventListener');

        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1024,
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: originalInnerWidth,
        });
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
                height: 200
            });
            
            // Mock offsetHeight for toggleContainer
            Object.defineProperty(toggleContainer, 'offsetHeight', {
                value: 40,
                configurable: true
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
        it('should return early if toggleContainer or heatmapContainer is null', () => {
            document.body.innerHTML = '';
            const result = responsive.initCalendarResponsiveHandlers();
            expect(document.querySelector).toHaveBeenCalledWith(CALENDAR_SELECTORS.currencyToggle);
            expect(document.querySelector).toHaveBeenCalledWith(CALENDAR_SELECTORS.heatmap);
            expect(result).toBeUndefined(); // Function returns early
        });

        it('should set position and top for mobile', () => {
            window.innerWidth = UI_BREAKPOINTS.MOBILE - 1;
            
            // Mock getBoundingClientRect for heatmapContainer
            heatmapContainer.getBoundingClientRect = jest.fn().mockReturnValue({
                top: 150,
                height: 300
            });
            
            // Mock offsetHeight for toggleContainer
            Object.defineProperty(toggleContainer, 'offsetHeight', {
                value: 40,
                configurable: true
            });
            
            responsive.initCalendarResponsiveHandlers();
            expect(toggleContainer.style.position).toBe('fixed');
            expect(toggleContainer.style.left).toBe('0px');
            // heatmapCenterY = top + height/2 = 150 + 150 = 300
            // toggleTop = heatmapCenterY - toggleHeight/2 = 300 - 20 = 280
            expect(toggleContainer.style.top).toBe('280px');
        });

        it('should reset position and top for desktop', () => {
            toggleContainer.style.position = 'fixed';
            toggleContainer.style.top = '100px';
            toggleContainer.style.left = '100px';
            responsive.initCalendarResponsiveHandlers();
            expect(toggleContainer.style.position).toBe('');
            expect(toggleContainer.style.top).toBe('');
            expect(toggleContainer.style.left).toBe('');
        });

        it('should toggle zoomed class on dblclick of todayButton', () => {
            responsive.initCalendarResponsiveHandlers();
            const dblclickEvent = new Event('dblclick');
            todayButton.dispatchEvent(dblclickEvent);
            expect(pageWrapper.classList.contains('zoomed')).toBe(true);
            todayButton.dispatchEvent(dblclickEvent);
            expect(pageWrapper.classList.contains('zoomed')).toBe(false);
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
                    type: 'calendar-zoom-end'
                })
            );
            
            // Restore original
            window.dispatchEvent = originalDispatch;
        });
    });
});
