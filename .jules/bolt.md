## 2026-03-07 - Documenting Canvas Node Optimization

**Learning:** Frequent calls to `document.createElement('canvas')` within a high-frequency render loop (such as inside a Chart.js plugin's `afterDatasetsDraw` like `imageDrawer` and `core`) significantly degrades performance due to garbage collection pressure and element lifecycle overhead.
**Action:** Always prefer caching DOM elements where possible, especially for offscreen rendering. Utilize memoized shared canvases attached to functions (`_sharedCanvas`) and resize/clear them implicitly per frame instead of re-instantiating.

## 2026-03-07 - Python JSON I/O Caching

**Learning:** Reading a JSON file from disk repeatedly within a nested loop can cause a significant performance bottleneck due to redundant I/O and parsing.
**Action:** Use `@functools.lru_cache(maxsize=1)` on file-loading functions that are called frequently during a script's execution to ensure the file is only read once.

## 2026-03-07 - Pandas iteration performance

**Learning:** Using `iterrows` on a Pandas DataFrame for row-by-row iteration in Python loops is a significant performance anti-pattern. `iterrows` creates a new Pandas Series object for each row, incurring high overhead.
**Action:** When vectorized operations are not feasible, always use `.itertuples(index=False)` instead. It returns namedtuples (which are much lighter and faster) and provides a substantial speedup (often 10-20x) for large datasets. Ensure column names with spaces are formatted to be compatible with namedtuple attribute access (e.g., replace spaces with underscores).
