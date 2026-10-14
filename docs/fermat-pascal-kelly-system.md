# Fermat–Pascal + Kelly Valuation & Positioning Engine

## System-Level Design (Draft)

---

## 0. Objectives & Scope

### 0.1 High-Level Objective

Build a reusable analysis engine that:

- Models a stock’s long-term return distribution through a finite scenario set (Fermat–Pascal style Bull / Base / Bear).
- Produces per-scenario terminal values, multiples, CAGRs, probability-weighted expected CAGR, and downside metrics (VaR / CVaR / other risk ratios).
- Converts the expected “edge” into Kelly-derived position sizing (full Kelly plus risk-scaled recommendation).
- Supports Bayesian probability updates, Monte Carlo enrichment, multi-period (dynamic) Kelly, multi-asset Kelly, and optional comparisons with option-implied distributions.
- Remains deterministic and side-effect free at the core, UI-friendly, and extensible as models evolve.

### 0.2 Usage Modes

- **Single asset:** analyze one stock from subjective inputs.
- **Portfolio:** evaluate a set of stocks, each with its own scenario universe.
- **Time evolution:** run dynamic simulations with repeated rebalancing and updated beliefs.

---

## 1. Conceptual Foundations

### 1.1 Fermat–Pascal Scenario Universe

- Use a discrete scenario set (typically Bull / Base / Bear; extensible to more states).
- Each scenario carries a probability, fundamental trajectory (e.g., EPS CAGR), and exit valuation (terminal PE).

### 1.2 Investment Horizon & Terminal Value

- Fix a horizon <em>T</em> (e.g., 5 years).
- Scenario terminal price = terminal EPS × exit PE.
- Scenario terminal multiple = terminal price ÷ current price.

### 1.3 Expected Return vs Benchmark

- Expected multiple = Σ(probability × scenario multiple).
- Expected CAGR (arithmetic) = expected multiple<sup>1/T</sup> - 1 — expected terminal wealth; overstates achievable growth under uncertainty (Jensen's inequality).
- Geometric expected CAGR = exp(Σ probability × ln scenario multiple)<sup>1/T</sup> - 1 — the long-run growth rate Kelly actually maximizes (~median outcome); reported alongside the arithmetic figure.
- Benchmark CAGR (e.g., 6.5%) defines a baseline; difference versus expected CAGR is the “edge”.

### 1.4 Kelly Criterion

- Exact discrete Kelly over the scenario set: f<sub>full</sub> maximizes G(f) = Σ p<sub>i</sub> ln(1 + r<sub>f</sub> + f·(r<sub>i</sub> − r<sub>f</sub>)), where r<sub>i</sub> is the scenario's annualized return and r<sub>f</sub> the risk-free rate. Solved by bisection on the first-order condition Σ p<sub>i</sub>(r<sub>i</sub> − r<sub>f</sub>) / (1 + r<sub>f</sub> + f·(r<sub>i</sub> − r<sub>f</sub>)) = 0, subject to the feasibility bound f < (1 + r<sub>f</sub>) / (r<sub>f</sub> − r<sub>i</sub>) for every losing scenario; capped (10×) when all scenarios beat r<sub>f</sub>. Long-only: assets with no excess return over r<sub>f</sub> get f = 0 rather than a short signal.
- The continuous approximation f ≈ excess return ÷ variance (Thorp 2006, §7) is retained only as a fallback when no scenario returns exist; its numerator is excess over the **risk-free rate**, not over a benchmark index.
- Apply a risk-scaling factor (e.g., 0.5) for a practical allocation.

---

## 2. Core Single-Asset Model

### 2.1 Inputs

#### Global Parameters

- Current price & PE (or EPS).
- Investment horizon <em>T</em>.
- Benchmark annual return.
- Risk-free rate (Kelly sizing numeraire; default 4%).
- Annual volatility estimate.
- Risk-scaling factor.

#### Scenario Parameters (Per State)

- Name (Bull / Base / Bear).
- Probability (must sum to 1).
- EPS CAGR.
- Exit PE at horizon.

### 2.2 Scenario Outputs

For each scenario compute:

1. **Terminal EPS:** initial EPS × (1 + CAGR)<sup>T</sup>.
2. **Terminal price:** terminal EPS × exit PE.
3. **Terminal multiple:** terminal price ÷ current price.
4. **Scenario CAGR:** multiple<sup>1/T</sup> - 1.

### 2.3 Expected Return & Edge

- Expected terminal multiple: Σ(probability × scenario multiple).
- Expected CAGR (arithmetic): expected multiple<sup>1/T</sup> - 1.
- Geometric expected CAGR: exp(Σ probability × ln multiple)<sup>1/T</sup> - 1.
- Edge: expected CAGR − benchmark CAGR (display only; Kelly sizing uses the risk-free rate, §2.4).

### 2.4 Kelly Position Sizing

- Full Kelly: exact discrete optimum over the scenario annualized returns versus the risk-free rate (see §1.4) — not edge ÷ variance, which is only the small-return approximation.
- Scenario-implied σ (dispersion of the annualized scenario returns) is computed and displayed next to the volatility input as a consistency check; sizing uses the scenario distribution directly.
- Adjusted Kelly = full Kelly × risk-scaling factor (practical position suggestion).
- Zero-growth fraction (where G(f) falls back to r<sub>f</sub>) is solved numerically and marked on the Kelly curve.

### 2.5 Target Entry Price for Desired CAGR

- Scenario terminal prices don’t depend on entry price.
- Expected terminal price = Σ(probability × scenario terminal price).
- Required expected multiple for a target CAGR = (1 + target)<sup>T</sup>.
- Implied entry price = expected terminal price ÷ required multiple.
- Use to mark “value bands” (e.g., price for 10% CAGR vs 12% CAGR).

---

## 3. Risk & Distribution Layer

### 3.1 Scenario-Based Risk Metrics

- Moments (mean / variance / skew) on terminal multiples or CAGRs.
- Probability of negative CAGR or underperforming benchmark.

### 3.2 VaR & CVaR

- Sort scenarios by total return.
- VaR<sub>20%</sub> = return threshold where 20% of mass lies below.
- CVaR<sub>20%</sub> = expected return conditioned on the worst 20%.

### 3.3 Downside Ratios

- **Sortino ratio:** (expected return − threshold) ÷ downside deviation.
- **Omega ratio:** P(return > threshold) / P(return &le; threshold).

---

## 4. Bayesian Updating Layer

### 4.1 Priors

- User supplies scenario probabilities and parameters (EPS CAGR, exit PE).

### 4.2 Observations

- Any data point (earnings release, guidance, macro signal, etc.) that differs across scenarios.

### 4.3 Likelihood Model

- Define P(observation | scenario).
- Simple implementations: Gaussian around scenario expectations, piecewise likelihoods, etc.

### 4.4 Posterior Update

- Posterior &propto; Likelihood × Prior.
- Normalize across scenarios; feed updated probabilities back into the core model.

---

## 5. Monte Carlo Simulation Layer

### 5.1 Motivation

- The discrete system is intuitive but coarse. Monte Carlo samples around each scenario to capture continuous uncertainty.

### 5.2 Simulation Steps

1. Draw a scenario according to its probability.
2. Perturb EPS CAGR and exit PE around scenario means.
3. Compute terminal outcomes for the path.

Repeat (e.g., 10k paths) to build an empirical distribution.

### 5.3 Outputs

- Smoothed estimates of expected CAGR, variance, skew.
- Refined VaR / CVaR / downside probabilities.

---

## 6. Dynamic / Multi-Period Kelly Layer

### 6.1 Time Grid

- Define horizon and rebalancing frequency (e.g., annual).
- At each date update beliefs and recompute Kelly metrics.

### 6.2 Strategy Rules

- Adjust toward the new Kelly fraction subject to bounds (max change per period, position limits).

### 6.3 Path Simulation

- Combine Monte Carlo with dynamic rebalancing to generate wealth / drawdown distributions and compare to static strategies.

---

## 7. Multi-Asset / Portfolio Layer

### 7.1 Per-Asset Inputs

- Each asset keeps its scenario set and Kelly metrics.

### 7.2 Correlation Structure

- Estimate inter-asset correlations (historical or scenario-based) to build a covariance matrix.

### 7.3 Portfolio Kelly

- Use expected excess returns and covariance matrix to solve for log-utility maximizing weights (full Kelly), then apply scaling.

---

## 8. Market-Implied Distribution Layer (Optional)

### 8.1 Extract Risk-Neutral Distribution

- Use option prices (e.g., Breeden–Litzenberger) to estimate risk-neutral terminal price distribution.

### 8.2 Convert to “Real-World”

- Adjust for risk premia using equity risk premium assumptions or heuristic tilts.

### 8.3 Compare vs Subjective Distribution

- Spot mismatches between user beliefs and market-implied tails; feed insights back into scenario settings.

---

## 9. System Architecture

### 9.1 Core Math Engine

- Pure functions for scenario outcomes, expected CAGR, Kelly sizing, target entry prices.

### 9.2 Risk & Monte Carlo Engine

- Generates enhanced distributions, VaR/CVaR, and downside ratios.

### 9.3 Bayesian Engine

- Handles prior/posterior updates given new observations.

### 9.4 Dynamic Strategy Engine

- Simulates multi-period rebalancing, wealth/drawdown paths.

### 9.5 Portfolio Engine

- Aggregates multi-asset inputs, builds covariance matrix, computes Kelly weights.

### 9.6 Market-Implied Engine (Optional)

- Pulls option data, estimates risk-neutral distributions, and performs comparisons.

---

## 10. User Interaction & UI Flow

### Single Asset

1. Input global and scenario parameters.
2. Run core calculations (scenario outcomes, expected CAGR, Kelly weights, target entry prices).
3. Review risk metrics (scenario-based and/or Monte Carlo).
4. Provide narrative interpretation (edge vs benchmark, recommended sizing, value bands).

### Portfolio / Dynamic

1. Define multiple assets with their scenario systems.
2. Use portfolio engine for Kelly-based weights.
3. Optionally simulate dynamic paths and visualize wealth outcomes.
