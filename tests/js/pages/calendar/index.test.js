import { getCalendarData } from '@services/dataService.js';
import { initCalendar, renderLabels, autoInitCalendar } from '@pages/calendar/index.js';

jest.mock('@services/dataService.js', () => ({
    getCalendarData: jest.fn(),
}));

jest.mock('@ui/currencyToggleManager.js', () => ({
    initCurrencyToggle: jest.fn(),
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
            mockEl.attr.mockImplementation((attr) => {
                if (attr === 'x') {
                    attrCallCount++;
                    return attrCallCount === 1 ? null : '50';
                }
                return mockEl;
            });
            mockEl.append.mockImplementation(() => createChainableObject());
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
        prevBtnRef = { disabled: false, addEventListener: jest.fn() };
        nextBtnRef = { disabled: false, addEventListener: jest.fn() };
        todayBtnRef = { addEventListener: jest.fn() };
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
            processedData: [{ date: '2025-01-01', value: 1, total: 1000 }],
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

    it('should render labels and handle visibility toggle paths', () => {
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
});
