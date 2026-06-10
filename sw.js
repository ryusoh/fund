/* Service worker for Fund.
 *
 * Strategy summary:
 *   - Fund data (anything under /data/): network first so figures stay fresh,
 *     with cache fallback for offline.
 *   - Images & fonts: cache first (immutable-ish, speed priority).
 *   - HTML, CSS, JS: stale-while-revalidate — serve the cached copy instantly
 *     for app-like navigation between pages, refresh the cache in the
 *     background so the next visit picks up deploys.
 */
const CACHE_NAME = 'fund-cache-2026-06-09a';
const CORE_ASSETS = [
    './',
    './index.html',
    './position/',
    './calendar/',
    './terminal/',
    './css/base.css',
    './css/layout.css',
    './css/main_index.css',
    './css/container.css',
    './css/table.css',
    './css/toggle.css',
    './css/calendar.css',
    './css/perf.css',
    './css/cursor.css',
    './css/marquee.css',
    './css/terminal/base.css',
    './css/terminal/terminal.css',
    './css/terminal/table.css',
    './css/terminal/chart.css',
    './css/terminal/responsive.css',
    './js/ui/scroll_control.js',
    './js/ui/nav_prefetch.js',
    './js/ui/nav_current_page.js',
    './js/ui/icon_font_ready.js',
    './js/ui/currencyBootstrap.js',
    './js/ui/video_warmup.js',
    './js/vendor/gsap.min.js',
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

const putInCache = (req, res) => {
    const resClone = res.clone();
    return caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
};

const fetchAndCache = (req) => {
    return fetch(req).then((res) => {
        if (isValidResponse(res, req)) {
            putInCache(req, res);
        }
        return res;
    });
};

const cacheFirst = (req) => {
    return caches.match(req, { ignoreVary: true }).then((cached) => {
        if (cached) {
            return cached;
        }
        return fetchAndCache(req);
    });
};

const networkFirst = (req) => {
    return fetchAndCache(req).catch(() => caches.match(req, { ignoreVary: true }));
};

const staleWhileRevalidate = (event, req) => {
    return caches.match(req, { ignoreVary: true }).then((cached) => {
        const refresh = fetchAndCache(req);
        if (cached) {
            // Serve instantly; keep the worker alive until the refresh settles.
            event.waitUntil(refresh.catch(() => undefined));
            return cached;
        }
        return refresh.catch(() => caches.match(req, { ignoreVary: true }));
    });
};

self.addEventListener('fetch', (event) => {
    const req = event.request;

    if (req.method !== 'GET') {
        return;
    }

    const url = new URL(req.url);

    // Only handle same-origin requests
    if (url.origin !== self.location.origin) {
        return;
    }

    // Media range requests (e.g. iOS video) must hit the network untouched:
    // serving a cached 200 to a range request breaks playback.
    if (req.headers.has('range')) {
        return;
    }

    // Fund data is regenerated daily — always prefer the network for it.
    if (url.pathname.includes('/data/')) {
        event.respondWith(networkFirst(req));
        return;
    }

    const isImmutable =
        req.destination === 'image' ||
        req.destination === 'font' ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.woff2');

    if (isImmutable) {
        event.respondWith(cacheFirst(req));
    } else {
        // Documents, styles, scripts: instant from cache, refreshed in background.
        event.respondWith(staleWhileRevalidate(event, req));
    }
});
