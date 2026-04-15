import { MARQUEE_CONFIG } from '../config.js';

export function initMarquee() {
    if (typeof window === 'undefined' || !window.gsap || !MARQUEE_CONFIG.enabled) {
        return;
    }
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
        return;
    }
    const mWrappers = document.querySelectorAll('.marquee-container');
    const multiplier = MARQUEE_CONFIG.sizeMultiplier || 1;
    mWrappers.forEach((wrapper) => {
        const content = wrapper.querySelector('.marquee-content');
        if (!content) {
            return;
        }
        if (multiplier !== 1) {
            content.style.fontSize = `${multiplier * 100}%`;
        }
        const clone = content.cloneNode(true);
        wrapper.appendChild(clone);
        const configDirection = MARQUEE_CONFIG.direction || 1;
        const elementDirection = wrapper.classList.contains('marquee-right') ? 1 : -1;
        const direction = configDirection * elementDirection;
        window.gsap.to(wrapper.children, {
            xPercent: -100 * direction,
            ease: 'none',
            duration: MARQUEE_CONFIG.animationDuration || 20,
            repeat: -1,
            modifiers: {
                xPercent: window.gsap.utils.wrap(-100, 0),
            },
        });
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMarquee);
} else {
    initMarquee();
}
