import { CALENDAR_BACKGROUND_EFFECT, CALENDAR_SELECTORS } from '@js/config.js';

let sweepNextTimer = null;
let sweepRemoveTimer = null;

/* istanbul ignore next */
export function stopBackgroundSweepEffect(selector = CALENDAR_SELECTORS.pageWrapper) {
    /* istanbul ignore next */
    if (typeof document === 'undefined') {
        return;
    }
    /* istanbul ignore next */
    if (sweepNextTimer) {
        clearTimeout(sweepNextTimer);
    }
    if (sweepRemoveTimer) {
        clearTimeout(sweepRemoveTimer);
    }
    sweepNextTimer = null;
    sweepRemoveTimer = null;
    const wrapper =
        typeof document.querySelector === 'function' ? document.querySelector(selector) : null;
    if (wrapper && wrapper.classList && typeof wrapper.classList.remove === 'function') {
        wrapper.classList.remove('sweeping');
    }
}

export function initBackgroundSweepEffect({
    selector = CALENDAR_SELECTORS.pageWrapper,
    effectConfig = CALENDAR_BACKGROUND_EFFECT,
} = {}) {
    /* istanbul ignore next */
    if (typeof document === 'undefined') {
        return { triggerSweep: () => {} };
    }
    stopBackgroundSweepEffect(selector);

    if (!effectConfig?.enabled) {
        return { triggerSweep: () => {} };
    }

    /* istanbul ignore next */
    const wrapper =
        typeof document.querySelector === 'function' ? document.querySelector(selector) : null;
    /* istanbul ignore next */
    if (!wrapper) {
        return { triggerSweep: () => {} };
    }

    /* istanbul ignore next */
    const { sweepDuration = 3, colors } = effectConfig;

    /* istanbul ignore next */
    if (wrapper.style && typeof wrapper.style.setProperty === 'function') {
        wrapper.style.setProperty('--optic-sweep-duration', `${sweepDuration}s`);
        /* istanbul ignore next */
        if (colors?.color1) {
            wrapper.style.setProperty('--optic-color-1', colors.color1);
        }
        /* istanbul ignore next */
        if (colors?.color2) {
            wrapper.style.setProperty('--optic-color-2', colors.color2);
        }
    }

    const triggerSweep = () => {
        if (!document.body || !document.body.contains(wrapper)) {
            return;
        }
        wrapper.classList.remove('sweeping');
        void wrapper.offsetWidth;
        wrapper.classList.add('sweeping');

        if (sweepRemoveTimer) {
            clearTimeout(sweepRemoveTimer);
        }
        /* istanbul ignore next */
        if (sweepNextTimer) {
            clearTimeout(sweepNextTimer);
        }

        sweepRemoveTimer = setTimeout(() => {
            wrapper.classList.remove('sweeping');
            sweepRemoveTimer = null;
        }, sweepDuration * 1000);
    };

    return { triggerSweep };
}
