# LCP performance bottlenecks

## The question

For the four static pages — `index.html`, `calendar/index.html`,
`position/index.html`, `terminal/index.html` — what delays the render of the
Largest Contentful Paint (LCP) element, i.e. the last/largest visual element in
the initial viewport, and how could each page paint it sooner?

Method: read-only tracing of HTML entry points, the JS boot chains
(`js/pages/<page>/`, `js/services/dataService.js`, `js/transactions/`), the CSS
they load, and on-disk asset sizes (`ls -la`). No server was run and no lab
measurement (Lighthouse, DevTools trace) was taken — element identification is
inferred from the LCP eligibility rules, not observed. The LCP rules used
below come from the W3C spec
(<https://w3c.github.io/largest-contentful-paint/#sec-reporting-contentful-paint>,
§4.2–4.3) and web.dev (<https://web.dev/articles/lcp>).

Two eligibility facts shape everything on this site:

- **Candidate types are limited** to `<img>`, `<svg><image>`, `<video>`
  (poster/first frame), elements with a `url()` background image, and text
  blocks ([web.dev: What elements are considered](https://web.dev/articles/lcp)).
  **`<canvas>` is not a candidate** — the position page's pie chart and every
  terminal chart cannot be LCP no matter how late they render.
- **Chromium excludes full-viewport "background" elements** ("Elements that
  cover the full viewport, that are likely considered as background rather than
  content" — web.dev; normatively, the spec's effective-visual-size algorithm
  returns null when the element's intersection rect equals the viewport, §4.3
  step 7). So the ~600 KB AVIF `body` background images and the 100vw×100vh
  mobile background video are **not** LCP candidates despite dominating the
  visual field.
- Text painted with a web font during the font block period doesn't count until
  the font arrives (web.dev: "Neither are text nodes using web fonts during the
  font block period"); elements at `opacity: 0` are not candidates either.

So on these pages LCP is almost always a **text block** (nav icons, currency
toggles, calendar labels, terminal prompt) or the small banner `<img>` — and the
bottlenecks are the things that delay _text paint_: render-blocking CSS chains,
web fonts, JS-gated reveals, and (on calendar) a long data waterfall.

## The answer (per-page bottleneck summary)

- **`index.html` (landing):** Likely LCP is the `.mobile-banner` `<img>`
  (`assets/banners/banner.png`, 20.7 KB) or nav-icon text. The banner already
  has `fetchpriority="high"` (index.html:125) but is **invisible until a
  deferred script reveals it**: `imageFallback.js` only adds
  `is-fallback-ready` after the image's `load` event, flipping `opacity: 0` →
  visible with a 0.3 s transition (css/main_index.css:45-51, 98-107;
  js/loader/imageFallback.js). Everything is queued behind **8 render-blocking
  stylesheets** (index.html:61-68) plus two parser-blocking classic scripts in
  the body (`scroll_control.js` index.html:144, `gsap.min.js` 71.5 KB,
  index.html:163). The big visuals people notice (597 KB `main_background.avif`
  body background via css/main_index.css:22-27; the 100vw×100vh background
  video, index.html:108-119) are excluded from LCP as full-viewport
  backgrounds, so this page's LCP is cheap elements made late by CSS/JS
  sequencing.
- **`calendar/index.html` (worst chain):** Likely LCP is the calendar's
  month/day label text or the `.page-center-wrapper` content — gated by the
  longest load chain of the four pages: **11 render-blocking stylesheet links**
  (calendar/index.html:49-59, with Font Awesome **linked twice** at :49 and :81),
  **two parser-blocking scripts in `<head>`** — `d3.v7.min.js` (280 KB) and
  `cal-heatmap.js` (75 KB) at calendar/index.html:82-83 — then the module graph
  (calendar/index.html:182), then a **data waterfall**: `getCalendarData` →
  `fetchData` (js/services/dataService.js:527-534) fetches the 136 KB
  historical CSV, `fx_data.json`, and `fetchPortfolioData()`, which is
  **internally serial**: `holdings_details.json` first, _then_ a cross-origin
  Cloudflare Worker call with no preconnect (js/services/dataService.js:60-83;
  `CF_WORKER_URL` at js/config.js:37). Only after `cal.paint()` and a rAF does
  `.calendar-ready` land (js/pages/calendar/index.js:962, 976-987), starting a
  **0.5 s opacity fade from `opacity: 0`** (css/calendar.css:337-352; nav
  controls add a further 0.15 s delay, css/calendar.css:135-145). Elements are
  LCP-invisible while at opacity 0, so the entrance animation itself postpones
  the LCP timestamp beyond the data wait.
- **`position/index.html`:** The likely LCP is small early text (nav icons /
  currency toggles) — the pie chart is `<canvas id="fundPieChart">`
  (position/index.html:113-118), not LCP-eligible, and the holdings table
  starts hidden (`.content-block hidden`, position/index.html:155-157). So the
  _metric_ is probably fine while the _perceived_ main content arrives very
  late through the longest script waterfall: an inline loader
  (position/index.html:200-241) `await`s `assets/vendor/js/chart.umd.js`
  (**398,875 B — the non-minified build**; the min build is 205,749 B) then
  `chartjs-plugin-datalabels.js` **sequentially**, and only then injects the
  page module — so the entire ES-module graph doesn't start downloading until
  two vendor scripts have arrived. Then `startApp` awaits `fx_data.json`
  (js/pages/position/index.js:152-161), burns **two rAF frames**
  (js/pages/position/index.js:204-210), and
  `loadAndDisplayPortfolioData` **awaits the PER-column data before drawing the
  chart** — `fetchMarketRatiosForTickers` (analysis index + ticker metadata +
  `forward_pe.json` + one JSON per ticker) at js/services/dataService.js:1039
  precedes `updatePieChart` at js/services/dataService.js:1064, though the pie
  itself needs none of it. Seven logo `<link rel="preload">`s
  (position/index.html:70-76) spend early bandwidth on images that are only
  drawn into canvas and can never be LCP.
- **`terminal/index.html`:** The terminal pane's background is a
  `linear-gradient` (css/terminal/terminal.css:12-18) — not an image candidate —
  and the output area starts empty (`initTerminal` only wires handlers;
  js/transactions/terminal.js:286-450). Likely LCP is the prompt text
  `lz@fund:~$` (terminal/index.html:152) or nav icons. The concrete bottleneck:
  the page's own `@font-face` for JetBrains Mono **lacks `font-display`**
  (css/terminal/base.css:24-29 — unlike css/base.css:2-37, which sets
  `font-display: swap` on all five faces), and the 92 KB
  `JetBrainsMono-Regular.woff2` is **not preloaded** (only FontAwesome is,
  terminal/index.html:72-78). Body/prompt text uses
  `var(--font-family-mono)` (css/terminal/base.css:15, 75), so it can sit
  invisible through the font block period. **10 render-blocking stylesheets**
  precede it (terminal/index.html:48-56, 79). The heavy data fetches
  (`Promise.all` of transactions.csv 90 KB, balance_series.json 472 KB,
  contribution_series.json 1.41 MB, performance_series.json 832 KB,
  fx_daily_rates.json 148 KB — js/pages/terminal/index.js:239-253, URLs at
  js/transactions/dataLoader.js:125, 139, 226, 269, 362) do **not** gate first
  paint: the table and chart sections start `is-hidden`
  (terminal/index.html:168, 183). They cost TTI/perceived readiness, not LCP.

## Claim-by-claim evidence

### Eligibility rules (external)

- Candidate element types and Chromium's exclusions (opacity-0 elements,
  full-viewport elements, low-entropy placeholders):
  <https://web.dev/articles/lcp> ("What elements are considered?" and the
  Chromium heuristics list). Font block period: same page, "Neither are text
  nodes using web fonts during the font block period".
- Spec basis for the full-viewport exclusion: effective visual size returns
  null "If size is equal to rootWidth times rootHeight" —
  <https://w3c.github.io/largest-contentful-paint/#sec-reporting-contentful-paint>
  (§4.3, step 7). Video poster eligibility is the same spec's candidate
  definition (§2/§4.2 "pending image records").
- `<canvas>` absence from the candidate list: same web.dev list — canvas is
  simply not among the five types.

### Shared (all four pages)

- Every page render-blocks on a stack of small stylesheets before any text or
  image can paint: 8 on index (index.html:61-68), 10 on calendar
  (calendar/index.html:49-59, 81 — 11 `<link>`s, 10 unique; Font Awesome is
  linked twice), 9 on position
  (position/index.html:77-85), 10 on terminal (terminal/index.html:48-56, 79).
  Files are small (1.2–15 KB each; Font Awesome 31 KB), but each is a separate
  render-blocking request.
- Full-viewport body background images, excluded from LCP but competing for
  bandwidth and delaying _perceived_ completeness: `main_background.avif`
  597 KB (css/main_index.css:22-27), `calendar_background.avif` 641 KB
  (css/calendar.css:15-20), `position_background.avif` 626 KB (css/base.css
  `body` rule at ~95-100 — applies to the position page's un-classed body),
  `terminal_background.avif` 652 KB (css/terminal/base.css:78-85), and
  `mobile_bg.avif` 608 KB on narrow screens (css/layout.css:145-170). Sizes
  measured with `ls -la assets/backgrounds/` and `ls -la assets/`.
- The FontAwesome icon font (77 KB woff2) **is** preloaded on all four pages
  (index.html:54-60; calendar/index.html:74-80; position/index.html:63-69;
  terminal/index.html:72-78), and nav icons are `visibility: hidden` until the
  font is known ready (css/base.css:112-114; reveal flag logic in
  js/ui/icon_font_ready.js). So icon text paints early on repeat visits
  (localStorage flag, e.g. index.html:43-51).
- `gsap.min.js` (71.5 KB) is a parser-blocking classic script near the end of
  `<body>` on all four pages (index.html:163; calendar/index.html:177;
  position/index.html:196; terminal/index.html:278) — it delays
  `DOMContentLoaded`, which every page's module entry waits on.

### `index.html`

- The background video (`index.html:108-119`, `preload="metadata"`, poster
  `mobile_bg.jpg` 1.19 MB) is `display: none` on desktop
  (css/main_index.css:31-33) and full-viewport on mobile
  (css/main_index.css:74-88) — excluded from LCP either way (not rendered on
  desktop; full-viewport on mobile).
- The marquee text was statically in the HTML and hidden by `marquee.js` when
  `MARQUEE_CONFIG.enabled` was `false` — it has since been removed entirely
  (`index.html`, `js/ui/marquee.js`, `css/marquee.css`, `MARQUEE_CONFIG`
  deleted), so it can no longer factor into LCP.
- `.mobile-banner` (index.html:120-129) starts `opacity: 0; visibility: hidden`
  (css/main_index.css:45-47, 100-101) and is revealed only when
  `js/loader/imageFallback.js` observes the image's load and adds
  `is-fallback-ready` (css/main_index.css:50-51, 107-108), with a 0.3 s opacity
  transition. The LCP timestamp for it therefore includes: CSS chain → image
  fetch (mitigated by `fetchpriority="high"`) → deferred JS execution → fade.
- Nav icons are the fallback LCP candidate if the banner path is slower; they
  wait on the FontAwesome font (preloaded) and the icon-ready class.

### `calendar/index.html`

- Parser-blocking JS in `<head>`: `<script src="../js/vendor/d3.v7.min.js">`
  and `<script src="../js/vendor/cal-heatmap.js">` at calendar/index.html:82-83
  (280 KB + 75 KB on disk). These must download and execute before the body
  renders at all. d3 is also required later by `d3.csv` in
  js/services/dataService.js:529-530.
- Duplicate stylesheet: Font Awesome is linked at both calendar/index.html:49
  and :81 (same URL, so one network fetch, but still parsed twice).
- Data waterfall: `initCalendar` awaits `getCalendarData(DATA_PATHS)`
  (js/pages/calendar/index.js:760) → `fetchData` parallelizes the historical
  CSV (`DATA_PATHS.historical` = `../data/historical_portfolio_values.csv`,
  136 KB — js/config.js:378-381), `fx_data.json`, and `fetchPortfolioData()`
  (js/services/dataService.js:527-534) — but `fetchPortfolioData` itself awaits
  `holdings_details.json` before firing the price request
  (js/services/dataService.js:60-70), a cross-origin call to
  `https://api.lyeutsaon.com` (js/config.js:37) with no `preconnect` (the HTML
  even notes "Preconnect removed: using local assets only",
  calendar/index.html:23 — stale comment, the Worker is cross-origin).
- Paint gating: `await cal.paint(paintConfig)` at js/pages/calendar/index.js:962,
  then `.calendar-ready` is added inside a rAF (js/pages/calendar/index.js:976-987),
  which starts the wrapper's 0.5 s opacity transition from `opacity: 0`
  (css/calendar.css:337-352). The renderer is SVG by default
  (`CALENDAR_RENDERER = 'svg'`, js/config.js:426;
  js/pages/calendar/renderers/index.js:30-37), so labels are SVG text — still
  text candidates — painted only once the fade begins.

### `position/index.html`

- Sequential vendor waterfall: the inline loader (position/index.html:200-241)
  awaits `loadLocalOrCdn('../assets/vendor/js/chart.umd.js', …)` (:227-230)
  then the datalabels plugin (:231-234), then appends the module
  `../js/pages/position/index.js` (:235-238). `assets/vendor/js/chart.umd.js`
  is 398,875 B; the minified `js/vendor/chart.umd.min.js` is 205,749 B
  (measured with `wc -c`).
- After the module graph: `startApp` awaits the `fx_data.json` fetch
  (js/pages/position/index.js:152-161), then deliberately waits two animation
  frames (js/pages/position/index.js:204-210), then
  `loadAndDisplayPortfolioData` (js/services/dataService.js:1016) awaits
  `fetchPortfolioData` (serial holdings → Worker) and
  `fetchMarketRatiosForTickers(tickerSymbols)` (js/services/dataService.js:1039)
  — which itself fetches `analysis/index.json`, `ticker_metadata.json`,
  `forward_pe.json` (226 B), and one analysis JSON per ticker
  (js/services/dataService.js:20-22, 130-255) — before `updatePieChart` draws
  (js/services/dataService.js:1064). None of this is LCP-visible (canvas +
  hidden table), but it is the page's perceived main content.
- The seven logo preloads (position/index.html:70-76) fetch
  `assets/logos/*.png` (3.5–139 KB each, measured) that are only consumed via
  canvas `imagePlugin` (js/charts/allocationChartManager.js:4) — early
  bandwidth spent on non-candidates.

### `terminal/index.html`

- Font block risk: `@font-face` JetBrains Mono at css/terminal/base.css:24-29
  has no `font-display` (grep confirms none in that file; contrast
  css/base.css:7,14,22,29,37). Default behaviour is the block period, and the
  font file (92 KB, measured) is not preloaded. The prompt
  (terminal/index.html:152) and body text use that family
  (css/terminal/base.css:15, 75).
- Empty content at boot: the terminal output div is empty
  (terminal/index.html:145-150); `initTerminal` registers handlers only
  (js/transactions/terminal.js:286-450 — no welcome print found), so there is
  no large text to beat the prompt until a command runs (and the first
  scroll/input ends LCP anyway per spec §4.2 step 2).
- Data loading is deliberately off the paint path: `loadTransactions()` is
  tracked, not awaited, before interactive use
  (js/pages/terminal/index.js:409), and its six parallel fetches
  (js/pages/terminal/index.js:239-253) fill initially-hidden sections
  (terminal/index.html:168, 183). See docs/terminal-data-readiness.md for the
  rationale.
- Two of the six loads also kick off `fetchRealTimeData()` (single-flight,
  js/transactions/realtimeData.js:130-137) which repeats the serial
  holdings→Worker chain plus `fetchMarketRatiosForTickers` — again,
  TTI/perceived-readiness cost, not LCP.

## Ranked action items (work orders)

Ranked by expected LCP impact. Written for mechanical execution by an
implementation agent. Tags: **[trivial]** = markup/attribute edit only ·
**[low]** = small logic change · **[visual]** = human must review the rendered
page (`make screenshot URL=/<page>/`) · **[skip]** = behavioural change gated
by the diff-coverage CI rule — do NOT attempt without a test that fails before
and passes after; assign to a stronger model.

Rules for the implementer (apply to every item):

- One work order per change. Do not fix unrelated things.
- **Find** strings are unique anchors — if one does not match, STOP and report;
  do not improvise. (Line numbers are from 2026-08-27 and may drift.)
- After editing: `npx prettier --write <files>`, plus `npx eslint <file>` for
  JS and `npx stylelint <file>` for CSS. Run the item's **Verify** commands and
  paste their output into the commit/PR body.
- Never edit anything under `data/`.

### 1. [trivial] [visual] Calendar: stop render-blocking on 355 KB of head JS

- **File:** `calendar/index.html`
- **Find:** the SECOND `<link rel="stylesheet" href="../assets/vendor/css/font-awesome-4.7.0.min.css" />`
  (~:81 — keep the first one at :49), immediately followed by
  `<script src="../js/vendor/d3.v7.min.js"></script>` and
  `<script src="../js/vendor/cal-heatmap.js"></script>`
- **Change:** delete that duplicate FA link; add `defer` to both scripts:
  `<script defer src="../js/vendor/d3.v7.min.js"></script>` and
  `<script defer src="../js/vendor/cal-heatmap.js"></script>`.
- **Why safe:** deferred classic scripts execute in order before module
  scripts, and the page module (`../js/pages/calendar/index.js`) is the only
  consumer of the `d3`/`CalHeatmap` globals.
- **Verify:** `npx jest tests/js/pages/calendar` — if any test or a browser
  console shows `d3 is not defined`, revert and instead MOVE both script tags
  (no `defer`) to just above `<script type="module" src="../js/pages/calendar/index.js"></script>`.

### 2. [trivial] Terminal: fix the font block period

- **File:** `css/terminal/base.css`
- **Find:** the `@font-face` block at :24-29 (`font-family: 'JetBrains Mono';`)
- **Change:** add one line inside it: `font-display: swap;`
- **File:** `terminal/index.html`
- **Find:** the Font Awesome preload `<link rel="preload"` block at :72-78
- **Change:** insert immediately after it:
  `<link rel="preload" href="../assets/fonts/webfonts/JetBrainsMono-Regular.woff2" as="font" type="font/woff2" crossorigin />`
- **Verify:** `npx stylelint css/terminal/base.css`

### 3. [low] [visual] Position: break the script waterfall

- **File:** `position/index.html`, inline loader at :200-241.
- **Change A (bytes):** in the two `loadLocalOrCdn` calls (:227-234), point the
  primary URLs at the minified twins that exist in the SAME directory:
  `../assets/vendor/js/chart.umd.min.js` (206 KB vs 399 KB) and
  `../assets/vendor/js/chartjs-plugin-datalabels.min.js` (13 KB vs 25 KB).
  Also fix the broken chart fallback `'./js/vendor/chart.umd.min.js'` →
  `'../js/vendor/chart.umd.min.js'`.
- **Change B (parallel):** inside `loadScript`, add `s.async = false;` after
  `s.src = src;` (keeps execution in insertion order — datalabels needs the
  `Chart` global at exec time), then replace the two sequential `await`s with
  one `await Promise.all([loadLocalOrCdn(...), loadLocalOrCdn(...)]);`.
  Caveat: if the local chart script ever 404s, its fallback is appended after
  datalabels and the plugin may not register — acceptable, the file ships in
  the repo. If unsure, do Change A only.
- **Change C (optional):** add `<link rel="modulepreload" href="../js/pages/position/index.js" />`
  next to the other preloads (~:70) so the module graph downloads during the
  vendor fetch.
- **Verify:** `npx jest tests/js/pages/position` · visual check of the pie chart.

### 4. [trivial] Position: drop the seven canvas-only logo preloads

- **File:** `position/index.html`
- **Find:** the seven consecutive lines `<link rel="preload" href="../assets/logos/...`
  at :70-76 (`geo.png`, `anet.png`, `goog.png`, `pdd.png`, `oxy.png`, `brk.png`, `vt.png`)
- **Change:** delete all seven lines. The images are drawn into `<canvas>`
  (never LCP) and are fetched again on demand by the chart plugin.
- **Verify:** `npx jest tests/js/pages/position`

### 5. [trivial] Preconnect to the price Worker (calendar, position, terminal)

- **Files:** `calendar/index.html`, `position/index.html`, `terminal/index.html`
  (NOT `index.html` — the landing page never calls the Worker)
- **Find:** the Font Awesome preload block (ends with `crossorigin\n        />`)
- **Change:** insert after it:
  `<link rel="preconnect" href="https://api.lyeutsaon.com" crossorigin />`
- **Also:** if the file contains the comment
  `<!-- Preconnect removed: using local assets only -->` (calendar/index.html:23),
  delete it — it is stale once this line exists.
- **Verify:** `npx prettier --check` on the three files.
- **Not included** [skip]: de-serializing the holdings→Worker chain in
  `fetchPortfolioData` (js/services/dataService.js:60-83) needs a design
  decision (the Worker URL is built from `holdings_details.json` keys) plus
  tests — assign to a stronger model.

### 6. [low] [visual] Calendar: don't gate LCP on the entrance fade

- **Files/anchors:** `.page-center-wrapper` rule with `opacity: 0` at
  css/calendar.css:337-354; the `requestAnimationFrame` block adding
  `calendar-ready` at js/pages/calendar/index.js:975-985.
- **Change (minimal variant):** in the base rule remove `opacity: 0;` and drop
  `opacity 0.5s ...` from the `transition` list (keep the transform parts);
  leave the JS and the `.calendar-ready` rule untouched so the zoom transition
  still works. The pane then paints as soon as SVG labels render instead of
  after a 0.5 s fade.
- **Verify:** `npx stylelint css/calendar.css` · `npx jest tests/js/pages/calendar`
  · human visual review of `/calendar/`.

### 7. [low] [visual] Index: reveal the banner without the JS gate

- **File:** `css/main_index.css` — two `.mobile-banner` rules start with
  `opacity: 0; visibility: hidden;` (:45-47 desktop block, :100-101 in the
  `max-width: 768px` query), each followed by a `.mobile-banner.is-fallback-ready`
  rule (:50-53, :107-108).
- **Change:** in each base rule set the ready values directly (`opacity: 0.2;`
  desktop, `opacity: 0.5;` mobile, `visibility: visible;`) and delete both
  `.is-fallback-ready` rules.
- **File:** `js/loader/imageFallback.js` — delete the three places that toggle
  the class: `el.classList.remove('is-fallback-ready');` (:20),
  `el.classList.add('is-fallback-ready');` (:29), and the
  `else if (el.complete && ...)` branch (:37-39). Keep the error-fallback logic.
- **Verify:** `npx stylelint css/main_index.css` · `npx eslint js/loader/imageFallback.js`
  · `make screenshot URL=/` for human review.

### 8. [skip] Position: don't let the PER column gate the chart

`loadAndDisplayPortfolioData` (js/services/dataService.js:1016-1065) awaits
`fetchMarketRatiosForTickers` (anchor:
`const marketRatiosByTicker = await fetchMarketRatiosForTickers(tickerSymbols);`)
before `updatePieChart`, though the pie needs none of it. Splitting it requires
a two-phase render (chart first, PER cells later) plus new tests — assign to a
stronger model.

### 9. [skip] Consolidate the 8–11 render-blocking stylesheets per page

No build step exists, so this means hand-merging CSS files and editing every
`<link>` plus the `CORE_ASSETS` list in `sw.js`. Wide blast radius for a
stylistic win; do only with human direction.

## Open questions / what I couldn't verify

- **Which element Chrome actually selects as LCP on each page.** All element
  identifications above are inferred from markup, CSS visibility, and the LCP
  eligibility rules — no Lighthouse/WebPageTest run, no `PerformanceObserver`
  capture was performed (this was a read-only analysis; `performance/` only
  contains two Python benchmarks and a Plotly demo page, no LCP tooling).
  A DevTools trace would also settle how the half-transparent panes are
  scored.
- ~~Whether the marquee ever paints before being hidden~~ — moot: the marquee
  markup, `js/ui/marquee.js`, `css/marquee.css`, and `MARQUEE_CONFIG` have been
  removed as dead code.
- **Real network timing.** GitHub Pages response headers, HTTP/2 behaviour,
  and the Cloudflare Worker's latency were not measured; all waterfall costs
  are structural (which requests wait on which), not quantified in
  milliseconds.
- **The exact cost of the entrance fades.** `opacity: 0` elements are LCP
  candidates only once they become paintable; how Chrome timestamps a
  mid-fade text block (first non-zero-opacity frame vs. transition end) wasn't
  verified against a live trace.
- **Whether `defer` ordering for the calendar vendor scripts is safe here** —
  deferred classic scripts execute before later module scripts in practice,
  but the SvgRenderer's dependency on the global `d3`/`CalHeatmap` should be
  re-verified if item 1 is implemented (the DOM renderer behind
  `?renderer=dom` doesn't need d3 — docs/calendar-renderer-migration.md).
- **Service worker effect.** `sw.js` (registered on all pages,
  e.g. terminal/index.html:286-291) may serve cached data/fonts on repeat
  visits and change the waterfalls substantially; its caching strategy was not
  inspected.
