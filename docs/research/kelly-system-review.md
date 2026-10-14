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

## Action items

Items 1–5 (Tier A) are **implemented** (2026-10-14, commits `5dd36b6e` and
`4054e97e`). The work orders below cover the remaining recommendations.

### Preamble — rules for the implementer

- One work order per change. Work directly on `main`; **commit after each
  work order, never push**. Stage files by name (`git add <file> ...`, never
  `git add -A`); unrelated dirty files in the tree belong to other sessions.
  Conventional-commit messages (`feat(analysis): ...`, `docs(analysis): ...`).
- `Find` strings are unique anchors verified against the working tree on
  2026-10-14. **If one does not match exactly, STOP that item and report the
  mismatch — do not improvise an alternative anchor.** Line numbers are dated
  and may drift; trust the `Find` string, not the line number.
- Never edit `data/` (pipeline-generated).
- Code style: 4-space indent, single quotes, semicolons; internal functions are
  tested via the existing `__analysisLabTesting` export object.
- `js/pages/analysis/lab.js` has an eslint complexity ratchet (max 20 per
  function). The snippets below are designed to stay under it; if eslint still
  reports a complexity error, STOP and report — do not refactor on your own.
- After each JS work order run its scoped `Verify` command, not a full-repo
  gate. After each doc work order run
  `npm exec -- markdownlint-cli2 "docs/fermat-pascal-kelly-system.md"`.

### WO-1 [low] — Kelly robustness readouts: scaled-growth retention, half-edge Kelly, implied beliefs (review items 6 + C8)

Three badges on the Kelly panel answering "how much growth do I keep at the
scaled fraction?", "what if my edge is half what I think?", and "what edge does
my current position imply?". All math is paste-ready below.

**File:** `/Users/lz/dev/fund/js/pages/analysis/lab.js`

**Step 1 — Find:**

```text
function computeMetrics(config) {
```

**Change:** insert these two functions immediately before that line:

```js
function resolveCurrentWeight(config) {
    const raw = Number(config.position?.currentWeight ?? config.weight);
    return Number.isFinite(raw) ? raw : 0;
}

function solveImpliedEdgeBelief(kellyReturns, riskFreeRate, fullKelly, currentWeight) {
    if (!kellyReturns.length || !(fullKelly > 0) || !(currentWeight > 0)) {
        return null;
    }
    if (currentWeight >= fullKelly) {
        return 1;
    }
    const meanReturn = kellyReturns.reduce((sum, r) => sum + r.prob * r.ret, 0);
    const meanExcess = meanReturn - riskFreeRate;
    if (!(meanExcess > 0)) {
        return null;
    }
    // f* falls monotonically as a uniform haircut δ on scenario returns grows
    // from 0 to meanExcess; bisect for the δ where f* equals the position.
    let lo = 0;
    let hi = meanExcess;
    for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        const shifted = kellyReturns.map((r) => ({ prob: r.prob, ret: r.ret - mid }));
        if (solveKellyFraction(shifted, riskFreeRate) > currentWeight) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return 1 - (lo + hi) / 2 / meanExcess;
}

function computeKellyExtras(kellyReturns, riskFreeRate, fullKelly, scaledKelly, currentWeight) {
    const baselineGrowth = Math.log(1 + riskFreeRate);
    const growthAtFull =
        fullKelly > 0 ? kellyLogGrowth(fullKelly, kellyReturns, riskFreeRate) : baselineGrowth;
    const scaledGrowthRetention =
        fullKelly > 0 && growthAtFull > baselineGrowth
            ? (kellyLogGrowth(scaledKelly, kellyReturns, riskFreeRate) - baselineGrowth) /
              (growthAtFull - baselineGrowth)
            : null;
    const meanReturn = kellyReturns.reduce((sum, r) => sum + r.prob * r.ret, 0);
    const meanExcess = meanReturn - riskFreeRate;
    const kellyAtHalfEdge =
        meanExcess > 0
            ? solveKellyFraction(
                  kellyReturns.map((r) => ({ prob: r.prob, ret: r.ret - meanExcess / 2 })),
                  riskFreeRate
              )
            : null;
    const impliedEdgeBelief = solveImpliedEdgeBelief(
        kellyReturns,
        riskFreeRate,
        fullKelly,
        currentWeight
    );
    return { scaledGrowthRetention, kellyAtHalfEdge, impliedEdgeBelief };
}
```

**Step 2 — Find:**

```text
    const zeroGrowthFraction = solveZeroGrowthFraction(kellyReturns, riskFreeRate, fullKelly);
```

**Change:** append immediately after that line:

```js
const kellyExtras = computeKellyExtras(
    kellyReturns,
    riskFreeRate,
    fullKelly,
    scaledKelly,
    resolveCurrentWeight(config)
);
```

**Step 3 — Find:**

```text
        zeroGrowthFraction,
        expectedTerminalPrice,
```

**Change:** insert between those two lines:

```js
        scaledGrowthRetention: kellyExtras.scaledGrowthRetention,
        kellyAtHalfEdge: kellyExtras.kellyAtHalfEdge,
        impliedEdgeBelief: kellyExtras.impliedEdgeBelief,
```

**Step 4 — Find:**

```text
    if (config.symbol === 'PORT' && metrics.covarianceRatio) {
```

**Change:** insert immediately before that line:

```js
if (Number.isFinite(metrics.scaledGrowthRetention)) {
    targetEl.appendChild(
        createBadge('Scaled Growth', `${(metrics.scaledGrowthRetention * 100).toFixed(0)}% of max`)
    );
}
if (Number.isFinite(metrics.kellyAtHalfEdge)) {
    targetEl.appendChild(createBadge('Half-Edge K', formatPercent(metrics.kellyAtHalfEdge)));
}
if (Number.isFinite(metrics.impliedEdgeBelief)) {
    targetEl.appendChild(
        createBadge('Implied Edge', `${(metrics.impliedEdgeBelief * 100).toFixed(0)}% of model`)
    );
}
```

**Step 5 (tests) — File:** `/Users/lz/dev/fund/tests/js/pages/analysis/lab.test.js`
**Find:**

```text
        it('normalizes riskFreeRate with a 4% default and preserves explicit values', async () => {
```

**Change:** insert immediately before that line:

```js
it('reports scaled-growth retention, half-edge Kelly, and implied belief', async () => {
    const { computeMetrics } = (await import('@pages/analysis/lab.js')).__analysisLabTesting;
    const metrics = computeMetrics(kellyConfig({ position: { currentWeight: 1.25 } }));
    // G(1.25)/G(2.5) in log units ≈ 0.764 (half-Kelly keeps ~3/4 of growth)
    expect(metrics.scaledGrowthRetention).toBeCloseTo(0.764, 2);
    // mean haircut 0.025 → returns 0.175/-0.125 → f* = 0.05/0.04375
    expect(metrics.kellyAtHalfEdge).toBeCloseTo(1.1429, 3);
    // haircut δ with f*(δ) = 1.25 is 0.02288 → belief = 1 - δ/0.05 ≈ 0.542
    expect(metrics.impliedEdgeBelief).toBeCloseTo(0.542, 2);
});

it('returns null robustness readouts when there is no edge or no position', async () => {
    const { computeMetrics } = (await import('@pages/analysis/lab.js')).__analysisLabTesting;
    const metrics = computeMetrics(
        kellyConfig({
            model: { preferences: { horizon: 1, kellyScale: 0.5, riskFreeRate: 0.06 } },
        })
    );
    expect(metrics.scaledGrowthRetention).toBeNull();
    expect(metrics.kellyAtHalfEdge).toBeNull();
    expect(metrics.impliedEdgeBelief).toBeNull();
});
```

**Step 6 (render test) — File:** `/Users/lz/dev/fund/tests/js/pages/analysis/lab_revival.test.js`
**Find:**

```text
                    scenarioVolatility: 0.15,
```

**Change:** replace that line with:

```js
                    scenarioVolatility: 0.15,
                    scaledGrowthRetention: 0.76,
                    kellyAtHalfEdge: 1.14,
                    impliedEdgeBelief: 0.54,
```

**Find:**

```text
            expect(kellyMetrics.textContent).toContain('σ Scen/Input');
```

**Change:** append immediately after that line:

```js
expect(kellyMetrics.textContent).toContain('Scaled Growth');
expect(kellyMetrics.textContent).toContain('Half-Edge K');
expect(kellyMetrics.textContent).toContain('Implied Edge');
```

**Verify:**
`npx jest tests/js/pages/analysis/lab.test.js tests/js/pages/analysis/lab_revival.test.js && npx eslint js/pages/analysis/lab.js tests/js/pages/analysis/lab.test.js tests/js/pages/analysis/lab_revival.test.js`

**Guardrail:** `solveImpliedEdgeBelief` bisects a uniform mean haircut, not a
return scale — scaling returns by s moves f\* by 1/s (variance scales too),
which is the wrong direction for this readout. Don't "simplify" it.

### WO-2 [low] — Correlated growth/valuation shocks in the Monte Carlo worker (review item 8a)

Growth misses and multiple compression coincide; the worker currently samples
them independently. Single-file change plus test plus one design-doc line.

**File:** `/Users/lz/dev/fund/js/pages/analysis/monte_carlo.worker.js`

**Step 1 — Find:**

```text
        const sampledCagr = normalSample(scenario.growth.epsCagr, epsSigma / Math.sqrt(horizon));
        const sampledPe = normalSample(scenario.valuation.exitPe, peSigma);
```

**Change:** replace those two lines with:

```js
// Growth disappointment and multiple compression coincide, so the two
// shocks are correlated (rho = 0.4) via a shared standard normal.
const GROWTH_PE_CORR = 0.4;
const zGrowth = normalSample(0, 1);
const zPe = GROWTH_PE_CORR * zGrowth + Math.sqrt(1 - GROWTH_PE_CORR ** 2) * normalSample(0, 1);
const sampledCagr = scenario.growth.epsCagr + (zGrowth * epsSigma) / Math.sqrt(horizon);
const sampledPe = scenario.valuation.exitPe + zPe * peSigma;
```

**Step 2 (test) — File:** `/Users/lz/dev/fund/tests/js/pages/analysis/monte_carlo.worker.test.js`
**Find:**

```text
    it('returns an error for scenarios missing growth/valuation blocks (PORT view)', () => {
```

**Change:** insert immediately before that line:

```js
it('correlates growth and exit-PE shocks with rho = 0.4', () => {
    global.self.crypto.getRandomValues.mockImplementation((array) => {
        array[0] = 2147483648; // secureRandom() === 0.5 exactly
        return array;
    });

    const payload = {
        scenarios: [
            {
                prob: 1,
                growth: { epsCagr: 0.1, epsCagrSigma: 0.05 },
                valuation: { exitPe: 15, exitPeSigma: 2 },
            },
        ],
        volatility: 0.2,
        horizon: 1,
        paths: 50,
        eps: 10,
    };

    global.self.onmessage({ data: { type: 'RUN_SIMULATION', payload } });

    const result = mockPostMessage.mock.calls[0][0].result;
    // z1 = sqrt(-2 ln 0.5)·cos(pi) = -1.177410; z2 = z1·(0.4 + sqrt(0.84)) = -1.550078
    // sampledCagr = 0.1 + z1·0.05 = 0.0411295; sampledPe = 15 + z2·2 = 11.8998438
    expect(result.mean).toBeCloseTo(123.8928, 3);
});
```

**Step 3 (doc) — File:** `/Users/lz/dev/fund/docs/fermat-pascal-kelly-system.md`
**Find:**

```text
2. Perturb EPS CAGR and exit PE around scenario means.
```

**Change:** replace with:

```text
2. Perturb EPS CAGR and exit PE around scenario means with correlated shocks (ρ = 0.4): growth disappointment and multiple compression coincide.
```

**Verify:**
`npx jest tests/js/pages/analysis/monte_carlo.worker.test.js && npm exec -- markdownlint-cli2 "docs/fermat-pascal-kelly-system.md"`

**Guardrail:** the existing test's alternating 0.2/0.8 mock stays valid — the
new code consumes the same five `secureRandom()` calls per path as the old
(pickScenario 1 + two normals × 2). If you change the call count, that test
breaks.

### WO-3 [trivial] — Design doc: scenario-authoring guidance (review item 9, C1–C3)

**File:** `/Users/lz/dev/fund/docs/fermat-pascal-kelly-system.md`
**Find:**

```text
- Each scenario carries a probability, fundamental trajectory (e.g., EPS CAGR), and exit valuation (terminal PE).
```

**Change:** append immediately after that line:

```markdown
- Include an explicit left-tail/catastrophe state (fraud, nationalization, −90%; even at 1–3% probability) — tail risk metrics are degenerate without one.
- Scenario returns are total return: include reinvested dividends/distributions over the horizon, not just terminal EPS × exit PE.
- Anchor exit PEs to the stock's historical multiple distribution or a fundamentals-implied terminal multiple, and record the anchor in the scenario notes.
```

**Verify:** `npm exec -- markdownlint-cli2 "docs/fermat-pascal-kelly-system.md"`

### WO-4 [trivial] — Design doc: myopic-optimality note in §6.2 (review C5)

**File:** `/Users/lz/dev/fund/docs/fermat-pascal-kelly-system.md`
**Find:**

```text
- Adjust toward the new Kelly fraction subject to bounds (max change per period, position limits).
```

**Change:** append immediately after that line:

```markdown
- Under i.i.d. returns the myopic (period-by-period) Kelly strategy is already optimal for log utility (Mossin 1968); the dynamic layer's value is handling regime shifts through the Bayesian updates plus transaction-cost friction on rebalancing, not beating myopia under stationarity.
```

**Verify:** `npm exec -- markdownlint-cli2 "docs/fermat-pascal-kelly-system.md"`

### WO-5 [trivial] — Design doc: market-implied layer caveats in §8 (review C6)

**File:** `/Users/lz/dev/fund/docs/fermat-pascal-kelly-system.md`
**Find:**

```text
- Use option prices (e.g., Breeden–Litzenberger) to estimate risk-neutral terminal price distribution.
```

**Change:** append immediately after that line:

```markdown
- Requires arbitrage-free smile interpolation (no butterfly arbitrage) before differentiating call prices twice in strike.
```

**Find:**

```text
- Adjust for risk premia using equity risk premium assumptions or heuristic tilts.
```

**Change:** append immediately after that line:

```markdown
- Rigorous conversion exists (Ross's Recovery Theorem, 2015) but is fragile outside its assumptions (Borovička–Hansen–Scheinkman 2016); heuristic tilts are acceptable when labeled as such. Compare tails, where subjective and implied distributions diverge most.
```

**Verify:** `npm exec -- markdownlint-cli2 "docs/fermat-pascal-kelly-system.md"`

### Deferred — [skip], route to a design session instead of a mechanical pass

- **Drawdown-constrained sizing (item 7, B2)** — needs a constraint-input UX
  decision and depends on path simulation below; see Grossman & Zhou 1993.
- **Monte Carlo path simulation (item 8b)** — annual-step regime model needed
  before drawdown distributions can be produced; terminal-only paths can't.
- **Joint multi-asset scenarios + portfolio constraints (item 10, C4)** —
  shared macro states vs copula is an unsettled modeling choice (open
  question #4 above).
- **Calibration wiring to Brier scoring (item 11, C7)** — needs a resolution
  criterion design for scenario probabilities before any code.
- **Bayesian posterior over scenario parameters (B1 part 3)** — extends §4
  from probabilities to parameters; schema design needed first.

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
