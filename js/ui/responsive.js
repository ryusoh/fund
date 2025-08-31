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
    const isMobile = window.innerWidth <= UI_BREAKPOINTS.MOBILE;
    const toggleContainer = document.getElementById('currencyToggleContainer');
    const chartContainer = document.getElementById('fundPieChartContainer');

    if (!toggleContainer || !chartContainer) {
        return;
    }

    if (isMobile) {
        // Ensure toggle is fixed for JS positioning to work as intended relative to viewport
        toggleContainer.style.position = 'fixed';
        toggleContainer.style.left = '0px'; // Keep it stuck to the left

        const chartRect = chartContainer.getBoundingClientRect();
        const chartCenterY = chartRect.top + chartRect.height / 2;

        const toggleHeight = toggleContainer.offsetHeight;
        const toggleTop = chartCenterY - toggleHeight / 2;

        toggleContainer.style.top = `${toggleTop}px`;
    } else {
        // Reset styles if not mobile, so desktop CSS takes over
        toggleContainer.style.position = ''; // Reverts to CSS defined position (e.g. fixed, top: 15px, left: 15px)
        toggleContainer.style.top = '';
        toggleContainer.style.left = ''; // Allow desktop CSS to control left
    }
}

export function setupResizeListener() {
    window.addEventListener('resize', () => {
        checkAndToggleVerticalScroll();
        alignToggleWithChartMobile();
    });
}

export function initCalendarResponsiveHandlers() {
    const alignToggle = () => {
        const isMobile = window.innerWidth <= UI_BREAKPOINTS.MOBILE;
        const toggleContainer = document.querySelector(CALENDAR_SELECTORS.currencyToggle);
        const heatmapContainer = document.querySelector(CALENDAR_SELECTORS.heatmap);

        if (!toggleContainer || !heatmapContainer) {
            return;
        }

        if (isMobile) {
            toggleContainer.style.position = 'fixed';
            toggleContainer.style.left = '0px';
            const heatmapRect = heatmapContainer.getBoundingClientRect();
            const heatmapCenterY = heatmapRect.top + heatmapRect.height / 2;
            const toggleHeight = toggleContainer.offsetHeight;
            toggleContainer.style.top = `${heatmapCenterY - toggleHeight / 2}px`;
        } else {
            toggleContainer.style.position = '';
            toggleContainer.style.top = '';
            toggleContainer.style.left = '';
        }
    };
    alignToggle();
    window.addEventListener('resize', alignToggle);

    const todayButton = document.querySelector(CALENDAR_SELECTORS.todayButton);
    const pageWrapper = document.querySelector(CALENDAR_SELECTORS.pageWrapper);
    if (todayButton && pageWrapper) {
        todayButton.addEventListener('dblclick', () => {
            pageWrapper.classList.toggle('zoomed');
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
