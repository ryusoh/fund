(function () {
    const READY_CLASS = 'icon-font-ready';
    const FALLBACK_DELAY = 4000;

    function markReady() {
        if (!document.body) {
            return;
        }
        document.body.classList.add(READY_CLASS);
    }

    function init() {
        if (!document.body) {
            return markReady();
        }

        const fallbackTimer = window.setTimeout(markReady, FALLBACK_DELAY);

        if (document.fonts && document.fonts.check && document.fonts.check('1em FontAwesome')) {
            window.clearTimeout(fallbackTimer);
            markReady();
            return;
        }

        if (document.fonts && document.fonts.load) {
            Promise.all([
                document.fonts.load('1em FontAwesome'),
                document.fonts.ready.catch(function () {
                    return undefined;
                }),
            ])
                .then(function () {
                    window.clearTimeout(fallbackTimer);
                    markReady();
                })
                .catch(function () {
                    window.clearTimeout(fallbackTimer);
                    markReady();
                });
        } else {
            window.clearTimeout(fallbackTimer);
            markReady();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
