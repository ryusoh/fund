function isLocalHostname(hostname) {
    const localPrefixes = [
        '10.',
        '192.168.',
        '172.16.',
        '172.17.',
        '172.18.',
        '172.19.',
        '172.20.',
        '172.21.',
        '172.22.',
        '172.23.',
        '172.24.',
        '172.25.',
        '172.26.',
        '172.27.',
        '172.28.',
        '172.29.',
        '172.30.',
        '172.31.',
    ];
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        localPrefixes.some((prefix) => hostname.startsWith(prefix))
    );
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
        if (isLocalHostname(getHostname())) {
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
                navigator.serviceWorker
                    .register(swPath, { scope, updateViaCache: 'none' })
                    .then(function (registration) {
                        // Force an immediate update check so iOS PWA always picks up new SW
                        registration.update().catch(function (error) {
                            // eslint-disable-next-line no-console
                            console.warn('Service worker update check failed:', error);
                        });
                    })
                    .catch(function (error) {
                        // eslint-disable-next-line no-console
                        console.warn('Service worker registration failed:', error);
                    });
            } catch (error) {
                // eslint-disable-next-line no-console
                console.warn('Caught exception calling service worker register:', error);
            }
        });
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Caught exception initializing service worker:', error);
    }
})();
