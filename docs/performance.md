# Performance improvement opportunities

## The question

Where can this repo — a static vanilla-JS/CSS dashboard (no build step) plus a
Python data pipeline under `scripts/` — be made faster, based on evidence in
its own code? Findings cover both the per-page-load / per-frame frontend cost
and the per-run pipeline cost, prioritized by how often the cost is paid.

Method: read-only code inspection plus the two existing benchmark scripts
(`performance/benchmark_fx_json.py`, `performance/benchmark_composition_data.py`,
run under `venv/bin/python` on synthetic data) and JSON payload size
measurements on the generated files in `data/`. No full test suite or pipeline
runs; no network fetches.

## The answer (top findings, highest impact first)

1. **Every data fetch is cache-busted with `?t=<Date.now()>`, so repeat visits
   re-download ~10 MB of static JSON/CSV that changes at most daily** —
   `js/services/dataService.js:50`, `js/transactions/realtimeData.js:12`,
   `js/transactions/terminal/stats/financial.js:17`.
2. **The terminal page calls `fetchRealTimeData()` three times per load**, and
   each call re-fetches live prices, `fx_data.json`, and the 3.5 MB
   `pe_ratio.json` with no memoization — `js/transactions/dataLoader.js:115,236,351`.
3. **The position page downloads the full 3.5 MB `pe_ratio.json` to read a
   226-byte `forward_pe` section** — `js/services/dataService.js:20,152`;
   measured: `forward_pe` serializes to 226 bytes out of 3,516,021.
4. **Pipeline writes the largest chart JSONs pretty-printed (`indent=2`)**:
   `composition.json` is 4.94 MB on disk vs 2.18 MB compact (measured, ~56%
   saving); `geography.json` 2.73 MB vs 1.93 MB —
   `scripts/generate_composition_data.py:199`,
   `scripts/generate_geography_data.py:744,809`,
   `scripts/generate_marketcap_from_composition.py:99`.
5. **Three `TableGlassEffect` instances on the terminal page redraw all canvas
   layers every animation frame, even when idle** (no visibility/idle gating) —
   `js/ui/tableGlassEffect.js:507-514,578-615`; instantiated at
   `js/pages/terminal/index.js:356-362`.
6. **The index-page marquee does one `getBoundingClientRect()` per character
   span per frame and writes layout-affecting margins per char per frame** —
   `js/ui/marquee.js:100-155`.
7. **While the calendar is zoomed, `WebGLCaustics` re-measures every calendar
   cell with `getBoundingClientRect()` once per second and runs a 20-iteration
   Jacobi fluid solve every frame** — `js/ui/webglCaustics.js:358,492-496,617`.
8. **Pipeline: `update_daily_pnl.py` fetches each holding's price history with
   a sequential per-ticker `yf.Ticker(...).history()` loop** on every daily run,
   while sibling scripts already batch/concurrent-fetch —
   `scripts/pnl/update_daily_pnl.py:67-71`.

## Implementation status

All findings except F6 were implemented on `main` in the commits below. The
original, line-numbered work orders lived in `docs/performance-action-items.md`;
that doc has been consolidated into this file now that the work is done.

| Finding                                              | Commit     | Scope                                                                                                          |
| :--------------------------------------------------- | :--------- | :------------------------------------------------------------------------------------------------------------- |
| F4 — compact chart JSONs                             | `d2ead8dc` | `scripts/generate_composition_data.py`, `generate_geography_data.py`, `generate_marketcap_from_composition.py` |
| F9 — share `balance_series.json` fetch               | `436489ca` | `js/transactions/dataLoader.js`                                                                                |
| F3 — `forward_pe.json` sidecar                       | `3c365328` | `scripts/generate_pe_data.py`, `js/services/dataService.js`                                                    |
| F1 — drop timestamp cache-busting                    | `328cfcf4` | `js/services/dataService.js`, `js/transactions/realtimeData.js`, `js/transactions/terminal/stats/financial.js` |
| F2 — single-flight `fetchRealTimeData` + PE cache    | `111fe831` | `js/transactions/realtimeData.js`, `js/services/dataService.js`                                                |
| F10 — batch yfinance downloads                       | `28489ccf` | `scripts/pnl/update_daily_pnl.py`                                                                              |
| F11 — `groupby('symbol')` in `prepare_frontend_data` | `46619aea` | `scripts/prepare_frontend_data.py`                                                                             |
| F5 — idle-gate `TableGlassEffect`                    | `2f79530c` | `js/ui/tableGlassEffect.js`                                                                                    |
| F8 — `toBlob()` + debounced resize rebuilds          | `22d9330f` | `js/ui/liquidGlassRefraction.js`                                                                               |
| F7 — event-driven caustics + idle sim pause          | `33b8e962` | `js/ui/webglCaustics.js`                                                                                       |
| F6 — marquee per-char culling                        | **Closed** | Measured 0 `.mq-char` spans at runtime because `MARQUEE_CONFIG.enabled` is `false`; not implemented.           |

Additional commits shipped with this batch:

- `e6f3b185` — black-format the marketcap test assertion added in F4.
- `d28dfd8b` — fix `scripts/twrr/utils.py` `DATA_DIR` resolving to `scripts/data/` instead of `data/`.
- `28595ddf` — refresh generated data through 2026-08-20 (produces the new `forward_pe.json` sidecar).
- `969f3f47` — add `make ensure-playwright` for headless browser checks.

## Findings

### F1. Cache-busting query param on every data fetch defeats HTTP caching

**What/where.** `fetchJSON` in `js/services/dataService.js:49-50` builds every
request as `` `${url}${separator}t=${new Date().getTime()}` ``. The same pattern
appears in `js/transactions/realtimeData.js:12` and as `withCacheBust()` in
`js/transactions/terminal/stats/financial.js:17` (used at lines 60, 75, 91),
plus `js/services/dataService.js:521-525` for the historical CSV and FX JSON.

**Why it costs.** A unique query string makes every URL a cache miss, so the
browser (and the production service worker registered by
`js/ui/service_worker_register.js:58-68`) can never serve a cached copy or a
cheap 304 revalidation. The files involved are large and change at most once
per data-bot commit: `data/output/figures/composition.json` 4.94 MB,
`pe_ratio.json` 3.52 MB, `geography.json` 2.73 MB, `contribution_series.json`
1.41 MB, `performance_series.json` 0.83 MB (measured with `ls -la data/`).
Every page load — first or repeat — re-downloads and re-parses them. It also
undercuts the repo's own warm-up mechanisms: `js/ui/nav_prefetch.js` prefetch
and the speculation-rules prerender in `index.html:170-184` warm the HTTP
cache, but cache-busted subresource URLs can't reuse warmed bytes. The Fetch
default (`cache: "default"`) honors ETag/`Last-Modified`; `cache: "no-cache"`
revalidates without changing the URL ([MDN: Request.cache](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache)).

**Suggested change.** Drop the millisecond query param and rely on server
ETag/`Last-Modified` revalidation (GitHub Pages sends both), or version the URL
by the data commit hash if immutable caching is wanted. Keep a manual bypass
only for the Cloudflare Worker live-prices call, which is genuinely volatile
(`js/services/dataService.js:66-68`).

### F2. `fetchRealTimeData()` runs three times per terminal load, un-memoized

**What/where.** `loadPortfolioSeries`, `loadPerformanceSeries`, and
`loadCompositionSnapshotData` each invoke `fetchRealTimeData()` —
`js/transactions/dataLoader.js:115-121`, `:236-242`, `:351-357`.
`fetchRealTimeData` (`js/transactions/realtimeData.js:128-154`) fetches
portfolio prices (Cloudflare Worker or `fund_data.json`), `fx_data.json`, and
calls `fetchMarketRatiosForTickers`, which fetches `pe_ratio.json` afresh on
every invocation (`js/services/dataService.js:152` — the module caches
`analysisTickerPathCache`/`tickerMetadataCache` at lines 23-24 but not the PE
payload).

**Why it costs.** Up to 3 duplicate live-price round-trips and up to 3 × 3.5 MB
`pe_ratio.json` downloads+parses on a single terminal page load, on top of F1
making none of them cacheable.

**Suggested change.** Memoize the in-flight `fetchRealTimeData()` promise per
page (single-flight), or lift it to one call in the page entry and pass the
result down; cache the parsed `pe_ratio.json` payload alongside the two
existing caches in `dataService.js`.

### F3. Position page reads 226 bytes out of a 3.5 MB `pe_ratio.json`

**What/where.** `js/services/dataService.js:20` points `PE_RATIO_URL` at
`../data/output/figures/pe_ratio.json`; `fetchMarketRatiosForTickers`
(line 152) downloads and parses the whole file to read
`forward_pe.ticker_forward_pe` and `forward_pe.msci_pe_ratio` (lines 153-154).

**Why it costs.** Measured on the generated file: `pe_ratio.json` is 3,516,021
bytes; `json.dumps(pe["forward_pe"], separators=(",", ":"))` is **226 bytes**.
The bulk is the historical series (`dates`, `portfolio_pe`, `ticker_pe`,
`ticker_weights`, `ticker_prices`, `benchmark_pe`), which the position page's
PER column never uses. The terminal PE chart (`js/transactions/chart/renderers/pe.js:186`)
and terminal stats (`js/transactions/terminal/stats/financial.js:91`) do need
the full file, so only the position-page path can slim down. The file is
already written compactly by `scripts/generate_pe_data.py:1714`
(`separators=(",", ":")`), so there is no formatting win left — the win is
splitting the payload.

**Suggested change.** Have `generate_pe_data.py` additionally emit a small
`forward_pe.json` (the 226-byte section) and point `PE_RATIO_URL` at it.

### F4. Largest chart JSONs are written pretty-printed (`indent=2`)

**What/where.** `save_json_data` in `scripts/generate_composition_data.py:199`
does `json.dump(data, f, indent=2)`; same in
`scripts/generate_geography_data.py:744,809` and
`scripts/generate_marketcap_from_composition.py:99`.

**Why it costs.** These are consumed verbatim by the frontend
(`js/transactions/dataLoader.js:4,18,32,352`). Measured on the generated
files: `composition.json` is 4,943,344 bytes on disk vs 2,182,092 compact
(~56% smaller); `geography.json` 2,725,361 vs 1,931,609 (~29% smaller).
Whitespace-only overhead — no consumer needs the indentation. In-repo
precedent for compact output already exists: `scripts/ratios/calculate_ratios.py:681-815`
and `scripts/generate_pe_data.py:1714` write without indentation.

**Suggested change.** Drop `indent=2` (or use `separators=(",", ":")`) in the
three writers. This compounds with F1/F2: smaller files also parse faster
(`response.json()` cost scales with bytes).

### F5. Terminal glass effects redraw every frame even when idle

**What/where.** `TableGlassEffect.startLoop` (`js/ui/tableGlassEffect.js:507-514`)
schedules an unconditional `requestAnimationFrame` loop; `draw()`
(`:578-615`) clears the canvas and repaints the ambient glow, row-hover,
electric trails, particles, and reflection layers every frame. The terminal
page creates three instances — `.terminal`, `.chart-card`,
`.table-responsive-container` (`js/pages/terminal/index.js:317-362`) — and the
position page at least one (`js/pages/position/index.js:187`). Grep confirms no
`visibilitychange`/`document.hidden`/`IntersectionObserver` gating in
`tableGlassEffect.js`, `webglCaustics.js`, or `marquee.js`.

**Why it costs.** Three full-canvas 2D repaints plus a WebGL pass per frame at
60 fps while the page simply sits visible. The WebGL layer early-outs when the
spotlight alpha is ~0 (`js/ui/tableGlassWebGL.js:437-440`), but the 2D layers
have no equivalent idle skip. Browsers pause rAF in hidden tabs ([MDN:
requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)),
so the cost is idle-visible CPU/GPU and battery, not background-tab burn.

**Suggested change.** Render-on-demand: skip the frame when no pointer is
active, no hover transition is in flight, and the ambient animation is
config-disabled; or gate ambient layers behind a slow `setInterval`-driven
"needs repaint" flag. Keep the loop only while `spotlightAlpha` or pointer
smoothing is changing.

### F6. Marquee does per-char layout reads and margin writes every frame

**What/where.** `initGravitationalDistortion` (`js/ui/marquee.js:95-157`) adds
a `gsap.ticker` callback that, each frame, calls `getBoundingClientRect()` on
the widget and on **every `.mq-char` span** (lines 100-114), then writes
`style.marginLeft`/`style.marginRight` and `style.transform` per char
(lines 150-154). Runs on the main index page (`index.html:167` loads
`marquee.js`; the marquee markup is at `index.html:72`).

**Why it costs.** `getBoundingClientRect()` forces layout; margins are
layout-affecting properties, so the writes invalidate layout that the next
frame's reads recompute — a read/write layout cycle per frame across
potentially hundreds of spans (the code splits the whole marquee text into
one span per character, `js/ui/marquee.js:74-93`, then clones it, line 46).
Existing mitigation: reads are batched before writes (comment at line 109),
which avoids interleaved thrashing but not the O(chars) layout cost itself.

**Suggested change.** Cheap culling: compute each char's position from the
previous frame plus the known marquee velocity and only measure chars near the
`influenceRadius` (350 px, line 4); replace the margin squeeze with a
transform-only approximation; gate the ticker with an `IntersectionObserver`
so off-screen marquees cost nothing.

### F7. Calendar zoom caustics: per-second layout polling + continuous fluid sim

**What/where.** `WebGLCaustics` (attached only while the calendar zoom pane is
active, `js/pages/calendar/index.js:1046-1078`) sets
`this.obstacleTimer = setInterval(() => this.updateObstacleMap(), 1000)`
(`js/ui/webglCaustics.js:358`). Each tick runs
`querySelectorAll('.ch-day, rect, .cal-nav-btn')` and
`getBoundingClientRect()` per cell (lines 492-496) — roughly a year's worth of
day cells — then re-uploads the obstacle texture. Meanwhile `step()` runs a
full fluid sim per frame including a 20-iteration Jacobi pressure solve
(line 617) at 128² plus a 512² dye advection.

**Why it costs.** A full-layout measurement burst every second (the comment at
line 357 says it exists "in case calendar renders late") plus continuous GPU
sim even when the pointer never enters the pane. The sim's ambient splat
(line 590) means it never idles.

**Suggested change.** Replace the 1 s polling with event-driven updates (the
calendar already knows when it re-renders; `updateObstacleMap` is also called
from the ResizeObserver at line 351). Consider pausing the sim when the dye
has fully dissipated and the pointer is inactive.

### F8. Liquid-glass refraction rebuilds: synchronous PNG encode on resize

**What/where.** `LiquidGlassRefraction.update()`
(`js/ui/liquidGlassRefraction.js:463-537`) rebuilds the displacement map on any
geometry change: a per-pixel loop with SDF/trig work in the bezel band
(`buildDisplacementMap`, lines 178-230) followed by
`this.canvas.toDataURL('image/png')` (line 523) — a synchronous PNG encode on
the main thread. A `ResizeObserver` on the element (line 353) triggers this;
terminal panes and the calendar zoom pane both attach instances.

**Why it costs.** Existing mitigations are real: a geometry-string cache skips
no-op updates (lines 498-502), `mapScale: 0.5` quarters the pixel count
(default at line 306), and updates are rAF-batched (lines 452-461). What
remains is the synchronous `toDataURL` encode and the map rebuild firing during
animated resizes (the terminal zoom tween explicitly drives `syncResize()` per
frame, `js/ui/tableGlassEffect.js:310-312`).

**Suggested change.** Debounce ResizeObserver-driven rebuilds to end-of-resize;
prefer async `canvas.convertToBlob()`/`toBlob()` over `toDataURL` (also avoids
the base64 string, which is ~33% larger than the binary PNG).

### F9. `loadPerformanceSeries` re-fetches `balance_series.json`

**What/where.** `js/transactions/dataLoader.js:290` fetches
`../data/output/balance_series.json` inside `loadPerformanceSeries` to find
the last balance point — the same file `loadPortfolioSeries` already fetched
and normalized at lines 113-127 of the same module.

**Why it costs.** One duplicate fetch + JSON parse (~471 KB) per terminal load;
harmless to correctness but pure waste, and un-cacheable under F1.

**Suggested change.** Share the loaded balance series between the two
functions (module-level promise cache, or pass through from the caller).

### F10. Pipeline: `update_daily_pnl.py` fetches prices sequentially per ticker

**What/where.** `calculate_daily_values_with_date`
(`scripts/pnl/update_daily_pnl.py:67-71`) loops over holdings calling
`yf.Ticker(ticker).history(period="5d")` one at a time. `main()` can invoke it
twice in one run — once to bootstrap the header (line 234) and once for the
actual values (line 244).

**Why it costs.** One network round-trip per holding, serialized, on every
daily update — the dominant cost of that workflow. In-repo precedent for the
fix exists: `scripts/twrr/step03_fetch_prices.py:122` batches with
`yf.download(batch)`, and `scripts/generate_pe_data.py:707,1121,1501` uses
`ThreadPoolExecutor(max_workers=10)`.

**Suggested change.** Replace the loop with a single `yf.download(tickers,
period="5d")` batch call (with the existing per-ticker fallback for failures),
and compute the header from the same fetch result instead of fetching twice.

### F11. Pipeline: per-symbol full-frame rescan in `prepare_frontend_data.py`

**What/where.** `scripts/prepare_frontend_data.py:66-68` loops over unique
symbols and filters the full melted price frame per symbol
(`prices_df[prices_df['symbol'] == symbol]`), an O(symbols × rows) scan.

**Why it costs.** Runs only on a forced rebuild (`FORCE_REBUILD_HISTORICAL_JSON`,
line 22), so impact is low; the fix is a one-liner.

**Suggested change.** Iterate `prices_df.groupby('symbol')` once instead.

## Existing performance mechanisms (gaps only flagged above)

- `performance/benchmark_composition_data.py` and `benchmark_fx_json.py`
  benchmark the two historical hot spots. Measured this session: composition
  calc runs 0.28 s on 5000 days × 50 tickers synthetic data (the O(N) date scan
  is already replaced by `bisect` at `scripts/generate_composition_data.py:78`);
  the FX-JSON `itertuples` → `to_dict(orient='index')` rewrite measured 1.74×
  (0.0137 s → 0.0079 s on 5000 rows) and is already shipped in
  `scripts/ratios/calculate_ratios.py:55-60`.
- Chart redraws are rAF-batched (`js/transactions/chart/interaction.js:812,847`),
  and crosshair hover handlers avoid closure allocations (`interaction.js:109,224`).
- Split-adjustment, timestamp, and FX-rate caches:
  `js/transactions/calculations.js:4,95`, `js/transactions/utils.js:30`.
- The 8.3 MB `historical_prices.json` is fetched lazily and memoized in
  `transactionState` (`js/transactions/chart/renderers/contribution.js:153-160`,
  `js/transactions/terminal/snapshots.js:1206-1226`).
- Table rows are inserted via `DocumentFragment` batching
  (`js/services/dataService.js:480,515`).
- Touch/scroll/pointer listeners are mostly `{ passive: true }`
  (e.g. `js/ui/tableGlassEffect.js:250-280`).
- Navigation warm-up: `js/ui/nav_prefetch.js` + speculation-rules prerender
  (`index.html:170-184`); production service worker
  (`js/ui/service_worker_register.js`).
- Monte Carlo analysis already runs in a Web Worker
  (`js/pages/analysis/monte_carlo.worker.js`).
- Pipeline concurrency precedent: `ThreadPoolExecutor` in
  `scripts/generate_pe_data.py`, batched `yf.download` in
  `scripts/twrr/step03_fetch_prices.py`.

## Open questions / what I couldn't verify

- **Real frame times.** No browser profiling was done (read-only session);
  F5/F6/F7/F8 impacts are inferred from code structure, not measured flame
  graphs. Verify with Chrome DevTools performance capture before prioritizing.
- **Whether the cache-busting is load-bearing.** It may exist to work around a
  specific stale-cache incident or an aggressive service-worker strategy in
  `sw.js` (not inspected). If the SW caches data URLs with a cache-first
  strategy, removing the query param changes freshness semantics — check the SW
  strategy first.
- **GitHub Pages response headers** for `data/` files (ETag/`Cache-Control`
  values) were not fetched (no network in this session); F1's "304 instead of
  200" claim assumes standard Pages behavior.
- **Whether `fetchRealTimeData`'s three call sites can observe different data.**
  Memoizing assumes live prices don't materially change within one page load;
  if intra-load refresh is intentional, single-flight dedup (not full memo) is
  the safe version of F2.
- **Marquee char count** at runtime was not measured; F6's severity scales with
  the number of `.mq-char` spans.
- **Benchmark representativeness.** Both `performance/` benchmarks run on
  synthetic data; I ran them as-is and did not profile the real pipeline inputs.
