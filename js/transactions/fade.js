/**
 * Fade module handles the opacity fading effect for terminal output items
 * as they scroll out of view.
 */

const MIN_FADE_OPACITY = 0.2;
let fadeUpdateScheduled = false;

function updateOutputFade(outputContainer) {
    if (!outputContainer) {
        return;
    }

    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        Array.from(outputContainer.children).forEach((child) => {
            if (child && child.nodeType === 1) {
                child.style.opacity = '1';
            }
        });
        return;
    }

    const viewHeight = outputContainer.clientHeight;
    if (viewHeight <= 0) {
        return;
    }

    const threshold = viewHeight * 0.25;
    const viewTop = outputContainer.scrollTop;

    const lastChild = outputContainer.lastElementChild;

    Array.from(outputContainer.children).forEach((child) => {
        if (!child || child.nodeType !== 1) {
            return;
        }

        // Constraint: Never fade the most recent output
        if (child === lastChild) {
            child.style.opacity = '1';
            return;
        }

        if (!child.style.transition) {
            child.style.transition = 'opacity 0.18s ease-out';
        }

        const relativeTop = child.offsetTop - viewTop;
        const relativeBottom = relativeTop + child.offsetHeight;

        if (relativeBottom <= 0) {
            child.style.opacity = '0';
            return;
        }

        if (relativeTop >= threshold) {
            child.style.opacity = '';
            return;
        }

        const visibleTop = Math.max(relativeTop, 0);
        const visibleBottom = Math.min(relativeBottom, threshold);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const coverage = Math.min(
            1,
            visibleHeight / Math.max(1, Math.min(child.offsetHeight, threshold))
        );
        const opacity = MIN_FADE_OPACITY + (1 - MIN_FADE_OPACITY) * coverage;
        child.style.opacity = opacity.toFixed(2);
    });
}

/**
 * Requests an update to the fade effect on the next animation frame.
 * @param {HTMLElement} outputContainer
 */
export function requestFadeUpdate(outputContainer) {
    if (fadeUpdateScheduled || !outputContainer) {
        return;
    }
    fadeUpdateScheduled = true;
    requestAnimationFrame(() => {
        fadeUpdateScheduled = false;
        updateOutputFade(outputContainer);
    });
}

/**
 * Initializes the fade effect for the given container.
 * Sets up scroll listeners and performs initial update.
 * @param {HTMLElement} outputContainer
 */
export function initFade(outputContainer) {
    if (!outputContainer) {
        return;
    }

    // Initial update
    requestFadeUpdate(outputContainer);

    // Attach scroll listener
    // We use an arrow function wrapper or bind, but requestFadeUpdate takes args.
    // To avoid creating new functions constantly, we can just use the exported function in the listener
    // if we closure the container.
    outputContainer.addEventListener('scroll', () => requestFadeUpdate(outputContainer));
}
