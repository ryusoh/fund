
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
            responsive.alignToggleWithChartMobile();
            expect(toggleContainer.style.position).toBe(''); // Should not be set
        });

        it('should set position and top for mobile', () => {
            window.innerWidth = UI_BREAKPOINTS.MOBILE - 1;
            responsive.alignToggleWithChartMobile();
            expect(toggleContainer.style.position).toBe('fixed');
            expect(toggleContainer.style.left).toBe('0px');
            expect(toggleContainer.style.top).not.toBe('');
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
            responsive.setupResizeListener();
            const resizeCallback = window.addEventListener.mock.calls.find(call => call[0] === 'resize')[1];
            jest.spyOn(responsive, 'checkAndToggleVerticalScroll');
            jest.spyOn(responsive, 'alignToggleWithChartMobile');
            resizeCallback();
            expect(responsive.checkAndToggleVerticalScroll).not.toHaveBeenCalled();
            expect(responsive.alignToggleWithChartMobile).not.toHaveBeenCalled();
        });
    });

    describe('initCalendarResponsiveHandlers', () => {
        it('should return early if toggleContainer or heatmapContainer is null', () => {
            document.body.innerHTML = '';
            responsive.initCalendarResponsiveHandlers();
            expect(document.querySelector).toHaveBeenCalledWith(CALENDAR_SELECTORS.currencyToggle);
            expect(document.querySelector).toHaveBeenCalledWith(CALENDAR_SELECTORS.heatmap);
        });

        it('should set position and top for mobile', () => {
            window.innerWidth = UI_BREAKPOINTS.MOBILE - 1;
            responsive.initCalendarResponsiveHandlers();
            expect(toggleContainer.style.position).toBe('fixed');
            expect(toggleContainer.style.left).toBe('0px');
            expect(toggleContainer.style.top).not.toBe('');
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
    });
});
