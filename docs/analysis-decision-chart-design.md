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

1. **Decision Verdict Strip (top, ~28px DOM):** One unambiguous, thesis-gated
   action badge (`STRONG BUY`, `ADD`, `HOLD`, `HOLD · AT CAP`, `TRIM`, `SELL`,
   `WATCH`, or `AVOID · THESIS BROKEN`) computed by a deterministic **3-Gate
   Decision Engine** (Thesis Integrity → Iso-CAGR Valuation Zone → Kelly/Cap
   Sizing Gap with a no-trade deadband), alongside `E[CAGR]`, `Edge`, `Belief`,
   and `asOf` date.
2. **Unified Log-Scale Valuation Corridor + Forward Scenario Fan (middle,
   ~210–330px DPR canvas):** One continuous time-series canvas split at a
   crisp `TODAY` vertical hairline:
    - **Left (Past 2Y):** Solid daily/weekly historical price line over
      Fermat–Pascal **iso-CAGR valuation zones** — sloped by point-in-time TTM
      EPS where positive historical EPS exists (`ANET`, `GOOG`, `PDD`,
      explicitly labeled as current-thesis multiple × historical EPS) and
      horizontal current-thesis bands where it does not (`VT`, `AEHR`).
    - **Right (Next 2Y default, full horizon `T` via `an <TICKER> full`):**
      Dashed forward iso-CAGR curves ($V(r, t) = E[P_T] / (1 + r)^{T - t}$)
      overlaid with the shaded deterministic **Bear / Base / Bull probability
      fan** and direct right-edge labels (including terminal $T$-year targets),
      plus a hover crosshair on the chart canvas.
    - **Behavioral debiasing:** Average purchase price / cost basis and past
      trade markers are **omitted completely** so the eye anchors to forward
      expected return rather than sunk cost (Odean 1998; Frydman & Rangel
      2014).
3. **Integrated Stephen Few Sizing Bullet + Risk Footer (bottom, ~44px DOM):**
   Replaces the squashed `0–1000%` Kelly growth curve as the primary sizing
   visual with a compact horizontal bullet bar scaled to `[0, max(1.25 * w_max,
1.15 * w_curr)]`, contrasting current weight (`w_curr`) against capped
   fractional Kelly (`w_rec = min(½K, w_max)`) and `maxWeight`, followed by a
   single-line risk/catalyst digest (`Bear CAGR`, `52w range`, prediction
   record, and active `event_flags` badge).

To complete Shneiderman's _"Overview first, zoom and filter, then
details-on-demand"_ mantra (1996) without UI bloat, bare `an` (`PORT`) lands on
a 6-row **Small-Multiples Decision Board** (one verdict pill + mini price-zone
spark + sizing bullet per ticker), `an <TICKER>` opens that ticker's **Decision
Chart** immediately (with `an <TICKER> full` for the full $T$-year horizon),
and the 9 legacy subcommand views (`scenarios`, `value`, `kelly`, `mc`,
`belief`, `evidence`, `predictions`, `journal`, plus the `bull`/`bear`/`reset`
sandbox) are removed from the terminal pane.

## Locked design decisions

Resolved interactively via `/grill-me` (all downstream specs and work orders
below reflect these choices):

| Branch                             | Locked Decision                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pane views & command surface**   | **2 views only:** `an` (`PORT` Decision Board) and `an <TICKER> [full]` (Single-Ticker Decision Chart), plus `an close`. Remove all 9 legacy subcommand views from `/terminal/`.                                                                                                                                                                                                     |
| **Pointer & keyboard interaction** | **Strict keyboard-only navigation** (`an`, `an <TICKER> [full]`, `an close` + ticker autocomplete); **hover crosshair on the chart canvas only** (no clickable board rows or context strip, no vertical "What-If Price" probe).                                                                                                                                                      |
| **Historical prices & EPS source** | Extend `scripts/analysis/sync_configs.py` to emit compact `data/analysis/<SYM>.history.json` (~3 KB per ticker: 2Y weekly closes + point-in-time quarterly EPS) so both held and watchlist tickers (`AEHR`, `CBRS`) render full charts without loading the 8.9 MB `historical_prices.json` monolith.                                                                                 |
| **Forward cone & horizon**         | **2Y forward cone by default** (with terminal $T$-year Bear/Base/Bull targets printed inline on the right edge), deterministic Bear/Base/Bull paths (instant render, no Monte Carlo worker), and optional `an <TICKER> full` for the full $T$-year horizon.                                                                                                                          |
| **Dividends & `VT` model fix**     | Include reinvested `dividendYield` (`dividendYield / 100`, since `yfinance` stores percentage points) in total-return compounding across all tickers per `docs/fermat-pascal-kelly-system.md:39`, AND derive `eps = price / pe` in `sync_configs.py` whenever `trailingEps` is null (fixing `VT`'s stale `6.22` EPS → `~8.02` and lifting modeled `E[CAGR]` from `2.2%` to `~9.2%`). |
| **Cost basis & trade markers**     | **Omit completely** (no cost-basis line, no buy/sell markers, no `--trades` flag) so the chart stays strictly forward-looking and avoids anchoring bias (Odean 1998; Frydman & Rangel 2014).                                                                                                                                                                                         |
| **Dead-code cleanup**              | Prune all 9 legacy UI renderers, `js/pages/analysis/monte_carlo.worker.js` (+ its test), and unused `js/pages/analysis/bayes.js` replay/sandbox code (retaining only `computeBrierScore` and core Fermat–Pascal/Kelly math); update `scripts/check_analysis_pane_layout.mjs` and Jest suites.                                                                                        |

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

Because none of the six configs currently include a left-tail crash scenario
(all six have strictly 3 states: `bull`, `base`, `bear`, with `GOOG` Bear still
`+2.4%/yr`), unconstrained `fullKelly` hits `134%–1000%` on four of six
tickers. On `#kellyCurveCanvas` (`lab.js:1416-1490`), the X-axis stretches to
`2× fullKelly` or `zeroGrowthFraction`, crushing `Curr: 19.7%` and the `25%`
cap into the leftmost 2–5% of the canvas.

### 1.4 Static, axis-less canvases and zero price-history context

- All three existing canvases (`#kellyCurveCanvas` `1200×400`,
  `#monteCarloCanvas` `1200×240`, `#monteCarloFanCanvas` `1200×240`;
  `lab.js:135-165`) use fixed HTML attributes scaled by `object-fit: contain`
  without DPR scaling or ResizeObserver (`css/terminal/analysis.css:296-301`),
  whereas `#runningAmountCanvas` uses live DPR scaling (`js/transactions/chart.js:75-93`)
  and full pointer crosshair interaction (`js/transactions/chart/interaction.js:1209-1240`).
- `#monteCarloCanvas` and `#monteCarloFanCanvas` draw **zero X-axis or Y-axis
  numeric ticks** (`lab.js:2176-2302`), and `runPathSimulation` omits `t = 0`
  (`initialPrice`) from `annualFan` (`monte_carlo.worker.js:237-248`) and omits
  the `P25–P75` inner band even though the worker computes `p25`/`p75`
  (`244-245`).
- None of the analysis views plot historical prices, making it impossible to
  see whether a stock is falling into a buy zone or rallying into a trim zone.

### 1.5 Concrete bugs and data-hygiene gaps uncovered during audit

1. **Negative EPS breaks valuation math (`CBRS`):** `computeDerivedScenarioOutcome`
   (`lab.js:600-603`) multiplies `eps = -5.17` by `(1 + epsCagr)^T * exitPe`,
   yielding negative terminal prices (`-$643.7`) and invalid value bands.
2. **Reverse-sorted decision journal (`GOOG`):** `renderDecisionJournal`
   (`lab.js:1842`) displays `journal[journal.length - 1]`, but `GOOG.json:176-207`
   stores the newest entry (`2026-10-29`) at index `0` and the stale entry
   (`2026-09-29`) at index `1`.
3. **Disconnected What-If sandbox:** `analysis bull|bear|reset`
   (`lab.js:2007-2026`) mutates `state.bayesEngine.priors` inside `#bayesOutput`
   without recalculating `expectedCagr`, `entryPriceForTarget`, or Kelly sizing.
4. **Mixed-horizon `PORT` aggregation & broken `PORT` MC:** `buildPortfolioConfig`
   (`lab.js:2626-2628`) inherits `horizon = 5` from `AEHR` while combining
   `GOOG`'s 10-year `3.35x` multiple (`lab.js:2379-2403`), and `analysis mc` on
   `PORT` always fails because aggregated scenarios omit `growth`/`valuation`
   blocks (`lab.js:2408-2416`; `monte_carlo.worker.js:296-298`).
5. **`VT` omitted dividend yield & EPS/PE mismatch:** `docs/fermat-pascal-kelly-system.md:39`
   specifies that scenario returns must be total return including reinvested
   dividends, yet `lab.js:600-603` omits `dividendYield`. For `VT`, `market.price`
   (`144.96`) / `market.eps` (`6.22`) = `23.3x` while `market.pe` is `18.08`,
   pulling `VT`'s modeled `E[CAGR]` down to `2.2%` (below `4%` risk-free).
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
   (_Visualizing Data_, 1993) established that when analytical decisions depend
   on multiplicative factors and percentage margins (such as `+50%` upside vs.
   `-33%` downside, or compound CAGRs), a logarithmic scale is required so equal
   vertical distances represent equal ratios and exponential CAGR paths plot as
   straight lines.
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
5. **Fan charts for asymmetric forward uncertainty:** Britton, Fisher & Whitley
   (_Bank of England Quarterly Bulletin_, Feb 1998, Vol. 38 No. 1, pp. 30–37)
   introduced the **fan chart** specifically to communicate asymmetric ("balance
   of risks") probability distributions over a forward horizon rather than a
   single deterministic line.
6. **Frequency/quantile framing improves real decisions:** Fernandes, Walls,
   Munson, Hullman & Kay (_ACM CHI 2018_, DOI `10.1145/3173574.3173718`) showed
   in incentivized decision experiments that explicit visual uncertainty
   displays (quantile dotplots / CDFs) raised expected decision payoffs to ~97%
   of optimal with lower variance than text summaries or point estimates.
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
┌──────────────────────────────────────────────────────────────────────────────┐
│ GOOG · Alphabet   [ ADD  +5.3% to cap ]   E[CAGR] 12.8% (+6.3%)  Belief 50%  │ ← Layer 1: Verdict Strip (~28px DOM)
├──────────────────────────────────────────────────────────────────────────────┤
│ Log $                                   │ Forward 2Y Cone (T=10y -> $921)    │
│ $622  ··· SELL (<4% rf, K=0) ···········│······························ $673 │
│ $491  ··· RICH (4-6.5%) ················│······························ $557 │
│       ··· FAIR / HOLD (6.5-12%) ········│············· Bull (20%) $399 [$1775]│ ← Layer 2: Unified Decision
│ $297  ──┐ ┌─ BUY (>=12%) ───────────────│────────── Base (60%) $342 [$827]   │   Canvas (~210-330px DPR,
│ $275    └─●─────────────────────────────●─────── Bear (20%) $288 [$350]      │   Log Y, interactive crosshair)
│ $192  ··· STRONG BUY (>=17%) ···········│······························ $263 │
│        2025            2026           TODAY          +1Y            +2Y      │
├──────────────────────────────────────────────────────────────────────────────┤
│ SIZE  [███████████████████|····]  19.7% curr · | 25.0% target (cap 25%, ½K 500%) │ ← Layer 3: Sizing Bullet +
│ RISK  Bear +2.4%/yr · Geo 12.0% · 52w $271-$404 · 1/2 pred ✓ · 2026-11-20    │   Risk Footer (~44px DOM)
└──────────────────────────────────────────────────────────────────────────────┘
```

All three layers fit inside the `320px` desktop pane floor (`css/terminal/responsive.css:186-191`)
with zero scrolling: `28px` verdict strip + `44px` sizing/risk footer + `16px`
gaps leaves `232px` for the canvas at the `320px` floor and `392px` at the
`480px` ceiling.

### 4.2 Layer 1 — Deterministic 3-Gate Decision Engine

Every ticker's action badge is computed deterministically from existing fields
in `data/analysis/<SYM>.json`, `data/analysis/event_flags.json`, and live
portfolio weights:

1. **Gate 1 — Thesis & Data Validity Gate (Value-Trap Override):**
    - Trigger `AVOID · THESIS BROKEN` (if `w_curr == 0`) or `EXIT · THESIS BROKEN`
      (if `w_curr > 0`) when **any** of:
        - Latest `decision_journal` entry (sorted by `date`, fixing the `GOOG`
          reverse-order bug) has `action` in `{'CLOSE_LONG', 'EXIT'}`.
        - `belief_state.probability < 0.15`.
        - Effective `eps <= 0` with no `overrides.eps` and no `derived.fairValueRange`.
    - When Gate 1 trips, **suppress green valuation zones** on the canvas (plot
      historical price in muted/red with a neutral thesis-broken banner) so a
      failing business can never visually masquerade as a bargain.
    - **Review Flag modifier (`⚑`):** If `event_flags.json` contains an active
      flag for the ticker, any prediction is overdue, or `belief_state.confidence
< 0.50`, append an amber warning pill (`⚑ 8-K / REVIEW DUE`) without hiding
      the quantitative valuation.
2. **Gate 2 — Fermat–Pascal Iso-CAGR Valuation Zones:**
   Using $E[P_T] = \sum_i p_i \cdot \text{terminalPrice}_i$, horizon $T$,
   `targetCagr` ($r_{\text{tgt}}$), `benchmark` ($r_{\text{bench}}$),
   `riskFreeRate` ($r_f = 0.04$), and `strongCagr` ($r_{\text{strong}} =
   r_{\text{tgt}} + 0.05$), define exact iso-CAGR boundary curves at time offset
   $t$ (years from today):
   $$V(r, t) = \frac{E[P_T]}{(1 + r)^{T - t}}$$
   At $t = 0$ (today), $V(r_{\text{tgt}}, 0)$ is identically `entryPriceForTarget`
   (`lab.js:912-913`), and $V(r_f, 0)$ is the exact threshold above which
   expected return drops below risk-free and discrete Kelly becomes $f^* = 0$:
    - **Deep Value (`Strong Buy`):** $P_0 \le V(r_{\text{strong}}, 0)$ ($E[\text{CAGR}] \ge r_{\text{tgt}} + 5\%$)
    - **Buy Zone:** $V(r_{\text{strong}}, 0) < P_0 \le V(r_{\text{tgt}}, 0)$ ($E[\text{CAGR}] \ge r_{\text{tgt}}$)
    - **Fair / Hold Zone:** $V(r_{\text{tgt}}, 0) < P_0 \le V(r_{\text{bench}}, 0)$ ($r_{\text{bench}} \le E[\text{CAGR}] < r_{\text{tgt}}$)
    - **Rich Zone:** $V(r_{\text{bench}}, 0) < P_0 \le V(r_f, 0)$ ($r_f \le E[\text{CAGR}] < r_{\text{bench}}$)
    - **Overvalued Zone:** $P_0 > V(r_f, 0)$ ($E[\text{CAGR}] < r_f$, $f^* = 0$)
3. **Gate 3 — Sizing Synthesis (Constantinides Deadband $\delta = 0.02$ of portfolio):**
   Let $w_{\text{rec}} = \min(f_{\text{scaled}}, w_{\max})$ and $\Delta w =
   w_{\text{rec}} - w_{\text{curr}}$:
    - **Deep Value / Buy Zone:**
        - $w_{\text{curr}} = 0$ and $w_{\text{rec}} > 0$ → `STRONG BUY` / `BUY · INITIATE (≤w_rec)`
        - $\Delta w > \delta$ → `STRONG BUY (+Δw)` / `ADD (+Δw)`
        - $w_{\text{curr}} > w_{\max} + \delta$ → `TRIM TO CAP`
        - $w_{\max} < w_{\text{curr}} \le w_{\max} + \delta$ → `HOLD · AT CAP`
        - Otherwise → `HOLD · AT TARGET`
    - **Fair / Hold Zone:** `TRIM TO CAP` if $w_{\text{curr}} > w_{\max} + \delta$;
      `HOLD` if $w_{\text{curr}} > 0$; `WATCH` (with target buy price) if $w_{\text{curr}} = 0$.
    - **Rich Zone:** `TRIM` if $w_{\text{curr}} > 0$; `PASS` if $w_{\text{curr}} = 0$.
    - **Overvalued Zone ($f^* = 0$):** `SELL / TRIM` if $w_{\text{curr}} > 0$;
      `AVOID` if $w_{\text{curr}} = 0$.

#### Verification against all six live tickers (`2026-11-20` snapshot)

| Ticker | Price    | StrongBuy / Buy / Fair / Sell (`t=0`)  | E[CAGR] | `w_curr` vs `w_rec` (Cap)  | Gate 1 / Flags            | Resulting Verdict                |
| ------ | -------- | -------------------------------------- | ------- | -------------------------- | ------------------------- | -------------------------------- |
| `GOOG` | `$275.0` | `$192` / `$297` / `$491` / `$622`      | `12.8%` | `19.7%` vs `25.0%` (`25%`) | Clean (Belief `50%`)      | **`ADD (+5.3% to cap)`**         |
| `ANET` | `$171.0` | `$140` / `$174` / `$224` / `$252`      | `12.4%` | `31.4%` vs `30.0%` (`30%`) | Clean (Belief `35%`)      | **`HOLD · AT CAP (+1.4% over)`** |
| `PDD`  | `$85.6`  | `$56.4` / `$70.1` / `$90.2` / `$101.5` | `7.6%`  | `20.4%` vs `25.0%` (`25%`) | Clean (Belief `35%`)      | **`HOLD` (Buy `< $70.1`)**       |
| `VT`   | `$145.0` | `$87.7` / `$110` / `$127` / `$133`     | `2.2%`  | `28.6%` vs `0.0%` (`30%`)  | Clean\* (Belief `50%`)    | **`SELL / TRIM`**\*              |
| `AEHR` | `$40.9`  | `$38.4` / `$47.8` / `$61.5` / `$69.3`  | `15.5%` | `0.0%` vs `5.0%` (`5%`)    | `⚑ 8-K + review-date`     | **`BUY · INITIATE (≤5%) ⚑`**     |
| `CBRS` | `$91.2`  | _suppressed_ (`EPS -5.17`)             | `n/a`   | `0.0%` vs `0.0%` (`5%`)    | `CLOSE_LONG`, Belief `1%` | **`AVOID · THESIS BROKEN`**      |

\* `VT`'s `SELL / TRIM` signal immediately flags the §1.5 data-hygiene bug
(omitted dividend yield + EPS/PE mismatch) rather than burying it inside a
subcommand table.

### 4.3 Layer 2 — Unified Valuation Corridor + Forward Scenario Fan Canvas

- **Y-axis:** Logarithmic price scale (`Cleveland 1993`), reusing the strict
  no-overlap collision pipeline documented in `docs/y-axis-tick-algorithm.md`
  with currency conversion via the existing currency-change hook (`lab.js:2370-2387`).
- **X-axis split (60% past / 40% future):**
    - **Past (`-2Y .. Today`):** Solid daily/weekly price line in primary
      terminal foreground color.
    - **Historical corridor honesty (avoiding look-ahead bias):**
        - _Mode 1 — EPS-tracked corridor (`ANET`, `GOOG`, `PDD`):_ Where
          point-in-time positive TTM EPS history exists
          (`data/checkpoints/fetched_eps_cache.json`), multiply each historical
          date's $\text{EPS}(d)$ by today's model-implied multiples
          $M(r) = V(r, 0) / \text{EPS}_0$. This reproduces the smooth,
          growth-adjusted visual grammar of GuruFocus GF Value and FAST Graphs
          while remaining explicitly labeled _"Current-thesis multiples ×
          point-in-time EPS"_ (zero fake historical thesis claims).
        - _Mode 2 — Horizontal 1Y bands (`VT`, `AEHR`):_ Where positive
          historical EPS history is absent (or constant, like `VT`'s flat
          `17.72` P/E in `pe_ratio.json` — which must **never** be inverted into
          `price / flat_pe`, as that would circularly track price), render a 1Y
          price history over horizontal current-thesis bands.
        - _Mode 3 — Thesis-broken / Negative-EPS (`CBRS`):_ Render price history
          only with muted/red styling and a centered `THESIS BROKEN` watermark;
          suppress valuation bands.
    - **Future (`Today .. Today + min(2Y, T)` default, or full `T` via
      `an <TICKER> full`):** Capping the default forward window at 2 years
      prevents 10-year `GOOG` (`Bull = $1,775`) from squashing the `$146–$404`
      historical range while still showing the exact slope and spread of the
      Bear / Base / Bull cone (`GOOG +2Y`: Bear `$288`, Base `$342`, Bull
      `$399`), with terminal $T$-year prices printed inline at the right edge
      (`Bull 20% $399 [10y: $1,775]`). Paths are strictly deterministic (no
      Monte Carlo worker latency).
- **Color & contrast discipline:** Use only existing `css/terminal/base.css`
  semantic tokens (`--green` for Deep Value/Buy at `8–16%` fill alpha,
  transparent/glass for Fair/Hold, `--gold` for Rich at `10%` alpha, `--red`
  for Overvalued at `12%` alpha), paired with inline text zone labels at the
  band edges so no signal is color-only.
- **Interactive hover crosshair (canvas only):**
    - Render on a live DPR-scaled canvas matching `js/transactions/chart.js:75-93`
      and wire pointer hover via a lightweight crosshair (reusing the layout
      contract patterns in `docs/chart-crosshair-layout.md`).
    - Hovering the past shows `Date · Price · Historical Implied Zone`.
    - Hovering the future shows `Date · Bear / Base / Bull Price · Iso-CAGR`.
- **No cost-basis line or trade markers:** Per Odean (1998) and Frydman &
  Rangel (2014), omit `average_price` and historical buy/sell markers
  completely (no opt-in flag).

### 4.4 Layer 3 — Integrated Stephen Few Position-Sizing Bullet + Risk Footer

- **Sizing Bullet (DOM / inline SVG, ~22px high):**
    - Quantitative scale: `0%` to `scaleMax = max(w_max * 1.25, w_curr * 1.15, 0.10)`.
    - Qualitative background zones: `[0, w_rec]` (safe accumulation room),
      `[w_rec, w_max]` (hold buffer), `[w_max, scaleMax]` (red-tinted over-cap
      warning).
    - Featured bar: solid bar for `w_curr` (`19.7%` for `GOOG`, `31.4%` for
      `ANET`).
    - Comparative target tick: crisp vertical marker at `w_rec = min(½K, w_max)`
      and dashed cap hairline at `w_max`.
    - Right-aligned text readout: `19.7% / 25.0% target (+5.3% · +$70k)` (plus
      `½K 500%` or `½K 0%` in muted text so unconstrained Kelly signal is still
      visible without distorting the axis).
- **Risk & Catalyst Footer (~20px high):**
  Single tabular-nums line carrying the highest-signal secondary metrics:
  `Bear +2.4%/yr · Geo 12.0% · 52w $271–$404 · Pred 1/2 (Brier 0.04) · Rev 2026-10-29`
  plus any `⚑` event-flag pill and a muted hint (`an <SYM> full | an | an close`).

### 4.5 Companion `PORT` overview (Shneiderman's "Overview First")

When the user types bare `an`, replace the broken mixed-horizon `PORT` summary
with a 6-row **Portfolio Decision Board** (fitting inside `320px` at ~38px/row):

- Columns: `TICKER` | `VERDICT` pill | mini **Valuation Position Spark** (a
  60px horizontal bullet showing where `P0` sits across `[StrongBuy .. Sell]`) |
  `E[CAGR]` | mini **Sizing Bullet** (`w_curr` vs `w_rec`) | `BELIEF / FLAGS`.
- Sorted by action urgency (`THESIS BROKEN / SELL` → `STRONG BUY / ADD` →
  `TRIM / AT CAP` → `HOLD` → `WATCH`).
- Strictly keyboard-driven: typing `an <SYM>` opens that ticker's **Decision
  Chart**, `an <SYM> full` renders the full $T$-year horizon, and `an close`
  closes the pane. Update `js/transactions/terminal/autocomplete.js` to
  autocomplete tracked ticker symbols, `full`, and `close`.

---

## 5. Data, pipeline, and bug-fix prerequisites

Implementing the Decision Chart cleanly requires four targeted repo changes
beyond the UI renderer itself:

1. **Per-ticker compact history in `scripts/analysis/sync_configs.py`:**
   `sync_configs.py:223-275` already fetches `yfinance` history for every ticker
   in `holdings ∪ watchlist` (including `AEHR` and `CBRS`). Emit a compact
   per-ticker history artifact (e.g., `data/analysis/<SYM>.history.json`, ~2–4 KB
   each: 2–3Y weekly closes + point-in-time quarterly TTM EPS where positive,
   pulling from `data/checkpoints/fetched_eps_cache.json` + `yfinance`). This
   avoids loading the 8.9 MB `data/historical_prices.json` monolith in the
   analysis pane, covers watchlist tickers, and sidesteps `VT`'s flat-PE artifact.
2. **Consistent live portfolio weights:** Wire `lab.js` to consume
   `fetchRealTimeData()` (`js/transactions/realtimeData.js:130-214`) when
   available, falling back to `holdings_details.json` × `market.price`, so
   `w_curr` matches the live terminal portfolio balance.
3. **Fix the five audit bugs before/during rollout:**
    - Guard `computeDerivedScenarioOutcome` (`lab.js:600-603`) against `eps <= 0`
      (and fall back to `derived.fairValueRange` or Gate 1 suppression).
    - Sort `decision_journal` by `date` instead of taking `[length - 1]`
      (`lab.js:1842`).
    - Include `dividendYield` in total-return scenario compounding per
      `docs/fermat-pascal-kelly-system.md:39`, and investigate/reconcile `VT`'s
      `eps` (`6.22`) vs. `pe` (`18.08`) mismatch in `sync_configs.py`.
    - Prepend `t = 0` (`initialPrice`) to `annualFan` in `monte_carlo.worker.js:237-248`.
    - Fix `PORT` mixed-horizon aggregation (`lab.js:2379-2403`, `2626-2628`) — or
      retire synthetic `PORT` scenario averaging in favor of the 6-row Decision
      Board.
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
  `1440×900`. Subtle red/green/gold canvas band fills (`8–16%` alpha) must be
  visually checked in Chromium (`make screenshot URL=/terminal/`) to confirm
  zone boundaries and text labels remain readable over the glass backdrop.
- **Explicit tail-crash scenarios:** Adding a 2–3% catastrophe state per
  `docs/fermat-pascal-kelly-system.md:38` would bring unconstrained `½K` out of
  the `150%–500%` regime and make the Kelly target tick distinguish between
  high-conviction and fragile holdings inside the `0..maxWeight` range; this is
  a thesis-authoring decision outside the chart renderer itself.

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
- Items tagged `[skip]` require non-trivial design/canvas/test authoring and
  should be routed to a stronger model rather than executed mechanically.

---

### WO1 `[low]` — Fix `VT` ETF EPS derivation and include reinvested `dividendYield` in `sync_configs.py`

- **File:** `scripts/analysis/sync_configs.py` (and `tests/python/test_sync_configs.py`)
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
    2. In `recompute_derived`, read `raw_div = market.get('dividendYield')`,
       convert percentage points to decimal
       `div_rate = max(0.0, float(raw_div) / 100.0)` when numeric, and multiply
       each scenario multiple by `(1 + div_rate) ** horizon`.
    3. Add unit tests in `tests/python/` covering ETF `price / pe` EPS
       derivation and percentage-point `dividendYield` compounding (`1.56` →
       `1.56%`, never `156%`).
- **Verify:** `venv/bin/pytest tests/python/ -k sync_configs && venv/bin/ruff check scripts/analysis/sync_configs.py && venv/bin/mypy scripts/analysis/sync_configs.py`
- **Guardrail:** `market.dividendYield` from `yfinance` is stored in **percentage
  points** (`0.32` for GOOG, `1.56` for VT) — always divide by `100.0` before
  compounding; cap sanity at `div_rate <= 0.25` to fail safe on upstream quirks.

---

### WO2 `[low]` — Emit compact per-ticker `data/analysis/<SYM>.history.json` in `sync_configs.py`

- **File:** `scripts/analysis/sync_configs.py` (and `tests/python/test_sync_configs.py`)
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
    1. Add a helper `build_ticker_history(symbol, ticker)` that fetches 2Y
       weekly closing prices (`period='2y', interval='1wk'`, falling back to
       `data/historical_prices.json` if offline/mocked) and merges positive
       point-in-time quarterly TTM EPS points from
       `data/checkpoints/fetched_eps_cache.json` (sorted by date, filtered to
       `eps > 0`).
    2. Write `data/analysis/<SYM>.history.json` with schema
       `{"symbol", "asOf", "prices": [{"d": "YYYY-MM-DD", "c": float}], "eps": [{"d": "YYYY-MM-DD", "v": float}]}`
       for every symbol in `tracked_symbols` (covering both held tickers and
       watchlist tickers `AEHR`/`CBRS`), and clean up orphan `.history.json`
       files alongside orphan `.json` files.
    3. Add `"historyPath": f"../data/analysis/{symbol}.history.json"` to each
       entry in `index_payload['tickers']`.
    4. Run `venv/bin/python -m scripts.analysis.sync_configs` to generate the
       `data/analysis/*.history.json` files and updated `data/analysis/*.json` /
       `index.json`.
- **Verify:** `venv/bin/pytest tests/python/ -k sync_configs && venv/bin/python -m scripts.analysis.sync_configs && ls -lh data/analysis/*.history.json`
- **Guardrail:** Never invert `pe_ratio.json` `ticker_pe` for `VT` (its P/E is
  stored flat at `17.72`, which would make fair value circularly track price);
  leave `eps: []` when `fetched_eps_cache.json` has no positive history for a
  ticker so the chart cleanly selects horizontal 1Y bands.

---

### WO3 `[low]` — Build the pure-JS 3-Gate Decision Engine and fix valuation edge cases

- **File:** New module `js/pages/analysis/decision.js` (plus `js/pages/analysis/lab.js` math exports and new `tests/js/pages/analysis/decision.test.js`)
- **Find (in `js/pages/analysis/lab.js`):**

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

- **Change:**
    1. In `computeDerivedScenarioOutcome`, guard `eps <= 0` (return `multiple:
0, priceCagr: 0, terminalEps: 0, terminalPrice: 0` instead of negative
       prices for `CBRS`) and apply reinvested total return
       `divFactor = (1 + divRate) ** horizon` where
       `divRate = clamp((dividendYield || 0) / 100, 0, 0.25)`.
    2. Create `js/pages/analysis/decision.js` exporting pure functions:
        - `getLatestJournalEntry(journal)` — sorts by ISO `date` ascending and
          returns the newest entry (fixing `GOOG`'s reverse-sorted array).
        - `computeIsoCagrBands(expectedTerminalPrice, horizon, { targetCagr,
benchmark, riskFreeRate })` — returns `strongBuy`, `buy`, `fair`,
          `sell` prices at any time offset `t` via $V(r, t) = E[P_T] / (1 +
          r)^{T - t}$ (returning `null` when `expectedTerminalPrice <= 0`).
        - `evaluateTickerDecision(config, metrics, { currentWeight, eventFlags })`
          — implements the 3-Gate Decision Engine (§4.2) with Constantinides
          deadband `0.02`, returning `{ code, label, tone, zone, flags,
targetWeight, weightDelta, bands, sortPriority }`.
        - `buildDecisionSnapshot(decision, config, metrics)` and
          `buildBoardSnapshot(rows)` — one-line terminal scrollback summaries.
    3. Add unit tests covering all 6 live ticker profiles (`GOOG` ADD, `ANET`
       HOLD · AT CAP, `PDD` HOLD, `VT` with fixed EPS + dividends, `AEHR`
       BUY · INITIATE + event flag, `CBRS` AVOID · THESIS BROKEN + negative
       EPS).
- **Verify:** `npx jest tests/js/pages/analysis/decision.test.js && npx eslint js/pages/analysis/decision.js`
- **Guardrail:** Keep `decision.js` 100% DOM-free and side-effect free so it
  remains deterministic under `TZ=UTC` Jest tests and easy to mutation-test.

---

### WO4 `[skip]` — Build the DPR-scaled Valuation Corridor + Forward Scenario Fan canvas with hover crosshair

- **File:** New module `js/pages/analysis/decisionChart.js` (and `tests/js/pages/analysis/decisionChart.test.js`)
- **Find:** New file; reuse DPR sizing pattern from `js/transactions/chart.js:75-93`
  and tick-collision algorithm from `docs/y-axis-tick-algorithm.md`.
- **Change:** Design and implement the log-scale time-series canvas (past 2Y
  price + EPS-tracked or horizontal iso-CAGR bands, `TODAY` hairline, 2Y
  default / `full` $T$ deterministic Bear/Base/Bull cone with direct right-edge
  labels, Gate 1 suppressed state for broken theses, currency conversion, and
  pointer hover crosshair with date/price/zone/scenario readout — no cost basis
  or trade markers).
- **Verify:** `npx jest tests/js/pages/analysis/decisionChart.test.js && npx eslint js/pages/analysis/decisionChart.js`
- **Guardrail:** Never draw over a `0×0` backing store (pane starts `.is-hidden`
  — guard `offsetWidth === 0` and redraw on reveal via `ResizeObserver`).

---

### WO5 `[skip]` — Replace the 9-section `lab.js` UI with the 2-view Decision Board + Decision Chart and prune dead code

- **File:** `js/pages/analysis/lab.js`, `js/pages/analysis/bayes.js`, delete
  `js/pages/analysis/monte_carlo.worker.js` and
  `tests/js/pages/analysis/monte_carlo.worker.test.js`, update
  `tests/js/pages/analysis/*`
- **Find:** `const ANALYSIS_SECTIONS = [` (`js/pages/analysis/lab.js:95`) and
  `const PANE_MARKUP = \`` (`js/pages/analysis/lab.js:107`).
- **Change:** Replace `ANALYSIS_SECTIONS` with `['board', 'ticker']`; render
  the 6-row `PORT` Decision Board (Layer 1–3 mini-bullets sorted by urgency) on
  `board` and Layer 1 Verdict Strip + Layer 2 `decisionChart.js` canvas + Layer
  3 Stephen Few Sizing Bullet + Risk Footer on `ticker`; prefer live weights
  from `fetchRealTimeData()` (`js/transactions/realtimeData.js:130-214`) with
  `holdings_details.json` fallback; remove all 9 legacy renderers, the MC
  worker, and unused `bayes.js` replay/sandbox methods (keeping
  `computeBrierScore` for the Risk Footer); update all `tests/js/pages/analysis/`
  suites.
- **Verify:** `npx jest tests/js/pages/analysis/ && make depcheck`
- **Guardrail:** Run `rg "monte_carlo|BayesianEngine" js/ tests/` before
  deleting `monte_carlo.worker.js` or pruning `bayes.js` so no stale import
  breaks Jest or `dependency-cruiser`.

---

### WO6 `[low]` — Simplify terminal command grammar, help text, and ticker autocomplete

- **File:** `js/transactions/terminal/constants.js`,
  `js/transactions/terminal/autocomplete.js`,
  `js/transactions/terminal/handlers/analysis.js`,
  `js/transactions/terminal/handlers/help.js`, and
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
    1. Set `ANALYSIS_SUBCOMMANDS = ['close']` (plus `ANALYSIS_HORIZON_FLAGS =
['full']`) in `constants.js`.
    2. Update `getAnalysisMatches(parts)` in `autocomplete.js` to suggest
       loaded/indexed ticker symbols (lowercase/uppercase prefix match) plus
       `'close'` for `parts[1]`, and `'full'` for `parts[2]` when `parts[1]` is
       a ticker.
    3. Simplify `handleAnalysisCommand` in `handlers/analysis.js` to accept
       only: `analysis` / `an` (opens `board` + prints board triage snapshot),
       `an <TICKER>` (opens `ticker` 2Y Decision Chart + prints verdict
       snapshot), `an <TICKER> full` (opens `ticker` full-$T$ Decision Chart),
       and `an close` (hides pane). Remove `SECTION_BY_SUBCOMMAND`,
       `handleMonteCarlo`, and `handleSandbox`.
    4. Update `USAGE_LINE` and `handlers/help.js` to document the 3 commands:
       `analysis`, `an <TICKER> [full]`, and `an close`.
    5. Update matching unit tests.
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

    ```javascript
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
       compact `.analysis-pane`-scoped styles for the Decision Board table
       (6 rows inside `320px`), Layer 1 Verdict Strip, Layer 2 flex canvas
       container, and Layer 3 Stephen Few Sizing Bullet + Risk Footer — using
       only existing `css/terminal/base.css` tokens.
    2. Update `scripts/check_analysis_pane_layout.mjs` to remove the 9 legacy
       visits + `waitForMonteCarlo` and instead gate viewport fit (`overflow <=
1px`) at `1280×580` across `analysis` (`PORT` board), `analysis goog`,
       `analysis goog full`, `analysis anet`, `analysis aehr`, `analysis cbrs`,
       and `analysis vt`.
    3. Run `make analysis-layout-check`, `make screenshot URL=/terminal/`, and
       inspect rendered PNGs in Chromium (verifying glass contrast over
       `terminal_background.jpg`) before handoff for human visual review.
- **Verify:** `npx stylelint css/terminal/analysis.css && make analysis-layout-check && make precommit-fix`
- **Guardrail:** Keep every rule scoped under `.analysis-pane` so `position/`
  and `calendar/` remain untouched, and preserve `height: 100%` + `min-height:
0` on the flex chain so the `check_analysis_pane_layout.mjs` stage-height
  spread assertion (`spread <= 1px`) continues to hold.

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
