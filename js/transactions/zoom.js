/**
 * Zoom module for terminal - handles expanding/collapsing terminal to take over chart area.
 * Uses GSAP for smooth animations when zooming in/out.
 */
/* global gsap */
import { isZoomed, setZoomed } from './state.js';

const ANIMATION_DURATION = 0.35;
const EASING = 'power2.inOut';

/**
 * Gets the elements needed for zoom transitions.
 * @returns {{terminal: Element, chart: Element, terminalOutput: Element} | null}
 */
function getZoomElements() {
    const terminal = document.getElementById('terminal');
    const chart = document.getElementById('runningAmountSection');
    const terminalOutput = document.getElementById('terminalOutput');

    if (!terminal || !terminalOutput) {
        return null;
    }

    return { terminal, chart, terminalOutput };
}

/**
 * Calculates the target height for the terminal-output when zoomed.
 * Prioritizes expanding to the bottom of the chart if visible, then the table if visible,
 * otherwise defaults to a calculated height based on typical layout.
 * @param {Element} terminal - The terminal element
 * @param {Element} chart - The chart element
 * @param {Element} terminalOutput - The terminal output element
 * @returns {number} The target height for terminal-output in pixels
 */
function calculateZoomedOutputHeight(terminal, chart, terminalOutput) {
    const terminalRect = terminal.getBoundingClientRect();
    const terminalOutputRect = terminalOutput.getBoundingClientRect();
    const table = document.querySelector('.table-responsive-container');

    let targetBottom;

    if (chart && !chart.classList.contains('is-hidden')) {
        // Method 1: Expand to chart bottom (primary goal)
        targetBottom = chart.getBoundingClientRect().bottom;
    } else if (table && !table.classList.contains('is-hidden')) {
        // Method 2: Expand to table bottom if chart is hidden
        targetBottom = table.getBoundingClientRect().bottom;
    } else {
        // Method 3: Default expansion (approximate chart height ~400px + gap)
        // If neither chart nor table is visible, we simulate expanding into that empty space
        const simulatedAdditionalHeight = 420; // Typical chart height + gap
        targetBottom = terminalRect.bottom + simulatedAdditionalHeight;
    }

    // New terminal height = targetBottom - terminalRect.top
    // Additional height for output = (new terminal height) - (other terminal elements)
    // otherTerminalElements = terminalRect.height - terminalOutputRect.height
    const otherTerminalElements = terminalRect.height - terminalOutputRect.height;
    const newTerminalHeight = targetBottom - terminalRect.top;
    const newOutputHeight = newTerminalHeight - otherTerminalElements;

    return Math.max(newOutputHeight, terminalOutputRect.height);
}

/**
 * Animates terminal zoom-in (expand terminal, fade out chart).
 * @param {Element} terminal
 * @param {Element} chart
 * @param {Element} terminalOutput
 * @returns {Promise<void>}
 */
function animateZoomIn(terminal, chart, terminalOutput) {
    return new Promise((resolve) => {
        const targetHeight = calculateZoomedOutputHeight(terminal, chart, terminalOutput);

        // Store original height for restoration
        terminalOutput.dataset.originalHeight = terminalOutput.getBoundingClientRect().height;

        // Pause glass effect resize to prevent glitching/thrashing during animation
        terminal.glassEffect?.pauseResize();

        const timeline = gsap.timeline({
            onComplete: () => {
                terminal.glassEffect?.resumeResize();
                terminal.classList.add('terminal-zoomed');
                if (chart) {
                    chart.classList.add('chart-zoomed-out');
                }
                resolve();
            },
        });

        // Fade out chart
        if (chart && !chart.classList.contains('is-hidden')) {
            timeline.to(
                chart,
                {
                    opacity: 0,
                    scale: 0.98,
                    duration: ANIMATION_DURATION * 0.8,
                    ease: EASING,
                },
                0
            );
        }

        // Also fade out table if visible
        const table = document.querySelector('.table-responsive-container');
        if (table && !table.classList.contains('is-hidden')) {
            table.classList.add('chart-zoomed-out'); // Use same class for ease
            timeline.to(
                table,
                {
                    opacity: 0,
                    scale: 0.98,
                    duration: ANIMATION_DURATION * 0.8,
                    ease: EASING,
                },
                0
            );
        }

        // Expand terminal output
        timeline.to(
            terminalOutput,
            {
                height: targetHeight,
                duration: ANIMATION_DURATION,
                ease: EASING,
            },
            0
        );
    });
}

/**
 * Animates terminal zoom-out (collapse terminal, fade in chart).
 * @param {Element} terminal
 * @param {Element} chart
 * @param {Element} terminalOutput
 * @returns {Promise<void>}
 */
function animateZoomOut(terminal, chart, terminalOutput) {
    return new Promise((resolve) => {
        const originalHeight = parseFloat(terminalOutput.dataset.originalHeight) || 270;

        // Pause glass effect resize during animation
        terminal.glassEffect?.pauseResize();

        const timeline = gsap.timeline({
            onComplete: () => {
                terminal.glassEffect?.resumeResize();
                terminal.classList.remove('terminal-zoomed');
                if (chart) {
                    chart.classList.remove('chart-zoomed-out');
                }
                // Clear inline styles set by GSAP
                gsap.set(terminalOutput, { clearProps: 'height' });
                if (chart) {
                    gsap.set(chart, { clearProps: 'opacity,scale' });
                }
                resolve();
            },
        });

        // Collapse terminal output
        timeline.to(
            terminalOutput,
            {
                height: originalHeight,
                duration: ANIMATION_DURATION,
                ease: EASING,
            },
            0
        );

        // Fade in chart
        if (chart && !chart.classList.contains('is-hidden')) {
            timeline.to(
                chart,
                {
                    opacity: 1,
                    scale: 1,
                    duration: ANIMATION_DURATION * 0.8,
                    ease: EASING,
                },
                ANIMATION_DURATION * 0.3
            );
        }

        // Also fade in table if present (it shares the same chart-zoomed-out class mechanism if applied)
        const table = document.querySelector('.table-responsive-container');
        if (table && !table.classList.contains('is-hidden')) {
            timeline.to(
                table,
                {
                    opacity: 1,
                    scale: 1,
                    duration: ANIMATION_DURATION * 0.8,
                    ease: EASING,
                },
                ANIMATION_DURATION * 0.3
            );
        }
    });
}

/**
 * Toggles the terminal zoom state.
 * When zoomed in, the terminal expands to take over the chart area.
 * When zoomed out, reverts to original layout.
 * @returns {Promise<{zoomed: boolean, message: string}>}
 */
export async function toggleZoom() {
    const elements = getZoomElements();
    if (!elements) {
        return {
            zoomed: isZoomed(),
            message: 'Unable to toggle zoom: terminal elements not found.',
        };
    }

    const { terminal, chart, terminalOutput } = elements;
    const currentlyZoomed = isZoomed();

    if (currentlyZoomed) {
        await animateZoomOut(terminal, chart, terminalOutput);
        setZoomed(false);
        return {
            zoomed: false,
            message: 'Terminal zoomed out.',
        };
    }
    await animateZoomIn(terminal, chart, terminalOutput);
    setZoomed(true);
    return {
        zoomed: true,
        message: 'Terminal zoomed in.',
    };
}

/**
 * Returns the current zoom state without modifying it.
 * @returns {boolean}
 */
export function getZoomState() {
    return isZoomed();
}
