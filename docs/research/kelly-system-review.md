# Review of the Fermat–Pascal + Kelly System — Enhancement Recommendations

**Status: Findings / Recommendation**
**Date: 2026-10-14**
**Scope:** `docs/fermat-pascal-kelly-system.md` (the design doc) and its live
implementation (`js/pages/analysis/lab.js`, `js/pages/analysis/monte_carlo.worker.js`).

## The question

As a quant-finance review: what should be enhanced or changed in the
Fermat–Pascal + Kelly valuation & positioning engine design?

## The answer (summary)

The architecture (scenario universe → expected value → Kelly sizing → Bayesian
updating → MC enrichment → dynamic/multi-asset layers) is sound and matches
established practice. But the **core sizing math has four errors that propagate
into live numbers** on the analysis Lab page, and the design is missing the two
things that matter most in real Kelly usage: an estimation-error treatment and
a formal growth-vs-drawdown tradeoff. Fix the math first (Tier A), then add
robustness layers (Tier B); the optional extensions (Tier C) are well-chosen
already and need only sharper sourcing.

All external claims cite primary sources fetched/verified this session
(original papers, author-archived copies, publisher pages).

---

## A. Mathematical errors (affect live output)

### A1. "Expected CAGR" uses the arithmetic mean — it overstates growth and is the wrong input for Kelly

Doc §1.3/§2.3 define `expectedCagr = (Σ pᵢ·multipleᵢ)^(1/T) − 1`, implemented
verbatim at `js/pages/analysis/lab.js:607-611`. That is the **arithmetic** mean
of terminal multiples. Kelly's criterion maximizes the long-run growth rate
G = E[log W] (Kelly 1956); the growth rate actually achieved almost surely as
T→∞ is the **geometric** mean, `exp(Σ pᵢ·log mᵢ)^(1/T) − 1`. By Jensen's
inequality the arithmetic version strictly overstates it whenever scenario
outcomes differ, and the gap widens with dispersion — exactly when sizing
decisions matter most.

- Kelly, J. L. Jr. (1956), "A New Interpretation of Information Rate," _Bell
  System Technical Journal_ 35(4):917–926.
  <https://doi.org/10.1002/j.1538-7305.1956.tb03809.x>
- Luenberger, D. G. (2013), _Investment Science_ (2nd ed.), OUP, ch. 9
  (arithmetic vs geometric mean).

**Change:** report both — arithmetic expected CAGR (expected terminal wealth)
and geometric expected CAGR (the growth rate Kelly actually maximizes; also
~the median outcome). Derive the Kelly "edge" from the log domain.

### A2. Kelly numerator uses the benchmark return, not the risk-free rate

Doc §1.4/§2.4 compute `edge = expectedCagr − benchmark(6.5%)` then
`fullKelly = edge / σ²` (`lab.js:612-614`). In the continuous-time result
f\* = (m − r)/s², **r is the return on the residual capital — the risk-free
rate** (Treasury bills), not an index. Thorp's own S&P example uses m=.11,
s=.15, r=.06 → f\* = 2.22. Merton's log-utility optimum is likewise
(μ − r)/σ² with r the risk-free rate.

- Thorp, E. O. (2006), "The Kelly Criterion in Blackjack, Sports Betting, and
  the Stock Market," in _Handbook of Asset and Liability Management_ Vol. 1,
  Elsevier, Eq. 7.1–7.3. <https://doi.org/10.1016/S1872-0978(06)01009-X>
- Merton, R. C. (1969), "Lifetime Portfolio Selection under Uncertainty,"
  _Rev. Econ. Stat._ 51(3):247–257. <https://www.jstor.org/stable/1926560>

**Change:** two clean options — (a) excess over risk-free in the numerator with
the asset's own σ (absolute sizing vs cash); or (b) active return vs the
benchmark in the numerator with **tracking-error variance** (σ of relative
returns) in the denominator (benchmark-relative sizing). Today's formula mixes
(a)'s denominator with (b)'s numerator. A 6.5% benchmark vs ~4–5% risk-free
also systematically shrinks positions.

### A3. edge/variance is only the small-return approximation — the model is natively discrete, so solve exact Kelly

Thorp derives g(f) = r + f(m−r) − s²f²/2 as the n→∞ limit of a subdivided
binomial, i.e. an approximation exact only for small/lognormal returns; his
§7.2 is precisely about where it breaks. For a discrete scenario set the exact
Kelly fraction maximizes G(f) = Σ pᵢ·log(1 + f·rᵢ), solving
Σ pᵢ·rᵢ/(1 + f·rᵢ) = 0 — a monotone 1-D root find, trivially deterministic,
and a natural fit for a scenario-based engine. The approximation
**overestimates f\*** when the left tail is fat (e.g. a −60% Bear scenario).

- Thorp (2006), ibid., §7; Breiman, L. (1961), "Optimal Gambling Systems for
  Favorable Games," _Proc. 4th Berkeley Symp._ Vol. 1, 65–78.
  <https://projecteuclid.org/euclid.bsmsp/1200512159>

**Change:** replace `edge/variance` with exact discrete Kelly over the scenario
set (annualized per-rebalancing-period returns). This also fixes the Kelly
curve in the Lab UI: `lab.js:962` draws the quadratic
g(f) = r + f·edge − ½f²σ²; drawing the true scenario log-growth curve
G(f) = Σ pᵢ·log(1 + f·rᵢ) makes the "Full K" peak and the "2× K (0 growth)"
marker exact rather than approximate.

### A4. The volatility input is decoupled from the scenario distribution

Doc §2.4 sets variance ≈ (annual volatility input)² while the model _already
has_ a full scenario distribution with its own implied variance
(`lab.js:613`). The two can silently contradict each other: a user can specify
a tight Bull/Base/Bear cluster and a 40% σ, or vice versa. Note also the
horizon mismatch: edge is derived from a T-year terminal distribution, σ is
annual — consistent only under iid compounding, which the scenario model
doesn't otherwise assume.

**Change:** derive per-period return variance from the scenario model itself
(or bootstrap the annual distribution from it); keep the σ input only as an
optional override, and surface the scenario-implied σ next to it as a
consistency check.

### A5. Omega ratio definition is wrong

Doc §3.3 defines Omega as P(R > τ) / P(R ≤ τ). Keating & Shadwick's Omega is
the ratio of probability-weighted gains above the threshold to losses below:
Ω(τ) = E[(R−τ)⁺] / E[(L−R)⁺] — integrals of the distribution, not a ratio of
probabilities. The doc's version is a different, much cruder statistic (a win/
loss odds ratio).

- Keating, C., & Shadwick, W. F. (2002), "A Universal Performance Measure,"
  _Journal of Performance Measurement_ 6 (practitioner journal; issue cited as
  6(2) or 6(3) in the literature).

---

## B. The two big missing layers

### B1. Estimation-error treatment (the reason Kelly fails in practice)

The doc sizes positions from point estimates of EPS CAGR, exit PE, and
scenario probabilities, with an arbitrary 0.5 "risk-scaling factor." The
literature is blunt: errors in **means** are roughly an order of magnitude more
damaging than errors in variances/covariances (≈10:2:1 in cash-equivalent loss,
at typical risk tolerance — the ratio shrinks at high risk tolerance, per the
paper itself). Kelly's fragility to mean-estimation error is exactly why
fractional Kelly exists: Thorp shows that if the true mean is half your
estimate, full Kelly ruins you while half-Kelly loses nothing; with f = c·f\*,
growth is (m−r)²(c − c²/2)/s² + r, so half-Kelly keeps 75% of the growth
premium while halving volatility.

- Chopra, V. K., & Ziemba, W. T. (1993), "The Effect of Errors in Means,
  Variances, and Covariances on Optimal Portfolio Choice," _J. Portfolio
  Management_ 19(2):6–11. <https://doi.org/10.3905/jpm.1993.409440>
- Thorp (2006), ibid., §7.3 (the case for fractional Kelly).
- MacLean, Thorp & Ziemba (2010), "Long-term capital growth: the good and bad
  properties of the Kelly and fractional Kelly capital growth criteria,"
  _Quantitative Finance_ 10(7):681–687.
  <https://doi.org/10.1080/14697688.2010.506108>

**Changes:**

1. Ground the scaling factor: present the fractional-Kelly growth/vol tradeoff
   curve (25%/50%/75%/100% of f\*) instead of a bare 0.5 default.
2. Add input-sensitivity output: recompute f\* under ±perturbations of edge
   and σ (a one-row tornado table). Given Chopra–Ziemba, the edge
   perturbation is the one that matters.
3. Extend the Bayesian layer (doc §4) from scenario _probabilities_ to
   scenario _parameters_: a posterior over EPS CAGR / exit PE, so parameter
   uncertainty widens the distribution (and shrinks f\*) rather than just
   shifting probability mass.

### B2. Drawdown-constrained sizing (growth vs security)

The doc sizes for growth and mentions drawdowns only as a Monte Carlo output
(§6.3). For a real fund the binding constraint is usually drawdown. The
classical result: Grossman & Zhou solve growth-optimal investing subject to
wealth never falling below a fixed fraction of its running maximum;
MacLean–Ziemba–Blazenko frame the general growth-vs-security tradeoff in
dynamic investment analysis. Thorp's bankroll-reduction formula
P(ever reduced to fraction x) = x^(2m/s²) gives the same tradeoff in closed
form for the diffusion case.

- Grossman, S. J., & Zhou, Z. (1993), "Optimal Investment Strategies for
  Controlling Drawdowns," _Mathematical Finance_ 3(3):241–276.
  <https://doi.org/10.1111/j.1467-9965.1993.tb00044.x>
- MacLean, Ziemba & Blazenko (1992), "Growth versus security in dynamic
  investment analysis," _Management Science_ 38(11):1562–1585.
  <https://doi.org/10.1287/mnsc.38.11.1562>

**Change:** add a drawdown-constraint input (max tolerable drawdown δ) and
report the largest f whose simulated/closed-form drawdown probability respects
it. The dynamic layer (§6) then simulates drawdown paths against a _sizing
that was chosen to control them_, which it currently can't — see B3.

### B3. Monte Carlo layer: independent normal perturbations, terminal-only paths

`monte_carlo.worker.js:56-60` samples EPS CAGR and exit PE as **independent
normals** per path, with PE floored ad hoc at `Math.max(1, sampledPe)`. Two
problems:

1. **Missing correlation.** Growth disappointment and multiple compression
   coincide (a growth stock that misses gets de-rated); independent sampling
   understates the left tail that drives Kelly sizing. Use a Gaussian copula
   or scenario-conditional joint sampling.
2. **Terminal-only simulation.** Only the T-year terminal price is simulated;
   the doc's §6.3 promises "wealth/drawdown distributions," which
   terminal-only paths cannot produce. Add annual (or finer) steps with
   regime-conditional returns so the drawdown-constraint output of B2 has
   something to chew on.
3. Optional: fat-tailed shocks (Student-t) rather than normal — the Bear
   scenario exists precisely because returns aren't normal.

---

## C. Smaller enhancements

1. **Left-tail / ruin scenario.** Bull/Base/Bear with no catastrophic state
   (fraud, nationalization, −90%): with 3 scenarios, "CVaR₂₀%" is a lumpy
   fraction of the Bear state's mass, and Kelly's ruin-avoidance properties
   never get exercised. Add an explicit tail scenario, even at 1–3%.
2. **Dividends / total return.** Terminal value = terminal EPS × exit PE
   ignores cash distributions over T years; at a 5-year horizon this is
   material for any payer. Scenario total return should include reinvested
   dividends (or use FCF yield alongside).
3. **Exit-PE anchoring.** Exit PEs are free inputs, so "expected CAGR" is
   mostly an exit-multiple assumption. Anchor scenario exit PEs to the stock's
   historical multiple distribution or a fundamentals-implied terminal
   multiple, and show the anchor in the UI.
4. **Multi-asset joint scenarios (§7).** Per-asset scenarios + a historical
   correlation matrix conflates subjective views with historical correlations
   (which go to 1 in crises). More consistent with the Fermat–Pascal
   philosophy: shared macro scenario states across assets (e.g. one "AI capex
   bust" state that reprices several holdings jointly). Also add portfolio
   constraints (no shorting, leverage caps) — unconstrained portfolio Kelly
   happily outputs >100% or negative weights.
5. **Dynamic layer theory note (§6).** For i.i.d. returns, myopic
   period-by-period Kelly is optimal for log utility — Mossin (1968),
   "Optimal Multiperiod Portfolio Policies," _J. Business_ 41(2):215–229
   (<https://www.jstor.org/stable/2351526>). So the dynamic layer's value is
   not beating myopia under stationarity; it's handling _regime shifts_ via
   the Bayesian updates — worth saying explicitly, plus transaction-cost
   friction on the rebalancing bounds.
6. **Market-implied layer caveats (§8).** Breeden–Litzenberger
   (<https://www.jstor.org/stable/2352653>) needs arbitrage-free smile
   interpolation (butterfly constraints) before double-differentiating. For
   risk-neutral → physical conversion, Ross's Recovery Theorem (_J. Finance_
   2015, <https://doi.org/10.1111/jofi.12092>) is the rigorous route, but pair
   it with the misspecification critique (Borovička, Hansen & Scheinkman
   2016, _J. Finance_, <https://doi.org/10.1111/jofi.12404>) — recovery is not
   robust outside Ross's assumptions. The doc's "heuristic tilts" are fine;
   just label them as such and compare **tails**, where subjective and implied
   distributions differ most.
7. **Calibration loop.** The repo already has dated predictions with live
   Brier scoring (`js/pages/analysis/bayes.js`). Wire scenario probabilities
   into that machinery: score the scenario engine's own probability estimates
   over time so "P(Bull)=40%" becomes a calibrated, trackable claim rather
   than a vibe.
8. **Reverse Kelly (implied beliefs).** Given the current position weight
   (already drawn on the Kelly curve, `lab.js:932-946`), solve for the edge
   that would make it optimal — a cheap, high-signal "what do I have to
   believe?" output.

## Ranked action items

| #   | Item                                                                       | Effort  | Why first                                    |
| --- | -------------------------------------------------------------------------- | ------- | -------------------------------------------- |
| 1   | Geometric expected CAGR alongside arithmetic (A1)                          | trivial | correctness of the headline number           |
| 2   | Risk-free vs benchmark in Kelly numerator; document which sizing mode (A2) | trivial | positions are systematically mis-sized today |
| 3   | Exact discrete Kelly + true G(f) curve in the Lab UI (A3)                  | low     | removes approximation error; better UI curve |
| 4   | Scenario-implied σ consistency check (A4)                                  | low     | silent input contradiction                   |
| 5   | Fix Omega definition (A5)                                                  | trivial | wrong statistic                              |
| 6   | Fractional-Kelly tradeoff display + edge-sensitivity tornado (B1)          | low     | the practical case for the scaling factor    |
| 7   | Drawdown-constraint input + sizing (B2)                                    | medium  | the real objective for a personal fund       |
| 8   | Correlated MC perturbations + path simulation (B3)                         | medium  | left tail and drawdowns both depend on it    |
| 9   | Tail scenario, dividends, exit-PE anchors (C1–C3)                          | low     | input hygiene                                |
| 10  | Joint multi-asset scenarios + constraints (C4)                             | medium  | portfolio layer correctness                  |
| 11  | Calibration wiring to Brier scoring (C7)                                   | low     | closes the feedback loop                     |

Items 1–5 are behavior fixes in `js/pages/analysis/lab.js` (+ tests) and
matching edits to the design doc; 6–11 are design-doc-first enhancements.

## Open questions / what I could not verify

1. **Keating & Shadwick issue number** is cited inconsistently (6(2) vs 6(3))
   and the _Journal of Performance Measurement_ is a practitioner journal, not
   peer-reviewed; the Omega definition itself is not in dispute.
2. **Chopra–Ziemba's ~10:1 mean-vs-covariance error ratio** is stated at a
   specific risk tolerance; the paper itself shows it shrinks at high risk
   tolerance. Direction (mean errors dominate) is robust; magnitude is not a
   universal constant.
3. **Ross recovery practical reliability** is contested (Borovička–Hansen–
   Scheinkman 2016; poor empirical results reported elsewhere) — cited here
   only for the possibility claim, with the critique alongside.
4. **The optimal joint-scenario construction for the portfolio layer** (shared
   macro states vs copula on per-asset scenario sets) is a modeling choice the
   literature doesn't settle; C4 recommends the shared-state route for
   consistency, not because it's provably better.
5. No verification was done of the **terminal page's** use of these metrics
   (`js/transactions/terminal/handlers/analysis.js` references Kelly); worth a
   pass if the terminal surfaces sizing numbers too.
