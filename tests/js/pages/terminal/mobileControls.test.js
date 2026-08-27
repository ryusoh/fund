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

    test('renders a menu button labeled Balance ▾ with role="menu" containing 5 items', () => {
        const bar = initMobileControls({ chartManager: { update: jest.fn() } });
        expect(bar).not.toBeNull();
        const menuButton = bar.querySelector('.mobile-menu-button');
        expect(menuButton).not.toBeNull();
        expect(menuButton.textContent).toBe('Balance ▾');
        expect(menuButton.getAttribute('aria-haspopup')).toBe('menu');
        expect(menuButton.getAttribute('aria-expanded')).toBe('false');

        const menu = bar.querySelector('.mobile-chart-menu');
        expect(menu).not.toBeNull();
        expect(menu.getAttribute('role')).toBe('menu');
        expect(menu.hidden).toBe(true);

        const items = menu.querySelectorAll('.mobile-chart-menu-item');
        expect(items.length).toBe(5);
        expect([...items].map((i) => i.textContent)).toEqual([
            'Balance',
            'Performance',
            'Drawdown',
            'Composition',
            'Sectors',
        ]);
        expect(items[0].getAttribute('role')).toBe('menuitemradio');
        expect(items[0].getAttribute('aria-checked')).toBe('true');
        expect(items[1].getAttribute('aria-checked')).toBe('false');
        expect(bar.nextElementSibling.id).toBe('runningAmountSection');
    });

    test('returns null when the required DOM is missing', () => {
        document.body.innerHTML = '';
        expect(initMobileControls({ chartManager: { update: jest.fn() } })).toBeNull();
    });

    test('clicking the menu button opens the menu and clicking an item switches the active chart', async () => {
        const chartManager = { update: jest.fn() };
        initMobileControls({ chartManager });
        const menuButton = document.querySelector('.mobile-menu-button');
        const menu = document.querySelector('.mobile-chart-menu');

        menuButton.click();
        expect(menu.hidden).toBe(false);
        expect(menuButton.getAttribute('aria-expanded')).toBe('true');

        const performanceItem = document.querySelector('[data-chart="performance"]');
        performanceItem.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(setActiveChart).toHaveBeenCalledWith('performance');
        expect(
            document.getElementById('runningAmountSection').classList.contains('is-hidden')
        ).toBe(false);
        expect(chartManager.update).toHaveBeenCalledTimes(1);
        expect(adjustMobilePanels).toHaveBeenCalled();
        expect(menuButton.textContent).toBe('Performance ▾');
        expect(menu.hidden).toBe(true);
        expect(performanceItem.getAttribute('aria-checked')).toBe('true');
        expect(
            document.querySelector('[data-chart="contribution"]').getAttribute('aria-checked')
        ).toBe('false');
    });

    test('Escape and clicking outside close the menu', () => {
        const chartManager = { update: jest.fn() };
        initMobileControls({ chartManager });
        const menuButton = document.querySelector('.mobile-menu-button');
        const menu = document.querySelector('.mobile-chart-menu');

        menuButton.click();
        expect(menu.hidden).toBe(false);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(menu.hidden).toBe(true);

        menuButton.click();
        expect(menu.hidden).toBe(false);

        document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(menu.hidden).toBe(true);
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
