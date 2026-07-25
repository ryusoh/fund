/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'no-circular',
            comment: 'Circular deps make modules untestable in isolation (docs/agentic-quality-gates.md §3)',
            severity: 'error',
            from: {},
            to: { circular: true },
        },
        {
            name: 'no-cross-page-imports',
            comment: 'AGENTS.md non-negotiable #6: page-scoped changes must not leak to other pages',
            severity: 'error',
            from: { path: '^js/pages/([^/]+)/' },
            to: { path: '^js/pages/', pathNot: '^js/pages/$1/' },
        },
        {
            name: 'not-to-vendor',
            comment: 'vendor code is loaded via the import map (@vendor/), never imported directly',
            severity: 'error',
            from: { pathNot: '^(js/vendor|assets/vendor)' },
            to: { path: '^(js/vendor|assets/vendor)' },
        },
    ],
    options: {
        // alias resolution for @js/ @ui/ @utils/ … (import-map mirror)
        tsConfig: { fileName: 'jsconfig.json' },
        doNotFollow: { path: 'node_modules' },
        exclude: { path: '^(js/vendor|js/ui/cal-heatmap-src)' },
        // repo has .ts sources (cal-heatmap-src) but no typescript <7 for depcruise
        // to consume; they are excluded above and covered by verify-calendar-build.
    },
};
