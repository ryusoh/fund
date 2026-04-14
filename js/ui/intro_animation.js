export function initIntroAnimation() {
    if (typeof window === 'undefined' || !window.gsap) {
        return;
    }

    // Check if played this session
    try {
        if (window.sessionStorage.getItem('introPlayed')) {
            return;
        }
    } catch (e) {
        // Ignore storage errors
    }

    const body = document.body;
    body.classList.add('is-loading');

    // Create DOM elements
    const overlay = document.createElement('div');
    overlay.className = 'intro-overlay';

    const counter = document.createElement('div');
    counter.className = 'intro-counter';
    counter.textContent = '0%';

    overlay.appendChild(counter);
    body.appendChild(overlay);

    // Initial setup for existing UI elements to animate in
    const navContainers = document.querySelectorAll('nav.container, .nav-container');
    const footer = document.querySelector('footer');
    const quantumWidget = document.querySelector('.quantum-widget');

    if (navContainers.length) {
        window.gsap.set(navContainers, { y: -50, opacity: 0 });
    }
    if (footer) {
        window.gsap.set(footer, { y: 50, opacity: 0 });
    }
    if (quantumWidget) {
        window.gsap.set(quantumWidget, { scale: 0.8, opacity: 0 });
    }

    // Counter animation object
    const counterData = { val: 0 };

    const tl = window.gsap.timeline({
        onComplete: () => {
            body.classList.remove('is-loading');
            overlay.remove();
            try {
                window.sessionStorage.setItem('introPlayed', 'true');
            } catch (e) {
                // Ignore
            }
        },
    });

    tl.to(counterData, {
        val: 100,
        duration: 2,
        ease: 'power3.inOut',
        onUpdate: () => {
            counter.textContent = `${Math.round(counterData.val)}%`;
        },
    })
        .to(counter, {
            opacity: 0,
            duration: 0.4,
            ease: 'power2.inOut',
        })
        .to(overlay, {
            yPercent: -100,
            duration: 1,
            ease: 'power4.inOut',
        })
        // Stagger in elements
        .to(
            navContainers,
            {
                y: 0,
                opacity: 1,
                duration: 0.8,
                ease: 'power3.out',
                stagger: 0.1,
            },
            '-=0.6'
        )
        .to(
            footer,
            {
                y: 0,
                opacity: 1,
                duration: 0.8,
                ease: 'power3.out',
            },
            '-=0.6'
        )
        .to(
            quantumWidget,
            {
                scale: 1,
                opacity: 1,
                duration: 1,
                ease: 'back.out(1.5)',
            },
            '-=0.8'
        );
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIntroAnimation);
} else {
    initIntroAnimation();
}
