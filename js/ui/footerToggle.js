import { UI_BREAKPOINTS } from '@js/config.js';

export function initFooterToggle() {
    const totalValueElement = document.getElementById('total-portfolio-value-in-table');
    const pnlElement = document.querySelector('.total-pnl');

    if (!totalValueElement || !pnlElement) {
        return;
    }

    const state = {
        isMobileMode: undefined,
        onTotalClick: null,
        onPnlClick: null,
    };

    function attachMobileHandlers() {
        // Initial mobile state: show total, hide pnl
        totalValueElement.style.display = 'inline';
        pnlElement.style.display = 'none';

        state.onTotalClick = () => {
            totalValueElement.style.display = 'none';
            pnlElement.style.display = 'inline';
        };
        state.onPnlClick = () => {
            pnlElement.style.display = 'none';
            totalValueElement.style.display = 'inline';
        };

        totalValueElement.addEventListener('click', state.onTotalClick);
        pnlElement.addEventListener('click', state.onPnlClick);
    }

    function detachMobileHandlers() {
        if (state.onTotalClick) {
            totalValueElement.removeEventListener('click', state.onTotalClick);
            state.onTotalClick = null;
        }
        if (state.onPnlClick) {
            pnlElement.removeEventListener('click', state.onPnlClick);
            state.onPnlClick = null;
        }
    }

    function applyDesktopMode() {
        // Always show both on desktop
        totalValueElement.style.display = 'inline';
        pnlElement.style.display = 'inline';
    }

    function applyMobileMode() {
        // Ensure mobile initial visibility
        totalValueElement.style.display = 'inline';
        pnlElement.style.display = 'none';
    }

    function updateMode() {
        const isMobile = window.innerWidth <= UI_BREAKPOINTS.MOBILE;
        if (state.isMobileMode === isMobile) {
            return;
        } // no change
        state.isMobileMode = isMobile;

        if (isMobile) {
            attachMobileHandlers();
            applyMobileMode();
        } else {
            detachMobileHandlers();
            applyDesktopMode();
        }
    }

    // Initialize and listen for resizes to switch behavior
    updateMode();
    window.addEventListener('resize', updateMode);
}
