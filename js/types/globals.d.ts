// Type-only ambient declarations for environment globals used in dual
// (browser + Node/test) code paths. Never shipped — consumed by `tsc --checkJs`
// only. See docs/js-typing-strategy.md.

/** Minimal Node `process` surface used by isDevelopment() in js/utils/logger.js. */
declare const process: {
    env: Record<string, string | undefined>;
};
