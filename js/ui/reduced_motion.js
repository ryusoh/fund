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
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Caught exception:', error);
        /* no-op */
    }
})();
