# Calendar renderer migration (SVG/D3 → DOM/CSS)

**Status: in progress. Step 5 of 6 done.** This is a living handoff doc — if work
stops mid-stream (token/rate limits, new session, different agent), read this
first, then continue from "Remaining steps". Update the status line and the
checklist as you go.

## Goal

Replace the vendored **Cal-Heatmap (D3 + SVG)** calendar engine on
`calendar/index.html` with a hand-rolled **DOM `<div>` grid + CSS** renderer,
removing `js/ui/cal-heatmap-src/` (216K, 36 TS files) and the `d3` + `cal-heatmap`
`<script>` tags. Do it **in parallel behind a flag** so the SVG version keeps
working and rollback is instant, then delete the SVG path only once the DOM path
has earned it.

## Why (decision record)

- A month is a trivial 7-row CSS grid; the SVG engine reimplements layout that
  the browser does for free, and drags in D3 — the single biggest violation of
  this repo's vanilla / no-build thesis.
- A throwaway spike proved a pure DOM/CSS calendar reaches **near-visual-parity in
  ~200 lines**. The one gap is the specular glass "pillow" (see Gotchas).
- The page (`js/pages/calendar/index.js`, ~1.3k lines) is **deeply coupled** to
  Cal-Heatmap's SVG DOM (it reaches in with `d3.select(...).selectAll('text.ch-subdomain-text')`,
  `.datum()`, `cal.on('fill'|'date-change')`, and `bevelGlassPlugin` mutating
  `<rect>`s). So the migration is mostly **decoupling + test rewrite**, not drawing
  a grid.

## The seam (the enabling abstraction)

The page now talks only to a backend-agnostic interface, never to a concrete
engine. Files under `js/pages/calendar/renderers/`:

| File                  | Role                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `CalendarRenderer.js` | The contract (abstract base): `paint`, `next`, `previous`, `jumpTo`, `on`, `destroy`.              |
| `SvgRenderer.js`      | Thin adapter wrapping the vendored Cal-Heatmap; forwards every call unchanged.                     |
| `index.js` (factory)  | `createCalendarRenderer()` — picks impl from `CALENDAR_RENDERER` (config); `?renderer=` overrides. |

`js/pages/calendar/index.js` constructs the calendar via
`createCalendarRenderer()` (not `new CalHeatmap()`). **Flipping the renderer (and
rolling back) is a one-line change in the factory + the query flag.**

### Contract notes (what DomRenderer must honour)

- `paint(config)` takes the existing Cal-Heatmap-shaped config object (see
  `paintConfig` built in `index.js`'s `initCalendar`, and `CALENDAR_CONFIG` in
  `js/config.js`). Returns a Promise that settles when painting is done.
- `next(n)/previous(n)/jumpTo(date, reset)` — defaults `n=1`, `reset=false`.
- `on(name, fn)` — must emit at least **`'fill'`** (after each paint/fill) and
  **`'date-change'`** (on navigation, with `{ domain: { start, end } }`); the page
  drives data refetch + post-paint off these. See `setupEventListeners` and
  `attachDateChangeHandler` in `index.js`.
- `renderState({ byDate, state, currencySymbols, isInitialLoad })` — **(added Step 3)**
  paints data-derived visual state: per-currency cell colours, bevel/glass, and
  (when `state.labelsVisible`) per-cell labels. The page calls this after each
  paint/fill and on currency change via `schedulePostPaintUpdates`; it no longer
  touches d3/SVG itself. Each backend implements it for its own DOM:
    - `SvgRenderer.renderState` runs `applyCurrencyColors` + `applyBevelGlass` +
      `renderLabels` (the SVG label code now lives in `renderers/svgLabels.js`), and
      **owns the first-paint stagger** (colour → frame → bevel → frame → labels).
    - `DomRenderer.renderState` recolours `<div>` cells for the active currency and
      renders/clears per-cell label spans (no stagger needed).

## Done so far

- [x] **Step 1 — seam + SvgRenderer, proven no-op.** `make verify` green (2459 JS +
      363 Py). Behaviour identical; nothing user-visible changed.
- [x] **Step 2 — `DomRenderer` built + wired.** `js/pages/calendar/renderers/DomRenderer.js`
      implements the interface with a CSS grid of `<div>` cells (no D3/SVG): per-month
      grid (rows=weekday, `grid-auto-flow: column`, leading blanks), diverging colour
      scale read from `config.scale.color` over `config.data.y`, today highlight,
      min/max-bounded `next`/`previous`/`jumpTo` calling `onMin/MaxDomainReached`, and
      `'fill'`/`'date-change'` events. Factory's `dom` branch returns it; styles are
      self-injected (one `<style id="domcal-styles">`). Verified visually via
      `?renderer=dom` screenshot (close parity with SVG). Unit test:
      `tests/js/pages/calendar/domRenderer.test.js`. `make verify` green (2465 JS + 363 Py).

- [x] **Step 3 — post-paint pipeline moved behind the interface.** `index.js` no longer
      imports/calls `d3`, `applyCurrencyColors`, `applyBevelGlass`, `updateMonthLabels`,
      `ensureEntryDisplay`, or defines `renderLabels` (verified: only stale comments
      mention d3). `queuePostPaintFrame` now calls `cal.renderState(ctx)`. Added
      `renderState` to the interface; `renderLabels` relocated to
      `renderers/svgLabels.js`; first-paint stagger moved into `SvgRenderer.renderState`.
      **The two Step-2 gaps are now closed in DOM mode:** currency-toggle recolour and
      per-cell P/L labels both work via `DomRenderer.renderState`. Tests:
      `paintStaggering.test.js` rewritten against `SvgRenderer`; `renderLabels` tests
      re-pointed to `svgLabels.js`; DOM recolour/label tests added to `domRenderer.test.js`.
      Both renderers verified by screenshot. `make verify` green (2468 JS + 363 Py).
      Note: the default `make screenshot` 1200ms wait can race the entrance fade-in —
      use `--wait 2500` for the calendar.
- [x] **Step 4 — visual parity pass (pure CSS, no SVG).** Closed the glass-"pillow" gap in
      `DomRenderer` by adding a radial-gradient `DOME` highlight layer and **fixing the
      light direction** (the spike was lit upper-left; SVG is upper-right — flipped `EDGE`
      to `225deg` and the inset shadows to match). Side-by-side zoomed screenshots
      (SVG vs DOM) now show negligible difference — raised-glass dome present, same colours
      and layout. Stayed 100% DOM/CSS (chosen over the inline-SVG-filter option).
      `make verify` green (2468 JS + 363 Py).
- [x] **Step 5 — config knob added; default = `svg`.** Added **`CALENDAR_RENDERER`** in
      `js/config.js` (`'svg' | 'dom'`) as the single source of truth;
      `resolveRendererName()` reads it, and a `?renderer=dom|svg` query param overrides at
      runtime for A/B comparison. **Default is `svg`** — the DOM glass bevel was judged not
      yet at parity (the specular "pillow" gap reads as larger in the live page than in
      static crops), so users keep the polished SVG glass while DOM stays one word away.
      Verified by Playwright probe: default → 91 SVG / 0 DOM; `?renderer=dom` → 91 DOM / 0
      SVG. `index.test.js` also pins `?renderer=svg` in `beforeEach` (robust safeguard) so
      its Cal-Heatmap-mock integration tests stay valid. `make verify` green (2468 JS + 363 Py).
      **To switch the site to DOM:** set `CALENDAR_RENDERER = 'dom'` in `js/config.js`.

### Step 1 also fixed a pre-existing test-isolation bug (don't reintroduce it)

`tests/js/pages/calendar/index.test.js` had a latent bug the old code masked:

- Some tests do `jest.spyOn(dateUtils, 'getNyDate')...mockRestore()`. On a
  `jest.mock`-factory fn, `mockRestore()` leaves it returning **`undefined`**,
  which made `initCalendar()` throw (at `todayNy.getFullYear()`) for every _later_
  test that relied on the default. Those tests then hit guarded `if (handler)`
  blocks that never ran — **vacuous green**.
- The old date-change tests "passed" only by reading a `__dateChangeHandler`
  property that **persisted across tests** (clearAllMocks doesn't delete custom
  props). That leak is removed.

Fixes applied (keep them):

1. `beforeEach` re-establishes `dateUtils.getNyDate.mockImplementation(...)` after
   `clearAllMocks()`.
2. date-change tests fetch the handler via `on.mock.calls.find(c => c[0]==='date-change')`,
   not the deleted property.
3. Newly-real tests got the mocks they always needed: synthetic events carry
   `target: { blur }`, `mockElement.querySelector` returns `null`, `todayBtnRef`
   has `dispatchEvent`.

## Remaining steps

- [ ] **Step 5b — close the glass-bevel gap so `dom` is shippable.** Improve
      `DomRenderer`'s glass until it matches the SVG on the _live page_ (see Gotcha 1 for
      options: richer pure-CSS bevel, or an inline `<svg><filter>`). Done when flipping
      `CALENDAR_RENDERER='dom'` looks as good as `svg` in Chrome.
- [ ] **Step 6 — flip the knob, then delete the SVG path** (only after 5b): set
      `CALENDAR_RENDERER='dom'`, then remove `js/ui/cal-heatmap-src/`, the `d3` +
      `cal-heatmap` `<script>` tags in `calendar/index.html`, `bevelGlassPlugin.js`,
      `SvgRenderer.js`/`svgLabels.js`, and the **SVG-specific tests only** (see test
      split). Keep renderer-agnostic tests. **Irreversible — do on a branch.**

## Test strategy (per the agreed plan)

**Do not blanket-delete the calendar tests.** Split them:

- **Keep (renderer-agnostic logic):** `colorUtils.test.js`, `displayCache.test.js`,
  `xss_repro.test.js` (security regression — especially keep), and the
  data-mapping/keyboard/currency logic in `index.test.js`.
- **Rewrite against the DOM (SVG-specific):** `bevelGlass.test.js`,
  `paintStaggering.test.js`, the SVG-asserting parts of `index.test.js`, and the
  `tspan` assertions in `calendarMonthLabelManager.test.js`.
- New regression tests accrete **on top of** the kept suite as bugs surface — not
  instead of it.

## Gotchas

1. **The specular glass "pillow" — partially closed, NOT yet at full parity.** The SVG
   bevel (`js/pages/calendar/bevelGlassPlugin.js`) uses `feSpecularLighting` +
   `feDistantLight` (azimuth 315 = upper-right) + an `objectBoundingBox` gradient stroke
   on each `<rect>`. `DomRenderer` approximates it with three stacked background layers —
   `DOME` (radial highlight), the colour fill, and `EDGE` (directional rim) — plus
   directional inset box-shadows, all lit upper-right (the light direction matters; an
   earlier spike was mistakenly upper-left). Static zoom crops look close, **but on the
   live page the gap reads as significant** — so the default knob stays `svg`. **Open
   work to flip to `dom`:** either push the pure-CSS bevel further (layered radial
   highlights / a soft top-edge gloss / per-cell `::before` sheen) or adopt the
   inline-`<svg><filter>` route (`filter: url(#domcal-bevel)` on DOM cells, reusing
   `feSpecularLighting`) for pixel parity with ~30 lines of SVG defs and no D3.
2. **Glass is visual — verify in Chrome, not tests.** Unit tests cannot see a
   bevel. Per `CLAUDE.md` / `docs/ai_native_repo_structure.md` §17C, a visual
   change is verified by looking at the rendered page (`make screenshot`).
3. **Month layout flow.** Cal-Heatmap's horizontal month = days flow down each
   week-column then across (rows = weekday). The spike matched this with
   `grid-template-rows: repeat(7, …); grid-auto-flow: column;` + leading blank
   cells for the first weekday offset.
4. **Don't let changes leak to other pages** (terminal glass, etc.).

## Spike reference

A working DOM/CSS spike (3 months, diverging colors, CSS-only glass) was built and
screenshot-compared to the live page during Step 0. It was a throwaway and is not
in the tree. To recreate: a self-contained `spike-calendar/index.html` at repo
root (served by the screenshot tool) with a CSS `.grid` as above and a `colorFor()`
lerp over the `CALENDAR_CONFIG.scale` stops. `node scripts/screenshot.mjs
/spike-calendar/` to shoot.

## Verify

`make verify` (lint + types + sec + tests) must stay green at every step.
Scoped loop: `npx jest tests/js/pages/calendar/`.
