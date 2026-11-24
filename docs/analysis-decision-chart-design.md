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

The current analysis pane in `/terminal/` is verbose, fragmented across detail
and sandbox commands, and lacks an intuitive decision signal, causing low daily
usage. Given all the data this repository already computes per ticker
(Fermat–Pascal scenarios, implied target-CAGR entry prices, discrete Kelly
sizing, position weights and caps, Monte Carlo distributions, Bayesian belief
state, event flags, and price/EPS history), **what is the single best
one-chart-per-ticker visual representation to directly communicate buy, add,
hold, trim, or sell decisions** — comparing GuruFocus GF Value and
institutional alternatives?

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
Valuation Corridor & Decision Chart** that replaces the nine-section default
landing view with **one screen per ticker** composed of three tightly integrated
layers inside the existing `320px–480px` `.chart-card` pane:

1. **Decision Verdict Strip (top, ~26px DOM):** One unambiguous, thesis-gated
   action badge (`STRONG BUY`, `ADD`, `BUY · INITIATE`, `HOLD`,
   `HOLD · AT TARGET`, `HOLD · AT CAP`, `HOLD · DATA`, `TRIM · OVER KELLY`,
   `TRIM TO CAP`, `TRIM`, `SELL / TRIM`, `WATCH`, `WATCH · DATA`, `PASS`,
   `AVOID`, or `AVOID / EXIT · THESIS BROKEN`) computed by a deterministic
   **3-Gate Decision Engine** (Thesis
   Integrity → Iso-CAGR Valuation Zone with `Geo` uncertainty guard →
   Volatility-Blended Kelly/Cap Sizing Gap with a proportional no-trade
   deadband), alongside **Mean-wealth CAGR** (the CAGR of expected terminal
   wealth, not the expectation of scenario CAGRs; §4.2), next-trigger distance
   (e.g., `Fair > $306 (+11.4%)`), scenario probabilities (`Bull/Base/Bear` +
   `Conf %`), and active flags.
2. **Unified Log-Scale Valuation Corridor + Forward Scenario Fan (middle,
   ~192px at `320px` pane floor / ~352px at `480px` ceiling, DPR canvas):** One
   canvas split at a crisp `TODAY` vertical hairline (uniform time scale in
   default `2y` mode so constant-CAGR paths plot straight across `TODAY`, with
   an explicit `//` scale-break marker in `full` mode when horizon $T$
   compresses the past window). The two sides have related but distinct units,
   disclosed by a `PRICE → TOTAL-RETURN VALUE` marker at `TODAY`:
    - **Left (Past 2Y in EPS-corridor/broken mode; Past 1Y in horizontal mode):**
      Solid weekly **unadjusted closing-price** line (`auto_adjust=False`) over
      Fermat–Pascal **iso-CAGR entry-price zones** — sloped by step-held cached
      TTM EPS where positive historical EPS exists (`ANET`, `GOOG`, `PDD`,
      normalized to the cache's latest usable EPS at `TODAY` for geometric
      continuity and labeled `Thesis×EPS`), and horizontal current-thesis bands
      where it does not (`VT`, `AEHR`). Cached EPS is display context, not a
      strictly point-in-time backtest input (§4.3).
    - **Right (Next 2Y default, full horizon `T` via `an <TICKER> full`):**
      Dashed forward total-return iso-CAGR entry-value curves
      ($V(r, t) = E[TV_T] / (1 + r)^{T - t}$, where $TV_T$ is terminal total
      value including reinvested dividends) overlaid with the lightly shaded
      deterministic **Bear / Base / Bull scenario range (3 states)**,
      probability-weighted total-return account-value rays, and packed
      right-edge labels (`Bull 20% $402 →TV $1.8k`), plus a hover crosshair.
      These are not terminal price forecasts; geometric continuity at `TODAY`
      does not imply that historical price and future total-return wealth are
      the same economic series.
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
   record + Brier score, next review date, and active `event_flags` /
   staleness badge).

To complete Shneiderman's _"Overview first, zoom and filter, then
details-on-demand"_ mantra (1996) without UI bloat, bare `an` (`PORT`) lands on
a 6-row **Small-Multiples Decision Board** with a 1-line portfolio-budget footer
(`Σ w_curr`, `Σ w_rec`, residual target cash), `an <TICKER>` opens that
ticker's **Decision Chart** immediately (with `an <TICKER> full` for the full
$T$-year horizon), and the eight detail-section commands plus MC and
`bull`/`bear`/`reset` sandbox commands are removed from the terminal pane.

## Locked design decisions

Resolved interactively via `/grill-me` and follow-up codebase/math review (all
downstream specs and work orders below reflect these choices):

| Branch                             | Locked Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pane views & command surface**   | **2 views only:** `an` (`PORT` Decision Board + portfolio budget footer) and `an <TICKER> [full]` (Single-Ticker Decision Chart), plus `an close`. Remove the eight legacy detail-section commands plus MC and sandbox commands from `/terminal/`.                                                                                                                                                                                                                                                                                                                                                                       |
| **Pointer & keyboard interaction** | **Strict keyboard-only navigation** (`an`, `an <TICKER> [full]`, `an close` + ticker autocomplete); **hover crosshair on the chart canvas only** (no clickable board rows or context strip, no vertical "What-If Price" probe).                                                                                                                                                                                                                                                                                                                                                                                          |
| **Historical prices & EPS source** | Extend `scripts/analysis/sync_configs.py` to emit compact `data/analysis/<SYM>.history.json`: 2Y weekly **unadjusted closes** from `yfinance` with explicit `auto_adjust=False`, plus positive quarterly TTM EPS from `data/checkpoints/fetched_eps_cache.json`. EPS is step-held without interpolation; the cache is **not strictly point-in-time**, so disclose its quarter-end look-ahead residual and possible EPS-basis conflicts rather than claiming zero look-ahead. Held and watchlist tickers render without loading the 8.9 MB, 186-symbol `historical_prices.json`; missing EPS selects horizontal 1Y bands. |
| **Forward cone, horizon & units**  | **2Y forward cone by default**, with optional full $T$ horizon and `//` scale break when compressed. Left-side values are raw historical prices and entry-price thresholds. Right-side values are total-return entry-value thresholds and account value per initially invested share; label terminal values `TV`, not terminal prices. Add a visible `PRICE → TOTAL-RETURN VALUE` unit marker at `TODAY`.                                                                                                                                                                                                                |
| **Dividends & `VT` model fix**     | The repository's `market.dividendYield` schema is **percentage points** (`0.32` means `0.32%`); normalize at ingestion with `clamp(dividendYield / 100, 0, 0.25)` and test the contract rather than assuming every `yfinance` payload/release uses that unit. Include reinvested dividends in total-return compounding per `docs/fermat-pascal-kelly-system.md:39`. Derive `eps = price / pe` when `trailingEps` is omitted, fixing `VT`'s stale `6.22` EPS to `~8.02` and modeled Mean-wealth CAGR from `2.2%` to `~9.2%`.                                                                                              |
| **Kelly sizing math & source**     | **Single live source of truth — 7-point Gauss–Hermite Volatility-Blended Discrete Kelly** (`f ∈ [0, 1.0]`, long-only unleveraged), with $1 + R_{i,k} = (1 + r_i)\exp(\sigma z_k - \tfrac{1}{2}\sigma^2)$. The continuous construction has unit mean; finite GH-7 quadrature only approximates it. Recompute identically in `sync_configs.py` and `lab.js`, test Python↔JS parity and missing-volatility handling, and retire stale hand-set Kelly values and `position.maxKellyWeight`.                                                                                                                                  |
| **`fairValueRange` policy**        | **Retire `fairValueRange` from chart rendering and Gate 1 logic.** Git history shows `ANET`'s `[100, 130]` is a Nov 2025 echo at `$2.63` EPS and `AEHR`'s `[45, 50]` is a rounded paraphrase of `entryPriceForTarget = $47.81`. Live iso-CAGR bands are canonical; negative-EPS tickers either set `model.preferences.overrides.eps` (`AEHR`) or trip Gate 1 (`CBRS`).                                                                                                                                                                                                                                                   |
| **Thesis-intact probability**      | **Do not reinterpret the legacy `belief_state.probability`.** Existing values include `0.35` on `ANET` and `PDD`, `0.50` on `GOOG`/`VT`/`AEHR`, and `0.01` on `CBRS`, with inconsistent meanings. Add optional `belief_state.thesis_intact_probability` only after explicit per-ticker thesis review. Gate 1 may apply its `<0.15` test only to that new field; missing values produce a metadata warning, not an inferred score. Never derive it from Bull/Base/Bear probabilities.                                                                                                                                     |
| **Live prices, weights & policy**  | Use the freshest available `fetchRealTimeData()` result (localhost is static; production may use a Worker with fallback), normalized weights (`composition[i].percent / 100` or `tickerWeights[sym] / balance`, never raw USD `tickerWeights[sym]`), and available `prices[sym]` to recompute `P0`, bands, and Kelly. Proportional deadband `δ = max(0.005, 0.10 * w_max)`; Rich-zone target `min(w_rec, 0.5 * w_max)`; `STRONG BUY` requires `Geo ≥ r_tgt`; always print the directional next trigger defined in §4.2.                                                                                                  |
| **Cost basis & trade markers**     | **Omit completely** so the chart stays forward-looking and reduces purchase-price saliency (Odean 1998; Frydman & Rangel 2014).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Dead-code cleanup**              | Prune the legacy nine-section UI renderers, `js/pages/analysis/monte_carlo.worker.js` (+ its test), and unused `js/pages/analysis/bayes.js` replay/sandbox code (retaining `computeBrierScore` and core Fermat–Pascal/Kelly math); update layout checks, Jest suites, `AGENTS.md`, and superseded docs.                                                                                                                                                                                                                                                                                                                  |

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
through eight detail screens beyond the overview without an actionable summary.

### 1.3 Raw Kelly curves collapse real weights into an unreadable sliver

Evaluating the current Fermat–Pascal discrete Kelly solver (`lab.js:654-762`)
against all six live configs in `data/analysis/*.json` (as of `2026-11-20`,
total held value `$1,318,471.57` from `data/holdings_details.json`) exposes
why `#kellyCurveCanvas` rarely informs daily decisions:

| Ticker | Status     | Price     | Eff. EPS  | Horizon | Legacy E[P_T] | Mean-wealth CAGR | Full K    | Scaled ½K | Cap   | Rec Weight | Curr Weight |
| ------ | ---------- | --------- | --------- | ------- | ------------- | ---------------- | --------- | --------- | ----- | ---------- | ----------- |
| `GOOG` | Held       | `$274.99` | `$19.15`  | `10y`   | `$921.1`      | `12.8%`          | `1000.0%` | `500.0%`  | `25%` | `25.0%`    | `19.7%`     |
| `ANET` | Held       | `$170.99` | `$3.73`   | `5y`    | `$306.4`      | `12.4%`          | `504.2%`  | `252.1%`  | `30%` | `30.0%`    | `31.4%`     |
| `PDD`  | Held       | `$85.56`  | `$9.07`   | `5y`    | `$123.5`      | `7.6%`           | `134.2%`  | `67.1%`   | `25%` | `25.0%`    | `20.4%`     |
| `VT`   | Held (ETF) | `$144.96` | `$6.22`   | `5y`    | `$161.6`      | `2.2%`           | `0.0%`    | `0.0%`    | `30%` | `0.0%`     | `28.6%`     |
| `AEHR` | Watchlist  | `$40.92`  | `$0.90`\* | `5y`    | `$84.3`       | `15.5%`          | `304.6%`  | `152.3%`  | `5%`  | `5.0%`     | `0.0%`      |
| `CBRS` | Watchlist  | `$91.25`  | `-$5.17`  | `5y`    | `-$643.7`     | `n/a`            | `0.0%`    | `0.0%`    | `5%`  | `0.0%`     | `0.0%`      |

\* `AEHR` sets `model.preferences.overrides.eps = 0.895`
(`data/analysis/AEHR.json:27-29`). Here
$\text{Mean-wealth CAGR} = (\sum_i p_i M_i)^{1/T} - 1$: the CAGR of expected
terminal wealth, **not** $\sum_i p_i(M_i^{1/T}-1)$. The existing schema name
`expectedCagr` therefore denotes mean-wealth CAGR. This legacy table's $E[P_T]$
excludes dividends; the proposed post-WO1 $E[TV_T]$ includes them.

Because the legacy discrete solver feeds $T$-year annualized CAGRs directly into
a 1-year Kelly objective — ignoring both intra-year price volatility
(`risk.volatility`, `0.15–1.31` vs. scenario-CAGR spread `0.05–0.16`, an
**8.7×–65.8×** variance understatement across the five modelable tickers) and
any left-tail catastrophe state — unconstrained `fullKelly` hits `134%–1000%`
on four of six tickers, collapsing Kelly sizing into a binary `0% / maxWeight`
switch. Meanwhile, stale hand-set JSON values (`ANET` `0.06 / 0.03` from Nov
2025 at `$2.63` EPS via the retired `(E - benchmark) / σ²` formula; `AEHR`
`0.0 / 0.0` frozen at `$64.52`) contradict the live solver by up to 100×. On
`#kellyCurveCanvas` (`lab.js:1416-1490`), the X-axis stretches to `2×
fullKelly` or `zeroGrowthFraction`, crushing `Curr: 19.7%` and the `25%` cap
into the leftmost 2–5% of the canvas.

Expanding each scenario's annualized total-return CAGR $r_i$ with within-scenario
lognormal annual volatility $\sigma$ via **7-point probabilists' Gauss–Hermite
quadrature** ($1 + R_{i,k} = (1 + r_i)\exp(\sigma z_k -
\tfrac{1}{2}\sigma^2)$, long-only unleveraged $f \in [0, 1.0]$) uses a
continuous unit-mean construction, but finite quadrature only approximates
scenario means and tail behavior. On the snapshot, GH-7 versus GH-80 Kelly
differs by less than **0.01 percentage points** for every active ticker; the
largest gap is `AEHR` (`1.767807%` vs. `1.765751%`, `0.002056` percentage
points, or `0.1164%` relative). The solver restores risk-differentiated sizing
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
   (`2026-09-29`) at index `1`. The newest entry's `review_date` is
   `2026-11-30`; the proposed `Rev` footer must show that next-review date, not
   the journal entry date.
3. **Disconnected What-If sandbox & mixed-horizon synthetic `PORT`:**
   `analysis bull|bear|reset` (`lab.js:2007-2026`) mutates
   `state.bayesEngine.priors` without recalculating valuation or Kelly sizing.
   `buildPortfolioConfig` takes the horizon from the first index config
   (`lab.js:2626-2628`), currently five-year `AEHR`, while `aggregateScenarios`
   mixes in `GOOG`'s ten-year terminal multiple. This ordering-dependent
   aggregation is retired with the legacy views; no crash claim is made here.
4. **`VT` omitted dividend yield & EPS/PE mismatch:** `docs/fermat-pascal-kelly-system.md:39`
   specifies that scenario returns must be total return including reinvested
   dividends, yet `lab.js:600-603` and `sync_configs.py:580` omit `dividendYield`.
   For `VT`, `market.price` (`144.96`) / `market.eps` (`6.22`) = `23.3x` while
   `market.pe` is `18.08`, pulling `VT`'s modeled Mean-wealth CAGR down to `2.2%`
   (below `4%` risk-free).
5. **Stale hand-set JSON `kelly`/`fairValueRange` & drifted `belief_state.probability`:**
   `sync_configs.py:549` passes through `derived.kelly` and `fairValueRange`
   unmodified (`ANET` carries Nov 2025 `$2.63`-EPS values `fairValueRange: [100,
130]` and `kelly: 0.06/0.03`; `AEHR` carries `kelly: 0.0` from `$64.52`).
   Existing `belief_state.probability` values are `0.35` on `ANET` and `PDD`,
   `0.50` on `GOOG`/`VT`/`AEHR`, and `0.01` on `CBRS`; these values do not
   establish a common `P(thesis intact)` meaning and must not be silently
   reinterpreted.
6. **Watchlist tickers lack historical prices/EPS on disk:**
   `data/historical_prices.json` (8.928 MB, 186 symbols) and
   `data/output/figures/pe_ratio.json` (3.710 MB, 2,340 shared date slots)
   include the four held tickers but omit watchlist `AEHR` and `CBRS`, because
   `scripts/twrr/step03_fetch_prices.py:836-840` collects symbols only from
   `transactions_with_splits.parquet`. `pe_ratio.json` has 1,199 non-null `VT`
   P/E observations, all flat at `17.72`; `VT` is absent from
   `data/checkpoints/fetched_eps_cache.json`.

---

## 2. Primary-source evidence: financial decision charts and visualization science

### 2.1 Institutional and retail valuation-chart benchmarks

| Model                                | Primary Source                                  | Core Visual Mechanism                                                                                                                                                                                                                                                                                | Strengths to Adopt                                                                                  | Limitations for This Repo                                                                                                       |
| ------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **GuruFocus GF Value**               | GuruFocus official GF Value tutorial            | Historical GF Value line and price-to-GF-Value valuation corridor, with qualitative ratings and a **Possible Value Trap** warning. The reviewed tutorial does not substantiate universal `0.7/0.9/1.1/1.3` boundaries or a universal dashed three-year projection, so those are not design premises. | Instant spatial reading of price vs. value; past-to-future continuity; explicit value-trap caution  | Blind to portfolio weight/caps; its proprietary multi-factor estimate is unavailable for these watchlist and negative-EPS cases |
| **Morningstar Price vs. Fair Value** | Morningstar's official Uncertainty Rating guide | Closing price vs. DCF Fair Value Estimate. For Low / Medium / High / Very High / Extreme uncertainty, the published 5-star discounts are `20/30/40/50/75%`; 1-star premiums are `25/35/55/75/300%`.                                                                                                  | Risk-adjusted margin of safety: higher uncertainty demands a larger discount or premium             | Single-point FVE hides explicit Bear/Base/Bull asymmetry; no portfolio-sizing layer                                             |
| **FAST Graphs**                      | FAST Graphs official methodology                | Monthly price plotted against an earnings-justified **Orange Line** and historical Normal P/E **Blue Line**, creating an EPS-sloped valuation corridor                                                                                                                                               | Sloping historical bands by EPS avoid making earlier years of a fast grower look artificially cheap | Purely earnings-multiple driven; breaks on negative EPS; no probabilistic scenarios or Kelly sizing                             |
| **Simply Wall St**                   | `SimplyWallSt/Company-Analysis-Model`           | 2-stage DCF (or Excess Returns for financials) paired with a Fair Value summary and 5-axis Snowflake                                                                                                                                                                                                 | Fast scalar valuation summary                                                                       | Static snapshot with no time dimension; radar/snowflake uses lower-accuracy area/angle encodings                                |

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
6. **Uncertainty displays can improve domain-specific decisions:** Fernandes,
   Walls, Munson, Hullman & Kay (_ACM CHI 2018_, DOI
   `10.1145/3173574.3173718`) found that quantile dotplots and CDFs improved
   incentivized **transit** decisions. This supports testing explicit
   uncertainty rather than hiding it, but does not establish that every fan or
   uncertainty graphic improves investment decisions.
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
   Growth Investment Criterion_, 2010) analyze fractional Kelly and overbetting.
   The familiar "~75% of growth at ~50% of volatility" Half-Kelly statement is
   an approximation under particular continuous models, **not a theorem for
   this discrete GH-7 distribution**. The implementation must report computed
   discrete outcomes rather than promise those percentages, while still making
   over-Kelly exposure visible.
10. **Hide purchase price by default to curb the disposition effect:** Terrance
    Odean (_Journal of Finance_, 1998) documented the disposition effect.
    Separately, Frydman & Rangel (_Journal of Economic Behavior & Organization_, 2014) experimentally found that reducing purchase-price saliency reduced the
    disposition effect by `25%`. The causal hiding result belongs to Frydman &
    Rangel, not Odean; together they motivate a forward-looking chart without
    an average-cost line.

---

## 3. Comparing five candidate single-chart architectures

| Candidate                                                       | Visual Form                                                                                    | Answers "Cheap/Rich?" | Answers "Buy/Hold/Trim/Sell?"                              | Shows Uncertainty / Skew?                        | Works for All 6 Repo Tickers?                                | Verdict                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| **A. Pure GF Value**                                            | Price vs. proprietary GF Value corridor and qualitative zones                                  | Yes (high clarity)    | **No** (ignores weight & caps; `ANET` false-buys at 31.4%) | No explicit scenario skew                        | No (needs proprietary estimate; unsuitable for `CBRS`, `VT`) | Strong inspiration, incomplete                                     |
| **B. Morningstar P/FV + Uncertainty**                           | Stepped FVE + uncertainty-widened 5★/1★ bands                                                  | Yes (risk-adjusted)   | **No** (ignores weight & caps)                             | Partial (symmetric width)                        | No (no historical analyst FVE revisions stored)              | Borrow risk-adjusted bands                                         |
| **C. Valuation Football Field**                                 | Horizontal bars (Bear/Base/Bull, 52w, bands) + price tick                                      | Yes (static)          | Partial (can add sizing bar)                               | Yes (scenario spread)                            | Yes                                                          | Rejected as primary: **zero time/trajectory context**              |
| **D. 2D Action Scatter (`Mean-wealth CAGR` vs. `Weight/Cap`)**  | Quadrant plot with Buy/Hold/Trim/Sell zones                                                    | Yes (scalar)          | Yes (valuation + weight together)                          | No (unless bubble size = area, low accuracy)     | Yes                                                          | Best for **`PORT` multi-ticker comparison**, wasteful for 1 ticker |
| **E. Recommended: Unified Valuation Corridor & Decision Chart** | Verdict Strip + Log-Scale Iso-CAGR Corridor & Forward Scenario Fan + Stephen Few Sizing Bullet | **Yes (over time)**   | **Yes (3-gate: Thesis × Value × Sizing)**                  | **Yes (Bear/Base/Bull cone + terminal markers)** | **Yes (graceful degradation for `VT`, `AEHR`, `CBRS`)**      | **Optimal single-ticker representation**                           |

---

## 4. Specification: Unified Valuation Corridor & Decision Chart

### 4.1 Screen anatomy inside the existing `.chart-card` pane (`~672px × 320px–480px`)

```text
┌───────────────────────────────────────────────────────────────────────────────────┐
│ PORT  [GOOG]  ANET  PDD  VT  AEHR  CBRS        2Y · 2026-11-20 · ⚑ FLAGS STALE    │ ← Context Strip (24px DOM)
├───────────────────────────────────────────────────────────────────────────────────┤
│ GOOG · Alphabet [ADD +5.3% to cap] Mean 13.2% · Fair >$306 (+11%) · 20/60/20 c80% │ ← Layer 1: Verdict Strip (26px)
├───────────────────────────────────────────────────────────────────────────────────┤
│ Log USD · raw price                TODAY: PRICE → TR VALUE (div. reinvested)      │
│ $643  ··························· SELL │··········································│
│ $507  ··························· RICH │··········································│
│       ··························· FAIR │··············· Bull 20% $402 →TV $1.8k   │ ← Layer 2: Unified Decision
│ $306  ──┐ ┌────────────────────── BUY ─│───────────── Base 60% $345 →TV $854      │   Canvas (~192px @ 320px floor,
│ $275    └─●────────────────────────────●─────────── Bear 20% $291 →TV $362        │   ~352px @ 480px ceiling, DPR)
│ $198  ··························· DEEP │··········································│
│        2025          2026            TODAY          +1Y              +2Y          │
├───────────────────────────────────────────────────────────────────────────────────┤
│ SIZE  [███████████████████|····]  19.7% / 25.0% target (+5.3% · +$70k) · ½K 33%   │ ← Layer 3: Sizing Bullet (22px)
│ RISK  Bear +2.8%/yr · Geo 11.8% · 52w $271–$404 · Pred 1/2 (0.04) · Rev 2026-11-30│ + Risk Footer (20px)
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Exact vertical pixel budget at the `320px` desktop pane floor** (`css/terminal/responsive.css:186-191`):

- `#paneContext` (compact `24px`) + `.analysis-stage` padding (`8px` top + `10px` bottom = `18px`) + Layer 1 `#verdictStrip` (`26px`) + Layer 3 `#sizingBullet` (`22px`) + `#riskFooter` (`20px`) + 3 internal `6px` gaps (`18px`) = `128px` chrome.
- Remaining canvas height: **`192px`** at the `320px` floor and **`352px`** at the `480px` ceiling (`overflow <= 1px`).

**Testable success criteria:**

1. At `1280×580` (`320px` pane floor), `an` (`PORT` board) and `an <TICKER>` render with `scrollHeight - clientHeight <= 1px` across all 6 tickers (gated by `make analysis-layout-check`).
2. Verdict badge, next-trigger distance (`Fair > $306 (+11.4%)` or `Buy < $70.1 (-18.1%)`), sizing delta (`+5.3%` / `-23.6%`), and non-overlapping log Y-axis ticks are immediately readable without hovering.
3. Python (`sync_configs.py`) and JS (`lab.js`) agree within `1e-4` on `expectedMultiple`, `expectedCagr`, `fullKelly`, and `scaledKelly`.

### 4.2 Layer 1 — Deterministic 3-Gate Decision Engine

Every ticker's action badge is computed deterministically from
`data/analysis/<SYM>.json`, `data/analysis/event_flags.json`, freshest available
prices/weights (from `fetchRealTimeData()` when available, else
`holdings_details.json` × `market.price`), and the **7-point Gauss–Hermite
Volatility-Blended Discrete Kelly** solver.

- **Return and CAGR definitions (normative):** For scenario $i$, distinguish
  terminal price from terminal total value:

    $$
    P_{i,T}=\text{eps}(1+g_i)^T\text{exitPe}_i,\qquad
    TV_{i,T}=P_{i,T}(1+d)^T,\qquad M_i=TV_{i,T}/P_0,\qquad r_i=M_i^{1/T}-1.
    $$

    Then $E[TV_T]=\sum_i p_iTV_{i,T}$ and

    $$
    \text{Mean-wealth CAGR}=(\sum_i p_iM_i)^{1/T}-1,\qquad
    \text{Geo}=\exp\bigl((1/T)\sum_i p_i\ln M_i\bigr)-1.
    $$

    Mean-wealth CAGR is the CAGR of probability-weighted terminal wealth, not the
    probability-weighted mean of scenario CAGRs. `Geo` is the annualized
    probability-weighted geometric mean of scenario multiples, **not necessarily a
    median**. The compact UI label is `Mean`; the schema field remains
    `expectedCagr` for compatibility.

- **Live Kelly math (single source of truth in Python & JS):** Expand each
  annualized total-return CAGR $r_i$ using annual volatility $\sigma$
  (`risk.volatility`) and 7 probabilists' Gauss–Hermite nodes/weights
  $(z_k,w_k)$:

    $$
    1+R_{i,k}=(1+r_i)\exp\bigl(\sigma z_k-\tfrac{1}{2}\sigma^2\bigr),
    \quad p_{i,k}=p_iw_k.
    $$

    Solve the represented discrete log-utility problem
    $f^{\ast}=\arg\max_{f\in[0,1]}\sum_{i,k}p_{i,k}\ln(1+r_f+f(R_{i,k}-r_f))$
    by monotone bisection (`KELLY_FRACTION_CAP = 1.0`), reducing to the discrete
    scenario solver when $\sigma=0$. Start the feasible upper bound at `cap` and
    tighten it only for states with $R_{i,k}<r_f$; an all-winning state set has no
    extra bound. Missing, non-finite, or negative volatility returns `null` Kelly
    metrics rather than silently becoming zero volatility. Finite GH-7 quadrature
    approximates the continuous unit-mean construction; it does not exactly
    preserve terminal wealth. Set $f_{\text{scaled}}=\text{kellyScale}\cdot f^{\ast}$
    (`½K`) and never read stale `derived.kelly` or `position.maxKellyWeight` as
    overrides.

1. **Gate 1 — Thesis & Data Validity Gate (Value-Trap Override):**
    - Set `gate1Broken = true` and trigger `AVOID · THESIS BROKEN` (if
      `w_curr == 0`) or `EXIT · THESIS BROKEN` (if `w_curr > 0`) when **any**
      of:
        - Latest `decision_journal` entry (sorted ascending by ISO `date`) has
          `action ∈ {'CLOSE_LONG', 'EXIT'}`.
        - All scenarios have `name` starting with `'RETIRED'`
          (case-insensitive).
        - Effective `eps <= 0` after `model.preferences.overrides.eps` (so
          `AEHR` passes and `CBRS` trips; `fairValueRange` is not an escape
          hatch).
        - The optional, explicitly reviewed
          `belief_state.thesis_intact_probability` is present and `< 0.15`.
          Never apply this threshold to legacy `belief_state.probability` or
          infer the new field from scenario probabilities. Before WO8's
          migration, show one board-level `THESIS PROB UNMIGRATED` metadata
          warning and disable this particular test.
    - When Gate 1 trips, suppress green valuation zones and show muted/red
      price with a `THESIS BROKEN` watermark.
    - **Review and staleness modifiers:** Keep these separate:
        - `market.marketDataUpdatedAt` older than 7 days marks that ticker
          `⚑ MARKET STALE`; a missing timestamp marks `⚑ MARKET AGE UNKNOWN`.
        - `event_flags.generatedAt` older than 7 days marks the **entire board
          and every ticker** `⚑ FLAGS STALE`; it is not an AEHR-only signal.
        - A `review-date` flag is active when its `date` is on/before the
          snapshot date and remains active until a later journal review or a
          refreshed flags file removes it. A `filing` flag is active for 30
          calendar days after its filing `date`. There is no persisted `active`
          boolean, so the UI must derive these rules deterministically.
        - An unresolved prediction is overdue only when it has an explicit due
          field (`review_date` or `dueDate`) before the snapshot date; do not
          infer a deadline from `resolved_date`. `belief_state.confidence <
0.50` also adds a review warning.
2. **Gate 2 — Fermat–Pascal Iso-CAGR Valuation Zones (with Uncertainty Guard):**
   Using $E[TV_T]$, horizon $T$, `targetCagr` ($r_{\text{tgt}}$), `benchmark`
   ($r_{\text{bench}}$), `riskFreeRate` ($r_f=0.04$), and `strongCagr`
   ($r_{\text{strong}}=r_{\text{tgt}}+0.05$), define entry-value boundaries at
   time offset $t$ years from today:

    $$
    V(r,t)=\frac{E[TV_T]}{(1+r)^{T-t}},\qquad 0\le t\le T.
    $$

    At $t=0$, $V(r_{\text{tgt}},0)$ is `entryPriceForTarget` and
    $V(r_f,0)$ is the risk-free floor. At $t=T$, every curve validly equals
    $E[TV_T]$; do not reject the terminal point.
    - **Deep Value (`DEEP_VALUE`):** $P_0\le V(r_{\text{strong}},0)$ **and**
      $\text{Geo}\ge r_{\text{tgt}}$. If the price clears the strong threshold
      but Geo does not clear the target, classify as `BUY`, not `STRONG BUY`.
    - **Buy Zone (`BUY`):** $P_0\le V(r_{\text{tgt}},0)$, equivalently
      Mean-wealth CAGR $\ge r_{\text{tgt}}$.
    - **Fair / Hold Zone (`FAIR`):**
      $V(r_{\text{tgt}},0)<P_0\le V(r_{\text{bench}},0)$.
    - **Rich Zone (`RICH`):**
      $V(r_{\text{bench}},0)<P_0\le V(r_f,0)$.
    - **Overvalued Zone (`OVERVALUED`):** $P_0>V(r_f,0)$, equivalently
      Mean-wealth CAGR $<r_f$. Kelly is computed independently from the GH
      states rather than assumed from this label.
    - **Directional boundary readout:** When $P_0\le\texttt{buy}$, show
      `Fair > <buy>` with `triggerDistancePct = buy / P0 - 1`; otherwise show
      `Buy < <buy>` with the same signed formula. This deliberately tracks the
      Buy/Fair boundary, **not the geometrically nearest band edge**. Compute
      `nearBoundary = abs(triggerDistancePct) < 0.02` from that selected
      trigger. Gate 1 broken has `nextTrigger = null`.

3. **Gate 3 — Sizing Synthesis (Proportional Constantinides Deadband):**
   Let $w_{\text{rec}}=\min(f_{\text{scaled}},w_{\max})$, proportional deadband
   $\delta=\max(0.005,0.10w_{\max})$ (so `0.5%` on `AEHR`'s `5%` cap, `2.5%`
   on `25%` caps, `3.0%` on `30%` caps), and
   $\Delta w=w_{\text{rec}}-w_{\text{curr}}$:
    - **Deep Value / Buy Zone:**
        - $w_{\text{curr}}=0$ and $w_{\text{rec}}>0$ → `STRONG BUY (≤w_rec)` /
          `BUY · INITIATE (≤w_rec)`.
        - $w_{\text{curr}}>w_{\max}+\delta$ and $w_{\text{rec}}\ge w_{\max}$ →
          `TRIM TO CAP`.
        - $w_{\text{curr}}>w_{\text{rec}}+\delta$ →
          `TRIM · OVER KELLY (-|Δw|)`.
        - $\Delta w>\delta$ → `STRONG BUY (+Δw)` / `ADD (+Δw)`.
        - $w_{\max}<w_{\text{curr}}\le w_{\max}+\delta$ → `HOLD · AT CAP`.
        - $w_{\text{curr}}=0$ and $w_{\text{rec}}=0$ → `WATCH`.
        - Otherwise → `HOLD · AT TARGET`.
    - **Fair / Hold Zone:**
        - $w_{\text{curr}}>w_{\max}+\delta$ and $w_{\text{rec}}\ge w_{\max}$ →
          `TRIM TO CAP`.
        - $w_{\text{curr}}>w_{\text{rec}}+\delta$ → `TRIM · OVER KELLY (-|Δw|)`.
        - $w_{\text{curr}}>0$ → `HOLD`; $w_{\text{curr}}=0$ → `WATCH (< $buy)`.
    - **Rich Zone:** Let $w_{\text{rich}}=\min(w_{\text{rec}},0.5w_{\max})$.
      If $w_{\text{curr}}>w_{\text{rich}}+\delta$ →
      `TRIM (-(w_curr - w_rich))`; else if $w_{\text{curr}}>0$ → `HOLD · RICH`;
      else `PASS`.
    - **Overvalued Zone:** `SELL / TRIM` if $w_{\text{curr}}>0`; `AVOID` if
      $w_{\text{curr}}=0$.
    - **Sizing data unavailable:** If Kelly cannot be computed, do not treat it
      as zero. Preserve the Gate 2 zone, set `targetWeight = null`, suppress ADD
      and TRIM sizing deltas, and return `HOLD · DATA` for a held ticker or
      `WATCH · DATA` for a watchlist ticker with a `⚑ KELLY UNAVAILABLE` flag.

#### Independently recomputed post-WO1 snapshot (`2026-11-20`, GH-7 Kelly + dividends + `VT` EPS fix)

| Ticker | Price    | StrongBuy / Buy / Fair / Sell (`t=0`)   | Mean (`Geo`)      | σ      | GH-7 K / ½K       | `w_curr` → `w_rec` (Cap, δ)       | Probs / Conf     | Directional Trigger     | Resulting Verdict                |
| ------ | -------- | --------------------------------------- | ----------------- | ------ | ----------------- | --------------------------------- | ---------------- | ----------------------- | -------------------------------- |
| `GOOG` | `$275.0` | `$198` / `$306` / `$507` / `$643`       | `13.2%` (`11.8%`) | `0.33` | `66.1%` / `33.0%` | `19.7%` → `25.0%` (`25%`, `2.5%`) | `20/60/20` `80%` | `Fair > $306 (+11.4%)`  | **`ADD (+5.3% to cap)`**         |
| `ANET` | `$171.0` | `$140` / `$174` / `$224` / `$252`       | `12.4%` (`9.8%`)  | `0.58` | `15.6%` / `7.8%`  | `31.4%` → `7.8%` (`30%`, `3.0%`)  | `35/50/15` `75%` | `Fair > $174 (+1.7%)`\* | **`TRIM · OVER KELLY (-23.6%)`** |
| `PDD`  | `$85.6`  | `$56.4` / `$70.1` / `$90.2` / `$101.5`  | `7.6%` (`4.9%`)   | `0.35` | `10.4%` / `5.2%`  | `20.4%` → `5.2%` (`25%`, `2.5%`)  | `15/50/35` `70%` | `Buy < $70.1 (-18.1%)`  | **`TRIM · OVER KELLY (-15.2%)`** |
| `VT`   | `$145.0` | `$122` / `$153` / `$176` / `$185`       | `9.2%` (`8.5%`)   | `0.15` | `100%` / `50.0%`  | `28.6%` → `30.0%` (`30%`, `3.0%`) | `20/60/20` `90%` | `Fair > $153 (+5.7%)`   | **`HOLD · AT TARGET`**           |
| `AEHR` | `$40.9`  | `$38.4` / `$47.8` / `$61.5` / `$69.3`   | `15.5%` (`9.9%`)  | `1.31` | `1.8%` / `0.9%`   | `0.0%` → `0.9%` (`5%`, `0.5%`)    | `25/50/25` `60%` | `Fair > $47.8 (+16.8%)` | **`BUY · INITIATE (≤0.9%) ⚑`**   |
| `CBRS` | `$91.2`  | _suppressed_ (`CLOSE_LONG` / `RETIRED`) | `n/a`             | —      | `n/a`             | `0.0%` → `0.0%` (`5%`, `0.5%`)    | `RETIRED` `90%`  | `n/a`                   | **`AVOID · THESIS BROKEN`**      |

\* Only `ANET` has `nearBoundary = true` under the directional rule. `PDD`'s
nearest geometric edge is actually Fair `$90.174` (`+5.39%`), while `AEHR`'s is
Strong Buy `$38.435` (`−6.07%`); the displayed Buy/Fair triggers are directional,
not nearest-edge claims. `AEHR` at `$40.92 > $38.435` is in Buy, not Deep Value,
so this live snapshot remains `BUY · INITIATE`; the Geo guard must be tested
with a synthetic price at or below `$38.435`.

The normalized holdings sum to `Σ w_curr = 100.0%`; they contain no actual cash
balance. `Σ w_rec = 68.9%` includes the `AEHR` watchlist recommendation, leaving
**residual target cash `31.1%` after the modeled rebalance**, not current cash
headroom. At `ANET 31.4%` (`2.0× Full K`) and `PDD 20.4%` (`2.0× Full K`),
single-asset expected log-growth is `4.05%` and `4.01%` versus `4.00%`
risk-free, supporting the over-Kelly trims. `AEHR 0.9%` also fits
`docs/thesis/AEHR.md:233`'s `≤2%` starter rule.

All per-ticker market timestamps are current on this snapshot, but the flags file
was generated `2026-10-23`; therefore `⚑ FLAGS STALE` applies globally on
`2026-11-20`. AEHR's `⚑` is its separate overdue `2026-11-03` review flag (its
`2026-10-20` filing is 31 days old and no longer active under the 30-day rule).
No checked-in config has `thesis_intact_probability`, so the snapshot disables
that Gate 1 test and shows the board-level migration warning until WO8.

### 4.3 Layer 2 — Unified Valuation Corridor + Forward Scenario Fan Canvas

- **Y-axis and units:** Logarithmic USD scale (`Cleveland 1993`), reusing the
  strict no-overlap collision pipeline in `docs/y-axis-tick-algorithm.md`, with
  `FONT_SIZE = 10` (`10px "JetBrains Mono", monospace`) and currency conversion
  via `LATEST_FX_DATE = '9999-12-31'`. The axis header and crosshair always
  distinguish `raw close / entry price` on the left from `total-return entry
value / account value` on the right; a shared dollar sign does not make those
  units identical.
- **X-axis split (proportional, uniform time scale in default `2y` mode):**
    - Compute `splitRatio = clamp(pastYears / (pastYears + futureYears), 0.30, 0.60)`:
        - Default `2y` in `'eps-corridor'` / `'thesis-broken'` (2Y past / 2Y
          future) → **`50% / 50%`**.
        - Default `2y` in `'horizontal-bands'` (1Y past / 2Y future, `VT` /
          `AEHR`) → **`33.3% / 66.7%`**.
        - `full` mode on 5Y or 10Y horizons clamps at **`30% / 70%`** when the
          natural split is below `0.30`, with `//` and a `compressed scale` note.
    - **Past (`-pastYears .. Today`):** Solid weekly closing-price line fetched
      with explicit `auto_adjust=False`. Each history payload records its price
      basis. A legacy fallback whose adjustment basis cannot be established is
      labeled `legacy closes` and `⚑ PRICE BASIS UNVERIFIED`; it is never
      silently described as raw or dividend-adjusted.
    - **Historical corridor honesty (step-held EPS, disclosed look-ahead):**
        - _Mode 1 — EPS-tracked corridor (`ANET`, `GOOG`, `PDD`):_ Where
          `history.eps` has at least two positive points overlapping the past
          window, multiply each week's step-held $\text{EPS}(d)$ by today's
          model multiples normalized to the latest cached EPS on/before
          `TODAY`: $M(r)=V(r,0)/\text{EPS}_{\text{hist}}(\text{today})$, not
          `market.eps`. On the snapshot, latest cache EPS minus `market.eps` is
          `+4.8%` for `ANET` (`3.91` vs. `3.73`), `+1.3%` for `GOOG` (`19.39`
          vs. `19.15`), and `+11.7%` for `PDD` (`10.1340807` vs. `9.07`). This
          gives geometric continuity at `TODAY`, not proof of historical
          information availability.
        - The cache is sorted and step-held without interpolation, but
          `docs/pe-forward-pe-pipeline.md` records roughly three weeks of
          look-ahead on quarter-end anchors and possible Yahoo adjusted-EPS
          versus GAAP-statement conflicts. Label the mode `Thesis×EPS · cached`
          and disclose `not strictly point-in-time; not for backtesting` in the
          crosshair/details. Sorting and filtering `eps > 0` alone does not fix
          these issues. A future cache schema with authoritative report dates,
          GAAP reconciliation, and manual-patch provenance may remove this
          warning only after those invariants are tested.
        - _Mode 2 — Horizontal 1Y bands (`VT`, `AEHR`):_ With no positive cached
          EPS history, render 1Y prices over horizontal current-thesis bands;
          never invert `VT`'s flat `17.72` P/E.
        - _Mode 3 — Thesis-broken (`CBRS`):_ Render 2Y price history in
          muted/red with `THESIS BROKEN`; suppress valuation bands.
    - **Future (`Today .. Today + min(2Y, T)` default, or full `T`):**
        - Plot dashed iso-CAGR entry-value curves
          $V(r,t)=E[TV_T]/(1+r)^{T-t}$ and three scenario **total-return account
          value** rays $V_i(t)=P_0(1+r_i)^t$. Stroke widths are Base `2px`,
          Bull/Bear `1.25px`, over a lightly shaded Bear–Bull envelope
          (`rgba(..., 0.07)`) labeled `Scenario range (3 states)`, not a
          confidence interval.
        - **Total-return disclosure:** The right header is always `Forward 2Y
total value`, adding `(div. reinvested)` when `dividendYield > 0`.
          The `TODAY` marker reads `PRICE → TOTAL-RETURN VALUE`. Scenario
          endpoints are `endValue` at the visible horizon and
          `terminalTotalValue` at $T$, never `terminalPrice`; terminal labels
          use `→TV`.
        - **Label placement:** Anchor zone tags (`DEEP`, `BUY`, `FAIR`, `RICH`,
          `SELL`) beside `TODAY`. Reserve `padding.right = 156px` for three
          greedily packed labels such as `Bull 20% $402 →TV $1.8k` (≤26 chars ≈
          `156px` at `10px` monospace, `minGap = 12px`).
- **Color & contrast discipline:** Use only existing `css/terminal/base.css`
  semantic tokens (`--green-color` for Deep Value/Buy at `8–14%` alpha,
  transparent/glass for Fair/Hold, `--primary-color` gold for Rich at `9%`
  alpha, `--red-color` for Overvalued at `12%` alpha), paired with inline zone
  tags so no signal is color-only.
- **Interactive hover crosshair (canvas only):**
    - Render on a live DPR-scaled canvas matching `js/transactions/chart.js:75-93`
      and throttle pointer hover via `requestAnimationFrame`.
    - Past: `Date · Raw/Legacy Close · Historical Implied Zone · EPS caveat`.
    - Future: `Date (+X.Xy) · Bear/Base/Bull Total Value · Buy/Fair Entry Value`.
- **No cost-basis line or trade markers:** Omit `average_price` and historical
  buy/sell markers completely (no opt-in flag).

### 4.4 Layer 3 — Integrated Stephen Few Position-Sizing Bullet + Risk Footer

- **Sizing Bullet (DOM / inline SVG, ~22px high):**
    - Quantitative scale: `0%` to
      `scaleMax = max(w_max * 1.25, w_curr * 1.15, 0.10)`.
    - Qualitative zones when Kelly is available: `[0, w_rec]`,
      `[w_rec, w_max]`, and `[w_max, scaleMax]`. When it is unavailable, omit
      the target and over-Kelly zone, show only current weight and cap, and
      print `Kelly n/a`.
    - Featured bar: solid `w_curr` (`19.7%` for `GOOG`, `31.4%` for `ANET`).
    - Comparative markers: vertical tick at `w_rec = min(½K, w_max)` and dashed
      cap hairline at `w_max`.
    - Right-aligned readout: `19.7% / 25.0% target (+5.3% · +$70k) · ½K 33%`;
      when saturated at `fullKelly = 1.0`, print `½K ≥50% (cap)` instead of
      false precision.
- **Risk & Catalyst Footer (~20px high):**
  `Bear +2.8%/yr · Geo 11.8% · 52w $271–$404 · Pred 1/2 (Brier 0.04) · Rev
2026-11-30`, where `Rev` is the latest journal entry's `review_date`, not its
  entry `date`. Append ticker and global flag/staleness pills plus
  (`an <SYM> full | an | an close`).

### 4.5 Companion `PORT` overview (Shneiderman's "Overview First")

When the user types bare `an`, replace the mixed-horizon synthetic `PORT`
summary with a 6-row **Portfolio Decision Board** + 1-line **Portfolio Budget
Footer** (fitting inside `320px` at ~34px/row + 22px header + 22px footer):

- Columns: `TICKER` | `VERDICT` | mini **Valuation Position Spark** (60px bar
  showing `P0` across `[StrongBuy .. Sell]` + directional trigger `%`) | `Mean`
  | mini **Sizing Bullet** | `PROBS / FLAGS` (`35/50/15 · c75%` + `⚑`).
- **Portfolio Budget Footer:** `Normalized Holdings Σw_curr 100.0% · Kelly
Target Σw_rec 68.9% · Residual Target Cash 31.1%`. The last figure is
  `100% − Σw_rec` after all independent single-asset recommendations, including
  watchlist `AEHR`; it is **not actual cash**. Current holdings are normalized
  to 100%, and no cash balance is supplied. When `Σ w_rec > 100%`, display an
  amber `Budget >100% — scale ADDs pro-rata` warning and note that single-asset
  Kelly does not populate cross-asset correlations.
- Sorted by action urgency (`EXIT / AVOID · THESIS BROKEN`, `SELL / TRIM` →
  `TRIM TO CAP / OVER KELLY` → `STRONG BUY / ADD / INITIATE` → `TRIM (RICH)` →
  `HOLD` → `WATCH / PASS`).
- Strictly keyboard-driven: `an <SYM>` opens the Decision Chart, `an <SYM> full`
  renders full $T$, and `an close` closes the pane. Autocomplete tracked ticker
  symbols, `full`, and `close`.

---

## 5. Data, pipeline, and bug-fix prerequisites

Implementing the Decision Chart cleanly requires four targeted repo changes
beyond the UI renderer itself:

1. **Per-ticker compact history & live derived math in `sync_configs.py`:**
   `sync_configs.py:223-275` already fetches `yfinance` history for every ticker
   in `holdings ∪ watchlist`. Extend it to:
    - Derive `market.eps = price / pe` when trailing EPS is omitted (`VT`),
      normalize source-specific dividend payloads into the repository's
      percentage-point `market.dividendYield` contract, and recompute GH-7 Kelly
      with explicit missing-volatility handling.
    - Fetch chart closes separately with `auto_adjust=False`; keep volatility
      estimation on adjusted total-return closes with explicit
      `auto_adjust=True`. Record every emitted price basis.
    - Emit compact `data/analysis/<SYM>.history.json`: 2Y weekly closes with a
      disclosed legacy offline fallback plus positive quarterly cached TTM EPS.
      The EPS series is step-held and **not certified point-in-time**. Missing
      cache EPS yields `eps: []` and horizontal 1Y bands.
    - Fix the orphan-cleanup loop so `theme_timeline.json` and tracked
      `<SYM>.history.json` survive full and `--ticker <SYM>` runs.
2. **Consistent freshest-available prices & normalized portfolio weights:** Wire
   `lab.js` to `fetchRealTimeData()` (`realtimeData.js:130-214`) when available,
   reading normalized fractions from `composition[i].percent / 100` (or
   `tickerWeights[sym] / balance`, never raw USD `tickerWeights[sym]`) and
   available `prices[sym]`. Localhost currently reads static `fund_data.json`;
   production tries a Worker then falls back. Always disclose the resulting
   price timestamp/source and use `holdings_details.json` × `market.price` when
   offline; do not promise a guaranteed live quote.
3. **Fix valuation/journal bugs and migrate thesis semantics:**
    - Guard `computeDerivedScenarioOutcome` against effective `eps <= 0`.
    - Sort `decision_journal` ascending by ISO `date`; use the newest entry's
      `review_date` for `Rev`.
    - Include reinvested dividends in JS/Python total-return compounding and
      verify parity of `expectedMultiple`, mean-wealth `expectedCagr`, `fullKelly`,
      and `scaledKelly` within `1e-4`.
    - Preserve legacy `belief_state.probability`; introduce explicitly reviewed
      `belief_state.thesis_intact_probability` through the thesis-update
      workflow, regenerate configs, and only then enable Gate 1's probability
      threshold. Display `Bull/Base/Bear` + `Conf %` separately.
4. **Update layout & visual gates:** Keep the `320px` viewport-fit contract in
   `scripts/check_analysis_pane_layout.mjs` (`make analysis-layout-check`) and
   verify live glass legibility in Chrome (`make screenshot URL=/terminal/`)
   before finalizing band fill opacities.

---

## 6. Open questions / what I couldn't verify

- **Exact proprietary GuruFocus GF Value formula:** The official tutorial
  supports the corridor and qualitative ratings, but not the draft's earlier
  exact ratio boundaries or universal dashed three-year projection. Our formula
  $V(r,t)=E[TV_T]/(1+r)^{T-t}$ is transparent and derived from this repository's
  model rather than reverse-engineering GF Value.
- **Liquid-glass legibility over bright background regions:** As documented in
  `docs/analysis-pane-visual-design.md:439-456`, the bright face region of
  `terminal_background.jpg` reduces muted text contrast on the glass slab at
  `1440×900`. Subtle canvas fills and zone tags must be checked in Chromium
  (`make screenshot URL=/terminal/`).
- **Cross-asset correlations & explicit catastrophe states:** GH-7 reduces the
  single-asset variance understatement but does not solve portfolio dependence.
  `risk.correlations` is currently `null` in all configs (so `GOOG` + `ANET`
  AI-capex co-movement is not penalized in multi-asset Kelly), and none of the 6
  configs includes an explicit `-90%` catastrophe state per
  `docs/fermat-pascal-kelly-system.md:38`. Both remain thesis-authoring upgrades.
- **Strict point-in-time EPS provenance:** The current cache mixes anchor types
  and lacks sufficient source metadata to certify zero look-ahead. The initial
  renderer therefore carries the §4.3 caveat. Removing it requires a migrated
  cache with authoritative report dates, GAAP reconciliation, and patch lineage.

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
- **Status (2026-11-23):** **Complete** in local commit `3f2eee9c` on
  `fix/analysis-derived-kelly`. Scoped verification passed with 78 tests;
  `make precommit-fix` passed 864 Python tests and all 191 JS suites / 3,160
  tests in each configured timezone. Diff coverage is 100% (177/177 changed
  lines). No `data/` files were changed. WO2 is the next pending work order.
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
       `'eps' not in market_metadata` and both `market.get('price')` and
       `market.get('pe')` are positive finite numbers, set
       `derived_eps = maybe_round(market['price'] / market['pe'])` and update
       `market['eps']` if changed.
    2. Add a pure helper
       `solve_gh7_kelly(scenario_returns, sigma, risk_free_rate=0.04, cap=1.0)`
       using the standard probabilists' GH-7 constants (rounded as shown):
        - `GH7_NODES = (-3.7504397177, -2.3667594107, -1.1544053947, 0.0, 1.1544053947, 2.3667594107, 3.7504397177)`
        - `GH7_WEIGHTS = (0.0005482689, 0.030757124, 0.2401231786, 0.4571428571, 0.2401231786, 0.030757124, 0.0005482689)`
          Return `None` when `sigma` is missing, non-finite, or negative. When
          `sigma > 0`, expand each `(prob, r_i)` into
          `(prob * w_k, (1 + r_i) * exp(sigma * z_k - 0.5 * sigma**2) - 1)`;
          when `sigma == 0`, pass `(prob, r_i)` directly. Solve
          $\sum p(r-r_f)/(1+r_f+f(r-r_f))=0$ on `[0.0, hi]`. Initialize
          `hi = cap`, then for **each** `r < r_f` reduce it with
          `hi = min(hi, (1 + r_f) / (r_f - r) * (1 - 1e-7))`. If there are no
          losing states, `hi` remains `cap` (no empty `min()`). Return `0.0`
          when the derivative at zero is `<= 0`, return `hi` when the derivative
          at `hi` is `>= 0`, and otherwise use 80-step bisection. Reject invalid
          probabilities, `1 + r_i <= 0`, and `1 + risk_free_rate <= 0`.
    3. In `recompute_derived`, read `raw_div = market.get('dividendYield')`
       after the ingestion adapter has normalized source-specific payloads into
       the repository's percentage-point schema. For a finite numeric value,
       use `div_rate = min(0.25, max(0.0, float(raw_div) / 100.0))`, multiply
       each scenario multiple by `(1 + div_rate) ** horizon`, and recompute
       `derived['kelly'] = {'fullKelly': round(full_k, 4), 'scaledKelly':
round(full_k * kelly_scale, 4)}` using
       `sigma = overrides.get('volatility', risk.get('volatility'))` and
       `risk_free_rate = preferences.get('riskFreeRate', 0.04)`. Set both Kelly
       fields to `None` when inputs are invalid, volatility is unavailable, or
       all scenarios are `RETIRED`-prefixed. Keep the schema name
       `expectedCagr`, but document that it is Mean-wealth CAGR. Keep
       `fairValueRange` as passthrough only for schema compatibility.
    4. Update `test_stale_values_are_corrected_and_judgment_fields_preserved`
       and add tests for ETF EPS derivation, percentage-point dividend
       compounding (`1.56` → `1.56%`), the `sigma = 0` discrete limit, missing /
       negative volatility, an all-winning return set with no losing-state
       bound, saturation at `cap`, and GH-7 versus GH-80 absolute Kelly error
       below `0.0001` (**0.01 percentage points**) on the live active profiles.
- **Verify:** `venv/bin/pytest tests/python/ -k sync_configs && venv/bin/ruff check scripts/analysis/sync_configs.py tests/python/test_sync_configs_derived.py && venv/bin/mypy scripts/analysis/sync_configs.py`
- **Guardrail:** The repository's `market.dividendYield` schema is percentage
  points (`0.32` for `GOOG`, `1.56` for `VT`), and the frontend formats it as a
  percentage. Normalize older/source-specific fractional payloads at ingestion;
  do not assume all `yfinance` versions or payloads share one unit convention.

---

### WO2 `[low]` — Emit compact per-ticker `data/analysis/<SYM>.history.json` in `sync_configs.py` and fix orphan cleanup

- **File:** `scripts/analysis/sync_configs.py` and new
  `tests/python/test_sync_configs_history.py`
- **Status (2026-11-23):** **Complete** in local commit `e7a885b7` on `main`.
  Scoped verification (`pytest -k sync_configs`: 82 passed, `ruff`, `black`,
  `mypy`) passed and regenerated `data/analysis/*.history.json` +
  `index.json`. WO3 is next.
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
    2. Make the existing volatility fetch explicit
       `ticker.history(period='1y', interval='1d', auto_adjust=True)` so risk
       uses adjusted total-return closes. Separately add
       `build_ticker_history(symbol, ticker)` using
       `ticker.history(period='2y', interval='1wk', auto_adjust=False)` for raw
       chart closes. On offline/mocked failure, fall back to
       `data/historical_prices.json` but mark its basis `legacyClose` and
       `priceBasisVerified: false`; never silently relabel it raw.
    3. Merge positive quarterly TTM EPS from
       `data/checkpoints/fetched_eps_cache.json`, sorted by date and filtered to
       finite `eps > 0`, with no interpolation. Set
       `epsPointInTimeCertified: false` and retain the §4.3 quarter-end /
       EPS-basis caveat; sorting alone does not establish information
       availability.
    4. Write `data/analysis/<SYM>.history.json` with schema
       `{"symbol", "asOf", "priceBasis": "rawClose" | "legacyClose",
"priceBasisVerified": boolean, "epsPointInTimeCertified": false,
"prices": [{"d": "YYYY-MM-DD", "c": float}], "eps": [{"d":
"YYYY-MM-DD", "v": float}]}` for every symbol in `tracked_symbols`.
       Respect `--ticker <SYM>` so untouched tickers keep existing history.
    5. Add `"historyPath": f"../data/analysis/{symbol}.history.json"` to each
       `index_payload['tickers']` entry.
    6. Add unit tests covering schema and unit metadata, explicit
       `auto_adjust=True` volatility / `False` chart calls, legacy fallback
       disclosure, EPS filtering and non-certification, and orphan cleanup
       preserving tracked history and `theme_timeline.json` under full and
       scoped runs.
    7. Run `venv/bin/python -m scripts.analysis.sync_configs` to generate the
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
- **Status (2026-11-23):** **Complete** in local commit `77c93c43` on `main`.
  `eslint --max-warnings=0`, `jest decision.test.js` (10 passed), `ruff`, and
  `pytest` (`test_sync_configs_derived.py` + `test_analysis_math_parity.py`, 52
  passed) all passed. WO4 is next.
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
        - Guard `computeDerivedScenarioOutcome` against effective `eps <= 0`.
          Otherwise keep `terminalPrice = terminalEps * exitPe` price-only,
          compute `terminalTotalValue = terminalPrice * (1 + divRate) ** horizon`,
          and derive `multiple` and `totalReturnCagr` from
          `terminalTotalValue / price`. Use the repository percentage-point
          dividend schema. Rename the old misleading `priceCagr` consumer field
          to `totalReturnCagr`; do not multiply `terminalPrice` itself by the
          dividend factor.
        - Update `KELLY_FRACTION_CAP = 1` and use the same GH-7 constants and
          feasibility-bound algorithm as WO1, including `hi = cap` when no state
          loses to cash, the derivative-at-`hi` saturation check, and `null` for
          missing / negative / non-finite volatility. Expand
          `totalReturnCagr`, not a price-only CAGR.
        - Keep `computeGeometricCagr` and `computeScenarioVolatility` on
          unexpanded scenario outcomes, expose both `terminalPrice` and
          `terminalTotalValue`, and run Kelly only on expanded GH pairs. Never
          read `config.derived.kelly` or `position.maxKellyWeight` as sizing
          inputs.
    2. Create `js/pages/analysis/decision.js` exporting pure functions:
        - `getLatestJournalEntry(journal)` — newest entry by ISO `date`; footer
          `Rev` reads that entry's `review_date`.
        - `computeIsoCagrBands(expectedTerminalTotalValue, horizon, { targetCagr,
benchmark, riskFreeRate = 0.04, strongCagr = targetCagr + 0.05 }, t =
0)` — returns `{ strongBuy, buy, fair, sell }` via
          $V(r,t)=E[TV_T]/(1+r)^{T-t}$. Return `null` only for non-positive
          terminal value/horizon, invalid rates, `t < 0`, or `t > horizon`.
          **`t === horizon` is valid** and every band equals expected terminal
          total value.
        - `evaluateTickerDecision(config, metrics, { currentWeight = 0,
eventFlags = [], flagsGeneratedAt = null, nowMs })` with required
          finite `nowMs` — implements §4.2, including the new optional
          `thesis_intact_probability` only, `Geo >= targetCagr`, unavailable-
          Kelly behavior, directional Buy/Fair trigger and matching
          `nearBoundary`, 30-day filing / overdue-review activation, and separate
          `marketStale` and global `flagsGeneratedAt` staleness. Return
          `targetWeight: null` and `weightDelta: null` when Kelly is unavailable.
        - `buildDecisionSnapshot(...)` uses compact `Mean`, and
          `buildBoardSnapshot(...)` labels `100% − Σw_rec` as residual target
          cash, not current cash. Board-level migration and flags-staleness
          warnings are computed once from all rows/file metadata.
    3. Add tests asserting all six snapshot verdicts and directional triggers.
       In particular, live `AEHR` remains `BUY · INITIATE` (not Deep Value); a
       **synthetic** `P0 <= 38.435` with the same Geo exercises the downgrade
       from Deep Value to Buy. Assert `PDD` selects `Buy < 70.103` despite Fair
       being geometrically closer, `ANET` alone is near boundary, `t === T`
       returns terminal total value, an all-winning Kelly set does not call an
       empty `min`, missing volatility yields data-unavailable behavior, and the
       stale flags file marks all rows. Test filing day 30 versus 31, overdue
       review activation, and the correct `GOOG` `Rev 2026-11-30`.
    4. Add migration tests proving legacy `belief_state.probability = 0.01` does
       not trip Gate 1, an explicitly reviewed
       `thesis_intact_probability = 0.14` does, and no value is inferred from
       Bull/Base/Bear probabilities. Add Python↔JS parity assertions for
       `expectedMultiple`, mean-wealth `expectedCagr`, `fullKelly`, and
       `scaledKelly` within `1e-4`.
- **Verify:** `npx jest tests/js/pages/analysis/decision.test.js && npx eslint js/pages/analysis/decision.js && venv/bin/pytest tests/python/test_sync_configs_derived.py tests/python/test_analysis_math_parity.py`
- **Guardrail:** Keep `decision.js` DOM-free and side-effect free; require
  `nowMs` rather than defaulting to wall-clock time so tests are deterministic
  under `TZ=UTC`. Gate 1 tests effective EPS and never treats
  `derived.fairValueRange` as an escape hatch.

---

### WO4 `[design]` — Build the DPR-scaled Valuation Corridor + Forward Scenario Fan canvas with hover crosshair

- **File:** New module `js/pages/analysis/decisionChart.js` and unit test suite
  `tests/js/pages/analysis/decisionChart.test.js`
- **Status (2026-11-23):** **Complete** in local commit `c9d1df21` on `main`.
  `prettier`, `eslint --max-warnings=0`, and `jest decisionChart.test.js` (5
  passed) all passed. WO5 is next.
- **Find:** New module; imports `computeIsoCagrBands` from `./decision.js`,
  currency conversion helpers (`convertValueToCurrency`, `formatCurrency`) from
  `../../transactions/utils.js`, and `getSelectedCurrency` from
  `../../transactions/state.js`. Reuse the DPR backing-store guard pattern from
  `js/transactions/chart.js:75-93` and the greedy collision invariant
  (`minSpacingPixels = Math.floor(fontSize)`) from
  `docs/y-axis-tick-algorithm.md`.
- **Change:** Create `js/pages/analysis/decisionChart.js` split into **pure
  geometry / hit-testing** and **canvas painting / pointer lifecycle**:
    1. **Typography & padding:** `CHART_FONT_SIZE = 10` (`10px "JetBrains Mono",
monospace`, ~`6px/char`); default
       `padding = { top: 16, right: 156, bottom: 22, left: 54 }`. The `156px`
       right margin fits labels such as `Bull 20% $402 →TV $1.8k` without
       clipping.
    2. **Export `computeLogTicks(...)`:** Generate `{1, 1.5, 2, 3, 5, 7} *
10^k` candidates plus current `P0` and outer bounds; greedily pack by
       priority with at least `Math.floor(fontSize)` vertical separation, per
       `docs/y-axis-tick-algorithm.md`.
    3. **Export `buildDecisionChartGeometry({ config, history, decision, metrics,
horizonMode = '2y', width, height, padding })`:**
        - **Mode selection:** `'thesis-broken'` when Gate 1 trips;
          `'eps-corridor'` with at least two positive cached EPS points in the
          2Y window; otherwise `'horizontal-bands'` with 1Y history. In EPS mode,
          `epsHistAtToday` is the latest positive point on/before `todayMs` and
          `M(r) = bandToday[r] / epsHistAtToday`. Apply step-held EPS without
          interpolation. Return `priceBasis`, `priceBasisVerified`,
          `epsPointInTimeCertified`, and `unitBreak = 'PRICE → TOTAL-RETURN
VALUE'`; geometric continuity at `TODAY` is not an economic-unit or
          look-ahead claim.
        - **X split:** `pastYears = mode === 'horizontal-bands' ? 1 : 2`;
          `futureYears = horizonMode === 'full' ? horizon : Math.min(2,
horizon)`; `naturalSplit = pastYears / (pastYears + futureYears)`;
          `splitRatio = clamp(naturalSplit, 0.30, 0.60)`;
          `hasScaleBreak = Math.abs(splitRatio - naturalSplit) > 0.02`. Map past
          and future linearly on either side of `xToday`.
        - **Forward curves & scenario value rays:** Sample 25 offsets including
          both `t = 0` and `t = futureYears`. Call
          `computeIsoCagrBands(expectedTerminalTotalValue, horizon, bandOpts,
t)`. Compute $V_i(t)=P_0(1+\text{totalReturnCagr}_i)^t$, storing
          `prob`, `endValue`, and `terminalTotalValue`, never a dividend-
          inclusive `terminalPrice`. Include `hasDividends` only as a label
          modifier, not as a switch between total-return and price-return math.
        - **Y bounds:** Compute `coreMin/coreMax` over positive historical
          closes, `todayPrice`, and visible scenario values. Include visible
          iso-CAGR values clamped to `[0.35 * coreMin, 3.0 * coreMax]`, pad `±8%`
          in log space, and use the log `yScale`. The axis/crosshair retain the
          side-specific unit labels from §4.3.
        - **Right-edge labels:** Pack the three scenario value labels (`→TV`)
          with `minGap = 12px`, clamped inside the plot.
    4. **Export `resolveCrosshairHit(pointerX, geometry)`:**
        - Return `null` outside the plot. Past hits binary-search weekly closes
          and return `{ side: 'past', date, close, priceBasis, zoneLabel,
epsPointInTimeCertified }` with the cached-EPS/legacy-basis caveat.
        - Future hits compute `yearsAhead` and return
          `{ side: 'future', yearsAhead, bullValue, baseValue, bearValue,
buyEntryValue, fairEntryValue, hasScaleBreak, hasDividends, unit:
'totalReturnValue' }`.
    5. **Export `renderDecisionChart(canvas, payload, colors, crosshairHit = null)`:**
        - Read `getBoundingClientRect()` and bail on `0×0`; size the backing
          store with `dpr = min(devicePixelRatio || 1, 2)` and call
          `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.
        - Paint in order: valuation zones/tags; log grid and time labels;
          dashed entry-value curves plus `Thesis×EPS · cached` / `Current bands`
          and `Forward ${futureYears}Y total value` headers; scenario envelope
          and value rays; `TODAY` hairline, unit-break marker, historical close;
          then clamped crosshair readout. Add `(div. reinvested)` when
          applicable, `⚑ PRICE BASIS UNVERIFIED` for legacy fallback, and `//`
          for a compressed scale. Use `→TV` endpoint labels.
        - Set the canvas `aria-label` with verdict, current price, Buy entry
          threshold, directional trigger, and `Mean` (expanded in accessible
          text as Mean-wealth CAGR).
    6. **Export `attachDecisionChartInteractions(canvas, getRenderArgs)`:**
       Throttle `pointermove` through `requestAnimationFrame`, clear on
       `pointerleave`, redraw through `ResizeObserver`, and return `detach()` so
       listeners are never duplicated.
    7. **Tests:** Cover all three modes; geometric continuity with `PDD` cache
       EPS `10.1340807` vs. market `9.07`; explicit cached-EPS and legacy-price
       caveats; the `PRICE → TOTAL-RETURN VALUE` marker; `2y` versus full scale
       break; log-ratio symmetry; `yMax_full >= terminalBullTotalValue`; valid
       terminal samples at `t = T`; tick collision invariants; past/future
       crosshair units; `→TV` labels; and clean stub-canvas rendering including
       `0×0` bailout.
- **Verify:** `npx jest tests/js/pages/analysis/decisionChart.test.js && npx eslint js/pages/analysis/decisionChart.js`
- **Guardrail:** Never draw over a `0×0` backing store, never call a
  dividend-inclusive value a terminal price, and never plot cost basis or trade
  markers.

---

### WO5 `[design]` — Replace the 9-section `lab.js` UI with the 2-view Decision Board + Decision Chart and prune dead code

- **File:** `js/pages/analysis/lab.js`, `js/pages/analysis/bayes.js`, delete
  `js/pages/analysis/monte_carlo.worker.js` and
  `tests/js/pages/analysis/monte_carlo.worker.test.js`, update
  `tests/js/pages/analysis/bayes.test.js` and `tests/js/pages/analysis/lab*.test.js`
- **Status (2026-11-23):** **Complete** in local commit on `main`. Replaced the
  9-section lab UI with the 2-view Decision Board + Decision Chart, wired
  `fetchRealTimeData()` normalized weights and live prices, deleted
  `monte_carlo.worker.js` (+ test), trimmed `bayes.js` to
  `computeBrierScore`, and consolidated tests (5 Jest suites / 35 tests,
  `make depcheck`, and zero-reference guardrail all passed). WO6 is next.
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

    3. **Streamline `buildConfigs()` data loading, freshest-available prices &
       normalized weights:**
        - Fetch `index.json`, `event_flags.json`, `holdings_details.json`, and
          `fetchRealTimeData().catch(() => null)` in parallel; drop evidence and
          thesis-markdown fetches. Capture one `nowMs` for all decision calls.
        - Fetch each config and `historyPath`; on history failure use empty
          arrays plus `priceBasis: 'unavailable'`, `priceBasisVerified: false`,
          and `epsPointInTimeCertified: false`.
        - `realTimeData.tickerWeights[sym]` is USD market value. Resolve weight
          from `composition[i].percent / 100` (or
          `tickerWeights[sym] / balance` when `balance > 0`), falling back to
          `cfg.marketValue / totalValue`. Store
          `state.portfolioTotalValue = realTimeData?.balance || totalValue`.
          Apply an available positive price only when no override exists, and
          record the actual fetcher source/timestamp rather than hard-coding
          `live`; localhost static data and production fallback must remain
          distinguishable.
        - Compute metrics and call `evaluateTickerDecision` with
          `{ currentWeight: cfg.weight, eventFlags: flagsBySymbol[cfg.symbol],
flagsGeneratedAt: eventFlags?.generatedAt, nowMs }`.
        - Remove `buildPortfolioConfig`, `aggregateScenarios`,
          `CORRELATION_MAP`, `computePortfolioCovarianceVolatility`, and the
          legacy section DOM/canvas renderers and MC/sandbox functions.
    4. **Implement the 2 view renderers (XSS-safe `createElement`/`textContent`):**
        - `renderDecisionBoard()`: sort by `decision.sortPriority`; render
          `symbol`, verdict, valuation-position bar, compact `Mean`, sizing
          bullet, scenario split, confidence, and flags. Populate the footer
          with normalized `Σ w_curr`, `Σ w_rec`, and **residual target cash**
          (`100% − Σ w_rec`), explicitly noting that this is not actual cash and
          includes watchlist recommendations. Show board-level
          `THESIS PROB UNMIGRATED` while any config lacks the new field and
          `FLAGS STALE` from the file-level timestamp. Non-clickable.
        - `renderTickerDecision(config)`:
            - Layer 1 renders identity, verdict, `Mean`, directional
              `nextTrigger`, scenario split/confidence, and ticker/global flags.
            - Layer 2 calls `renderDecisionChart` and attaches interactions once.
            - Layer 3 renders the sizing bullet, with `Kelly n/a` and no target
              or over-Kelly zone when unavailable. The risk footer shows Bear
              CAGR, Geo, 52w range, prediction/Brier metrics, and the latest
              journal entry's **`review_date`** as `Rev`, plus global/ticker
              flags and the command hint.
        - `renderContextStrip()`: compact read-only `PORT` + symbols with
          `aria-current`, `BOARD · <asOf>` or `2Y` / `FULL <T>Y`, and global
          `FLAGS STALE` / thesis-migration warnings where applicable.
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
- **Status (2026-11-23):** **Complete** in local commit on `main`. Simplified
  terminal command grammar to `analysis`, `an <TICKER> [full]`, and `an close`,
  updated `help.js` and ticker/`full` autocomplete, deleted temporary WO5 shims
  from `lab.js`, and verified real-import export contract (7 Jest suites / 55
  tests and `eslint --max-warnings=0` passed). WO7 is next.
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
- **Status (2026-11-23):** **Complete** in local commit on `main` (**visual —
  human review required**). Styled the 2-view Decision pane under
  `.analysis-pane`, updated `check_analysis_pane_layout.mjs` (`248/248px`,
  `overflow 0` across `board` and all 6 ticker views including `goog full`),
  inspected live Chromium screenshots (`board` and `GOOG` over liquid glass),
  and ran `stylelint` + `make precommit-fix`. WO8 is next.
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

### WO8 `[design]` — Migrate thesis-intact probability explicitly and update repo documentation

- **Status (2026-11-23):** **Complete** in local commit on `main`. Added the
  Decision Chart pane landmine to `AGENTS.md`, marked superseded legacy pane/merge
  docs, updated `.agents/skills/thesis-update/SKILL.md` (plus synced
  `.claude/commands/thesis-update.md`), updated `sync_configs.py`
  `ensure_structure` to preserve `belief_state.thesis_intact_probability`,
  migrated all six tickers (`AEHR`, `ANET`, `CBRS`, `GOOG`, `PDD`, `VT`) via the
  acknowledged thesis-update workflow, and verified `decision.test.js`,
  `lab.test.js`, `test_skills.py`, `test_doc_tool_references.py`, `make sync-check`,
  and `make precommit-fix`.
- **File:** `AGENTS.md`, `docs/analysis-pane-visual-design.md`,
  `docs/terminal-analysis-merge.md`, `.agents/skills/thesis-update/SKILL.md`,
  all six `docs/thesis/<SYM>.md` / `data/analysis/<SYM>.json` judgment sections
  through the thesis-update workflow, and decision tests
- **Find:** Revalidate these four current-file anchors before editing: the
  `## Layout` / `## Subsystem landmines` guidance in `AGENTS.md`; the existing
  analysis-pane layout and overlay contract in
  `docs/analysis-pane-visual-design.md`; the current `an` command and pane
  integration in `docs/terminal-analysis-merge.md`; and the judgment-field,
  review-acknowledgement, and config-regeneration rules in
  `.agents/skills/thesis-update/SKILL.md`. The repository's current behavior,
  not this design's proposed state, is the source of truth for those edits.
- **Change:**
    1. Add the **Analysis Decision Chart pane** landmine bullet in `AGENTS.md`:
       2-view grammar, GH-7 parity, price-versus-total-return units, USD
       `realTimeData.tickerWeights`, directional triggers, and the two staleness
       scopes. Mark superseded layout docs without claiming the work is live
       until the preceding orders have actually landed.
    2. Update `.agents/skills/thesis-update/SKILL.md` to record that
       `sync_configs` owns GH-7 `derived.kelly` and that `expectedCagr` means
       Mean-wealth CAGR. Preserve legacy `belief_state.probability` as an
       ambiguous legacy field; document the new optional
       `belief_state.thesis_intact_probability` as the only probability eligible
       for Gate 1's `<0.15` test.
    3. Run an explicit per-ticker thesis review for `AEHR`, `ANET`, `CBRS`,
       `GOOG`, `PDD`, and `VT`. For each, record the reviewed
       `thesis_intact_probability`, review date, and primary-source rationale in
       the thesis/journal through the thesis-update workflow. **Never copy or
       infer it from legacy `belief_state.probability`, Bull/Base/Bear
       probabilities, or confidence.** Obtain the user's acknowledgement of the
       judgment edits as required by that workflow, then regenerate each config
       with `venv/bin/python -m scripts.analysis.sync_configs --ticker <SYM>`.
       Do not manually edit generated `market` or `derived` fields.
    4. Keep Gate 1's probability test disabled for any ticker missing the new
       field and show the board-level migration warning. Only remove that
       warning after all six reviewed migrations are present. Add tests proving
       legacy values retain no new semantics and reviewed low values trip Gate 1.
- **Verify:** `npx jest tests/js/pages/analysis/decision.test.js && venv/bin/pytest tests/python/test_doc_tool_references.py tests/python/test_skills.py && make sync-check`
- **Guardrail:** Edit `.agents/skills/thesis-update/SKILL.md` directly (never
  `.claude/commands/`). This order is not doc-only: judgment fields change only
  through the acknowledged thesis-update workflow and `data/` is regenerated,
  never hand-patched as a shortcut.

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
  `js/transactions/realtimeData.js`, `data/analysis/*.json`,
  `data/analysis/event_flags.json`, `data/holdings_details.json`,
  `data/historical_prices.json`, `data/output/figures/pe_ratio.json`,
  `data/checkpoints/fetched_eps_cache.json` — Checked-in configs and data
  coverage as of `2026-11-20`.
- `docs/analysis-pane-visual-design.md`, `docs/terminal-analysis-merge.md`,
  `docs/fermat-pascal-kelly-system.md`, `docs/pe-forward-pe-pipeline.md` — Prior
  design, mathematical specifications, and EPS-provenance limitations.

### External primary sources

- **GuruFocus GF Value:** Official GF Value tutorial
  (`https://www.gurufocus.com/tutorial/article/99/gf-value`).
- **Morningstar Uncertainty Rating:** Official rating and exact 5-star / 1-star
  threshold table
  (`https://www.morningstar.com/stocks/an-introduction-morningstar-uncertainty-rating`).
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
  Computing Systems_, DOI `10.1145/3173574.3173718`
  (`https://users.eecs.northwestern.edu/~jhullman/pn1957-fernandes.pdf`).
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
  _Journal of Economic Behavior & Organization_, 107, 541–552
  (`https://pmc.ncbi.nlm.nih.gov/articles/PMC4357845/`).
