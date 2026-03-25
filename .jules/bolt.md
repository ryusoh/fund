## 2026-03-07 - Documenting Canvas Node Optimization

**Learning:** Frequent calls to `document.createElement('canvas')` within a high-frequency render loop (such as inside a Chart.js plugin's `afterDatasetsDraw` like `imageDrawer` and `core`) significantly degrades performance due to garbage collection pressure and element lifecycle overhead.
**Action:** Always prefer caching DOM elements where possible, especially for offscreen rendering. Utilize memoized shared canvases attached to functions (`_sharedCanvas`) and resize/clear them implicitly per frame instead of re-instantiating.

## 2026-03-07 - Python JSON I/O Caching

**Learning:** Reading a JSON file from disk repeatedly within a nested loop can cause a significant performance bottleneck due to redundant I/O and parsing.
**Action:** Use `@functools.lru_cache(maxsize=1)` on file-loading functions that are called frequently during a script's execution to ensure the file is only read once.

## 2026-03-07 - Pandas iteration performance

**Learning:** Using `iterrows` on a Pandas DataFrame for row-by-row iteration in Python loops is a significant performance anti-pattern. `iterrows` creates a new Pandas Series object for each row, incurring high overhead.
**Action:** When vectorized operations are not feasible, always use `.itertuples(index=False)` instead. It returns namedtuples (which are much lighter and faster) and provides a substantial speedup (often 10-20x) for large datasets. Ensure column names with spaces are formatted to be compatible with namedtuple attribute access (e.g., replace spaces with underscores).

## 2026-03-11 - Safe Pandas itertuples iteration

**Learning:** While `.itertuples(index=False)` is fast, replacing special characters to use namedtuple attributes can be fragile if column names start with digits (causing invalid Python identifiers) or overlap with reserved methods like `index` (if `.reset_index()` is used without renaming). This leads to runtime `AttributeError`s that crash the program.
**Action:** For safely iterating over arbitrary DataFrames without performance loss, use `itertuples(index=True, name=None)`. This returns standard fast tuples instead of namedtuples. Access the index via `row[0]` and iterate over columns explicitly via `enumerate(df.columns, start=1)` and `row[idx]`.

## 2026-03-12 - Ultra-fast Pandas Dataframe Iteration

**Learning:** When using Pandas `itertuples(index=True, name=None)`, dynamically searching for column indices inside the loop using `df.columns.get_loc()` or matching column names causes significant overhead. The O(1) attribute lookup of `namedtuple` is lost, making it slower than necessary.
**Action:** When using regular tuples with `itertuples(name=None)`, pre-calculate the column indices outside the iteration loop using a dictionary like `{col: df.columns.get_loc(col) + 1 for col in df.columns}` (adding 1 because the index is at `row[0]`). This restores O(1) access speed while completely avoiding the fragility of invalid Python identifiers in namedtuples.

## 2026-03-22 - Pandas to_dict optimization

**Learning:** When building JSON-ready dictionaries from Pandas DataFrames, iterating over rows (even with `itertuples`) to build the dictionary in Python is significantly slower than using Pandas' built-in C-optimized methods.
**Action:** Instead of iterating, use `df.to_dict(orient='index')`. If the index needs formatting (e.g., date strings), apply the formatting to the index directly (`df.index = df.index.strftime('%Y-%m-%d')`) before calling `to_dict`.

## 2024-03-24 - Pandas Row Iteration Performance Bottleneck

**Learning:** Using `.loc[row, col]` inside nested loops for row-by-row and column-by-column access has severe performance overhead in Pandas DataFrames.
**Action:** Always pre-calculate positional indices using `df.columns.get_loc('col_name') + 1` outside the loop, and use `.itertuples(index=True, name=None)` for the outer iteration. Access column values efficiently via `row[idx]`. This reduced iteration time from ~25s to ~2s.

## 2024-05-15 - Date Parsing Bottleneck in Large Sorts

**Learning:** Instantiating `new Date(dateString)` inside a JavaScript `Array.prototype.sort()` comparator function causes massive CPU overhead for large arrays, as the comparator executes O(N log N) times.
**Action:** Always pre-calculate timestamps (e.g., caching it via a `Map` or mapping an array) before or during sorting to ensure each date string is parsed exactly once without mutating original objects.

## 2024-05-20 - YYYY-MM-DD Direct String Comparison Optimization

**Learning:** For ISO 8601 formatted date strings (like `YYYY-MM-DD`), using `new Date(a)` inside `Array.prototype.sort()` is a massive performance bottleneck. Even caching parsed dates has unnecessary memory overhead.
**Action:** When sorting arrays by `YYYY-MM-DD` strings, entirely avoid date parsing. Instead, use direct lexicographical string comparison (e.g., `a < b ? -1 : (a > b ? 1 : 0)`). This is ~10x faster than parsing and requires no additional memory for caching.

## 2025-02-18 - Optimizing math-heavy operations in JavaScript

**Learning:** For data smoothing algorithms and math-heavy operations (like polynomial fits or moving averages), chained higher-order array methods (e.g., multiple `.reduce()` passes over the same array) and temporary allocations (e.g., `.slice()` inside a loop) introduce significant functional callback overhead and garbage collection pressure.
**Action:** Replace these patterns with single `for` loops that compute multiple values simultaneously. This reliably reduces execution time and memory footprint without sacrificing readability for domain-specific math functions.

## 2024-05-24 - Optimize rolling volatility array allocations

**Learning:** In frontend chart rendering loops, using `slice()` and `map()` inside a rolling calculation (like volatility) creates O(N * W) short-lived array allocations. This causes significant GC pressure and frame drops during user interaction.
**Action:** Replace `slice()` and `map()` inside tight loops with direct index-based `for` loops over the original array to achieve O(1) space overhead per iteration.

## 2024-05-24 - Optimize rolling beta array allocations

**Learning:** In frontend chart rendering loops, using `.slice()` in a sliding window loop `O(N * W)` times to extract subarrays (like in the rolling Beta calculation) creates significant unnecessary garbage collection pressure and allocation overhead. Furthermore, calling `.reduce()` to compute mean values inside that tight loop compounds the performance penalty.
**Action:** Replace `.slice()` and `.forEach()` with a direct `for` loop that iterates over the original array using calculated start and end indices. Compute intermediate sums and variances/covariances directly without intermediate array allocations. This achieves O(1) space overhead per window and significantly reduces processing time and memory overhead.

## 2025-03-07 - Optimizing tight loops in canvas charting renderers

**Learning:** In `js/transactions/chart/renderers/sectors.js` and `js/transactions/chart/renderers/marketcap.js`, using `.map` to iteratively update `cumulativeValues` array inside the active category drawing loop `(cumulativeValues = cumulativeValues.map((val, index) => val + values[index]))` generates a new array on every iteration of every sector, creating massive GC pressure on high frame rates.
**Action:** Always replace `.map()` with an in-place mutation `for` loop `for (let i = 0; i < cumulativeValues.length; i += 1) { cumulativeValues[i] += values[i]; }` to prevent memory allocations entirely.

## 2026-03-29 - LOWESS map() loop overhead

**Learning:** In the LOWESS smoothing algorithm (`weightedLocalRegression`), using `Math.max(...data.map(...))` inside a nested loop iterates over the array $N$ times per point, creating severe $O(N^3)$ complexity, causing massive allocation delays.
**Action:** Extract loop-invariant array reductions (like finding a global `maxDistance` for a single `targetX`) outside the calculation loop. Use manual `for` loops instead of `.map()` or spread operators to prevent garbage collection pressure and drop complexity.

## 2025-05-18 - Math.min/max and Spread on Array Allocation

**Learning:** Using `Math.min(...array.map(..))` and `Math.max(...array.map(..))` is a performance bottleneck in high-frequency loops (like `scroll` or `resize` via `ResizeObserver`), as it triggers multiple intermediate array allocations (`.map`) followed by maximum arguments limit risk and large spread parameter instantiation.
**Action:** Always replace chained spread map iterations `Math.max(...array.map(x => x))` with a single, unified `for` loop that updates minimum/maximum trackers inline to zero out GC pressure and avoid call stack bounds errors.

## 2026-03-30 - Array Map and Reduce Inside Animation Loops

**Learning:** Dynamically generating arrays of objects (such as path segments) and then iterating over them with `.reduce()` or `.map()` inside an animation loop (like a `requestAnimationFrame` drawing frame, or repeatedly inside an internal rendering method like `getPointAtProgress`) causes severe GC (Garbage Collection) pressure. This results in stutters and dropped frames in visual UI elements like the table glass effect.
**Action:** Always inline array generation and mathematical reductions directly into plain conditional and arithmetic logic for high-frequency path-tracing methods.

## 2026-03-07 - Optimize Split Adjustment Array Allocation and Date Parsing

**Learning:** Using `.filter()` chained with `.reduce()` combined with `new Date(split.splitDate)` inside the iteration loop created significant memory allocations and GC pressure for large datasets with split adjustments.
**Action:** Replace `.filter().reduce()` with a single `for` loop, and replace `new Date` comparison with direct string comparison by formatting `transactionDate` into `YYYY-MM-DD` outside the loop.
