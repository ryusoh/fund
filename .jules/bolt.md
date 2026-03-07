## 2026-03-07 - Documenting Canvas Node Optimization
**Learning:** Frequent calls to `document.createElement('canvas')` within a high-frequency render loop (such as inside a Chart.js plugin's `afterDatasetsDraw` like `imageDrawer` and `core`) significantly degrades performance due to garbage collection pressure and element lifecycle overhead.
**Action:** Always prefer caching DOM elements where possible, especially for offscreen rendering. Utilize memoized shared canvases attached to functions (`_sharedCanvas`) and resize/clear them implicitly per frame instead of re-instantiating.
