function isLocalDevelopment(hostname) {
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return true;
    }
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) {
        return true;
    }

    // Check for 172.16.x.x to 172.31.x.x
    if (hostname.startsWith('172.')) {
        const secondOctet = parseInt(hostname.split('.')[1], 10);
        if (secondOctet >= 16 && secondOctet <= 31) {
            return true;
        }
    }
    return false;
}

function getHostname() {
    const forcedHostname =
        typeof window !== 'undefined' && typeof window.__SW_FORCE_SW_HOSTNAME__ === 'string'
            ? window.__SW_FORCE_SW_HOSTNAME__
            : null;
    return forcedHostname || window.location.hostname;
}

(function () {
    try {
        // Skip service worker registration on local development addresses
        const hostname = getHostname();
        if (isLocalDevelopment(hostname) || !('serviceWorker' in navigator)) {
            return;
        }

        const script = document.currentScript;
        const swPath = (script && script.getAttribute('data-sw-path')) || './sw.js';
        const scope = (script && script.getAttribute('data-sw-scope')) || './';
        window.addEventListener('load', function () {
            try {
                navigator.serviceWorker.register(swPath, { scope }).catch(function (error) {
                    // eslint-disable-next-line no-console
                    console.warn('Service worker registration failed:', error);
                });
            } catch (error) {
                // eslint-disable-next-line no-console
                console.warn('Caught exception calling service worker register:', error);
                /* no-op */
            }
        });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Caught exception initializing service worker:', error);
        /* no-op */
    }
})();
