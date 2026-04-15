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
