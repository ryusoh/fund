# Liquid Glass Effects (terminal page)

The "liquid glass" panes on `terminal/index.html` (the terminal, the chart card,
and the transaction table) are built from **three independent layers**. This doc
captures how they fit together and the hard-won gotchas — read it before touching
any `*GlassEffect*` / `*Refraction*` code so you don't re-derive them.

## Scope

These effects are **terminal-page only**. They are wired up in
`js/pages/terminal/index.js` (`glassTargets`) against three selectors:
`.terminal`, `.chart-card`, `.table-responsive-container`. Do not let them leak
to other pages.

## The three layers

| Layer                                                                                                | File                                                 | Tech                                                                | Browser support                                            |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Backdrop refraction (the real lens: Snell shift, Abbe dispersion, caustics, interior magnification)  | `js/ui/liquidGlassRefraction.js`                     | SVG `backdrop-filter: url(#…)` with `feImage` + `feDisplacementMap` | **Chromium only** (gated by `supportsSvgBackdropFilter()`) |
| Decorative overlay (thin-film oil iridescence, rim glow, mouse spotlight)                            | `js/ui/tableGlassWebGL.js`                           | WebGL fragment shader                                               | WebGL                                                      |
| Decorative overlay (electric trails, particles, reflection sweep, ambient glow, row hover spotlight) | `js/ui/tableGlassEffect.js`                          | Canvas 2D                                                           | all                                                        |
| Static rim/top-light (bevel highlight, occlusion edges, slab depth)                                  | `css/terminal/{terminal,table,chart}.css` box-shadow | CSS                                                                 | all                                                        |

`TableGlassEffect` (`tableGlassEffect.js`) is the orchestrator: it owns the Canvas
2D layer and instantiates the WebGL overlay and the refraction lens.

## Config knobs

All in `js/config.js`:

- `TABLE_GLASS_EFFECT` / `PIE_CHART_GLASS_EFFECT` — per-pane effect settings; `.refraction` holds the lens params (`bezelWidth`, `thickness`, `ior`, `abbeNumber`, `dispersionGain`, `causticGain`, `magnification`, `magnificationPower`).
- `TERMINAL_GLASS_MAGNIFICATION` — the interior "bulge" strength, applied **only** to the terminal panes. Kept out of `TABLE_GLASS_EFFECT.refraction` (which defaults `magnification: 0`) so the donut (`DONUT_REFRACTION`) and calendar (`CALENDAR_ZOOM_REFRACTION`) lenses, which spread that object, stay unmagnified.

## Gotchas (each one cost a debugging round-trip — respect them)

1. **The SVG filter region is the element's _border-box_.** Build the displacement
   map from `offsetWidth`/`offsetHeight`, **not** `clientWidth`/`clientHeight` —
   the latter exclude the scrollbar gutter, so on a scrollable pane (the table)
   the map is narrower than the painted region and `feImage` stretches it,
   shifting the caustic rim off the right/bottom edge.
   Pinned by: `builds the lens at the border-box…` test.

2. **Displacement must sample _inward_ (toward the pane centre).** A pixel that
   samples _outside_ the element renders transparent (`feDisplacementMap` has no
   edge clamp). Outward displacement ⇒ a transparent ring.

3. **Keep ONE displacement stage reading `SourceGraphic`.** Chrome's
   `backdrop-filter` drops the trailing (right/bottom) edges to **transparent**
   when a displacement reads a _displaced intermediate_ instead of `SourceGraphic`
   directly (a chained `feImage → feDisplacementMap → feDisplacementMap`). This is
   why interior magnification is **folded into the single rim displacement map**
   rather than run as its own pass. Do not reintroduce a chained pass.
   Pinned by: `magnification stays a single displacement stage reading SourceGraphic`.

4. **Magnification tapers to ~0 at the rim.** The bulge uses a `sin(π·s)` hump
   over the superellipse distance `s` (0 at centre, 1 at rim), so it peaks in the
   interior and vanishes at the edge — keeping the rim covered (see #2/#3).
   Pinned by: `tapers to ~zero added shift at the rim…`.

5. **The normalisation (`maxShift`) cancels out of the per-channel scale.** Widening
   it to fit the folded bulge leaves the rim refraction and chromatic dispersion
   numerically unchanged — folding magnification in is safe by construction.

## How to change it safely

1. Edit the math in `liquidGlassRefraction.js` (pure functions: `buildDisplacementMap`, `refractionShift`, `dispersionRatios`, …).
2. Run the unit tests: `npx jest tests/js/ui/liquidGlassRefraction.test.js`. They pin the invariants above — keep them green.
3. **Verify visually** — these are Chromium-only and the unit tests cannot see a
   transparent edge or a misaligned rim. Capture a headless screenshot and look at
   all four edges of each pane:

    ```sh
    make screenshot URL=/terminal/
    ```

    It prints the PNG path (under `screenshots/`, gitignored). Note: the **chart
    and table panes are hidden until a terminal command runs**, so a bare
    `/terminal/` shot only shows the terminal pane. To verify the table/chart,
    drive the page first (extend `scripts/screenshot.mjs` to type a command, or
    check manually via `make serve`).
