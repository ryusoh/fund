/* istanbul ignore file */
/* Ambient assets loader */
(function () {
    'use strict';

    function loadScript(src, defer) {
        const script = document.createElement('script');
        script.src = src;
        script.defer = !!defer;
        script.async = false; // Ensure sequential execution
        document.head.appendChild(script);
        return new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
        });
    }

    function loadCss(href) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    try {
        const prefersReduced =
            window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced || window.innerWidth < 1024) {
            return;
        }

        loadCss('./css/ambient/ambient.css');

        loadScript('./js/ambient/sketch.js')
            .then(() => loadScript('./js/ambient/config.js', true))
            .then(() => loadScript('./js/ambient/ambient.js', true))
            .catch(() => {
                // Ambient is optional
            });

        // eslint-disable-next-line no-unused-vars
    } catch (e) {
        // ignore
    }
})();
