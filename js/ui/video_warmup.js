(function () {
    'use strict';

    const globalScope = typeof window !== 'undefined' ? window : globalThis;
    const CACHE_NAME = 'fund-cache-v1';
    const WARMUP_DELAY = 2200;
    const HAVE_ENOUGH_DATA =
        (globalScope.HTMLMediaElement && globalScope.HTMLMediaElement.HAVE_ENOUGH_DATA) || 4;

    function isConnectionSlow() {
        const navConnection =
            navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!navConnection) {
            return false;
        }

        const effectiveType = navConnection.effectiveType;
        if (navConnection.saveData) {
            return true;
        }

        return effectiveType === 'slow-2g' || effectiveType === '2g';
    }

    function scheduleWarmup(video) {
        if (!video || video.dataset.videoWarmupScheduled === 'true') {
            return;
        }

        video.dataset.videoWarmupScheduled = 'true';

        const warmup = () => {
            if (!video.isConnected) {
                return;
            }

            if (video.readyState >= HAVE_ENOUGH_DATA) {
                return;
            }

            const src = video.currentSrc || video.getAttribute('src');
            if (!src) {
                return;
            }

            const absoluteUrl = new globalScope.URL(src, window.location.href).href;

            if ('caches' in globalScope && globalScope.caches) {
                globalScope.caches
                    .match(absoluteUrl)
                    .then((cached) => {
                        if (cached) {
                            return undefined;
                        }
                        return globalScope.caches
                            .open(CACHE_NAME)
                            .then((cache) => cache.add(absoluteUrl))
                            .catch(() => warmFetchFallback(absoluteUrl));
                    })
                    .catch(() => warmFetchFallback(absoluteUrl));
            } else {
                warmFetchFallback(absoluteUrl);
            }

            if (video.preload !== 'auto') {
                video.preload = 'auto';
                try {
                    video.load();
                } catch {
                    // Ignore playback readiness errors; fallback will still cache the source
                }
            }
        };

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(warmup, { timeout: WARMUP_DELAY });
        } else {
            window.setTimeout(warmup, WARMUP_DELAY);
        }
    }

    function warmFetchFallback(url) {
        fetch(url, {
            credentials: 'same-origin',
            cache: 'force-cache',
            redirect: 'follow',
        }).catch(() => undefined);
    }

    function init() {
        if (isConnectionSlow()) {
            return;
        }

        const video = document.querySelector('.video-background video');
        if (!video) {
            return;
        }

        scheduleWarmup(video);
    }

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init, { once: true });
    }
})();
