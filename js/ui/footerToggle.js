import { UI_BREAKPOINTS } from '@js/config.js';

// Mobile footer toggle — a SWAP, not a show/hide. Default: total value +
// intraday day-change stack visible, all-time PnL bracket (.pnl-all-time)
// collapsed. Expanded (tapped): total value hidden, all-time bracket shown,
// day stack stays. The swap rules live in the mobile media query in
// css/table.css; state rides on a class of the persistent
// #table-footer-summary container because the PnL children are re-created on
// every data refresh. NOTE: footer visibility rules are split across
// css/layout.css AND css/table.css — check both before changing behavior.
export function initFooterToggle() {
    const pnlContainer = document.getElementById('table-footer-summary');
    const totalValueElement = document.getElementById('total-portfolio-value-in-table');
    const pnlElement = document.querySelector('.total-pnl');

    if (!pnlContainer || !totalValueElement || !pnlElement) {
        return;
    }

    const state = {
        isMobileMode: undefined,
        onToggleClick: null,
    };

    function attachMobileHandlers() {
        // Initial mobile state: all-time PnL bracket collapsed
        pnlContainer.classList.remove('pnl-expanded');

        state.onToggleClick = () => {
            pnlContainer.classList.toggle('pnl-expanded');
        };

        totalValueElement.addEventListener('click', state.onToggleClick);
        pnlElement.addEventListener('click', state.onToggleClick);
    }

    function detachMobileHandlers() {
        if (state.onToggleClick) {
            totalValueElement.removeEventListener('click', state.onToggleClick);
            pnlElement.removeEventListener('click', state.onToggleClick);
            state.onToggleClick = null;
        }
        pnlContainer.classList.remove('pnl-expanded');
    }

    function updateMode() {
        const isMobile = window.innerWidth <= UI_BREAKPOINTS.MOBILE;
        if (state.isMobileMode === isMobile) {
            return;
        } // no change
        state.isMobileMode = isMobile;

        if (isMobile) {
            attachMobileHandlers();
        } else {
            detachMobileHandlers();
        }
    }

    // Initialize and listen for resizes to switch behavior
    updateMode();
    window.addEventListener('resize', updateMode);
}
