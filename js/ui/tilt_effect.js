import { TILT_EFFECT } from '../config.js';

export function initTiltEffect() {
    if (!TILT_EFFECT.enabled || typeof window === 'undefined' || !window.gsap) {
        return;
    }
    const isTouchOnly =
        ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
        !window.matchMedia('(pointer: fine)').matches;
    if (isTouchOnly) {
        return;
    }
    const tiltContainers = document.querySelectorAll(
        'nav.container, .quantum-widget, .marquee-container'
    );
    tiltContainers.forEach((container) => {
        window.gsap.set(container, { transformPerspective: 1000, transformStyle: 'preserve-3d' });
        container.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -10;
            const rotateY = ((x - centerX) / centerX) * 10;
            window.gsap.to(container, {
                rotateX: rotateX,
                rotateY: rotateY,
                duration: 0.5,
                ease: 'power3.out',
                overwrite: true,
            });
        });
        container.addEventListener('mouseleave', () => {
            window.gsap.to(container, {
                rotateX: 0,
                rotateY: 0,
                duration: 1,
                ease: 'elastic.out(1, 0.3)',
                overwrite: true,
            });
        });
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTiltEffect);
} else {
    initTiltEffect();
}
