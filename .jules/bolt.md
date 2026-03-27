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

**Learning:** In frontend chart rendering loops, using `slice()` and `map()` inside a rolling calculation (like volatility) creates O(N \* W) short-lived array allocations. This causes significant GC pressure and frame drops during user interaction.
**Action:** Replace `slice()` and `map()` inside tight loops with direct index-based `for` loops over the original array to achieve O(1) space overhead per iteration.

## 2024-05-24 - Optimize rolling beta array allocations

**Learning:** In frontend chart rendering loops, using `.slice()` in a sliding window loop `O(N * W)` times to extract subarrays (like in the rolling Beta calculation) creates significant unnecessary garbage collection pressure and allocation overhead. Furthermore, calling `.reduce()` to compute mean values inside that tight loop compounds the performance penalty.
**Action:** Replace `.slice()` and `.forEach()` with a direct `for` loop that iterates over the original array using calculated start and end indices. Compute intermediate sums inside the loop to avoid subsequent `.reduce()` calls. This significantly reduces processing time and memory overhead.
