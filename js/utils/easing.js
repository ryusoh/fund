// Easing function for smoother animations
/**
 * @param {number} x
 * @returns {number}
 */
export function easeInOutSine(x) {
    const val = -(Math.cos(Math.PI * x) - 1) / 2;
    return val === 0 ? 0 : val;
}
