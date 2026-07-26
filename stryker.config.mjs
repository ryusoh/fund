// StrykerJS mutation testing (docs/agentic-quality-gates.md §2).
// Manual/scheduled only — NEVER part of `make verify` / `make precommit-fix`.
// Run via `make mutate-js` (always diff-scoped via --mutate; a full run
// multiplies the jest suite by the mutant count).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
    testRunner: 'jest',
    // Jest config is read from package.json (jsdom env, moduleNameMapper
    // vendor mocks). TZ=UTC must be set by the caller (make mutate-js does),
    // matching `npm test`.
    // coverageAnalysis 'perTest' is NOT usable here: six test files pin
    // `@jest-environment jsdom` via docblock, which overrides the config-level
    // environment, and plain jsdom cannot report coverage to Stryker (initial
    // dry run fails with "Missing coverage results"). 'off' runs the full
    // suite per mutant (~3s each) — fine for diff-scoped weekly runs.
    coverageAnalysis: 'off',
    reporters: ['clear-text', 'progress', 'html', 'json'],
    htmlReporter: { fileName: 'reports/mutation/mutation.html' },
    jsonReporter: { fileName: 'reports/mutation/mutation.json' },
    incremental: true,
    incrementalFile: 'reports/stryker-incremental.json',
    tempDirName: '.stryker-tmp',
    cleanTempDir: true,
};
