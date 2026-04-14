export function initTiltEffect() {
    if (typeof window === 'undefined' || !window.gsap) {
        return;
    }
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
        return;
    }
    const tiltContainers = document.querySelectorAll('nav.container, .quantum-widget');
    tiltContainers.forEach(container => {
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
                transformPerspective: 1000,
                duration: 0.5,
                ease: 'power2.out'
            });
        });
        container.addEventListener('mouseleave', () => {
            window.gsap.to(container, {
                rotateX: 0,
                rotateY: 0,
                duration: 1,
                ease: 'elastic.out(1, 0.3)'
            });
        });
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTiltEffect);
} else {
    initTiltEffect();
}
