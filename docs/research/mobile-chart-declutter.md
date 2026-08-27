# Decluttering a chart-first mobile finance page: evidence-backed layout options

Date: 2026-08-27
Status: findings only — no repo code changes were made.
Follow-up to: `docs/research/mobile-chart-ux-sources.md` (2026-08-27). This doc does not
repeat that evidence; it cites it where needed.

## The question

The `/terminal/` mobile layout (≤768 px) is chart-only and functionally correct, but the
owner calls it "extremely cluttered." Currently visible at once: nav pill, a
horizontally-scrolling chart-picker row (Balance / Performance / Drawdown / Composition /
Sectors), a range row (1M 3M 6M YTD 1Y ALL), the glass chart card with a legend grid above
the plot (2 rows of ticker chips on Composition), a floating 4-button currency switcher
(USD/CNY/JPY/KRW) pinned to the right edge, and a footer icon. What is the best-evidence,
least-cluttered arrangement of these control groups — including an honest evaluation of
the owner's "iOS Timer drum/wheel picker" idea for chart selection?

Only primary sources: Apple HIG (via DocC JSON), Apple Support user guides, Material
Design 2/3 (rendered with Playwright where server-side fetch fails), NN/g, and
live-verified app behavior via Playwright (Chromium, iPhone UA, 390×844 viewport).

## Answer summary

- **No primary source endorses showing four control groups (chart picker + range +
  currency + legend) simultaneously on a phone.** Both reference apps show at most two:
  Apple Stocks shows only a range selector above the chart; Google Finance mobile web
  shows three compact menu buttons (chart type, compare, indicator) plus a range tab row
  below the chart. Currency in Apple Stocks is a _settings-level_ option, not chart chrome.
- **The supported declutter pattern is "combo": keep the primary control visible, collapse
  secondary controls into a menu/bottom sheet.** NN/g measured hidden-only navigation as
  significantly worse, but mobile users used combo (partially visible) navigation 1.5× more
  than fully hidden; HIG sanctions pop-up buttons for mutually exclusive choices when space
  is limited, and M3 sanctions modal bottom sheets as the mobile container for secondary
  settings.
- **The drum/wheel picker is the wrong component for a 5-item chart list, per HIG itself.**
  HIG: wheels are for medium-to-long, predictable, ordered lists; for "a fairly short list
  of choices" it says to use a pull-down button instead, warning a picker "may add too much
  visual weight to a short list of items." The HIG-blessed compact form of the owner's idea
  is a pop-up button showing the current chart's name.
- **Legend clutter:** M2 sanctions direct data labels (eliminating the legend) for simple
  charts and keeps the above-chart legend only for dense charts. Folding values into the
  touch-and-hold tooltip is M2's prescribed mobile readout pattern; "legend visible only
  while scrubbing" is an extrapolation, not a documented pattern (see Open questions).
- **The floating currency pill has no primary-source support.** M3's floating-control
  guidance (FAB) reserves floating overlays for the single primary constructive action and
  says "Individual components, such as cards, shouldn't have their own FAB." Currency
  belongs in-flow or in a sheet.

## Ranked layout proposals

### Proposal 1 — Consolidate: one compact bar + overflow bottom sheet (recommended)

Strongest combined evidence basis (NN/g combo navigation + HIG pop-up/pull-down buttons +
M3 bottom sheets + Google Finance's verified live layout).

Visible chrome, top to bottom:

1. Nav pill (unchanged).
2. **One compact control bar**: a pop-up-style button labeled with the current chart name
   (e.g. "Balance ▾") that opens a menu of the 5 charts, and a single overflow (⋯/gear)
   button that opens a modal bottom sheet.
3. **Range row stays visible** (1M 3M 6M YTD 1Y ALL) adjacent to the chart — both reference
   apps keep ranges visible and exceed the ~5-segment guideline without incident.
4. Chart card.

Element fates:

- **5 chart buttons** → items in the pop-up menu; the button label shows the current
  selection (fixes the "low information scent" problem NN/g flags for icon-only menus).
- **6 range tabs** → unchanged, still visible.
- **4 currency buttons** → a segmented control inside the modal bottom sheet (M2: "Data
  can be filtered or changed using toggle controls, tabs, and drop-downs"; M3: bottom
  sheets hold "supplementary content and actions"). Matches Apple Stocks treating currency
  as a settings-level option.
- **Legend grid** → direct labels on the ≤3-series charts (Balance, Performance, Drawdown);
  a single-line legend (or tooltip-only readout) on dense Composition/Sectors charts.

Trade-off: chart switching costs one extra tap, and NN/g's data says hidden options are
used less — mitigated because the current selection stays visible as the button label and
the 5 charts are a fixed, learnable set.

### Proposal 2 — Gesture-first: swipe between charts, minimal rows

Basis: M2 explicitly sanctions it — "On mobile, pagination is a common pattern that allows
users to view the previous or next chart by swiping right or left."

Visible chrome, top to bottom:

1. Nav pill.
2. **Chart-name title** above the card (small, with ‹ › chevrons as the onscreen
   equivalent — HIG Accessibility requires that gesture-only actions "offer onscreen ways
   to achieve the same outcome").
3. Range row (unchanged).
4. Chart card. **Horizontal swipe on the plot switches charts** (must not conflict with
   the existing drag-to-scrub crosshair — scrub is a one-finger drag starting anywhere on
   the plot, so swipe-to-switch realistically has to be an edge/axis gesture or a fling
   threshold distinct from scrubbing; this conflict is the proposal's main risk and no
   primary source resolves it).

Element fates:

- **5 chart buttons** → removed; replaced by swipe + the chevrons/title (tap the title to
  jump directly, effectively proposal 1's pop-up as backup).
- **6 range tabs** → unchanged.
- **4 currency buttons** → same bottom-sheet consolidation as proposal 1.
- **Legend grid** → same treatment as proposal 1.

Trade-off: maximal declutter, weakest discoverability; NN/g's hidden-navigation numbers
argue against making swipe the _only_ path. Best adopted _in addition to_ proposal 1's
pop-up, not instead of it.

### Proposal 3 — The owner's wheel/drum picker (evaluated honestly: not recommended)

What HIG actually says (all from the Pickers page):

- Wheels fit "medium-to-long lists of items"; for a short list, "consider using a
  pull-down button instead of a picker."
- A wheel "may add too much visual weight to a short list of items."
- Occlusion is inherent: "Before people interact with a picker, many of its values can be
  hidden," so values should be "predictable and logically ordered" — chart names are an
  arbitrary order users cannot predict.
- "Avoid switching views to show a picker" — a wheel that appears on demand is just a
  worse-density menu.

A 5-item chart list is short, unordered, and unfamiliar → three of HIG's wheel
preconditions fail. The drum's appeal (physical, glanceable spin) is real on watchOS
(Digital Crown) and for date/time entry, but not here. **The honest verdict: the instinct
behind the idea — replace the 5-button row with one compact control — is right; the wheel
is the wrong component. The HIG-sanctioned form of that instinct is the pop-up button in
proposal 1.**

Element fates if used anyway: 5 chart buttons → one drum (modal or inline); range tabs,
currency, legend unchanged — i.e., it declutters only one of the four control groups,
which is insufficient for the complaint.

## Evidence, claim by claim

### 1. Consolidation of multiple control groups

- **NN/g (mobile navigation study, 179 participants, 6 sites):** hidden navigation was
  used in 57% of mobile cases vs 86% for combo navigation ("1.5 times more"); task time
  on mobile was "15% slower" when hidden; recommendation for phones: "If your site has 4
  or fewer top-level navigation links, display them as visible links," otherwise hide
  some. <https://www.nngroup.com/articles/hamburger-menus/> (Navigation Recommendations)
  _Note: the study is about site navigation; applying it to in-page control groups is an
  extrapolation (see Open questions)._
- **HIG, Pull-down buttons:** "Consider using a More pull-down button to present items
  that don't need prominent positions in the main interface," while warning it "can also
  hinder discoverability" because "the ellipsis icon doesn't necessarily help them predict
  its contents." Also: "Avoid putting all of a view's actions in one pull-down button."
  <https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons>
  (Best practices)
- **HIG, Pop-up buttons:** "Use a pop-up button to present a flat list of mutually
  exclusive options or states"; "Consider using a pop-up button when space is limited and
  you don't need to display all options all the time"; pop-up buttons are "a
  space-efficient way to present a wide array of choices"; the button "can update its
  content to indicate the current selection."
  <https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons>
  (Best practices)
- **M3, Bottom sheets:** "Bottom sheets display supplementary content and actions on a
  mobile screen"; content "should be additional or secondary (not the app's main
  content)"; "Use a modal bottom sheet as an alternative to inline menus or simple dialogs
  on mobile"; they "appear when triggered by a user action, such as tapping a button or an
  overflow icon."
  <https://m3.material.io/components/bottom-sheets/overview> and
  <https://m3.material.io/components/bottom-sheets/guidelines> (Usage, Visibility)
- **M2, Data visualization:** "Data can be filtered or changed using toggle controls,
  tabs, and drop-downs."
  <https://m2.material.io/design/communication/data-visualization.html> (Behavior → Data
  controls; rendered via Playwright 2026-08-27)
- **Apple Stocks (iPhone), documented control inventory:** the chart view exposes only
  (a) the big price/change readout, (b) "time range selections at the top of the chart,"
  (c) touch-and-hold scrub; secondary stats are progressively disclosed — "Swipe the data
  below the chart to see additional details." No chart-type picker, no legend, no currency
  control in the chart view. Apple Support, iPhone User Guide, "Check stocks."
  <https://support.apple.com/guide/iphone/check-stocks-iph1ac0b1bc/ios>
- **Apple Stocks currency is settings-level, not chart chrome:** "Display the currency a
  stock is traded in: Tap ⋯, tap Watchlist Shows, then tap Show Currency." Same page
  (Manage symbols in the My Symbols watchlist).
- **Google Finance mobile web (live-verified 2026-08-27, Playwright/Chromium, iPhone UA,
  390×844, `google.com/finance/quote/AAPL:NASDAQ`):** visible chart-adjacent controls are
  exactly three 32px-high buttons above the plot — "Select Chart Type - Area selected"
  (exposes `aria-haspopup="menu"`), "Compare to financial entity," "Select technical
  indicator" — plus an 8-tab range row (1D 5D 1M 6M YTD 1Y 5Y MAX) below the plot
  (`role="tab"`, `aria-selected`), then section tabs (Overview/Analysis/Earnings/
  Financials/Holdings). No persistent legend, no currency switcher, no floating overlays.
  Method note: menu contents could not be captured (headless overlay closed before
  enumeration); only `aria-haspopup="menu"` is asserted.

### 2. The wheel/drum picker

- **HIG, Pickers:** "Consider using a picker to offer medium-to-long lists of items." For
  short lists: "consider using a pull-down button instead of a picker" because a picker
  "may add too much visual weight to a short list of items."
  <https://developer.apple.com/design/human-interface-guidelines/pickers> (Best practices)
- **Occlusion/discoverability:** "Before people interact with a picker, many of its values
  can be hidden"; mitigate only with "predictable and logically ordered values." Same page.
- **Placement:** "Avoid switching views to show a picker"; a picker "works well when
  displayed in context," near the field being edited. Same page.
- **The iOS Timer drum is a date picker in "Countdown timer" mode** (hours/minutes,
  0–23:59) — i.e., Apple's canonical wheel use is for dense numeric ranges, not short
  categorical lists. Same page (Platform considerations, iOS).
- **WatchOS is the exception that proves the rule:** wheels are the default there because
  of the Digital Crown ("helps people manage selections in a precise and engaging way") —
  hardware this web page doesn't have. Same page (watchOS).
- **Modern compact alternative:** HIG Pop-up buttons (quoted in §1) — mutually exclusive
  choices, space-limited contexts. That is the sanctioned replacement for the owner's
  idea.

### 3. Legends on mobile, revisited

- **M2:** "Applying text labels to data also helps clarify its meaning, while eliminating
  the need for a legend." And: "Chart elements can be labeled directly in simple charts,"
  while dense charts "can display labels in a legend." →
  Balance/Performance/Drawdown (1–3 series) should use direct labels;
  Composition/Sectors may keep a legend.
  <https://m2.material.io/design/communication/data-visualization.html> (Style → Legends
  and annotation; rendered via Playwright 2026-08-27)
- **M2 mobile placement (unchanged from prior research):** "On mobile, place the legend
  above the chart to keep it visible during interactions." Same page.
- **Fold values into the interaction readout:** "On mobile, a touch and hold gesture
  displays a tooltip placed above the chart," and "Reveal chart details using progressive
  disclosure, which allows users to view specific data points as needed." Same page
  (Behavior → Progressive disclosure). The existing drag crosshair is already this
  surface; dense-chart series names/values can live there.
- **NN/g (analogous):** when data doesn't fit mobile, "Let Users Select the Data to View"
  — user-controlled subsetting beats squeezing all series chips in.
  <https://www.nngroup.com/articles/mobile-tables/>
- **Not sanctioned:** a persistent 2-row chip grid on a dense chart is the maximal-clutter
  option; M2's only concession to density is a legend, and its clear preference order is
  direct labels > legend. (No source explicitly endorses "legend visible only while
  scrubbing" — see Open questions.)

### 4. Reducing simultaneous chrome; floating overlays

- **NN/g:** mobile screen space is "a precious commodity," and the design problem is
  "prioritizing content while still making navigation (and other chrome) accessible" —
  the argument for combo (partially visible) rather than all-visible or all-hidden.
  <https://www.nngroup.com/articles/hamburger-menus/>
- **M3, FAB (the only floating-overlay component guidance found):** "Use a FAB for the
  most important action on a screen"; a FAB "promotes an important, constructive action
  such as: Create, Favorite, Share, Start a process"; "Don't use FABs for minor, overflow,
  unclear, or destructive actions"; "Individual components, such as cards, shouldn't have
  their own FAB." Currency switching is a state selection, not a constructive primary
  action → the floating currency pill matches no sanctioned floating pattern.
  <https://m3.material.io/components/floating-action-button/guidelines> (Usage, Actions,
  Adaptive design; rendered via Playwright 2026-08-27)
- **Live-verified corroboration:** neither reference app floats any control over the chart
  (Apple Stocks per the Support guide's documented control inventory; Google Finance per
  the 2026-08-27 Playwright enumeration in §1).
- **HIG Accessibility guardrail for any gesture-based decluttering:** gesture
  functionality must "offer onscreen ways to achieve the same outcome."
  <https://developer.apple.com/design/human-interface-guidelines/accessibility> (Mobility;
  via prior research doc)

## Open questions / could not verify

- **NN/g's hidden/combo/visible data is about site navigation, not in-page controls.**
  Applying "combo wins" to control consolidation is a reasoned extrapolation; no primary
  study of hidden _controls_ (vs navigation) on mobile was found.
- **"Legend on demand" (show legend only while scrubbing):** no primary source explicitly
  endorses or forbids it. It extrapolates from M2's touch-and-hold tooltip and progressive
  disclosure guidance. Prototype-and-review with the owner rather than citing as
  established.
- **Google Finance chart-type menu contents:** `aria-haspopup="menu"` verified, but the
  open menu's item list could not be captured headlessly (overlay dismissed before
  enumeration). The menu _options_ (Area/Line/Candlestick?) are unverified.
- **Swipe-to-switch vs. drag-to-scrub conflict:** M2 sanctions both swipe-pagination and
  touch-and-hold tooltips but no source gives a conflict-resolution rule when both live on
  one canvas. Needs prototyping.
- **M3 bottom sheets on the web:** M3 is a native-mobile spec; a web bottom sheet is a
  convention, not a standard. No W3C/ARIA pattern named "bottom sheet" exists (closest:
  ARIA dialog).
- **Currency-switcher precedent:** still no primary finance-app precedent for an in-chart
  currency toggle (carried over from the prior research doc); Apple's treatment is
  settings-level, which is why all proposals demote it.

## Source list (primary only; new this round)

- Apple HIG — Pickers: <https://developer.apple.com/design/human-interface-guidelines/pickers> (via DocC JSON, fetched 2026-08-27)
- Apple HIG — Pull-down buttons: <https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons> (via DocC JSON, fetched 2026-08-27)
- Apple HIG — Pop-up buttons: <https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons> (via DocC JSON, fetched 2026-08-27)
- Apple Support, iPhone User Guide — Check stocks: <https://support.apple.com/guide/iphone/check-stocks-iph1ac0b1bc/ios>
- Material Design 3 — Bottom sheets: <https://m3.material.io/components/bottom-sheets/overview> · <https://m3.material.io/components/bottom-sheets/guidelines> (rendered via Playwright 2026-08-27)
- Material Design 3 — FAB guidelines: <https://m3.material.io/components/floating-action-button/guidelines> (rendered via Playwright 2026-08-27)
- Material Design 2 — Data visualization: <https://m2.material.io/design/communication/data-visualization.html> (rendered via Playwright 2026-08-27)
- NN/g — Hamburger Menus and Hidden Navigation Hurt UX Metrics (2016): <https://www.nngroup.com/articles/hamburger-menus/>
- Google Finance quote page, live behavior: <https://www.google.com/finance/quote/AAPL:NASDAQ> (verified 2026-08-27, Playwright/Chromium, iPhone UA, 390×844)

Carried over from `docs/research/mobile-chart-ux-sources.md` (verified there): HIG Charts,
HIG Segmented controls, HIG Accessibility, WCAG 2.5.5/2.5.8, NN/g mobile tables,
progressive disclosure, touch targets.
