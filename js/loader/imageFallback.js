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
            let i = 0;
            function tryNext() {
                if (i >= list.length) {
                    return;
                }
                el.src = list[i++];
            }
            el.addEventListener('error', function () {
                tryNext();
            });
            // If current src fails, onerror will advance; ensure first URL is current
            if (!el.src || el.src !== list[0]) {
                el.src = list[0];
            }
        }
        const imgs = document.querySelectorAll('img[data-fallbacks]');
        for (let j = 0; j < imgs.length; j++) {
            attach(imgs[j]);
        }
    } catch {}
})();
