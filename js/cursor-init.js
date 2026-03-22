// Custom cursor and UI enhancements
import { initCursor } from './vendor/cursor.js';

// Module scripts are deferred — DOM is already parsed and GSAP (blocking script) is loaded.
if (window.gsap) {
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
