(function () {
    try {
        // Skip service worker registration on local development addresses
        const hostname = window.location.hostname;
        const isLocalDev =
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.startsWith('10.') ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('172.16.') ||
            hostname.startsWith('172.17.') ||
            hostname.startsWith('172.18.') ||
            hostname.startsWith('172.19.') ||
            hostname.startsWith('172.20.') ||
            hostname.startsWith('172.21.') ||
            hostname.startsWith('172.22.') ||
            hostname.startsWith('172.23.') ||
            hostname.startsWith('172.24.') ||
            hostname.startsWith('172.25.') ||
            hostname.startsWith('172.26.') ||
            hostname.startsWith('172.27.') ||
            hostname.startsWith('172.28.') ||
            hostname.startsWith('172.29.') ||
            hostname.startsWith('172.30.') ||
            hostname.startsWith('172.31.');

        if (isLocalDev) {
            return;
        }

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
