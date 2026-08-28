import * as responsive from '@ui/responsive.js';
import { UI_BREAKPOINTS, CALENDAR_SELECTORS } from '../../../js/config.js';

describe('Responsive Utilities', () => {
    let htmlElement;
    let bodyElement;
    let toggleContainer;
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
        it('should return early if toggleContainer is null', () => {
            document.body.innerHTML = '';
            const result = responsive.alignToggleWithChartMobile();
            expect(result).toBeUndefined(); // Function returns early
        });

        it('should clear inline positioning styles on toggleContainer', () => {
            toggleContainer.style.position = 'fixed';
            toggleContainer.style.top = '100px';
            toggleContainer.style.left = '100px';
            toggleContainer.style.right = '50px';
            toggleContainer.style.transform = 'translateY(-50%)';

            responsive.alignToggleWithChartMobile();

            expect(toggleContainer.style.position).toBe('');
            expect(toggleContainer.style.top).toBe('');
            expect(toggleContainer.style.left).toBe('');
            expect(toggleContainer.style.right).toBe('');
            expect(toggleContainer.style.transform).toBe('');
        });
    });

    describe('setupResizeListener', () => {
        it('should add a resize event listener to window', () => {
            responsive.setupResizeListener();
            expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
        });

        it('should execute resize callback on resize event', () => {
            window.addEventListener.mockClear();
            responsive.setupResizeListener();
            expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
            const resizeCallback = window.addEventListener.mock.calls[0][1];
            expect(typeof resizeCallback).toBe('function');
            resizeCallback();
        });
    });

    describe('initCalendarResponsiveHandlers', () => {
        it('should clear inline positioning styles on calendar currency toggle', () => {
            toggleContainer.style.position = 'fixed';
            toggleContainer.style.top = '100px';
            toggleContainer.style.left = '100px';
            toggleContainer.style.right = '50px';
            toggleContainer.style.transform = 'translateY(-50%)';

            responsive.initCalendarResponsiveHandlers();

            expect(toggleContainer.style.position).toBe('');
            expect(toggleContainer.style.top).toBe('');
            expect(toggleContainer.style.left).toBe('');
            expect(toggleContainer.style.right).toBe('');
            expect(toggleContainer.style.transform).toBe('');
        });

        it('should toggle zoomed class on dblclick of todayButton on desktop', () => {
            window.innerWidth = UI_BREAKPOINTS.MOBILE + 1; // desktop
            responsive.initCalendarResponsiveHandlers();
            const todayBtn = document.querySelector(CALENDAR_SELECTORS.todayButton);
            const wrapper = document.querySelector(CALENDAR_SELECTORS.pageWrapper);

            const dblclickEvent = new Event('dblclick');
            todayBtn.dispatchEvent(dblclickEvent);
            expect(wrapper.classList.contains('zoomed')).toBe(true);
            expect(document.body.classList.contains('calendar-zoomed')).toBe(true);

            todayBtn.dispatchEvent(dblclickEvent);
            expect(wrapper.classList.contains('zoomed')).toBe(false);
            expect(document.body.classList.contains('calendar-zoomed')).toBe(false);
        });

        it('should ignore zoom toggling on mobile viewports', () => {
            window.innerWidth = UI_BREAKPOINTS.MOBILE - 1;
            responsive.initCalendarResponsiveHandlers();
            const todayBtn = document.querySelector(CALENDAR_SELECTORS.todayButton);
            const wrapper = document.querySelector(CALENDAR_SELECTORS.pageWrapper);

            todayBtn.dispatchEvent(new Event('dblclick'));
            expect(wrapper.classList.contains('zoomed')).toBe(false);
            expect(document.body.classList.contains('calendar-zoomed')).toBe(false);
        });

        it('should dispatch calendar-zoom-end event on transition end', () => {
            window.innerWidth = UI_BREAKPOINTS.MOBILE + 1;
            responsive.initCalendarResponsiveHandlers();

            const dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');
            const todayBtn = document.querySelector(CALENDAR_SELECTORS.todayButton);
            const wrapper = document.querySelector(CALENDAR_SELECTORS.pageWrapper);

            todayBtn.dispatchEvent(new Event('dblclick'));
            wrapper.dispatchEvent(new Event('transitionend'));

            expect(dispatchEventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'calendar-zoom-end',
                })
            );
        });
    });
});
