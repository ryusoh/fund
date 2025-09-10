/* istanbul ignore file */
/* Ambient assets loader using CDNLoader (no modules) */
(function () {
    try {
        const prefersReduced =
            window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced || window.innerWidth < 1024) {
            return;
        }
        if (!window.CDNLoader) {
            return;
        }

        // Host structure kept; just multiple bases for reliability
        const BASES = {
            css: [
                'https://cdn.jsdelivr.net/gh/ryusoh/host@master',
                'https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/master',
                'https://gcore.jsdelivr.net/gh/ryusoh/host@master',
                'https://fastly.jsdelivr.net/gh/ryusoh/host@master',
            ],
            vendor: [
                'https://cdn.jsdelivr.net/gh/ryusoh/host@ambient-v1.6',
                'https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/ambient-v1.6',
                'https://gcore.jsdelivr.net/gh/ryusoh/host@ambient-v1.6',
                'https://fastly.jsdelivr.net/gh/ryusoh/host@ambient-v1.6',
            ],
            ambient: [
                'https://cdn.jsdelivr.net/gh/ryusoh/host@ambient-v1.7',
                'https://ghproxy.net/https://raw.githubusercontent.com/ryusoh/host/ambient-v1.7',
                'https://gcore.jsdelivr.net/gh/ryusoh/host@ambient-v1.7',
                'https://fastly.jsdelivr.net/gh/ryusoh/host@ambient-v1.7',
            ],
        };
        const PATHS = {
            css: '/shared/css/ambient/v1/ambient.css',
            sketch: '/shared/js/vendor/sketch.js',
            config: '/shared/js/ambient/v1/config/default.js',
            ambient: '/shared/js/ambient/v1/ambient.js',
        };
        function urlsFor(bases, path) {
            const out = [];
            for (let i = 0; i < bases.length; i++) {
                out.push(bases[i] + path);
            }
            return out;
        }

        window.CDNLoader.preconnect([
            'https://cdn.jsdelivr.net',
            'https://ghproxy.net',
            'https://gcore.jsdelivr.net',
            'https://fastly.jsdelivr.net',
        ]);

        window.CDNLoader.loadCssWithFallback(urlsFor(BASES.css, PATHS.css))
            .then(function () {
                return window.CDNLoader.loadScriptSequential(urlsFor(BASES.vendor, PATHS.sketch), {
                    defer: false,
                });
            })
            .then(function () {
                return window.CDNLoader.loadScriptSequential(urlsFor(BASES.ambient, PATHS.config), {
                    defer: true,
                });
            })
            .then(function () {
                return window.CDNLoader.loadScriptSequential(
                    urlsFor(BASES.ambient, PATHS.ambient),
                    { defer: true }
                );
            })
            .catch(function () {
                // Ambient is optional
            });
    } catch {}
})();
