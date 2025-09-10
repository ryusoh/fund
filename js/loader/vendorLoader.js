/* istanbul ignore file */
/* Load third-party vendor CSS/JS with fallbacks (e.g., Font Awesome) */
(function () {
    try {
        if (!window.CDNLoader) {return;}
        // Font Awesome 4.7 CSS
        const fontAwesome = [
            'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css',
            'https://unpkg.com/font-awesome@4.7.0/css/font-awesome.min.css',
            'https://cdn.bootcdn.net/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css',
            'https://cdn.baomitu.com/font-awesome/4.7.0/css/font-awesome.min.css',
        ];
        window.CDNLoader.preconnect([
            'https://cdn.jsdelivr.net',
            'https://unpkg.com',
            'https://cdn.bootcdn.net',
            'https://cdn.baomitu.com',
        ]);
        window.CDNLoader.loadCssWithFallback(fontAwesome);
    } catch {}
})();
