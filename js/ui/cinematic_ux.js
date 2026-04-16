// Cinematic UX enhancements inspired by high-end portfolio sites
// Injects film grain noise, handles staggered column page transitions, and enforces vertical orientation on mobile.

export function initCinematicUX() {
    if (typeof document === 'undefined') {return;}

    // 1. Inject Film Grain Noise Overlay
    if (!document.querySelector('.cinematic-noise-overlay')) {
        const noise = document.createElement('div');
        noise.className = 'cinematic-noise-overlay';
        document.body.appendChild(noise);
    }

    // 2. Inject Mobile Landscape Blocker
    if (!document.querySelector('.mob-landscape-block')) {
        const blocker = document.createElement('div');
        blocker.className = 'mob-landscape-block';
        blocker.innerHTML = `
            <div class="rotate-icon"><i class="fa fa-mobile" aria-hidden="true"></i></div>
            <div class="text-title-reg-mona">
                Please rotate your device,<br/>
                <span class="text-title-reg-brier">This is a vertical drive.</span>
            </div>
        `;
        document.body.appendChild(blocker);
    }

    // 3. Staggered Column Page Transitions
    const COLUMNS_COUNT = 5;
    let transitionWrapper = document.querySelector('.transition-columns-wrapper');
    let columns = [];

    if (!transitionWrapper) {
        transitionWrapper = document.createElement('div');
        transitionWrapper.className = 'transition-columns-wrapper';
        for (let i = 0; i < COLUMNS_COUNT; i++) {
            const col = document.createElement('div');
            col.className = 'transition-column';
            transitionWrapper.appendChild(col);
            columns.push(col);
        }
        document.body.appendChild(transitionWrapper);
    } else {
        columns = Array.from(transitionWrapper.querySelectorAll('.transition-column'));
    }

    // Reset function for page load and bfcache restorations
    const resetTransition = () => {
        if (window.gsap) {
            window.gsap.set(columns, { scaleY: 1, transformOrigin: 'top' });
            window.gsap.to(columns, {
                scaleY: 0,
                transformOrigin: 'bottom',
                duration: 0.8,
                stagger: 0.1,
                ease: 'power3.inOut',
                delay: 0.2
            });
        }
    };

    // Initial page load reveal
    resetTransition();

    // Handle BFCache (Back-Forward Cache) to unhide the screen if user presses back button
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            resetTransition();
        }
    });

    // Intercept internal link clicks to trigger outro animation
    document.addEventListener('click', (e) => {
        // Allow Cmd/Ctrl/Shift + Click to work natively
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {return;}

        const link = e.target.closest('a');
        if (!link) {return;}

        const href = link.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) {return;}
        if (link.target === '_blank') {return;}

        // Prevent default navigation
        e.preventDefault();

        if (window.gsap && columns.length > 0) {
            // Animate in (cover screen)
            window.gsap.to(columns, {
                scaleY: 1,
                transformOrigin: 'top',
                duration: 0.6,
                stagger: 0.08,
                ease: 'power3.inOut',
                onComplete: () => {
                    window.location.href = href;
                }
            });
        } else {
            // Fallback if GSAP is missing
            window.location.href = href;
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCinematicUX);
} else {
    initCinematicUX();
}
