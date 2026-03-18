# The Architect Journal

## Structural Health Learnings

### `computeMonthlyPnl` Refactoring

- **Issue:** `computeMonthlyPnl` in `js/services/dataService.js` had a high cyclomatic complexity (45). It was performing multiple responsibilities inside a monolithic loop: locating valid data points, grouping items by month, and calculating multidimensional PnL logic for cross-currency data.
- **Refactoring Strategy:** Extracted independent loops into helper functions: `_findEarliestValidEntry`, `_groupDataByMonth`, and `_calculateCurrencyChanges`. This reduced the complexity of the main function from 45 to under 20, improving readability, testing potential, and adhering to single-responsibility paradigms.

### `loadAndDisplayPortfolioData` Refactoring

- **Issue:** Several functions in `js/services/dataService.js` (including `computeMonthlyPnl`, `calculateRealtimePnl`, `formatPerDisplayForTicker`, and `loadAndDisplayPortfolioData`) had high cyclomatic complexity (some as high as 24). This complexity stemmed from monolithic designs handling data grouping, PnL calculations, multi-currency processing, and DOM manipulation concurrently within large loops.
- **Refactoring Strategy:** Separated the dynamic PE calculation and formatting logic into helper functions, broke DOM update blocks into rendering functions, decoupled aggregations, and refactored inner loop blocks. All functions within `js/services/dataService.js` now have a cyclomatic complexity well under the standard threshold of 10, drastically improving code readability, modularity, and testability. Testing suite completely preserved code coverage mapping.

## 2025-01-20 - Modularization of Highly Complex Functions

- **Issue:** Several functions in `js/utils/date.js`, `js/utils/formatting.js`, `js/ui/service_worker_register.js`, and `js/ui/tableGlassEffect.js` had cyclomatic complexity scores significantly higher than the standard threshold of 10. `isMarketHoliday` reached 20, `formatNumber` reached 36, and the IIFE in the service worker script reached 30.
- **Refactoring Strategy:** Separated complex date checks into simple helper functions like `isNthDayHoliday`. Split `formatNumber` into `formatNumberWithSign` and `formatNumberWithoutSign` along with specific formatting rules (e.g. `calculatePrecision`, `getMagnitude`) to limit branching. Switched the 20 `||` boolean comparisons in the service worker script to an array `some()` search to quickly identify local prefixes. Restructured `getPointAtProgress` using an array of segment boundary checks. Cyclomatic complexity for all targeted functions is now safely within <= 10.
