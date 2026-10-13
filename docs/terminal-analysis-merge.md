# Merging `analysis/` into `terminal/` as a submodule — design

Findings doc for the question: _how to merge `analysis/index.html` into
`terminal/index.html` as a submodule, with a CLI system and
visualization/presentation system coherent with the existing terminal and
financial-industry terminal conventions._

## The answer (short version)

Model the analysis lab as a **third pane** in the terminal, driven by an
`analysis` command family that follows the repo's existing
`command + subcommand + [tokens]` grammar and the Bloomberg "load a security,
then run a function" convention. Presentation is **full-pane takeover with
per-section function views** — each function code (`kelly`, `mc`, `belief`, …)
shows only its section in the pane and prints a one-line snapshot to the
scrollback (the existing `plot` hybrid precedent), **lazy-loaded** via dynamic
import (the existing chart-renderer precedent), with CSS scoped under a pane
root. `lab.js` must first be refactored from module-eval side effects to an
explicit `init(rootEl)`.

## Section A — how the terminal CLI works today

Parse → dispatch → render pipeline:

1. Input: `handleTerminalInput` in `js/transactions/terminal.js:384-410` — Enter
   pushes history and calls `processCommand`; arrows walk history/cycle
   currency; Tab autocompletes.
2. `processCommand` (`js/transactions/terminal.js:310-335`) echoes the line into
   `#terminalOutput`, then calls `executeCommand(command, context)`.
3. Dispatch: `js/transactions/terminal/commands.js` — `commandMap` (lines 26–57)
   maps the first lowercased token to a handler; unknown input falls to
   `handleDefaultCommand`
   (`js/transactions/terminal/handlers/transaction.js:103`), which tries
   date-range parsing then treats the text as a table filter. Handlers receive
   `(args, context)` where context carries `appendMessage`, `chartManager`,
   `filterAndSort`, `toggleTable`, etc.
4. Output is **text-only**: `appendMessage`
   (`js/transactions/terminal.js:300-309`) appends a `<pre>` to
   `#terminalOutput` and calls `requestFadeUpdate` (`js/transactions/fade.js`).
   Tables are ASCII via `renderAsciiTable`
   (`js/transactions/terminal/stats/formatting.js:69`).

Handlers of note:

- `handlers/plot.js` — chart grammar `plot <sub> [abs] [date tokens]`; toggles
  `transactionState.activeChart`, un-hides `#runningAmountSection`, hides the
  table pane (`toggleCompositionChart`, lines 179–190), calls
  `chartManager.update()`, then prints a snapshot text line
  (`terminal/snapshots.js`). Readiness gate at lines 92–95.
- `handlers/stats.js` — `STATS_DISPATCH` (lines 21–34), gated by
  `isTransactionDataReady()`/`whenTransactionDataReady()`. `stats financial` /
  `stats technical` already fetch `../data/analysis/index.json` and per-ticker
  detail JSON (`js/transactions/terminal/stats/financial.js:13-72`) — the
  analysis dataset is already partially exposed in the terminal.
- `handlers/misc.js` — `reset`/`clear` hide exactly the two known panes
  (lines 150–154, 189–192).
- Autocomplete: `js/transactions/terminal/autocomplete.js`, driven purely by
  `constants.js` lists (`COMMAND_ALIASES`, `STATS_SUBCOMMANDS`,
  `PLOT_SUBCOMMANDS`, …); completeness test at
  `tests/js/transactions/autocomplete_completeness.test.js`.

Visualization: one canvas `#runningAmountCanvas`; `createChartManager`
(`js/transactions/chart.js:52`) redraws via rAF and **lazy-loads renderers with
a cache** — `loadRenderer(name)` → `await import(\`./chart/renderers/${name}.js\`)`
(`js/transactions/chart.js:39-48`), 19 chart keys. Zoom lives in
`js/transactions/zoom.js`(`getZoomElements` knows only terminal + chart +
table).

## Section B — what the analysis page contains

Shell (`analysis/index.html`, 233 lines): single stylesheet
`css/analysis-proto.css`, **no import map** (relative paths), entries
`js/pages/analysis/visuals.js` + `js/pages/analysis/lab.js`. Two-column
`.output-grid`:

- Left: `#scenarioResults`, `#valueBands`, Kelly card (`#kellyCurveCanvas` +
  `#kellyMetrics`), Monte Carlo (`#btnRunMonteCarlo`, `#monteCarloCanvas`,
  `#riskMetrics`).
- Right: `#beliefStateCard`, `#evidenceTimeline`, `#predictionsCard`,
  `#decisionJournalCard`, what-if sandbox (`#btnBayesBull/Bear/Reset`,
  `#bayesOutput`).

Modules (`js/pages/analysis/`):

- `visuals.js` — Matrix rain on `#holo-bg`, rAF loop at module eval.
- `bayes.js` — `BayesianEngine` (priors/update/replay, Brier score, JSONL
  parse). Pure logic, DOM-free — reusable as-is.
- `monte_carlo.worker.js` — module Worker; terminal-price sampling, VaR/CVaR,
  fan chart, histogram.
- `lab.js` (2036 lines) — **module-eval side effects**: DOM lookups (lines
  6–24), Worker construction (line 34), auto-`init()` on import unless
  `window.__SKIP_ANALYSIS_AUTO_INIT__` (2012–2014), `alert()` on init error
  (2008). Core: `buildConfigs` (1924–1966), `computeMetrics` (482–538:
  expected multiple/CAGR, edge, full/scaled Kelly, expected terminal price),
  `buildPortfolioConfig` (1823–1922, synthetic `PORT` symbol) with hardcoded
  `CORRELATION_MAP` (1787–1794). Renderers own their 2D canvases (no chart
  manager). Test hooks: `__analysisLabTesting` (2016–2036).

Data dependencies (relative fetches, `lab.js:36–57`):
`../data/analysis/index.json`, `../data/holdings_details.json`, per-ticker
`../data/analysis/<SYM>.json`, `../docs/thesis/<SYM>.md`,
`../data/analysis/<SYM>.evidence.jsonl`. Currency: hardcoded `$` formatting
(`lab.js:68–73`) — USD-only.

CSS footprint (`css/analysis-proto.css`, 599 lines): matrix palette on `:root`
(lines 1–27). Verified: no class/variable collisions with `css/terminal/*`, but
**global element selectors** exist — `* { box-sizing }` (29), `body` (33),
`button` variants (333–375), fixed `#holo-bg` (44), fixed `.top-nav`. Inline
styles in the markup reference `var(--border-thin)`, `var(--text-muted)`,
`var(--accent)`, `var(--ink)`.

Tests: `tests/js/pages/analysis/{lab,lab_coverage,lab_revival,visuals}.test.js`
import `@pages/analysis/lab.js` and rely on `__SKIP_ANALYSIS_AUTO_INIT__`.

## Section C — constraints and landmines

1. **Output-model mismatch (the biggest gap).** Terminal output is text-only
   `<pre>`; analysis is rich DOM + two canvases. A merge needs a _pane_ model.
   Precedent: `#runningAmountSection` vs `.table-responsive-container` are
   mutually exclusive via `.is-hidden`
   (`js/transactions/terminal/viewUtils.js:19-28`,
   `handlers/plot.js:179-190`).
2. **Pane-exclusion bookkeeping must be extended.** `reset`/`clear` hide
   exactly two panes; `isActiveChartVisible()` (viewUtils.js:35–65) whitelists
   19 chart keys; `mobileControls.js` `ALL_CHARTS` lists 19 charts. A third
   pane must be added everywhere or stale panels linger.
3. **Zoom assumes two panes.** `zoom.js` measures only chart/table (fallback
   +420px); plot/transaction auto-unzoom. A new pane needs zoom integration and
   glass `pauseResize`/`syncResize` choreography (zoom.js:84–91).
4. **Data readiness.** Printed text that reads `transactionState` must gate on
   `whenTransactionDataReady()` (see `docs/terminal-data-readiness.md`).
   Analysis data is fetched independently, so the gate is not needed — but the
   analysis page has no readiness concept and calls `alert()` on failure
   (`lab.js:2008`), unacceptable inside the terminal.
5. **Module-eval side effects.** `lab.js` grabs DOM elements, spawns a Worker,
   and auto-inits at import time. Embedding requires an explicit
   `init(rootEl)` refactor and lazy DOM lookup, or importing it from the
   terminal page crashes.
6. **Hidden-measurement.** `chart.js:75-82` bails on 0-size canvas. Kelly/MC
   canvases use fixed `width`/`height` attrs (render off-screen safely); any
   resize-on-reveal logic must not measure while `.is-hidden` (see the
   position-table landmine in AGENTS.md).
7. **Crosshair contract** (`docs/chart-crosshair-layout.md`) applies only if
   analysis charts go through `chartManager`/`chartLayouts`. Keeping the
   analysis canvases self-contained bypasses it — simpler, but no crosshair /
   legend / FX reuse.
8. **CSS scoping (AGENTS.md rule 6).** The `analysis-proto.css` globals (`*`,
   `body`, `button`, fixed `.top-nav`, `#holo-bg` rain) must be scoped under a
   pane root before loading on the terminal page.
9. **Path compatibility (good news).** `/analysis/` and `/terminal/` are both
   one level deep, so every relative URL (`../data/analysis/…`,
   `../docs/thesis/…`, the Worker path) resolves identically. CSP is identical
   on both pages; module workers are allowed.
10. **Mobile.** On coarse viewports the terminal input pane is hidden; an
    analysis pane is unreachable unless explicitly routed.
11. **Currency divergence.** Terminal re-renders on `currencyChangedGlobal`
    (`js/pages/terminal/index.js:433-472`); analysis is USD-only.
12. **Command-system tax.** A new command needs a `commandMap` entry,
    `constants.js` lists (autocomplete + completeness test), help text, ≥90%
    diff coverage, and the thinking-check/bot-PR gates. Name overlap:
    `js/transactions/terminal/stats/analysis.js` already exists (portfolio
    concentration stats) — don't confuse it with `js/pages/analysis/`.
13. **Nav.** Nothing outside `analysis/index.html` links to `/analysis/` —
    merging breaks no inbound nav except the lab page's own nav bar.

## Section D — recommended design

### Command grammar

Industry convention (Bloomberg): load a security context, then run function
codes (`AAPL US Equity GP <GO>`); typed commands beat menus. Sources:
[Bloomberg shortcuts cheat sheet](https://equityref.com/cheat-sheets/bloomberg-terminal-shortcuts/),
[BMC prep](https://mqaissaunee-bcc.github.io/AI_Examples/bloomberg_bmc_prep_v4.html),
[function overview](https://tradingtoolshub.com/blog/bloomberg-terminal-cost-features-2026/).
Map onto this repo's existing `command + subcommand + [tokens]` grammar:

- `analysis` (alias `an`) — open the analysis pane on the **overview** section
  (summary stats + scenario cards + value bands), portfolio context (the
  synthetic `PORT` config, `lab.js:1879-1917`).
- `analysis <TICKER>` — select security context, staying on the current
  section (tickers come from `data/analysis/index.json`, so autocomplete can
  offer them like `PLOT_SUBCOMMANDS`).
- Function subcommands — each switches the pane to **its section only** and
  prints a one-line snapshot to the scrollback (the `plot` hybrid precedent,
  `handlers/plot.js:230-236`):
    - `analysis scenarios` — scenario cards
    - `analysis value` — value bands
    - `analysis kelly` — Kelly curve + metric badges
    - `analysis belief` — belief state card
    - `analysis evidence` — evidence timeline
    - `analysis predictions` — falsifiable predictions (Brier)
    - `analysis journal` — decision journal
- `analysis mc [paths]` — run Monte Carlo (default 10000, matching
  `lab.js:1448`), show the MC section (canvas + risk metrics), print the
  VaR/CVaR line to scrollback.
- `analysis bull|bear|reset` — the what-if sandbox, applied to the active
  security context; already pure `BayesianEngine.update` calls
  (`lab.js:1403-1423`); prints the resulting posterior probabilities.
- `analysis close` — Bloomberg's MENU/back analogy; existing `reset`/`clear`/
  `plot …`/`transaction` implicitly close the pane too.

### Presentation model: third sibling pane, one section visible at a time

Add `<section id="analysisSection" class="chart-card is-hidden">` next to
`#runningAmountSection` in `terminal/index.html`. Inside it, each lab card is a
section block; a `showSection(func)` helper hides all but the active one
(overview shows summary + scenarios + value bands together). This reuses the
exact pane-exclusion mechanism (`.is-hidden`, viewUtils helpers), gets liquid
glass by adding the pane to `glassTargets`
(`js/pages/terminal/index.js:312-355`), and matches Bloomberg function UX: each
function code presents only its own screen. The lab's two-column
`.output-grid` flattens into a single-column stack of section blocks inside the
pane.

Rejected alternatives:

- Inline HTML in `#terminalOutput` — breaks the `<pre>`-only model and the fade
  logic in `js/transactions/fade.js`.
- Split pane — `zoom.js` and the mobile layout assume a two-pane column.
- **Reusing the chart pane** (`#runningAmountSection`) as a generic display
  surface holding both the canvas and analysis DOM. Rejected because: (1) the
  pane has an owner — `chartManager.update()` redraws it on zoom, currency,
  resize, and every `plot` command, so foreign DOM inside it is either
  clobbered or forces `chartManager` to know about alien content; (2) the
  bookkeeping cost is identical to a third pane (reset/clear must still hide
  analysis content, `zoom.js` must still measure variable-height analysis DOM)
  but takes an invasive shape — an `activeChart` vs `activeAnalysisView` mode
  axis threaded through existing chart logic — instead of the additive
  `.is-hidden` pattern; (3) `transactionState.activeChart` is the single
  source of truth for pane contents (`isActiveChartVisible()`, mobile
  controls, zoom all read it) — reuse means overloading it with
  pseudo-chart-keys or adding a parallel state field every consumer must
  check in combination.

### Lazy-loading strategy

Follow the chart-renderer precedent (`js/transactions/chart.js:39-48`): the
`analysis` handler does `const mod = await import('@pages/analysis/lab.js')`
once, cached. Required refactor first:

1. Split `lab.js` into a pure core (`buildConfigs`/`computeMetrics`/`render*`,
   mostly exportable already via `__analysisLabTesting`) and an explicit
   `initAnalysisPane(rootEl)`; move DOM lookups and Worker construction inside
   it (fixes landmine 5).
2. Replace `alert()` with pane-local error text (fixes landmine 4).

`bayes.js` and `monte_carlo.worker.js` need no changes. Keep files under
`js/pages/analysis/` so existing jest imports (`@pages/analysis/…`) and
relative data paths survive.

### CSS scoping strategy

New `css/terminal/analysis.css` loaded from `terminal/index.html`, every rule
nested under `.analysis-pane` (or `#analysisSection`); define the palette vars
on that root instead of `:root`; delete/scope the `*`, `body`, `button`
globals; drop `#holo-bg` matrix rain (the terminal owns the background via
`#terminalSweepOverlay`, and a permanent rAF loop would run hidden). Replace
inline `style="…var(--border-thin)…"` markup with classes so the pane root
controls the vars.

## Open questions — resolved

- **Fate of `/analysis/`:** the standalone page will be **deleted** once the
  terminal submodule ships. Deletion scope: `analysis/index.html`,
  `css/analysis-proto.css`, `js/pages/analysis/visuals.js` (matrix rain), and
  any smoke-test references; `js/pages/analysis/lab.js` (refactored),
  `bayes.js`, and `monte_carlo.worker.js` survive as the submodule source.
  Since nothing outside the page links to `/analysis/`, no redirect is needed.
- **Mobile:** moot — the terminal has **no command input on mobile** (the input
  pane is hidden on coarse viewports, `js/pages/terminal/index.js:406-418`), so
  there is no command surface to gate. The `analysis` command simply doesn't
  exist on mobile like every other command; no `mobileControls.js` swipe-list
  work, no special casing.
- **Currency:** wire the analysis pane to `currencyChangedGlobal` for
  consistency with the terminal (re-render on toggle), replacing the hardcoded
  `$` formatting (`lab.js:68–73`) with the shared currency formatting path.
- **Thesis fetch + `CORRELATION_MAP`** — determination after consulting
  `docs/fermat-pascal-kelly-system.md`:
    - **Thesis `<SYM>.md` fetch** (`lab.js:155-172`): **keep as-is.** It is
      fail-open (warn + cache null on miss), purely cosmetic (scenario display
      names), and already cached per symbol. Optional later cleanup: move
      scenario titles into `data/analysis/<SYM>.json` so the frontend stops
      parsing markdown.
    - **`CORRELATION_MAP`** (`lab.js:1787-1794`): **the doc rules against
      hardcoding.** §7.2 prescribes _estimating_ inter-asset correlations
      (historical or scenario-based) to build the covariance matrix. The
      hardcoded six-pair map silently returns `0.0` for any unknown pair —
      exposing portfolio Kelly over CLI makes that worse: any new ticker in
      `data/analysis/index.json` is treated as uncorrelated with everything,
      understating portfolio volatility and overstating the Kelly weight with
      no error. Resolution: keep the map for v1 but (a) surface the
      correlation source in the pane output (the "Covariance Dampener" badge
      already shows the ratio — add the estimate-source label), and (b) track
      the pipeline-generated replacement as a follow-up (below).

## Follow-ups (post-merge, separate work)

1. **Pipeline-generated correlation matrix.** Replace the hardcoded
   `CORRELATION_MAP` (`lab.js:1787-1794`) with a Python-pipeline output:
   compute pairwise return correlations from historical prices and write
   `data/analysis/correlations.json` (generated data — never hand-edit
   `data/`); the frontend consumes it in `getAssetPairCorrelation` and falls
   back to an explicit "unestimated" label rather than a silent `0.0` for
   unknown pairs. Motivation: `docs/fermat-pascal-kelly-system.md` §7.2
   prescribes _estimating_ correlations (historical or scenario-based), and a
   hardcoded map silently treats any new ticker as uncorrelated with
   everything — understating portfolio volatility and overstating the
   portfolio Kelly weight.
2. **Scenario titles in data.** Move thesis-derived scenario display names out
   of the `../docs/thesis/<SYM>.md` markdown fetch (`lab.js:155-172`) into
   `data/analysis/<SYM>.json` at generation time, so the frontend consumes a
   data contract instead of parsing markdown.
