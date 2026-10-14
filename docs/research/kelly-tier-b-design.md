# Kelly Engine Tier-B Designs

**Status: Design (not yet implemented)**
**Date: 2026-10-14**
**Scope:** the five deferred `[skip]` items from
`docs/research/kelly-system-review.md` → Action items → Deferred. Designs are
concrete enough to feed `/action-items` → `/implement-action-items`.

## Verified ground truth (checked this session)

- `js/pages/analysis/monte_carlo.worker.js` — `runSimulation(config)` is
  terminal-only; consumes exactly 5 `secureRandom()` calls per path
  (`pickScenario` 1 + two normals × 2); perturbs `epsCagr`/`exitPe` once per
  path with ρ = 0.4 correlated shocks; the fan chart's intermediate years are
  **fake** (interpolated `initialPrice × (terminal/initial)^(t/T)`,
  worker lines 126–143). PORT configs error out ("Scenario data lacks
  growth/valuation blocks") because aggregated scenarios carry
  `precomputedMultiple`, not growth/valuation blocks.
- `js/pages/analysis/lab.js` — `solveKellyFraction(kellyReturns, riskFreeRate)`
  is generic over any discrete return set; `computeMetrics` produces
  `kellyReturns`, `fullKelly`, `zeroGrowthFraction`, etc.; MC payload is built
  in `runMonteCarloSimulation` (`price`, `eps`, `scenarios`, `volatility`,
  `horizon`, `paths`).
- `scripts/analysis/sync_configs.py:485-501` — the nightly sync **rebuilds**
  each scenario dict with a fixed key set
  (`id, name, prob, growth{epsCagr, epsCagrSigma}, valuation{exitPe, exitPeSigma}, notes`).
  **Any new scenario field is silently stripped unless the normalizer is
  extended.** `belief_state` is whitelisted (`:521-530`); `predictions` and
  `decision_journal` pass through untouched (`:532-536`).
- `data/analysis/<TICKER>.json` is the canonical config store (sync normalizes
    - refreshes market data in place; it does not regenerate from
      `docs/thesis/`). Real example: ANET has 3 scenarios with
      `epsCagrSigma: null`, `position.maxKellyWeight: 0.03`,
      `position.constraints: {minWeight: 0, maxWeight: 0.3}`.
- Evidence log: `data/analysis/<TICKER>.evidence.jsonl`, one JSON object per
  line (`date, claim, source_url, direction, strength, thesis_commit_ref`);
  `bayes.js` `parseJsonl` preserves unknown fields, and
  `BayesianEngine.computeBrierScore` (`js/pages/analysis/bayes.js:137`) scores
  resolved `predictions` (`id, claim, target_date, probability, resolved,
outcome, resolved_date, notes`).

---

## Design 1 — Monte Carlo path simulation (foundation)

**Goal:** produce real annual paths so drawdown distributions (Design 2) and
honest fan charts exist. Replaces the interpolated-fan fake.

### Model

Per path (scenario picked once per path — scenarios are multi-year regimes,
not annual iid draws):

1. Draw scenario by probability; draw correlated `epsCagr̃`, `exitPẽ` exactly as
   today (ρ = 0.4). These anchor the path's **terminal** values:
   `terminalEps`, `terminalPrice` (unchanged math).
2. Fundamental value path: `V_t = eps·(1+epsCagr̃)^t · PE_t` where `PE_t`
   geometrically interpolates current PE → `exitPẽ`:
   `PE_t = PE_0^(1−t/T) · exitPẽ^(t/T)`.
3. Annual price path as a **Brownian bridge pinned to the terminal draw**:
   `log P_t = log V_t + w_t − (t/T)·w_T`, where `w_t = Σ_{s≤t} ε_s`,
   `ε_s ~ N(0, volatility²)`. By construction `P_T = terminalPrice` exactly, so
   the terminal distribution is untouched; the bridge only adds realistic
   intra-horizon wandering around the fundamental trajectory.

Per-path outputs: annual simple returns `r_t = P_t/P_{t−1} − 1` and max
drawdown `max_t (1 − P_t / max_{s≤t} P_s)`.

**Limitation (document in UI):** annual sampling understates intra-year
drawdowns (~monthly sampling would deepen them ~10–15% empirically). v1 is
annual to match the Kelly model's annual rebalancing period.

### Interface

New worker message — keep `RUN_SIMULATION` byte-identical (its RNG call count
is pinned by tests):

- Request: `{ type: 'RUN_PATH_SIMULATION', payload: { price, eps, scenarios, volatility, horizon, paths, riskFreeRate, fGrid? } }`
- Response: `{ type: 'PATH_SIMULATION_COMPLETE', result: { terminalValues, annualFan (real percentiles per year), maxDrawdown: {p50, p80, p95, mean}, exceedance: { [f]: P(maxDD > δ_grid_point) } (only if fGrid), paths? } }`

`fGrid` is for Design 2; when absent the worker skips wealth-path computation.

### lab.js integration

- `runMonteCarloSimulation` sends `RUN_PATH_SIMULATION` instead of
  `RUN_SIMULATION` when `config.metrics.riskFreeRate` is available (i.e.,
  always post-Tier-A); falls back to `RUN_SIMULATION` on `result.error`.
- Fan chart consumes `annualFan` when present (real percentiles) instead of
  the worker's interpolated `fanChart`.
- New badge row in the MC section: `P(DD>30%): NN%`, `p95 DD: NN%`.

### Test plan — path simulation

- Constant-0.5 RNG mock (convention from the WO-2 test): all `ε_s` identical →
  golden-value assertions on `annualFan` year-1 p50 and `maxDrawdown.mean`.
- Terminal-price invariance: with the bridge, `result.terminalValues` equals
  the terminal-only distribution given the same RNG stream (assert mean
  matches the WO-2 golden value 123.8928 with the same mock).
- PORT config (no growth/valuation blocks) still returns the error object.

---

## Design 2 — Drawdown-constrained sizing

**Goal:** answer "what fraction keeps my drawdown risk tolerable?" alongside
"what fraction maximizes growth?". Theory anchor: Grossman & Zhou 1993
(growth-optimal s.t. wealth never below a floor fraction of its running max);
implemented empirically via Design 1.

### Two tiers

**Tier 1 — closed-form heuristic (no worker, instant).** Thorp's fractional-
Kelly drawdown relation: betting `c·f\*`, the probability of ever falling to
fraction `x` of peak wealth is ≈ `x^(2/c − 1)`. With `c =
scaledKelly/fullKelly` (currently 0.5) and `x = 1 − maxDrawdown`:

```js
const drawdownRisk = c > 0 ? (1 - maxDrawdown) ** (2 / c - 1) : 1;
```

Displayed as a badge: `P(DD>30%) ≈ 12%` at half-Kelly. Marked "heuristic" —
it assumes a lognormal diffusion, not the scenario mixture.

**Tier 2 — simulated constraint (uses Design 1's `fGrid`).** For each
candidate fraction `f` in `fGrid` (e.g. `fullKelly × [0, 0.25, 0.5, 0.75, 1,
1.5, 2]`), each path's annual returns give a wealth path
`W_t = Π_s (1 + rf + f·(r_s − rf))`; compute `maxDD(f)` per path and
`P(maxDD(f) > maxDrawdown)`. The **drawdown-constrained fraction** is the
largest grid `f` with exceedance probability ≤ `drawdownTolerance`
(interpolate linearly between grid points).

### Inputs (new preferences, normalized in `_normalizeModelPreferences`)

- `maxDrawdown` — default `0.30`. The pain threshold.
- `drawdownTolerance` — default `0.05`: accept at most a 5% chance of
  breaching `maxDrawdown` over the horizon.

### Outputs

- `metrics.drawdownConstrainedKelly` (+ scaled variant = min of it and the
  existing `scaledKelly`? No — display both: `Scaled Kelly` stays
  growth-driven, `DD-Capped K` is the risk-driven cap; recommended position =
  `min(scaledKelly, drawdownConstrainedKelly)`, badge `Recommended`).
- Kelly curve: vertical marker at the DD-capped fraction (orange), labeled
  `DD cap`.

### Decision taken (was a UX question)

The constraint is a **displayed cap, not a silent override**: the panel shows
both numbers and the min as "Recommended". Overriding silently would hide
exactly the tension the user should see.

### Test plan — drawdown sizing

- Closed-form: `c=0.5, maxDrawdown=0.5` → `0.5^3 = 0.125` exactly.
- Simulated: constant-RNG mock paths → deterministic wealth paths → golden
  exceedance values; grid selection logic: exceedance `[0, 0, 0.02, 0.09, ...]`
  with tolerance 0.05 picks the 0.02 grid point.
- Preferences normalization: defaults applied, explicit values preserved.

---

## Design 3 — Joint multi-asset scenarios via shared macro states

**Goal:** fix the PORT aggregation artifact (Bull-with-Bull averaging
compresses dispersion → scenario σ 8% vs 27.5% input → Full Kelly 719%) by
making cross-asset co-movement explicit instead of label-averaged.

### Schema change

Scenario gains an optional field (ticker JSONs, authored via the thesis-update
flow):

```json
{ "id": "bear", "macroState": "ai-capex-bust", ... }
```

**Verified trap:** `sync_configs.py:485-501` rebuilds scenario dicts and would
strip `macroState`. The normalizer must be extended to pass it through
(`'macroState': scenario.get('macroState')` — `None` default), with a test in
`tests/python/test_sync_configs*.py` conventions.

### Aggregation semantics (`aggregateScenarios` in lab.js)

- Group portfolio scenarios by `macroState` **when every config with weight
  uses it**; otherwise fall back to today's `id` grouping (backward
  compatible — current configs have no `macroState`).
- `computeBaseScenarioOutcome` passes `macroState` into outcomes so the
  aggregator can see it.
- An asset missing a macro state contributes its probability-weighted mean
  multiple for that state (neutral carry), and the UI flags the gap once per
  render ("GOOG has no `ai-capex-bust` scenario").
- Portfolio probability of a macro state: weighted average of per-asset
  probabilities for that state (they should roughly agree across assets —
  disagreement is itself a useful consistency check to display).

Crisis correlation then falls out naturally: every asset's bust scenario tagged
`risk-off` reprices jointly, instead of historical-correlation averaging.

### Position constraints

Reuse the existing per-ticker schema instead of inventing new fields:

- `position.constraints.maxWeight` (already present, e.g. 0.30 for ANET) caps
  the **recommended** display: `Recommended = min(scaledKelly, maxWeight)`,
  with a `capped` marker when binding.
- `position.maxKellyWeight` (0.03 for ANET) appears to be vestigial — decide
  during implementation whether to deprecate it or wire it as the cap; do not
  keep two cap sources.
- Full Kelly stays uncapped in display (it's a property of the model); only
  the recommendation is clamped. Long-only is already enforced (f ≥ 0).

### Test plan — joint scenarios

- Two-config portfolio with matching `macroState` tags → joint scenario returns
  are weighted sums per state, not label averages (golden values).
- Mixed configs (one with, one without `macroState`) → fallback to `id`
  grouping with the gap flag.
- sync round-trip test: `macroState` survives `sync_configs.py` normalization.
- Constraint: `maxWeight: 0.3` with scaledKelly 0.5 → Recommended 0.30, capped
  flag set.

---

## Design 4 — Calibration wiring: scenario checkpoint predictions

**Goal:** make scenario probabilities scoreable by the existing Brier
machinery (`bayes.js:137`, rendered by `renderPredictions`) instead of waiting
5 years for terminal resolution.

### Resolution convention (the design decision)

Scenarios imply EPS paths. Each scenario generates **annual checkpoint
predictions** that resolve against filings:

- For scenario `s` with `epsCagr g`, checkpoint year `t`:
  `EPS_t = eps₀·(1+g)^t`.
- Per ticker per year, two resolvable claims:
    - `"FY<year> EPS ≥ <base-path checkpoint>"` with
      `probability = 1 − p_bear` (true unless we're on the bear path), and
    - `"FY<year> EPS ≥ <bull-path checkpoint>"` with `probability = p_bull`.
- `target_date`: expected earnings date (fiscal year end + ~6 weeks; recorded
  as a date string, resolution stays human/agent-confirmed — never auto-resolve
  from scraped data, per the leakage guardrail).

Brier scores over these checkpoints measure whether the probability split
across scenarios is calibrated, years before the terminal date.

### Mechanics

- New script `scripts/analysis/scenario_checkpoints.py` (stdlib only): reads
  `data/analysis/<T>.json`, emits proposed prediction entries
  (`id: "checkpoint:<T>:<fy>:<level>"`) to stdout as JSON. **Never writes
  `data/`** — the thesis-update flow (human/agent) appends accepted entries to
  the config's `predictions` array, which the nightly sync passes through
  untouched (`sync_configs.py:532-536`).
- Skip existing checkpoint ids (idempotent re-runs).
- Frontend: no changes needed; `renderPredictions` + Brier badge already
  consume the schema.

### Test plan — calibration

- `tests/python/test_scenario_checkpoints.py`: tmp_path config fixture →
  correct checkpoint EPS values, correct probabilities, id-skip on re-run,
  malformed scenario skipped with warning.

---

## Design 5 — Bayesian posteriors over scenario parameters

**Goal:** extend the §4 Bayesian layer from scenario _probabilities_ to
scenario _parameters_ (EPS CAGR, exit PE), so evidence both shifts probability
mass **and** sharpens/widens parameter estimates — and parameter uncertainty
feeds Kelly sizing.

### Evidence schema extension (backward compatible)

`*.evidence.jsonl` lines gain optional fields (parseJsonl already preserves
unknown keys):

```json
{
    "date": "2026-11-05",
    "claim": "...",
    "direction": "bullish",
    "strength": 0.7,
    "metric": "epsCagr",
    "observed": 0.31,
    "noise": 0.04,
    "appliesTo": "base"
}
```

`metric` ∈ `epsCagr` | `exitPe`; `noise` = observation std (how precisely the
data point pins the parameter — a single quarter is noisy, a full year less
so); `appliesTo` optional scenario id (omit = update all scenarios' parameter
posteriors).

### Update rule (conjugate normal–normal, closed form)

Per scenario, prior `N(μ₀, σ₀²)` with `μ₀ = epsCagr`,
`σ₀ = epsCagrSigma ?? volatility×0.5` (the worker's existing fallback
convention). Observation `(x, σ_x)`:

```js
const postVar = 1 / (1 / priorVar + 1 / noiseVar);
const postMean = postVar * (priorMean / priorVar + x / noiseVar);
```

Applied in lab.js at config-load time over the evidence log (chronological,
each observation updates the posterior). The updated `(mean, sigma)` feed
`computeScenarioOutcome` and the MC worker, so a stream of confirming evidence
visibly tightens the distribution; contradicting evidence (high `noise`,
off-mean `observed`) widens it.

### Sizing payoff — MC-Kelly and the estimation-risk drag

The Tier-A solver is generic over discrete return sets, so:

1. Run the path worker's _parameter-perturbed_ annual returns (Design 1
   mixture, no bridge needed) → N sampled annual return draws.
2. `mcKelly = solveKellyFraction(sampledReturns, riskFreeRate)` — Kelly over
   the full parameter-uncertainty mixture, not just the 3 point scenarios.
3. Badge: `MC Kelly: NN%` next to `Full Kelly`; the gap `fullKelly − mcKelly`
   **is** the estimation-error drag the review's B1 section calls for, made
   visible rather than hidden in an arbitrary 0.5 scaling factor.

### Test plan — parameter posteriors

- Conjugate update golden values (prior 0.15±0.05, observation 0.31±0.04 →
  posterior mean ≈ 0.2476, sigma ≈ 0.0312 — compute exactly in the test).
- Evidence lines without `metric` leave parameters untouched (backward compat).
- `mcKelly ≤ fullKelly` whenever parameter sigmas are positive (Jensen drag);
  equal when all sigmas are 0.

---

## Sequencing & effort

| Order | Design                          | Depends on                                                          | Effort                                     |
| ----- | ------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| 1     | MC path simulation              | —                                                                   | medium (worker + lab.js + tests)           |
| 2     | Drawdown-constrained sizing     | Design 1                                                            | medium (Tier 1 trivial, Tier 2 rides on 1) |
| 3     | Joint macro scenarios           | —                                                                   | medium (sync_configs.py + lab.js + schema) |
| 4     | Checkpoint predictions          | —                                                                   | low (one stdlib script + tests)            |
| 5     | Parameter posteriors + MC-Kelly | Design 1 (for MC-Kelly; the conjugate update itself is independent) | medium                                     |

Designs 3 and 4 are independent of the others and of each other. Design 2's
Tier 1 (closed-form badge) can ship immediately without waiting for Design 1.

## Open questions

1. **Intra-year drawdown granularity** — annual steps understate max drawdown.
   v1 accepts this; if the DD cap feels loose in practice, move to quarterly
   steps (4× RNG cost, no model change).
2. **Macro-state taxonomy** — who owns the canonical state list
   (`ai-capex-bust`, `risk-off`, `muddle`…)? Recommendation: a short section
   in `docs/thesis/industry/` conventions, enforced only by convention + the
   sync passthrough, not a registry.
3. **maxKellyWeight vestigial field** — deprecate or repurpose as the cap;
   decide when implementing Design 3.
4. **Observation `noise` provenance** — the noise parameter on evidence is
   judgment; no mechanical source. Start with convention: quarter = 0.05,
   full year = 0.02 (annualized EPS-growth units).

---

## Action items

Work orders for the five designs above. Ordered by impact-per-effort;
dependencies are noted where they exist.

### Preamble — rules for the implementer

- One work order per change. Work directly on `main`; **commit after each
  work order, never push**. Stage files by name (`git add <file> ...`, never
  `git add -A`); unrelated dirty files in the tree belong to other sessions.
  Conventional-commit messages (`feat(analysis): ...`).
- `Find` strings are unique anchors verified against the working tree on
  2026-10-14. **If one does not match exactly, STOP that item and report the
  mismatch — do not improvise an alternative anchor.** Line numbers are dated
  and may drift; trust the `Find` string, not the line number.
- Never edit `data/`. `data/analysis/*.json` is written only by the sync
  pipeline and the thesis-update flow, never by these work orders.
- JS style: 4-space indent, single quotes, semicolons. Python: stdlib only,
  `venv/bin/pytest`, `venv/bin/ruff check`, `venv/bin/black --check` (black is
  line-length 100 with skip-string-normalization — single quotes are fine).
- `js/pages/analysis/lab.js` has an eslint complexity ratchet (max 20 per
  function). The snippets are designed to stay under it; if eslint reports a
  complexity error, STOP and report — do not refactor on your own.
- After each work order run its scoped `Verify` command, not a full-repo gate.

### WO-1 [low] — Closed-form drawdown-risk badge (Design 2, Tier 1)

**File:** `/Users/lz/dev/fund/js/pages/analysis/lab.js`

**Step 1 — Find:**

```text
    preferences.riskFreeRate = _normalizeNumber(
        preferences.riskFreeRate ?? legacyManual.riskFreeRate,
        DEFAULT_RISK_FREE_RATE
    );
```

**Change:** append immediately after:

```js
preferences.maxDrawdown = _normalizeNumber(
    preferences.maxDrawdown ?? legacyManual.maxDrawdown,
    0.3
);
preferences.drawdownTolerance = _normalizeNumber(
    preferences.drawdownTolerance ?? legacyManual.drawdownTolerance,
    0.05
);
```

**Step 2 — Find:**

```text
function computeMetrics(config) {
```

**Change:** insert immediately before:

```js
// Thorp's fractional-Kelly drawdown relation: betting c·f*, the probability
// of ever falling to fraction x of peak wealth is approximately x^(2/c - 1).
function computeDrawdownRisk(fullKelly, scaledKelly, maxDrawdown) {
    if (!(fullKelly > 0) || !(scaledKelly > 0)) {
        return null;
    }
    const c = scaledKelly / fullKelly;
    return (1 - maxDrawdown) ** (2 / c - 1);
}
```

**Step 3 — Find:**

```text
    const expectedTerminalPrice = expectedMultiple * price;
```

**Change:** insert immediately before:

```js
const maxDrawdownRaw = Number(preferences.maxDrawdown);
const maxDrawdown = Number.isFinite(maxDrawdownRaw) ? maxDrawdownRaw : 0.3;
const drawdownToleranceRaw = Number(preferences.drawdownTolerance);
const drawdownTolerance = Number.isFinite(drawdownToleranceRaw) ? drawdownToleranceRaw : 0.05;
const drawdownRiskAtScaled = computeDrawdownRisk(fullKelly, scaledKelly, maxDrawdown);
```

**Step 4 — Find:**

```text
        impliedEdgeBelief: kellyExtras.impliedEdgeBelief,
```

**Change:** append immediately after:

```js
        maxDrawdown,
        drawdownTolerance,
        drawdownRiskAtScaled,
```

**Step 5 — Find:**

```text
    if (config.symbol === 'PORT' && metrics.covarianceRatio) {
```

**Change:** insert immediately before:

```js
if (Number.isFinite(metrics.drawdownRiskAtScaled)) {
    targetEl.appendChild(
        createBadge(
            `P(DD>${Math.round(metrics.maxDrawdown * 100)}%)`,
            `~${formatPercent(metrics.drawdownRiskAtScaled)}`
        )
    );
}
```

**Step 6 (unit test) — File:**
`/Users/lz/dev/fund/tests/js/pages/analysis/lab.test.js`
**Find:**

```text
        it('normalizes riskFreeRate with a 4% default and preserves explicit values', async () => {
```

**Change:** insert immediately before:

```js
it('estimates drawdown risk at the scaled fraction (Thorp approximation)', async () => {
    const { computeMetrics } = (await import('@pages/analysis/lab.js')).__analysisLabTesting;
    const metrics = computeMetrics(kellyConfig());
    // c = 0.5, maxDrawdown default 0.3 -> 0.7^(2/0.5 - 1) = 0.7^3
    expect(metrics.maxDrawdown).toBeCloseTo(0.3, 10);
    expect(metrics.drawdownTolerance).toBeCloseTo(0.05, 10);
    expect(metrics.drawdownRiskAtScaled).toBeCloseTo(0.343, 3);
});
```

**Step 7 (render test) — File:**
`/Users/lz/dev/fund/tests/js/pages/analysis/lab_revival.test.js`
**Find:**

```text
                    impliedEdgeBelief: 0.54,
```

**Change:** replace with:

```js
                    impliedEdgeBelief: 0.54,
                    maxDrawdown: 0.3,
                    drawdownRiskAtScaled: 0.343,
```

**Find:**

```text
            expect(kellyMetrics.textContent).toContain('Implied Edge');
```

**Change:** append immediately after:

```js
expect(kellyMetrics.textContent).toContain('P(DD>30%)');
```

**Verify:**
`npx jest tests/js/pages/analysis/lab.test.js tests/js/pages/analysis/lab_revival.test.js && npx eslint js/pages/analysis/lab.js tests/js/pages/analysis/lab.test.js tests/js/pages/analysis/lab_revival.test.js`

### WO-2 [low] — MC-Kelly and estimation-drag cards (Design 5 payoff)

The worker already returns perturbed terminal prices (`result.paths`); solving
Kelly over that mixture quantifies the estimation-error drag without any
worker change.

**File:** `/Users/lz/dev/fund/js/pages/analysis/lab.js`
**Find:**

```text
    riskMetricsEl.appendChild(createStatCard('VaR (95%)', formatCurrency(result.VaR_95)));
    riskMetricsEl.appendChild(createStatCard('CVaR (95%)', formatCurrency(result.CVaR_95)));
}
```

**Change:** insert before the closing `}`:

```js
const mcConfig = state.configs.find((cfg) => cfg.symbol === state.activeSymbol);
const mcMetrics = mcConfig && mcConfig.metrics;
if (
    mcMetrics &&
    Array.isArray(result.paths) &&
    result.paths.length > 0 &&
    mcMetrics.price > 0 &&
    mcMetrics.horizon > 0 &&
    Number.isFinite(mcMetrics.riskFreeRate)
) {
    const n = result.paths.length;
    const mcReturns = result.paths.map((v) => ({
        prob: 1 / n,
        ret: (v / mcMetrics.price) ** (1 / mcMetrics.horizon) - 1,
    }));
    const mcKelly = solveKellyFraction(mcReturns, mcMetrics.riskFreeRate);
    riskMetricsEl.appendChild(createStatCard('MC Kelly', formatPercent(mcKelly)));
    if (Number.isFinite(mcMetrics.fullKelly)) {
        riskMetricsEl.appendChild(
            createStatCard('Estimation Drag', formatPercent(mcMetrics.fullKelly - mcKelly))
        );
    }
}
```

**Test — File:** `/Users/lz/dev/fund/tests/js/pages/analysis/lab_revival.test.js`
**Find:**

```text
        it('skips the zero-growth marker when growth never falls back to the risk-free rate', async () => {
```

**Change:** insert immediately before:

```js
it('renders MC Kelly and estimation drag from returned paths', async () => {
    const module = await setupLab();
    const { renderMonteCarloResults, state } = module.__analysisLabTesting;
    state.configs = [
        {
            symbol: 'ANET',
            metrics: { price: 100, horizon: 1, riskFreeRate: 0, fullKelly: 2.5 },
        },
    ];
    state.activeSymbol = 'ANET';

    renderMonteCarloResults({
        mean: 105,
        median: 104,
        VaR_95: 80,
        CVaR_95: 75,
        histogram: { min: 80, max: 130, binSize: 1, counts: [1, 2, 1] },
        paths: [120, 90],
    });

    const riskMetrics = document.getElementById('riskMetrics');
    expect(riskMetrics.textContent).toContain('MC Kelly');
    expect(riskMetrics.textContent).toContain('+250.00%');
    expect(riskMetrics.textContent).toContain('Estimation Drag');
});
```

(Paths [120, 90] on price 100 give returns +0.2/−0.1 at rf 0 → MC Kelly 2.5,
matching the known two-scenario solution.)

**Verify:**
`npx jest tests/js/pages/analysis/lab_revival.test.js && npx eslint js/pages/analysis/lab.js`

**Guardrail:** `renderMonteCarloResults` also touches `monteCarloCanvas`; the
test must go through `setupLab()` (which initializes the pane element refs and
the canvas mock) — do not call the renderer on a bare import.

### WO-3 [low] — Scenario checkpoint predictions script (Design 4)

Two new files, full contents below.

**File (new):** `/Users/lz/dev/fund/scripts/analysis/scenario_checkpoints.py`

```python
"""Propose dated EPS-checkpoint predictions from scenario configs.

Reads data/analysis/<TICKER>.json and prints proposed prediction entries as
JSON to stdout. Never writes anything — a human/agent appends accepted entries
to the config's predictions array (the nightly sync passes predictions through
untouched). Design: docs/research/kelly-tier-b-design.md, Design 4.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

ANALYSIS_DIR = Path(__file__).resolve().parents[2] / "data" / "analysis"


def load_config(ticker: str, analysis_dir: Path | None = None) -> dict[str, Any]:
    directory = analysis_dir or ANALYSIS_DIR
    with open(directory / f"{ticker.upper()}.json") as f:
        return json.load(f)


def build_checkpoints(config: dict[str, Any], as_of: date) -> list[dict[str, Any]]:
    symbol = str(config.get("symbol", "?")).upper()
    market = config.get("market") or {}
    eps = float(market.get("eps") or 0)
    preferences = (config.get("model") or {}).get("preferences") or {}
    horizon = int(preferences.get("horizon") or 5)
    scenarios = [
        s
        for s in (config.get("scenarios") or [])
        if isinstance(s.get("growth"), dict)
        and isinstance(s["growth"].get("epsCagr"), (int, float))
    ]
    if eps <= 0 or not scenarios:
        return []
    scenarios.sort(key=lambda s: float(s["growth"]["epsCagr"]))
    total_prob = sum(float(s.get("prob") or 0) for s in scenarios)
    if total_prob <= 0:
        return []
    existing_ids = {
        p.get("id") for p in (config.get("predictions") or []) if isinstance(p, dict)
    }
    proposals = []
    # The worst scenario's checkpoint is almost surely cleared; skip it.
    for idx, scenario in enumerate(scenarios[1:], start=1):
        g = float(scenario["growth"]["epsCagr"])
        prob = sum(float(s.get("prob") or 0) for s in scenarios[idx:]) / total_prob
        sid = scenario.get("id") or scenario.get("name") or f"s{idx}"
        for t in range(1, horizon + 1):
            year = as_of.year + t
            checkpoint = round(eps * (1 + g) ** t, 2)
            pred_id = f"checkpoint:{symbol}:fy{year}:{sid}"
            if pred_id in existing_ids:
                continue
            proposals.append(
                {
                    "id": pred_id,
                    "claim": f"FY{year} EPS >= {checkpoint} ({sid}-path checkpoint)",
                    "target_date": f"{year}-12-31",
                    "probability": round(prob, 4),
                    "resolved": False,
                    "outcome": None,
                    "notes": f"auto-proposed {as_of.isoformat()} from scenario '{sid}'",
                }
            )
    return proposals


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ticker", required=True)
    parser.add_argument("--as-of", default=date.today().isoformat())
    args = parser.parse_args(argv)
    as_of = date.fromisoformat(args.as_of)
    proposals = build_checkpoints(load_config(args.ticker), as_of)
    json.dump(proposals, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

**File (new):** `/Users/lz/dev/fund/tests/python/test_scenario_checkpoints.py`

```python
"""Tests for scenario_checkpoints (scripts.analysis.scenario_checkpoints)."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from scripts.analysis.scenario_checkpoints import build_checkpoints, main


def _config() -> dict:
    return {
        "symbol": "X",
        "market": {"eps": 10.0},
        "model": {"preferences": {"horizon": 2}},
        "scenarios": [
            {"id": "bear", "prob": 0.2, "growth": {"epsCagr": -0.05}},
            {"id": "base", "prob": 0.5, "growth": {"epsCagr": 0.10}},
            {"id": "bull", "prob": 0.3, "growth": {"epsCagr": 0.25}},
        ],
        "predictions": [],
    }


class TestBuildCheckpoints:
    def test_checkpoint_values_and_probabilities(self):
        proposals = build_checkpoints(_config(), date(2026, 1, 1))
        # worst scenario (bear) skipped; base and bull each get 2 years
        assert len(proposals) == 4
        base_fy27 = next(p for p in proposals if p["id"] == "checkpoint:X:fy2027:base")
        assert base_fy27["claim"] == "FY2027 EPS >= 11.0 (base-path checkpoint)"
        assert base_fy27["probability"] == 0.8  # base + bull probability mass
        bull_fy28 = next(p for p in proposals if p["id"] == "checkpoint:X:fy2028:bull")
        assert bull_fy28["claim"] == "FY2028 EPS >= 15.62 (bull-path checkpoint)"
        assert bull_fy28["probability"] == 0.3

    def test_skips_existing_ids(self):
        config = _config()
        config["predictions"] = [{"id": "checkpoint:X:fy2027:base"}]
        proposals = build_checkpoints(config, date(2026, 1, 1))
        assert all(p["id"] != "checkpoint:X:fy2027:base" for p in proposals)

    def test_empty_when_no_eps_or_scenarios(self):
        config = _config()
        config["market"] = {"eps": 0}
        assert build_checkpoints(config, date(2026, 1, 1)) == []
        config = _config()
        config["scenarios"] = [{"id": "weird", "prob": 1.0}]
        assert build_checkpoints(config, date(2026, 1, 1)) == []


def test_main_prints_json(tmp_path: Path, capsys, monkeypatch):
    analysis_dir = tmp_path / "analysis"
    analysis_dir.mkdir()
    (analysis_dir / "X.json").write_text(json.dumps(_config()))
    monkeypatch.setattr("scripts.analysis.scenario_checkpoints.ANALYSIS_DIR", analysis_dir)
    assert main(["--ticker", "X", "--as-of", "2026-01-01"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert len(out) == 4
```

**Verify:**
`venv/bin/pytest tests/python/test_scenario_checkpoints.py -q && venv/bin/ruff check scripts/analysis/scenario_checkpoints.py tests/python/test_scenario_checkpoints.py && venv/bin/black --check scripts/analysis/scenario_checkpoints.py tests/python/test_scenario_checkpoints.py`

**Guardrail:** `load_config` takes `analysis_dir` as a parameter (defaulting
to the module global at call time) precisely so the monkeypatch in the test
works — do not bind `ANALYSIS_DIR` as a default argument value.

### WO-4 [low] — `macroState` passthrough in the sync normalizer (Design 3 unblocker)

Without this, the nightly sync silently strips `macroState` from scenario
dicts (verified: `ensure_structure` rebuilds each scenario with a fixed key
set).

**File:** `/Users/lz/dev/fund/scripts/analysis/sync_configs.py`
**Find:**

```text
        normalized.append(
            {
                'id': scenario_id,
                'name': name,
                'prob': prob,
```

**Change:** add one line after `'prob': prob,`:

```python
                'macroState': scenario.get('macroState'),
```

**File (new):** `/Users/lz/dev/fund/tests/python/test_sync_configs_scenario_passthrough.py`

```python
"""Tests for scenario field passthrough in ensure_structure (sync_configs)."""

from __future__ import annotations

from scripts.analysis.sync_configs import ensure_structure


def _config(scenarios: list[dict]) -> dict:
    return {"scenarios": scenarios, "market": {"price": 100.0, "eps": 5.0}}


def test_macro_state_survives_normalization():
    config = ensure_structure(
        "X",
        _config(
            [
                {
                    "id": "bear",
                    "name": "Bear",
                    "prob": 0.2,
                    "macroState": "risk-off",
                    "growth": {"epsCagr": -0.1},
                    "valuation": {"exitPe": 12},
                }
            ]
        ),
    )
    assert config["scenarios"][0]["macroState"] == "risk-off"


def test_macro_state_defaults_to_none():
    config = ensure_structure(
        "X",
        _config(
            [
                {
                    "id": "base",
                    "name": "Base",
                    "prob": 0.6,
                    "growth": {"epsCagr": 0.1},
                    "valuation": {"exitPe": 15},
                }
            ]
        ),
    )
    assert config["scenarios"][0]["macroState"] is None
```

**Verify:**
`venv/bin/pytest tests/python/test_sync_configs_scenario_passthrough.py -q && venv/bin/ruff check scripts/analysis/sync_configs.py tests/python/test_sync_configs_scenario_passthrough.py && venv/bin/black --check scripts/analysis/sync_configs.py tests/python/test_sync_configs_scenario_passthrough.py`

**Guardrail:** if `ensure_structure` raises on the minimal fixture config,
STOP and report — do not grow the fixture by guessing required keys.

### WO-5 [medium] — Path simulation in the Monte Carlo worker (Design 1)

New message type; `runSimulation` stays byte-identical (its RNG call count is
pinned by the existing ρ = 0.4 test).

**File:** `/Users/lz/dev/fund/js/pages/analysis/monte_carlo.worker.js`

**Step 1 — Find:**

```text
        if (type === 'RUN_SIMULATION') {
            const result = runSimulation(payload);
            selfContext.postMessage({ type: 'SIMULATION_COMPLETE', result });
        }
```

**Change:** append immediately after (inside `initWorker`):

```js
if (type === 'RUN_PATH_SIMULATION') {
    const result = runPathSimulation(payload);
    selfContext.postMessage({ type: 'PATH_SIMULATION_COMPLETE', result });
}
```

**Step 2 — Find:**

```text
function secureRandom() {
```

**Change:** insert immediately before:

```js
function percentileOf(sorted, q) {
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

function runPathSimulation(config) {
    const { scenarios, volatility, horizon, paths = 10000, riskFreeRate = 0 } = config;
    const fGrid = Array.isArray(config.fGrid) ? config.fGrid : [];
    const maxDrawdownLevel = Number(config.maxDrawdown) > 0 ? Number(config.maxDrawdown) : 0.3;

    if (!scenarios.length || scenarios.some((s) => !s.growth || !s.valuation)) {
        return { error: 'Scenario data lacks growth/valuation blocks' };
    }

    const T = Math.max(1, Math.round(horizon));
    const GROWTH_PE_CORR = 0.4;
    const terminalValues = [];
    const yearlyPrices = Array.from({ length: T }, () => []);
    const maxDrawdowns = [];
    const exceedCounts = fGrid.map(() => 0);

    for (let i = 0; i < paths; i++) {
        const scenario = pickScenario(scenarios);
        const epsSigma = scenario.growth.epsCagrSigma || volatility * 0.5;
        const peSigma = scenario.valuation.exitPeSigma || volatility * 0.5;
        // RNG call order per path is pinned by tests: pickScenario, zGrowth,
        // zPe, then one normal per year in order.
        const zGrowth = normalSample(0, 1);
        const zPe =
            GROWTH_PE_CORR * zGrowth + Math.sqrt(1 - GROWTH_PE_CORR ** 2) * normalSample(0, 1);
        const sampledCagr = scenario.growth.epsCagr + (zGrowth * epsSigma) / Math.sqrt(horizon);
        const sampledPe = scenario.valuation.exitPe + zPe * peSigma;

        const terminalEps = config.eps * Math.pow(1 + sampledCagr, horizon);
        const terminalPrice = terminalEps * Math.max(1, sampledPe);
        terminalValues.push(terminalPrice);

        // Brownian bridge pinned to the terminal draw: annual prices wander
        // around the fundamental path but land exactly on terminalPrice.
        const pe0 = config.price > 0 && config.eps > 0 ? config.price / config.eps : sampledPe;
        const epsSteps = [];
        for (let t = 1; t <= T; t++) {
            epsSteps.push(normalSample(0, volatility));
        }
        const wTotal = epsSteps.reduce((sum, e) => sum + e, 0);
        let wRunning = 0;
        let prevPrice = config.price > 0 ? config.price : terminalPrice;
        let peak = prevPrice;
        let maxDd = 0;
        const wealthByGrid = fGrid.map(() => 1);
        const peakByGrid = fGrid.map(() => 1);
        const ddByGrid = fGrid.map(() => 0);
        for (let t = 1; t <= T; t++) {
            wRunning += epsSteps[t - 1];
            const peT = Math.pow(pe0, 1 - t / T) * Math.pow(Math.max(1, sampledPe), t / T);
            const vT = config.eps * Math.pow(1 + sampledCagr, t) * peT;
            const priceT = vT * Math.exp(wRunning - (t / T) * wTotal);
            yearlyPrices[t - 1].push(priceT);
            const rT = prevPrice > 0 ? priceT / prevPrice - 1 : 0;
            if (priceT > peak) {
                peak = priceT;
            }
            const dd = peak > 0 ? 1 - priceT / peak : 0;
            if (dd > maxDd) {
                maxDd = dd;
            }
            for (let g = 0; g < fGrid.length; g++) {
                const f = fGrid[g];
                wealthByGrid[g] *= 1 + riskFreeRate + f * (rT - riskFreeRate);
                if (wealthByGrid[g] > peakByGrid[g]) {
                    peakByGrid[g] = wealthByGrid[g];
                }
                const ddG = peakByGrid[g] > 0 ? 1 - wealthByGrid[g] / peakByGrid[g] : 0;
                if (ddG > ddByGrid[g]) {
                    ddByGrid[g] = ddG;
                }
            }
            prevPrice = priceT;
        }
        maxDrawdowns.push(maxDd);
        for (let g = 0; g < fGrid.length; g++) {
            if (ddByGrid[g] > maxDrawdownLevel) {
                exceedCounts[g]++;
            }
        }
    }

    terminalValues.sort((a, b) => a - b);
    const annualFan = yearlyPrices.map((values, idx) => {
        const sorted = [...values].sort((a, b) => a - b);
        return {
            t: idx + 1,
            year: idx + 1,
            median: percentileOf(sorted, 0.5),
            p5: percentileOf(sorted, 0.05),
            p25: percentileOf(sorted, 0.25),
            p75: percentileOf(sorted, 0.75),
            p95: percentileOf(sorted, 0.95),
        };
    });
    const sortedDd = [...maxDrawdowns].sort((a, b) => a - b);

    return {
        terminalValues,
        annualFan,
        maxDrawdown: {
            mean: maxDrawdowns.reduce((sum, v) => sum + v, 0) / paths,
            p50: percentileOf(sortedDd, 0.5),
            p80: percentileOf(sortedDd, 0.8),
            p95: percentileOf(sortedDd, 0.95),
        },
        exceedance: fGrid.map((f, g) => ({ f, prob: exceedCounts[g] / paths })),
        runCount: paths,
        asOf: new Date().toISOString(),
    };
}
```

**Step 3 (golden test) — File:**
`/Users/lz/dev/fund/tests/js/pages/analysis/monte_carlo.worker.test.js`
**Find:**

```text
    it('returns an error for scenarios missing growth/valuation blocks (PORT view)', () => {
```

**Change:** insert immediately before:

```js
it('simulates bridged annual paths with drawdown stats', () => {
    const queue = [];
    for (let p = 0; p < 10; p++) {
        queue.push(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0.5, 0.5);
    }
    let call = 0;
    global.self.crypto.getRandomValues.mockImplementation((array) => {
        array[0] = Math.floor(queue[call % queue.length] * (0xffffffff + 1));
        call++;
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
        horizon: 2,
        paths: 10,
        eps: 10,
        price: 100,
        riskFreeRate: 0,
        fGrid: [0, 1, 2],
        maxDrawdown: 0.05,
    };

    global.self.onmessage({ data: { type: 'RUN_PATH_SIMULATION', payload } });

    const msg = mockPostMessage.mock.calls[0][0];
    expect(msg.type).toBe('PATH_SIMULATION_COMPLETE');
    const result = msg.result;
    // All paths identical: bridge lands on the perturbed terminal price.
    expect(result.terminalValues[0]).toBeCloseTo(133.2963, 3);
    expect(result.annualFan[0].median).toBeCloseTo(146.1092, 3);
    expect(result.annualFan[1].median).toBeCloseTo(133.2963, 3);
    expect(result.maxDrawdown.mean).toBeCloseTo(0.087694, 4);
    expect(result.exceedance).toEqual([
        { f: 0, prob: 0 },
        { f: 1, prob: 1 },
        { f: 2, prob: 1 },
    ]);
});
```

(Golden derivation, verified: the queue gives zGrowth = zPe-second = −1.177410,
ε₁ = +0.235482, ε₂ = −0.235482 → g̃ = 0.0583723, PẼ = 11.899844, terminal
133.2963; P₁ = 146.1092, P₂ = 133.2963; maxDD 0.087694; f = 1 exceeds the 0.05
level on every path, f = 0 never does.)

**Verify:** `npx jest tests/js/pages/analysis/monte_carlo.worker.test.js`

**Guardrail:** do not touch `runSimulation` or `normalSample`; the ρ = 0.4
test pins the old path's RNG call count (5 per path).

### WO-6 [medium] [visual] — Lab integration: real fan, drawdown cards, DD-capped K (Designs 1 + 2 Tier 2)

Depends on WO-1 (metrics fields), WO-2 (`mcMetrics` block), WO-5 (worker).

**File:** `/Users/lz/dev/fund/js/pages/analysis/lab.js`

**Step 1 — Find:**

```text
        worker.postMessage({
            type: 'RUN_SIMULATION',
            payload: {
                price: config.metrics.price,
                eps: config.metrics.eps,
                scenarios: config.scenarios,
                volatility: config.metrics.volatility,
                horizon: config.metrics.horizon,
                paths,
            },
        });
```

**Change:** replace with:

```js
const fullKelly = config.metrics.fullKelly;
const fGrid =
    fullKelly > 0 ? [0, 0.25, 0.5, 0.75, 1, 1.5, 2].map((m) => m * fullKelly) : [0, 0.5, 1];
worker.postMessage({
    type: 'RUN_PATH_SIMULATION',
    payload: {
        price: config.metrics.price,
        eps: config.metrics.eps,
        scenarios: config.scenarios,
        volatility: config.metrics.volatility,
        horizon: config.metrics.horizon,
        paths,
        riskFreeRate: config.metrics.riskFreeRate,
        fGrid,
        maxDrawdown: config.metrics.maxDrawdown,
    },
});
```

**Step 2 — Find:**

```text
            if (type !== 'SIMULATION_COMPLETE') {
```

**Change:** replace with:

```js
            if (type !== 'SIMULATION_COMPLETE' && type !== 'PATH_SIMULATION_COMPLETE') {
```

**Step 3 — Find:**

```text
    _renderMonteCarloHistogram(result, ctx, width, height);
    _renderMonteCarloFanChart(result, ctx, width, height);
```

**Change:** replace with (annualFan carries real per-year percentiles; fall
back to the interpolated fanChart for legacy SIMULATION_COMPLETE results):

```js
_renderMonteCarloHistogram(result, ctx, width, height);
_renderMonteCarloFanChart(
    result.annualFan ? { ...result, fanChart: result.annualFan } : result,
    ctx,
    width,
    height
);
```

**Step 4 — Find:**

```text
        if (Number.isFinite(mcMetrics.fullKelly)) {
            riskMetricsEl.appendChild(
                createStatCard('Estimation Drag', formatPercent(mcMetrics.fullKelly - mcKelly))
            );
        }
    }
```

**Change:** append immediately after (still inside `_renderMonteCarloMetrics`):

```js
if (result.maxDrawdown && Number.isFinite(result.maxDrawdown.p95)) {
    riskMetricsEl.appendChild(
        createStatCard('Max DD (p95)', formatPercent(result.maxDrawdown.p95))
    );
}
if (
    Array.isArray(result.exceedance) &&
    result.exceedance.length > 0 &&
    mcMetrics &&
    Number.isFinite(mcMetrics.drawdownTolerance)
) {
    const acceptable = result.exceedance.filter(
        (entry) => entry.prob <= mcMetrics.drawdownTolerance
    );
    const ddCapped = acceptable.length > 0 ? acceptable[acceptable.length - 1].f : 0;
    riskMetricsEl.appendChild(createStatCard('DD-Capped K', formatPercent(ddCapped)));
}
```

**Step 5 (render test) — File:**
`/Users/lz/dev/fund/tests/js/pages/analysis/lab_revival.test.js`
**Find:**

```text
        it('renders MC Kelly and estimation drag from returned paths', async () => {
```

**Change:** insert immediately before:

```js
it('renders drawdown stats and the DD-capped fraction from path results', async () => {
    const module = await setupLab();
    const { renderMonteCarloResults, state } = module.__analysisLabTesting;
    state.configs = [
        {
            symbol: 'ANET',
            metrics: {
                price: 100,
                horizon: 1,
                riskFreeRate: 0,
                fullKelly: 2.5,
                drawdownTolerance: 0.05,
            },
        },
    ];
    state.activeSymbol = 'ANET';

    renderMonteCarloResults({
        mean: 105,
        median: 104,
        VaR_95: 80,
        CVaR_95: 75,
        histogram: { min: 80, max: 130, binSize: 1, counts: [1, 2, 1] },
        paths: [120, 90],
        maxDrawdown: { mean: 0.1, p50: 0.09, p80: 0.15, p95: 0.4 },
        exceedance: [
            { f: 0, prob: 0 },
            { f: 1.25, prob: 0.02 },
            { f: 2.5, prob: 0.2 },
        ],
    });

    const riskMetrics = document.getElementById('riskMetrics');
    expect(riskMetrics.textContent).toContain('Max DD (p95)');
    expect(riskMetrics.textContent).toContain('DD-Capped K');
    expect(riskMetrics.textContent).toContain('+125.00%');
});
```

**Verify:** `npx jest tests/js/pages/analysis/`
**Visual:** run `make screenshot URL=/terminal/ ARGS='--keys analysis --keys "analysis mc" --settle 1500 --el "#analysisSection" --wait 1800'`
and confirm the MC section renders with the new cards — then hand off for
human review of `/terminal/`.

**Guardrail:** the PORT config intentionally has no growth/valuation scenario
blocks; the worker returns the error object and the error branch in
`runMonteCarloSimulation` already handles it — do not "fix" that.

### WO-7 [medium] — Shared macro states in portfolio aggregation (Design 3)

Depends on WO-4 (otherwise the sync strips the field). Backward compatible:
configs without `macroState` aggregate exactly as today.

**File:** `/Users/lz/dev/fund/js/pages/analysis/lab.js`

**Step 1 — Find:**

```text
        notes: scenario.notes ?? null,
        precomputedMultiple,
```

**Change:** insert between the two lines:

```js
        macroState: scenario.macroState ?? null,
```

**Step 2 — Find:**

```text
    return {
        id: scenario.id || scenario.name || 'scenario',
        name: scenario.name || scenario.id || 'Scenario',
        prob: prob,
    };
```

**Change:** insert before the closing `};`:

```js
        macroState: scenario.macroState ?? null,
```

**Step 3 — Find:** the function starting at
`function aggregateScenarios(configs, horizon) {` and ending with the `}`
immediately before `function _initBaseConfigFields(raw, holdingDetails) {`.
**Change:** replace the whole function with:

```js
function aggregateScenarios(configs, horizon) {
    const weightedConfigs = configs.filter((cfg) => Number(cfg.weight ?? 0) > 0);
    const useMacroStates =
        weightedConfigs.length > 0 &&
        weightedConfigs.every((cfg) =>
            (cfg.metrics?.outcomes || []).every((outcome) => outcome.macroState)
        );

    const groupKey = (outcome) =>
        useMacroStates ? outcome.macroState : outcome.id || outcome.name || 'scenario';

    const allKeys = [];
    weightedConfigs.forEach((cfg) => {
        cfg.metrics.outcomes.forEach((outcome) => {
            const key = groupKey(outcome);
            if (!allKeys.includes(key)) {
                allKeys.push(key);
            }
        });
    });

    const scenarioMap = new Map();
    weightedConfigs.forEach((cfg) => {
        const holdingWeight = Number(cfg.weight ?? 0);
        const outcomes = cfg.metrics.outcomes;
        let probSum = 0;
        let meanMultiple = 0;
        outcomes.forEach((outcome) => {
            probSum += outcome.prob || 0;
            meanMultiple += (outcome.prob || 0) * outcome.multiple;
        });
        if (probSum > 0) {
            meanMultiple /= probSum;
        }
        const seenKeys = new Set();
        outcomes.forEach((outcome) => {
            const key = groupKey(outcome);
            seenKeys.add(key);
            const entry = scenarioMap.get(key) || {
                name: useMacroStates ? key : outcome.name || key,
                weightedMultiple: 0,
                weightedProb: 0,
                weightedEarningsCagr: 0,
                earningsWeight: 0,
            };
            entry.weightedMultiple += holdingWeight * outcome.multiple;
            entry.weightedProb += holdingWeight * outcome.prob;
            if (Number.isFinite(outcome.earningsCagr)) {
                entry.weightedEarningsCagr += holdingWeight * outcome.earningsCagr;
                entry.earningsWeight += holdingWeight;
            }
            scenarioMap.set(key, entry);
        });
        if (useMacroStates) {
            // Neutral carry: an asset without a view on a macro state
            // contributes its probability-weighted mean multiple to it.
            allKeys.forEach((key) => {
                if (!seenKeys.has(key)) {
                    const entry = scenarioMap.get(key);
                    if (entry) {
                        entry.weightedMultiple += holdingWeight * meanMultiple;
                    }
                }
            });
        }
    });

    return Array.from(scenarioMap.entries()).map(([id, entry]) => {
        const multiple = entry.weightedMultiple;
        const priceCagr = multiple > 0 && horizon > 0 ? multiple ** (1 / horizon) - 1 : 0;
        const normalizedProb = entry.weightedProb;
        const earningsCagr =
            entry.earningsWeight > 0 ? entry.weightedEarningsCagr / entry.earningsWeight : null;
        const displayName = id.charAt(0).toUpperCase() + id.slice(1);
        return {
            id,
            name: displayName,
            prob: normalizedProb,
            precomputedMultiple: multiple,
            precomputedCagr: priceCagr,
            precomputedEarningsCagr: earningsCagr,
            notes: `Weighted ${displayName} scenario`,
        };
    });
}
```

**Step 4 (tests) — File:** `/Users/lz/dev/fund/tests/js/pages/analysis/lab.test.js`
**Find:**

```text
    describe('fetchText', () => {
```

**Change:** insert immediately before:

```js
describe('macroState aggregation', () => {
    it('groups portfolio scenarios by macroState when all configs use it', async () => {
        const { aggregateScenarios } = (await import('@pages/analysis/lab.js'))
            .__analysisLabTesting;
        const configs = [
            {
                weight: 0.5,
                metrics: {
                    outcomes: [
                        { id: 'bull', prob: 0.5, multiple: 2, macroState: 'boom' },
                        { id: 'bear', prob: 0.5, multiple: 0.5, macroState: 'bust' },
                    ],
                },
            },
            {
                weight: 0.5,
                metrics: {
                    outcomes: [
                        { id: 'bull', prob: 0.6, multiple: 1.5, macroState: 'boom' },
                        { id: 'bear', prob: 0.4, multiple: 0.8, macroState: 'bust' },
                    ],
                },
            },
        ];
        const scenarios = aggregateScenarios(configs, 1);
        expect(scenarios.map((s) => s.id)).toEqual(['boom', 'bust']);
        const boom = scenarios.find((s) => s.id === 'boom');
        expect(boom.precomputedMultiple).toBeCloseTo(0.5 * 2 + 0.5 * 1.5, 6);
        expect(boom.prob).toBeCloseTo(0.5 * 0.5 + 0.5 * 0.6, 6);
    });

    it('applies neutral carry for assets missing a macro state', async () => {
        const { aggregateScenarios } = (await import('@pages/analysis/lab.js'))
            .__analysisLabTesting;
        const configs = [
            {
                weight: 0.5,
                metrics: {
                    outcomes: [
                        { id: 'bull', prob: 0.5, multiple: 2, macroState: 'boom' },
                        { id: 'bear', prob: 0.5, multiple: 0.5, macroState: 'bust' },
                    ],
                },
            },
            {
                weight: 0.5,
                metrics: {
                    outcomes: [{ id: 'bull', prob: 1, multiple: 1.5, macroState: 'boom' }],
                },
            },
        ];
        const scenarios = aggregateScenarios(configs, 1);
        const bust = scenarios.find((s) => s.id === 'bust');
        // 0.5×0.5 from config A + 0.5×1.5 (mean carry) from config B
        expect(bust.precomputedMultiple).toBeCloseTo(1.0, 6);
    });

    it('falls back to id grouping when any config lacks macroState', async () => {
        const { aggregateScenarios } = (await import('@pages/analysis/lab.js'))
            .__analysisLabTesting;
        const configs = [
            {
                weight: 0.5,
                metrics: {
                    outcomes: [{ id: 'bull', prob: 1, multiple: 2, macroState: 'boom' }],
                },
            },
            {
                weight: 0.5,
                metrics: {
                    outcomes: [{ id: 'bull', prob: 1, multiple: 1.5 }],
                },
            },
        ];
        const scenarios = aggregateScenarios(configs, 1);
        expect(scenarios.map((s) => s.id)).toEqual(['bull']);
        expect(scenarios[0].precomputedMultiple).toBeCloseTo(1.75, 6);
    });
});
```

**Verify:**
`npx jest tests/js/pages/analysis/lab.test.js && npx eslint js/pages/analysis/lab.js`

**Guardrail:** `useMacroStates` requires EVERY weighted config to tag EVERY
outcome — partial adoption must fall back to id grouping, not mix the two.

### WO-8 [low] — Constraint-capped recommendation badge (Design 3, constraints)

**File:** `/Users/lz/dev/fund/js/pages/analysis/lab.js`
**Find:**

```text
    targetEl.appendChild(createBadge('Scaled (½K)', formatPercent(scaledKelly), true));
```

**Change:** append immediately after:

```js
const maxWeight = Number(config.position?.constraints?.maxWeight);
if (Number.isFinite(maxWeight) && maxWeight > 0 && Number.isFinite(scaledKelly)) {
    const recommended = Math.min(scaledKelly, maxWeight);
    const capped = scaledKelly > maxWeight;
    targetEl.appendChild(
        createBadge('Recommended', `${formatPercent(recommended)}${capped ? ' (capped)' : ''}`)
    );
}
```

**Test — File:** `/Users/lz/dev/fund/tests/js/pages/analysis/lab_revival.test.js`
**Find:**

```text
        it('skips the zero-growth marker when growth never falls back to the risk-free rate', async () => {
```

**Change:** insert immediately before:

```js
it('caps the recommended position at constraints.maxWeight', async () => {
    const { renderKellyCurve } = (await setupLab()).__analysisLabTesting;
    const config = {
        symbol: 'ANET',
        weight: 0.05,
        position: { currentWeight: 0.05, constraints: { minWeight: 0, maxWeight: 0.3 } },
        metrics: {
            edge: 0.08,
            volatility: 0.4,
            fullKelly: 0.5,
            scaledKelly: 0.5,
            kellyScale: 1,
            benchmark: 0.065,
        },
    };

    renderKellyCurve(config);

    const kellyMetrics = document.getElementById('kellyMetrics');
    expect(kellyMetrics.textContent).toContain('Recommended');
    expect(kellyMetrics.textContent).toContain('(capped)');
});
```

**Verify:**
`npx jest tests/js/pages/analysis/lab_revival.test.js && npx eslint js/pages/analysis/lab.js`

**Guardrail:** do not touch `position.maxKellyWeight` — it is vestigial and
deliberately left alone (the design doc's open question #3); the cap source is
`position.constraints.maxWeight` only.

### WO-9 [low] — Conjugate parameter posteriors in bayes.js (Design 5)

**File:** `/Users/lz/dev/fund/js/pages/analysis/bayes.js`
**Find:**

```text
    return evidenceList.filter((item) => {
        if (!item || typeof item !== 'object') {
            return false;
        }
        const validTo = item.valid_to || item.validTo;
        if (validTo && validTo < today) {
            return false;
        }
        return true;
    });
}
```

**Change:** append after the closing `}`:

```js
/**
 * Apply conjugate normal-normal updates to scenario parameters from evidence
 * items carrying {metric: 'epsCagr'|'exitPe', observed, noise, appliesTo?}.
 * Returns new scenario objects; inputs are not mutated. Evidence items
 * without a metric field leave parameters untouched (backward compatible).
 *
 * @param {Array<Object>} scenarios - normalized scenario objects
 * @param {Array<Object>} evidenceList - parsed evidence.jsonl entries
 * @param {number} [fallbackSigma] - prior std when the scenario lacks one
 * @returns {Array<Object>}
 */
export function applyParameterPosteriors(scenarios, evidenceList, fallbackSigma = 0.15) {
    if (!Array.isArray(scenarios)) {
        return [];
    }
    const updates = (Array.isArray(evidenceList) ? evidenceList : []).filter(
        (item) =>
            item &&
            (item.metric === 'epsCagr' || item.metric === 'exitPe') &&
            Number.isFinite(Number(item.observed)) &&
            Number(item.noise) > 0
    );
    return scenarios.map((scenario) => {
        const next = {
            ...scenario,
            growth: { ...scenario.growth },
            valuation: { ...scenario.valuation },
        };
        for (const item of updates) {
            if (item.appliesTo && item.appliesTo !== next.id) {
                continue;
            }
            const block = item.metric === 'epsCagr' ? next.growth : next.valuation;
            const key = item.metric;
            const sigmaKey = item.metric === 'epsCagr' ? 'epsCagrSigma' : 'exitPeSigma';
            const priorMean = Number(block[key]);
            if (!Number.isFinite(priorMean)) {
                continue;
            }
            const sigmaRaw = Number(block[sigmaKey]);
            const priorSigma = sigmaRaw > 0 ? sigmaRaw : fallbackSigma;
            const priorVar = priorSigma ** 2;
            const noiseVar = Number(item.noise) ** 2;
            const postVar = 1 / (1 / priorVar + 1 / noiseVar);
            block[key] = postVar * (priorMean / priorVar + Number(item.observed) / noiseVar);
            block[sigmaKey] = Math.sqrt(postVar);
        }
        return next;
    });
}
```

**Test — File:** `/Users/lz/dev/fund/tests/js/pages/analysis/bayes.test.js`

**Step 1 — Find:**

```text
import { BayesianEngine, filterValidEvidence } from '../../../../js/pages/analysis/bayes.js';
```

**Change:** replace with:

```js
import {
    BayesianEngine,
    applyParameterPosteriors,
    filterValidEvidence,
} from '../../../../js/pages/analysis/bayes.js';
```

**Step 2 — Find:**

```text
        it('handles missing or non-array inputs gracefully', () => {
            expect(filterValidEvidence(null)).toEqual([]);
            expect(filterValidEvidence([])).toEqual([]);
        });
    });
});
```

**Change:** insert the new describe before the final `});`:

```js
        it('handles missing or non-array inputs gracefully', () => {
            expect(filterValidEvidence(null)).toEqual([]);
            expect(filterValidEvidence([])).toEqual([]);
        });
    });

    describe('applyParameterPosteriors', () => {
        it('applies a conjugate normal-normal update to epsCagr', () => {
            const scenarios = [
                { id: 'base', prob: 1, growth: { epsCagr: 0.15, epsCagrSigma: 0.05 } },
            ];
            const evidence = [{ metric: 'epsCagr', observed: 0.31, noise: 0.04 }];
            const result = applyParameterPosteriors(scenarios, evidence);
            // postVar = 1/(1/0.0025 + 1/0.0016) = 0.0009756
            expect(result[0].growth.epsCagr).toBeCloseTo(0.2476, 3);
            expect(result[0].growth.epsCagrSigma).toBeCloseTo(0.0312, 3);
            expect(scenarios[0].growth.epsCagr).toBe(0.15); // input not mutated
        });

        it('respects appliesTo and uses the fallback sigma when none is set', () => {
            const scenarios = [
                { id: 'base', prob: 0.5, growth: { epsCagr: 0.1 } },
                { id: 'bull', prob: 0.5, growth: { epsCagr: 0.25 } },
            ];
            const evidence = [{ metric: 'epsCagr', observed: 0.3, noise: 0.05, appliesTo: 'base' }];
            const result = applyParameterPosteriors(scenarios, evidence, 0.15);
            expect(result[1].growth.epsCagr).toBe(0.25); // untouched
            // postVar = 1/(1/0.0225 + 1/0.0025) = 0.00225
            expect(result[0].growth.epsCagr).toBeCloseTo(0.28, 3);
        });

        it('ignores evidence without metric fields', () => {
            const scenarios = [{ id: 'base', prob: 1, growth: { epsCagr: 0.1 } }];
            const evidence = [{ claim: 'vibes', direction: 'bullish', strength: 0.9 }];
            const result = applyParameterPosteriors(scenarios, evidence);
            expect(result[0].growth.epsCagr).toBe(0.1);
        });
    });
});
```

**Verify:**
`npx jest tests/js/pages/analysis/bayes.test.js && npx eslint js/pages/analysis/bayes.js`

### WO-10 [medium] — Wire posteriors into config loading (Design 5)

Depends on WO-9. The wiring point is `buildConfigs` (configs get
`computeMetrics` there exactly once), which avoids any render-cycle re-entry.

**File:** `/Users/lz/dev/fund/js/pages/analysis/lab.js`

**Step 1 — Find:**

```text
import { BayesianEngine } from './bayes.js';
```

**Change:** replace with:

```js
import { BayesianEngine, applyParameterPosteriors } from './bayes.js';
```

**Step 2 — Find:**

```text
                const [raw, thesisTitles] = await Promise.all([
                    fetchJson(entry.path),
                    fetchThesisScenarioTitles(entry.symbol),
                ]);
```

**Change:** replace with:

```js
const [raw, thesisTitles, evidenceText] = await Promise.all([
    fetchJson(entry.path),
    fetchThesisScenarioTitles(entry.symbol),
    fetchText(`../data/analysis/${entry.symbol}.evidence.jsonl`).catch(() => null),
]);
```

**Step 3 — Find:**

```text
                applyThesisScenarioTitles(config, thesisTitles);
                config.metrics = computeMetrics(config);
```

**Change:** replace with:

```js
applyThesisScenarioTitles(config, thesisTitles);
if (evidenceText) {
    const evidenceList = BayesianEngine.parseJsonl(evidenceText);
    state.evidenceCache.set(entry.symbol, evidenceList);
    config.scenarios = applyParameterPosteriors(
        config.scenarios,
        evidenceList,
        getEffectiveVolatility(config) * 0.5
    );
}
config.metrics = computeMetrics(config);
```

**Step 4 (integration test) — File:**
`/Users/lz/dev/fund/tests/js/pages/analysis/lab_dom_render.test.js`
**Find:**

```text
            if (u.includes('.md')) {
                return Promise.resolve({ ok: true, text: async () => '' });
            }
```

**Change:** insert immediately before:

```js
if (u.includes('AAPL.evidence.jsonl')) {
    return Promise.resolve({
        ok: true,
        text: async () =>
            '{"date": "2026-01-15", "claim": "FY print", "metric": "epsCagr", "observed": 0.2, "noise": 0.05}',
    });
}
```

**Find:**

```text
        lab.setActiveAnalysisSymbol('AAPL');
        summaryStats = document.getElementById('summaryStats');
        expect(summaryStats.textContent).toContain('Price');
        expect(summaryStats.textContent).toContain('Geo CAGR');
```

**Change:** append immediately after:

```js
// Evidence posterior applied at load: prior epsCagr 0 with fallback
// sigma 0.175 (default vol 0.35 x 0.5), observation 0.2 +/- 0.05.
// postVar = 1/(1/0.030625 + 1/0.0025) = 0.002311 -> mean 0.1849
const aaplConfig = lab.__analysisLabTesting.state.configs.find((cfg) => cfg.symbol === 'AAPL');
expect(aaplConfig.scenarios[0].growth.epsCagr).toBeCloseTo(0.1849, 3);
```

**Verify:** `npx jest tests/js/pages/analysis/`

**Guardrail:** the `.catch(() => null)` on the evidence fetch is load-bearing
— several test mocks return responses without a `.text()` method, and a
rejection must fail open (skip posteriors), never drop the config.

---

### Execution order

WO-1 → WO-2 → WO-3 → WO-4 → WO-5 → WO-6 → WO-7 → WO-8 → WO-9 → WO-10.
(WO-6 needs WO-1/WO-2/WO-5; WO-7 needs WO-4; WO-10 needs WO-9. The rest are
independent.)
