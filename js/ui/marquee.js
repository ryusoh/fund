export function initMarquee() {
    if (typeof window === 'undefined' || !window.gsap) {
        return;
    }
    const mWrappers = document.querySelectorAll('.marquee-container');
    mWrappers.forEach((wrapper) => {
        const content = wrapper.querySelector('.marquee-content');
        if (!content) {
            return;
        }
        const clone = content.cloneNode(true);
        wrapper.appendChild(clone);
        const direction = wrapper.classList.contains('marquee-right') ? 1 : -1;
        window.gsap.to(wrapper.children, {
            xPercent: -100 * direction,
            ease: 'none',
            duration: 20,
            repeat: -1,
            modifiers: {
                xPercent: window.gsap.utils.wrap(-100, 0)
            }
        });
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMarquee);
} else {
    initMarquee();
}
