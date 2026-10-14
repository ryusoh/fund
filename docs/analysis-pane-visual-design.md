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
  (2086-2095).
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
  histogram + green fan chart on one 600×200 canvas, lab.js:1604-1694) with no
  axes; the only label is 10px text (1675-1683).
- **G8 — Contrast exposure on colored status text.** Computed ratios in §5:
  `--red-color` on the darkest glass = 4.19:1 (below WCAG AA 4.5:1 for the
  ~10.9px stale badge); over the brightest pane-sized region of the actual
  background photo, muted text drops to 2.38:1. Shared with all glass panes,
  but this pane leans harder on colored text semantics.
- **G9 — Silent failure modes** (per-ticker drop, evidence-fetch conflation,
  unstyled MC errors) — see states audit.
- **G10 — No function label or as-of date in the pane.** The active function
  exists only in the scrollback; the context strip shows symbols only
  (lab.js:68-70, 1401-1435). Snapshot lines elsewhere carry date labels
  (e.g. `Composition (2026-10-01)`, snapshots.js:987).
- **G11 — No tabular-nums anywhere in the pane** — numeric columns
  (`dd` right-aligned, badges, stats) jump width on update; the terminal
  crosshair sets `font-variant-numeric: tabular-nums`
  (`css/terminal/terminal.css:152,175`).
- **G12 — Class/CSS mismatches.** `.action-meta` (lab.js:1378),
  `.timeline-count-badge` (1197-1214), and the `.lab-container` wrapper (2063)
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
  (lab.js:1399-1400 comment already encodes this).

### Per-function views

**Overview (DES analog — restore the designed landing screen, G1).**
Summary stat row (existing 5 stats) → scenario mini-rows (name, prob, multiple,
price CAGR — the 4 highest-signal fields, not all 6 chips) → value-band `<dl>`.
PORT context is the default landing (already, lab.js:2055-2058). Snapshot:
`Analysis (PORT) — expected CAGR +X.X%, edge +Y.Y% vs SP500, scaled Kelly Z%.`

**Scenarios.** Flat rows ordered by probability desc: bold caps name, then
right-aligned tabular numbers (Prob / Multiple / Price CAGR / Earnings CAGR) in
one aligned grid instead of six wrapping inline `<p>` chips (lab.js:711-716).
Thesis-derived descriptor names stay (lab.js:277-293). Snapshot:
`Scenarios (ANET) — bull 55% 2.1x, base 35% 1.2x, bear 10% 0.6x.`

**Value bands.** Keep the `<dl>` grid (analysis.css:200-216); emphasize only
`Current Price vs Value` (the actionable row) in `--text-color` bold. Snapshot:
`Value (ANET) — terminal $X, entry for 10% CAGR $Y (Z% below/above target).`
(fields already computed, lab.js:732-745).

**Kelly.** Canvas on top, badge row below (existing order). The canvas curve
currently has **no axis labels at all** — add muted 10px y-axis min/max growth
labels and rely on the existing marker labels (¼K/½K/Full K/2×K/Curr) for the
x-axis. The recommended action (scaled ½K) stays the highlighted badge —
promote its highlight from inline style (lab.js:841-843) to a class. For PORT,
the Covariance Dampener badge stays and should name its estimate source (merge
doc resolved-open-question: `risk.estimateSource` is already computed,
lab.js:1990). Snapshot: `Kelly (ANET) — full 22.1%, scaled ½K 11.0%, current
weight 34.2%.` Canvas `aria-label` carries the same sentence.

**Monte Carlo.** Split the single canvas into two stacked canvases (G7):
(1) terminal-price histogram with vertical VaR80/95 marker lines, (2) P5–P95
fan envelope with the median path. Stat row above the canvases (Median, Mean,
VaR/CVaR 80/95 — already DOM, lab.js:1569-1602). Add a pending state
(`Running 20,000 paths…` in the metrics area) between command and
`SIMULATION_COMPLETE` (currently nothing, lab.js:1529-1544). Pre-run placeholder
gets the shared empty-state class (G9). Snapshot stays VaR/CVaR, add median:
`MC (10,000 paths, ANET) — median $X, VaR(95%) $Y, CVaR(95%) $Z.`

**Belief.** Hierarchy: the probability is the hero number (largest type on the
screen, `--text-color` bold), with confidence and as-of as muted suffixes —
today all one inline-bold string (lab.js:1056-1064). Three labeled groups keep
their existing color semantics (for = default, against = gold, open questions =
blue; analysis.css:279-289); group titles become classes (currently inline,
lab.js:1088-1134). Snapshot: `Belief (ANET) — 68.0% (confidence 70%), as of
2026-09-30.`

**Evidence.** Keep the timeline. Add a text `SUPERSEDED` tag on superseded
entries (G14) alongside the dashed/opacity treatment. Keep the header count
badge (`N valid / M superseded`, lab.js:1189-1215) — promote to a class (G12).
PORT exclusion message stays (lab.js:1143-1150). Snapshot: `Evidence (ANET) —
12 valid / 3 superseded, latest 2026-10-01.` Fetch failure gets its own message
distinct from "no entries" (G9).

**Predictions.** Keep text-badge statuses (Pending/True/False + Brier + overdue
count — all text, good). Two-line rows: claim line, then muted meta line
(target date · probability · status) to end the claim-vs-chip crowding
(lab.js:1326-1343). Stale badge moves off pure `--red-color` text at 0.68rem
(G8/G13): same red but ≥0.72rem, or bold. Snapshot: `Predictions (ANET) —
Brier 0.18 (N=6), 3 pending, 1 overdue.`

**Journal.** Keep latest-entry emphasis; add `Entry N of M` context (the data
is an array, lab.js:1352) and a class for `.action-meta` (G12). Snapshot:
`Journal (ANET) — latest: ADD 2026-08-14, review 2026-11-14 (5 entries).`

**What-if sandbox.** Stays inside the belief section (lab.js:104-108). The gold
tag already prints the command syntax (`analysis bull|bear|reset`) — the right
no-hover affordance; keep. Dashed row separators move from inline
(lab.js:1480) to a class.

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
  `renderActiveTicker`, lab.js:1437-1467).
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
  remove the hardcoded white/red (lab.js:2124-2141) in favor of
  `--text-muted`/`--red-color` classes.
- Failure visibility: a ticker whose config fetch fails appears in the context
  strip with an `unavailable` marker (and a scrollback warning line), instead
  of silently vanishing (lab.js:2039-2042). Evidence fetch failure renders
  `Evidence log unavailable (fetch failed).`, distinct from the empty log.
- The terminal readiness race does not apply to analysis data (own fetch path)
  but does apply to FX conversion — already gated on `whenTransactionDataReady()`
  (lab.js:2151-2162; pattern from `docs/terminal-data-readiness.md`).

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

- **All glass-surface legibility is a human-review item.** Contrast table above
  is computed against modeled composites of the actual background photo; the
  Chromium refraction lens, WebGL overlay, and canvas-2D overlay
  (`docs/liquid-glass.md:34-41`) shift the effective background in ways I
  cannot see. Verify with
  `make screenshot URL=/terminal/ ARGS='--type "analysis kelly"'` (the `--type`
  mechanism runs a real command, `docs/liquid-glass.md:118-126`) and human
  eyes.
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
