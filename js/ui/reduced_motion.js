(function () {
    try {
        const mediaQuery =
            window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
        if (mediaQuery && mediaQuery.matches) {
            const video = document.querySelector('.video-background video');
            if (video) {
                video.removeAttribute('autoplay');
                video.pause();
            }
        }
    } catch {
        /* no-op */
    }
})();
