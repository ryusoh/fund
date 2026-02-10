/* Simple service worker for Fund */
const CACHE_NAME = 'fund-cache-v3';
const CORE_ASSETS = [
    './',
    './index.html',
    './css/base.css',
    './css/layout.css',
    './css/main_index.css',
    './css/perf.css',
    './js/ui/scroll_control.js',
    './js/ui/nav_prefetch.js',
    './js/ui/video_warmup.js',
    './assets/vendor/css/font-awesome-4.7.0.min.css',
    './assets/vendor/fonts/fontawesome-webfont.woff2',
    './assets/vendor/fonts/fontawesome-webfont.woff',
    './assets/vendor/fonts/fontawesome-webfont.ttf',
    './assets/banners/banner.png',
    './assets/icons/icon-180.png',
    './assets/mobile_bg.jpg',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys.map((k) => {
                        if (k !== CACHE_NAME) {
                            return caches.delete(k);
                        }
                    })
                )
            )
            .then(() => self.clients.claim())
    );
});

// Helper to check if a response is a valid clean response we want to cache
const isValidResponse = (res, req) => {
    return (
        res &&
        res.ok &&
        res.status === 200 &&
        res.type === 'basic' &&
        !req.headers.has('range') &&
        !res.headers.get('Content-Range')
    );
};

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Only handle same-origin requests
    if (url.origin !== self.location.origin) {
        return;
    }

    // Determine strategy based on file type
    // Images & Fonts: Cache First (Immutable-ish, speed priority)
    // HTML, JS, CSS: Network First (Mutable, freshness priority)
    const isImmutable =
        req.destination === 'image' ||
        req.destination === 'font' ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.woff2');

    if (isImmutable) {
        // --- CACHE FIRST ---
        event.respondWith(
            caches.match(req).then((cached) => {
                if (cached) {
                    return cached;
                }
                return fetch(req).then((res) => {
                    if (isValidResponse(res, req)) {
                        const resClone = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
                    }
                    return res;
                });
            })
        );
    } else {
        // --- NETWORK FIRST ---
        // (Includes style, script, document, and everything else)
        event.respondWith(
            fetch(req)
                .then((res) => {
                    if (isValidResponse(res, req)) {
                        const resClone = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
                    }
                    return res;
                })
                .catch(() => {
                    // Network failed, try cache
                    return caches.match(req);
                })
        );
    }
});
