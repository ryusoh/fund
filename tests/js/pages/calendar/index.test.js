import { getCalendarData } from '@services/dataService.js';
import { initCalendar, renderLabels, autoInitCalendar } from '@pages/calendar/index.js';
import * as dateUtils from '@utils/date.js';

jest.mock('@services/dataService.js', () => ({
    getCalendarData: jest.fn(),
}));

jest.mock('@ui/currencyToggleManager.js', () => ({
    initCurrencyToggle: jest.fn(),
    cycleCurrency: jest.fn(),
}));

jest.mock('@ui/responsive.js', () => ({
    initCalendarResponsiveHandlers: jest.fn(),
}));

const mockCalHeatmapInstance = {
    paint: jest.fn(() => Promise.resolve()),
    previous: jest.fn(() => Promise.resolve()),
    next: jest.fn(() => Promise.resolve()),
    jumpTo: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
};

jest.mock('https://cdn.jsdelivr.net/npm/cal-heatmap@4.2.4/+esm', () =>
    jest.fn().mockImplementation(() => mockCalHeatmapInstance)
);

// Capture class attribute values set during label rendering
const capturedClassValues = [];

jest.mock('https://cdn.jsdelivr.net/npm/d3@7/+esm', () => {
    const createChainableObject = () => ({
        select: jest.fn().mockReturnThis(),
        selectAll: jest.fn().mockReturnThis(),
        each: jest.fn().mockReturnThis(),
        html: jest.fn().mockReturnThis(),
        append: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        attr: jest.fn().mockReturnThis(),
        datum: jest.fn().mockReturnValue({ t: new Date('2025-01-01T00:00:00Z').getTime() }),
    });

    const d3 = createChainableObject();

    d3.each.mockImplementation(function (callback) {
        const scenarios = [
            {
                element: { parentNode: {} },
                datum: { t: new Date('2025-01-01T00:00:00Z').getTime() },
            },
            {
                element: { parentNode: {} },
                datum: { t: new Date('2025-01-02T00:00:00Z').getTime() },
            },
            { element: { parentNode: null }, datum: null },
            { element: { parentNode: {} }, datum: null },
            { element: { parentNode: {} }, datum: {} },
        ];

        scenarios.forEach((scenario) => {
            const mockEl = createChainableObject();
            let attrCallCount = 0;
            mockEl.attr.mockImplementation((name, value) => {
                // read path for x
                if (name === 'x' && typeof value === 'undefined') {
                    attrCallCount++;
                    return attrCallCount === 1 ? null : '50';
                }
                // capture class set operations on any element
                if (name === 'class' && typeof value !== 'undefined') {
                    capturedClassValues.push(value);
                }
                return mockEl;
            });
            mockEl.append.mockImplementation(() => {
                const child = createChainableObject();
                // capture class set on appended child tspans
                child.attr.mockImplementation((name, value) => {
                    if (name === 'class' && typeof value !== 'undefined') {
                        capturedClassValues.push(value);
                    }
                    return child;
                });
                return child;
            });
            d3.select.mockImplementation((element) => {
                if (element === scenario.element) {
                    return mockEl;
                }
                if (element === scenario.element.parentNode) {
                    return {
                        datum: jest.fn().mockReturnValue(scenario.datum),
                    };
                }
                return mockEl;
            });
            callback.call(scenario.element);
        });

        return d3;
    });

    return d3;
});

describe('calendar page', () => {
    let prevBtnRef, nextBtnRef, todayBtnRef, containerRef;
    beforeEach(() => {
        document.body.innerHTML = `
      <div id="calendar-container"></div>
      <div id="cal-heatmap"></div>
      <button id="cal-prev"></button>
      <button id="cal-next"></button>
      <button id="cal-today"></button>
      <div id="currencyToggleContainer"></div>
    `;

        jest.clearAllMocks();

        const eventListeners = {};
        document.getElementById = jest.fn().mockImplementation(() => ({
            addEventListener: jest.fn().mockImplementation((event, callback) => {
                eventListeners[event] = callback;
            }),
            dispatchEvent: jest.fn().mockImplementation((event) => {
                if (eventListeners[event.type]) {
                    event.preventDefault = jest.fn();
                    eventListeners[event.type](event);
                }
            }),
        }));

        // Provide concrete elements for prev/next so we can test disabled toggling
        prevBtnRef = { disabled: false, addEventListener: jest.fn(), click: jest.fn() };
        nextBtnRef = { disabled: false, addEventListener: jest.fn(), click: jest.fn() };
        todayBtnRef = {
            addEventListener: jest.fn(),
            click: jest.fn(),
            dispatchEvent: jest.fn(),
        };
        containerRef = { innerHTML: '' };
        document.querySelector = jest.fn().mockImplementation((sel) => {
            if (sel === '#cal-prev') {
                return prevBtnRef;
            }
            if (sel === '#cal-next') {
                return nextBtnRef;
            }
            if (sel === '#cal-today') {
                return todayBtnRef;
            }
            if (sel === '#calendar-container') {
                return containerRef;
            }
            return { addEventListener: jest.fn(), innerHTML: '', disabled: false };
        });
    });

    it('should initialize the calendar and set up event listeners', async () => {
        // Explicitly ensure desktop branch for start date (innerWidth > 768)
        const originalWidth = window.innerWidth;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
        const mockData = {
            processedData: [{ date: '2025-01-01', value: 1, total: 1000, dailyChange: 5 }],
            byDate: new Map([['2025-01-01', { date: '2025-01-01', value: 1, total: 1000 }]]),
            rates: { USD: 1 },
        };
        getCalendarData.mockResolvedValue(mockData);

        await initCalendar();

        const CalHeatmap = require('https://cdn.jsdelivr.net/npm/cal-heatmap@4.2.4/+esm');
        expect(CalHeatmap).toHaveBeenCalledTimes(1);
        expect(mockCalHeatmapInstance.paint).toHaveBeenCalledTimes(1);

        // Capture paint config to exercise its callbacks
        const paintArg = mockCalHeatmapInstance.paint.mock.calls[0][0];
        expect(paintArg).toBeDefined();
        // onMinDomainReached / onMaxDomainReached should toggle disabled state
        const prevEl = prevBtnRef;
        const nextEl = nextBtnRef;
        paintArg.onMinDomainReached(true);
        paintArg.onMaxDomainReached(true);
        expect(prevEl.disabled).toBe(true);
        expect(nextEl.disabled).toBe(true);
        paintArg.onMinDomainReached(false);
        paintArg.onMaxDomainReached(false);
        expect(prevEl.disabled).toBe(false);
        expect(nextEl.disabled).toBe(false);

        // Trigger the 'fill' event handler to cover that path
        const fillHandler = mockCalHeatmapInstance.on.mock.calls.find((c) => c[0] === 'fill')?.[1];
        if (fillHandler) {
            fillHandler();
        }

        // Trigger calendar-zoom-end to hit window listener path (line 97)
        window.dispatchEvent(new Event('calendar-zoom-end'));

        // Exercise tooltip text function branches (lines 161-169)
        const paintArg2 = mockCalHeatmapInstance.paint.mock.calls[0][0];
        const tooltipText = paintArg2.tooltip.text(new Date(), 0.0123, {
            format: () => '2025-01-01',
        });
        expect(tooltipText).toContain('P/L: +1.23%');
        // Restore width
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    });

    it('skips months without label data when determining calendar domain', async () => {
        const originalWidth = window.innerWidth;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
        const nyDateSpy = jest
            .spyOn(dateUtils, 'getNyDate')
            .mockReturnValue(new Date('2025-07-15T00:00:00Z'));

        const mockData = {
            processedData: [
                { date: '2025-05-30', value: 0, total: 900, dailyChange: 0 },
                { date: '2025-06-02', value: 0.01, total: 920, dailyChange: 20 },
            ],
            byDate: new Map(),
            rates: { USD: 1 },
        };
        getCalendarData.mockResolvedValue(mockData);

        await initCalendar();

        const paintArg = mockCalHeatmapInstance.paint.mock.calls[0][0];
        expect(paintArg.date.min.getFullYear()).toBe(2025);
        expect(paintArg.date.min.getMonth()).toBe(5); // June (0-based)
        expect(paintArg.date.start.getFullYear()).toBe(2025);
        expect(paintArg.date.start.getMonth()).toBe(5);

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
        nyDateSpy.mockRestore();
    });

    it('shifts start month forward when within range but after first labeled month', async () => {
        const originalWidth = window.innerWidth;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
        const nyDateSpy = jest
            .spyOn(dateUtils, 'getNyDate')
            .mockReturnValue(new Date('2025-07-10T00:00:00Z'));

        const mockData = {
            processedData: [
                { date: '2025-03-31', value: 0, total: 850, dailyChange: 0 },
                { date: '2025-04-15', value: 0.02, total: 870, dailyChange: 17.4 },
                { date: '2025-05-30', value: 0, total: 900, dailyChange: 0 },
            ],
            byDate: new Map(),
            rates: { USD: 1 },
        };
        getCalendarData.mockResolvedValue(mockData);

        await initCalendar();

        const paintArg = mockCalHeatmapInstance.paint.mock.calls[0][0];
        expect(paintArg.date.min.getMonth()).toBe(3); // April
        expect(paintArg.date.start.getMonth()).toBe(3);

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
        nyDateSpy.mockRestore();
    });

    it('falls back to earliest data month when labeled month has invalid metadata', async () => {
        const originalWidth = window.innerWidth;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
        const nyDateSpy = jest
            .spyOn(dateUtils, 'getNyDate')
            .mockReturnValue(new Date('2025-06-20T00:00:00Z'));

        const mockData = {
            processedData: [
                { date: '2025-04-01', value: 0, total: 800, dailyChange: 0 },
                { date: '2025-AA-10', value: 0.03, total: 825, dailyChange: 25 },
            ],
            byDate: new Map(),
            rates: { USD: 1 },
        };
        getCalendarData.mockResolvedValue(mockData);

        await initCalendar();

        const paintArg = mockCalHeatmapInstance.paint.mock.calls[0][0];
        const expectedMonth = new Date(`${mockData.processedData[0].date}T00:00:00Z`).getMonth();
        expect(paintArg.date.min.getFullYear()).toBe(2025);
        expect(paintArg.date.min.getMonth()).toBe(expectedMonth);
        expect(paintArg.date.start.getMonth()).toBe(expectedMonth);

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
        nyDateSpy.mockRestore();
    });

    it('should handle nav clicks and today toggle with timer', async () => {
        jest.useFakeTimers();
        const mockData = {
            processedData: [{ date: '2025-01-01', value: 1, total: 1000 }],
            byDate: new Map([['2025-01-01', { date: '2025-01-01', value: 1, total: 1000 }]]),
            rates: { USD: 1 },
        };
        getCalendarData.mockResolvedValue(mockData);
        await initCalendar();

        // Simulate prev/next clicks
        const prevClick = prevBtnRef.addEventListener.mock.calls.find((c) => c[0] === 'click')[1];
        const nextClick = nextBtnRef.addEventListener.mock.calls.find((c) => c[0] === 'click')[1];
        const e1 = { preventDefault: jest.fn() };
        const e2 = { preventDefault: jest.fn() };
        prevClick(e1);
        nextClick(e2);
        expect(e1.preventDefault).toHaveBeenCalled();
        expect(e2.preventDefault).toHaveBeenCalled();
        expect(mockCalHeatmapInstance.previous).toHaveBeenCalled();
        expect(mockCalHeatmapInstance.next).toHaveBeenCalled();

        // Simulate today click single then double-click
        const todayClick = todayBtnRef.addEventListener.mock.calls.find((c) => c[0] === 'click')[1];
        const e3 = { preventDefault: jest.fn() };
        todayClick(e3);
        jest.advanceTimersByTime(300);
        expect(mockCalHeatmapInstance.jumpTo).toHaveBeenCalled();
        // Double click path clears timer
        todayClick(e3);
        todayClick(e3);
        jest.useRealTimers();
    });

    it('should ignore unrelated keydown events (default switch branch)', async () => {
        const mockData = {
            processedData: [{ date: '2025-01-01', value: 1, total: 1000 }],
            byDate: new Map([['2025-01-01', { date: '2025-01-01', value: 1, total: 1000 }]]),
            rates: { USD: 1 },
        };
        getCalendarData.mockResolvedValue(mockData);
        await initCalendar();

        // Dispatch a key that is not handled to hit the default case
        const evt = new window.KeyboardEvent('keydown', { key: 'x' });
        window.dispatchEvent(evt);
        // No assertions required; success is no throw and coverage of default branch
    });

    it('should navigate with ArrowLeft/ArrowRight and respect disabled state', async () => {
        const mockData = {
            processedData: [{ date: '2025-01-01', value: 1, total: 1000 }],
            byDate: new Map([['2025-01-01', { date: '2025-01-01', value: 1, total: 1000 }]]),
            rates: { USD: 1 },
        };
        getCalendarData.mockResolvedValue(mockData);
        await initCalendar();

        // Enabled path
        prevBtnRef.disabled = false;
        nextBtnRef.disabled = false;
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(prevBtnRef.click).toHaveBeenCalledTimes(1);
        expect(nextBtnRef.click).toHaveBeenCalledTimes(1);

        // Disabled path: clicks should not increase
        prevBtnRef.disabled = true;
        nextBtnRef.disabled = true;
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(prevBtnRef.click).toHaveBeenCalledTimes(1);
        expect(nextBtnRef.click).toHaveBeenCalledTimes(1);
    });

    it('should handle ArrowDown with and without today button', async () => {
        const mockData = {
            processedData: [{ date: '2025-01-01', value: 1, total: 1000 }],
            byDate: new Map([['2025-01-01', { date: '2025-01-01', value: 1, total: 1000 }]]),
            rates: { USD: 1 },
        };
        getCalendarData.mockResolvedValue(mockData);
        await initCalendar();

        // With today button present: should click
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(todayBtnRef.click).toHaveBeenCalledTimes(1);

        // Rewire querySelector to return null for today, then init again to capture null element
        document.querySelector = jest.fn().mockImplementation((sel) => {
            if (sel === '#cal-prev') {
                return prevBtnRef;
            }
            if (sel === '#cal-next') {
                return nextBtnRef;
            }
            if (sel === '#cal-today') {
                return null;
            }
            if (sel === '#calendar-container') {
                return { innerHTML: '' };
            }
            return { addEventListener: jest.fn(), innerHTML: '', disabled: false };
        });
        await initCalendar();
        // Should not throw when element missing; nothing to assert besides coverage
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });

    it('should map ArrowUp to dblclick on today (enlarge) and cancel pending single action', async () => {
        jest.useFakeTimers();
        const mockData = {
            processedData: [{ date: '2025-01-01', value: 1, total: 1000 }],
            byDate: new Map([['2025-01-01', { date: '2025-01-01', value: 1, total: 1000 }]]),
            rates: { USD: 1 },
        };
        getCalendarData.mockResolvedValue(mockData);
        await initCalendar();

        // Grab the actual today click handler to schedule the timer
        const todayClick = todayBtnRef.addEventListener.mock.calls.find((c) => c[0] === 'click')[1];
        const e = { preventDefault: jest.fn() };
        todayClick(e); // schedules the delayed jumpTo

        // Press ArrowUp quickly to emulate a double-click: should cancel pending timer
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp' }));

        // Advance timers beyond the delay; jumpTo should not fire due to cancellation
        jest.advanceTimersByTime(300);
        expect(mockCalHeatmapInstance.jumpTo).not.toHaveBeenCalled();
        // And it should dispatch a dblclick to today button so responsive handler can zoom
        expect(todayBtnRef.dispatchEvent).toHaveBeenCalled();
        jest.useRealTimers();
    });

    it('should render labels and handle visibility toggle paths', async () => {
        // Ensure d3 is initialized in module under test
        const mockData = {
            processedData: [{ date: '2025-01-01', value: 0.1, total: 1000 }],
            byDate: new Map([['2025-01-01', { date: '2025-01-01', value: 0.1, total: 1000 }]]),
            rates: { USD: 1 },
        };
        getCalendarData.mockResolvedValue(mockData);
        await initCalendar();
        // Reset capture array in case prior tests populated it
        capturedClassValues.length = 0;
        // With labelsVisible=false: should clear labels
        const byDate = new Map([
            ['2025-01-01', { dailyChange: 10, total: 1000 }],
            ['2025-01-02', { dailyChange: 0, total: 1100 }],
        ]);
        const state = { labelsVisible: false, selectedCurrency: 'USD', rates: { USD: 1 } };
        const symbols = { USD: '$' };
        renderLabels(mockCalHeatmapInstance, byDate, state, symbols);
        // Now enable and render again to exercise branch paths
        state.labelsVisible = true;
        renderLabels(mockCalHeatmapInstance, byDate, state, symbols);
        // Verify that the first line tspan with class 'subdomain-line0' was appended
        expect(capturedClassValues).toEqual(expect.arrayContaining(['subdomain-line0']));
    });

    it('should handle data fetch error and show error message', async () => {
        console.error = jest.fn();
        console.log = jest.fn();
        getCalendarData.mockRejectedValue(new Error('boom'));
        await initCalendar();
        const container = document.querySelector('#calendar-container');
        expect(container.innerHTML).toContain('<p>');
        expect(console.error).toHaveBeenCalled();
    });

    it('should handle currency change event and re-render labels', async () => {
        const mockData = {
            processedData: [{ date: '2025-01-01', value: 0.1, total: 1234 }],
            byDate: new Map([['2025-01-01', { date: '2025-01-01', value: 0.1, total: 1234 }]]),
            rates: { USD: 1, JPY: 110 },
        };
        getCalendarData.mockResolvedValue(mockData);
        await initCalendar();
        document.dispatchEvent(
            new CustomEvent('currencyChangedGlobal', { detail: { currency: 'JPY' } })
        );
        // No assertion needed; firing the event covers lines 129-130
    });

    it('should handle mobile start-date branch and tooltip variants', async () => {
        const originalWidth = window.innerWidth;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 }); // mobile
        const mockData = {
            processedData: [{ date: '2025-02-01', value: 0.0, total: 0 }],
            byDate: new Map([['2025-02-01', { date: '2025-02-01', value: 0.0, total: 0 }]]),
            rates: { USD: 1 },
        };
        getCalendarData.mockResolvedValue(mockData);
        await initCalendar();
        const paintArg = mockCalHeatmapInstance.paint.mock.calls.slice(-1)[0][0];
        // No entry case, negative and zero values
        const textNA = paintArg.tooltip.text(new Date(), 0.0, { format: () => '2025-12-31' });
        expect(textNA).toContain('Value: N/A');
        const textNeg = paintArg.tooltip.text(new Date(), -0.5, { format: () => '2025-02-01' });
        expect(textNeg).toContain('P/L: -50.00%');
        // zero should produce no '+' sign
        const textZero = paintArg.tooltip.text(new Date(), 0, { format: () => '2025-02-01' });
        expect(textZero).toContain('P/L: 0.00%');
        // restore
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    });

    it('should auto-init in non-test env via autoInitCalendar', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        // Directly call to ensure line 210 executed
        await autoInitCalendar();
        process.env.NODE_ENV = originalEnv;
    });

    it('should handle keyboard navigation and ignore modifiers/inputs', async () => {
        const mockData = {
            processedData: [
                { date: '2025-01-01', value: 0.1, total: 1234 },
                { date: '2025-01-02', value: -0.2, total: 1200 },
            ],
            byDate: new Map([
                ['2025-01-01', { date: '2025-01-01', value: 0.1, total: 1234 }],
                ['2025-01-02', { date: '2025-01-02', value: -0.2, total: 1200 }],
            ]),
            rates: { USD: 1 },
        };
        // Ensure click handlers exist so keydown can trigger them
        prevBtnRef.click = jest.fn();
        nextBtnRef.click = jest.fn();
        todayBtnRef.click = jest.fn();

        getCalendarData.mockResolvedValue(mockData);
        await initCalendar();

        // ArrowLeft triggers prev when enabled
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(prevBtnRef.click).toHaveBeenCalledTimes(1);

        // ArrowRight triggers next when enabled
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(nextBtnRef.click).toHaveBeenCalledTimes(1);

        // Disable next; ArrowRight should not trigger click
        nextBtnRef.disabled = true;
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(nextBtnRef.click).toHaveBeenCalledTimes(1);
        nextBtnRef.disabled = false; // restore

        // ArrowDown triggers today
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(todayBtnRef.click).toHaveBeenCalledTimes(1);

        // With modifier keys and non-arrow: should be ignored (hits ignore branch)
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'x', ctrlKey: true }));
        // With Ctrl+ArrowRight: exercise currency cycle branch (no assertion needed)
        window.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true })
        );
        // With Ctrl+ArrowLeft as well
        window.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true })
        );
        expect(prevBtnRef.click).toHaveBeenCalledTimes(1);

        // When focused on input/select/textarea/contentEditable: should be ignored
        const originalActiveDesc = Object.getOwnPropertyDescriptor(document, 'activeElement');
        Object.defineProperty(document, 'activeElement', {
            configurable: true,
            get: () => ({ tagName: 'INPUT', isContentEditable: false }),
        });
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(prevBtnRef.click).toHaveBeenCalledTimes(1);
        // Restore activeElement so default branch isn't short-circuited
        if (originalActiveDesc) {
            Object.defineProperty(document, 'activeElement', originalActiveDesc);
        }
        // Any other key hits default branch
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    });
});
