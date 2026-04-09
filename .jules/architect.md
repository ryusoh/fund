# The Architect Journal

## Structural Health Learnings

### `computeMonthlyPnl` Refactoring

- **Issue:** `computeMonthlyPnl` in `js/services/dataService.js` had a high cyclomatic complexity (45). It was performing multiple responsibilities inside a monolithic loop: locating valid data points, grouping items by month, and calculating multidimensional PnL logic for cross-currency data.

- **Refactoring Strategy:** Extracted independent loops into helper functions: `_findEarliestValidEntry`, `_groupDataByMonth`, and `_calculateCurrencyChanges`. This reduced the complexity of the main function from 45 to under 20, improving readability, testing potential, and adhering to single-responsibility paradigms.

### `loadAndDisplayPortfolioData` Refactoring

- **Issue:** Several functions in `js/services/dataService.js` (including `computeMonthlyPnl`, `calculateRealtimePnl`, `formatPerDisplayForTicker`, and `loadAndDisplayPortfolioData`) had high cyclomatic complexity (some as high as 24). This complexity stemmed from monolithic designs handling data grouping, PnL calculations, multi-currency processing, and DOM manipulation concurrently within large loops.

- **Refactoring Strategy:** Separated the dynamic PE calculation and formatting logic into helper functions, broke DOM update blocks into rendering functions, decoupled aggregations, and refactored inner loop blocks. All functions within `js/services/dataService.js` now have a cyclomatic complexity well under the standard threshold of 10, drastically improving code readability, modularity, and testability. Testing suite completely preserved code coverage mapping.

## 2025-01-20 - Architect Routine System Maintenance

**Issue:** High cyclomatic complexity in `js/utils/date.js` and `js/ui/service_worker_register.js`.

**Action:** Refactored `isMarketHoliday` in `js/utils/date.js` into smaller sub-modules (`checkStaticHolidays`, `checkNthDayHolidays`, `checkGoodFridayHoliday`). Refactored local development checks in `js/ui/service_worker_register.js` into `isLocalDevelopment`.

**Verification:** Unit tests continue to pass. Verified cyclomatic complexity is <= 10.

## 2025-04-18 - Architect Routine Code Refactoring

- **Issue:** High cyclomatic complexity in `adjustMobilePanels` function in `js/transactions/layout.js`.
- **Action:** Refactored the function by extracting logic into smaller, focused helpers (`clearStyle`, `setPanelHeight`, `handlePlotSection`), reducing cyclomatic complexity from 18 to under 10.

## 2025-03-20 - Architect Routine Code Refactoring

- **Learning:** High cyclomatic complexity in formatting utilities (e.g., formatNumber) can often be traced to intertwined responsibilities: data conversion, sign resolution, string padding/suffixing, and precision calculation.
- **Action:** Decomposed the 36-complexity formatNumber into targeted functional blocks (resolveSuffixAndValue, calculatePrecision, formatNumberWithSign, formatWithoutSign) allowing the main entry point to drop to a complexity of 9, dramatically improving testability and readability.
- **Issue:** High cyclomatic complexity in `isLocalhost` function in `js/utils/host.js`.
- **Action:** Refactored conditional logic to combine `if` statements and used a `Set` for loopback domains, reducing cyclomatic complexity from 14 to under 10.
