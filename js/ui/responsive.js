import { UI_BREAKPOINTS } from '../config.js';

export function checkAndToggleVerticalScroll() {
    const isMobile = window.innerWidth <= UI_BREAKPOINTS.MOBILE;
    const htmlElement = document.documentElement;
    const bodyElement = document.body;
    if (isMobile) { // Only on mobile layout
        htmlElement.style.setProperty('overflow-y', 'hidden', 'important');
        bodyElement.style.setProperty('overflow-y', 'hidden', 'important');
    } else {
        // Ensure scrolling is enabled on desktop
        htmlElement.style.overflowY = '';
        bodyElement.style.overflowY = '';
    }
}
