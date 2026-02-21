import { createGlowTrailAnimator } from '../../plugins/glowTrailAnimator.js';
import { ANIMATED_LINE_SETTINGS } from '../../config.js';
import { transactionState } from '../state.js';

const glowAnimator = createGlowTrailAnimator(ANIMATED_LINE_SETTINGS);

export const isAnimationEnabled = (chartKey) => glowAnimator.isEnabledFor(chartKey);

export function stopPerformanceAnimation() {
    glowAnimator.stop('performance');
}

export function stopContributionAnimation() {
    glowAnimator.stop('contribution');
}

export function stopFxAnimation() {
    glowAnimator.stop('fx');
}

export function stopPeAnimation() {
    glowAnimator.stop('pe');
}

export function stopConcentrationAnimation() {
    glowAnimator.stop('concentration');
}

export function stopYieldAnimation() {
    glowAnimator.stop('yield');
}

export function schedulePerformanceAnimation(chartManager) {
    if (!isAnimationEnabled('performance')) {
        glowAnimator.stop('performance');
        return;
    }
    glowAnimator.schedule('performance', chartManager, {
        isActive: () => transactionState.activeChart === 'performance',
    });
}

export function scheduleContributionAnimation(chartManager) {
    if (!isAnimationEnabled('contribution')) {
        glowAnimator.stop('contribution');
        return;
    }
    glowAnimator.schedule('contribution', chartManager, {
        isActive: () => transactionState.activeChart === 'contribution',
    });
}

export function scheduleFxAnimation(chartManager) {
    if (!isAnimationEnabled('fx')) {
        glowAnimator.stop('fx');
        return;
    }
    glowAnimator.schedule('fx', chartManager, {
        isActive: () => transactionState.activeChart === 'fx',
    });
}

export function schedulePeAnimation(chartManager) {
    if (!isAnimationEnabled('pe')) {
        glowAnimator.stop('pe');
        return;
    }
    glowAnimator.schedule('pe', chartManager, {
        isActive: () => transactionState.activeChart === 'pe',
    });
}

export function scheduleConcentrationAnimation(chartManager) {
    if (!isAnimationEnabled('concentration')) {
        glowAnimator.stop('concentration');
        return;
    }
    glowAnimator.schedule('concentration', chartManager, {
        isActive: () => transactionState.activeChart === 'concentration',
    });
}

export function scheduleYieldAnimation(chartManager) {
    if (!isAnimationEnabled('yield')) {
        glowAnimator.stop('yield');
        return;
    }
    glowAnimator.schedule('yield', chartManager, {
        isActive: () => transactionState.activeChart === 'yield',
    });
}

export function advancePerformanceAnimation(timestamp) {
    if (!isAnimationEnabled('performance')) {
        return 0;
    }
    return glowAnimator.advance('performance', timestamp);
}

export function advanceContributionAnimation(timestamp) {
    if (!isAnimationEnabled('contribution')) {
        return 0;
    }
    return glowAnimator.advance('contribution', timestamp);
}

export function advanceFxAnimation(timestamp) {
    if (!isAnimationEnabled('fx')) {
        return 0;
    }
    return glowAnimator.advance('fx', timestamp);
}

export function advancePeAnimation(timestamp) {
    if (!isAnimationEnabled('pe')) {
        return 0;
    }
    return glowAnimator.advance('pe', timestamp);
}

export function advanceConcentrationAnimation(timestamp) {
    if (!isAnimationEnabled('concentration')) {
        return 0;
    }
    return glowAnimator.advance('concentration', timestamp);
}

export function advanceYieldAnimation(timestamp) {
    if (!isAnimationEnabled('yield')) {
        return 0;
    }
    return glowAnimator.advance('yield', timestamp);
}

// Note: The signature here historically used wrong parameter names. It expects:
// drawSeriesGlow(ctx, seriesObj, drawOptions)
export function drawSeriesGlow(ctx, series, drawOptions) {
    glowAnimator.drawSeriesGlow(ctx, series, drawOptions);
}
