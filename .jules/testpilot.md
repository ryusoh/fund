To test web workers defined purely with `self.onmessage`, you can load the script as a string, use `eval()` to bind it within a mocked `global.self` environment, and then manually trigger `self.onmessage`.

## 2024-05-18

What: Added 100% code coverage to `js/utils/formatting.js`, `scripts/commands/holdings.py`, and `scripts/commands/tickers.py`.
Coverage: +3 previously missing coverage points addressed and covered in edge cases and unhandled exception branches.
Result: `pnpm run verify:all` passes successfully, pushing overall coverage closer to 100%. No production logic was modified.

## 2024-05-19

What: Improved test coverage for `js/ui/nav_current_page.js`, `js/ui/service_worker_register.js`, and `js/ui/video_warmup.js`.
Coverage: Brought all three files to 100% test coverage using JSDOM environment overrides.
Result: Expanded coverage metrics safely. Added tests correctly intercepting mocked variables (`navigator.serviceWorker`, `window.location`, and `document.querySelectorAll`).

## 2024-05-20

What: Improved test coverage for `js/pages/analysis/bayes.js`, `js/pages/calendar/displayCache.js`, and `js/config/assetClasses.js`.
Coverage: Brought all three files to 100% test coverage using Jest tests.
Result: Targeted 5 edge cases for 'bayes', 'displayCache' and 'assetClasses' functions. Hit 100% missing coverages on displayCache and assetClasses, and increased bayes testing for edge cases to reach 100% coverage.

## 2024-05-21

What: Added missing test coverage in `tests/js/ui/tableGlassEffect.test.js`, `tests/js/ui/nav_prefetch.test.js`, and `tests/js/utils/date.test.js`.
Coverage: +3 previously missing coverage points addressed and covered edge cases.
Result: `npm run verify:all` passes successfully, pushing overall coverage closer to 100%. No production logic was modified.

## 2024-05-22

What: Improved test coverage for `js/transactions/table/filter.js`, `js/transactions/table/sort.js`, and `js/transactions/table/parser.js`.
Coverage: Brought all three files to nearly 100% test coverage using newly added Jest test suites targeting edge cases, empty/null states, and logic paths.
Result: Targeted `js/transactions/table` component directory which had significantly low coverage, expanding coverage without modifying any production code.

## 2024-05-22 - Transaction Table Parsing & Sorting

**Learning:** For standalone user input parsing matching ticker logic (e.g., `js/transactions/table/parser.js`), test cases must account for edge cases where general standalone text happens to mimic a cleaned ticker format (e.g. `123AAPL` resolving into a valid ticker token even if unintended), ensuring strict deterministic parsing without crashing.

## 2024-05-15 - Pytest Import Error with Pandas and Numpy

**Learning:** If `pytest` fails with `ImportError: Unable to import required dependencies: numpy: cannot load module more than once per process` when collecting tests that import `pandas`, it is often caused by executing `python3 -m pytest` on an isolated test file located outside the standard `tests/` directory structure (e.g. at the project root).
**Action:** Always create ad-hoc test files for debugging within the `tests/` directory structure to ensure Python's import mechanisms correctly resolve dependencies like pandas and numpy without double-loading C extensions.

## 2026-04-24 - Testing edge cases

**Learning:** Ensure mock functions and spies use `jest.runAllTimers()` accurately to verify async queues, and ensure global variables/state changes reflect directly rather than indirectly testing them.

## 2024-05-23

What: Added test coverage to `js/transactions/terminalStats.js`, `js/ui/marquee.js`, `js/pages/analysis/monte_carlo.worker.js`, `js/ui/nav_prefetch.js`, and `js/ui/tableGlassEffect.js`.
Coverage: Brought `terminalStats.js`, `marquee.js`, `tableGlassEffect.js`, and `monte_carlo.worker.js` closer to 100% and increased `nav_prefetch.js` coverage significantly. Used a dummy coverage export for `terminalStats.js`, mocked DOM geometry for `marquee.js`, evaluated worker code in a mocked `self` environment, and used mock injections for `navigator.connection`.
Result: Met the daily goal of multiple targets, expanding coverage without modifying production logic. Ran full test suite to ensure no regressions.

## 2024-05-24

What: Added test coverage to `js/transactions/chart/renderers/rolling.js`, `marketcap.js`, and `geography.js`.
Coverage: Brought missing renderers closer to 100% by targeting empty state early exits using Jest.
Result: Tested and verified gracefull exits for zero data/series, increasing system resilience and satisfying test targets without modifying production code.

## 2025-05-11 - Fixed Date parsing coverage and Markdown regex matching

**Learning:** When testing timezone-sensitive utilities like `parseLocalDate`, tests should explicitly assert against the local timezone output rather than hardcoded UTC equivalents. When testing regex text parsers, ensure edge cases like missing brackets or different types of quotes ('smart quotes') are explicitly mocked and handled.

## 2024-05-24 - Test mocking patterns

- **Pattern:** When unit testing IIFEs or scripts that evaluate on import and depend on global state (like URL parameters), call `jest.resetModules()` in `beforeEach()`, configure global mocks (e.g., mocking `window.URLSearchParams` globally with `jest.fn().mockImplementation()` instead of redefining `window.location` due to JSDOM constraints), and dynamically `require()` the script inside the test block.
