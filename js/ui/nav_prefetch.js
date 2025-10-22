(function () {
    'use strict';

    const PREFETCH_DELAY = 1800;
    const IDLE_TIMEOUT = 2000;
    const MEDIA_MANIFEST = {
        home: [
            { url: 'assets/mobile_bg.jpg', type: 'image' },
            { url: 'assets/mobile_bg.mp4', type: 'video' },
        ],
        position: [
            { url: 'assets/logos/anet.png', type: 'image' },
            { url: 'assets/logos/brk.png', type: 'image' },
            { url: 'assets/logos/geo.png', type: 'image' },
            { url: 'assets/logos/goog.png', type: 'image' },
            { url: 'assets/logos/oxy.png', type: 'image' },
            { url: 'assets/logos/pdd.png', type: 'image' },
            { url: 'assets/logos/vt.png', type: 'image' },
        ],
        calendar: [],
        terminal: [],
    };
    const CSS_BACKGROUND_SOURCES = {
        shared: ['css/base.css'],
        home: ['css/main_index.css'],
        calendar: ['css/calendar.css'],
        terminal: ['css/terminal/base.css'],
    };
    const BACKGROUND_URL_REGEX = /background(?:-image)?\s*:[^;{}]*url\(([^)]+)\)/gi;
    const ROUTE_SLUGS = {
        home: '',
        position: 'position/',
        calendar: 'calendar/',
        terminal: 'terminal/',
    };

    function normalizePath(pathname) {
        if (!pathname) {
            return '/';
        }
        let normalized = pathname.replace(/index\.html$/i, '');
        if (!normalized.endsWith('/')) {
            normalized += '/';
        }
        return normalized;
    }

    function getConnectionProfile() {
        const navConnection =
            navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const effectiveType = navConnection && navConnection.effectiveType;
        return {
            saveData: Boolean(navConnection && navConnection.saveData),
            slow: effectiveType === 'slow-2g' || effectiveType === '2g',
        };
    }

    function findAppBase() {
        const manifestLink = document.querySelector('link[rel="manifest"]');
        if (manifestLink) {
            try {
                const manifestUrl = new window.URL(
                    manifestLink.getAttribute('href'),
                    window.location.href
                );
                const manifestPath = manifestUrl.pathname;
                const marker = '/assets/manifest.webmanifest';
                const markerIndex = manifestPath.lastIndexOf(marker);
                if (markerIndex !== -1) {
                    return normalizePath(manifestPath.slice(0, markerIndex + 1));
                }
            } catch {
                // ignore and fall back
            }
        }

        return normalizePath(window.location.pathname.replace(/[^/]*$/, ''));
    }

    function buildRoutePaths(appBase) {
        const paths = {};
        Object.keys(ROUTE_SLUGS).forEach((key) => {
            const slug = ROUTE_SLUGS[key];
            if (!slug) {
                paths[key] = normalizePath(appBase);
            } else {
                const base = appBase.endsWith('/') ? appBase : `${appBase}/`;
                paths[key] = normalizePath(`${base}${slug}`);
            }
        });
        return paths;
    }

    function determineCurrentRoute(routePaths) {
        const current = normalizePath(window.location.pathname);
        return (
            Object.keys(routePaths).find((key) => routePaths[key] === current) ||
            (current === '/' ? 'home' : undefined)
        );
    }

    function resolveAssetUrl(appBase, asset) {
        if (!asset || !asset.url) {
            return undefined;
        }

        if (/^https?:\/\//i.test(asset.url)) {
            return asset.url;
        }

        const sanitized = asset.url.replace(/^\//, '');
        const base = appBase.endsWith('/') ? appBase : `${appBase}/`;
        return new window.URL(sanitized, `${window.location.origin}${base}`).href;
    }

    function queueFetchTask(url, queue, seen) {
        if (seen.has(url)) {
            return;
        }
        seen.add(url);
        queue.push(() => {
            let fetchUrl;
            try {
                fetchUrl = new window.URL(url);
            } catch {
                return undefined;
            }

            const isCrossOrigin = fetchUrl.origin !== window.location.origin;

            const options = {
                credentials: isCrossOrigin ? 'omit' : 'same-origin',
                cache: 'force-cache',
                redirect: 'follow',
            };

            if (isCrossOrigin) {
                options.mode = 'no-cors';
            }

            return fetch(fetchUrl.href, options).catch(() => undefined);
        });
    }

    function drainQueue(queue) {
        if (!queue.length) {
            return;
        }

        const runNext = () => {
            if (!queue.length) {
                return;
            }
            const task = queue.shift();
            Promise.resolve()
                .then(task)
                .catch(() => undefined)
                .finally(() => {
                    if (queue.length) {
                        if ('requestIdleCallback' in window) {
                            window.requestIdleCallback(runNext, { timeout: IDLE_TIMEOUT });
                        } else {
                            window.setTimeout(runNext, IDLE_TIMEOUT);
                        }
                    }
                });
        };

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(runNext, { timeout: IDLE_TIMEOUT });
        } else {
            window.setTimeout(runNext, PREFETCH_DELAY);
        }
    }

    function shouldSkipAsset(asset, connection) {
        if (!asset) {
            return true;
        }
        if (asset.type === 'video' && connection.slow) {
            return true;
        }
        if (asset.skipOnSlow && connection.slow) {
            return true;
        }
        return false;
    }

    function queueCssBackgrounds(routeKey, appBase, connection, queue, seen, tasks) {
        const files = CSS_BACKGROUND_SOURCES[routeKey];
        if (!files || !files.length) {
            return;
        }

        files.forEach((path) => {
            const cssUrl = resolveAssetUrl(appBase, { url: path });
            if (!cssUrl) {
                return;
            }

            const discoveryTask = fetchCssBackgrounds(cssUrl).then((urls) => {
                urls.forEach((assetUrl) => {
                    const asset = { url: assetUrl, type: 'image', skipOnSlow: true };
                    if (shouldSkipAsset(asset, connection)) {
                        return;
                    }
                    queueFetchTask(assetUrl, queue, seen);
                });
            });

            tasks.push(
                discoveryTask.catch(() => {
                    return undefined;
                })
            );
        });
    }

    function fetchCssBackgrounds(cssUrl) {
        return fetch(cssUrl, {
            credentials: 'same-origin',
            cache: 'force-cache',
            redirect: 'follow',
        })
            .then((res) => {
                if (!res || !res.ok) {
                    return [];
                }
                return res.text().then((text) => extractBackgroundUrls(text, cssUrl));
            })
            .catch(() => []);
    }

    function extractBackgroundUrls(cssText, cssUrl) {
        if (!cssText) {
            return [];
        }

        const urls = new Set();
        BACKGROUND_URL_REGEX.lastIndex = 0;

        let match;
        while ((match = BACKGROUND_URL_REGEX.exec(cssText))) {
            if (!match || match.length < 2) {
                continue;
            }

            let rawUrl = match[1].trim();
            if (!rawUrl) {
                continue;
            }

            rawUrl = rawUrl.replace(/^['"]|['"]$/g, '');

            if (!rawUrl || rawUrl.startsWith('data:')) {
                continue;
            }

            try {
                const resolved = new window.URL(rawUrl, cssUrl).href;
                urls.add(resolved);
            } catch {
                // Ignore invalid URLs
            }
        }

        return Array.from(urls);
    }

    function schedulePrefetch() {
        if (document.visibilityState === 'hidden') {
            return;
        }

        const connection = getConnectionProfile();
        if (connection.saveData) {
            return;
        }

        const appBase = findAppBase();
        const routePaths = buildRoutePaths(appBase);
        const currentRoute = determineCurrentRoute(routePaths);

        if (!currentRoute) {
            return;
        }

        const queue = [];
        const seen = new Set();
        const cssDiscoveryTasks = [];
        const normalizedCurrentPath =
            routePaths[currentRoute] || normalizePath(window.location.pathname);

        const navLinks = document.querySelectorAll('.container a[href], .nav-container a[href]');
        navLinks.forEach((link) => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#')) {
                return;
            }
            let resolved;
            try {
                resolved = new window.URL(href, window.location.href);
            } catch {
                return;
            }
            if (resolved.origin !== window.location.origin) {
                return;
            }
            if (normalizePath(resolved.pathname) === normalizedCurrentPath) {
                return;
            }
            queueFetchTask(resolved.href, queue, seen);
        });

        queueCssBackgrounds('shared', appBase, connection, queue, seen, cssDiscoveryTasks);

        Object.keys(routePaths)
            .filter((key) => key !== currentRoute)
            .forEach((key) => {
                const assets = MEDIA_MANIFEST[key];
                if (!assets || !assets.length) {
                    return;
                }
                assets.forEach((asset) => {
                    if (!asset || !asset.url) {
                        return;
                    }
                    if (shouldSkipAsset(asset, connection)) {
                        return;
                    }
                    const assetUrl = resolveAssetUrl(appBase, asset);
                    if (assetUrl) {
                        queueFetchTask(assetUrl, queue, seen);
                    }
                });

                queueCssBackgrounds(key, appBase, connection, queue, seen, cssDiscoveryTasks);
            });

        const finalizePrefetch = () => {
            if (!queue.length) {
                return;
            }
            window.setTimeout(() => {
                drainQueue(queue);
            }, PREFETCH_DELAY);
        };

        if (cssDiscoveryTasks.length) {
            const settleAll = Promise.allSettled
                ? Promise.allSettled(cssDiscoveryTasks)
                : Promise.all(cssDiscoveryTasks);
            settleAll.finally(finalizePrefetch);
        } else {
            finalizePrefetch();
        }
    }

    if (document.readyState === 'complete') {
        schedulePrefetch();
    } else {
        window.addEventListener('load', schedulePrefetch, { once: true });
    }
})();
