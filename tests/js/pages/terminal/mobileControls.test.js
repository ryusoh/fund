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

    test('returns null when the required DOM is missing', () => {
        document.body.innerHTML = '';
        expect(initMobileControls({ chartManager: { update: jest.fn() } })).toBeNull();
    });

    test('initializes mobile swipe controller on chart section', () => {
        const controller = initMobileControls({ chartManager: { update: jest.fn() } });
        expect(controller).not.toBeNull();
        expect(typeof controller.nextChart).toBe('function');
        expect(typeof controller.prevChart).toBe('function');
        expect(controller.getCurrentChart().key).toBe('contribution');
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

        // Swipe right again -> wraps to last chart (Beta)
        const touchStart3 = new Event('touchstart', { bubbles: true });
        touchStart3.touches = [{ clientX: 90, clientY: 100 }];
        section.dispatchEvent(touchStart3);

        const touchEnd3 = new Event('touchend', { bubbles: true });
        touchEnd3.changedTouches = [{ clientX: 160, clientY: 98 }];
        section.dispatchEvent(touchEnd3);

        await Promise.resolve();
        await Promise.resolve();

        expect(setActiveChart).toHaveBeenCalledWith('beta');
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
});
