import { initFooterToggle } from '@ui/footerToggle.js';

describe('initFooterToggle', () => {
    let pnlContainer;
    let totalValueElement;
    let pnlElement;

    beforeEach(() => {
        document.body.innerHTML = `
      <div id="table-footer-summary">
        <span id="total-portfolio-value-in-table"></span>
        <span class="total-pnl"></span>
      </div>
    `;
        pnlContainer = document.getElementById('table-footer-summary');
        totalValueElement = document.getElementById('total-portfolio-value-in-table');
        pnlElement = document.querySelector('.total-pnl');
        jest.clearAllMocks();
    });

    const setViewportWidth = (width) => {
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: width,
        });
    };

    // Mobile: all-time PnL bracket starts collapsed, tap swaps it for the total
    it('should toggle pnl-expanded class on mobile (<=768px)', () => {
        setViewportWidth(500);
        initFooterToggle();

        // Initial state: collapsed
        expect(pnlContainer.classList.contains('pnl-expanded')).toBe(false);

        // Tap on the total value expands
        totalValueElement.click();
        expect(pnlContainer.classList.contains('pnl-expanded')).toBe(true);

        // Tap on the pnl collapses again
        pnlElement.click();
        expect(pnlContainer.classList.contains('pnl-expanded')).toBe(false);
    });

    // Desktop: no toggle, no collapsed state
    it('should not toggle on desktop (>768px)', () => {
        setViewportWidth(1024);
        initFooterToggle();

        expect(pnlContainer.classList.contains('pnl-expanded')).toBe(false);

        totalValueElement.click();
        pnlElement.click();
        expect(pnlContainer.classList.contains('pnl-expanded')).toBe(false);
    });

    // Switching from mobile to desktop detaches handlers and clears state
    it('should detach mobile handlers on resize to desktop', () => {
        setViewportWidth(500);
        initFooterToggle();

        totalValueElement.click();
        expect(pnlContainer.classList.contains('pnl-expanded')).toBe(true);

        setViewportWidth(1024);
        window.dispatchEvent(new Event('resize'));

        expect(pnlContainer.classList.contains('pnl-expanded')).toBe(false);

        // Clicks no longer toggle
        totalValueElement.click();
        pnlElement.click();
        expect(pnlContainer.classList.contains('pnl-expanded')).toBe(false);
    });

    it('should not set up listeners if the container does not exist', () => {
        document.body.innerHTML = '';
        const addEventListenerSpy = jest.spyOn(Element.prototype, 'addEventListener');

        initFooterToggle();

        expect(addEventListenerSpy).not.toHaveBeenCalled();

        addEventListenerSpy.mockRestore();
    });
});
