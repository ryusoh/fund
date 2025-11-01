// Shared default configuration for Ambient v1
// Sites can rely on this for consistent visuals without local overrides.
// To tweak per-site, include a local ambient.config.js after this file.
(function () {
    try {
        // Defaults aligned with ryusoh.github.io/js/ambient.config.js
        window.AMBIENT_CONFIG = Object.assign(
            {
                enabled: true,
                minWidth: 1024,
                maxParticles: 300,
                densityDivisor: 20000,
                radius: { min: 1.0, max: 8.0 },
                alpha: { min: 0.1, max: 0.6 },
                speed: 0.6,
                zIndex: 1,
                blend: 'screen',
                // If false, do not disable effect when user prefers-reduced-motion.
                // Set to true to respect OS setting and disable motion by default.
                respectReducedMotion: false,
            },
            window.AMBIENT_CONFIG || {}
        );

        // eslint-disable-next-line no-unused-vars
    } catch (e) {}
})();
