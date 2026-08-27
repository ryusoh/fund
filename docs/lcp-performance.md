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
bottlenecks are the things that delay *text paint*: render-blocking CSS chains,
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
  **internally serial**: `holdings_details.json` first, *then* a cross-origin
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
  *metric* is probably fine while the *perceived* main content arrives very
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
  bandwidth and delaying *perceived* completeness: `main_background.avif`
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
- The marquee text is statically in the HTML (index.html:72-83) but
  `js/ui/marquee.js:13-19` sets `display: none` when `MARQUEE_CONFIG.enabled`
  is `false` — and it is (js/config.js:742-744). Module scripts run before
  first paint in practice, so the marquee is very unlikely to be the LCP.
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

## Ranked action items

Ordered by expected LCP impact; each is tied to the evidence above. Per AGENTS.md
conventions, visual/behavioural changes need `make precommit-fix` green and, for
the visual ones, human review of the rendered page.

1. **Calendar: stop render-blocking on 355 KB of head JS.** Move
   `d3.v7.min.js` and `cal-heatmap.js` out of `<head>` (calendar/index.html:82-83)
   — e.g. `defer` them (defer scripts execute before the module entry) or
   preload them and keep them off the critical path. This unblocks *all* first
   paint on the worst page. Also drop the duplicated Font Awesome link
   (calendar/index.html:81).
2. **Terminal: fix the font block period.** Add `font-display: swap` to the
   `@font-face` at css/terminal/base.css:24-29 and add a
   `<link rel="preload" as="font" crossorigin>` for
   `JetBrainsMono-Regular.woff2` in terminal/index.html — the prompt text is
   the likely LCP and can currently sit invisible until the 92 KB font arrives.
3. **Position: break the script waterfall.** Point the loader at the minified
   Chart.js (`js/vendor/chart.umd.min.js`, 206 KB vs 399 KB), load Chart.js and
   datalabels **in parallel** instead of sequential `await`s
   (position/index.html:225-234), and add `<link rel="modulepreload">` for
   `../js/pages/position/index.js` so the module graph downloads during the
   vendor fetch instead of after it (currently injected at :235-238).
4. **Position: don't let the PER column gate the chart.** In
   `loadAndDisplayPortfolioData` (js/services/dataService.js:1016-1065), render
   the pie as soon as holdings+prices land and fill PER cells when
   `fetchMarketRatiosForTickers` resolves — the chart needs none of that data.
   (Perceived-main-content win; LCP-neutral since the chart is canvas.)
5. **Break the serial holdings→Worker leg in `fetchPortfolioData`**
   (js/services/dataService.js:60-83): fire the Worker price call without
   awaiting `holdings_details.json` first (derive the symbol list from a static
   file or request in parallel), and add
   `<link rel="preconnect" href="https://api.lyeutsaon.com">` to the three
   pages that hit it. This shortens calendar's LCP chain and position's
   chart-paint chain by one round-trip plus TLS setup.
6. **Calendar: paint before the entrance fade finishes.** The
   `opacity: 0` → `calendar-ready` gate (css/calendar.css:337-352 +
   js/pages/calendar/index.js:976-987) postpones LCP by the data wait plus up
   to ~0.5 s of fade. Consider rendering the pane visible-but-empty immediately
   (its skeleton is static HTML) or dropping the opacity gate on first load.
   Visual — human review required.
7. **Index: reveal the banner without the JS gate.** `.mobile-banner` waits for
   deferred `imageFallback.js` to add `is-fallback-ready`
   (css/main_index.css:45-51, 100-108). Make the no-JS default visible and let
   the fallback script only *swap* the source on error, so the
   `fetchpriority="high"` image paints as soon as it decodes. (Small absolute
   win; the page's LCP is already a 20.7 KB PNG.)
8. **All pages: consolidate or defer non-critical CSS.** 8-10 separate
   render-blocking stylesheets per page (evidence above) stretch the
   pre-first-paint phase; merging the always-needed ones (or inlining critical
   rules) removes several request round-trips from every LCP chain at once.
9. **Position: drop or down-prioritize the seven logo preloads**
   (position/index.html:70-76) — the images are canvas-only, never LCP
   candidates, and compete with the critical path.

## Open questions / what I couldn't verify

- **Which element Chrome actually selects as LCP on each page.** All element
  identifications above are inferred from markup, CSS visibility, and the LCP
  eligibility rules — no Lighthouse/WebPageTest run, no `PerformanceObserver`
  capture was performed (this was a read-only analysis; `performance/` only
  contains two Python benchmarks and a Plotly demo page, no LCP tooling).
  A DevTools trace would also settle how the stroke-only marquee text and the
  half-transparent panes are scored.
- **Whether the marquee ever paints before being hidden.** `marquee.js` hides
  it when disabled (js/ui/marquee.js:13-19; js/config.js:742-744), and module
  scripts normally run before first paint — but if it ever painted first, its
  huge text would dominate index's LCP.
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
