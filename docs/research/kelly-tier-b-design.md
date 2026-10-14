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
