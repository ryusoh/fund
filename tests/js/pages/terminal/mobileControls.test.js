/* global jest */

jest.mock('../../../../js/transactions/state.js', () => ({
    setActiveChart: jest.fn(),
    setChartDateRange: jest.fn(),
    whenTransactionDataReady: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../../js/transactions/terminal/dateUtils.js', () => ({
    updateContextYearFromRange: jest.fn(),
}));

jest.mock('../../../../js/transactions/layout.js', () => ({
    adjustMobilePanels: jest.fn(),
}));

function setupDom() {
    document.body.innerHTML = `
        <div id="currencyToggleContainer"></div>
        <div class="transaction-container">
            <section id="runningAmountSection" class="is-hidden"></section>
        </div>
    `;
}

describe('mobileControls', () => {
    let initMobileControls;
    let setActiveChart;
    let setChartDateRange;
    let updateContextYearFromRange;
    let adjustMobilePanels;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        setupDom();
        initMobileControls =
            require('../../../../js/pages/terminal/mobileControls.js').initMobileControls;
        setActiveChart = require('../../../../js/transactions/state.js').setActiveChart;
        setChartDateRange = require('../../../../js/transactions/state.js').setChartDateRange;
        updateContextYearFromRange =
            require('../../../../js/transactions/terminal/dateUtils.js').updateContextYearFromRange;
        adjustMobilePanels = require('../../../../js/transactions/layout.js').adjustMobilePanels;
    });

    test('renders a single row containing range presets and overflow button', () => {
        const bar = initMobileControls({ chartManager: { update: jest.fn() } });
        expect(bar).not.toBeNull();

        const row = bar.querySelector('.mobile-controls-row');
        expect(row).not.toBeNull();

        const rangePicker = row.querySelector('.mobile-range-picker');
        const overflowBtn = row.querySelector('.mobile-overflow-button');
        expect(rangePicker).not.toBeNull();
        expect(overflowBtn).not.toBeNull();

        // No chart title or selector elements exist
        expect(bar.querySelector('.mobile-chart-title')).toBeNull();
        expect(bar.querySelector('.mobile-chart-menu')).toBeNull();
        expect(bar.querySelector('.mobile-menu-button')).toBeNull();
        expect(bar.nextElementSibling.id).toBe('runningAmountSection');
    });

    test('returns null when the required DOM is missing', () => {
        document.body.innerHTML = '';
        expect(initMobileControls({ chartManager: { update: jest.fn() } })).toBeNull();
    });

    test('swiping left on the chart section switches to next chart and swiping right to previous chart (cycles through 19 charts)', async () => {
        const chartManager = { update: jest.fn() };
        initMobileControls({ chartManager });

        const section = document.getElementById('runningAmountSection');

        // Swipe left (deltaX = -60px) -> switches from Balance (0) to Performance (1)
        const touchStart = new Event('touchstart', { bubbles: true });
        touchStart.touches = [{ clientX: 150, clientY: 100 }];
        section.dispatchEvent(touchStart);

        const touchEnd = new Event('touchend', { bubbles: true });
        touchEnd.changedTouches = [{ clientX: 90, clientY: 102 }];
        section.dispatchEvent(touchEnd);

        await Promise.resolve();
        await Promise.resolve();

        expect(setActiveChart).toHaveBeenCalledWith('performance');
        expect(chartManager.update).toHaveBeenCalledTimes(1);
        expect(adjustMobilePanels).toHaveBeenCalled();

        // Swipe right (deltaX = +60px) -> switches back to Balance (0)
        const touchStart2 = new Event('touchstart', { bubbles: true });
        touchStart2.touches = [{ clientX: 90, clientY: 100 }];
        section.dispatchEvent(touchStart2);

        const touchEnd2 = new Event('touchend', { bubbles: true });
        touchEnd2.changedTouches = [{ clientX: 160, clientY: 98 }];
        section.dispatchEvent(touchEnd2);

        await Promise.resolve();
        await Promise.resolve();

        expect(setActiveChart).toHaveBeenCalledWith('contribution');

        // Swipe right again -> wraps to last chart (FX Rate)
        const touchStart3 = new Event('touchstart', { bubbles: true });
        touchStart3.touches = [{ clientX: 90, clientY: 100 }];
        section.dispatchEvent(touchStart3);

        const touchEnd3 = new Event('touchend', { bubbles: true });
        touchEnd3.changedTouches = [{ clientX: 160, clientY: 98 }];
        section.dispatchEvent(touchEnd3);

        await Promise.resolve();
        await Promise.resolve();

        expect(setActiveChart).toHaveBeenCalledWith('fx');
    });

    test('vertical swipe or small gestures do not switch charts', async () => {
        const chartManager = { update: jest.fn() };
        initMobileControls({ chartManager });

        const section = document.getElementById('runningAmountSection');

        // Vertical scroll (deltaY = 80, deltaX = 10)
        const touchStart = new Event('touchstart', { bubbles: true });
        touchStart.touches = [{ clientX: 100, clientY: 100 }];
        section.dispatchEvent(touchStart);

        const touchEnd = new Event('touchend', { bubbles: true });
        touchEnd.changedTouches = [{ clientX: 110, clientY: 180 }];
        section.dispatchEvent(touchEnd);

        await Promise.resolve();
        await Promise.resolve();

        expect(setActiveChart).not.toHaveBeenCalled();
    });

    test('renders overflow button and toggles bottom sheet with currency container', () => {
        const bar = initMobileControls({ chartManager: { update: jest.fn() } });
        expect(bar).not.toBeNull();

        const overflowBtn = bar.querySelector('.mobile-overflow-button');
        expect(overflowBtn).not.toBeNull();
        expect(overflowBtn.getAttribute('aria-haspopup')).toBe('dialog');
        expect(overflowBtn.getAttribute('aria-expanded')).toBe('false');

        const backdrop = document.querySelector('.mobile-sheet-backdrop');
        const sheet = document.querySelector('.mobile-sheet');
        expect(backdrop).not.toBeNull();
        expect(sheet).not.toBeNull();
        expect(backdrop.hidden).toBe(true);
        expect(sheet.hidden).toBe(true);

        const currencyInSheet = sheet.querySelector('#currencyToggleContainer');
        expect(currencyInSheet).not.toBeNull();

        overflowBtn.click();
        expect(backdrop.hidden).toBe(false);
        expect(sheet.hidden).toBe(false);
        expect(overflowBtn.getAttribute('aria-expanded')).toBe('true');

        backdrop.click();
        expect(backdrop.hidden).toBe(true);
        expect(sheet.hidden).toBe(true);
        expect(overflowBtn.getAttribute('aria-expanded')).toBe('false');
    });

    test('renders the range presets unselected', () => {
        initMobileControls({ chartManager: { update: jest.fn() } });
        const tabs = document.querySelectorAll('.mobile-range-button');
        expect([...tabs].map((t) => t.textContent)).toEqual(['1M', '3M', '6M', 'YTD', '1Y', 'All']);
        tabs.forEach((tab) => {
            expect(tab.getAttribute('aria-selected')).toBe('false');
        });
    });

    test('tapping a range preset applies a relative date range', async () => {
        const chartManager = { update: jest.fn() };
        initMobileControls({ chartManager });
        const tab = document.querySelector('[data-range="6M"]');
        tab.click();
        await Promise.resolve();
        await Promise.resolve();
        const range = setChartDateRange.mock.calls[0][0];
        expect(range.to).toBeNull();
        expect(range.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(updateContextYearFromRange).toHaveBeenCalledWith(range);
        expect(chartManager.update).toHaveBeenCalledTimes(1);
        expect(tab.getAttribute('aria-selected')).toBe('true');
        expect(document.querySelector('[data-range="1M"]').getAttribute('aria-selected')).toBe(
            'false'
        );
    });

    test('tapping All clears the date range', async () => {
        const chartManager = { update: jest.fn() };
        initMobileControls({ chartManager });
        document.querySelector('[data-range="ALL"]').click();
        await Promise.resolve();
        await Promise.resolve();
        expect(setChartDateRange).toHaveBeenCalledWith({ from: null, to: null });
    });
});

describe('resolveRangePreset', () => {
    let resolveRangePreset;

    beforeEach(() => {
        jest.resetModules();
        resolveRangePreset =
            require('../../../../js/pages/terminal/mobileControls.js').resolveRangePreset;
    });

    const now = new Date(2026, 7, 27); // 2026-08-27 local

    test('maps month presets relative to now', () => {
        expect(resolveRangePreset('1M', now)).toEqual({ from: '2026-07-27', to: null });
        expect(resolveRangePreset('3M', now)).toEqual({ from: '2026-05-27', to: null });
        expect(resolveRangePreset('6M', now)).toEqual({ from: '2026-02-27', to: null });
        expect(resolveRangePreset('1Y', now)).toEqual({ from: '2025-08-27', to: null });
    });

    test('clamps to the last day of a shorter month', () => {
        expect(resolveRangePreset('1M', new Date(2026, 2, 31))).toEqual({
            from: '2026-02-28',
            to: null,
        });
    });

    test('maps YTD to January 1 of the current year', () => {
        expect(resolveRangePreset('YTD', now)).toEqual({ from: '2026-01-01', to: null });
    });

    test('maps ALL to an open range and rejects unknown presets', () => {
        expect(resolveRangePreset('ALL', now)).toEqual({ from: null, to: null });
        expect(resolveRangePreset('NOPE', now)).toBeNull();
    });
});
