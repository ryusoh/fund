# Mobile UX for the Terminal Page — Research Findings

Date: 2026-08-27 (revised same day: direction changed to Option D after visual review).

## 1. The question

The site hides the Terminal nav link on mobile (`hide-on-mobile`). **What is the best way,
grounded in HCI research and current industry practice, to expose this page's functionality
to mobile/touch users?**

## 2. Short answer — DECIDED: Option D, chart-first mobile view

**On mobile, drop the terminal pane entirely and show a chart-first view**: a tappable chart
picker (a few curated charts), an Apple-Stocks-style timeline range selector, the chart with
its existing touch crosshair, an adapted legend, and a compact currency switcher. No stats
tables, no typed commands — on a phone screen the `<pre>` stats output wraps out of shape and
is not worth the space (product decision by the owner after seeing option A rendered).

History: Option A (assisted terminal with suggestion chips) was implemented and enabled
(`513ef695`, `1a530c54`, `b2d7368b`, `63991795`, `dfadf680`, `edc303d0`), then rejected on
visual review; the nav re-enable was reverted (`d2fedb2b`). **Do not re-enable the mobile nav
link until the Option D items below land and the owner explicitly approves.**

## 3. Current interaction surface (repo facts)

All line numbers verified by direct read this session unless marked otherwise.

### 3.1 Input affordances (desktop REPL)

- Single text input `#terminalInput` with `autofocus` — `terminal/index.html:161-169`;
  `initTerminal` also calls `.focus()` on load but skips it on coarse pointers —
  `js/transactions/terminal.js:410-412,451`.
- Keyboard-only command handling (Enter/arrows/Tab) — `js/transactions/terminal.js:382-408`;
  no touch equivalent on soft keyboards.
- Command registry: `COMMAND_ALIASES`, `STATS_SUBCOMMANDS` (12), `PLOT_SUBCOMMANDS` (18) —
  `js/transactions/terminal/constants.js:1-76`. Dispatcher: `executeCommand` —
  `js/transactions/terminal/commands.js:26-140`.
- A suggestion-chip bar was added for coarse pointers (`initChips`,
  `js/transactions/terminal.js:25,453`; module `js/transactions/terminal/chips.js`; styles
  `css/terminal/responsive.css:108-142`; tests `tests/js/transactions/terminal/chips.test.js`).
  **Under Option D this is dead UI** — removal is action item 1.

### 3.2 Chart surface (what Option D keeps)

- **19 chart keys** dispatched off `transactionState.activeChart` in
  `js/transactions/chart.js:104-161`: `contribution` (= `plot balance`, the default per
  `js/transactions/state.js:16`), `performance`, `drawdown`, `drawdownAbs`, `composition`(+`Abs`),
  `sectors`(+`Abs`), `geography`(+`Abs`), `marketcap`(+`Abs`), `concentration`, `pe`, `fx`,
  `rolling`, `volatility`, `beta`, `yield`. Renderers lazy-load per key.
- Switching a chart is two calls: `setActiveChart(key)` (`js/transactions/state.js:118`) then
  `chartManager.update()`; the plot handler also un-hides `#runningAmountSection` and hides the
  table — `js/transactions/terminal/handlers/plot.js:179-190,341-349`.
- **Date range** is `{from, to}` in `transactionState.chartDateRange`
  (`js/transactions/state.js:17,126`), set via `setChartDateRange` +
  `updateContextYearFromRange` (`js/transactions/terminal/dateUtils.js:12-20`). Existing parsers
  understand years/quarters only (`dateUtils.js:167-343`); relative presets like "1M/6M" need new
  date arithmetic. Initial range comes from `INITIAL_CHART_DATE_RANGE = { from: '2024-01-01',
to: null }` — `js/config.js:167-170`, applied at `js/pages/terminal/index.js:388-390`.
- **Touch crosshair already works**: Pointer Events with `preventDefault()` for touch —
  `js/transactions/chart/interaction.js:868-870,954-958`; drag-to-scrub is the
  Apple-Stocks-style interaction and needs no new code.
- **Legend** is a DOM rebuild per series — `updateLegend`, `interaction.js:684-703`; tap-to-toggle
  on non-stacked charts (`interaction.js:724-760`). Mobile grid styles already exist —
  `css/terminal/chart.css:119-139`.
- **Currency**: `#currencyToggleContainer` with 4 buttons (`terminal/index.html:114-147`),
  managed by `js/ui/currencyToggleManager.js` (`initCurrencyToggle`, `cycleCurrency`,
  `applyCurrencySelection`); changes dispatch `currencyChangedGlobal`, handled at
  `js/pages/terminal/index.js:406-445` (swaps series + re-renders). **Hidden on mobile** —
  `css/terminal/base.css:101-104` (`display: none !important` under 768px; the element also
  carries `hide-on-mobile`).
- **Data readiness**: chart/stats renderers read `transactionState` directly; anything that
  renders before load settles shows stale/empty output. Await `whenTransactionDataReady()`
  (see `docs/terminal-data-readiness.md`; pattern at `handlers/plot.js:92-95`).
- **Mobile layout machinery**: `adjustMobilePanels` (`js/transactions/layout.js:43-68`) sizes
  the table and chart card on ≤768px (skips `is-hidden` panels, sizes the chart card to the
  viewport minus its top offset, subtracts legend height at `layout.js:26-41`). It runs on
  load/resize (`js/pages/terminal/index.js:287,393,402-404`). CSS mobile block:
  `css/terminal/responsive.css:38-195` — `.transaction-container` is a fixed-height flex column
  (`height: calc(100dvh - 118px)`, line 74), `.terminal-output` is capped at 170px (line 91),
  chart card and table split the remainder (lines 144-161).

### 3.3 What Option D removes on mobile

- The `.terminal` pane (output + prompt + chips): stats `<pre>` blocks wrap badly at 375px and
  the soft keyboard eats half the screen (claims 1-5 below).
- The transaction table on mobile (dense, starts `is-hidden` — `terminal/index.html:190`).
- All typing-dependent features (filters, arbitrary date ranges, numeric args) — accepted loss.

## 4. Research evidence

Each claim: **claim** — source — _quality_. Claims 1-18 are from the first research pass
(2026-08-27) and justify removing typing/stats from mobile; chart-specific pattern evidence
(range selectors, mobile legends, glanceability) is being gathered into
`docs/research/mobile-chart-ux-sources.md` and folded into §4.6 when it lands.

### 4.1 Why typing-heavy UIs fail on phones

- **Claim 1**: **Average mobile typing is 36.2 WPM with 2.3% uncorrected errors, ~70% of desktop
  keyboard speed, in a 37,370-volunteer study.**
  <https://userinterfaces.aalto.fi/typing37k/> (Palin et al., MobileHCI'19) — _peer-reviewed;
  project page fetched, abstract verified._
- **Claim 2**: **Touchscreen entry runs ~15–30 WPM vs ~40 WPM on physical keyboards, with high error
  rates.** <https://arxiv.org/pdf/2409.03044v1> — _peer-reviewed survey preprint; snippet-level._
- **Claim 3**: **Touchscreen typing error rates are 7–10.8% vs 0.47–0.76% on physical keyboards.**
  <https://pure-oai.bham.ac.uk/ws/portalfiles/portal/156384598/3411764.3445483.pdf> —
  _peer-reviewed; snippet-level._
- **Claim 4**: **Speech input was 3.0× faster than the smartphone keyboard with a 20.4% lower error
  rate (English).** <https://hci.stanford.edu/research/speech/> (Ruan et al.) — _peer-reviewed
  study page; fetched._ (Bounds how costly typing is; not a voice recommendation.)
- **Claim 5**: **Virtual keyboards "can occupy a substantial portion of the screen — often nearly
  half."** <https://arxiv.org/pdf/2504.12690> — _arXiv preprint; snippet-level._

### 4.2 Recognition vs recall

- **Claim 6**: **"Command-line interfaces are based on recall"; visible options convert the task to
  recognition, which is easier.** <https://www.nngroup.com/articles/recognition-and-recall/> —
  _NN/g guideline article; fetched in full._ A chart picker + range selector is the extreme
  case: zero recall, everything visible.
- **Claim 7**: **"Recognition rather than recall" is Nielsen heuristic #6.**
  <https://www.nngroup.com/articles/ten-usability-heuristics/> — _NN/g canonical guideline._
- **Claim 8**: **Heuristic #7 (flexibility/efficiency): keep accelerators for experts** — i.e. the
  desktop REPL stays; mobile gets the visible path.
  <https://www.nngroup.com/articles/flexibility-efficiency-heuristic/> — _NN/g; snippet-level._

### 4.3 Conversational / NL querying (rejected direction)

- **Claim 9**: **V-NLI survey (Shen et al., IEEE TVCG): NL interfaces work best as "a complementary
  input modality to direct manipulation," not a replacement.** <https://arxiv.org/abs/2109.03506> —
  _peer-reviewed survey; abstract fetched._
- **Claim 10**: **Nielsen's caveat on chat UIs**: prose prompting has "deep-rooted usability
  problems"; he predicts hybrid UIs. <https://www.nngroup.com/articles/ai-paradigm/> — _NN/g
  essay; fetched in full._

### 4.4 Touch targets, progressive disclosure

- **Claim 11**: **WCAG 2.2 SC 2.5.8 (AA): pointer targets ≥ 24×24 CSS px.**
  <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html> — _W3C normative;
  w3.org returned 403 to fetch; corroborated by multiple independent references._
- **Claim 12**: **WCAG SC 2.5.5 (AAA): targets ≥ 44×44 CSS px**, matching Apple's 44pt HIG minimum.
  Text verified via <https://accessibility.build/wcag/2-5-5> — _secondary explainer quoting
  normative text; fetched in full._
- **Claim 13**: **Material Design: touch targets ≥ 48×48 dp.**
  <https://m2.material.io/develop/web/supporting/touch-target> — _platform guideline; snippet._
- **Claim 14**: **Apple HIG explicitly recommends progressive disclosure.**
  <https://developer.apple.com/design/human-interface-guidelines/layout> — _platform guideline;
  fetched in full._

### 4.5 How real mobile terminals solve CLI input (why option A looked right)

- **Claim 15**: Termius / Blink Shell / Termux / a-Shell all add an app-defined tappable key/chip
  row above the soft keyboard plus history-driven suggestions.
  <https://support.termius.com/hc/en-us/articles/12482919487385-Mobile-Terminal>,
  <https://docs.blink.sh/>, <https://wiki.termux.com/wiki/Touch_Keyboard> (bot-blocked; corroborated
  via <https://github.com/termux/termux-app/issues/4589>), <https://github.com/holzschu/a-shell> —
  _official vendor/project docs; fetched except Termux._ This pattern was implemented (option A)
  and rejected on visual grounds — a valid pattern for _terminals_, but this page's value is the
  charts, not the shell.

### 4.6 Mobile chart UX patterns (Apple Stocks / Google Finance / ChatGPT inline charts)

_Pending: see `docs/research/mobile-chart-ux-sources.md` (in flight at revision time). Key
questions: range-preset sets and placement, touch scrub behavior, mobile legend density,
segmented-control conventions. Fold verified claims here when it lands._

## 5. Design options — decision record

- **(a) Assisted terminal (chips + REPL)** — IMPLEMENTED, THEN REJECTED. Stats output is
  unreadable at phone widths and the owner doesn't consume stats on mobile. Chip bar becomes
  dead code under D (removal: action item 1).
- **(b) Full command palette** — superseded; a picker of ~5 charts needs no palette.
- **(c) Chat / NL interface** — rejected (claims 9-10; no backend on a static site).
- **(d) Chart-first curated mobile view — SELECTED.** Mobile shows: chart picker (curated few),
  timeline range selector (Apple Stocks / Google Finance style), the chart (touch crosshair
  already works), an adapted legend, and a currency switcher. Terminal pane and transaction
  table are hidden at ≤768px; desktop is untouched.

### Repo constraints honored

- Page-scoped: new CSS in `css/terminal/responsive.css` (≤768px block) and any new module
  gated by the same breakpoint / `UI_BREAKPOINTS.MOBILE` (`js/config.js:172-174`) — no leak to
  `position/`, `calendar/`, `index/`.
- `data/` untouched: everything derives from existing state and renderers.
- Diff-coverage gate: every new JS module ships with jest tests.

## 6. Action items (Option D)

Ranked, anchor-verified. Items 1-2 first (subtract before adding). **Item 8 (nav re-enable) is
gated on the owner's explicit approval — do not do it unprompted.**

1. **Remove the mobile chip bar** (dead under D). Delete `js/transactions/terminal/chips.js` and
   `tests/js/transactions/terminal/chips.test.js`; remove the import and the coarse-pointer
   `initChips` block at `js/transactions/terminal.js:25` and `:451-454`; remove the
   `.terminal-chips`/`.terminal-chip` rules at `css/terminal/responsive.css:108-142`; revert the
   chips mention in the help hint (`js/transactions/terminal/handlers/help.js`, commit
   `dfadf680`). Keep the earlier focus/font-size fixes (`513ef695`, `1a530c54`) — harmless and
   still correct if the pane is ever shown. Verify: `npx jest tests/js/transactions/terminal`
   green; `npx stylelint css/terminal/responsive.css`.
2. **Hide the terminal pane and table on mobile; always show the chart.** CSS
   (`css/terminal/responsive.css` ≤768px block): `.terminal { display: none; }` and
   `.table-responsive-container { display: none !important; }`; let `.chart-card` take the full
   column height (it is already `flex: 1` at line 153). JS: in the mobile path, remove
   `is-hidden` from `#runningAmountSection` (`terminal/index.html:175`) after
   `whenTransactionDataReady()` resolves, then `chartManager.update()` (data-readiness pattern at
   `handlers/plot.js:92-95`). Verify: mobile screenshot shows the default chart with no terminal
   pane; desktop unchanged. Add a jest test asserting the mobile init path un-hides the section
   (breakpoint mocked) and leaves it hidden on desktop.
3. **Mobile control bar module** — new `js/pages/terminal/mobileControls.js`, wired from
   `initialize()` (`js/pages/terminal/index.js:298-394`) behind
   `window.matchMedia('(max-width: 768px)')`, rendering a bar into `.transaction-container`
   directly above `#runningAmountSection` (`terminal/index.html:173-188`). The **chart picker**
   is a row of tappable buttons for a curated subset — proposal: Balance → `contribution`,
   Performance → `performance`, Drawdown → `drawdown`, Composition → `composition`, Sectors →
   `sectors` (keys from `js/transactions/chart.js:104-161`; final set is the owner's call).
   Tap handler: `setActiveChart(key)` (`js/transactions/state.js:118`), ensure the section is
   un-hidden, `chartManager.update()`; mark the active button with `aria-pressed`. Verify: jest
   tests for rendering at mocked mobile width, tap → state + update called, desktop renders
   nothing; `make precommit-fix` green.
4. **Timeline range selector** (Apple-Stocks-style presets) in the same bar: `1M 3M 6M YTD 1Y
All`. A small pure helper maps a preset to `{from, to}` relative to today (`All` →
   `{from: null, to: null}`; `YTD` → Jan 1 of the current year); existing parsers
   (`dateUtils.js:167-343`) handle only years/quarters, so month-offset math is new — keep it in
   the new module, not `dateUtils.js`. Apply via `setChartDateRange` +
   `updateContextYearFromRange(range)` + `chartManager.update()`. Default selection should match
   `INITIAL_CHART_DATE_RANGE` (`js/config.js:167-170`: `from: '2024-01-01'` — i.e. none of the
   presets; represent it as "All"-unselected/custom or add a `2Y` preset — owner's call). Verify:
   unit tests for the preset math — remember the suite runs TZ=UTC (`docs/testing-notes.md`), so
   compute from an injected `now`, not `Date.now()`, in tests.
5. **Currency switcher on mobile.** Un-hide `#currencyToggleContainer` at ≤768px (override
   `css/terminal/base.css:101-104` and drop `hide-on-mobile` at `terminal/index.html:114`) and
   reposition it: today it is `position: fixed; top: 15px; left: 15px`
   (`css/terminal/base.css:95-99`), which collides with the mobile layout — move it into the
   control bar in flow, or to a fixed corner that clears the nav. No JS changes:
   `currencyToggleManager.js` binds by id and the `currencyChangedGlobal` handler
   (`js/pages/terminal/index.js:406-445`) already re-renders the chart. Keep ≥44×44px targets
   (claims 11-13). Verify: `tests/js/ui/currencyToggleManager.test.js` still green; jest test
   that the container is visible at mocked mobile width; tap switches the rendered currency.
6. **Legend adaptation for mobile.** Base rules exist (`css/terminal/chart.css:119-139`: grid,
   11px labels, truncation). Adapt: tappable legend items (non-stacked charts —
   `interaction.js:724-760`) need ≥44px-tall hit areas (claims 11-13); consider a single
   horizontally scrollable row if the grid wraps past two lines. **Visual — human review
   required.** Verify: `npx stylelint css/terminal/chart.css`; mobile screenshot per chart type.
7. **Layout machinery check.** With the terminal pane and table hidden, confirm
   `adjustMobilePanels` (`js/transactions/layout.js:43-68`) still sizes the chart card correctly
   (it skips `is-hidden` panels and subtracts the legend height, lines 26-41) — the new control
   bar consumes vertical space, so the `bottomSpacing = 16` constant (line 55) and the
   `calc(100dvh - 118px)` container height (`responsive.css:74`) may need adjusting. Verify:
   mobile screenshot shows the chart filling the viewport without overflow; `npx jest
tests/js/pages/terminal` green.
8. **[GATED — owner approval required] Re-enable the Terminal nav link on mobile.** Remove
   `hide-on-mobile` from the terminal `<li>` at `index.html:88`, `calendar/index.html:104`,
   `position/index.html:100` (i.e. redo `edc303d0`, reverted in `d2fedb2b`). Only after items
   1-7 land and the owner reviews the live page on a real phone. Verify: visual check on all
   four pages at ≤768px.
9. **Defer**: stats-on-mobile in any form (rejected by owner), command palette (b), NL/chat (c).

## 7. Open questions / what I couldn't verify

- **Chart-UX pattern research in flight**: `docs/research/mobile-chart-ux-sources.md` (Apple
  Stocks range presets and scrub behavior, Google Finance mobile, ChatGPT inline charts, mobile
  legend conventions). §4.6 is a placeholder until it lands; items 3-6 may need adjustment.
- **Final chart-picker set and default range preset** (items 3-4) are product decisions — the
  owner picks the chart list and whether the default range stays `from 2024-01-01`.
- **WCAG/Apple/Material primary texts**: w3.org returned 403 and Apple's/Material's guideline
  pages are JS-rendered; the 24px/44px/48dp figures are corroborated by multiple independent
  sources but the normative pages were not read directly.
- **Real-device behavior unverified**: keyboard occlusion, tap ergonomics, and chart legibility
  are inferred from code + cited research. A human must verify on an actual phone before item 8.
