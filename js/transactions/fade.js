/**
 * Fade module handles the opacity fading effect for terminal output items
 * as they scroll out of view.
 */

const MIN_FADE_OPACITY = 0.2;
let fadeUpdateScheduled = false;
let preserveSecondLast = false;

export function setFadePreserveSecondLast(preserve) {
    preserveSecondLast = preserve;
}

function resetChildOpacities(outputContainer) {
    for (let i = 0; i < outputContainer.children.length; i++) {
        const child = outputContainer.children[i];
        if (child && child.nodeType === 1) {
            child.style.opacity = '1';
        }
    }
}

function calculateChildOpacity(child, viewTop, threshold) {
    if (!child.style.transition) {
        child.style.transition = 'opacity 0.18s ease-out';
    }

    const relativeTop = child.offsetTop - viewTop;
    const relativeBottom = relativeTop + child.offsetHeight;

    if (relativeBottom <= 0) {
        return '0';
    }

    if (relativeTop >= threshold) {
        return '';
    }

    const visibleTop = Math.max(relativeTop, 0);
    const visibleBottom = Math.min(relativeBottom, threshold);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const coverage = Math.min(
        1,
        visibleHeight / Math.max(1, Math.min(child.offsetHeight, threshold))
    );
    const opacity = MIN_FADE_OPACITY + (1 - MIN_FADE_OPACITY) * coverage;
    return opacity.toFixed(2);
}

function processFadeForChildren(outputContainer, viewTop, threshold) {
    const lastChild = outputContainer.lastElementChild;
    const secondLastChild = lastChild ? lastChild.previousElementSibling : null;
    const thirdLastChild = secondLastChild ? secondLastChild.previousElementSibling : null;

    for (let i = 0; i < outputContainer.children.length; i++) {
        const child = outputContainer.children[i];
        if (!child || child.nodeType !== 1) {
            continue;
        }

        if (
            child === lastChild ||
            (preserveSecondLast && (child === secondLastChild || child === thirdLastChild))
        ) {
            child.style.opacity = '1';
            continue;
        }

        child.style.opacity = calculateChildOpacity(child, viewTop, threshold);
    }
}

function updateOutputFade(outputContainer) {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        resetChildOpacities(outputContainer);
        return;
    }

    const viewHeight = outputContainer.clientHeight;
    if (viewHeight <= 0) {
        return;
    }

    const threshold = viewHeight * 0.25;
    const viewTop = outputContainer.scrollTop;

    processFadeForChildren(outputContainer, viewTop, threshold);
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
