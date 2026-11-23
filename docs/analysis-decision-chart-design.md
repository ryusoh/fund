# Single-Ticker Decision Chart Design for Terminal Analysis

Findings doc researching the optimal single-chart visual representation for the
analysis subsystem (`js/pages/analysis/`) inside `/terminal/`, aimed at turning
a verbose 9-view diagnostic pane into an intuitive 2-second buy / add / hold /
trim / sell decision tool.

Prior visual-polish work on the 9-screen Bloomberg layout lives in
`docs/analysis-pane-visual-design.md` (WO1–WO11, executed). Merge mechanics
live in `docs/terminal-analysis-merge.md`. Underlying math lives in
`docs/fermat-pascal-kelly-system.md`. This document evaluates why the current
visual architecture sees low daily usage and specifies a single-chart redesign
grounded in primary-source financial models, visualization science, and this
repository's actual ticker data.

## The question

The current analysis pane in `/terminal/` is verbose, fragmented across nine
subcommands, and lacks an intuitive decision signal, causing low daily usage.
Given all the data this repository already computes per ticker (Fermat–Pascal
scenarios, implied target-CAGR entry prices, discrete Kelly sizing, position
weights and caps, Monte Carlo distributions, Bayesian belief state, event flags,
and price/EPS history), **what is the single best one-chart-per-ticker visual
representation to directly communicate buy, add, hold, trim, or sell
decisions** — comparing GuruFocus GF Value and institutional alternatives?

## The answer (executive summary)

**A pure GuruFocus GF Value chart is a strong starting point, but it is
insufficient on its own for a Fermat–Pascal + Kelly portfolio.** GF Value
excels at spatial valuation perception (price plotted against a sloped fair
value corridor with red/green zones), yet it cannot answer _what to do_ because
it is blind to position sizing (e.g., `ANET` sits inside its green Buy price
band at `$171` vs. `$174`, yet is already `31.4%` of the portfolio against a
`30%` cap) and applies fixed symmetric percentage bands that ignore horizon and
asymmetry.

The highest-utility single-chart design for this repository is a **Unified
Valuation Corridor & Decision Chart** that replaces the 9-screen default landing
view with **one screen per ticker** composed of three tightly integrated layers
inside the existing `320px–480px` `.chart-card` pane:

1. **Decision Verdict Strip (top, ~26px DOM):** One unambiguous, thesis-gated
   action badge (`STRONG BUY`, `ADD`, `BUY · INITIATE`, `HOLD`,
   `HOLD · AT TARGET`, `HOLD · AT CAP`, `TRIM · OVER KELLY`, `TRIM TO CAP`,
   `TRIM`, `SELL / TRIM`, `WATCH`, `PASS`, `AVOID`, or `AVOID / EXIT · THESIS
BROKEN`) computed by a deterministic **3-Gate Decision Engine** (Thesis
   Integrity → Iso-CAGR Valuation Zone with `Geo` uncertainty guard →
   Volatility-Blended Kelly/Cap Sizing Gap with a proportional no-trade
   deadband), alongside `E[CAGR]`, next-trigger distance (e.g.,
   `Fair > $306 (+11.4%)`), scenario probabilities (`Bull/Base/Bear` +
   `Conf %`), and active flags.
2. **Unified Log-Scale Valuation Corridor + Forward Scenario Fan (middle,
   ~192px at `320px` pane floor / ~352px at `480px` ceiling, DPR canvas):** One
   continuous time-series canvas split at a crisp `TODAY` vertical hairline
   (uniform time scale in default `2y` mode so constant-CAGR paths plot straight
   across `TODAY`, with an explicit `//` scale-break marker in `full` mode when
   horizon $T$ compresses the past window):
    - **Left (Past 2Y in EPS-corridor/broken mode; Past 1Y in horizontal mode):**
      Solid weekly historical price line over Fermat–Pascal **iso-CAGR
      valuation zones** — sloped by point-in-time TTM EPS where positive
      historical EPS exists (`ANET`, `GOOG`, `PDD`, normalized to the cache's
      latest EPS at `TODAY` for continuity and labeled `Thesis×EPS`), and
      horizontal current-thesis bands where it does not (`VT`, `AEHR`).
    - **Right (Next 2Y default, full horizon `T` via `an <TICKER> full`):**
      Dashed forward total-return iso-CAGR curves ($V(r, t) = E[P_T] / (1 +
      r)^{T - t}$) overlaid with the lightly shaded deterministic **Bear / Base
      / Bull scenario range (3 states)**, probability-weighted ray strokes, and
      packed right-edge labels (`Bull 20% $402 →$1.8k`), plus a hover crosshair
      on the chart canvas.
    - **Behavioral debiasing:** Average purchase price / cost basis and past
      trade markers are **omitted completely** so the eye anchors to forward
      expected return rather than sunk cost (Odean 1998; Frydman & Rangel
      2014).
3. **Integrated Stephen Few Sizing Bullet + Risk Footer (bottom, ~42px DOM):**
   Replaces the squashed `0–1000%` Kelly growth curve as the primary sizing
   visual with a compact horizontal bullet bar scaled to
   `[0, max(1.25 * w_max, 1.15 * w_curr, 0.10)]`, contrasting current weight
   (`w_curr`) against capped volatility-blended Half-Kelly
   (`w_rec = min(½K, w_max)`) and `maxWeight`, followed by a single-line
   risk/catalyst digest (`Bear CAGR`, `Geo CAGR`, `52w range`, prediction
   record + Brier score, review date, and active `event_flags` / staleness
   badge).

To complete Shneiderman's _"Overview first, zoom and filter, then
details-on-demand"_ mantra (1996) without UI bloat, bare `an` (`PORT`) lands on
a 6-row **Small-Multiples Decision Board** with a 1-line portfolio-budget footer
(`Σ w_curr`, `Σ w_rec`, cash headroom), `an <TICKER>` opens that ticker's
**Decision Chart** immediately (with `an <TICKER> full` for the full $T$-year
horizon), and the 9 legacy subcommand views (`scenarios`, `value`, `kelly`,
`mc`, `belief`, `evidence`, `predictions`, `journal`, plus the
`bull`/`bear`/`reset` sandbox) are removed from the terminal pane.

## Locked design decisions

Resolved interactively via `/grill-me` and follow-up codebase/math review (all
downstream specs and work orders below reflect these choices):

| Branch                             | Locked Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pane views & command surface**   | **2 views only:** `an` (`PORT` Decision Board + portfolio budget footer) and `an <TICKER> [full]` (Single-Ticker Decision Chart), plus `an close`. Remove all 9 legacy subcommand views from `/terminal/`.                                                                                                                                                                                                                                                                                                                             |
| **Pointer & keyboard interaction** | **Strict keyboard-only navigation** (`an`, `an <TICKER> [full]`, `an close` + ticker autocomplete); **hover crosshair on the chart canvas only** (no clickable board rows or context strip, no vertical "What-If Price" probe).                                                                                                                                                                                                                                                                                                        |
| **Historical prices & EPS source** | Extend `scripts/analysis/sync_configs.py` to emit compact `data/analysis/<SYM>.history.json` (~3 KB per ticker: 2Y weekly closes from `yfinance` + positive quarterly TTM EPS from `data/checkpoints/fetched_eps_cache.json`) so both held and watchlist tickers (`AEHR`, `CBRS`) render full charts without loading the 8.9 MB `historical_prices.json` monolith. Watchlist tickers with no cache EPS use horizontal 1Y bands cleanly.                                                                                                |
| **Forward cone & horizon**         | **2Y forward cone by default** (uniform time scale across `TODAY`; terminal $T$-year targets printed inline as `→$1.8k`), deterministic Bear/Base/Bull rays with shaded **3-state scenario range** (no Monte Carlo worker), and optional `an <TICKER> full` (with `//` scale-break marker when compressed). Forward curves plot total return when `dividendYield > 0` and are explicitly labeled `TR (div. reinvested)`.                                                                                                               |
| **Dividends & `VT` model fix**     | Include reinvested `dividendYield` (`clamp(dividendYield / 100, 0, 0.25)`, since `yfinance` stores percentage points) in total-return compounding across all tickers per `docs/fermat-pascal-kelly-system.md:39`, AND derive `eps = price / pe` in `sync_configs.py` whenever `trailingEps` is omitted (fixing `VT`'s stale `6.22` EPS → `~8.02` and lifting modeled `E[CAGR]` from `2.2%` to `~9.2%`).                                                                                                                                |
| **Kelly sizing math & source**     | **Single live source of truth — 7-point Gauss–Hermite Volatility-Blended Discrete Kelly** (`f ∈ [0, 1.0]`, long-only unleveraged), expanding each scenario's annualized total-return CAGR $r_i$ by within-scenario annual volatility $\sigma$ (`risk.volatility`): $1 + R_{i,k} = (1 + r_i)\exp(\sigma z_k - \tfrac{1}{2}\sigma^2)$. Recomputed identically in `sync_configs.py` (`derived.kelly`) and `lab.js` (covered by a Python↔JS parity test); retire stale hand-set JSON Kelly values and vestigial `position.maxKellyWeight`. |
| **`fairValueRange` policy**        | **Retire `fairValueRange` from chart rendering and Gate 1 logic.** Git history shows `ANET`'s `[100, 130]` is a Nov 2025 echo at `$2.63` EPS and `AEHR`'s `[45, 50]` is a rounded paraphrase of `entryPriceForTarget = $47.81`. Live iso-CAGR bands are the single canonical valuation range; negative-EPS tickers either set `model.preferences.overrides.eps` (`AEHR`) or trip Gate 1 (`CBRS`).                                                                                                                                      |
| **`belief_state.probability`**     | **Standardize `belief_state.probability` to `P(thesis intact)`** (it previously drifted across `Bull.prob` on `ANET`, neutral `0.50` on `GOOG`/`VT`/`AEHR`, and thesis-intact `0.01` on `CBRS`). Gate 1 checks explicit `CLOSE_LONG`/`EXIT` journal action, `RETIRED`-prefixed scenarios, `effectiveEps <= 0`, or `belief_state.probability < 0.15`; Layer 1 and Board display the unambiguous **`Bull/Base/Bear` split + `Conf %`** instead of unlabeled `Belief %`.                                                                  |
| **Live prices, weights & policy**  | When `fetchRealTimeData()` succeeds, use normalized weights (`composition[i].percent / 100` or `tickerWeights[sym] / balance`, **never** raw `tickerWeights[sym]` USD values) **and** live `prices[sym]` to recompute `P0`/bands/Kelly. Proportional deadband `δ = max(0.005, 0.10 * w_max)`; surface `TRIM · OVER KELLY` whenever `w_curr > w_rec + δ`; Rich-zone target `min(w_rec, 0.5 * w_max)`; `STRONG BUY` requires `Geo ≥ r_tgt`; always print next-trigger distance.                                                          |
| **Cost basis & trade markers**     | **Omit completely** (no cost-basis line, no buy/sell markers, no `--trades` flag) so the chart stays strictly forward-looking and avoids anchoring bias (Odean 1998; Frydman & Rangel 2014).                                                                                                                                                                                                                                                                                                                                           |
| **Dead-code cleanup**              | Prune all 9 legacy UI renderers, `js/pages/analysis/monte_carlo.worker.js` (+ its test), and unused `js/pages/analysis/bayes.js` replay/sandbox code (retaining only `computeBrierScore` and core Fermat–Pascal/Kelly math); update `scripts/check_analysis_pane_layout.mjs`, Jest suites, `AGENTS.md`, and superseded docs.                                                                                                                                                                                                           |

---

## 1. Why the current pane has low utility (codebase audit)

An audit of `js/pages/analysis/lab.js`, `js/pages/analysis/bayes.js`,
`js/pages/analysis/monte_carlo.worker.js`, `css/terminal/analysis.css`,
`js/transactions/terminal/handlers/analysis.js`, and all six `data/analysis/*.json`
configs reveals six structural causes of friction:

### 1.1 Multi-command fragmentation to answer one question

Answering _"Should I buy, hold, trim, or sell `ANET`?"_ currently requires
5–7 sequential terminal commands across isolated views:

- `analysis [scenarios|value|kelly|belief|evidence|predictions|journal|mc [paths]|bull|bear|reset|close]`
  (`js/transactions/terminal/handlers/analysis.js:31-32`, `133-167`).
- `an ANET` switches the security context but stays on whichever section was
  last open (`js/pages/analysis/lab.js:2845-2854`); combo syntax like
  `an ANET kelly` is ignored because `handleAnalysisCommand` inspects only
  `args[0]` except for `mc [paths]` (`handlers/analysis.js:151-166`).
- Autocomplete lists only the 12 subcommands (`js/transactions/terminal/constants.js:80-93`,
  `autocomplete.js:43-48`); tickers are not autocompleted, and the context strip
  is read-only with no clickable navigation (`lab.js:1868-1913`).
- The default `overview` section (`lab.js:111-119`, `969-981`) omits `Current
Weight`, `maxWeight` cap, weight delta, belief probability, and event flags —
  forcing jumps to `an kelly`, `an value`, `an belief`, `an journal`, and
  `an mc`.

### 1.2 Why the prior redesign kept 9 separate views

`docs/analysis-pane-visual-design.md:3-7` explicitly scoped itself to styling
the already-settled merge architecture from `docs/terminal-analysis-merge.md`.
It kept one function per screen for three historical reasons: a Bloomberg
function-code analogy (`visual-design.md:223-227`), fear of overflowing the
`320px–480px` desktop pane height (`css/terminal/responsive.css:186-191`;
`visual-design.md:886-927`), and deliberate avoidance of `#runningAmountCanvas`
crosshair wiring (`visual-design.md:41-45`, `240-242`). The result is
visually clean, but it inverted Shneiderman's mantra: users must manually drill
through nine detail screens without an actionable overview.

### 1.3 Raw Kelly curves collapse real weights into an unreadable sliver

Evaluating the current Fermat–Pascal discrete Kelly solver (`lab.js:654-762`)
against all six live configs in `data/analysis/*.json` (as of `2026-11-20`,
total held value `$1,318,471.57` from `data/holdings_details.json`) exposes
why `#kellyCurveCanvas` rarely informs daily decisions:

| Ticker | Status     | Price     | Eff. EPS  | Horizon | E[P_T]    | E[CAGR] | Full K    | Scaled ½K | Cap (`maxWeight`) | Rec Weight | Curr Weight |
| ------ | ---------- | --------- | --------- | ------- | --------- | ------- | --------- | --------- | ----------------- | ---------- | ----------- |
| `GOOG` | Held       | `$274.99` | `$19.15`  | `10y`   | `$921.1`  | `12.8%` | `1000.0%` | `500.0%`  | `25%`             | `25.0%`    | `19.7%`     |
| `ANET` | Held       | `$170.99` | `$3.73`   | `5y`    | `$306.4`  | `12.4%` | `504.2%`  | `252.1%`  | `30%`             | `30.0%`    | `31.4%`     |
| `PDD`  | Held       | `$85.56`  | `$9.07`   | `5y`    | `$123.5`  | `7.6%`  | `134.2%`  | `67.1%`   | `25%`             | `25.0%`    | `20.4%`     |
| `VT`   | Held (ETF) | `$144.96` | `$6.22`   | `5y`    | `$161.6`  | `2.2%`  | `0.0%`    | `0.0%`    | `30%`             | `0.0%`     | `28.6%`     |
| `AEHR` | Watchlist  | `$40.92`  | `$0.90`\* | `5y`    | `$84.3`   | `15.5%` | `304.6%`  | `152.3%`  | `5%`              | `5.0%`     | `0.0%`      |
| `CBRS` | Watchlist  | `$91.25`  | `-$5.17`  | `5y`    | `-$643.7` | `n/a`   | `0.0%`    | `0.0%`    | `5%`              | `0.0%`     | `0.0%`      |

\* `AEHR` sets `model.preferences.overrides.eps = 0.895` (`data/analysis/AEHR.json:27-29`).

Because the legacy discrete solver feeds $T$-year annualized CAGRs directly into
a 1-year Kelly objective — ignoring both intra-year price volatility (`risk.volatility`,
`0.15–1.31` vs. scenario-CAGR spread `0.05–0.16`, a **10×–65×** variance
understatement) and any left-tail catastrophe state — unconstrained `fullKelly`
hits `134%–1000%` on four of six tickers, collapsing Kelly sizing into a binary
`0% / maxWeight` switch. Meanwhile, stale hand-set JSON values (`ANET` `0.06 /
0.03` from Nov 2025 at `$2.63` EPS via the retired `(E - benchmark) / σ²`
formula; `AEHR` `0.0 / 0.0` frozen at `$64.52`) contradict the live solver by up
to 100×. On `#kellyCurveCanvas` (`lab.js:1416-1490`), the X-axis stretches to
`2× fullKelly` or `zeroGrowthFraction`, crushing `Curr: 19.7%` and the `25%`
cap into the leftmost 2–5% of the canvas.

Expanding each scenario's annualized total-return CAGR $r_i$ with within-scenario
lognormal annual volatility $\sigma$ (`risk.volatility`) via **7-point
probabilists' Gauss–Hermite quadrature** ($1 + R_{i,k} = (1 + r_i)\exp(\sigma
z_k - \tfrac{1}{2}\sigma^2)$, long-only unleveraged $f \in [0, 1.0]$) preserves
exact expected terminal wealth $\mathbb{E}[\prod_{t=1}^T(1+R_t)\mid i] = M_i$,
preserves exact left-tail feasibility bounds, matches 80-point quadrature to
`<0.05%` across all active tickers, and restores risk-differentiated sizing
(`GOOG ½K 33.0% → 25% cap`, `VT post-fix ½K 50.0% → 30% cap`, `ANET ½K 7.8%`,
`PDD ½K 5.2%`, `AEHR ½K 0.9%` on `131%` σ).

### 1.4 Static, axis-less canvases and zero price-history context

- All three existing canvases (`#kellyCurveCanvas` `1200×400`,
  `#monteCarloCanvas` `1200×240`, `#monteCarloFanCanvas` `1200×240`;
  `lab.js:135-165`) use fixed HTML attributes scaled by `object-fit: contain`
  without DPR scaling or ResizeObserver (`css/terminal/analysis.css:296-301`),
  whereas `#runningAmountCanvas` uses live DPR scaling (`js/transactions/chart.js:75-93`)
  and full pointer crosshair interaction (`js/transactions/chart/interaction.js:1209-1240`).
- `#monteCarloCanvas` and `#monteCarloFanCanvas` draw zero numeric axis ticks
  (`lab.js:2176-2302`), and none of the analysis views plot historical prices,
  making it impossible to see whether a stock is falling into a buy zone or
  rallying into a trim zone.

### 1.5 Concrete bugs and data-hygiene gaps uncovered during audit

1. **Negative EPS breaks valuation math (`CBRS`):** `computeDerivedScenarioOutcome`
   (`lab.js:600-603`) multiplies `eps = -5.17` by `(1 + epsCagr)^T * exitPe`,
   yielding negative terminal prices (`-$643.7`) and invalid value bands.
2. **Reverse-sorted decision journal (`GOOG`):** `renderDecisionJournal`
   (`lab.js:1842`) displays `journal[journal.length - 1]`, but `GOOG.json:176-207`
   stores the newest entry (`2026-10-29`) at index `0` and the stale entry
   (`2026-09-29`) at index `1`.
3. **Disconnected What-If sandbox & retired `PORT` MC:** `analysis bull|bear|reset`
   (`lab.js:2007-2026`) mutates `state.bayesEngine.priors` without recalculating
   valuation or Kelly sizing; `buildPortfolioConfig` (`lab.js:2626-2628`) mixes
   `GOOG`'s 10-year multiple into a 5-year horizon and crashes `analysis mc`
   (both retired by removing the 9 legacy views).
4. **`VT` omitted dividend yield & EPS/PE mismatch:** `docs/fermat-pascal-kelly-system.md:39`
   specifies that scenario returns must be total return including reinvested
   dividends, yet `lab.js:600-603` and `sync_configs.py:580` omit `dividendYield`.
   For `VT`, `market.price` (`144.96`) / `market.eps` (`6.22`) = `23.3x` while
   `market.pe` is `18.08`, pulling `VT`'s modeled `E[CAGR]` down to `2.2%`
   (below `4%` risk-free).
5. **Stale hand-set JSON `kelly`/`fairValueRange` & drifted `belief_state.probability`:**
   `sync_configs.py:549` passes through `derived.kelly` and `fairValueRange`
   unmodified (`ANET` carries Nov 2025 `$2.63`-EPS values `fairValueRange: [100,
130]` and `kelly: 0.06/0.03`; `AEHR` carries `kelly: 0.0` from `$64.52`).
   Meanwhile `belief_state.probability` drifted into three meanings across the
   6 configs (`Bull.prob` on `ANET` `0.35`, subjective neutral prior `0.50` on
   `GOOG`/`VT`/`AEHR`, and `P(thesis intact)` `0.01` on `CBRS`).
6. **Watchlist tickers lack historical prices/EPS on disk:**
   `data/historical_prices.json` (8.9 MB) and `data/output/figures/pe_ratio.json`
   (3.7 MB) cover the four held tickers (`ANET`, `GOOG`, `PDD`, `VT`) but omit
   watchlist tickers (`AEHR`, `CBRS`) because `scripts/twrr/step03_fetch_prices.py:836-840`
   collects symbols only from `transactions_with_splits.parquet`. Meanwhile,
   `pe_ratio.json` stores a flat `17.72` P/E for `VT` across all 1,199 dates
   (since `VT` is absent from `data/checkpoints/fetched_eps_cache.json`).

---

## 2. Primary-source evidence: financial decision charts and visualization science

### 2.1 Institutional and retail valuation-chart benchmarks

| Model                                | Primary Source                                                                             | Core Visual Mechanism                                                                                                                                                                                                                                                   | Strengths to Adopt                                                                                                                         | Limitations for This Repo                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GuruFocus GF Value**               | GuruFocus GF Value official methodology & chart guides (`gurufocus.com`)                   | Solid historical fair-value spine + dashed 3Y forward projection; price overlaid against green (Modestly/Significantly Undervalued, roughly `P/GFV ≤ 0.9` / `≤ 0.7`) and red (Overvalued, roughly `≥ 1.1` / `≥ 1.3`) bands; **"Possible Value Trap"** qualitative guard | Instant spatial reading of price vs. value over time; past-to-future visual continuity; explicit value-trap override so cheap != blind buy | Blind to position weight / caps; fixed symmetric bands ignore stock volatility & horizon; relies on multi-factor historical ratios unavailable for watchlist or negative-EPS stocks |
| **Morningstar Price vs. Fair Value** | _Morningstar Equity Research Methodology_ (`morningstar.com`)                              | Closing price vs. DCF Fair Value Estimate with **Uncertainty Rating** (Low / Medium / High / Very High / Extreme) widening required 5-Star buy discounts (`20% → 50%+`) and 1-Star sell premiums (`25% → 75%+`)                                                         | Risk-adjusted Margin of Safety: high-dispersion stocks demand a deeper discount before flashing Buy                                        | Single-point FVE hides explicit Bear/Base/Bull asymmetry; no portfolio-sizing layer                                                                                                 |
| **FAST Graphs**                      | FAST Graphs official methodology (`fastgraphs.com`)                                        | Monthly price (black) plotted against an earnings-justified **Orange Line** and historical Normal P/E **Blue Line**, creating an EPS-sloped valuation corridor                                                                                                          | Sloping historical bands by point-in-time EPS avoids making earlier years of a fast grower look artificially cheap                         | Purely earnings-multiple driven; breaks on negative EPS; no probabilistic scenarios or Kelly sizing                                                                                 |
| **Simply Wall St**                   | `SimplyWallSt/Company-Analysis-Model` (`MODEL.markdown#discounted-cash-flows-dcf`, GitHub) | 2-stage DCF (or Excess Returns for financials) paired with a simple Fair Value thermometer bar (`>20%` margin of safety threshold) and 5-axis Snowflake                                                                                                                 | Extremely fast "undervalued by X%" scalar summary                                                                                          | Static snapshot with no time dimension; radar/snowflake relies on area/angle encoding (low perceptual accuracy)                                                                     |

### 2.2 Perceptual psychology, uncertainty visualization, and behavioral finance

1. **Position along a common scale is the #1 perceptual channel:** Cleveland &
   McGill (_Journal of the American Statistical Association_, 1984) proved
   empirically that humans decode quantitative values most accurately via
   _position along a common scale_ (lines, dots, aligned bars) and least
   accurately via _angle, area, and color saturation_ (gauges, speedometers,
   radar snowflakes). Every price threshold and weight comparison must therefore
   use aligned linear/log axes — never dials or radar charts.
2. **Logarithmic Y-axis for multi-year valuation ratios:** William Cleveland
   (_Visualizing Data_, 1993) recommends a logarithmic scale whenever analytical
   judgments depend on multiplicative factors and percentage margins (such as
   `+50%` upside vs. `-33%` downside, or compound CAGRs), so equal vertical
   distances represent equal ratios and constant-CAGR paths plot as straight
   lines (provided the X-axis time scale is uniform).
3. **Direct labeling and high data-ink ratio:** Edward Tufte (_The Visual
   Display of Quantitative Information_, 1983; _Beautiful Evidence_, 2006)
   advocates placing labels directly at line/band endpoints (eliminating
   eye-bouncing legends), maximizing data-ink over grid/border clutter, and
   using word-sized **small multiples / sparklines** for multi-entity scanning
   (ideal for the `PORT` overview).
4. **Overview first, then details-on-demand:** Ben Shneiderman (_IEEE
   Symposium on Visual Languages_, 1996) codified the Visual Information-Seeking
   Mantra: _"Overview first, zoom and filter, then details-on-demand."_ The
   current analysis pane violates this by opening straight into fragmented
   detail subcommands.
5. **Fan charts and explicit discrete scenario ranges:** Britton, Fisher &
   Whitley (_Bank of England Quarterly Bulletin_, Feb 1998, Vol. 38 No. 1,
   pp. 30–37) popularized fan charts for communicating asymmetric ("balance of
   risks") uncertainty over a forward horizon. Because our model has 3 discrete
   scenarios rather than a continuous probability density, the chart renders
   probability-weighted scenario rays and explicitly labels the lightly shaded
   envelope **`Scenario range (3 states)`** rather than implying a continuous
   confidence interval.
6. **Explicit uncertainty framing improves real decisions:** Fernandes, Walls,
   Munson, Hullman & Kay (_ACM CHI 2018_, DOI `10.1145/3173574.3173718`) showed
   in incentivized decision experiments that explicit visual uncertainty
   displays improved decision quality and lowered payoff variance compared to
   point estimates or text summaries alone.
7. **Bullet graphs for actual-vs-target + qualitative zones:** Stephen Few's
   _Bullet Graph Design Specification_ (Perceptual Edge) replaces gauges with a
   5-part linear strip (label, scale, featured measure bar, perpendicular
   target marker, qualitative background bands). This maps 1-to-1 to position
   sizing (`currentWeight` bar vs. `recommendedWeight` target tick over
   `[0, maxWeight, over-cap]` bands).
8. **No-trade deadbands prevent noisy whipsaws:** George M. Constantinides
   (_Journal of Political Economy_, Aug 1986, Vol. 94 No. 4, pp. 842–862)
   demonstrated that under transaction costs, optimal portfolio policy defines a
   **no-trade region** around target weights where doing nothing is optimal. A
   decision chart must encode an explicit `HOLD` band rather than flickering
   between `BUY` and `SELL`.
9. **Fractional Kelly asymmetry:** MacLean, Thorp & Ziemba (_The Kelly Capital
   Growth Investment Criterion_, 2010) proved that Half Kelly retains ~75% of
   maximum long-run growth at ~50% of volatility, whereas overbetting past Full
   Kelly severely destroys geometric growth. Position-sizing visuals must
   highlight over-cap / over-Kelly territory distinctly from safe under-target
   room.
10. **Hide purchase price by default to curb the disposition effect:** Terrance
    Odean (_Journal of Finance_, 1998) documented that anchoring to purchase
    price causes investors to sell winners prematurely and hold losers too long.
    Frydman & Rangel (_Journal of Economic Behavior & Organization_, 2014)
    proved experimentally that simply **removing purchase-price saliency cut the
    disposition effect by 25%**. Therefore, the decision chart must anchor the
    eye to _forward valuation bands_, NOT average cost basis.

---

## 3. Comparing five candidate single-chart architectures

| Candidate                                                       | Visual Form                                                                                    | Answers "Cheap/Rich?" | Answers "Buy/Hold/Trim/Sell?"                              | Shows Uncertainty / Skew?                        | Works for All 6 Repo Tickers?                           | Verdict                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ |
| **A. Pure GF Value**                                            | Price vs. Fair-Value spine + fixed ±10/30% zones                                               | Yes (high clarity)    | **No** (ignores weight & caps; `ANET` false-buys at 31.4%) | No (single spine)                                | No (needs historical ratios; breaks on `CBRS`, `VT`)    | Strong inspiration, incomplete                                     |
| **B. Morningstar P/FV + Uncertainty**                           | Stepped FVE + uncertainty-widened 5★/1★ bands                                                  | Yes (risk-adjusted)   | **No** (ignores weight & caps)                             | Partial (symmetric width)                        | No (no historical analyst FVE revisions stored)         | Borrow risk-adjusted bands                                         |
| **C. Valuation Football Field**                                 | Horizontal bars (Bear/Base/Bull, 52w, bands) + price tick                                      | Yes (static)          | Partial (can add sizing bar)                               | Yes (scenario spread)                            | Yes                                                     | Rejected as primary: **zero time/trajectory context**              |
| **D. 2D Action Scatter (`E[CAGR]` vs. `Weight/Cap`)**           | Quadrant plot with Buy/Hold/Trim/Sell zones                                                    | Yes (scalar)          | Yes (valuation + weight together)                          | No (unless bubble size = area, low accuracy)     | Yes                                                     | Best for **`PORT` multi-ticker comparison**, wasteful for 1 ticker |
| **E. Recommended: Unified Valuation Corridor & Decision Chart** | Verdict Strip + Log-Scale Iso-CAGR Corridor & Forward Scenario Fan + Stephen Few Sizing Bullet | **Yes (over time)**   | **Yes (3-gate: Thesis × Value × Sizing)**                  | **Yes (Bear/Base/Bull cone + terminal markers)** | **Yes (graceful degradation for `VT`, `AEHR`, `CBRS`)** | **Optimal single-ticker representation**                           |

---

## 4. Specification: Unified Valuation Corridor & Decision Chart

### 4.1 Screen anatomy inside the existing `.chart-card` pane (`~672px × 320px–480px`)

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ PORT  [GOOG]  ANET  PDD  VT  AEHR  CBRS                       2Y · 2026-11-20  │ ← Context Strip (24px DOM)
├────────────────────────────────────────────────────────────────────────────────┤
│ GOOG · Alphabet [ ADD +5.3% to cap ] E[CAGR] 13.2% · Fair >$306 (+11%) · 20/60/20 c80% │ ← Layer 1: Verdict Strip (26px)
├────────────────────────────────────────────────────────────────────────────────┤
│ Log $                                  │ Forward 2Y TR (div. reinvested)       │
│ $643  ··························· SELL │·······································│
│ $507  ··························· RICH │·······································│
│       ··························· FAIR │··············· Bull 20% $402 →$1.8k   │ ← Layer 2: Unified Decision
│ $306  ──┐ ┌────────────────────── BUY ─│───────────── Base 60% $345 →$854      │   Canvas (~192px @ 320px floor,
│ $275    └─●────────────────────────────●─────────── Bear 20% $291 →$362        │   ~352px @ 480px ceiling, DPR)
│ $198  ··························· DEEP │·······································│
│        2025          2026            TODAY          +1Y              +2Y       │
├────────────────────────────────────────────────────────────────────────────────┤
│ SIZE  [███████████████████|····]  19.7% / 25.0% target (+5.3% · +$70k) · ½K 33%│ ← Layer 3: Sizing Bullet (22px)
│ RISK  Bear +2.8%/yr · Geo 11.8% · 52w $271–$404 · Pred 1/2 (0.04) · 2026-10-29 │   + Risk Footer (20px)
└────────────────────────────────────────────────────────────────────────────────┘
```

**Exact vertical pixel budget at the `320px` desktop pane floor** (`css/terminal/responsive.css:186-191`):

- `#paneContext` (compact `24px`) + `.analysis-stage` padding (`8px` top + `10px` bottom = `18px`) + Layer 1 `#verdictStrip` (`26px`) + Layer 3 `#sizingBullet` (`22px`) + `#riskFooter` (`20px`) + 3 internal `6px` gaps (`18px`) = `128px` chrome.
- Remaining canvas height: **`192px`** at the `320px` floor and **`352px`** at the `480px` ceiling (`overflow <= 1px`).

**Testable success criteria:**

1. At `1280×580` (`320px` pane floor), `an` (`PORT` board) and `an <TICKER>` render with `scrollHeight - clientHeight <= 1px` across all 6 tickers (gated by `make analysis-layout-check`).
2. Verdict badge, next-trigger distance (`Fair > $306 (+11.4%)` or `Buy < $70.1 (-18.1%)`), sizing delta (`+5.3%` / `-23.6%`), and non-overlapping log Y-axis ticks are immediately readable without hovering.
3. Python (`sync_configs.py`) and JS (`lab.js`) agree within `1e-4` on `expectedMultiple`, `expectedCagr`, `fullKelly`, and `scaledKelly`.

### 4.2 Layer 1 — Deterministic 3-Gate Decision Engine

Every ticker's action badge is computed deterministically from `data/analysis/<SYM>.json`,
`data/analysis/event_flags.json`, live prices/weights (from `fetchRealTimeData()` when
available, else `holdings_details.json` × `market.price`), and the **7-point
Gauss–Hermite Volatility-Blended Discrete Kelly** solver:

- **Live Kelly math (single source of truth in Python & JS):**
  For each scenario $i$ with annualized total-return CAGR $r_i = M_i^{1/T} - 1$
  (where $M_i = \text{eps} \cdot (1 + g_i)^T \cdot \text{exitPe}_i \cdot (1 + d)^T / P_0$)
  and annual volatility $\sigma$ (`risk.volatility`), expand into 7 probabilists'
  Gauss–Hermite quadrature nodes/weights $(z_k, w_k)$:
  $$1 + R_{i,k} = (1 + r_i)\exp\bigl(\sigma z_k - \tfrac{1}{2}\sigma^2\bigr), \quad p_{i,k} = p_i w_k$$
  Solve exact discrete log-utility $f^* = \arg\max_{f \in [0, 1]} \sum_{i,k} p_{i,k} \ln\bigl(1 + r_f + f(R_{i,k} - r_f)\bigr)$
  by monotone bisection (long-only unleveraged `KELLY_FRACTION_CAP = 1.0`,
  reducing identically to exact discrete Kelly when $\sigma = 0$), and set
  $f_{\text{scaled}} = \text{kellyScale} \cdot f^*$ (`½K`). Never read stale
  hand-set `derived.kelly` or vestigial `position.maxKellyWeight` as overrides.

1. **Gate 1 — Thesis & Data Validity Gate (Value-Trap Override):**
    - Set `gate1Broken = true` and trigger `AVOID · THESIS BROKEN` (if `w_curr == 0`)
      or `EXIT · THESIS BROKEN` (if `w_curr > 0`) when **any** of:
        - Latest `decision_journal` entry (sorted ascending by ISO `date`,
          fixing `GOOG`'s reverse-order array) has `action ∈ {'CLOSE_LONG', 'EXIT'}`.
        - All scenarios have `name` starting with `'RETIRED'` (case-insensitive).
        - Effective `eps <= 0` (evaluated after `model.preferences.overrides.eps`,
          so `AEHR` with override `0.895` passes while `CBRS` at `-5.17` trips;
          retired `derived.fairValueRange` is **not** an escape hatch).
        - `belief_state.probability < 0.15` (standardized to mean `P(thesis intact)`).
    - When Gate 1 trips, **suppress green valuation zones** on the canvas (plot
      historical price in muted/red with a centered `THESIS BROKEN` watermark)
      so a failing business can never visually masquerade as a bargain.
    - **Review & Staleness Flag modifier (`⚑`):** Append an amber warning pill
      without hiding the quantitative valuation when: `event_flags.json` has an
      active flag for the ticker, any prediction is overdue,
      `belief_state.confidence < 0.50`, or `marketDataUpdatedAt` /
      `event_flags.generatedAt` is older than 7 days (`⚑ STALE`).
2. **Gate 2 — Fermat–Pascal Iso-CAGR Valuation Zones (with Uncertainty Guard):**
   Using $E[P_T] = \sum_i p_i \cdot \text{terminalPrice}_i$ (total return
   including reinvested dividends), horizon $T$, `targetCagr` ($r_{\text{tgt}}$),
   `benchmark` ($r_{\text{bench}}$), `riskFreeRate` ($r_f = 0.04$), and
   `strongCagr` ($r_{\text{strong}} = r_{\text{tgt}} + 0.05$), define exact
   iso-CAGR boundary curves at time offset $t$ (years from today):
   $$V(r, t) = \frac{E[P_T]}{(1 + r)^{T - t}}$$
   At $t = 0$ (today), $V(r_{\text{tgt}}, 0)$ is `entryPriceForTarget`, and
   $V(r_f, 0)$ is the risk-free floor:
    - **Deep Value (`DEEP_VALUE`):** $P_0 \le V(r_{\text{strong}}, 0)$ **and**
      $\text{geometricCagr} \ge r_{\text{tgt}}$ (Morningstar-inspired dispersion
      guard: high-volatility stocks like `131%`-σ `AEHR` cannot flash
      `STRONG BUY` unless median compounding clears the hurdle; otherwise
      downgraded to `BUY`).
    - **Buy Zone (`BUY`):** $P_0 \le V(r_{\text{tgt}}, 0)$ ($E[\text{CAGR}] \ge r_{\text{tgt}}$).
    - **Fair / Hold Zone (`FAIR`):** $V(r_{\text{tgt}}, 0) < P_0 \le V(r_{\text{bench}}, 0)$.
    - **Rich Zone (`RICH`):** $V(r_{\text{bench}}, 0) < P_0 \le V(r_f, 0)$.
    - **Overvalued Zone (`OVERVALUED`):** $P_0 > V(r_f, 0)$ ($E[\text{CAGR}] < r_f$, $f^* = 0$).
    - **Boundary awareness (no-flicker readout):** Always compute `nextTrigger`
      and `triggerDistancePct` (distance from `P0` to the nearest actionable
      band edge, e.g., `Fair > $306.2 (+11.4%)` or `Buy < $70.1 (-18.1%)`) and
      set `nearBoundary = true` when `|triggerDistancePct| < 0.02`.
3. **Gate 3 — Sizing Synthesis (Proportional Constantinides Deadband):**
   Let $w_{\text{rec}} = \min(f_{\text{scaled}}, w_{\max})$, proportional
   deadband $\delta = \max(0.005, 0.10 \cdot w_{\max})$ (so `0.5%` on `AEHR`'s
   `5%` cap, `2.5%` on `25%` caps, `3.0%` on `30%` caps), and
   $\Delta w = w_{\text{rec}} - w_{\text{curr}}$:
    - **Deep Value / Buy Zone:**
        - $w_{\text{curr}} = 0$ and $w_{\text{rec}} > 0$ → `STRONG BUY (≤w_rec)` / `BUY · INITIATE (≤w_rec)`
        - $w_{\text{curr}} > w_{\max} + \delta$ and $w_{\text{rec}} \ge w_{\max}$ → `TRIM TO CAP`
        - $w_{\text{curr}} > w_{\text{rec}} + \delta$ → `TRIM · OVER KELLY (-|Δw|)` (honors MacLean–Thorp–Ziemba over-betting protection even when price is in the Buy zone)
        - $\Delta w > \delta$ → `STRONG BUY (+Δw)` / `ADD (+Δw)`
        - $w_{\max} < w_{\text{curr}} \le w_{\max} + \delta$ → `HOLD · AT CAP`
        - Otherwise → `HOLD · AT TARGET`
    - **Fair / Hold Zone:**
        - $w_{\text{curr}} > w_{\max} + \delta$ and $w_{\text{rec}} \ge w_{\max}$ → `TRIM TO CAP`
        - $w_{\text{curr}} > w_{\text{rec}} + \delta$ → `TRIM · OVER KELLY (-|Δw|)`
        - $w_{\text{curr}} > 0$ → `HOLD`
        - $w_{\text{curr}} = 0$ → `WATCH (< $buy)`
    - **Rich Zone:** Let $w_{\text{rich}} = \min(w_{\text{rec}}, 0.5 \cdot w_{\max})$.
      If $w_{\text{curr}} > w_{\text{rich}} + \delta$ → `TRIM (-(w_curr - w_rich))`;
      else if $w_{\text{curr}} > 0$ → `HOLD · RICH`; else `PASS`.
    - **Overvalued Zone ($f^* = 0$):** `SELL / TRIM` if $w_{\text{curr}} > 0$;
      `AVOID` if $w_{\text{curr}} = 0$.

#### Post-WO1 verification against all six live tickers (`2026-11-20` snapshot, GH-7 Kelly + dividends + `VT` EPS fix)

| Ticker | Price    | StrongBuy / Buy / Fair / Sell (`t=0`)   | `E[CAGR]` (`Geo`) | `σ`    | GH-7 `K` / `½K`   | `w_curr` → `w_rec` (Cap, `δ`)     | Probs / Conf     | Next Trigger            | Resulting Verdict                |
| ------ | -------- | --------------------------------------- | ----------------- | ------ | ----------------- | --------------------------------- | ---------------- | ----------------------- | -------------------------------- |
| `GOOG` | `$275.0` | `$198` / `$306` / `$507` / `$643`       | `13.2%` (`11.8%`) | `0.33` | `66.1%` / `33.0%` | `19.7%` → `25.0%` (`25%`, `2.5%`) | `20/60/20` `80%` | `Fair > $306 (+11.4%)`  | **`ADD (+5.3% to cap)`**         |
| `ANET` | `$171.0` | `$140` / `$174` / `$224` / `$252`       | `12.4%` (`9.8%`)  | `0.58` | `15.6%` / `7.8%`  | `31.4%` → `7.8%` (`30%`, `3.0%`)  | `35/50/15` `75%` | `Fair > $174 (+1.7%)`\* | **`TRIM · OVER KELLY (-23.6%)`** |
| `PDD`  | `$85.6`  | `$56.4` / `$70.1` / `$90.2` / `$101.5`  | `7.6%` (`4.9%`)   | `0.35` | `10.4%` / `5.2%`  | `20.4%` → `5.2%` (`25%`, `2.5%`)  | `15/50/35` `70%` | `Buy < $70.1 (-18.1%)`  | **`TRIM · OVER KELLY (-15.2%)`** |
| `VT`   | `$145.0` | `$122` / `$153` / `$176` / `$185`       | `9.2%` (`8.5%`)   | `0.15` | `100%` / `50.0%`  | `28.6%` → `30.0%` (`30%`, `3.0%`) | `20/60/20` `90%` | `Fair > $153 (+5.7%)`   | **`HOLD · AT TARGET`**           |
| `AEHR` | `$40.9`  | `$38.4` / `$47.8` / `$61.5` / `$69.3`   | `15.5%` (`9.9%`)  | `1.31` | `1.8%` / `0.9%`   | `0.0%` → `0.9%` (`5%`, `0.5%`)    | `25/50/25` `60%` | `Fair > $47.8 (+16.8%)` | **`BUY · INITIATE (≤0.9%) ⚑`**   |
| `CBRS` | `$91.2`  | _suppressed_ (`CLOSE_LONG` / `RETIRED`) | `n/a`             | —      | `0.0%` / `0.0%`   | `0.0%` → `0.0%` (`5%`, `0.5%`)    | `RETIRED` `90%`  | `n/a`                   | **`AVOID · THESIS BROKEN`**      |

\* `nearBoundary = true` (`+1.7% < 2%`). Portfolio budget sum: `Σ w_curr = 100.0%`, `Σ w_rec = 68.9%`, unallocated cash/headroom `31.1%`. Notice that at `ANET 31.4%` (`2.0× Full K`) and `PDD 20.4%` (`2.0× Full K`), single-asset expected log-growth drops to `4.05%` and `4.01%` vs. `4.00%` risk-free, so `TRIM · OVER KELLY` reflects genuine over-betting risk while `AEHR 0.9%` matches `docs/thesis/AEHR.md:233`'s `≤2%` starter rule.

### 4.3 Layer 2 — Unified Valuation Corridor + Forward Scenario Fan Canvas

- **Y-axis:** Logarithmic price scale (`Cleveland 1993`), reusing the strict
  no-overlap collision pipeline documented in `docs/y-axis-tick-algorithm.md`
  with explicit `FONT_SIZE = 10` (`10px "JetBrains Mono", monospace`) and
  currency conversion via `LATEST_FX_DATE = '9999-12-31'`.
- **X-axis split (proportional, uniform time scale in default `2y` mode):**
    - Compute `splitRatio = clamp(pastYears / (pastYears + futureYears), 0.30, 0.60)`:
        - Default `2y` in `'eps-corridor'` / `'thesis-broken'` (2Y past / 2Y future) → **`50% / 50%`** (strictly uniform time scale — constant-CAGR paths plot straight across `TODAY`).
        - Default `2y` in `'horizontal-bands'` (1Y past / 2Y future, `VT` / `AEHR`) → **`33.3% / 66.7%`** (strictly uniform).
        - `full` mode on 5Y or 10Y horizons (`pastYears / (pastYears + T) < 0.30`) → clamped at **`30% / 70%`** with an explicit `//` scale-break glyph on the X-axis at `TODAY` and a `compressed scale` note in the crosshair readout.
    - **Past (`-pastYears .. Today`):** Solid weekly price line in primary
      terminal foreground color.
    - **Historical corridor honesty (continuity + zero look-ahead bias):**
        - _Mode 1 — EPS-tracked corridor (`ANET`, `GOOG`, `PDD`):_ Where
          `history.eps` has `>= 2` positive points overlapping the past window
          (`data/checkpoints/fetched_eps_cache.json`), multiply each historical
          week's step-held $\text{EPS}(d)$ by today's model multiples
          **normalized to the cache's latest EPS at `TODAY`**:
          $M(r) = V(r, 0) / \text{EPS}_{\text{hist}}(\text{today})$ (not
          `market.eps`, which differs by `+4.8%` on `ANET` and `+11.7%` on
          `PDD`). This guarantees exact continuity across `TODAY` and is
          labeled `Thesis×EPS`.
        - _Mode 2 — Horizontal 1Y bands (`VT`, `AEHR`):_ Where positive
          historical EPS history is absent (never invert `VT`'s flat `17.72` P/E
          in `pe_ratio.json`), render a 1Y price history over horizontal
          current-thesis bands labeled `Current bands`.
        - _Mode 3 — Thesis-broken (`CBRS`):_ Render 2Y price history in
          muted/red with a centered `THESIS BROKEN` watermark; suppress all
          valuation bands.
    - **Future (`Today .. Today + min(2Y, T)` default, or full `T` via
      `an <TICKER> full`):**
        - Plot dashed forward iso-CAGR curves $V(r, t) = E[P_T] / (1 + r)^{T - t}$
          and 3 deterministic scenario rays $P_i(t) = P_0 \cdot (1 + r_i)^t$
          with stroke width weighted by probability (Base `2px`, Bull/Bear
          `1.25px`) over a lightly shaded Bear–Bull envelope (`rgba(..., 0.07)`)
          watermarked `Scenario range (3 states)` so 3 discrete outcomes are
          never mistaken for a continuous confidence interval.
        - **Total-return unit disclosure:** When `dividendYield > 0` (`GOOG`,
          `VT`), forward curves and rays represent total return with dividends
          reinvested (matching `E[CAGR]` and `V(r, t)`), explicitly labeled
          `Forward 2Y TR (div. reinvested)` in the top-right header (and
          `Forward 2Y Scenarios` when `dividendYield === 0`).
        - **Label placement (no collisions, fits margin):** Anchor zone tags
          (`DEEP`, `BUY`, `FAIR`, `RICH`, `SELL`) right beside the `TODAY`
          vertical hairline (never at the 2025 left edge where Mode 1 bands
          have different historical prices). Reserve `padding.right = 132px`
          exclusively for the 3 greedily packed scenario endpoint labels in
          compact `Bull 20% $402 →$1.8k` format (≤20 chars ≈ `120px` at `10px`
          monospace, `minGap = 12px`).
- **Color & contrast discipline:** Use only existing `css/terminal/base.css`
  semantic tokens (`--green-color` for Deep Value/Buy at `8–14%` alpha,
  transparent/glass for Fair/Hold, `--primary-color` gold for Rich at `9%`
  alpha, `--red-color` for Overvalued at `12%` alpha), paired with `TODAY`-anchored
  inline zone tags so no signal is color-only.
- **Interactive hover crosshair (canvas only):**
    - Render on a live DPR-scaled canvas matching `js/transactions/chart.js:75-93`
      and wire pointer hover throttled via `requestAnimationFrame`.
    - Hovering the past shows `Date · Price · Historical Implied Zone`.
    - Hovering the future shows `Date (+X.Xy) · Bear / Base / Bull · Buy/Fair Band`.
- **No cost-basis line or trade markers:** Per Odean (1998) and Frydman &
  Rangel (2014), omit `average_price` and historical buy/sell markers
  completely (no opt-in flag).

### 4.4 Layer 3 — Integrated Stephen Few Position-Sizing Bullet + Risk Footer

- **Sizing Bullet (DOM / inline SVG, ~22px high):**
    - Quantitative scale: `0%` to `scaleMax = max(w_max * 1.25, w_curr * 1.15, 0.10)`.
    - Qualitative background zones: `[0, w_rec]` (safe accumulation room),
      `[w_rec, w_max]` (over-Kelly / hold buffer), `[w_max, scaleMax]`
      (red-tinted over-cap warning).
    - Featured bar: solid bar for `w_curr` (`19.7%` for `GOOG`, `31.4%` for
      `ANET`).
    - Comparative markers: crisp vertical tick at `w_rec = min(½K, w_max)` and
      dashed cap hairline at `w_max`.
    - Right-aligned readout: `19.7% / 25.0% target (+5.3% · +$70k) · ½K 33%`
      (when `½K >= 0.50` / saturated at unleveraged `fullKelly = 1.0`, print
      `½K ≥50% (cap)` instead of false precision).
- **Risk & Catalyst Footer (~20px high):**
  Single tabular-nums line carrying secondary metrics:
  `Bear +2.8%/yr · Geo 11.8% · 52w $271–$404 · Pred 1/2 (Brier 0.04) · Rev 2026-10-29`
  plus any `⚑` event-flag / staleness pill and a muted hint
  (`an <SYM> full | an | an close`).

### 4.5 Companion `PORT` overview (Shneiderman's "Overview First")

When the user types bare `an`, replace the broken mixed-horizon `PORT` summary
with a 6-row **Portfolio Decision Board** + 1-line **Portfolio Budget Footer**
(fitting inside `320px` at ~34px/row + 22px header + 22px footer):

- Columns: `TICKER` | `VERDICT` pill | mini **Valuation Position Spark** (60px
  horizontal bar showing `P0` across `[StrongBuy .. Sell]` + next-trigger `%`) |
  `E[CAGR]` | mini **Sizing Bullet** (`w_curr` vs `w_rec`) | `PROBS / FLAGS`
  (`35/50/15 · c75%` + `⚑`).
- **Portfolio Budget Footer:** `Allocated Σw_curr 100.0% · Kelly Target Σw_rec 68.9% · Cash headroom 31.1%`
  (when `Σ w_rec > 100%`, displays an amber `Budget >100% — scale ADDs pro-rata`
  note; notes single-asset Kelly assumes independent risk unless correlations
  are populated).
- Sorted by action urgency (`EXIT / AVOID · THESIS BROKEN`, `SELL / TRIM` →
  `TRIM TO CAP / OVER KELLY` → `STRONG BUY / ADD / INITIATE` → `TRIM (RICH)` →
  `HOLD` → `WATCH / PASS`).
- Strictly keyboard-driven: typing `an <SYM>` opens that ticker's **Decision
  Chart**, `an <SYM> full` renders the full $T$-year horizon, and `an close`
  closes the pane. Update `js/transactions/terminal/autocomplete.js` to
  autocomplete tracked ticker symbols, `full`, and `close`.

---

## 5. Data, pipeline, and bug-fix prerequisites

Implementing the Decision Chart cleanly requires four targeted repo changes
beyond the UI renderer itself:

1. **Per-ticker compact history & live derived math in `scripts/analysis/sync_configs.py`:**
   `sync_configs.py:223-275` already fetches `yfinance` history for every ticker
   in `holdings ∪ watchlist` (including `AEHR` and `CBRS`). Extend it to:
    - Derive `market.eps = price / pe` for ETFs where `yfinance` omits
      `trailingEps` (`VT`), include percentage-point `dividendYield` in
      total-return compounding, and recompute `derived.kelly` using the exact
      same 7-point Gauss–Hermite volatility-blended discrete Kelly solver as
      `lab.js`.
    - Emit `data/analysis/<SYM>.history.json` (~2–4 KB each: 2Y weekly closes
      from `yfinance` with `historical_prices.json` offline fallback + positive
      quarterly TTM EPS strictly from `data/checkpoints/fetched_eps_cache.json`
      — watchlist tickers absent from the cache get `eps: []` and render
      horizontal 1Y bands cleanly; refreshed on the `analysis-sync.yml` schedule
      or manual `sync_configs`).
    - Fix the orphan-cleanup loop (`sync_configs.py:625-629`) so
      `theme_timeline.json` and tracked `<SYM>.history.json` files are preserved
      (especially under `--ticker <SYM>` scoped runs!).
2. **Consistent live prices & normalized portfolio weights:** Wire `lab.js` to
   consume `fetchRealTimeData()` (`js/transactions/realtimeData.js:130-214`)
   when available — reading **normalized fractions** from
   `composition[i].percent / 100` (or `tickerWeights[sym] / balance`, **never**
   raw `tickerWeights[sym]` which stores USD market value!) **and** live
   `prices[sym]` to recompute `P0`, bands, and Kelly, falling back to
   `holdings_details.json` × `market.price` when offline.
3. **Fix the active valuation & journal bugs during rollout (the MC worker and
   synthetic `PORT` aggregation are deleted outright per Locked Decisions):**
    - Guard `computeDerivedScenarioOutcome` (`lab.js:600-603`) against
      effective `eps <= 0` (retiring `fairValueRange` as an escape hatch).
    - Sort `decision_journal` ascending by ISO `date` instead of taking
      `[length - 1]` (`lab.js:1842`).
    - Include reinvested `dividendYield` in JS and Python total-return
      compounding and verify Python↔JS parity (`expectedMultiple`,
      `expectedCagr`, `fullKelly`, `scaledKelly`) within `1e-4`.
    - Standardize `belief_state.probability` to `P(thesis intact)` in
      `.agents/skills/thesis-update/SKILL.md` and display unambiguous
      `Bull/Base/Bear` + `Conf %` in the pane.
4. **Update layout & visual gates:** Keep the `320px` viewport-fit contract in
   `scripts/check_analysis_pane_layout.mjs` (`make analysis-layout-check`) and
   verify live glass legibility in Chrome (`make screenshot URL=/terminal/`)
   before finalizing band fill opacities.

---

## 6. Open questions / what I couldn't verify

- **Exact proprietary GuruFocus GF Value formula:** GuruFocus publishes its
  three conceptual pillars (historical multiples, past-growth adjustment factor,
  future estimates) and qualitative zones (`gurufocus.com`), but the exact
  mathematical weights of its proprietary adjustment factor and exact value-trap
  cutoff rules are not publicly disclosed. Our iso-CAGR formula
  $V(r, t) = E[P_T] / (1 + r)^{T - t}$ is strictly transparent and derived from
  this repo's own Fermat–Pascal model rather than reverse-engineering GF Value.
- **Liquid-glass legibility over bright background regions:** As documented in
  `docs/analysis-pane-visual-design.md:439-456`, the bright face region of
  `terminal_background.jpg` reduces muted text contrast on the glass slab at
  `1440×900`. Subtle red/green/gold canvas band fills (`8–14%` alpha) and
  `TODAY`-anchored zone tags must be visually checked in Chromium
  (`make screenshot URL=/terminal/`) to confirm contrast over the glass backdrop.
- **Cross-asset correlations & explicit catastrophe states:** GH-7 volatility-blended
  Kelly fixes the single-asset variance understatement, but `risk.correlations`
  is currently `null` in all configs (so `GOOG` + `ANET` AI-capex co-movement is
  not yet penalized in multi-asset Kelly) and none of the 6 configs include an
  explicit `-90%` catastrophe state per `docs/fermat-pascal-kelly-system.md:38`.
  Both remain thesis-authoring upgrades outside the chart renderer itself.

---

## Action items

### Preamble for the implementer

- Execute **one work order at a time** in numbered order.
- Every `Find` string below is a verified unique anchor in the current tree;
  line numbers may drift across commits. If a `Find` anchor does not match
  verbatim, stop and report the mismatch rather than improvising.
- `data/` is pipeline output — regenerate via `venv/bin/python -m
scripts.analysis.sync_configs` (never hand-edit `data/analysis/*.json`).
- Format only touched files (`npx prettier --write <files>`,
  `venv/bin/black <files>`, `venv/bin/ruff check --fix <files>`), run each
  order's scoped `Verify` command, and run `make precommit-fix` before the
  final commit.
- Commit locally after each completed item (Conventional Commits checked via
  `scripts/agents/check_commit_message.py`) and leave pushing to the user.
- Every work order (`[trivial]`, `[low]`, `[design]`, `[visual]`) is fully
  specified below and ready for direct implementation; `[visual]` items require
  a live Chromium screenshot check (`make screenshot URL=/terminal/`) before
  closing.

---

### WO1 `[design]` — Fix `VT` ETF EPS derivation, reinvested `dividendYield`, and live GH-7 Kelly in `sync_configs.py`

- **File:** `scripts/analysis/sync_configs.py` and
  `tests/python/test_sync_configs_derived.py`
- **Find (1):**

    ```python
            ev = market.get('enterpriseValue')
            ebitda = market.get('ebitda')
            if isinstance(ev, (int, float)) and isinstance(ebitda, (int, float)) and abs(ebitda) > 1e-6:
                ratio = maybe_round(ev / ebitda)
                if market.get('evToEbitda') != ratio:
                    market['evToEbitda'] = ratio
                    changed = True
    ```

- **Find (2):**

    ```python
        if valid_inputs:
            total = 0.0
            for scenario in scenarios:
                growth = scenario.get('growth', {})
                valuation = scenario.get('valuation', {})
                cagr = growth.get('epsCagr') or 0.0
                exit_pe = valuation.get('exitPe') or 1.0
                prob = scenario.get('prob') or 0.0
                total += prob * eps * (1 + cagr) ** horizon * exit_pe / price
            expected_multiple = round(total, 4)
            expected_cagr = round(total ** (1 / horizon) - 1, 4) if total > 0 else 0.0
    ```

- **Change:**
    1. Immediately before `ev = market.get('enterpriseValue')`, when
       `'eps' not in market_metadata` (e.g., ETFs like `VT` where `yfinance`
       omits `trailingEps`) and both `market.get('price')` and
       `market.get('pe')` are positive numbers, set
       `derived_eps = maybe_round(market['price'] / market['pe'])` and update
       `market['eps']` if changed.
    2. Add a pure helper `solve_gh7_kelly(scenario_returns, sigma, risk_free_rate=0.04, cap=1.0)`
       using the exact 7-point probabilists' Gauss–Hermite constants:
        - `GH7_NODES = (-3.7504397177, -2.3667594107, -1.1544053947, 0.0, 1.1544053947, 2.3667594107, 3.7504397177)`
        - `GH7_WEIGHTS = (0.0005482689, 0.030757124, 0.2401231786, 0.4571428571, 0.2401231786, 0.030757124, 0.0005482689)`
          When `sigma > 0`, expand each `(prob, r_i)` into 7 pairs
          `(prob * w_k, (1 + r_i) * exp(sigma * z_k - 0.5 * sigma**2) - 1)`
          (when `sigma <= 0`, pass `(prob, r_i)` directly); solve
          $\sum p \cdot (r - r_f) / (1 + r_f + f(r - r_f)) = 0$ on `[0.0, hi]`
          (where `hi = min(cap, min((1 + r_f)/(r_f - r) * (1 - 1e-7)))`) via
          80-step bisection, returning `0.0` when the derivative at `f = 0` is
          `<= 0`.
    3. In `recompute_derived`, read `raw_div = market.get('dividendYield')`,
       convert percentage points to decimal
       `div_rate = min(0.25, max(0.0, float(raw_div) / 100.0))` when numeric,
       multiply each scenario multiple by `(1 + div_rate) ** horizon`, and
       recompute `derived['kelly'] = {'fullKelly': round(full_k, 4), 'scaledKelly': round(full_k * kelly_scale, 4)}`
       using `solve_gh7_kelly` with `sigma = overrides.get('volatility', risk.get('volatility'))`
       and `risk_free_rate = preferences.get('riskFreeRate', 0.04)` (setting
       `{'fullKelly': None, 'scaledKelly': None}` when `not valid_inputs` or
       all scenarios are `RETIRED`-prefixed). Update the `recompute_derived`
       docstring so it reflects that `kelly` is pipeline-computed while
       `fairValueRange` remains passthrough for schema compatibility.
    4. Update `tests/python/test_sync_configs_derived.py` (updating
       `test_stale_values_are_corrected_and_judgment_fields_preserved` to assert
       recomputed `derived['kelly']` alongside preserved `fairValueRange`) and
       add tests for ETF `price / pe` EPS derivation, percentage-point
       `dividendYield` compounding (`1.56` → `1.56%`, never `156%`), and GH-7
       Kelly accuracy (`sigma = 0` exact discrete limit + live `GOOG`/`ANET`/
       `AEHR`/`VT` profiles).
- **Verify:** `venv/bin/pytest tests/python/ -k sync_configs && venv/bin/ruff check scripts/analysis/sync_configs.py tests/python/test_sync_configs_derived.py && venv/bin/mypy scripts/analysis/sync_configs.py`
- **Guardrail:** `market.dividendYield` from `yfinance` is stored in **percentage
  points** (`0.32` for `GOOG`, `1.56` for `VT`) — always divide by `100.0`
  before compounding and clamp to `[0.0, 0.25]`.

---

### WO2 `[low]` — Emit compact per-ticker `data/analysis/<SYM>.history.json` in `sync_configs.py` and fix orphan cleanup

- **File:** `scripts/analysis/sync_configs.py` and new
  `tests/python/test_sync_configs_history.py`
- **Find (1):**

    ```python
        if hasattr(ticker, "history"):
            try:
                history = ticker.history(period='1y', interval='1d')
                closes = history['Close'].pct_change().dropna()
                if not closes.empty:
                    result_metadata['volatility'] = float(
                        closes.std() * (252**0.5)
                    )  # Assigned to new variable
            except Exception as e:
                logging.warning(f"Failed to calculate volatility for {ticker}: {e}")
    ```

- **Find (2):**

    ```python
        for path in ANALYSIS_DIR.glob('*.json'):
            if path.name in ('index.json', 'watchlist.json', 'event_flags.json'):
                continue
            if path.stem not in tracked_symbols:
                path.unlink()
    ```

- **Find (3):**

    ```python
        index_payload = {
            'tickers': [
                {
                    'symbol': symbol,
                    'name': configs_cache.get(symbol, {}).get('name', symbol),
                    'path': f"../data/analysis/{symbol}.json",
                }
                for symbol in tracked_symbols
            ]
        }
        save_json(INDEX_FILE, index_payload)
    ```

- **Change:**
    1. Fix the orphan-cleanup loop (`Find (2)`) so `theme_timeline.json` is
       preserved and `*.history.json` files check
       `path.name[:-len('.history.json')] not in tracked_symbols` instead of
       `path.stem not in tracked_symbols` (without this fix, every
       `sync_configs` run — especially `--ticker <SYM>` scoped runs — would
       delete all `<SYM>.history.json` files).
    2. Add a helper `build_ticker_history(symbol, ticker)` that fetches 2Y
       weekly closing prices (`period='2y', interval='1wk'`, falling back to
       `data/historical_prices.json` when offline/mocked) and merges positive
       point-in-time quarterly TTM EPS points strictly from
       `data/checkpoints/fetched_eps_cache.json` (sorted ascending by date,
       filtered to `eps > 0`).
    3. Write `data/analysis/<SYM>.history.json` with schema
       `{"symbol", "asOf", "prices": [{"d": "YYYY-MM-DD", "c": float}], "eps": [{"d": "YYYY-MM-DD", "v": float}]}`
       for every symbol in `tracked_symbols` (respecting `--ticker <SYM>` scoped
       mode so untouched tickers keep their existing `.history.json`).
    4. Add `"historyPath": f"../data/analysis/{symbol}.history.json"` to each
       entry in `index_payload['tickers']`.
    5. Add unit tests in `tests/python/test_sync_configs_history.py` covering
       `.history.json` schema, `fetched_eps_cache.json` filtering (`eps > 0`),
       offline fallback, and orphan cleanup preserving tracked `*.history.json`
       and `theme_timeline.json` under both full and `--ticker` runs.
    6. Run `venv/bin/python -m scripts.analysis.sync_configs` to generate the
       `data/analysis/*.history.json` files and updated `data/analysis/*.json` /
       `index.json`.
- **Verify:** `venv/bin/pytest tests/python/ -k sync_configs && venv/bin/python -m scripts.analysis.sync_configs && ls -lh data/analysis/*.history.json`
- **Guardrail:** Never invert `pe_ratio.json` `ticker_pe` for `VT` (its P/E is
  stored flat at `17.72`, which would make fair value circularly track price);
  leave `eps: []` when `fetched_eps_cache.json` has no positive history for a
  ticker (`VT`, `AEHR`, `CBRS`) so the chart cleanly selects horizontal 1Y
  bands.

---

### WO3 `[design]` — Build the pure-JS 3-Gate Decision Engine, GH-7 Kelly, and Python↔JS parity test

- **File:** New module `js/pages/analysis/decision.js`, math updates in
  `js/pages/analysis/lab.js`, new `tests/js/pages/analysis/decision.test.js`,
  and cross-language parity test `tests/python/test_analysis_math_parity.py` (or
  shared fixture checked by both Jest and pytest)
- **Find (1, `js/pages/analysis/lab.js`):**

    ```javascript
    function computeDerivedScenarioOutcome(
        scenario,
        base,
        price,
        eps,
        horizon,
        safeHorizon,
        entryEps,
        fallbackEpsCagr
    ) {
        const growth = scenario.growth || {};
        const valuation = scenario.valuation || {};
        const epsCagr = extractOutcomeNumber(growth.epsCagr ?? scenario.epsCagr, 0);
        const exitPe = extractOutcomeNumber(valuation.exitPe ?? scenario.exitPe, 1);
        const terminalEps = eps * (1 + epsCagr) ** horizon;
        const terminalPrice = terminalEps * exitPe;
        const multiple = price > 0 ? terminalPrice / price : 0;
        const priceCagr = multiple > 0 ? multiple ** (1 / safeHorizon) - 1 : 0;
    ```

- **Find (2, `js/pages/analysis/lab.js`):**

    ```javascript
    const DEFAULT_RISK_FREE_RATE = 0.04;
    const KELLY_FRACTION_CAP = 10;
    ```

- **Change:**
    1. In `js/pages/analysis/lab.js`:
        - Guard `computeDerivedScenarioOutcome` against effective `eps <= 0`
          (return `multiple: 0, priceCagr: 0, terminalEps: 0, terminalPrice: 0`
          instead of negative prices for `CBRS`), and multiply `terminalPrice`
          by `divFactor = (1 + divRate) ** horizon` where
          `divRate = clamp((dividendYield || 0) / 100, 0, 0.25)` (passed from
          `config.market.dividendYield` into `computeScenarioOutcome`).
        - Update `KELLY_FRACTION_CAP = 1` (long-only unleveraged) and expand
          `buildKellyReturns(outcomes, volatility)` with the exact same 7-point
          Gauss–Hermite constants as WO1 (`GH7_NODES`, `GH7_WEIGHTS`) whenever
          `volatility > 0`:
          `ret = (1 + outcome.priceCagr) * Math.exp(volatility * z - 0.5 * volatility * volatility) - 1`.
          Keep `computeGeometricCagr` and `computeScenarioVolatility` operating
          on the unexpanded scenario `outcomes` (and expose `terminalPrice` on
          each outcome) while `solveKellyFraction` operates on the GH-7 expanded
          pairs.
        - Never read `config.derived.kelly` or `config.position.maxKellyWeight`
          as sizing inputs.
    2. Create `js/pages/analysis/decision.js` exporting pure functions:
        - `getLatestJournalEntry(journal)` — returns newest entry sorted
          ascending by ISO `date` (fixing `GOOG`'s reverse-sorted array).
        - `computeIsoCagrBands(expectedTerminalPrice, horizon, { targetCagr, benchmark, riskFreeRate = 0.04, strongCagr = targetCagr + 0.05 }, t = 0)`
          — returns `{ strongBuy, buy, fair, sell }` at any time offset
          `t ∈ [0, horizon]` via $V(r, t) = E[P_T] / (1 + r)^{T - t}$
          (returning `null` when `expectedTerminalPrice <= 0` or `horizon <= t`).
        - `evaluateTickerDecision(config, metrics, { currentWeight = 0, eventFlags = [], nowMs = Date.now() })`
          — implements the 3-Gate Decision Engine (§4.2) with proportional
          deadband `delta = Math.max(0.005, 0.10 * maxWeight)`, `Geo >= targetCagr`
          guard on `DEEP_VALUE`, `TRIM · OVER KELLY` when
          `currentWeight > targetWeight + delta`, Rich-zone target
          `Math.min(targetWeight, maxWeight * 0.5)`, `nextTrigger` /
          `triggerDistancePct` / `nearBoundary` (`Math.abs(triggerDistancePct) < 0.02`),
          and staleness flag (`> 7d` on `marketDataUpdatedAt` or overdue
          `review-date` / prediction). Returns:
          `{ gate1Broken, code, label, tone, zone, flags, isStale, targetWeight, maxWeight, weightDelta, deadband, bands, nextTrigger, triggerDistancePct, nearBoundary, scenarioSplit, confidence, sortPriority }`.
        - `buildDecisionSnapshot(decision, config, metrics)` and
          `buildBoardSnapshot(rows, { totalTargetWeight, totalCurrentWeight })`
          — compact terminal scrollback summaries.
    3. Add `tests/js/pages/analysis/decision.test.js` asserting all 6 post-WO1
       ticker verdicts (`GOOG` `ADD`, `ANET` `TRIM · OVER KELLY` + `nearBoundary`,
       `PDD` `TRIM · OVER KELLY`, `VT` fixed `HOLD · AT TARGET`, `AEHR`
       `BUY · INITIATE (≤0.9%)` + event flag + `Geo` downgrade from `STRONG BUY`,
       `CBRS` `AVOID · THESIS BROKEN` via `CLOSE_LONG`/`RETIRED`/`eps <= 0`),
       plus Rich-zone trim target and `>7d` staleness flag.
    4. Add a **Python↔JS math parity test** (e.g., comparing `recompute_derived`
       in `sync_configs.py` against `computeMetrics` in `lab.js` across the
       live `data/analysis/*.json` snapshots or a shared fixture, asserting
       `expectedMultiple`, `expectedCagr`, `fullKelly`, and `scaledKelly` agree
       within `1e-4`).
- **Verify:** `npx jest tests/js/pages/analysis/decision.test.js && npx eslint js/pages/analysis/decision.js && venv/bin/pytest tests/python/test_sync_configs_derived.py`
- **Guardrail:** Keep `decision.js` 100% DOM-free and side-effect free (accept
  `nowMs` as an argument rather than reading wall-clock time implicitly) so it
  remains deterministic under `TZ=UTC` Jest tests and easy to mutation-test.
  Gate 1 must test _effective_ EPS (after `overrides.eps`) and must **not**
  treat `derived.fairValueRange` as an escape hatch.

---

### WO4 `[design]` — Build the DPR-scaled Valuation Corridor + Forward Scenario Fan canvas with hover crosshair

- **File:** New module `js/pages/analysis/decisionChart.js` and unit test suite
  `tests/js/pages/analysis/decisionChart.test.js`
- **Find:** New module; imports `computeIsoCagrBands` from `./decision.js`,
  currency conversion helpers (`convertValueToCurrency`, `formatCurrency`) from
  `../../transactions/utils.js`, and `getSelectedCurrency` from
  `../../transactions/state.js`. Reuse the DPR backing-store guard pattern from
  `js/transactions/chart.js:75-93` and the greedy collision invariant
  (`minSpacingPixels = Math.floor(fontSize)`) from
  `docs/y-axis-tick-algorithm.md`.
- **Change:** Create `js/pages/analysis/decisionChart.js` split cleanly into
  **pure geometry / hit-testing** (DOM-free, 100% unit-testable) and **canvas
  painting / pointer lifecycle**:
    1. **Typography & padding constants:**
        - `const CHART_FONT_SIZE = 10;` (`10px "JetBrains Mono", monospace`,
          ~`6px/char`).
        - Default `padding = { top: 16, right: 132, bottom: 22, left: 54 }` (the
          `132px` right margin fits compact 20-char endpoint labels such as
          `Bull 20% $402 →$1.8k` ≈ `120px` without clipping or colliding with
          iso-CAGR tags, which are anchored at `TODAY`).
    2. **Export `computeLogTicks(minPrice, maxPrice, plotHeight, yScale, fontSize = CHART_FONT_SIZE, anchorPrice)`:**
        - Generate nice log-spaced candidates across decades
          `{1, 1.5, 2, 3, 5, 7} * 10^k` spanning `[minPrice, maxPrice]`, plus
          `anchorPrice` (current `P0`, priority `0`), outer bounds (priority
          `1`), and grid candidates (priority `2`).
        - Greedily pack ticks in priority order `0 → 1 → 2` (within priority 2,
          descending value), rejecting any tick within
          `Math.floor(fontSize)` px of an already-accepted tick
          (`y-axis-tick-algorithm.md`).
    3. **Export `buildDecisionChartGeometry({ config, history, decision, metrics, horizonMode = '2y', width, height, padding })`:**
        - **Mode selection:**
            - `'thesis-broken'` when `decision.gate1Broken === true` (suppress
              valuation bands; draw 2Y historical price + muted `THESIS BROKEN`
              watermark).
            - `'eps-corridor'` when `history.eps` has `>= 2` positive points
              overlapping the 2Y past window (`ANET`, `GOOG`, `PDD`). Let
              `epsHistAtToday` be the latest positive `history.eps` entry on or
              before `todayMs`; normalize today's multiples by
              `M(r) = bandToday[r] / epsHistAtToday` (NOT `market.eps`) and
              multiply each historical week's step-held point-in-time `eps(d)`
              by `M(r)`. This guarantees **zero discontinuity at `TODAY`**
              between past corridor edges and forward iso-CAGR curves.
            - `'horizontal-bands'` fallback when positive historical EPS is
              absent (`VT`, `AEHR`): plot 1Y historical prices (`pastYears = 1`)
              over horizontal current-thesis bands `[strongBuy, buy, fair, sell]`.
        - **Proportional X-axis split (uniform in `2y` mode):**
            - `pastYears = mode === 'horizontal-bands' ? 1 : 2`,
              `futureYears = horizonMode === 'full' ? horizon : Math.min(2, horizon)`.
            - `naturalSplit = pastYears / (pastYears + futureYears)`;
              `splitRatio = Math.min(0.60, Math.max(0.30, naturalSplit))`;
              `hasScaleBreak = Math.abs(splitRatio - naturalSplit) > 0.02`.
            - `xToday = padding.left + plotWidth * splitRatio`.
            - Past window maps `[todayMs - pastSpanMs, todayMs]` →
              `[padding.left, xToday]`; future window maps `[0, futureYears]` →
              `[xToday, padding.left + plotWidth]`.
        - **Forward curves & scenario rays:**
            - Sample 25 evenly spaced offsets `t ∈ [0, futureYears]`.
            - Iso-CAGR curves: call `computeIsoCagrBands(expectedTerminalPrice, horizon, bandOpts, t)`
              for `r ∈ {strongBuy, buy, fair, sell}`.
            - Scenario rays (Bull / Base / Bear): geometric interpolation from
              `P0` at `t = 0` along each scenario's annualized total-return
              CAGR (`P_i(t) = P0 * (1 + outcome.priceCagr) ** t`), storing
              `prob`, `endPrice` at `t = futureYears`, and `terminalPrice` at
              `t = T`, plus `hasDividends = (config.market?.dividendYield || 0) > 0`
              for the forward header disclosure.
        - **Log Y-axis bounds (`yMin`, `yMax`):**
            - First compute `coreMin` and `coreMax` strictly over positive
              values in **historical closes, `todayPrice`, and visible future
              scenario rays**.
            - Include visible iso-CAGR curve values clamped to
              `[0.35 * coreMin, 3.0 * coreMax]` (so distant outlier bands
              cannot compress the price/scenario curves), pad by `±8%` in log
              space, and return
              `yScale(v) = padding.top + plotHeight * (1 - (Math.log(v) - logMin) / (logMax - logMin))`.
        - **Direct right-edge label packing:** Pack only the 3 scenario endpoint
          labels (`Bull 20% $402 →$1.8k`, Base, Bear) with greedy vertical
          nudging (`minGap = 12px`, clamped inside
          `[padding.top + 6, padding.top + plotHeight - 6]`).
    4. **Export `resolveCrosshairHit(pointerX, geometry)`:**
        - Return `null` when `pointerX` lies outside `[plotLeft, plotRight]`.
        - **Past (`pointerX <= xToday`):** Binary-search nearest weekly point in
          `geometry.pricePoints`; compute which valuation zone the price sat in
          on that date (via the point's normalized band values) and return
          `{ side: 'past', x, y, date, price, zoneLabel }`.
        - **Future (`pointerX > xToday`):** Compute fractional
          `yearsAhead = ((pointerX - xToday) / futureWidth) * futureYears`,
          evaluate Bull / Base / Bear prices and the iso-CAGR band prices at
          `yearsAhead`, and return
          `{ side: 'future', x: pointerX, yearsAhead, bull, base, bear, buyBand, fairBand, hasScaleBreak, hasDividends }`.
    5. **Export `renderDecisionChart(canvas, payload, colors, crosshairHit = null)`:**
        - DPR guard: read `rect = canvas.getBoundingClientRect()`; bail cleanly
          if `rect.width === 0 || rect.height === 0`; resize backing store to
          `Math.round(rect.width * dpr) × Math.round(rect.height * dpr)` with
          `dpr = Math.min(window.devicePixelRatio || 1, 2)` and call
          `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`. Set
          `ctx.font = '${CHART_FONT_SIZE}px "JetBrains Mono", monospace'`.
        - Painter's order:
            1. Valuation zone fills (`--green-color` 14% Deep Value, 8% Buy,
               transparent Fair, `--primary-color` 9% Rich, `--red-color` 12%
               Overvalued; skipped in `'thesis-broken'` mode) + compact inline
               zone tags (`DEEP`, `BUY`, `FAIR`, `RICH`, `SELL`) anchored
               immediately left of the `TODAY` hairline (so they always match
               today's prices and never collide with right-edge labels).
            2. Faint log Y-axis gridlines, Y-axis currency labels (converted
               via `LATEST_FX_DATE = '9999-12-31'`), and X-axis year/offset
               labels (`2025`, `2026`, `TODAY`, `+1Y`, `+2Y` / `+T`), plus a
               `//` scale-break glyph at `TODAY` when `geometry.hasScaleBreak`.
            3. Dashed iso-CAGR boundary lines (`Buy`, `Fair`, `Sell`) + muted
               watermarks: bottom-left `Thesis×EPS` (or `Current bands`),
               top-right `Forward ${futureYears}Y TR (div. reinvested)` when
               `hasDividends` else `Forward ${futureYears}Y Scenarios`, and
               subtle `Scenario range (3 states)` inside the envelope.
            4. Lightly shaded Bear–Bull envelope (`rgba(..., 0.07)`) + 3
               probability-weighted scenario rays (Base `2px` solid gold, Bull
               `1.25px` dashed green, Bear `1.25px` dashed red) + right-edge
               packed labels (`Bull 20% $402 →$1.8k`).
            5. Crisp vertical `TODAY` hairline + `2px` historical price polyline
                - highlighted `TODAY` dot.
            6. If `crosshairHit` is non-null: dashed vertical crosshair line,
               snapped marker dot(s), and a compact glass-dark floating readout
               box clamped inside the plot bounds.
        - Update `canvas.setAttribute('aria-label', ...)` with the ticker's
          verdict, price, buy band, next trigger, and `E[CAGR]`.
    6. **Export `attachDecisionChartInteractions(canvas, getRenderArgs)`:**
        - Attach `pointermove` (throttled via `requestAnimationFrame` to call
          `resolveCrosshairHit` + `renderDecisionChart`), `pointerleave`
          (clears crosshair), and a `ResizeObserver` (redraws on resize/reveal).
        - Return a `detach()` cleanup function; store on the canvas/controller
          so re-initialization never duplicates listeners.
    7. **Tests (`tests/js/pages/analysis/decisionChart.test.js`):**
        - Verify all 3 corridor modes (`GOOG`/`ANET` `'eps-corridor'`,
          `VT`/`AEHR` `'horizontal-bands'`, `CBRS` `'thesis-broken'`).
        - Verify **zero discontinuity at `TODAY`** in `'eps-corridor'` mode
          even when latest `history.eps` differs from `market.eps` (e.g., `PDD`
          `10.13` vs `9.07`).
        - Verify uniform time scale (`hasScaleBreak === false`) in `2y` mode
          and `hasScaleBreak === true` on `GOOG` `full` (`10y`).
        - Verify log-scale ratio symmetry (`yScale(200) - yScale(100) ≈
yScale(400) - yScale(200)`).
        - Verify relative horizon scaling (`yMax_2y < yMax_full` and
          `yMax_full >= terminalBullPrice` on 10y `GOOG` — no brittle hardcoded
          constant).
        - Verify `computeLogTicks` never violates `|y_i - y_j| >= fontSize`.
        - Verify `resolveCrosshairHit` snaps past dates and interpolates future
          scenario rays, and verify `renderDecisionChart` executes cleanly
          against a stub 2D canvas context (including `0×0` bailout).
- **Verify:** `npx jest tests/js/pages/analysis/decisionChart.test.js && npx eslint js/pages/analysis/decisionChart.js`
- **Guardrail:** Never draw over a `0×0` backing store (pane starts `.is-hidden`
  — bail on `rect.width === 0` and redraw via `ResizeObserver` on reveal), and
  never plot cost basis or trade markers.

---

### WO5 `[design]` — Replace the 9-section `lab.js` UI with the 2-view Decision Board + Decision Chart and prune dead code

- **File:** `js/pages/analysis/lab.js`, `js/pages/analysis/bayes.js`, delete
  `js/pages/analysis/monte_carlo.worker.js` and
  `tests/js/pages/analysis/monte_carlo.worker.test.js`, update
  `tests/js/pages/analysis/bayes.test.js` and `tests/js/pages/analysis/lab*.test.js`
- **Find (1, `js/pages/analysis/lab.js:95-106`):**

    ```javascript
    const ANALYSIS_SECTIONS = [
        'overview',
        'scenarios',
        'value',
        'kelly',
        'mc',
        'belief',
        'evidence',
        'predictions',
        'journal',
    ];
    ```

- **Find (2, `js/pages/analysis/lab.js:2756-2769`):**

    ```text
        const validConfigs = configs.filter(Boolean);
        let totalValue = 0;
        for (let i = 0; i < validConfigs.length; i++) {
            totalValue += validConfigs[i].marketValue;
        }
        validConfigs.forEach((cfg) => {
            cfg.weight = totalValue > 0 ? cfg.marketValue / totalValue : 0;
        });

        const portfolioConfig = buildPortfolioConfig(validConfigs);
        const ordered = portfolioConfig ? [portfolioConfig, ...validConfigs] : validConfigs;
        state.configs = ordered;
        state.activeSymbol = ordered.length ? ordered[0].symbol : null;
    ```

- **Find (3, `js/pages/analysis/lab.js:2832-2862`):**

    ```javascript
    export function showAnalysisSection(name) {
        const target = ANALYSIS_SECTIONS.includes(name) ? name : 'overview';
        state.activeSection = target;
        if (!paneRoot) {
            return;
        }
        paneRoot.querySelectorAll('[data-analysis-section]').forEach((section) => {
            section.classList.toggle('is-hidden', section.dataset.analysisSection !== target);
        });
        updateContextMeta();
        checkPaneViewportFit();
    }

    export function setActiveAnalysisSymbol(symbol) {
        const config = state.configs.find((cfg) => cfg.symbol === symbol);
        if (!config) {
            return false;
        }
        state.activeSymbol = config.symbol;
        renderContextStrip();
        renderActiveTicker();
        return true;
    }
    ```

- **Change:**
    1. **Prune `js/pages/analysis/bayes.js` & delete MC worker:**
        - Delete `js/pages/analysis/monte_carlo.worker.js` and
          `tests/js/pages/analysis/monte_carlo.worker.test.js`.
        - Trim `js/pages/analysis/bayes.js` to export only
          `computeBrierScore(predictions = [])` (pure function; remove
          `BayesianEngine` class, `parseJsonl`, `filterValidEvidence`, and
          `applyParameterPosteriors`), and update
          `tests/js/pages/analysis/bayes.test.js` to test `computeBrierScore`.
    2. **Replace `ANALYSIS_SECTIONS` and `PANE_MARKUP` in `lab.js`:**
        - Set `const ANALYSIS_SECTIONS = ['board', 'ticker'];`.
        - Replace `PANE_MARKUP` with the minimal 2-section shell:

            ```html
            <div class="pane-context" id="paneContext"></div>
            <div class="analysis-stage" tabindex="0">
                <div class="output-grid">
                    <section data-analysis-section="board" class="decision-board-section">
                        <div
                            class="decision-board"
                            id="decisionBoard"
                            role="table"
                            aria-label="Portfolio decision board"
                        ></div>
                        <div class="board-budget-footer" id="boardBudgetFooter"></div>
                    </section>
                    <section
                        data-analysis-section="ticker"
                        class="decision-ticker-section is-hidden"
                    >
                        <div class="verdict-strip" id="verdictStrip"></div>
                        <div class="decision-chart-wrap">
                            <canvas
                                id="decisionChartCanvas"
                                class="pane-canvas"
                                role="img"
                                aria-label="Ticker valuation corridor and decision chart"
                            ></canvas>
                        </div>
                        <div class="sizing-bullet" id="sizingBullet"></div>
                        <div class="risk-footer" id="riskFooter"></div>
                    </section>
                </div>
            </div>
            ```

    3. **Streamline `buildConfigs()` data loading, live prices & normalized weights:**
        - Fetch `index.json`, `event_flags.json`, `holdings_details.json`, and
          `fetchRealTimeData().catch(() => null)`
          (`js/transactions/realtimeData.js:130-214`) in parallel; drop
          `.evidence.jsonl` and thesis-markdown fetches.
        - Per index entry, fetch `<SYM>.json` and `<SYM>.history.json` (falling
          back to `{ prices: [], eps: [] }` if `.history.json` fails).
        - **Normalized live weights & live prices (critical):** Note that
          `realTimeData.tickerWeights[sym]` stores **USD market value**, NOT a
          portfolio fraction (`js/transactions/realtimeData.js:99`). Resolve
          `cfg.weight` from the matching `realTimeData.composition` entry's
          `percent / 100` (or `realTimeData.tickerWeights[sym] / realTimeData.balance`
          when `balance > 0`), falling back to `cfg.marketValue / totalValue`;
          store `state.portfolioTotalValue = realTimeData?.balance || totalValue`.
          When `realTimeData?.prices?.[sym] > 0` and no `overrides.price` is
          set, apply the live price onto `cfg.market.price` (tagging
          `cfg.priceSource = 'live'`) so `P0`, `E[CAGR]`, bands, and Kelly stay
          synchronized with live `w_curr`.
        - Compute `cfg.metrics = computeMetrics(cfg)` and
          `cfg.decision = evaluateTickerDecision(cfg, cfg.metrics, { currentWeight: cfg.weight, eventFlags: flagsBySymbol[cfg.symbol] })`.
        - Remove `buildPortfolioConfig`, `aggregateScenarios`,
          `CORRELATION_MAP`, `computePortfolioCovarianceVolatility`, and all 9
          legacy DOM/canvas renderers (`renderSummary`, `renderScenarioCards`,
          `renderValueBands`, `renderKellyCurve`, `renderBeliefState`,
          `renderEvidenceTimeline`, `renderPredictions`,
          `renderDecisionJournal`, `renderBayesOutput`, `renderMonteCarloResults`,
          `runMonteCarloSimulation`, `applyBayesSandbox`).
    4. **Implement the 2 view renderers (XSS-safe `createElement`/`textContent`):**
        - `renderDecisionBoard()`: renders header row + all tickers sorted by
          `decision.sortPriority` ascending, each row displaying: `symbol` |
          verdict pill (`.verdict-pill--<tone>`) | 60px inline mini Valuation
          Position bar (dot position of `P0` across `[strongBuy..sell]`, or
          `n/a` if `gate1Broken`) | `E[CAGR]` (`tabular-nums`) | 68px inline
          mini Sizing Bullet (`w_curr` bar + `w_rec` tick) | `scenarioSplit` +
          `Conf %` + any `⚑` flag indicator. Populate `#boardBudgetFooter` with
          `Σ w_curr`, `Σ w_rec`, cash headroom (`100% − Σ w_rec`), and an amber
          budget warning when `Σ w_rec > 100%`. Non-clickable (keyboard-only).
        - `renderTickerDecision(config)`:
            - **Layer 1 (`#verdictStrip`):** `SYM · Name`, verdict pill (e.g.,
              `ADD +5.3% to cap` or `TRIM · OVER KELLY -23.6%`), `E[CAGR]`,
              `nextTrigger` (`Fair > $306 (+11.4%)` with subtle marker if
              `nearBoundary`), `scenarioSplit` + `Conf %` (`20/60/20 c80%`),
              optional `⚑` flag/staleness badge.
            - **Layer 2 (`#decisionChartCanvas`):** calls
              `renderDecisionChart(canvas, payload, PANE_CHART_COLORS)` and
              wires `attachDecisionChartInteractions` once at init.
            - **Layer 3 (`#sizingBullet` + `#riskFooter`):** renders Stephen
              Few bullet scaled to `max(w_max * 1.25, w_curr * 1.15, 0.10)`
              with `[0..w_rec]`, `[w_rec..w_max]`, `[w_max..scaleMax]` zones,
              `w_curr` bar, `w_rec` marker, `w_max` dashed cap, and text
              `19.7% / 25.0% target (+5.3% · +$70k) · ½K 33%` (printing
              `½K ≥50% (cap)` when `fullKelly >= 0.999`); renders single risk
              footer line with `Bear CAGR`, `Geo CAGR`, `52w range`, prediction
              count + `computeBrierScore` value, latest journal review date
              (via `getLatestJournalEntry`), and muted command hint
              (`an <SYM> full | an | an close`).
        - `renderContextStrip()`: compact (`24px`) read-only strip showing
          `PORT` + all tracked symbols with `aria-current="true"` on active
          symbol and `#contextMeta` displaying `BOARD · <asOf>` or
          `2Y · <asOf>` / `FULL <T>Y · <asOf>`.
    5. **Clean public exports of `js/pages/analysis/lab.js` (with temporary WO6
       transition shims):**
        - `initAnalysisPane(rootEl, { autoLoad = true } = {})`
        - `showDecisionBoard()` → activates `board`, sets `activeSymbol = 'PORT'`,
          renders board + budget footer + context strip, runs
          `checkPaneViewportFit()`, returns `buildBoardSnapshot(...)`.
        - `showTickerDecision(symbol, { horizonMode = '2y' } = {})` → looks up
          symbol (returns `null` if unknown), sets `activeSymbol`,
          `horizonMode`, activates `ticker`, renders Layers 1–3 + context strip,
          runs `checkPaneViewportFit()`, returns `buildDecisionSnapshot(...)`.
        - `getAnalysisSymbols()`, `getActiveAnalysisConfig()` (returns `null`
          when `activeSection === 'board'` since synthetic `PORT` config is
          retired), `checkPaneViewportFit()`, `fetchJson()`, and slimmed
          `__analysisLabTesting`.
        - Retain thin one-line compatibility shims for `showAnalysisSection`,
          `setActiveAnalysisSymbol`, and `buildAnalysisSnapshot` (delegating to
          `showDecisionBoard` / `showTickerDecision`) strictly for the
          intermediate WO5 commit so `handlers/analysis.js` never breaks before
          WO6 deletes those shims.
        - Update `currencyChangedGlobal` listener to re-render the active view
          (`board` or `ticker`) after `whenTransactionDataReady()`.
    6. **Tests:** Consolidate and update `tests/js/pages/analysis/` to cover
       core Fermat–Pascal / GH-7 Kelly math (including reinvested
       `dividendYield` and `eps <= 0` guard), `board` sorting + budget footer,
       `ticker` 3-layer DOM rendering + `2y`/`full` horizon switching,
       `fetchRealTimeData()` normalized fraction + live price wiring (explicitly
       verifying USD `tickerWeights` values are divided by `balance`, never
       used raw!) + `holdings_details.json` fallback, currency re-render, and
       `checkPaneViewportFit()`.
- **Verify:** `npx jest tests/js/pages/analysis/ && make depcheck && ! rg -n "monte_carlo|BayesianEngine|applyBayesSandbox" js/ tests/`
- **Guardrail:** The negated `! rg -n ...` command MUST exit 0 (zero remaining
  references to `monte_carlo.worker`, `BayesianEngine`, or `applyBayesSandbox`
  across `js/` and `tests/`). Preserve `currencyChangedGlobal` gating on
  `whenTransactionDataReady()` (`docs/terminal-data-readiness.md`).

---

### WO6 `[low]` — Simplify terminal command grammar, help text, ticker autocomplete, and remove WO5 shims

- **File:** `js/transactions/terminal/constants.js`,
  `js/transactions/terminal/autocomplete.js`,
  `js/transactions/terminal/handlers/analysis.js`,
  `js/transactions/terminal/handlers/help.js`,
  `js/pages/analysis/lab.js` (remove WO5 shims), and
  `tests/js/transactions/terminal/handlers/analysis.test.js` +
  `tests/js/transactions/terminal/autocomplete.test.js` +
  `tests/js/transactions/terminal/handlers/help.test.js`
- **Find (1, `constants.js:80-93`):**

    ```javascript
    export const ANALYSIS_SUBCOMMANDS = [
        'scenarios',
        'value',
        'kelly',
        'belief',
        'evidence',
        'predictions',
        'journal',
        'mc',
        'bull',
        'bear',
        'reset',
        'close',
    ];
    ```

- **Find (2, `autocomplete.js:43-48`):**

    ```javascript
    function getAnalysisMatches(parts) {
        const subPrefix = parts[1] ? parts[1].toLowerCase() : '';
        return subPrefix
            ? ANALYSIS_SUBCOMMANDS.filter((cmd) => cmd.startsWith(subPrefix))
            : ANALYSIS_SUBCOMMANDS;
    }
    ```

- **Find (3, `handlers/analysis.js:19-32`):**

    ```javascript
    // Function subcommands mapped to their pane section — each function code
    // gets its own screen (Bloomberg model), nothing jammed into one view.
    const SECTION_BY_SUBCOMMAND = {
        scenarios: 'scenarios',
        value: 'value',
        kelly: 'kelly',
        belief: 'belief',
        evidence: 'evidence',
        predictions: 'predictions',
        journal: 'journal',
    };

    const USAGE_LINE =
        'Usage: analysis [scenarios|value|kelly|belief|evidence|predictions|journal|mc [paths]|bull|bear|reset|close] or analysis <TICKER>';
    ```

- **Find (4, `handlers/help.js:23-27`):**

    ```javascript
                '  analysis (an)      - Analysis lab: scenarios, Kelly sizing, Monte Carlo, beliefs\n' +
                '                       Use "analysis" or "an"; optional ticker selects security context\n' +
                '                       Subcommands: scenarios, value, kelly, belief, evidence,\n' +
                '                                    predictions, journal, mc, bull, bear, reset, close\n' +
                '                       Examples: analysis, an ANET, analysis kelly, analysis mc 20000\n' +
    ```

- **Change:**
    1. Set `ANALYSIS_SUBCOMMANDS = ['close']` (plus
       `ANALYSIS_HORIZON_FLAGS = ['full']`) in `constants.js`.
    2. Update `getAnalysisMatches(parts)` in `autocomplete.js` to suggest
       loaded/indexed ticker symbols (case-insensitive prefix match) plus
       `'close'` for `parts[1]`, and `'full'` for `parts[2]` when `parts[1]` is
       a ticker.
    3. Simplify `handleAnalysisCommand` in `handlers/analysis.js` to accept
       only: `analysis` / `an` (calls `lab.showDecisionBoard()` + prints board
       triage snapshot), `an <TICKER>` (calls
       `lab.showTickerDecision(sym, { horizonMode: '2y' })` + prints verdict
       snapshot), `an <TICKER> full` (calls
       `lab.showTickerDecision(sym, { horizonMode: 'full' })`), and `an close`
       (hides pane). Remove `SECTION_BY_SUBCOMMAND`, `handleMonteCarlo`, and
       `handleSandbox`, and delete the temporary WO5 compatibility shims from
       `js/pages/analysis/lab.js`.
    4. Update `USAGE_LINE` and `handlers/help.js` to document the 3 commands:
       `analysis`, `an <TICKER> [full]`, and `an close`.
    5. Update matching unit tests AND add a real-import export contract test in
       `tests/js/transactions/terminal/handlers/analysis.test.js` asserting
       every `lab.*` method invoked by `handlers/analysis.js` (`initAnalysisPane`,
       `showDecisionBoard`, `showTickerDecision`, `getAnalysisSymbols`,
       `getActiveAnalysisConfig`) is genuinely exported by
       `@pages/analysis/lab.js`.
- **Verify:** `npx jest tests/js/transactions/terminal/handlers/analysis.test.js tests/js/transactions/terminal/autocomplete.test.js tests/js/transactions/terminal/handlers/help.test.js`
- **Guardrail:** Keep lazy-loading `import('@pages/analysis/lab.js')` in
  `handlers/analysis.js`; cache the ticker symbol list on `index.json` load or
  expose a lightweight getter so `Tab` autocomplete works without eagerly
  importing `lab.js` on page load.

---

### WO7 `[visual]` — Style the 2-view Decision pane, update layout gate, and visually verify over liquid glass

- **File:** `css/terminal/analysis.css` and `scripts/check_analysis_pane_layout.mjs`
- **Find (1, `css/terminal/analysis.css:1-7`):**

    ```css
    /* Analysis lab pane, scoped for embedding in the terminal page.
       Minimalist by design: flat text on the .chart-card glass, hairline
       dividers, small-caps muted labels, gold reserved for the active state.
       One function code per screen — each section is small enough to stay
       fully inside the pane; the stage scrolls internally as a safety net.
       All colors and fonts resolve to the terminal tokens
       (css/terminal/base.css); the pane owns no parallel palette. */
    ```

- **Find (2, `scripts/check_analysis_pane_layout.mjs:165-180`):**

    ```text
            await visit('overview', 'analysis');
            await visit('scenarios', 'analysis scenarios');
            await visit('value', 'analysis value');
            await visit('kelly', 'analysis kelly');
            await visit('mc-error-pane', 'analysis mc');
            await visit('belief', 'analysis belief');
            await visit('evidence', 'analysis evidence');
            await visit('predictions', 'analysis predictions');
            await visit('journal', 'analysis journal');

            // Single-ticker context (full scenario blocks): drive a complete
            // Monte Carlo run and measure the rendered result, not just the
            // pending state.
            await visit('anet-overview', 'analysis anet');
            await visit('anet-mc', 'analysis mc');
            await waitForMonteCarlo(page);
    ```

- **Change:**
    1. Replace the legacy 9-section styles in `css/terminal/analysis.css` with
       compact `.analysis-pane`-scoped styles honoring §4.1's `320px` pixel
       budget: `#paneContext` `24px` (`line-height: 24px`), `.analysis-stage`
       padding `8px 16px 10px`, `.decision-ticker-section` `gap: 6px`,
       `#verdictStrip` `26px`, `.decision-chart-wrap` `flex: 1 1 auto;
min-height: 160px`, `#sizingBullet` `22px`, `#riskFooter` `20px`, and
       Decision Board table (6 rows + header + `#boardBudgetFooter` inside
       `320px`) — using only existing `css/terminal/base.css` tokens.
    2. Update `scripts/check_analysis_pane_layout.mjs` to remove the 9 legacy
       visits + `waitForMonteCarlo` and instead gate viewport fit
       (`overflow <= 1px`) and non-empty render (`#verdictStrip` /
       `#sizingBullet` visible, `canvas.width > 0 && canvas.height > 0` on
       ticker views) at `1280×580` across `analysis` (`PORT` board),
       `analysis goog`, `analysis goog full`, `analysis anet`, `analysis pdd`,
       `analysis vt`, `analysis aehr`, and `analysis cbrs`.
    3. Run `make analysis-layout-check`, `make screenshot URL=/terminal/`, and
       inspect rendered PNGs in Chromium (verifying glass contrast over
       `terminal_background.jpg`) before handoff for human visual review.
- **Verify:** `npx stylelint css/terminal/analysis.css && make analysis-layout-check && make precommit-fix`
- **Guardrail:** Keep every rule scoped under `.analysis-pane` so `position/`
  and `calendar/` remain untouched, and preserve `height: 100%` +
  `min-height: 0` on the flex chain so the `check_analysis_pane_layout.mjs`
  stage-height spread assertion (`spread <= 1px`) continues to hold.

---

### WO8 `[trivial]` — Update repo documentation and standardize `belief_state.probability` semantics

- **File:** `AGENTS.md`, `docs/analysis-pane-visual-design.md`,
  `docs/terminal-analysis-merge.md`, and `.agents/skills/thesis-update/SKILL.md`
- **Find (1, `AGENTS.md`):**

    ```markdown
    - **Terminal output vs. data load** → `docs/terminal-data-readiness.md`.
      Commands run before `loadTransactions()` settles; output that reads
      `transactionState` must await `whenTransactionDataReady()` or it prints
      "(no data)".
    ```

- **Find (2, `docs/analysis-pane-visual-design.md`):**

    ```markdown
    # Analysis pane visual design (terminal page)

    Findings doc for the visual/UX layer of the analysis subsystem inside the
    terminal's third pane. Merge mechanics (pane model, command grammar, lazy
    loading, CSS scoping) are settled in `docs/terminal-analysis-merge.md` and
    ```

- **Find (3, `docs/terminal-analysis-merge.md`):**

    ```markdown
    # Merging `analysis/` into `terminal/` as a submodule — design

    Findings doc for the question: _how to merge `analysis/index.html` into
    `terminal/index.html` as a submodule, with a CLI system and
    visualization/presentation system coherent with the existing terminal and
    ```

- **Find (4, `.agents/skills/thesis-update/SKILL.md`):**

    ```markdown
    - **LLM authors reasoning; code owns volatile data & gates:**
      `sync_configs` owns `market`, `position.shares`, and `derived`
      (`expectedCagr` / `expectedMultiple`, computed via the `lab.js` formula).
      Keep live prices, multiples, and engine outputs out of `belief_state`,
    ```

- **Change:**
    1. Add a concise **Analysis Decision Chart pane** landmine bullet in
       `AGENTS.md` pointing to `docs/analysis-decision-chart-design.md` (noting
       the 2-view grammar `an` / `an <SYM> [full]` / `an close`, GH-7 Kelly
       parity between `sync_configs.py` and `lab.js`, and that
       `realTimeData.tickerWeights` stores USD values, not fractions).
    2. Add a one-line `> Superseded by docs/analysis-decision-chart-design.md`
       note at the top of `docs/analysis-pane-visual-design.md` and
       `docs/terminal-analysis-merge.md` (the 9-screen Bloomberg section layout
       and MC worker were replaced by the 2-view Decision Chart).
    3. Update `.agents/skills/thesis-update/SKILL.md` to record that
       `sync_configs` also owns `derived.kelly` (GH-7 live solver) and define
       `belief_state.probability` unambiguously as **`P(thesis intact)`** (not
       `Bull.prob` alone).
- **Verify:** `venv/bin/pytest tests/python/test_doc_tool_references.py tests/python/test_skills.py && make sync-check`
- **Guardrail:** Edit `.agents/skills/thesis-update/SKILL.md` directly and run
  `make sync-check` (never hand-edit `.claude/commands/`); do not modify
  `data/analysis/*.json` by hand in this doc-only order.

---

## References & primary sources

### Repository primary sources

- `js/pages/analysis/lab.js` — Current 9-section markup (`95-187`), valuation &
  Kelly math (`586-948`), canvas renderers (`1416-1490`, `2176-2331`), journal
  indexing (`1842`), What-If sandbox (`2007-2026`), `PORT` aggregation
  (`2334-2418`, `2567-2711`).
- `js/pages/analysis/bayes.js` — Discrete Bayesian updater (`22-127`), Brier
  score (`137-163`), conjugate parameter posteriors (`244-282`).
- `js/pages/analysis/monte_carlo.worker.js` — Path simulation & `annualFan`
  (`173-330`).
- `js/transactions/terminal/handlers/analysis.js` & `constants.js` — Command
  grammar (`31-32`, `133-167`), autocomplete (`80-93`).
- `css/terminal/analysis.css` & `css/terminal/responsive.css` — Pane sizing
  (`18-20`, `186-191`) and canvas rules (`296-301`).
- `js/transactions/chart.js`, `js/transactions/chart/interaction.js`,
  `docs/chart-crosshair-layout.md`, `docs/y-axis-tick-algorithm.md` — Existing
  terminal DPR canvas, crosshair, and tick-collision infrastructure.
- `scripts/analysis/sync_configs.py`, `scripts/twrr/step03_fetch_prices.py`,
  `data/analysis/*.json`, `data/holdings_details.json`,
  `data/historical_prices.json`, `data/output/figures/pe_ratio.json`,
  `data/checkpoints/fetched_eps_cache.json` — Live ticker configs and data
  coverage as of `2026-11-20`.
- `docs/analysis-pane-visual-design.md`, `docs/terminal-analysis-merge.md`,
  `docs/fermat-pascal-kelly-system.md` — Prior design and mathematical specs.

### External primary sources

- **GuruFocus GF Value:** Official GF Value Line methodology, valuation zones,
  and Possible Value Trap documentation (`https://www.gurufocus.com/`).
- **Morningstar Equity Research Methodology:** Official Fair Value Estimate,
  Uncertainty Rating, and 1-to-5 Star Price-to-Fair-Value margin-of-safety
  thresholds (`https://www.morningstar.com/`).
- **FAST Graphs:** Official Orange Line (earnings-justified valuation) and Blue
  Line (normal P/E) valuation corridor methodology (`https://fastgraphs.com/`).
- **Simply Wall St:** Open-source Company Analysis Model documentation,
  `SimplyWallSt/Company-Analysis-Model` (`https://github.com/SimplyWallSt/Company-Analysis-Model/blob/master/MODEL.markdown#discounted-cash-flows-dcf`).
- **Cleveland, W. S., & McGill, R. (1984):** _"Graphical Perception: Theory,
  Experimentation, and Application to the Development of Graphical Methods,"_
  _Journal of the American Statistical Association_, 79(387), 531–554.
- **Cleveland, W. S. (1993):** _Visualizing Data_ (logarithmic scale for ratio
  and multiplicative comparisons).
- **Tufte, E. R. (1983; 2006):** _The Visual Display of Quantitative
  Information_ (data-ink ratio, direct labeling); _Beautiful Evidence_
  (sparklines, small multiples).
- **Shneiderman, B. (1996):** _"The Eyes Have It: A Task by Data Type Taxonomy
  for Information Visualizations,"_ _Proceedings of the IEEE Symposium on Visual
  Languages_, 336–343.
- **Britton, E., Fisher, P., & Whitley, J. (1998):** _"The Inflation Report
  projections: understanding the fan chart,"_ _Bank of England Quarterly
  Bulletin_, 38(1), 30–37.
- **Fernandes, M., Walls, L., Munson, S., Hullman, J., & Kay, M. (2018):**
  _"Uncertainty Displays Using Quantile Dotplots or CDFs Improve Transit
  Decision-Making,"_ _Proceedings of the 2018 CHI Conference on Human Factors in
  Computing Systems_, DOI `10.1145/3173574.3173718`.
- **Few, S. (Perceptual Edge):** _Bullet Graph Design Specification_
  (`https://www.perceptualedge.com/`).
- **Constantinides, G. M. (1986):** _"Capital Market Equilibrium with
  Transaction Costs,"_ _Journal of Political Economy_, 94(4), 842–862.
- **MacLean, L. C., Thorp, E. O., & Ziemba, W. T. (2010):** _The Kelly Capital
  Growth Investment Criterion: Theory and Practice_ (fractional Kelly vs.
  overbetting asymmetry).
- **Odean, T. (1998):** _"Are Investors Reluctant to Realize Their Losses?"_
  _The Journal of Finance_, 53(5), 1775–1798.
- **Frydman, C., & Rangel, A. (2014):** _"Debiasing the disposition effect by
  reducing the saliency of information about a stock's purchase price,"_
  _Journal of Economic Behavior & Organization_, 107, 541–552.
