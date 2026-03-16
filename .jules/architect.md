# The Architect Journal

## Structural Health Learnings

### `computeMonthlyPnl` Refactoring

- **Issue:** `computeMonthlyPnl` in `js/services/dataService.js` had a high cyclomatic complexity (45). It was performing multiple responsibilities inside a monolithic loop: locating valid data points, grouping items by month, and calculating multidimensional PnL logic for cross-currency data.
- **Refactoring Strategy:** Extracted independent loops into helper functions: `_findEarliestValidEntry`, `_groupDataByMonth`, and `_calculateCurrencyChanges`. This reduced the complexity of the main function from 45 to under 20, improving readability, testing potential, and adhering to single-responsibility paradigms.
