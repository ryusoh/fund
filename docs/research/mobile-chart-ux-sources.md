# Mobile chart-first financial dashboard: evidence-backed UX patterns

Date: 2026-08-27
Status: findings only — no repo code changes were made.

## The question

What are the best-established, evidence-backed UX patterns for a **mobile, chart-first
financial dashboard**? Context: the `terminal/` page of this repo is being redesigned for
phones to show **only charts** (no typed commands), with a chart picker, a timeline/range
selector, a legend, and a currency switcher (USD/TWD). Named reference points: Apple iOS
Stocks, Google Finance mobile, and ChatGPT's embedded stock chart. Only primary sources
were used (Apple HIG / Apple Support, Material Design 2/3, NN/g, W3C WCAG, OpenAI), with
live-app behavior verified by rendering where official docs were silent.

## Answer summary

- **Range selector:** a single-select segmented-control-style row directly adjacent to the
  chart is the dominant pattern. Apple Stocks puts it **above** the chart; Google Finance
  mobile web puts it **below**. Both offer 7–11 options; HIG and Material 3 both cap
  segmented controls at ~5 segments on phones, so both apps exceed the generic
  guideline — the pattern still works because each segment is a short, equal-importance
  label. Selection is shown by a persistent highlight plus `aria-selected`.
- **Touch interaction:** touch-and-hold scrub across the plot area with a value readout is
  the canonical mobile pattern (Apple documents it by name; Material prescribes
  touch-and-hold + tooltip above the chart). HIG explicitly recommends making the **entire
  plot area** the hit target rather than individual data points. Keep axis labels sparse.
- **Legend:** Material's data-visualization guidance says: on mobile, place the legend
  **above** the chart so it stays visible during touch interaction; better yet, label data
  directly to eliminate the legend. NN/g's mobile-table research generalizes: let users
  select the subset of data they want to see.
- **Switcher sizing:** Apple 44×44 pt, Material 48×48 dp (~9 mm), WCAG 2.5.5 (AAA)
  44×44 CSS px, WCAG 2.5.8 (AA, WCAG 2.2) 24×24 CSS px minimum, NN/g 1 cm × 1 cm.
  A 2–3 option currency toggle fits a segmented control comfortably.
- **Default chart selection:** progressive disclosure (NN/g) + glanceability (NN/g
  dashboard definition; Apple HIG watchOS guidance). Show one key number + one line chart
  first (the Apple Stocks layout); prefer line/bar encodings (length and 2D position are
  preattentive); avoid pie/donut/gauge for at-a-glance reading.

## Evidence, claim by claim

### 1. Timeline / range selector

- **Apple Stocks (iPhone):** the range selector sits at the top of the chart. Apple
  Support, iPhone User Guide, "Check stocks": "Tap an option from the time range
  selections at the top of the chart."
  <https://support.apple.com/guide/iphone/check-stocks-iph1ac0b1bc/ios>
- **Apple Stocks (Mac):** the full documented range list is 1D, 1W, 1M, 3M, 6M, YTD, 1Y,
  2Y, 5Y, 10Y, ALL; selection is highlighted and persists across symbols. Apple Support,
  Stocks User Guide for Mac, "Change the chart display": "click an option in the range
  selector at the top of the chart"; "The time range you choose is highlighted in the
  range selector." Also: the chosen range "applies to all ticker symbols."
  <https://support.apple.com/en-al/guide/stocks/stc4cfc704df/mac>
- **Apple HIG, Charts:** uses Stocks itself as the model: a line graph of performance
  "during the time period people choose, such as one day, three months, or five years."
  <https://developer.apple.com/design/human-interface-guidelines/charts> (Best practices)
- **Google Finance (mobile web, verified live):** on `google.com/finance/quote/AAPL:NASDAQ`
  rendered in a 390×844 px iPhone viewport via Playwright on 2026-08-27, the range
  selector is a row of `role="tab"` elements offering **1D, 5D, 1M, 6M, YTD, 1Y, 5Y,
  MAX**, positioned **below** the chart plot area (tab row top at y≈411; chart plot area
  ends at y≈396). Selection is exposed as `aria-selected="true"` (1D by default) plus a
  visual style. Google's Help Center confirms comparison controls also live "under the
  chart": "Under the chart, select one of the recommended securities."
  <https://support.google.com/finance/?hl=en> ("Compare securities")
- **Apple HIG, Segmented controls:** single choice from a set; equal-width segments;
  "no more than about five segments on iPhone" (5–7 in wide interfaces). A segmented
  control "can be useful as a way to quickly switch between related subviews."
  <https://developer.apple.com/design/human-interface-guidelines/segmented-controls>
- **Material 3, Segmented buttons:** "Segmented buttons can have 2-5 segments"; labels
  short; don't wrap segments to a new line; selected segment shows a checkmark when icons
  are used with labels. Note: in the M3 "expressive" update, segmented buttons are
  superseded by the "connected button group" with the same functionality.
  <https://m3.material.io/components/segmented-buttons/overview> and
  <https://m3.material.io/components/segmented-buttons/guidelines>
- **ChatGPT:** OpenAI's ChatGPT search announcement only says they added "new visual
  designs for categories like weather, stocks, sports, news, and maps" — no official
  documentation of the inline stock chart's controls was found (see Open questions).
  <https://openai.com/index/introducing-chatgpt-search/>

### 2. Chart interaction on touch

- **Scrubbing (Apple Stocks, documented):** "View the value for a specific date or time:
  Touch and hold the chart with one finger." Two-finger touch-and-hold shows the
  difference in value between two points. Same iPhone User Guide page as above.
- **Scrubbing (Apple HIG):** Stocks lets people "drag a vertical indicator through the
  line graph, revealing the value at the selected time." HIG then generalizes: when marks
  are too small to target individually, "consider expanding the hit target to include the
  entire plot area, letting people scrub across the area."
  <https://developer.apple.com/design/human-interface-guidelines/charts> (Best practices)
- **Material, data visualization behavior:** "On mobile, a touch and hold gesture displays
  a tooltip placed above the chart." Zoom: pinch (double-tap when zoom isn't the primary
  action). Pan: one-finger swipe, constrained to the meaningful dimension. Pagination:
  swipe right/left to move to the previous/next chart.
  <https://m2.material.io/design/communication/data-visualization.html> (Behavior)
- **Tap vs. drag conflicts:** no source gives a conflict-resolution algorithm, but Apple
  HIG Accessibility requires gesture functionality to also be reachable via onscreen
  controls ("offer onscreen ways to achieve the same outcome"), i.e., scrubbing must not
  be the only way to read a value.
  <https://developer.apple.com/design/human-interface-guidelines/accessibility> (Mobility)
- **Axis label density on small screens:** Apple HIG: if the chart supports inspecting
  individual points interactively, "you might use fewer grid lines and light label colors
  to ensure the data remains visually prominent"; prefer common tick sequences (0, 5, 10…)
  over uncommon ones. Material: "Support legibility by using a balanced number of axis
  labels" / "Don't overload the chart with numerous axis labels"; place text labels
  horizontally, never rotated or vertically stacked.
  HIG Charts (Axes); M2 data visualization (Style → Axis labels, Text orientation).

### 3. Legends on mobile

- **Material (the only primary source with explicit mobile legend guidance):** "On
  desktop, it's recommended to place a legend below a chart. On mobile, place the legend
  above the chart to keep it visible during interactions." Also: "Applying text labels to
  data also helps clarify its meaning, while eliminating the need for a legend"; legend
  labels sit at the bottom of the type hierarchy (12 pt). Dense charts may use a legend;
  simple charts should use direct labels.
  <https://m2.material.io/design/communication/data-visualization.html> (Style → Legends
  and annotation, Typography)
- **Apple HIG, Charts:** a legend "describes chart properties that aren't related to a
  mark's position, such as the use of color or shape"; color must be supplemented with
  shapes/patterns so the chart reads without color vision. No truncation or
  horizontal-scroll legend guidance is given.
  <https://developer.apple.com/design/human-interface-guidelines/charts> (Anatomy, Color)
- **NN/g, mobile tables (analogous evidence):** when data doesn't fit, "Let Users Select
  the Data to View" — user-controlled subsetting beats squeezing everything in; if
  horizontal scrolling is unavoidable, indicate it with cut-off elements or arrows, not
  dots. <https://www.nngroup.com/articles/mobile-tables/>
- **Tap-to-toggle series:** no primary UX-guideline source found prescribing or warning
  against legend tap-to-toggle on mobile. Material's data-viz "Data controls" section
  (filter via "toggle controls, tabs, and drop-downs") is the closest sanction of the
  general pattern. See Open questions.

### 4. Compact switchers and touch-target sizes

- **WCAG 2.5.8 Target Size (Minimum), Level AA (WCAG 2.2):** "The size of the target for
  pointer inputs is at least 24 by 24 CSS pixels," with spacing/equivalent/inline/user-
  agent/essential exceptions. This is the hard floor for the web.
  <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>
- **WCAG 2.5.5 Target Size (Enhanced), Level AAA:** targets at least 44 by 44 CSS pixels;
  recommended as best practice for important controls even when claiming only AA.
  <https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html>
- **Apple:** "Create controls that measure at least 44 points x 44 points so they can be
  accurately tapped with a finger."
  <https://developer.apple.com/design/tips/> (UI Design Dos and Don'ts → Hit Targets)
- **Material:** "consider making touch targets at least 48 x 48 dp" (~9 mm physical;
  7–10 mm recommended), with 8 dp separation between targets; the same page explicitly
  notes the iOS recommendation is 44×44 pt.
  <https://m2.material.io/design/usability/accessibility.html> (Layout and typography)
- **NN/g:** make all interactive elements "at least 1cm × 1cm (0.4in × 0.4in)" with
  enough spacing from competing targets.
  <https://www.nngroup.com/articles/touch-target-size/>
- **Implication for a currency toggle:** a 2–3 option switch (USD/TWD/…) is a textbook
  single-select segmented control: inside both HIG (≤5 on iPhone) and M3 (2–5) limits,
  easily meeting 44 pt / 48 dp / 44 px targets.

### 5. Which charts to show by default (glanceability, progressive disclosure)

- **NN/g dashboard definition:** "Dashboards are collections of data visualizations,
  presented in a single-page view that imparts at-a-glance information on which users can
  act quickly." Dashboards are "not intended as expansive views of complex data."
  <https://www.nngroup.com/articles/dashboards-preattentive/>
- **NN/g encoding ranking:** length and 2D position are preattentive and quantitatively
  accurate, so line and bar charts read fastest; pie/donut/gauge charts rely on area and
  angle, which people judge poorly, and "should be avoided most of the time" for quick
  communication. Same article.
- **NN/g chart-type guidance:** "for most UX purposes, we recommend the basics: bar
  charts, line charts, or scatter plots."
  <https://www.nngroup.com/articles/choosing-chart-types/>
- **NN/g progressive disclosure:** "Initially, show users only a few of the most important
  options"; get the split between initial and secondary features right (what appears on
  the initial display signals importance); determine the split via frequency-of-use
  statistics and task analysis.
  <https://www.nngroup.com/articles/progressive-disclosure/>
- **Material, dashboards:** a dashboard should "Prioritize the most important information
  (using layout)" and "Display a focal point that prioritizes information according to
  hierarchy (using color, position, size, and visual weight)." Operations dashboards —
  which explicitly include "Displaying stock market performance" — "feature current
  information arranged in a set of simple charts." Material's "Scalable" principle: "Adapt
  visualizations for different device sizes, while anticipating user needs on data depth."
  <https://m2.material.io/design/communication/data-visualization.html> (Principles,
  Dashboards)
- **Apple HIG, Charts:** an effective chart "highlights a few key pieces of information in
  a dataset"; "it's essential to summarize key information so that people can grasp it
  quickly" (Weather's title+subtitle example). watchOS guidance: "prefer displaying useful
  information people can get at a glance" and defer detail to the paired phone.
  <https://developer.apple.com/design/human-interface-guidelines/charts>
- **The "one big number + chart" pattern in Apple Stocks (documented):** the detail view
  shows "a stock's most recent price, daily percentage change, market capitalization
  value, and more" above the interactive chart; secondary stats (52-week high/low, Beta,
  EPS, volume) are progressively disclosed — "Swipe the data below the chart to see
  additional details." Same iPhone User Guide page as above.
- **Chart picker on mobile:** Material sanctions swipe pagination ("On mobile, pagination
  is a common pattern that allows users to view the previous or next chart") and
  tabs/toggles/dropdowns as data controls; both fit a small set of chart choices.

## Open questions / could not verify

- **ChatGPT embedded stock chart:** no official spec exists. The only first-party
  statement is the ChatGPT search announcement (visual designs for stocks, among other
  categories). Ranges offered, scrub behavior, and legend handling are undocumented; they
  could only be verified with a live ChatGPT session, which was not available in this
  research environment.
- **Exact iPhone Stocks range list:** Apple's iPhone User Guide describes the selector's
  placement and gestures but does not enumerate the ranges; the 1D…ALL list above is from
  the **Mac** user guide. The commonly cited iPhone list (1D/1W/1M/3M/6M/1Y/2Y/5Y) could
  not be confirmed from an official source in this session.
- **Currency switcher precedent:** no official guidance or documented behavior for an
  in-chart currency toggle was found in any of the three reference apps' documentation.
  The iPhone Stocks guide documents only a watchlist-level "Show Currency" display option
  ("tap Watchlist Shows, then tap Show Currency"). The segmented-control guidance in §4 is
  the applicable generic pattern, not a finance-specific precedent.
- **Legend tap-to-toggle series:** widely used in charting libraries, but no primary UX
  guideline (Apple, Material, NN/g, W3C) was found that explicitly endorses or evaluates
  it on mobile; treat as a library convention, not an evidence-backed pattern.
- **Google Finance mobile app (Android/iOS native):** verification was done on mobile
  **web** in an emulated iPhone viewport (390×844); the native app's layout was not
  verified.
- **Axis-label collision behavior on the reference apps:** none of the official docs
  describe how Apple/Google thin tick labels on narrow screens; only the generic
  density guidance above is citable.

## Source list (primary only)

- Apple Human Interface Guidelines — Charts: <https://developer.apple.com/design/human-interface-guidelines/charts>
- Apple Human Interface Guidelines — Segmented controls: <https://developer.apple.com/design/human-interface-guidelines/segmented-controls>
- Apple Human Interface Guidelines — Accessibility: <https://developer.apple.com/design/human-interface-guidelines/accessibility>
- Apple — UI Design Dos and Don'ts: <https://developer.apple.com/design/tips/>
- Apple Support, iPhone User Guide — Check stocks: <https://support.apple.com/guide/iphone/check-stocks-iph1ac0b1bc/ios>
- Apple Support, Stocks User Guide for Mac — Change the chart display: <https://support.apple.com/en-al/guide/stocks/stc4cfc704df/mac>
- Google Finance Help — Follow & compare securities: <https://support.google.com/finance/?hl=en>
- Google Finance quote page (live behavior, verified 2026-08-27 via Playwright, mobile viewport): <https://www.google.com/finance/quote/AAPL:NASDAQ>
- Material Design 2 — Data visualization: <https://m2.material.io/design/communication/data-visualization.html>
- Material Design 2 — Accessibility (touch targets): <https://m2.material.io/design/usability/accessibility.html>
- Material Design 3 — Segmented buttons: <https://m3.material.io/components/segmented-buttons/overview> and <https://m3.material.io/components/segmented-buttons/guidelines>
- W3C WCAG 2.2 — Understanding SC 2.5.8 Target Size (Minimum): <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>
- W3C WCAG — Understanding SC 2.5.5 Target Size (Enhanced): <https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html>
- NN/g — Dashboards: Making Charts and Graphs Easier to Understand (2017): <https://www.nngroup.com/articles/dashboards-preattentive/>
- NN/g — Progressive Disclosure (Nielsen, 2006): <https://www.nngroup.com/articles/progressive-disclosure/>
- NN/g — Mobile Tables: Comparisons and Other Data Tables (2017): <https://www.nngroup.com/articles/mobile-tables/>
- NN/g — Touch Targets on Touchscreens (2019): <https://www.nngroup.com/articles/touch-target-size/>
- NN/g — Choosing Chart Types: Consider Context (2022): <https://www.nngroup.com/articles/choosing-chart-types/>
- OpenAI — Introducing ChatGPT search (2024): <https://openai.com/index/introducing-chatgpt-search/>
