# Terminal chart loading & rendering performance

## The question

Where does the time go when the terminal page (`terminal/index.html`) renders
charts via `plot balance` / `plot composition`, and when a ticker filter such
as `anet` or `pdd` is applied on top of `plot balance`? `js/transactions/chart.js`
is only a 188-line dispatcher (lazy renderer loader + rAF batching); the real
hot paths are in the renderers and the data layer under
`js/transactions/chart/`.

Method: read-only code tracing plus Node (v26.3.0) micro-benchmarks run against
the real generated payloads in `data/` (balance series 2,253 pts, contribution
series 3,303 pts, 2,710 transactions, composition 2,253 days × 172 tickers,
`historical_prices.json` 8.2 MB). No browser profiling; canvas paint cost is
inferred, not measured.

## The answer (ranked bottlenecks)

1. **The balance (`contribution`) chart re-runs its entire data pipeline every
   animation frame, forever.** The perpetual glow animation
   (`js/plugins/glowTrailAnimator.js:248-261`, enabled by default at
   `js/config.js:80-82`) reschedules `chartManager.redraw()` via rAF at the end
   of every frame (`js/transactions/chart/renderers/contribution.js:840-844`),
   so `drawContributionChart` re-executes — including series rebuilding,
   dividend merging, date filtering, smoothing, and appreciation computation —
   at 60 fps even when nothing changed. Measured on real data: ~3.9 ms/frame
   for `computeAppreciationSeries` + ~3.0 ms/frame for the map/filter/smooth
   transform chain, before any canvas work.
2. **With a ticker filter active, `buildFilteredBalanceSeries` re-runs
   uncached every frame** (`contribution.js:174-180`): a day-by-day loop from
   the first filtered transaction to today
   (`js/transactions/chart/data/contribution.js:357-421`). Measured: ~2.5
   ms/call for `anet` (1,926 day iterations), ~0.85 ms/call for `pdd` — per
   frame, on top of finding 1. The first filtered render also fetches and
   parses the 8.2 MB `historical_prices.json` (`contribution.js:152-166`).
3. **`computeAppreciationSeries` interpolates with a linear scan per balance
   point** (`data/contribution.js:515-527`): O(balance × contribution) ≈ 2,253
   × 3,303 worst case, ~3.9 ms measured. A binary search or two-pointer walk
   makes it O(B + C).
4. **`plot composition` (and sectors/geography/marketcap) parses its JSON
   twice per command.** The renderer caches its copy
   (`renderers/composition.js:28,584-591`), but the snapshot line in
   `js/transactions/terminal/snapshots.js:719` calls the un-memoized
   `loadCompositionSnapshotData()` (`js/transactions/dataLoader.js:358-366`),
   so each `plot composition` re-fetches and re-parses the 2.17 MB
   `composition.json` and re-runs `fetchRealTimeData()` (single-flight only
   dedupes _concurrent_ calls — `js/transactions/realtimeData.js:130-137`).
5. **Per-frame transform chain allocates ~6-8 objects + Dates per data point**
   in `drawContributionChart`: spread+parse map (`contribution.js:248-252`),
   `filterDataByDateRange` re-parsing already-parsed Dates and recomputing the
   filter-bound ISO strings per item (`:213-243`, note `:225-226`), another
   spread map (`:263-267`), `parseLocalDate` again (`:276`), then EMA smoothing
   mapped to `{x,y}` and back (`:292-308`). ~3.0 ms/frame measured.
6. **`mergeDividendsIntoContribution` clones the whole contribution series and
   rebuilds the dividend map every frame** (`data/contribution.js:573-608`;
   called per frame at `contribution.js:144-149`): 3,303 object spreads +
   a 2,253-row `yieldData` scan per frame.
7. **`drawMountainFill` reallocates its shared offscreen canvas on every
   call** (`js/transactions/chart/core.js:594-595` — assigning
   `offscreen.width` clears and reallocates the backing store), once per
   visible series per frame (3×/frame on `plot balance`).
8. **Every `filterAndSort` rebuilds the full table DOM even when the table is
   hidden** (`js/transactions/table.js:206-216` → `displayTransactions`
   `:35-112`): unfiltered that is 2,710 rows × 7 cells (~19k DOM nodes) on
   every `all`/`clear`, plus `computeRunningTotals` FIFO
   (`js/transactions/calculations.js:88-151`). While on `plot balance` the
   table is `is-hidden` but still rebuilt.

## Claim-by-claim evidence

### The render loop never idles (findings 1, 5, 6, 7)

`createChartManager().redraw()` is rAF-batched (`js/transactions/chart.js:171-176`)
— good — but `renderFrame` awaits the active renderer, and the contribution
renderer ends with:

- `js/transactions/chart/renderers/contribution.js:840-844` — `if
(contributionAnimationEnabled && hasAnimatedSeries) { scheduleContributionAnimation(chartManager); }`
- `js/transactions/chart/animation.js:43-51` → `glowAnimator.schedule(...)`
- `js/plugins/glowTrailAnimator.js:248-261` — `schedule()` wraps
  `chartManager.redraw()` in `requestAnimationFrame`; there is **no stop
  condition** (`advance()` at `:263-285` just wraps a perpetual
  `Math.sin(phase * oscillationSpeed)` glow).

So while `activeChart` is any contribution-family chart, the full
`drawContributionChart` body — data rebuild included — runs every frame.
`ANIMATED_LINE_SETTINGS.charts.contribution.enabled` is `true`
(`js/config.js:80-82`). The performance chart does the same via
`schedulePerformanceAnimation`. Composition-family charts avoid this: they
have no animation and cache a static bitmap layer, so hover redraws blit the
cache and repaint only the crosshair (`renderers/composition.js:31-34,187-199`)
— the contribution chart has no equivalent.

Measured (Node v26.3.0, real `data/output/*.json`, 50-iteration average after
warm-up): `computeAppreciationSeries` = **3.85 ms/call**; the
map → date-filter → carry-forward → EMA-smooth transform chain over the real
2,253-point balance + 3,303-point contribution series = **3.01 ms/frame**.
Canvas drawing (3 polylines of ~2.2k points, glow with `shadowBlur` on the
tail path at `glowTrailAnimator.js:125-126,179-194`, volume bars, markers,
axes) is additional and unmeasured.

### Filter path (`anet` on `plot balance`) (finding 2)

A bare term goes to `handleDefaultCommand` → `filterAndSort(command)`
(`js/transactions/terminal/handlers/transaction.js:131` →
`js/transactions/table.js:195-229`), whose `onFilterChange` callback calls
`chartManager.update()` whenever a chart is active
(`js/pages/terminal/index.js:378-386`). Then, every frame:

- `js/transactions/chart/renderers/contribution.js:174-180` —
  `buildFilteredBalanceSeries(filteredTransactions, historicalPrices, splitHistory)`
  with **no caching** (unlike `getContributionSeriesForTransactions`, which is
  WeakMap-cached by array identity at `data/contribution.js:6-49`).
- `js/transactions/chart/data/contribution.js:357-421` — the loop iterates
  _every calendar day_ from the first filtered transaction to today, and for
  each day walks all held symbols doing `getPriceFromHistoricalData`
  (`:254-283`, with up to 10 `setDate`+`toISOString` fallback iterations on a
  miss) plus `getSplitAdjustment` per holding (cache:
  `js/transactions/calculations.js:3-34`).
- First filtered render: `contribution.js:152-166` fetches
  `../data/historical_prices.json` (8,201,965 bytes measured) when
  `transactionState.historicalPrices` is empty; it is then cached in state.
  The summary path can race it with a second fetch
  (`js/transactions/terminal/snapshots.js:1205-1228`).

Measured with a faithful Node replica of `buildFilteredBalanceSeries` on real
data: `anet` (86 transactions, first 2021-05-20) → 1,926-point series,
**2.50 ms/call**; `pdd` → **0.85 ms/call**. Every frame, indefinitely.

### `computeAppreciationSeries` O(B×C) (finding 3)

`js/transactions/chart/data/contribution.js:505-527`: `interpolateContrib`
linearly scans `contribTimes` from index 0 for every balance point without an
exact date match — which is most days (balance is daily; contribution points
exist only on transaction/padding days). Called every frame from
`contribution.js:486-489`. `createTimeInterpolator`
(`js/transactions/chart/helpers.js:117-154`) already implements the binary
search used elsewhere.

### Double JSON load on composition-style commands (finding 4)

`handlePlotCommand` → `handleCompositionStyleChart`
(`js/transactions/terminal/handlers/plot.js:200-237`) does both
`chartManager.update()` (renderer loads `composition.json`, cached per renderer
module) **and** `await getCompositionSnapshotLine(...)`
(`js/transactions/terminal/snapshots.js:712-727`), which calls
`loadCompositionSnapshotData()` directly — bypassing the renderer cache. The
loader itself has no memoization (`js/transactions/dataLoader.js:358-366`;
contrast `loadBalanceSeriesPayload`'s promise cache at `:113-122`, added for
F9 in `docs/performance.md`). Same pattern for sectors/geography/marketcap
snapshots (`snapshots.js:864,953,1042`; loaders at `dataLoader.js:2-42`) and
the concentration renderer's separate cache
(`renderers/concentration.js:21-23,201-206`).

### Command-latency extras on `plot balance`

`plot balance` awaits `getContributionSummaryText`
(`handlers/plot.js:246-247` → `snapshots.js:1308-1325`), which uses the
**uncached** `buildContributionSeriesFromTransactions`
(`snapshots.js:1232,1246-1251`) on all 2,710 transactions plus
`mergeDividendsIntoContribution`, instead of the WeakMap-cached
`getContributionSeriesForTransactions`. One-shot per command, so minor.

## How to improve (ranked by impact / effort)

1. **Split `drawContributionChart` into compute-once / draw-per-frame.** Cache
   the derived pipeline output (filtered balance series, dividend-merged
   contribution, date-filtered + smoothed series, appreciation, y-domain)
   keyed by `(filteredTransactions ref, portfolioSeries ref, currency,
chartDateRange, filtersActive, drawdownMode)`; per frame, only rescale
   cached points to pixels and draw. This one change subsumes findings 2, 3,
   5, and 6 in practice. Alternatively/adjacent: port the composition chart's
   static-bitmap layer (`renderers/composition.js:31-34`) to the contribution
   chart. Note: the perpetual glow animation is **intentional and stays
   always-on** (decided by the repo owner) — optimizations must make each
   frame cheaper, not reduce the frame count.
2. **Binary-search interpolation in `computeAppreciationSeries`** — replace
   the linear scan (`data/contribution.js:515-527`) with the existing
   `createTimeInterpolator` or a two-pointer walk. ~3.9 ms → sub-ms per call;
   small, isolated, well-tested surface (existing tests cover this function).
3. **WeakMap-cache `buildFilteredBalanceSeries`** on
   `(transactions, historicalPrices, splitHistory)` identity — same pattern as
   `getContributionSeriesForTransactions` (`data/contribution.js:6-49`).
   Removes ~0.85-2.5 ms/frame while a filter is active.
4. **Memoize the figure loaders in `dataLoader.js`**
   (`loadCompositionSnapshotData`, `loadSectorsSnapshotData`,
   `loadGeographySnapshotData`, `loadMarketcapSnapshotData`) with the
   `loadBalanceSeriesPayload` promise-cache pattern, or export the renderer
   caches for `snapshots.js` to reuse. Removes the second 2.17 MB parse per
   `plot composition` and the live-prices refetch.
5. **Hoist invariants in `filterDataByDateRange`**: compute
   `toLocalIsoDate(filterFrom/filterTo)` once outside the callback
   (`contribution.js:225-226`), and skip the second `parseLocalDate` for items
   whose `date` is already a `Date`. Trivial diff.
6. **Resize the mountain-fill offscreen canvas only when dimensions change**
   (`core.js:594-595`) instead of assigning `width` unconditionally.
7. **Skip `displayTransactions` when the table is hidden** in
   `filterAndSort` (`table.js:216`) and rebuild on table toggle instead;
   avoids a ~19k-node DOM rebuild per `all`/`clear` while charting.

## Action items (for one-by-one implementation)

Each item is a self-contained brief sized for a low-cost agent. Rules for
every item: one PR per item; no behaviour change beyond the stated perf goal;
green `make precommit-fix` before opening; changed executable lines need test
coverage (diff-coverage gate, threshold 90%) — so "pure perf" items that add
cache/memo code still need a test that exercises the new branch. Suggested
scoped test commands below were verified against existing test files; run the
scoped jest first, then `make precommit-fix`.

Recommended order: 1 → 6 in any sequence (they touch disjoint code), then 7
(the big restructure) last — items 1, 2, and 5 touch code that item 7
restructures, so if 7 is scheduled soon, skip 1 and 5 and fold 2 into 7.
The glow animation is always-on by design (owner decision); no item may
stop, throttle, or gate it — the goal is cheaper frames, not fewer frames.

### AI-1 — Binary-search interpolation in `computeAppreciationSeries`

- **File:** `js/transactions/chart/data/contribution.js:515-527` (the
  `interpolateContrib` linear scan).
- **Change:** replace the per-point scan from index 0 with the existing
  `createTimeInterpolator` (`js/transactions/chart/helpers.js:117-154`) or a
  two-pointer walk (both series are time-sorted). Output values must be
  identical for exact matches and interpolated gaps.
- **Tests:** extend `tests/js/transactions/chart/data/contribution.test.js` —
  exact-hit days, gap days, empty contribution series, single-point series.
- **Verify:** `npx jest tests/js/transactions/chart/data/contribution.test.js`
- **Expected:** ~3.9 ms → sub-ms per call (measured baseline in finding 3).

### AI-2 — Memoize the four figure loaders in `dataLoader.js`

- **File:** `js/transactions/dataLoader.js:358-366`
  (`loadCompositionSnapshotData`) and `:2-42` (sectors / geography / marketcap
  snapshot loaders).
- **Change:** apply the promise-cache pattern already used by
  `loadBalanceSeriesPayload` (`dataLoader.js:113-122`): cache the in-flight /
  resolved promise, return the cached promise on repeat calls. Check whether
  any caller depends on getting fresh data after a data refresh — if so, key
  the cache or add an explicit invalidation call there.
- **Tests:** assert a second call does not re-fetch (mock `fetch`, count
  calls) in `tests/js/transactions/terminal/snapshots.test.js` or a loader
  test near the existing balance-payload cache tests.
- **Verify:** `npx jest tests/js/transactions/terminal/snapshots.test.js`
- **Expected:** removes the second 2.17 MB `composition.json` parse +
  `fetchRealTimeData()` refetch per `plot composition` (finding 4).

### AI-3 — Hoist invariants in `filterDataByDateRange`

- **File:** `js/transactions/chart/renderers/contribution.js:213-243`.
- **Change:** compute `toLocalIsoDate(filterFrom)` / `toLocalIsoDate(filterTo)`
  once before the filter callback (currently recomputed per item at
  `:225-226`); skip the `parseLocalDate` when `item.date` is already a `Date`.
- **Tests:** existing renderer coverage
  (`tests/js/transactions/chart/renderers/`, `tests/js/transactions/chart_regression.test.js`)
  should stay green; add a boundary-date case if none exists.
- **Verify:** `npx jest tests/js/transactions/chart_regression.test.js`
- **Expected:** part of the ~3.0 ms/frame transform chain (finding 5).

### AI-4 — Resize mountain-fill offscreen canvas only on dimension change

- **File:** `js/transactions/chart/core.js:594-595` (`drawMountainFill`).
- **Change:** guard the `offscreen.width = …` / `height = …` assignments with
  a same-size check (assigning `width` reallocates and clears the backing
  store even when the value is unchanged).
- **Tests:** extend `tests/js/transactions/chart_core.test.js` — same-size
  redraw reuses the canvas object; different size reallocates.
- **Verify:** `npx jest tests/js/transactions/chart_core.test.js`
- **Expected:** removes 3 backing-store reallocations per frame on
  `plot balance` (finding 7).

### AI-5 — WeakMap-cache `buildFilteredBalanceSeries`

- **File:** `js/transactions/chart/data/contribution.js:357-421`; call site
  `js/transactions/chart/renderers/contribution.js:174-180`.
- **Change:** cache on `(transactions, historicalPrices, splitHistory)` object
  identity, mirroring the existing `getContributionSeriesForTransactions`
  WeakMap pattern at `data/contribution.js:6-49`. Keyed identity only — do not
  key on array contents.
- **Tests:** extend `tests/js/transactions/chart/data/contribution.test.js` —
  same inputs return the identical cached array; a new transactions array
  recomputes.
- **Verify:** `npx jest tests/js/transactions/chart/data/contribution.test.js`
- **Expected:** removes ~0.85–2.5 ms/frame while a ticker filter is active
  (finding 2). Note: the 8.2 MB first-fetch of `historical_prices.json` and
  its suspected double-fetch race (`snapshots.js:1205-1228`) are **out of
  scope** here.

### AI-6 — Skip table DOM rebuild while the table is hidden

- **File:** `js/transactions/table.js:206-216` (`filterAndSort`) →
  `displayTransactions` (`:35-112`); table toggle handler (find it from the
  `transaction` command handler under
  `js/transactions/terminal/handlers/`).
- **Change:** when the table container is `is-hidden`, update filter state
  but defer `displayTransactions`; rebuild once when the table is toggled
  visible. Keep `onFilterChange` (chart update) firing as today —
  `js/pages/terminal/index.js:378-386` depends on it.
- **Tests:** table hidden + `anet` filter → no row nodes created; toggle
  visible → rows match the active filter.
- **Verify:** `npx jest tests/js/transactions` (table tests live somewhere
  under here — locate the `filterAndSort`/`displayTransactions` suite first).
- **Expected:** removes a ~19k-node DOM rebuild per `all`/`clear` while
  charting (finding 8).

### AI-7 — Split `drawContributionChart` into compute-once / draw-per-frame

- **Files:** `js/transactions/chart/renderers/contribution.js` (main body,
  pipeline at `:144-308`, animation tail `:840-844`);
  `js/transactions/chart/data/contribution.js`;
  `js/transactions/chart/animation.js:43-51`.
- **Change:** cache the derived pipeline output (filtered balance series,
  dividend-merged contribution, date-filtered + smoothed series, appreciation,
  y-domain) keyed by `(filteredTransactions ref, portfolioSeries ref, currency,
chartDateRange, filtersActive, drawdownMode)`; the per-frame path only
  rescales cached points to pixels and draws. Optionally also port the
  composition chart's static-bitmap layer pattern
  (`renderers/composition.js:31-34,187-199`).
- **This subsumes AI-1, AI-3, AI-5 and findings 5–6 for the per-frame path**;
  those items still help the first-compute path, so they are not wasted.
- **Tests:** this is the risky one — extend
  `tests/js/transactions/chart/renderers/` and
  `tests/js/transactions/chart_regression.test.js` so a state change
  invalidates the cache and a no-change frame reuses it.
- **Verify:** `npx jest tests/js/transactions/chart` then `make precommit-fix`;
  visual check via `make screenshot URL=/terminal/` — glow animation must
  still render.
- **Expected:** the entire ~7 ms/frame JS compute load (findings 1, 2, 3, 5, 6) drops to ~0 on steady-state frames — the glow keeps animating at 60 fps,
  but each frame only rescales and draws.

## Open questions / what I couldn't verify

- **Real frame times in Chromium.** All numbers above are Node
  micro-benchmarks of the JS compute path; canvas rasterization cost
  (polylines, `shadowBlur` glow, gradients, `drawImage` blits) is unmeasured.
  Confirm with a DevTools performance capture before prioritizing finding 7 or
  the glow's paint cost.
- ~~Whether the perpetual glow animation is intentional~~ — **resolved: yes.
  The glow stays always-on** (repo owner decision); all optimization items
  must preserve the perpetual 60 fps animation and cut per-frame cost instead.
- **Network-side latency of `plot composition`** (2.17 MB fetch + live-prices
  Worker + `fx_data.json` per command) depends on HTTP cache behavior after
  the F1 cache-busting removal (`docs/performance.md`); not re-measured here.
- **`historical_prices.json` double-fetch race** between the renderer
  (`contribution.js:152-166`) and the summary path (`snapshots.js:1205-1228`)
  on the first filtered command: both check-then-fetch without an in-flight
  guard; observed by code inspection only.
- **jsdom-based tests cannot observe any of this**; the benchmarks above were
  ad-hoc Node scripts, not committed tests.
