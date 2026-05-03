
export function initScrollNarrative() {
    if (typeof window === 'undefined') {return;}

    // Set up scroll-linked theme changes
    const handleScroll = () => {
        const scrollY = window.scrollY;
        const vh = window.innerHeight;

        // Example: toggle themes based on scroll depth
        if (scrollY > vh * 1.5) {
            document.body.setAttribute('data-theme', 'light');
        } else if (scrollY > vh * 0.5) {
            document.body.setAttribute('data-theme', 'terminal');
        } else {
            document.body.removeAttribute('data-theme');
        }

        // Parallax or reveal effects can be tied to scrollY here
        // (Avoiding theatrical effects, keeping it to opacity or subtle transforms)
    };

    window.addEventListener('scroll', () => {
        // Debounce or throttle with requestAnimationFrame
        window.requestAnimationFrame(handleScroll);
    }, { passive: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollNarrative);
} else {
    initScrollNarrative();
}
