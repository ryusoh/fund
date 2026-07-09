# Volume-pane redesign (contribution chart) — implementation plan & progress

Working doc for an in-progress TDD overhaul of the buy/sell volume pane on the
contribution/balance chart (`plot balance` on `/terminal/`). If you are picking
this up mid-stream: read the Progress checklist, then do the next unchecked
slice red→green. Delete/archive this doc when everything ships.

## Context

A code + data audit found eight issues (confirmed against real data: 589 trade
dates; daily volume median ≈ $1k vs max ≈ $165k; 127 days with both a buy and a
sell):

1. **Palette split** — bars hardcode Material green/red
   (`js/transactions/chart/renderers/contributionComponents.js:228-237`) while
   legend/tooltip/markers use the Apple palette from `getChartColors`
   (`js/transactions/chart/helpers.js:376-379`). Tooltip swatches don't match
   the bars they describe.
2. **Overlap-width hack** — on days with both buy & sell, the bigger bar
   renders 8px wide with the smaller 4px bar overlaid; width encodes nothing.
3. **Heavy-tail invisibility** — linear 0→max scale makes the median bar
   ~0.5px tall in the 80px pane; most trade history is invisible.
4. **Fixed 4px bar width** — overlaps at full range, spindly zoomed in.
5. **Per-bar 1px strokes** — half the area of a 4px bar, blurry at integer
   coords; industry volume panes are fill-only.
6. **Over-dense volume axis** — `generateConcreteTicks` forces ≥5 ticks
   (`js/transactions/chart/core.js:123`) → gridline every ~15px in an 80px pane.
7. **Dividends render as red "sell" bars** — `mergeDividendsIntoContribution`
   folds dividends into `sellVolume` (`js/transactions/chart/data/contribution.js:626`).
8. **Tooltip shows "Buy $0 / Sell $0"** on non-trade days — volume getters
   return `0` instead of `null` (`js/transactions/chart/renderers/contribution.js:1098-1100`).

## Design decisions (user-confirmed)

- **Diverging pane** — buys extend up, sells/dividends extend down from a zero
  baseline inside the pane (fund-flow standard). Replaces the overlap hack.
- **Sqrt y-scale + ~1.5px minimum bar height** — compresses the $165k spike
  while keeping the zero baseline; min height keeps every trade visible.
- **Dividends get a distinct hue** — new `dividendVolume` field, rendered on
  the outflow side in Apple amber (`rgba(255,214,10,…)`), own tooltip row.
  `js/transactions/terminal/snapshots.js` only reads `amount` from the merged
  series, so the semantic split is safe there.

## Seams under test (agreed)

- `drawVolumeChart(ctx, data, options)` — canvas draw calls on a stubbed ctx
  (`fillRect` args & `fillStyle` sequence); pattern per
  `docs/chart-crosshair-layout.md` §unit-testing.
- `buildContributionSeriesFromTransactions` / `mergeDividendsIntoContribution`
  — pure data in → series out.
- `generateConcreteTicks` options — tick values/count for the volume pane.
- Crosshair snapshot via `setCrosshairExternalUpdate`; `sortCrosshairSnapshot`.

## Test landscape (reuse, don't reinvent)

- `tests/js/transactions/volumeBarWidth.test.js` — ctx-stub + fillRect-capture
  pattern for `drawVolumeChart`; its 6 tests pin the old 4px/8px hack and are
  **rewritten as the new spec** (slices 4–6).
- `tests/js/transactions/chart/data/mergeDividends.test.js` — `makePoint()`
  fixture + module mocks; slice 1 lives here.
- `tests/js/transactions/drawAxes_comprehensive.test.js` — slice 8 extends it.
- `tests/js/transactions/chart/renderers/contributionDividendMerge.test.js` —
  fullest `makeCtxStub()`; update for `dividendVolume`.
- `tests/js/transactions/chart/composition_crosshair_percent.test.js` —
  crosshair snapshot pattern for slice 9 (reset singletons in `afterEach`).
- Jest is silent, jsdom, TZ=UTC (browsers are UTC+8 — run `make test-tz` since
  `data/contribution.js` is touched).

## Slices — Progress

Files: CC = `renderers/contributionComponents.js`, CR = `renderers/contribution.js`,
DC = `data/contribution.js`, H = `helpers.js`, CORE = `core.js`,
I = `interaction.js` (all under `js/transactions/chart/`).

- [x] **1. Dividend separation (data)** — DONE. `mergeDividendsIntoContribution`
      writes `dividendVolume`; `sellVolume` stays trade-only; `netAmount`/
      cumulative `amount` unchanged. Tests: `mergeDividends.test.js` (12 pass;
      also verified `contributionDividendMerge.test.js` + `snapshots.test.js`
      unaffected). Note: the plan's "currency branch in
      `buildContributionSeriesFromTransactions`" sub-item was unnecessary — the
      merge runs after that conversion and converts dividends itself.
- [x] **2. Aggregation returns dividend map** — DONE. `drawVolumeChart` groups
      `dividendVolume` (rides the `showSell` toggle) and returns
      `dividendVolumeMap`. Tests in `volumeBarWidth.test.js`.
- [x] **3. Palette via options** — DONE (combined with slice 7 — same code
      region). CC reads `colors.buyBarFill`/`sellBarFill`/`dividendBarFill`
      (Apple-palette fallbacks inline); `getChartColors` (H) gained
      `dividend`, `dividendFill`, and the three `*BarFill` keys at 0.75 alpha;
      CR passes `colors` into `drawVolumeChart`.
- [x] **4. Diverging geometry** — DONE. Zero baseline at `volumeYScale(0)`;
      buys up; sells down; dividends stacked below same-day sells (combined
      downward length = total outflow); double-width/painter-sort logic
      deleted; volume axis labels show `|value|`. Full transactions suite
      (95 files / 1 364 tests) green after.
- [x] **5. Sqrt scale + min height** — DONE. Sign-preserving sqrt transform in
      `volumeYScale` (value domain still passed to `drawAxes`, so gridlines
      land at sqrt positions automatically); `minBarHeight: 1.5` tunable in
      `CONTRIBUTION_CHART_SETTINGS.volumePane` (`js/config.js`).
- [x] **6. Density-aware width** — DONE. `round(plotWidth / daySpan × 0.6)`
      clamped to `[1, 12]`; tunables (`barWidthFraction`, `minBarWidth`,
      `maxBarWidth`) in `CONTRIBUTION_CHART_SETTINGS.volumePane`.
- [x] **7. Fill-only bars** — DONE (with slice 3). No `strokeRect`; fill alpha
      0.75 via the `*BarFill` palette keys.
- [x] **8. Sparse volume axis** — DONE. `generateConcreteTicks(yMin, yMax,
isPerf, currency, { maxTicks })` (options are the 5th param — the 4th is
      the pre-existing `currency` arg callers already pass); zero tick survives
      thinning on diverging domains; `drawAxes` forwards `axisOptions.maxTicks`;
      pane requests `axisMaxTicks: 3` from config. Tests in
      `drawAxes_comprehensive.test.js` + wiring test in `volumeBarWidth.test.js`.
- [x] **9. Tooltip truthfulness** — DONE. Exported `createVolumeGetter` (CC)
      returns `null` on no-trade days; Dividend tooltip row added; exported
      `isVolumeBarKey` (I) covers all three keys; `dividendVolume: 6` in
      `sortCrosshairSnapshot` fixed order. Tests in `interaction.test.js` +
      `volumeBarWidth.test.js`.
- [x] **10. Legend + visibility** — DONE. Dividend legend entry (only when
      dividends exist in view) wired to a real `chartVisibility.dividend` flag
      (`showDividend` in CC, defaults to `showSell`), so the legend toggle
      actually hides the bars. Two renderer-level test files' module mocks of
      `contributionComponents.js` gained the new exports
      (`contribution_drawdown_legend.test.js`, `contributionDividendMerge.test.js`).

## Status: ALL SLICES SHIPPED (2026-07-09) — verified

- `make test`: 171 JS suites / 2 688 tests + 451 Python tests, all green.
- `make test-tz`: green under America/New_York and Asia/Shanghai.
- `make precommit-fix` (CI gate): green. `make verify` green through eslint/
  ruff/stylelint/markdownlint/mypy; its final `bandit` step fails only because
  the Makefile `sec` target calls bare `bandit` (not on PATH here) —
  `venv/bin/bandit -r scripts -lll` reports "No issues identified".
- Visual: `make screenshot URL=/terminal/ ARGS='--type "plot balance" --wait 2500'`
  (and `plot balance 2025` for the zoomed view) — diverging baseline, dividend
  hue, sparse |value| axis, density-scaled widths all render. Aesthetic
  sign-off belongs to the user on the live page.

This doc can be archived/deleted once the change is committed.

## Verification

- Per slice: `npx jest <test-file>` — red first, then green.
- After all slices: `make test`, `make test-tz`, `make verify` (or at minimum
  `make precommit-fix` for CI parity).
- Visual (mandatory): `make screenshot URL=/terminal/ ARGS='--type "plot balance"'`
  and read the PNG — diverging baseline, tail visibility, palette consistency,
  dividend hue, sparse axis. Aesthetic sign-off is the user's on the live page.
- No commit/push — work directly on main; user commits explicitly.

## Guardrails

- Scope: contribution chart only; other renderers and glass effects untouched.
- `orderType` / cumulative `amount` semantics unchanged — only volume
  _presentation_ fields change (`dividendVolume` added; `sellVolume` no longer
  includes dividends).
- Keep the `Array.isArray(layout.dates)` guard class in `interaction.js`.
