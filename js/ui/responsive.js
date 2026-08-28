import { UI_BREAKPOINTS, CALENDAR_SELECTORS } from '@js/config.js';

export function checkAndToggleVerticalScroll() {
    const isMobile = window.innerWidth <= UI_BREAKPOINTS.MOBILE;
    const htmlElement = document.documentElement;
    const bodyElement = document.body;

    if (!isMobile) {
        // Ensure scrolling is enabled on desktop
        htmlElement.style.overflowY = ''; // Reset to default
        bodyElement.style.overflowY = ''; // Reset to default
    }
}

export function alignToggleWithChartMobile() {
    const toggleContainer = document.getElementById('currencyToggleContainer');
    if (!toggleContainer) {
        return;
    }
    toggleContainer.style.removeProperty('position');
    toggleContainer.style.removeProperty('top');
    toggleContainer.style.removeProperty('left');
    toggleContainer.style.removeProperty('right');
    toggleContainer.style.removeProperty('transform');
}

export function setupResizeListener() {
    window.addEventListener('resize', () => {
        checkAndToggleVerticalScroll();
        alignToggleWithChartMobile();
    });
}

export function initCalendarResponsiveHandlers() {
    const toggleContainer = document.querySelector(CALENDAR_SELECTORS.currencyToggle);
    if (toggleContainer) {
        toggleContainer.style.removeProperty('position');
        toggleContainer.style.removeProperty('top');
        toggleContainer.style.removeProperty('left');
        toggleContainer.style.removeProperty('right');
        toggleContainer.style.removeProperty('transform');
    }

    const todayButton = document.querySelector(CALENDAR_SELECTORS.todayButton);
    const pageWrapper = document.querySelector(CALENDAR_SELECTORS.pageWrapper);
    if (todayButton && pageWrapper) {
        todayButton.addEventListener('dblclick', () => {
            if (window.innerWidth <= UI_BREAKPOINTS.MOBILE) {
                return;
            }
            const isZoomed = pageWrapper.classList.toggle('zoomed');
            const body = document.body;
            if (body && body.classList) {
                body.classList.toggle('calendar-zoomed', isZoomed);
            }
            pageWrapper.addEventListener(
                'transitionend',
                () => {
                    window.dispatchEvent(new CustomEvent('calendar-zoom-end'));
                },
                { once: true }
            );
        });
    }
}
