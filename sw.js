/* Simple service worker for Fund */
/* eslint-env serviceworker */
const CACHE_NAME = 'fund-cache-v1';
const CORE_ASSETS = [
    './',
    './index.html',
    './css/base.css',
    './css/layout.css',
    './css/main_index.css',
    './css/perf.css',
    './js/ui/scroll_control.js',
    './assets/banner.png',
    './assets/avatar_152x152.png',
    './assets/mobile_bg.jpg',
    './assets/vendor/css/font-awesome-4.7.0.min.css',
    './assets/vendor/fonts/fontawesome-webfont.woff2',
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

// Cache-first for static assets; network-first for others
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Only handle same-origin requests
    if (url.origin !== self.location.origin) {
        return;
    }

    const isStatic =
        req.destination === 'style' ||
        req.destination === 'script' ||
        req.destination === 'image' ||
        req.destination === 'font';

    if (isStatic) {
        event.respondWith(
            caches.match(req).then(
                (cached) =>
                    cached ||
                    fetch(req).then((res) => {
                        const resClone = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
                        return res;
                    })
            )
        );
    } else {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    const resClone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
                    return res;
                })
                .catch(() => caches.match(req))
        );
    }
});
