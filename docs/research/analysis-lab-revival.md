# Reviving the `analysis/` Lab Page

**Status: Findings / Proposal**
**Date: 2026-09-29**
**Synthesis: this is a component finding of `docs/research/compounding-research-engine.md`.**

1. **It is not obsolete — it is an orphaned, mostly-working cockpit.** The page
   was built in one week (Nov 2025) as the live UI for the Fermat–Pascal +
   Kelly system; the math it implements matches the governing doc almost
   exactly; 69 unit tests + smoke pass; data is refreshed weekdays by a bot.
   It decayed socially (no inbound links, no human feature work in 10 months),
   not technically.
2. **Revive it as a read-only renderer of git-versioned judgment artifacts.**
   State of the art (Bayesian Linguistic Forecaster paper, Metaculus, Fatebook,
   Morningstar methodology, MacLean–Thorp–Ziemba on Kelly) converges on one
   design: probabilities and theses live in git as structured, timestamped
   artifacts updated by the research-chat agent; the page only renders derived
   views (fan charts, probability history, calibration, Kelly curves). The two
   interactive widgets that _write_ ephemeral state (Bayesian signal buttons)
   are exactly the part the literature says to invert.
3. **A short repair list** makes it fully functional today (§3a); the revival
   proper is the dataflow change in §4.

## 1. What the page is (primary-source audit)

`analysis/index.html` ("Lab") + `js/pages/analysis/{lab,bayes,visuals,monte_carlo.worker}.js`

- `css/analysis-proto.css`, created 2025-11-14 (`a8e92f7d`), last human feature
  work Nov 2025; everything since was bot lanes (Sentinel/TestPilot/Architect/
  Palette).

**Original design intent is unambiguous**: it is the live cockpit for the
Fermat–Pascal + Kelly system. `docs/thesis-template.md` mirrors
`data/analysis/<TICKER>.json` field-for-field; `docs/ai_update_flow.md` declares
the JSON the single source of truth for scenario numbers; and the page reads
`docs/thesis/<TICKER>.md` **at runtime** to extract scenario titles
(`js/pages/analysis/lab.js:148-165`). Intended loop: thesis doc ⇄ scenario JSON
⇄ Lab page.

**Math fidelity to `docs/fermat-pascal-kelly-system.md`** (audited line by line):

- Core model `computeMetrics` (`lab.js:475-531`) implements doc §2.2–2.5
  exactly: terminal EPS, multiples, expected CAGR, edge vs benchmark, full
  Kelly = edge/σ², scaled Kelly, target-entry value bands.
- Bayesian engine (`bayes.js:26-39`) implements posterior ∝ likelihood × prior
  per doc §4.4; likelihoods are a hand-coded piecewise model (allowed by §4.3).
  Only bull/bear signals are wired to buttons (`lab.js:743-755`);
  `volatility_spike` exists but is unreachable.
- Monte Carlo worker draws a scenario by probability, perturbs `epsCagr` /
  `exitPe` (Box-Muller), per doc §5.2 (`monte_carlo.worker.js:107-124`) — but
  reports VaR/CVaR at the **5%** tail where doc §3.2 specifies **20%**.
- Portfolio view **deviates from doc §7**: `buildPortfolioConfig`
  (`lab.js:1055-1060`) uses `sqrt(Σ wᵢ²σᵢ²)` — a zero-correlation assumption,
  not covariance Kelly — which is why PORT shows a meaningless Full Kelly of
  ~113%.

Unimplemented doc layers (scaffolded but never built): dynamic Kelly (§6),
covariance portfolio Kelly (§7), option-implied distributions (§8),
Sortino/Omega (§3.3). The `useMonteCarlo`/`useBayesianUpdate` flags in
`data/analysis/*.json` are ignored by the page.

## 2. Data pipeline (this part is healthy)

- `scripts/analysis/sync_configs.py` (635 lines) refreshes `market.*` (yfinance),
  `risk.volatility` (1y daily std × √252), `position.shares` from holdings;
  deletes sold tickers, creates defaults for new ones
  (`.github/workflows/analysis-sync.yml`, weekdays 07:45 UTC).
- Scenarios and `derived` are hand/LLM-authored via
  `scripts/thesis_update_gemini.py` + `docs/thesis_update_prompt.md`.
- Deploy reachability is fine: `[skip ci]` in the sync workflow is compensated
  by an explicit `pages.yml` dispatch (`analysis-sync.yml:62-68`, per
  `docs/pages-deploy.md`); the whole repo (including `analysis/`) is deployed.

## 3. What's actually broken (verified live in headless Chromium)

### 3a. Minimal repair set (makes the page fully functional)

1. **Monte Carlo crashes on the default PORT view.** PORT scenarios lack
   `growth`/`valuation` blocks; the worker reads `scenario.growth.epsCagrSigma`
   unguarded (`monte_carlo.worker.js:52-53`) → worker dies, button stuck on
   "Running…" forever (no `onerror`, `lab.js:793-801`). PORT is the default
   selection (`lab.js:1170`), so the headline feature is broken on first load.
   Fix: guard the worker or hide the MC button for PORT; add `onerror` reset.
   Per-ticker MC works (verified: ANET run rendered Mean/VaR/CVaR).
2. **Duplicated `<canvas id="holo-bg">`** (`analysis/index.html:24-25`) —
   invalid HTML; second canvas is a dead full-viewport layer.
3. **Undefined CSS custom properties** `--accent`, `--border-thin`, `--ink`
   (referenced in `analysis/index.html:69,110,117` and `lab.js:726`; the
   stylesheet defines `--accent-primary` etc. instead) — silent fallbacks.
4. Hygiene: dead CSS (`.nav-brand`, orphaned `grid-area`s, duplicated rule,
   unused Space Grotesk font); no import map / nav bar / favicon, unlike every
   other page; nothing anywhere links to `/analysis/` (root `index.html:74-89`
   nav omits it) and the page has no way out except URL editing.

### 3b. Structural drift (the real problem)

- **`derived` JSON block is write-only**: the page recomputes everything
  client-side and never reads `config.derived` (`lab.js:898,1149`). So
  LLM-authored `derived.expectedCagr/fairValueRange/kelly` drift from what the
  page shows (e.g. `data/analysis/ANET.json:112` says 7.28% while the page
  computes 5.96%; VT's `derived` is entirely null).
- **Thesis↔JSON drift**: `docs/thesis/ANET.md:212-215` documents bull
  prob/epsCagr/exitPe = 0.35/0.22/35; `data/analysis/ANET.json:68-79` now has
  0.40/0.28/38.
- The **Bayesian Lab's posterior state is ephemeral** (button clicks in a
  browser session) — nothing is recorded, so the one widget that changes
  beliefs leaves no audit trail.

## 4. State-of-the-art methodologies (with citations)

### 4.1 Bayesian thesis tracking — invert the buttons

- **Metaculus** scores forecasts time-weighted by "coverage" and uses spot
  scores explicitly to prevent manipulation by rapid updates — the value of a
  belief decays with time, so the system must record _when you believed what_.
  <https://metaculus-metaculus.mintlify.app/features/scoring> **[established]**
  Git gives this timestamping for free.
- **Superforecasting**: top forecasters update often and in small increments
  (Tetlock/Good Judgment). <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7333631/>
  **[established, but from geopolitical forecasting, not equities]**
- **Fatebook** is the current lightweight personal-calibration tool (question +
  deadline + probability → Brier track record).
  <https://www.lesswrong.com/posts/yS3d46m23wRKDQobt/introducing-fatebook-the-fastest-way-to-make-and-track>
- **Bayesian Linguistic Forecaster (BLF, 2026)** — the most directly relevant
  result: an agent maintains a semi-structured belief state (JSON with
  probability, confidence, evidence for/against, open questions), updated each
  tool-use loop iteration. Ablation: removing the belief state degrades Brier
  by 5.1 — _more than removing web search entirely_ (3.4).
  <https://arxiv.org/html/2604.18576v1> **[one paper; method validated,
  magnitude preliminary]** Strong evidence that "chat agent updates a
  structured belief artifact" beats "user clicks bull/bear buttons".

### 4.2 Scenario + Monte Carlo presentation

- **Morningstar 3-state discipline**: bull/bear cases defined as ~25%
  exceedance tails; the uncertainty rating is literally (bull−bear)/base and
  drives the required margin of safety.
  <https://www.morningstar.com/content/dam/marketing/apac/au/pdfs/Legal/Equity_and_Credit_Overview_au.pdf>
  **[established]** Maps 1:1 onto the existing scenario cards.
- **Visualization consensus trio**: one-hue percentile **fan chart** (Bank of
  England, 1997; <https://en.wikipedia.org/wiki/Fan_chart_(time_series)>),
  terminal-outcome **histogram** with VaR _and_ CVaR marked, **tornado**
  sensitivity chart; always print run count and as-of date.
  <https://dev3lop.com/blog/financial-risk-visualization-monte-carlo-simulation-dashboards/>
  **[practitioner consensus]** OSS reference tooling: QuantStats, PyPortfolioOpt,
  Riskfolio-Lib, skfolio; commercial: Portfolio Visualizer.

### 4.3 Kelly practice — curve, never a number

- MacLean–Thorp–Ziemba, _Good and Bad Properties of the Kelly Criterion_:
  mean-estimate errors cost ~20× variance errors (20:2:1); betting 2× Kelly
  collapses growth to the risk-free rate ("never pays to bet more than Kelly");
  fractional Kelly is a principled cash blend (½-Kelly = δ=−1).
  <https://www.stat.berkeley.edu/~aldous/157/Papers/Good_Bad_Kelly.pdf>
  **[established]**
- Presentation implication: render growth-rate-vs-fraction **curves** marking
  full/half/quarter Kelly and the 2×-Kelly zero-growth point, so the most
  dangerous number on the page carries its own disclaimer.

### 4.4 Decision journals

- Farnam Street decision journal (situation, alternatives rejected, expected
  outcomes with explicit probabilities, review date) — defeats hindsight bias.
  <https://fs.blog/decision-journal/> **[established practice, anecdotal
  efficacy evidence]**
- The BLF belief-state JSON _is_ a journal entry; agent-memory literature
  confirms raw context accumulation doesn't compound, structured disk artifacts
  do. <https://github.com/TsinghuaC3I/Awesome-Memory-for-Agents>

## 5. Revival design

**Split of concerns** (the core principle): the page contains _only_ derived,
regenerated views built from `data/`; all judgment artifacts (theses, evidence
logs, predictions, journal entries) live in git as Markdown/JSON and are the
inputs. The UI never writes state.

Recommended changes, in order:

1. **Repair** (§3a items 1–4). Small, testable, unblocks everything.
2. **Invert the Bayesian Lab.** Add per-ticker `data/analysis/<TICKER>.evidence.jsonl`
   (date, claim, source URL, direction, strength, thesis commit ref), written by
   the research-chat agent at the end of each session — the same funnel as the
   existing thesis-update workflow (`docs/ai_update_flow.md`) and the planned
   Anki capture (`docs/research/cross-repo-anki-synergy.md`). The page renders
   probability history as a read-only sparkline. Buttons become a local what-if
   sandbox at most, never the record.
3. **Adopt the BLF belief-state schema** in `data/analysis/<TICKER>.json`:
   `{probability, confidence, evidence_for[], evidence_against[],
open_questions[], as_of}` — replacing the write-only `derived` block as the
   LLM-authored section (or reconcile: page reads `derived` instead of
   recomputing, so doc/JSON/page can't drift three ways).
4. **Add resolution criteria + self-scoring.** Each thesis gets falsifiable,
   dated predictions ("X reports Y by Q3") that resolve binary; the page
   accumulates a personal Brier score and calibration chart (Fatebook model).
   Tiny samples — treat as a bias-detector, not a grade.
5. **Upgrade the visualizations to the consensus trio**: one-hue fan chart
   (median + P5–P95 + dashed starting-value line), terminal histogram with
   VaR/CVaR marked, tornado of input sensitivities; print run count + as-of
   date on-chart. Reconcile the VaR tail (page uses 5%, doc §3.2 says 20%).
6. **Kelly as a curve**, marking full/½/¼ Kelly and the 2×-Kelly zero-growth
   point; default recommendation fractional; fix or remove the PORT view's
   zero-correlation Kelly (either implement doc §7 covariance Kelly or label
   the number as assuming independence).
7. **Decision-journal snippet** (Farnam Street fields) committed alongside any
   position change, filled by the chat agent.
8. **Re-link the page** into the site nav (or deliberately keep it unlisted —
   but then document that choice; right now the orphaning is accidental, not
   a decision).

## 6. Open questions / what I could not verify

1. **Keep the page vs. fold into terminal?** The terminal already renders data
   views; whether the Lab should survive as a page or become terminal commands
   is a product judgment only the owner can make. The repair cost is small
   either way.
2. **BLF is a single 2026 paper** and the forecasting evidence base is
   geopolitical/binary-event, not equity selection — the transfer to stock
   theses is plausible but unproven.
3. **The PORT Monte Carlo shape**: whether to (a) guard/disable it, or
   (b) define portfolio-level `growth`/`valuation` sigmas properly — depends on
   the intended semantics of a portfolio scenario, which the draft doc doesn't
   specify.
4. **Thesis markdown as a runtime dependency** (`lab.js:148-165` fetches
   `docs/thesis/<T>.md` for titles) couples the page to prose formatting;
   whether titles should move into the JSON is an open schema decision.
5. **Brier-scoring ~4 theses** yields statistically tiny samples; the
   calibration chart's usefulness at this scale is unverified.
