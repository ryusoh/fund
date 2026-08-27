/* global jest */

jest.mock('../../../../js/transactions/state.js', () => ({
    setActiveChart: jest.fn(),
    whenTransactionDataReady: jest.fn(() => Promise.resolve()),
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
    let adjustMobilePanels;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        setupDom();
        initMobileControls =
            require('../../../../js/pages/terminal/mobileControls.js').initMobileControls;
        setActiveChart = require('../../../../js/transactions/state.js').setActiveChart;
        adjustMobilePanels = require('../../../../js/transactions/layout.js').adjustMobilePanels;
    });

    test('renders the chart picker directly above the chart section', () => {
        const bar = initMobileControls({ chartManager: { update: jest.fn() } });
        expect(bar).not.toBeNull();
        const buttons = bar.querySelectorAll('.mobile-chart-button');
        expect(buttons.length).toBe(5);
        expect([...buttons].map((b) => b.textContent)).toEqual([
            'Balance',
            'Performance',
            'Drawdown',
            'Composition',
            'Sectors',
        ]);
        expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
        expect(bar.nextElementSibling.id).toBe('runningAmountSection');
    });

    test('returns null when the required DOM is missing', () => {
        document.body.innerHTML = '';
        expect(initMobileControls({ chartManager: { update: jest.fn() } })).toBeNull();
    });

    test('tapping a chart button switches the active chart', async () => {
        const chartManager = { update: jest.fn() };
        initMobileControls({ chartManager });
        const performanceButton = document.querySelector('[data-chart="performance"]');
        performanceButton.click();
        await Promise.resolve();
        await Promise.resolve();
        expect(setActiveChart).toHaveBeenCalledWith('performance');
        expect(
            document.getElementById('runningAmountSection').classList.contains('is-hidden')
        ).toBe(false);
        expect(chartManager.update).toHaveBeenCalledTimes(1);
        expect(adjustMobilePanels).toHaveBeenCalled();
        expect(performanceButton.getAttribute('aria-pressed')).toBe('true');
        expect(
            document.querySelector('[data-chart="contribution"]').getAttribute('aria-pressed')
        ).toBe('false');
    });

    test('tapping outside a button does nothing', async () => {
        const chartManager = { update: jest.fn() };
        initMobileControls({ chartManager });
        document.querySelector('.mobile-chart-picker').click();
        await Promise.resolve();
        await Promise.resolve();
        expect(setActiveChart).not.toHaveBeenCalled();
        expect(chartManager.update).not.toHaveBeenCalled();
    });
});
