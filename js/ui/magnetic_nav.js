export function initMagneticNav() {
    if (typeof window === 'undefined' || !window.gsap) {
        return;
    }

    // Check for touch devices - usually magnetic hover feels bad on touch
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
        return;
    }

    // Target nav elements and footer icons
    const magneticElements = document.querySelectorAll(
        '.container li, .nav-container li, footer a'
    );

    magneticElements.forEach((el) => {
        el.addEventListener('mousemove', (e) => {
            const rect = el.getBoundingClientRect();

            // Calculate center of element
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Calculate distance from center to cursor
            const distX = e.clientX - centerX;
            const distY = e.clientY - centerY;

            // Apply magnetic pull using GSAP
            // Strength of pull factor (lower = less pull)
            const strength = 0.4;

            window.gsap.to(el, {
                x: distX * strength,
                y: distY * strength,
                duration: 0.3,
                ease: 'power2.out',
            });

            // Pull the child element (e.g. <a> or <i>) slightly more for a parallax effect
            const child = el.querySelector('a, i');
            if (child) {
                window.gsap.to(child, {
                    x: distX * (strength * 1.5),
                    y: distY * (strength * 1.5),
                    duration: 0.3,
                    ease: 'power2.out',
                });
            }
        });

        el.addEventListener('mouseleave', () => {
            // Elastic snap back to origin
            window.gsap.to(el, {
                x: 0,
                y: 0,
                duration: 0.7,
                ease: 'elastic.out(1, 0.3)',
            });

            const child = el.querySelector('a, i');
            if (child) {
                window.gsap.to(child, {
                    x: 0,
                    y: 0,
                    duration: 0.7,
                    ease: 'elastic.out(1, 0.3)',
                });
            }
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMagneticNav);
} else {
    initMagneticNav();
}
