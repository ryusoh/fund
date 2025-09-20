/* istanbul ignore file */
/* Simple <img> fallback: looks for data-fallbacks='["url1","url2",...]' */
(function () {
    try {
        function attach(el) {
            const listAttr = el.getAttribute('data-fallbacks');
            if (!listAttr) {
                return;
            }
            let list;
            try {
                list = JSON.parse(listAttr);
            } catch {
                list = [];
            }
            if (!Array.isArray(list) || list.length === 0) {
                return;
            }
            el.classList.remove('is-fallback-ready');
            let i = 0;
            function tryNext() {
                if (i >= list.length) {
                    return;
                }
                el.src = list[i++];
            }
            el.addEventListener('load', function onLoad() {
                el.classList.add('is-fallback-ready');
            });
            el.addEventListener('error', function () {
                tryNext();
            });
            // If current src fails, onerror will advance; ensure first URL is current
            if (!el.src || el.src !== list[0]) {
                el.src = list[0];
            } else if (el.complete && el.naturalWidth > 0) {
                el.classList.add('is-fallback-ready');
            }
        }
        const imgs = document.querySelectorAll('img[data-fallbacks]');
        for (let j = 0; j < imgs.length; j++) {
            attach(imgs[j]);
        }
    } catch {}
})();
