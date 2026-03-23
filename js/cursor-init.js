// Custom cursor and UI enhancements
import { initCursor } from './vendor/cursor.js';

// Initialize cursor after DOM is ready and GSAP is loaded
function initCursorOnce() {
    if (!window.gsap) {
        return;
    }
    const { cursor } = initCursor({
        cursor: {
            hoverTargets: 'a, button, .container li',
            followEase: 0.4,
            fadeEase: 0.1,
            hoverScale: 3,
        },
    });
    window.cursorInstances = { cursor };
}

// Module scripts are deferred, but we wait for DOMContentLoaded to ensure
// GSAP (loaded via blocking script) is available and DOM is fully parsed
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCursorOnce);
} else {
    initCursorOnce();
}
