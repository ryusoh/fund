(function () {
    try {
        if (!('serviceWorker' in navigator)) {
            return;
        }
        const script = document.currentScript;
        const swPath = (script && script.getAttribute('data-sw-path')) || './sw.js';
        const scope = (script && script.getAttribute('data-sw-scope')) || './';
        window.addEventListener('load', function () {
            try {
                navigator.serviceWorker.register(swPath, { scope }).catch(function () {});
            } catch {
                /* no-op */
            }
        });
    } catch {
        /* no-op */
    }
})();
