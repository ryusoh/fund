# Calendar renderer migration (SVG/D3 → DOM/CSS)

**Status: in progress. Step 2 of 6 done.** This is a living handoff doc — if work
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

| File                  | Role                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| `CalendarRenderer.js` | The contract (abstract base): `paint`, `next`, `previous`, `jumpTo`, `on`, `destroy`. |
| `SvgRenderer.js`      | Thin adapter wrapping the vendored Cal-Heatmap; forwards every call unchanged.        |
| `index.js` (factory)  | `createCalendarRenderer()` — picks impl. **Default `svg`; `?renderer=dom` opt-in.**   |

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
- The page's **post-paint pipeline** (`applyCurrencyColors`, `applyBevelGlass`,
  `renderLabels` via `schedulePostPaintUpdates`) is **still SVG/d3-specific and
  still lives in `index.js`**. It is NOT behind the interface yet — that's Step 3.
  DomRenderer will need its own coloring/label/bevel path; do not assume the
  existing pipeline works against DOM cells.

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

    **Known gaps deferred to Step 3 (DO NOT assume these work in DOM mode yet):**
    - **Currency-toggle recolour without repaint.** The page recolours on
      `currencyChangedGlobal` via `applyCurrencyColors` (a no-op in DOM mode because it
      selects SVG `rect`s). DOM cells only recolour on a full `paint()`. Step 3 must route
      recolour through the renderer.
    - **Per-cell P/L labels.** `renderLabels` (SVG `tspan`s) is a no-op in DOM mode, so the
      today-button label toggle shows nothing. DOM cells render colour only (matches the
      default labels-hidden state).
    - **Glass "pillow"** is the flatter CSS approximation (Step 4 decision).

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

- [ ] **Step 3 — move the post-paint pipeline behind the interface.** Give each
      renderer a way to render coloring/labels/bevel for its own backend so
      `index.js` no longer calls `d3`/`applyBevelGlass` directly. This is what
      lets the page be truly backend-agnostic.
- [ ] **Step 4 — visual parity pass.** `make screenshot URL=/calendar/` for both
      renderers and compare. Must be checked in **Chrome** (glass is visual). See
      Gotchas for the bevel.
- [ ] **Step 5 — flip default to `dom`**, soak, confirm.
- [ ] **Step 6 — delete the SVG path:** `js/ui/cal-heatmap-src/`, the `d3` +
      `cal-heatmap` `<script>` tags in `calendar/index.html`, `bevelGlassPlugin.js`
      (if fully replaced), `SvgRenderer.js`, and the **SVG-specific tests only**
      (see test split below). Keep renderer-agnostic tests.

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

1. **The specular glass "pillow" is the only real parity risk.** The SVG bevel
   (`js/pages/calendar/bevelGlassPlugin.js`) uses `feSpecularLighting` +
   `feDistantLight` + an `objectBoundingBox` gradient stroke on each `<rect>`.
   Pure CSS (`inset` box-shadows + a 135° gradient border) gets ~90% — visibly
   flatter on close inspection. Two acceptable resolutions: (a) accept the flatter
   CSS bevel, or (b) keep a **tiny inline `<svg><filter>`** and apply it to DOM
   cells via CSS `filter: url(#…)` — 100% parity, ~30 lines, still no D3.
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
