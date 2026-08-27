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

Each claim: **claim** — source — _quality_. Claims 1-15 are from the first research pass
(2026-08-27) and justify removing typing/stats from mobile; claims 16-22 in §4.6 are the
chart-specific patterns (range selectors, touch scrub, mobile legends, glanceability) from
`docs/research/mobile-chart-ux-sources.md`.

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

### 4.6 Mobile chart UX patterns (Apple Stocks / Google Finance / Material)

Full claim-by-claim evidence with citations: `docs/research/mobile-chart-ux-sources.md`
(gathered 2026-08-27; Google Finance mobile web verified live via Playwright at 390×844).
Verified highlights (claim numbers continue from §4.5):

- **Claim 16**: **The range selector is a single-select segmented row adjacent to the chart** —
  Apple Stocks puts it _above_ the chart ("Tap an option from the time range selections at the
  top of the chart", iPhone User Guide); Google Finance mobile web puts a `role="tab"` row
  (1D/5D/1M/6M/YTD/1Y/5Y/MAX, `aria-selected` for state, 1D default) _below_ it. Apple's
  documented range list (Mac guide): 1D/1W/1M/3M/6M/YTD/1Y/2Y/5Y/10Y/ALL, highlighted on
  selection, persistent across symbols.
- **Claim 17**: **HIG caps iPhone segmented controls at ~5 segments; Material 3 at 2–5** — both
  reference apps exceed this with short, equal-importance labels; the pattern still holds.
- **Claim 18**: **Touch-and-hold scrub is the canonical mobile chart gesture** (Apple documents
  one-finger hold = value at point, two-finger = difference); HIG recommends making the _entire
  plot area_ the hit target. Our Pointer-Events crosshair already implements this (§3.2).
- **Claim 19**: **On mobile, Material says place the legend _above_ the chart** so it stays
  visible during touch interaction, and prefer direct data labels over a legend where possible
  (M2 data-visualization, Style → Legends).
- **Claim 20**: **Touch-target minimums converge**: WCAG 2.5.8 AA 24×24px floor, WCAG 2.5.5 AAA
  44×44px, Apple 44×44pt, Material 48×48dp, NN/g 1cm×1cm. A 2–4 option currency switch fits a
  segmented control comfortably within HIG/M3 segment limits.
- **Claim 21**: **Default view = one key number + one line chart** (Apple Stocks layout; NN/g
  glanceability/progressive-disclosure; line/bar encodings are preattentive — avoid pie/donut
  for at-a-glance reading). Material also sanctions **swipe pagination between charts** on
  mobile as an alternative to a picker row.
- **Claim 22**: **Sparse axis labels on small screens**: when interactive inspection exists,
  HIG advises fewer grid lines and light label colors; Material says don't overload axis labels.

### 4.7 Decluttering the control stack (follow-up, 2026-08-28)

The implemented control stack (chart-picker row + range row + legend grid + floating
currency pill) works but the owner finds it extremely cluttered. Full evidence and three
ranked layout proposals: `docs/research/mobile-chart-declutter.md` (Google Finance mobile
web live-verified; HIG via DocC JSON; M2/M3 via Playwright). Verified highlights (claim
numbers continue from §4.6):

- **Claim 23**: **No primary source shows four control groups at once on a phone.** Apple
  Stocks exposes only a range selector + scrub (currency is settings-level: "Tap ⋯, tap
  Watchlist Shows, then tap Show Currency"); Google Finance mobile web shows exactly three
  compact menu buttons above the plot (chart type has `aria-haspopup="menu"`) + the range
  tab row. No persistent legend, no floating overlays in either.
- **Claim 24**: **The sanctioned declutter shape is "combo": keep the primary control
  visible, collapse the rest.** HIG pop-up buttons: "a space-efficient way to present a wide
  array of choices" when "space is limited", with the button label showing the current
  selection; M3 modal bottom sheets hold "supplementary content and actions". NN/g measured
  combo navigation used 1.5× more than fully hidden (site-nav study — extrapolation to
  in-page controls, flagged in the research doc).
- **Claim 25**: **The wheel/drum picker is the wrong component for a 5-item chart list, per
  HIG itself**: wheels fit "medium-to-long lists"; for short lists "consider using a
  pull-down button instead of a picker" — a picker "may add too much visual weight to a
  short list of items", hides values before interaction, and requires "predictable and
  logically ordered" values. The HIG-sanctioned form of the same instinct is a pop-up
  button labeled with the current chart.
- **Claim 26**: **Legend preference order is direct labels > legend**: M2 says direct data
  labels eliminate "the need for a legend" in simple charts (Balance/Performance/Drawdown
  have 1–3 series); dense charts (Composition/Sectors) keep the above-chart legend or fold
  values into the scrub tooltip ("On mobile, a touch and hold gesture displays a tooltip
  placed above the chart").
- **Claim 27**: **The floating currency pill matches no sanctioned pattern** — M3 reserves
  floating overlays for the single primary constructive action and says cards shouldn't
  have their own FAB. Currency belongs in-flow or in a sheet.
- **Claim 28**: **Swipe-between-charts is M2-sanctioned** ("pagination… by swiping right or
  left") but no source resolves the swipe-vs-scrub conflict when both live on one canvas —
  adopt only alongside a visible path (HIG Accessibility: gestures need onscreen
  equivalents).

**Layout decision pending owner pick** — proposals in `docs/research/mobile-chart-declutter.md`:
(1) consolidate: chart-name pop-up + overflow bottom sheet holding currency [recommended],
(2) gesture-first: swipe + chart-name title with chevrons, (3) wheel picker [rejected by
claim 25]. Action items below stay valid until the pick; the pop-up/sheet redesign then
revises items 3-6.

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

## 6. Action items

### 6.0 Completed (first pass, 2026-08-27)

Option-D build items 1-7 landed: `d66b06c6` (chip bar removed), `7d1482c1` (chart-only mobile
view), `eb0a24be` (chart picker bar), `1f171ec9` (range selector), `403645a0` (currency
switcher un-hidden), `adc9b907` (legend above chart), `7cb003d6` (legend margin fix). The nav
re-enable remains **gated on owner approval** — do not re-enable unprompted. Owner verdict on
the result: functional but extremely cluttered. The work orders below implement the declutter
redesign — **proposal 1 (consolidate)** from §4.7, evidence in
`docs/research/mobile-chart-declutter.md`.

### 6.1 Work orders: declutter pass (proposal 1)

**Preamble — rules for the implementer.** One work order per change, in order; commit after
each verified item, never push. `Find` strings are unique anchors from the current file — if
one doesn't match exactly, STOP and report; don't improvise a new anchor. Line numbers drift;
trust the anchors. Run each item's Verify commands (scoped), not the full gate; WO5 runs the
full gate. Never edit `data/`. Desktop (>768px) must stay pixel-identical: new CSS goes in the
`@media screen and (max-width: 768px)` block of the named file, new JS stays behind the
existing `isMobileViewport()` gate in `js/pages/terminal/index.js`. `[visual]` = a human must
review the rendered page afterwards.

---

**WO1** `[low]` `[visual]` — Chart picker row → pop-up button + menu (claims 24-25)

Files: `js/pages/terminal/mobileControls.js`, `css/terminal/responsive.css`,
`tests/js/pages/terminal/mobileControls.test.js`.

Find (mobileControls.js, lines ~65-95):

```js
const picker = document.createElement('div');
picker.className = 'mobile-chart-picker';
```

…through the picker click listener's closing `});` (the block ending just before the
`const rangePicker = document.createElement('div');` line). Change: replace that whole block
with a menu-button + hidden menu (paste-ready):

```js
const menuWrap = document.createElement('div');
menuWrap.className = 'mobile-chart-menu-wrap';

const menuButton = document.createElement('button');
menuButton.type = 'button';
menuButton.className = 'mobile-menu-button';
menuButton.setAttribute('aria-haspopup', 'menu');
menuButton.setAttribute('aria-expanded', 'false');

const menu = document.createElement('div');
menu.className = 'mobile-chart-menu';
menu.setAttribute('role', 'menu');
menu.hidden = true;

const menuItems = MOBILE_CHARTS.map((chart, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'mobile-chart-menu-item';
    item.setAttribute('role', 'menuitemradio');
    item.dataset.chart = chart.key;
    item.textContent = chart.label;
    item.setAttribute('aria-checked', index === 0 ? 'true' : 'false');
    menu.appendChild(item);
    return item;
});

menuButton.textContent = `${MOBILE_CHARTS[0].label} ▾`;

function setMenuOpen(open) {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    if (open) {
        const checked = menu.querySelector('[aria-checked="true"]');
        if (checked) {
            checked.focus();
        }
    }
}

function selectChart(key, label) {
    menuItems.forEach((item) => {
        item.setAttribute('aria-checked', item.dataset.chart === key ? 'true' : 'false');
    });
    menuButton.textContent = `${label} ▾`;
    whenTransactionDataReady().then(() => {
        setActiveChart(key);
        section.classList.remove('is-hidden');
        chartManager.update();
        adjustMobilePanels();
    });
}

menuButton.addEventListener('click', () => setMenuOpen(menu.hidden));
menu.addEventListener('click', (event) => {
    const item = event.target.closest('.mobile-chart-menu-item');
    if (!item) {
        return;
    }
    setMenuOpen(false);
    menuButton.focus();
    selectChart(item.dataset.chart, item.textContent);
});
menu.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return;
    }
    event.preventDefault();
    const current = menuItems.indexOf(document.activeElement);
    const next =
        event.key === 'ArrowDown'
            ? (current + 1) % menuItems.length
            : (current - 1 + menuItems.length) % menuItems.length;
    menuItems[next].focus();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
        setMenuOpen(false);
        menuButton.focus();
    }
});
document.addEventListener('click', (event) => {
    if (!menu.hidden && !menuWrap.contains(event.target)) {
        setMenuOpen(false);
    }
});

menuWrap.appendChild(menuButton);
menuWrap.appendChild(menu);
```

Then wrap the bar's top row. Find:

```js
bar.appendChild(picker);
bar.appendChild(rangePicker);
```

Change to:

```js
const controlRow = document.createElement('div');
controlRow.className = 'mobile-controls-row';
controlRow.appendChild(menuWrap);
bar.appendChild(controlRow);
bar.appendChild(rangePicker);
```

(WO2 appends the overflow button to `controlRow`.)

CSS (responsive.css, ≤768px block). Find:

```css
    .mobile-chart-picker,
    .mobile-range-picker {
```

Change: delete `.mobile-chart-picker,` from that selector list and from the
`::-webkit-scrollbar` rule below it. Find:

```css
    .mobile-chart-button,
    .mobile-range-button {
```

Change to:

```css
    .mobile-menu-button,
    .mobile-overflow-button,
    .mobile-range-button {
```

Find:

```css
    .mobile-chart-button[aria-pressed='true'],
    .mobile-range-button[aria-selected='true'] {
```

Change to:

```css
    .mobile-range-button[aria-selected='true'] {
```

Then add after that rule (paste-ready):

```css
.mobile-controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.mobile-chart-menu-wrap {
    position: relative;
}

.mobile-chart-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 2000;
    min-width: 160px;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--panel-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    backdrop-filter: blur(20px);
}

.mobile-chart-menu[hidden] {
    display: none;
}

.mobile-chart-menu-item {
    min-height: 44px;
    padding: 8px 12px;
    text-align: left;
    font-family: var(--font-family-mono);
    font-size: 12px;
    color: var(--text-color);
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
}

.mobile-chart-menu-item[aria-checked='true'] {
    background: var(--hover-bg);
    color: var(--primary-color);
}
```

Tests (mobileControls.test.js): replace the three chart-picker tests ('renders the chart
picker directly above the chart section', 'tapping a chart button switches the active chart',
'tapping outside a button does nothing') with:

- renders a menu button labeled `Balance ▾` with `aria-haspopup="menu"`,
  `aria-expanded="false"`, and a hidden `role="menu"` with 5 `menuitemradio` items;
- clicking the button opens the menu (`aria-expanded="true"`); clicking the Performance item
  → `setActiveChart` called with `'performance'`, section un-hidden, `chartManager.update()`
  called once, button label becomes `Performance ▾`, menu hidden again;
- Escape closes the menu; a document click outside `.mobile-chart-menu-wrap` closes it.

Keep the `returns null` test, the range tests, and the `resolveRangePreset` describe
unchanged. Guardrail: the document-level click listener fires on any click in later tests —
assert menu-closed state, not listener absence. Verify: `npx jest tests/js/pages/terminal`
green; `npx stylelint css/terminal/responsive.css`.

---

**WO2** `[low]` `[visual]` — Overflow button + modal bottom sheet; currency moves into the sheet
(claims 23-24, 27)

Files: `js/pages/terminal/mobileControls.js`, `css/terminal/responsive.css`,
`js/pages/terminal/index.js`, `tests/js/pages/terminal/mobileControls.test.js`,
`tests/js/pages/terminal/index.test.js`, `tests/js/css/terminal_mobile_currency.test.js`.

JS (mobileControls.js). Find:

```js
controlRow.appendChild(menuWrap);
bar.appendChild(controlRow);
```

Change to (paste-ready):

```js
const overflowButton = document.createElement('button');
overflowButton.type = 'button';
overflowButton.className = 'mobile-overflow-button';
overflowButton.setAttribute('aria-haspopup', 'dialog');
overflowButton.setAttribute('aria-expanded', 'false');
overflowButton.setAttribute('aria-label', 'Display settings');
overflowButton.textContent = '⋯';

const sheetBackdrop = document.createElement('div');
sheetBackdrop.className = 'mobile-sheet-backdrop';
sheetBackdrop.hidden = true;

const sheet = document.createElement('div');
sheet.className = 'mobile-sheet';
sheet.setAttribute('role', 'dialog');
sheet.setAttribute('aria-modal', 'true');
sheet.setAttribute('aria-label', 'Display settings');
sheet.hidden = true;

const currencyToggle = document.getElementById('currencyToggleContainer');
if (currencyToggle) {
    sheet.appendChild(currencyToggle);
}

function setSheetOpen(open) {
    sheet.hidden = !open;
    sheetBackdrop.hidden = !open;
    overflowButton.setAttribute('aria-expanded', String(open));
    if (open) {
        const first = sheet.querySelector('button');
        if (first) {
            first.focus();
        }
    }
}

overflowButton.addEventListener('click', () => setSheetOpen(sheet.hidden));
sheetBackdrop.addEventListener('click', () => setSheetOpen(false));

controlRow.appendChild(menuWrap);
controlRow.appendChild(overflowButton);
bar.appendChild(controlRow);
document.body.appendChild(sheetBackdrop);
document.body.appendChild(sheet);
```

Also extend WO1's Escape keydown listener to close the sheet
(`if (event.key === 'Escape' && !sheet.hidden) { setSheetOpen(false); }`). Guardrails: the
sheet/backdrop MUST be appended to `document.body`, not the bar — `position: fixed` breaks
inside any ancestor with transform/filter, and body-level placement makes that impossible by
construction. Reparenting `#currencyToggleContainer` is safe: `currencyToggleManager.js`
binds by id and its `ensureToggleElements` only re-queries when the node leaves
`document.body` (`js/ui/currencyToggleManager.js:46-58`); `initCurrencyToggle()` runs before
`initMobileControls` in `initialize()` and its delegated click listener survives the move.

index.js. Find:

```js
            adjustMobilePanels();
            // Reveal the currency switcher with the same slide-in the other
            // pages use on mobile (css/toggle.css `.chart-loaded`).
            const toggleContainer = document.getElementById('currencyToggleContainer');
            if (toggleContainer) {
                toggleContainer.classList.add('chart-loaded');
            }
        });
```

Change to:

```js
            adjustMobilePanels();
        });
```

CSS (responsive.css, ≤768px block). Find:

```css
/* base.css's desktop `top: 15px` (id+class) outranks toggle.css's mobile
       `top: 50%` (plain id) — restate the vertical centering at equal
       specificity so the right-edge pill actually centers. */
.body-terminal #currencyToggleContainer {
    top: 50%;
}
```

Change: delete that block (the pill no longer floats). Keep the 44px
`.body-terminal .currency-toggle` rule. Add after it (paste-ready):

```css
.mobile-sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 2001;
}

.mobile-sheet-backdrop[hidden],
.mobile-sheet[hidden] {
    display: none;
}

.mobile-sheet {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 2002;
    display: flex;
    justify-content: center;
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
    background: var(--panel-bg);
    border-top: 1px solid var(--border-color);
    border-radius: 16px 16px 0 0;
    backdrop-filter: blur(20px);
}

/* toggle.css's floating-pill mobile rules target
       `body:not(.body-calendar) #currencyToggleContainer` (specificity 1,1,1) with
       !important and load AFTER this file — this selector must stay more specific
       (1,2,1) AND keep its !important flags. */
body.body-terminal .mobile-sheet #currencyToggleContainer {
    position: static !important;
    top: auto !important;
    right: auto !important;
    left: auto !important;
    transform: none !important;
    opacity: 1 !important;
    flex-direction: row;
    border-radius: 6px;
}
```

Tests. index.test.js: replace the two `chart-loaded` tests with — mobile: after
`importFresh()`, `document.querySelector('.mobile-sheet #currencyToggleContainer')` is not
null; desktop: `.mobile-sheet` is null and `#currencyToggleContainer`'s parent is
`document.body`. mobileControls.test.js: add — overflow button renders with
`aria-haspopup="dialog"`; clicking it un-hides the sheet and backdrop; clicking the backdrop
hides both; the currency container lands inside `.mobile-sheet`.
terminal_mobile_currency.test.js: keep the not-hidden and 44px tests; replace the
'restates the mobile vertical centering' test with one asserting responsive.css contains a
`body.body-terminal .mobile-sheet #currencyToggleContainer` rule with `position: static` and
`transform: none`. Verify: `npx jest tests/js/pages/terminal tests/js/ui/currencyToggleManager.test.js tests/js/css/`
green; `npx stylelint css/terminal/responsive.css`; mobile screenshot with the sheet open
(confirms the pill no longer floats over the chart).

---

**WO3** `[trivial]` `[visual]` — Legend: single horizontally-scrolling row (claims 23, 26)

File: `css/terminal/chart.css` (mobile block). Find:

```css
.chart-legend {
    /* Material data-viz mobile guidance: legend above the chart so it
           stays visible during touch interaction (docs/mobile-terminal-ux.md) */
    order: -1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(68px, 1fr));
    justify-items: start;
    gap: 8px 10px;
    margin-top: 0;
    margin-bottom: 12px;
}

.legend-item {
    justify-content: flex-start;
    align-items: center;
    gap: 6px;
    min-height: 44px;
}
```

Change to:

```css
.chart-legend {
    /* Material data-viz mobile guidance: legend above the chart so it
           stays visible during touch interaction (docs/mobile-terminal-ux.md) */
    order: -1;
    display: flex;
    flex-wrap: nowrap;
    gap: 16px;
    margin-top: 0;
    margin-bottom: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    white-space: nowrap;
}

.chart-legend::-webkit-scrollbar {
    display: none;
}

.legend-item {
    flex: 0 0 auto;
    justify-content: flex-start;
    align-items: center;
    gap: 6px;
    min-height: 44px;
}
```

Verify: `npx stylelint css/terminal/chart.css`;
`npx jest tests/js/css/terminal_mobile_legend.test.js` (existing order/min-height assertions
still hold); mobile screenshots of Balance AND Composition (dense legend stays one row).

---

**WO4** `[skip]` — Direct data labels on ≤3-series charts** (claim 26). Drawing canvas end-labels
on the contribution/performance/drawdown renderers (collision-aware placement, per-renderer
plumbing, visual judgment) — route to a stronger model with human visual review. Pointer:
`js/transactions/chart/renderers/contribution.js` and the M2 direct-labels guidance in
`docs/research/mobile-chart-declutter.md` §3.

---

**WO5** `[trivial]` — Final gate + cleanup sweep.** Confirm no dead references:
`grep -rn "mobile-chart-picker\|mobile-chart-button\|chart-loaded" js/ css/terminal/ tests/ terminal/`
(`chart-loaded` may legitimately remain in `js/pages/position/index.js`,
`js/pages/calendar/index.js`, `css/toggle.css` — those are other pages; flag only
terminal-page references). Then `make precommit-fix` green, mobile screenshots (default, menu
open, sheet open), and report for human visual review.

## 7. Open questions / what I couldn't verify

- **Chart-UX pattern research landed**: `docs/research/mobile-chart-ux-sources.md` (claims 16-22
  in §4.6). Couldn't verify there: ChatGPT's embedded stock chart has no official spec; the exact
  iPhone Stocks range list (Apple enumerates it only in the Mac guide); any official
  currency-switcher precedent; legend tap-to-toggle has no primary-guideline endorsement
  (library convention only); Google Finance native app behavior (only mobile web was checked).
- **Final chart-picker set and default range preset** (items 3-4) are product decisions — the
  owner picks the chart list and whether the default range stays `from 2024-01-01`.
- **WCAG/Apple/Material primary texts**: w3.org returned 403 and Apple's/Material's guideline
  pages are JS-rendered; the 24px/44px/48dp figures are corroborated by multiple independent
  sources but the normative pages were not read directly.
- **Real-device behavior unverified**: keyboard occlusion, tap ergonomics, and chart legibility
  are inferred from code + cited research. A human must verify on an actual phone before the
  nav re-enable (§6.0, gated).
