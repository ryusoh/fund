# Analysis pane visual design (terminal page)

Findings doc for the visual/UX layer of the analysis subsystem inside the
terminal's third pane. Merge mechanics (pane model, command grammar, lazy
loading, CSS scoping) are settled in `docs/terminal-analysis-merge.md` and
already executed; this doc covers only how each function view should look and
behave.

## The question

How should the visual representation of the analysis subsystem (Kelly sizing,
Monte Carlo, Bayesian belief state, evidence timeline, falsifiable predictions,
decision journal, scenario cards, value bands) be designed inside the terminal
page?

## The answer (short version)

- **One function code per screen, with persistent chrome.** Each `analysis`
  subcommand shows exactly one section in the pane (already implemented); add
  the two things a Bloomberg function screen always carries and the pane
  currently lacks: the **active function label** next to the security context,
  and the **as-of date** of the underlying data. The context strip
  (security, Bloomberg's "loaded security") is the persistent header; the stage
  below is the function screen.
- **Flat mono text on the shared glass, hairline dividers, one accent color.**
  This is already the stylesheet's stated intent (`css/terminal/analysis.css:1-7`)
  and the right call — finish it: the remaining 67 inline `style.` assignments
  in `js/pages/analysis/lab.js` (including hardcoded `'white'`/`'red'`) should
  become classes so the pane root owns all visual decisions.
- **Color semantics come only from the existing terminal tokens** — green =
  bullish/positive, red = bearish/negative/overdue, gold = active/attention,
  blue = informational, muted = secondary (`css/terminal/base.css:1-18`). Never
  color-only: every color-coded element also carries a text label (mostly true
  today; the superseded-evidence treatment is the exception).
- **The scrollback is the announcement channel; the pane is the visual
  detail.** Every function view prints a one-line snapshot carrying _that
  function's_ headline numbers (the `plot` hybrid precedent,
  `js/transactions/terminal/snapshots.js`). Today all seven function views
  print the same generic price/EPS/vol line — make each snapshot
  function-specific.
- **Canvases are decorative duplicates of DOM metrics.** Every number drawn on
  the Kelly/MC canvases must also exist as DOM text (true today via the badge
  rows and stat cards), so the canvases get `role="img"` + a dynamic
  `aria-label` (or `aria-hidden`), keep their fixed backing store (safe under
  the hidden-measurement landmine), and render at 2× for DPR sharpness.

## Current state audit

### Shell and integration (what exists, all verified)

- Pane markup: `<section id="analysisSection" class="chart-card analysis-pane is-hidden" aria-labelledby="analysisTitle">`
  plus an sr-only `<h2>` (`terminal/index.html:191-197`); stylesheet loaded at
  `terminal/index.html:54`.
- The pane is a `.chart-card`, so it inherits the shared glass slab
  (`css/terminal/chart.css:1-47`) and the desktop pane-height rule
  `height: min(clamp(320px, 50vh, 480px), calc(100vh - 260px))`
  (`css/terminal/responsive.css:186-191`), further clamped by the pane's own
  `max-height: min(560px, 62vh)` (`css/terminal/analysis.css:35`).
- Glass: explicit `#analysisSection` target, bezelWidth 16, frost
  `blur(20px) saturate(1.7)`, magnification `TERMINAL_GLASS_MAGNIFICATION`
  (`js/pages/terminal/index.js:337-347`; = 0.05 at `js/config.js:720`).
  Chromium-only and purely visual (`docs/liquid-glass.md:38`).
- Zoom choreography knows the pane: measure at `js/transactions/zoom.js:44-49`,
  fade-out at 134-147, fade-in at 237-249 (zoom-out never removes
  `chart-zoomed-out` — deliberate mirror of the table's quirk per merge-doc
  item 12 guardrail).
- Pane exclusion: opening hides table + chart
  (`js/transactions/terminal/handlers/analysis.js:71-91`); `reset`/`clear`,
  `plot`, and the table toggle hide the pane (merge doc items 9-11; verified in
  `js/transactions/terminal/handlers/misc.js`, `handlers/plot.js`,
  `viewUtils.js`).
- Desktop-only by construction: `.terminal` is `display: none` under 768px
  (`css/terminal/responsive.css:93-95`), so no command surface exists on mobile
  (merge doc, resolved open question).

### Stylesheet (`css/terminal/analysis.css`, 448 lines)

- Fully scoped under `.analysis-pane`; aliases the terminal tokens onto
  lab-legacy names at lines 9-25. Base type: 12px JetBrains Mono, line-height
  1.5 (lines 27-30) — matches the terminal body (`css/terminal/base.css:87-89`).
- Components: context strip with gold active symbol (46-77); small-caps muted
  section headers with one hairline (105-115); flat summary stat row (118-156);
  scenario rows with hairline separators (159-197); value-band `<dl>` grid
  (200-216); canvases at `width:100%; height:auto` (219-222); badge rows
  (235-250); belief lists (252-289); evidence timeline with direction-colored
  2px left borders + superseded dashed/0.5-opacity (291-344); prediction status
  chips as bordered text badges (347-396); decision journal (398-412); sandbox
  (414-429); pane-scoped scrollbar (431-448); pane-scoped `:focus-visible`
  (38-42).

### Renderers and markup (`js/pages/analysis/lab.js`)

- Static shell `PANE_MARKUP` (68-123): context strip + `.analysis-stage` + 9
  `data-analysis-section` blocks. `showAnalysisSection` toggles `is-hidden`
  (2310-2319).
- Renderers build DOM with `createElement`/`textContent` (XSS-safe): summary
  stats (793-836), scenario cards (837-877), value bands (878-910), Kelly curve
  and metric badges (911-1250), belief state (1252-1352), evidence timeline
  (1353-1485), predictions (1486-1561), decision journal (1562-1616), context
  strip (1617-1652), sandbox rows (1687-1711), MC metrics and canvases
  (1785-1906).
- Two canvases, both fixed `width="600" height="200"` with **no role/aria
  attributes** (lines 90, 98) — contrast `#runningAmountCanvas`
  `role="img" aria-label` (`terminal/index.html:181-185`).
- Canvas palette is a hardcoded JS mirror of the CSS tokens
  (`PANE_CHART_COLORS`, lab.js:45-54) — drift risk if `css/terminal/base.css`
  tokens ever change.
- Currency-aware formatting via the shared path with latest-FX conversion
  (lab.js:165-183) and re-render on `currencyChangedGlobal` gated on data
  readiness (lab.js:2370-2387).

### Scrollback snapshots (`js/transactions/terminal/handlers/analysis.js`)

- One generic line for all seven function views: `Showing analysis '<func>' — SYM, price X, EPS Y, vol Z%, Ny horizon.`
  (49-69). Pinned by tests
  (`tests/js/transactions/terminal/handlers/analysis.test.js:60-89`).
- MC prints VaR/CVaR (102-106); sandbox prints posteriors (109-117); ticker
  switch prints `Analysis context: SYM.` (158-168); bare `analysis` prints the
  symbol list + usage (136-141); `close` confirms (120-127).
- Precedent being deviated from: `plot` snapshots are function-specific and
  carry hint lines — e.g. performance snapshot + hint
  (`js/transactions/terminal/snapshots.js:552-563`), drawdown hint (421),
  composition hints (918-926).

### Loading / error / empty states

- Loading: `Loading...` with **hardcoded white** inline style, only in the
  summary-stats area (lab.js:2348-2354). `initAnalysisPane` awaits
  `buildConfigs()` before the handler switches sections (lab.js:2355;
  analysis.js:129-147), so the window is short but real on first open.
- Error: `Error: <msg>` with **hardcoded red** inline style, only in summary
  stats (lab.js:2360-2366). The historical `alert()` is gone (merge doc item 1
  landed).
- Per-ticker config fetch failure is **silently dropped** — `logger.warn` +
  null-filter (lab.js:2262-2266); the ticker simply vanishes from the context
  strip with no user-visible signal.
- Evidence fetch failure is conflated with "no data": any fetch/parse failure
  renders `No logged evidence entries on disk yet.` (lab.js:1368-1386).
- MC pre-run placeholder `Run simulation to see metrics.` is an unstyled
  `<p>` (lab.js:1678-1682); worker failure text is a bare text node
  (1761-1769). No pending indicator while the worker runs.
- Empty states exist for belief (1258-1267), predictions (1532-1540), journal
  (1577-1585), summary (799-805), context strip (1622-1628) — each with its own
  inline styles. The chart pane's dedicated empty-state element convention
  (`#runningAmountEmpty`, `terminal/index.html:186`, toggled by renderers, e.g.
  `js/transactions/chart/renderers/composition.js:140-145`) has no analysis-pane
  equivalent.

### Accessibility

- Pane landmark + sr-only heading exist (`terminal/index.html:191-197`) — but
  `.sr-only` is defined only in `css/base.css:131-141`, which `/terminal/` does
  **not** load; the class currently resolves via the vendored Font Awesome
  stylesheet (`assets/vendor/css/font-awesome-4.7.0.min.css`). Works today,
  fragile by accident.
- Canvases: no `role`/`aria-label` (lab.js:90, 98).
- Scrollable regions `.analysis-stage` and `.timeline-container` have no
  `tabindex`, so they are not keyboard-scrollable — precedents: `#terminalOutput`
  `tabindex="0"` (`terminal/index.html:157`), table container `tabindex="0"`
  (line 199).
- Announcements ride on `#terminalOutput`'s `aria-live="polite"`
  (`terminal/index.html:154-158`) via the snapshot lines — a sound model (see
  proposal).
- Context symbols carry name+weight only in a `title` tooltip (lab.js:1649) —
  hover-dependent.
- The only interactive elements inside the pane are real anchors (industry
  thesis link lab.js:1287-1301; evidence source links 1460-1469) and they pick
  up the pane's `:focus-visible` rule (analysis.css:38-42).

### Gaps (numbered, referenced from the proposal)

- **G1 — Overview is a stub.** The merge design specified overview = summary
  stats + scenario cards + value bands (merge doc lines 176-179, 349-351);
  implemented overview contains only `#summaryStats` (lab.js:72-74).
- **G2 — Generic snapshot line** for all function views (analysis.js:49-69).
- **G3 — Inline styles vs classes.** 67 `style.` assignments in lab.js,
  including hardcoded `'white'`/`'red'` (2348-2366); merge-doc WO3's
  "replace inline `var(--…)` markup with classes" only partially landed.
  Corollary: the alias vars `--accent`, `--border-thin`, `--text-dim`,
  `--accent-*`, `--border-glow`, `--font-display`, `--font-mono`
  (analysis.css:9-25) are **defined but never used** (grep-verified); the
  file-header comment claiming markup references `--accent`/`--border-thin`
  (analysis.css:6-7) is stale.
- **G4 — No canvas ARIA** (lab.js:90, 98).
- **G5 — Pane-internal scroll regions not keyboard-focusable.**
- **G6 — Canvas resolution.** Fixed 600×200 backing store + `width:100%` CSS
  (analysis.css:219-222) means upscale blur at pane widths >600px and no
  devicePixelRatio handling; the main chart canvas does DPR scaling and a
  0-size bail (`js/transactions/chart.js:75-89`). No re-render on resize.
- **G7 — MC canvas overlays two unrelated encodings** (full-height red
  histogram + green fan chart on one 600×200 canvas, lab.js:1820-1906) with no
  axes; the only label is 10px text (1893-1899).
- **G8 — Contrast exposure on colored status text.** Computed ratios in §5:
  `--red-color` on the darkest glass = 4.19:1 (below WCAG AA 4.5:1 for the
  ~10.9px stale badge); over the brightest pane-sized region of the actual
  background photo, muted text drops to 2.38:1. Shared with all glass panes,
  but this pane leans harder on colored text semantics.
- **G9 — Silent failure modes** (per-ticker drop, evidence-fetch conflation,
  unstyled MC errors) — see states audit.
- **G10 — No function label or as-of date in the pane.** The active function
  exists only in the scrollback; the context strip shows symbols only
  (lab.js:68-70, 1617-1652). Snapshot lines elsewhere carry date labels
  (e.g. `Composition (2026-10-01)`, snapshots.js:987).
- **G11 — No tabular-nums anywhere in the pane** — numeric columns
  (`dd` right-aligned, badges, stats) jump width on update; the terminal
  crosshair sets `font-variant-numeric: tabular-nums`
  (`css/terminal/terminal.css:152,175`).
- **G12 — Class/CSS mismatches.** `.action-meta` (lab.js:1594),
  `.timeline-count-badge` (1413-1431), and the `.lab-container` wrapper (2287)
  have no rules in analysis.css (they carry inline styles or nothing).
- **G13 — Mixed units.** The pane sizes text in `rem` (0.68-0.85rem ≈
  10.9-13.6px against the default 16px root — terminal CSS never sets root
  font-size) while the rest of the terminal uses px (11px table cells,
  `css/terminal/table.css:59-65`). 0.68rem ≈ 10.9px is the smallest text on
  the page.
- **G14 — Superseded evidence is style-only** (opacity 0.5 + dashed border,
  analysis.css:323-326): no text distinction (WCAG 1.4.1 use-of-color concern).

## Design proposal

### Global principles

1. **Bloomberg function-screen anatomy, minimal edition.** Every view =
   persistent header (security context + function label + as-of) + one content
   region. No view mixes two functions. The "load a security, then run a
   function" model is already the command grammar (`analysis <TICKER>` then
   `analysis kelly`); make it visible in the chrome.
2. **The pane never invents a token.** All colors/fonts resolve to
   `css/terminal/base.css:1-18`; the pane root only aliases. Delete the unused
   aliases (G3) rather than leaving a parallel palette that drifts.
3. **Numbers are the content; decoration is hairlines and whitespace.** Stat
   values in bold, labels in muted small caps, everything else flat. This
   matches the current stylesheet's intent — the work is enforcing it (kill
   inline styles) and adding the two missing alignment aids: right-aligned
   numeric columns + `tabular-nums` (G11).
4. **Density target: each function view fits the minimum pane height**
   (320px, `css/terminal/responsive.css:186-191`) without scrolling for the
   common case (3 scenarios, ≤10 evidence entries visible, ≤6 predictions);
   overflow scrolls inside `.analysis-stage` (already, analysis.css:80-87).
5. **Nothing hover-dependent, nothing pointer-required.** All state changes
   come from typed commands; hover reveals nothing essential (G: `title`
   tooltip weight moves into the ticker-switch snapshot line).

### Chrome (all views)

- **Context strip (existing, keep):** symbols left-aligned, PORT first, active
  in gold with the 2px underline (analysis.css:64-73). Add `aria-current="true"`
  on the active symbol (objectively testable).
- **Right side of the strip (new):** `FUNCTION · AS-OF` in muted small caps —
  e.g. `KELLY · 2026-10-12` from `config.meta.asOf` (already parsed at
  lab.js:354-363). This closes G10 with data the config already carries.
- The strip stays read-only; switching is via command only
  (lab.js:1615-1616 comment already encodes this).

### Per-function views

**Overview (DES analog — restore the designed landing screen, G1).**
Summary stat row (existing 5 stats) → scenario mini-rows (name, prob, multiple,
price CAGR — the 4 highest-signal fields, not all 6 chips) → value-band `<dl>`.
PORT context is the default landing (already, lab.js:2280). Snapshot:
`Analysis (PORT) — expected CAGR +X.X%, edge +Y.Y% vs SP500, scaled Kelly Z%.`

**Scenarios.** Flat rows ordered by probability desc: bold caps name, then
right-aligned tabular numbers (Prob / Multiple / Price CAGR / Earnings CAGR) in
one aligned grid instead of six wrapping inline `<p>` chips (lab.js:866-872).
Thesis-derived descriptor names stay (lab.js:277-293). Snapshot:
`Scenarios (ANET) — bull 55% 2.1x, base 35% 1.2x, bear 10% 0.6x.`

**Value bands.** Keep the `<dl>` grid (analysis.css:200-216); emphasize only
`Current Price vs Value` (the actionable row) in `--text-color` bold. Snapshot:
`Value (ANET) — terminal $X, entry for 10% CAGR $Y (Z% below/above target).`
(fields already computed, lab.js:888-903).

**Kelly.** Canvas on top, badge row below (existing order). The canvas curve
currently has **no axis labels at all** — add muted 10px y-axis min/max growth
labels and rely on the existing marker labels (¼K/½K/Full K/zero-growth/Curr;
the red marker is `0 Growth` on the exact curve, `2x K (0 Growth)` on the
fallback — lab.js:1090-1097) for the x-axis. The recommended action (scaled ½K)
stays the highlighted badge — promote its highlight from inline style
(lab.js:997-999) to a class. The badge row also carries the `Rf` and
`σ Scen/Input` consistency badges (lab.js:1007-1021, added with the exact
discrete-Kelly sizing). For PORT, the Covariance Dampener badge stays and
should name its estimate source (merge doc resolved-open-question:
`risk.estimateSource` is already computed, lab.js:2214). Snapshot:
`Kelly (ANET) — full 22.1%, scaled ½K 11.0%, current weight 34.2%.` Canvas
`aria-label` carries the same sentence.

**Monte Carlo.** Split the single canvas into two stacked canvases (G7):
(1) terminal-price histogram with vertical VaR80/95 marker lines, (2) P5–P95
fan envelope with the median path. Stat row above the canvases (Median, Mean,
VaR/CVaR 80/95 — already DOM, lab.js:1785-1818). Add a pending state
(`Running 20,000 paths…` in the metrics area) between command and
`SIMULATION_COMPLETE` (currently nothing, lab.js:1746-1772). Pre-run placeholder
gets the shared empty-state class (G9). Snapshot stays VaR/CVaR, add median:
`MC (10,000 paths, ANET) — median $X, VaR(95%) $Y, CVaR(95%) $Z.`

**Belief.** Hierarchy: the probability is the hero number (largest type on the
screen, `--text-color` bold), with confidence and as-of as muted suffixes —
today all one inline-bold string (lab.js:1272-1281). Three labeled groups keep
their existing color semantics (for = default, against = gold, open questions =
blue; analysis.css:279-289); group titles become classes (currently inline,
lab.js:1304-1351). Snapshot: `Belief (ANET) — 68.0% (confidence 70%), as of
2026-09-30.`

**Evidence.** Keep the timeline. Add a text `SUPERSEDED` tag on superseded
entries (G14) alongside the dashed/opacity treatment. Keep the header count
badge (`N valid / M superseded`, lab.js:1413-1431) — promote to a class (G12).
PORT exclusion message stays (lab.js:1359-1366). Snapshot: `Evidence (ANET) —
12 valid / 3 superseded, latest 2026-10-01.` Fetch failure gets its own message
distinct from "no entries" (G9).

**Predictions.** Keep text-badge statuses (Pending/True/False + Brier + overdue
count — all text, good). Two-line rows: claim line, then muted meta line
(target date · probability · status) to end the claim-vs-chip crowding
(lab.js:1542-1558). Stale badge moves off pure `--red-color` text at 0.68rem
(G8/G13): same red but ≥0.72rem, or bold. Snapshot: `Predictions (ANET) —
Brier 0.18 (N=6), 3 pending, 1 overdue.`

**Journal.** Keep latest-entry emphasis; add `Entry N of M` context (the data
is an array, lab.js:1568) and a class for `.action-meta` (G12). Snapshot:
`Journal (ANET) — latest: ADD 2026-08-14, review 2026-11-14 (5 entries).`

**What-if sandbox.** Stays inside the belief section (lab.js:104-108). The gold
tag already prints the command syntax (`analysis bull|bear|reset`) — the right
no-hover affordance; keep. Dashed row separators move from inline
(lab.js:1696) to a class.

### Canvas treatment

- **Keep fixed-attribute backing stores** (600×200) — they render correctly
  while the pane is `is-hidden`, sidestepping the hidden-measurement landmine
  (merge doc constraint 6; the 0-size bail at `js/transactions/chart.js:79-82`;
  the position-table measurement incident in AGENTS.md). Never measure pane
  geometry during render.
- **Render at 2× backing resolution** (1200×400 attrs) to fix upscale/retina
  blur (G6) while keeping the same CSS aspect (`width:100%; height:auto`,
  analysis.css:219-222). No resize listener: the canvas scales by CSS; redraws
  happen on section switch / ticker switch / currency change (existing
  `renderActiveTicker`, lab.js:1653-1686).
- **ARIA:** `role="img"` + dynamic `aria-label` summarizing the headline
  numbers (the same string as the scrollback snapshot), per the
  `#runningAmountCanvas` precedent (`terminal/index.html:181-185`). All metrics
  already exist as DOM text, so the canvas is redundant by design.
- **Canvas palette:** derive from the CSS tokens once at init
  (`getComputedStyle(paneRoot).getPropertyValue('--primary-color')` etc.)
  instead of the hardcoded mirror (`PANE_CHART_COLORS`, lab.js:45-54).

### Scrollback snapshot format

One line per function, function-specific content, trailing hint only where a
natural next command exists (the `(Hint: …)` precedent, snapshots.js:561).
Proposed lines are listed per view above; the generic
`Showing analysis '<func>'` line is retained only as the no-metrics fallback
(analysis.js:51-53). Ticker switch gains the tooltip's payload (G5 of hover
rule): `Analysis context: ANET (Arista Networks · 34.2%).` All lines testable
in the existing handler-test shape
(`tests/js/transactions/terminal/handlers/analysis.test.js`).

### State design — loading, error, empty

- One shared `.pane-empty` class (muted, 12px, no inline styles) for all
  empty/placeholder text — replaces the seven ad-hoc inline variants (G9).
- Loading: `Loading analysis data…` in the stage (not just the summary block);
  remove the hardcoded white/red (lab.js:2348-2366) in favor of
  `--text-muted`/`--red-color` classes.
- Failure visibility: a ticker whose config fetch fails appears in the context
  strip with an `unavailable` marker (and a scrollback warning line), instead
  of silently vanishing (lab.js:2262-2266). Evidence fetch failure renders
  `Evidence log unavailable (fetch failed).`, distinct from the empty log.
- The terminal readiness race does not apply to analysis data (own fetch path)
  but does apply to FX conversion — already gated on `whenTransactionDataReady()`
  (lab.js:2370-2387; pattern from `docs/terminal-data-readiness.md`).

### Interaction

- Keyboard-first, command-only state changes (merge doc Section D grammar);
  focus stays in `#terminalInput` when the pane switches sections — do not move
  focus into the pane.
- `analysis close` / `reset` / `clear` / `plot` / `transaction` all dismiss the
  pane (existing); no in-pane close button (no pointer chrome — consistent with
  the terminal's zero-chrome philosophy, cf. `docs/mobile-terminal-ux.md`).
- `tabindex="0"` on `.analysis-stage` and `.timeline-container` for keyboard
  scrolling (G5); pane `:focus-visible` rule already exists
  (analysis.css:38-42).
- The two link types (industry thesis, evidence source) remain the only
  in-pane interactive elements; both are keyboard-focusable anchors already.

### Accessibility checklist (all objectively testable)

- `aria-current` on the active context symbol; `role="img"` + dynamic
  `aria-label` on both canvases (or `aria-hidden="true"` since DOM duplicates
  the data — pick one, test it).
- `tabindex="0"` on the two scroll regions.
- `font-variant-numeric: tabular-nums` on numeric values (G11).
- Text tag for superseded evidence (G14); statuses already text-based.
- Contrast floor: content text uses `--text-color` or `--muted-text` only;
  delete the unused `--text-dim` (2.80:1 even on the darkest glass — §5).
  Colored status text at ≥0.72rem and/or bold (G8).
- Announcements stay in the `aria-live` scrollback; the pane itself is not a
  live region (section switches would spam announcements).
- Reduced motion: zoom/sweep animations predate this pane and ignore
  `prefers-reduced-motion` (`js/ui/reduced_motion.js` covers only the ambient
  video) — pre-existing, out of scope here, noted for the record.

## Claim-by-claim evidence

### Repo claims

All repo behavior claims above cite `file:line` inline, verified by direct read
this session (2026-10-14): `terminal/index.html`, `css/terminal/analysis.css`,
`js/pages/analysis/lab.js`, `js/transactions/terminal/handlers/analysis.js`,
`css/terminal/{base,terminal,chart,table,responsive}.css`,
`js/pages/terminal/index.js`, `js/transactions/zoom.js`,
`js/transactions/terminal/snapshots.js`,
`js/transactions/terminal/stats/formatting.js`,
`tests/js/transactions/terminal/handlers/analysis.test.js`. The 67-count of
inline `style.` assignments and the unused-alias list are grep-verified.
`lab.js` citations were re-verified after `5dd36b6e` (exact discrete-Kelly
sizing, +231 lines) landed mid-session — all line numbers above refer to the
post-commit file.

### Contrast computations (WCAG 2.1 SC 1.4.3: 4.5:1 normal text, 3:1 large; SC 1.4.11: 3:1 non-text)

Ratios computed with the standard WCAG relative-luminance formula from the
actual token values (`css/terminal/base.css:1-18`). Backgrounds are the
`.chart-card` composite — `background-color: rgba(30,30,33,0.4)` + the white-to-black
gradient (`css/terminal/chart.css:13-21`) — over two boundary cases:

(a) **Darkest case:** page background ≈ black at the gradient's lightest point
(effective bg ≈ #1f1f21). The actual background photo
(`assets/backgrounds/terminal_background.jpg`, referenced at
`css/terminal/base.css:79-85`) is a dark B&W night photo: global mean luminance
50/255, measured this session.

(b) **Brightest realistic case:** the brightest pane-sized region of that photo
(mean luminance 99/255 — around the subject's face, measured), composited
through the glass → effective bg ≈ #565657.

| Color (token)                     | Dark bg (a) | Bright region (b) |
| --------------------------------- | ----------- | ----------------- |
| `--text-color` #c9d1d9            | 10.66       | 4.75              |
| `--muted-text` #8b949e            | 5.35        | 2.38              |
| `--primary-color` #f0b90b         | 9.13        | 4.07              |
| `--green-color` #34a853           | 5.38        | 2.40              |
| `--red-color` #ea4335             | 4.19        | 1.87              |
| `--blue-color` #64b5f6            | 7.43        | 3.31              |
| `--text-dim` rgba(139,148,158,.6) | 2.80        | 1.72              |

Reading: on dark glass everything but `--text-dim` (unused) passes or nearly
passes AA; `--red-color` at 4.19:1 is a marginal fail for small text (the
0.68rem stale badge). In bright photo regions every muted/colored text fails
AA — an exposure shared with the existing table/chart panes (same glass, same
tokens), not introduced by this pane; it argues for keeping status semantics
redundant with text, not for a palette change. The refraction lens
(Chromium-only) and WebGL overlay alter the effective background further —
final legibility is a human-review item.

### External conventions

- **Load-security-then-function, one function per screen** — Bloomberg model,
  already cited in `docs/terminal-analysis-merge.md` Section D:
  [Bloomberg shortcuts cheat sheet](https://equityref.com/cheat-sheets/bloomberg-terminal-shortcuts/),
  [BMC prep](https://mqaissaunee-bcc.github.io/AI_Examples/bloomberg_bmc_prep_v4.html),
  [function overview](https://tradingtoolshub.com/blog/bloomberg-terminal-cost-features-2026/).
  Corroborating primary source: Bloomberg's own
  [Getting Started guide (PDF)](https://data.bloomberglp.com/professional/sites/10/Getting-Started-Guide-for-Students-English.pdf)
  distinguishes security-dependent vs non-security functions ("You can run WEI
  without loading a security") — snippet-level via search result, PDF not
  fetched.
- **Bloomberg's own UX writing** on dense function screens:
  [How Bloomberg Terminal UX designers conceal complexity](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/)
  — official bloomberg.com article; fetch returned 403 (bot-blocked), cited
  unread, used only as a pointer.
- **WCAG contrast thresholds** — [Understanding SC 1.4.3 (Contrast Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html),
  [SC 1.4.11 (Non-text Contrast)](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html),
  [SC 1.4.1 (Use of Color)](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html).
  w3.org 403s automated fetches in this environment (same as recorded in
  `docs/mobile-terminal-ux.md` §7); the 4.5:1 / 3:1 / not-color-only norms are
  corroborated and applied computationally above.
- **Tabular numerals for updating figures** — repo-internal precedent
  (`css/terminal/terminal.css:152,175`); no external claim needed.

## Open questions / what I couldn't verify

- **Glass-surface legibility remains a human-review item.** The contrast table
  above is computed against modeled composites of the actual background photo;
  the Chromium refraction lens, WebGL overlay, and canvas-2D overlay
  (`docs/liquid-glass.md:34-41`) shift the effective background in ways I
  cannot see. I did verify the render headlessly this session:
  `make screenshot URL=/terminal/ ARGS='--keys "analysis kelly" --gl plain --wait 1800 --settle 2000 --probe "#analysisSection" --probe "#kellyCurveCanvas"'`
  (probe output: pane visible 672×450, canvas visible 584×195). Two findings
  from that run: (1) the flag is `--keys`, repeatable — the `--type` examples
  in `docs/liquid-glass.md:118-126` are stale against `scripts/screenshot.mjs`;
  (2) at 1440×900 the pane lands directly over the photo's bright face region,
  so the worst case in the contrast table is the operative one, not a corner
  case. `--gl plain` was required — the default SwiftShader backend wedged
  `page.goto` on this machine (the workaround `scripts/screenshot.mjs`'s own
  header documents for macOS).
- **Whether the two-canvas MC split reads better than the overlay** — proposed
  on information-design grounds (two unrelated encodings share one coordinate
  system today), but the visual call is the owner's.
- **The overview composition** (G1): the merge doc designed summary+scenarios+
  value bands; the implementation shipped summary-only. Restoring the designed
  overview is my recommendation, but "what belongs on the landing screen" is a
  product call.
- **Exact pane-occupied photo region:** the contrast worst case uses the
  brightest pane-sized region of the photo anywhere; the pane's actual screen
  position sits over a specific (darker) region. I measured regional means, not
  the exact mapped rect (viewport-dependent).
- **`.sr-only` via vendored Font Awesome** — works today, but if the vendor CSS
  is ever replaced, the pane heading (and the chart's) becomes visible. Worth a
  scoped rule in `css/terminal/base.css`; not verified whether any gate
  protects this.
- **Canvas 2× rendering** — proposed but untested; needs a human retina/blur
  check (and a jest assertion on the backing-store attributes).
- No code was written for this doc; every proposal item is phrased to be
  implementable + testable, but none has been run.

## Implementation work orders

Mechanical execution list for the proposal above. Anchors re-verified against
the working tree at authoring time (2026-10-15, post `133c740e`). Each order is
committed separately; run the preamble checks plus the order's Verify commands
before committing. Design decisions made while writing the orders (recorded
here so the doc stays the single source of truth):

- **Snapshot builder moves into the lab.** The handler keeps thin delegation;
  `lab.js` exports `buildAnalysisSnapshot(func)` with full access to
  `state.configs` / `state.evidenceCache`, so per-view lines need no new data
  plumbing. `analysis.js` keeps only the async MC line (it owns the result).
- **Class naming convention:** `pane-empty` (+ `pane-empty--error`),
  `belief-prob` / `belief-meta` / `belief-group-title(--against|--questions)`,
  `prediction-title-row` / `prediction-title` / `prediction-badge-row` /
  `prediction-badge`, `journal-title` / `action-meta` / `journal-situation` /
  `journal-alternatives`, `sandbox-row`, `concentration-badge--highlight`,
  `timeline-count-badge` (rules move from inline styles into the stylesheet),
  `timeline-superseded-tag`, `context-meta`, `overview-scenario-row` (+
  `-name` / `-vals`), `mc-status`. All colors/fonts resolve to the terminal
  tokens via the pane root.
- **Out of mechanical scope** (human/visual call, per the open questions):
  rem→px unit harmonization (G13), glass-surface legibility, the retina sharp
  check for the 2× canvas, and overall density tuning. The MC canvas split
  (WO9) is implemented but flagged `[visual]`.

Preamble (run for every order, must stay green):

```
npx eslint js/pages/analysis/lab.js js/transactions/terminal/handlers/analysis.js tests/js/pages/analysis tests/js/transactions/terminal/handlers/analysis.test.js
npx stylelint css/terminal/analysis.css
npx jest tests/js/pages/analysis tests/js/transactions/terminal/handlers/analysis.test.js
```

Diff-coverage gate: every order that adds executable JS lines ships its jest
assertions in the same commit.

### WO1 — Shared pane-empty state classes (G9)

**Files:** `js/pages/analysis/lab.js`, `css/terminal/analysis.css`

- **Find** (`renderSummary` ~889-895): `No metrics available` div with inline
  `color`/`padding`. **Change:** `className = 'pane-empty'`, inline styles
  deleted.
- **Find** (lab.js, `initAnalysisPane`, ~2591-2609):
  `loadingDiv.style.color = 'white';` and `errDiv.style.color = 'red';`
  **Change:** drop both inline styles; loading div gets
  `className = 'pane-empty'` and text `Loading analysis data…`; error div gets
  `className = 'pane-empty pane-empty--error'`. Placement stays
  `summaryStatsEl` (stage-wide clearing would fight the static markup; the
  class unification delivers the design intent).
- **Find** (lab.js, `renderActiveTicker` reset, ~1800-1804): the
  `'Run simulation to see metrics.'` placeholder `<p>`.
  **Change:** give it `className = 'pane-empty'`.
- **Find** (lab.js, `runMonteCarloSimulation`, ~1873-1891): two
  `riskMetricsEl.replaceChildren(document.createTextNode(...))` error paths.
  **Change:** wrap each message in a `<p class="pane-empty pane-empty--error">`.
- **Find** (lab.js, `renderEvidenceTimeline`, ~1496-1498): bare `catch` setting
  `evidenceList = []`. **Change:** track fetch failure in a local
  `fetchFailed` flag; on failure render
  `Evidence log unavailable (fetch failed).` in a
  `<p class="pane-empty pane-empty--error">` and return (distinct from the
  existing "No logged evidence entries on disk yet." empty state, which keeps
  its own `pane-empty` class).
- **Find** (analysis.css, after `.analysis-pane .context-empty`): no
  `.pane-empty` rule exists. **Change:** add
  `.analysis-pane .pane-empty { margin: 0; padding: 0 10px; color: var(--muted-text); font-size: 0.8rem; }`
  and `.analysis-pane .pane-empty--error { color: var(--red-color); }`.
- **Verify:** preamble + `npx jest tests/js/pages/analysis/lab_dom_render.test.js`
  (add an assertion: init failure renders `.pane-empty--error`; evidence fetch
  failure renders the distinct message — mock `fetchText` rejection).

### WO2 — Keyboard-scrollable regions (G5)

**Files:** `js/pages/analysis/lab.js`, `tests/js/pages/analysis/lab_dom.test.js`

- **Find** (PANE_MARKUP, lab.js ~70): `<div class="analysis-stage">`
  **Change:** `<div class="analysis-stage" tabindex="0">`.
- **Find** (PANE_MARKUP, ~113):
  `<div id="evidenceTimeline" class="timeline-container"></div>`
  **Change:** add `tabindex="0"`.
- **Verify:** preamble + new assertion in `lab_dom.test.js` that both elements
  carry `tabindex="0"` after `initAnalysisPane`.

### WO3 — Canvas 2× backing store + ARIA + axis labels (G4, G6)

**Files:** `js/pages/analysis/lab.js`, `css/terminal/analysis.css`,
`tests/js/pages/analysis/lab_dom.test.js`

- **Find** (PANE_MARKUP ~90):
  `<canvas id="kellyCurveCanvas" width="600" height="200"></canvas>`
  **Change:**
  `<canvas id="kellyCurveCanvas" width="1200" height="400" role="img" aria-label="Kelly curve"></canvas>`.
- **Find** (PANE_MARKUP ~98): `<canvas id="monteCarloCanvas" width="600" height="200"></canvas>`
  **Change:** same treatment (`width="1200" height="400" role="img" aria-label="Monte Carlo results"`).
- **Find** (`drawKellyMarker` / `drawKellyCurvePath` / `_renderMonteCarloHistogram` /
  `_renderMonteCarloFanChart`): all geometry is 1× (`padLeft = 45`,
  `'10px "JetBrains Mono", monospace'`, `lineWidth = 1.5/2`, `arc(x, y, 3.5, …)`,
  fan pads `40/20/20/25`).
  **Change:** double every pad, font size, line width, and radius so the CSS
  downscale (`width:100%; height:auto`, analysis.css:219-222) renders the same
  visual size at 2× backing. Add muted y-axis min/max growth labels
  (`params.minG` / `params.minG + params.rangeG`, `formatPercent`) at the left
  edge of the Kelly plot — 20px font (renders 10px), `--muted-text` color.
- **Find** (`renderKellyCurve`, end of function ~1364-1371): badge update is
  the last statement. **Change:** after it, set
  `kellyCurveCanvas.setAttribute('aria-label', …)` with the same sentence as
  the kelly snapshot (WO11): `Kelly curve — full X%, scaled ½K Y%, current
weight Z%.`
- **Find** (`renderMonteCarloResults` ~2081-2094): sets no aria-label.
  **Change:** set `monteCarloCanvas` aria-label to
  `Terminal price histogram — median $X, VaR(95%) $Y, N paths.`
- **Verify:** preamble + `lab_dom.test.js` assertions: both canvases expose
  `width=1200`, `height=400`, `role="img"`, and a non-empty `aria-label`
  after render. (Retina sharpness itself stays a human check — open question
  above.)

### WO4 — Context strip chrome: aria-current + function/as-of (G10)

**Files:** `js/pages/analysis/lab.js`, `css/terminal/analysis.css`,
`tests/js/pages/analysis/lab_dom_render.test.js`

- **Find** (`appendContextSymbol` ~1766-1773): active symbol gets class only.
  **Change:** when active, also `span.setAttribute('aria-current', 'true')`.
- **Find** (`renderContextStrip` ~1761-1763): ends after appending symbols.
  **Change:** append a `<span class="context-meta" id="contextMeta"></span>` to
  `contextEl` on every render; add `updateContextMeta()` setting its
  `textContent` to `FUNCTION · AS-OF` — function from `state.activeSection`
  (`mc`→`MONTE CARLO`, others uppercased), as-of from the active config's
  `meta.asOf` sliced to 10 chars, `· —` when missing. Call it from
  `renderContextStrip` and `showAnalysisSection`.
- **Find** (analysis.css, `.analysis-pane .context-empty` rule): **Change:**
  add `.analysis-pane .context-meta { margin-left: auto; color: var(--muted-text); }`
  (strip is a flex row; the meta pins right).
- **Verify:** preamble + `lab_dom_render.test.js` assertions: active symbol has
  `aria-current="true"`, inactive symbols do not; `#contextMeta` text contains
  the function name and the as-of date.

### WO5 — Overview landing screen: scenario mini-rows + value bands (G1)

**Files:** `js/pages/analysis/lab.js`, `css/terminal/analysis.css`,
`tests/js/pages/analysis/lab_dom_render.test.js`

- **Find** (PANE_MARKUP overview section ~72-74): only `<div class="summary-stats" id="summaryStats"></div>`.
  **Change:** after it add
  `<div class="block-header"><h3>Scenarios</h3></div><div id="overviewScenarios"></div>`,
  then `<div class="block-header"><h3>Value Bands</h3></div><dl id="overviewValueBands"></dl>`.
- **Find** (`renderValueBands(config)` ~968-999): writes to module-global
  `valueBandsEl`. **Change:** accept an optional target param
  `(config, targetEl = valueBandsEl)`; use `targetEl` for `replaceChildren`
  and the null guard.
- **Find** (`renderActiveTicker` ~1780-1782): calls `renderSummary(config)`.
  **Change:** after `renderSummary`, call the new
  `renderOverviewScenarios(config)` (rows sorted by probability desc, each
  `.overview-scenario-row` = bold caps `.overview-scenario-name` + a
  `.overview-scenario-vals` span with `Prob / Multiple / Price CAGR` in
  tabular numerals — the 4 highest-signal fields per the design) and
  `renderValueBands(config, overviewValueBandsEl)`. Resolve the two new
  elements in `resolvePaneElements` (module lets `overviewScenariosEl`,
  `overviewValueBandsEl`).
- **Find** (analysis.css, after the value-bands rules ~216): **Change:** add
  `.overview-scenario-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: 6px 18px; padding: 6px 0; border-bottom: 1px solid var(--border-color); align-items: baseline; }`,
  `.overview-scenario-row:last-child { border-bottom: none; }`,
  `.overview-scenario-name { font-weight: 700; text-transform: uppercase; font-size: 0.8rem; color: var(--text-color); }`,
  `.overview-scenario-vals { display: contents; color: var(--muted-text); font-variant-numeric: tabular-nums; text-align: right; }`,
  and `font-variant-numeric: tabular-nums` on `.stat-card p` and `.analysis-pane dd` (G11 for the numeric columns).
- **Verify:** preamble + `lab_dom_render.test.js` assertions: overview section
  contains scenario rows with the three value spans and a populated
  `#overviewValueBands` with 4 `dt`/`dd` pairs.

### WO6 — Belief / predictions / journal: inline styles → classes

**Files:** `js/pages/analysis/lab.js`, `css/terminal/analysis.css`,
`tests/js/pages/analysis/lab_dom_render.test.js`

- **Belief (design: probability is the hero number).** **Find**
  (`renderBeliefState` ~1382-1473): empty-state `<p>` with two inline styles;
  header `left` span (`fontWeight 700`, `color var(--text-main)`), `asOf` span;
  three group titles with inline `fontSize`/`color`.
  **Change:** empty state → `<p class="pane-empty">`; header →
  `<span class="belief-prob">68.0%</span>` + `<span class="belief-meta">confidence 70% · as of 2026-09-30</span>`;
  group titles → `<div class="belief-group-title">` with
  `--against` (gold) and `--questions` (blue) modifiers for the two colored
  ones. Update the industry-thesis block (`fontSize`, `marginTop`, span color,
  link color/textDecoration) to classes `belief-thesis` / `belief-thesis-label`
  / `belief-thesis-link`.
- **Predictions (design: two-line rows).** **Find** (`renderPredictions`
  ~1618-1681): titleDiv/h4/badges built with ~10 inline style assignments;
  empty `<p>` inline-styled; claim span embeds `(Target: …)` in the claim.
  **Change:** title row → `.prediction-title-row` > `.prediction-title` +
  `.prediction-badge-row` > `.prediction-badge` (Brier) and the existing
  `.prediction-stale-badge`; empty state → `.pane-empty`; each row becomes
  claim line + muted meta line: `.prediction-claim` = claim text,
  `.prediction-meta` = `Target 2026-12-31 · 65% · ` status text (the status
  chip keeps its `.prediction-status` class and text). Row keeps
  `.prediction-item` but stacks the two lines (CSS: flex-direction column,
  align-items flex-start).
- **Journal (design: Entry N of M context).** **Find** (`renderDecisionJournal`
  ~1691-1734): inline-styled h4, empty `<p>`, `sitDiv`, `altDiv`.
  **Change:** h4 → `.journal-title`; empty → `.pane-empty`; `action-meta`
  gains prefix `Entry N of M · ` from the journal array length/index; sitDiv →
  `.journal-situation`; altDiv → `.journal-alternatives`. (`.action-meta` gets
  its first CSS rule here — G12.)
- **Find** (analysis.css): no rules for the new classes. **Change:** add
  `.belief-prob { font-size: 1.35rem; font-weight: 700; color: var(--text-color); font-variant-numeric: tabular-nums; }`,
  `.belief-meta { font-size: 0.72rem; color: var(--muted-text); }`,
  `.belief-group-title { font-size: 0.75rem; color: var(--muted-text); margin-top: 6px; }`,
  `.belief-group-title--against { color: var(--primary-color); }`,
  `.belief-group-title--questions { color: var(--blue-color); }`,
  `.belief-thesis { font-size: 0.75rem; margin-top: 4px; }`,
  `.belief-thesis-label { color: var(--muted-text); }`,
  `.belief-thesis-link { color: var(--text-color); text-decoration: underline; }`,
  `.prediction-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }`,
  `.prediction-title { margin: 0; font-size: 0.85rem; color: var(--muted-text); text-transform: uppercase; }`,
  `.prediction-badge-row { display: flex; align-items: center; gap: 8px; }`,
  `.prediction-badge { font-size: 0.75rem; color: var(--text-color); }`,
  `.prediction-item { flex-direction: column; align-items: flex-start; gap: 2px; }`,
  `.prediction-meta { font-size: 0.72rem; color: var(--muted-text); }`,
  `.journal-title { margin: 0 0 6px 0; font-size: 0.85rem; color: var(--muted-text); text-transform: uppercase; }`,
  `.action-meta { color: var(--muted-text); }`,
  `.journal-situation { color: var(--text-color); margin: 4px 0; }`,
  `.journal-alternatives { font-size: 0.75rem; color: var(--muted-text); }`,
  and bump `.prediction-stale-badge` / `.prediction-status` from `0.68rem` to
  `0.72rem` + `font-weight: 700` (G8 floor for colored status text).
- **Verify:** preamble + `lab_dom_render.test.js` assertions: `.belief-prob`
  renders the bare percentage; predictions rows carry `.prediction-claim` +
  `.prediction-meta`; journal meta contains `Entry 2 of 2`.

### WO7 — Evidence timeline: class-ify + SUPERSEDED text tag + failure copy

**Files:** `js/pages/analysis/lab.js`, `css/terminal/analysis.css`,
`tests/js/pages/analysis/lab_dom_render.test.js`

- **Find** (`renderEvidenceTimeline` ~1481-1593): PORT message `<p>` inline
  styled; header-count badge styled inline in both branches (~1534-1553);
  superseded entries styled only via CSS opacity/dashed.
  **Change:** PORT message → `.pane-empty`; count badge keeps its class, inline
  styles deleted (rules move to CSS); superseded entries gain a
  `<span class="timeline-superseded-tag">SUPERSEDED</span>` appended to
  `metaDiv` (G14 — text distinction, not color-only).
- **Find** (analysis.css, timeline block): **Change:** add
  `.timeline-count-badge { font-size: 0.75rem; color: var(--muted-text); font-weight: 400; }`,
  `.timeline-count-badge--block { margin-bottom: 6px; }`,
  `.timeline-superseded-tag { font-size: 0.68rem; color: var(--muted-text); border: 1px dashed var(--border-color); border-radius: 2px; padding: 0 4px; text-transform: uppercase; }`.
  Use the `--block` modifier on the fallback branch div.
- **Verify:** preamble + `lab_dom_render.test.js` assertions: superseded entry
  contains a `.timeline-superseded-tag` with text `SUPERSEDED`; header badge
  has class `timeline-count-badge`.

### WO8 — Sandbox rows / Kelly highlight / MC stat padding / alias cleanup

**Files:** `js/pages/analysis/lab.js`, `css/terminal/analysis.css`

- **Find** (`renderBayesOutput` ~1814-1830): row built with four inline styles.
  **Change:** `row.className = 'sandbox-row'`; name/prob spans unstyled
  (`.sandbox-row strong` inherits). CSS: `.sandbox-row { display: flex; justify-content: space-between; border-bottom: 1px dashed var(--border-color); padding: 4px 0; }`.
- **Find** (`updateKellyMetricsBadges` ~1084-1092): highlight sets
  `span.style.borderColor = 'var(--text-main)'`.
  **Change:** `highlight` sets `span.classList.add('concentration-badge--highlight')`;
  CSS: `.concentration-badge--highlight { border-color: var(--text-color); color: var(--text-color); }`.
- **Find** (`_renderMonteCarloMetrics` ~1947-1950):
  `card.style.padding = '10px';`.
  **Change:** delete the line; CSS: `.analysis-pane .risk-sim .stat-card { padding: 10px; }`.
- **Find** (analysis.css:9-25): alias vars. **Change:** delete every alias
  except `--border-color` (used throughout the stylesheet itself) —
  `--accent`, `--ink`, `--border-thin`, `--text-main`, `--text-muted`,
  `--text-dim`, `--accent-primary`, `--accent-secondary`, `--accent-dim`,
  `--accent-glow`, `--border-glow`, `--font-display`, `--font-mono` — and
  rewrite the file-header comment (lines 1-7) to drop the stale
  "aliases … resolve from this root" claim and the `--text-dim` mention in the
  a11y checklist. Grep the repo for `var(--ink)` / `var(--text-main)` /
  `var(--text-muted)` / `var(--accent` outside the pane first: by this order
  all JS inline uses are gone (WO1/WO6/WO7), so deletion is safe; if any
  survivor exists, keep that one alias and record it.
- **Verify:** preamble. Existing DOM tests keep green (visuals unchanged).

### WO9 — [visual] MC: pending state + two-canvas split + VaR markers (G7)

**Files:** `js/pages/analysis/lab.js`, `css/terminal/analysis.css`,
`tests/js/pages/analysis/lab_dom_render.test.js`

- **Find** (PANE_MARKUP mc section ~94-100): single `#monteCarloCanvas`.
  **Change:** after it add
  `<canvas id="monteCarloFanCanvas" width="1200" height="400" role="img" aria-label="Monte Carlo fan envelope"></canvas>`;
  resolve it in `resolvePaneElements` (`monteCarloFanCanvas`). CSS: gap already
  10px via `.risk-sim { gap: 10px }`; no new rule needed.
- **Find** (`runMonteCarloSimulation` ~1866-1911): no pending UI between
  command and `SIMULATION_COMPLETE`. **Change:** before `worker.postMessage`,
  render `<p class="mc-status">Running ${paths.toLocaleString('en-US')}
paths…</p>` into `riskMetricsEl`; on success `_renderMonteCarloMetrics`
  replaces it (existing `replaceChildren`); on error the error paths replace it
  (WO1 classes). CSS: `.mc-status { margin: 0; padding: 0 10px; color: var(--primary-color); font-size: 0.8rem; }`.
- **Find** (`renderMonteCarloResults` ~2081-2094): histogram and fan share one
  canvas. **Change:** histogram (+ new VaR markers) draws on
  `monteCarloCanvas`; fan draws on `monteCarloFanCanvas`. VaR markers: when
  `result.terminalValues` is a non-empty array, compute
  `x = (VaR - min) / (max - min) * width` for `VaR_80`/`VaR_95` and draw
  dashed vertical lines (blue for 80, red for 95) with 20px muted labels
  `VaR80`/`VaR95`; when terminal values are absent, skip markers silently.
  Set `monteCarloFanCanvas` aria-label to
  `P5–P95 fan envelope — ${result.runCount || paths} paths.`
- **Verify:** preamble + `lab_dom_render.test.js` assertions: a fan canvas
  element exists with `role="img"`; pending text renders after invoking the
  run with a never-resolving worker mock. Flag in the final report:
  **visual — human review required** (whether the split reads better is the
  owner's call, per the open questions).

### WO10 — Canvas palette from the CSS tokens

**Files:** `js/pages/analysis/lab.js`, `tests/js/pages/analysis/lab.test.js`

- **Find** (lab.js:43-54): `PANE_CHART_COLORS` hardcoded mirror of the tokens.
  **Change:** keep the object as the fallback defaults, but add
  `syncPaneChartColors()` called from `resolvePaneElements` that overwrites
  each key from `getComputedStyle(paneRoot).getPropertyValue('--…')`
  (`--text-color`, `--muted-text`, `--primary-color`, `--green-color`,
  `--red-color`, `--blue-color`); skip empty computed values (jsdom) so
  fallbacks hold; derive `greenFill` from the resolved green as
  `rgba(r, g, b, 0.15)` (parse hex). Comment at the object notes it is
  fallback-only.
- **Verify:** preamble + `lab.test.js` case: with custom properties injected on
  the pane root, `syncPaneChartColors()` (exported via `__analysisLabTesting`)
  picks them up; with none, defaults remain.

### WO11 — Function-specific scrollback snapshots (G2) + ticker-switch payload

**Files:** `js/transactions/terminal/handlers/analysis.js`,
`js/pages/analysis/lab.js`,
`tests/js/transactions/terminal/handlers/analysis.test.js`,
`tests/js/pages/analysis/lab.test.js`

- **Find** (analysis.js `buildSnapshotLine` ~49-69): generic price/EPS/vol line.
  **Change:** delete the function; in the `SECTION_BY_SUBCOMMAND` branch call
  `appendMessage(lab.buildAnalysisSnapshot(sub))`.
- **Find** (analysis.js ~158-168): `Analysis context: ${symbol}.`
  **Change:** after a successful `setActiveAnalysisSymbol`, read
  `lab.getActiveAnalysisConfig()` and print
  `Analysis context: ${symbol} (${name} · ${(weight * 100).toFixed(1)}%).`
  (name falls back to symbol when empty).
- **Find** (analysis.js `handleMonteCarlo` ~102-106): VaR/CVaR line.
  **Change:** include the symbol and median:
  `MC (N paths, SYM) — median $X, VaR (95%): $Y, CVaR (95%): $Z.`
  (`median` may be absent from mocked results — print it only when finite).
- **Find** (lab.js, exports): no snapshot builder. **Change:** add
  `export function buildAnalysisSnapshot(func)` returning per-view lines
  (fallback `Showing analysis '<func>'.` when the active config or its metrics
  are missing):
    - overview: `Analysis (SYM) — expected CAGR +X.X%, edge +Y.Y% vs NAME, scaled Kelly Z%.`
    - scenarios: top-3 by probability desc: `Scenarios (SYM) — bull 55% 2.1x, base 35% 1.2x, bear 10% 0.6x.`
    - value: `Value (SYM) — terminal $X, entry for T% CAGR $Y (Z% below/above target).`
    - kelly: `Kelly (SYM) — full X%, scaled ½K Y%, current weight Z%.`
    - belief: `Belief (SYM) — P% (confidence C%), as of DATE.` (falls back to the
      generic line when `belief_state` is missing)
    - evidence: count over the cached list (`valid_to < today` ⇒ superseded):
      `Evidence (SYM) — N valid / M superseded, latest DATE.` (`no logged
entries` variant when empty; generic line when the cache has no entry)
    - predictions: `Predictions (SYM) — Brier B (N=n), p pending, o overdue.`
    - journal: `Journal (SYM) — latest: ACTION DATE, review REVIEW (M entries).`
      Reuse `formatPercent` / `formatCurrency` / `computeStalePredictions` /
      `BayesianEngine.computeBrierScore`; export the builder via
      `__analysisLabTesting` too.
- **Find** (handler tests ~60-89): pinned generic-line expectations.
  **Change:** mock `buildAnalysisSnapshot` on the lab mock; assert delegation
- **Verify:** preamble.

## Viewport fit — deterministic ensure / detect / test

Post-WO experience (2026-10-15): the WO9 MC split pushed most of the MC view
out of the pane, found by a human. That is the whack-a-mole pattern this
section replaces with three deterministic layers. Invariant, stated once:
**in the common case, the active section never makes `.analysis-stage`
scroll — no element sits outside the pane viewport.** (Pathological data —
e.g. 50 scenario cards — may still scroll by design; `.analysis-stage`'s
`overflow-y: auto` stays as the safety net, per §4 above.)

### Layer 1 — Ensure: a CSS layout contract overflow cannot violate

Overflow happened because content height was unbounded: stat rows and
stacked canvases simply added up. The structural fix gives the active
section a definite height and makes every graphical region elastic, so the
browser — not the author — distributes space:

- `.output-grid` gets `flex: 1 1 auto; min-height: 0` inside the
  height-definite `.analysis-stage`, and
  `section[data-analysis-section]` gets `height: 100%` — the active
  section's box equals the stage's content box.
- Every pane canvas carries `class="pane-canvas"` and the rule
  `flex: 1 1 0; min-height: 0; width: 100%; object-fit: contain` — canvases
  share whatever space the text content leaves, and `object-fit` preserves
  the backing-store aspect ratio. They cannot push text out of the viewport
  because they only receive leftover space.
- `.timeline-container` becomes elastic (`flex: 1 1 auto; min-height: 0`)
  instead of a fixed `max-height: 260px`, so the evidence view follows the
  same contract.

Drawing code is unaffected: canvas backing stores stay fixed-attribute
(1200×400 / 1200×240), renders never read client geometry — the
hidden-measurement landmine stays sidestepped.

### Layer 2 — Detect: a runtime measurement after every render

`lab.js` exports `checkPaneViewportFit()`: it compares
`.analysis-stage` `scrollHeight` to `clientHeight` and, when the stage is
scrollable by more than 1px, logs a console warning naming the active
section and the exact pixel overflow. It is called from
`showAnalysisSection`, `renderActiveTicker`, and
`renderMonteCarloResults` — i.e. after every state change that can alter
layout. It returns `{ section, overflow }` (or `null` when the pane/element
is not measurable) so tests can assert behavior deterministically.
Zero-size subtrees (pane hidden) short-circuit: measurements on
`display: none` trees are the hidden-measurement landmine and must not be
trusted.

### Layer 3 — Test: two gates, zero eyeballs

- **Contract tests** (`tests/js/pages/analysis/lab_dom.test.js`): the
  markup contract (every pane canvas carries `pane-canvas`; sections fill
  the stage) and the stylesheet contract (the elastic rules above exist in
  `css/terminal/analysis.css`) are asserted as strings/attributes. If
  someone removes the mechanism, these fail without any browser.
- **Behavior tests**: `checkPaneViewportFit` branches — hidden pane →
  `null`; overflowing stage → `{ overflow }` + warning; fitting stage →
  `overflow: 0`.
- **Layout gate** (`scripts/check_analysis_pane_layout.mjs`, wired as
  `make analysis-layout-check`): drives a real headless Chromium through
  every function view (`analysis` overview/scenarios/value/kelly on PORT,
  then `analysis anet` + belief/evidence/predictions/journal, then
  `analysis mc` — polling for the worker's stat cards) at the minimum
  supported desktop viewport (1280×680, which puts the pane at its 320px
  floor — the worst case), asserting `stage.scrollHeight <=
stage.clientHeight + 1` after each view. Exits non-zero on violation, so
  CI can hold the line the same way unit tests do.

Visual note (human review): the elastic contract enlarges the Kelly canvas
and both MC canvases to fill leftover space — a deliberate change from the
previous small fixed-aspect boxes.
