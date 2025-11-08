// Custom cursor and UI enhancements
import { initCursor } from './vendor/cursor.js';

document.addEventListener('DOMContentLoaded', () => {
    // Check if GSAP is available
    if (!window.gsap) {
        // GSAP is required for cursor functionality
        return;
    }

    // Initialize just the cursor
    const { cursor } = initCursor({
        cursor: {
            // Custom cursor options
            hoverTargets: 'a, button, .container li',
            followEase: 0.4,
            fadeEase: 0.1,
            hoverScale: 3,
        },
    });

    // Store instances for cleanup if needed
    window.cursorInstances = { cursor };
});
